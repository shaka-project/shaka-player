/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an 'AS IS' BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


describe('Walker', () => {
  const AbortableOperation = shaka.util.AbortableOperation;

  // For our tests, we will not use the payload in our routing logic. To
  // avoid distracting the reader with payload details, hide them here.
  const payload = {
    factory: null,
    mediaElement: null,
    mimeType: null,
    startTime: null,
    startTimeOfLoad: null,
    uri: null,
  };

   // The graph topology that we will be using for our tests.
   //
   //  [ A ] ---> [ B ] ---> [ E ]
   //    ^          |
   //    |          v
   //  [ D ] <--- [ C ]
   //
  /** @type {shaka.routing.Node} */
  const nodeA = {name: 'a'};
  /** @type {shaka.routing.Node} */
  const nodeB = {name: 'b'};
  /** @type {shaka.routing.Node} */
  const nodeC = {name: 'c'};
  /** @type {shaka.routing.Node} */
  const nodeD = {name: 'd'};
  /** @type {shaka.routing.Node} */
  const nodeE = {name: 'e'};

  /**
   * @param {shaka.routing.Node} at
   * @param {shaka.routing.Node} goingTo
   * @return {shaka.routing.Node}
   */
  function getNext(at, goingTo) {
    // In this graph, where you start determines where you go. The one exception
    // is node B, which acts as a fork between nodes C and E. This fork is
    // important in testing interrupts.

    let goTo = null;

    if (at == nodeA) {
      goTo = nodeB;
    }

    if (at == nodeB) {
      goTo = goingTo == nodeE ? nodeE : nodeC;
    }

    if (at == nodeC) {
      goTo = nodeD;
    }

    if (at == nodeD) {
      goTo = nodeA;
    }

    goog.asserts.assert(goTo, 'We should have found a next step.');
    return goTo;
  }

  /** @type {!shaka.routing.Walker} */
  let walker;

  /** @type {!jasmine.Spy} */
  let enterNodeSpy;

  /** @type {!jasmine.Spy} */
  let handleErrorSpy;

  /** @type {!jasmine.Spy} */
  let idleSpy;

  beforeEach(() => {
    enterNodeSpy = jasmine.createSpy('enterNode');
    enterNodeSpy.and.returnValue(AbortableOperation.completed(undefined));

    handleErrorSpy = jasmine.createSpy('handleError');

    idleSpy = jasmine.createSpy('idle');

    const implementation = {
      getNext: (at, has, goingTo, wants) => getNext(at, goingTo),
      enterNode: shaka.test.Util.spyFunc(enterNodeSpy),
      handleError: shaka.test.Util.spyFunc(handleErrorSpy),
      onIdle: shaka.test.Util.spyFunc(idleSpy),
    };

    walker = new shaka.routing.Walker(nodeA, payload, implementation);
  });

  afterEach(async () => {
    await walker.destroy();
  });

  it('enters idle after initialization', async () => {
    await waitOnSpy(idleSpy);
  });

  it('enters idle after completing route', async () => {
    // Execute a route but then wait a couple interrupter cycles to allow the
    // walker time to idle.
    await completesRoute(startNewRoute(nodeD, /* interruptible= */ false));
    await waitOnSpy(idleSpy);
  });

  it('enters idle after error', async () => {
    // The specific error does not matter.
    const error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.BAD_ENCODING);

    enterNodeSpy.and.callFake((at) => {
      return at == nodeC ?
          shaka.util.AbortableOperation.failed(error) :
          shaka.util.AbortableOperation.completed(undefined);
    });

    handleErrorSpy.and.returnValue(nodeA);

    // Go to nodeD, passing through nodeC. This will fail, calling handleError,
    // and returning the walker to nodeA. Wait a couple interrupter cycles to
    // allow the walker time to idle. The route needs to be interruptible since
    // we are going to return an aborted operation.
    await failsRoute(startNewRoute(nodeD, /* interruptible= */ true));
    await waitOnSpy(idleSpy);
  });

  // The walker should move node-by-node, so starting in node A (see beforeEach)
  // and going to nodeD, we should see the walker enter nodeB, nodeC, and nodeD.
  // We won't see it enter nodeA because it starts there and therefore never
  // "enters" that node.
  it('moves node-by-node', async () => {
    // We don't expect any errors in this test.
    handleErrorSpy.and.callFake(fail);

    await completesRoute(startNewRoute(nodeD, /* interruptible= */ false));

    const steps = getStepsTaken();
    expect(steps).toEqual([nodeB, nodeC, nodeD]);
  });

  // We want to make sure that if a route is registered as interruptible, we
  // can interrupt the route and start a new route.
  //
  // For this we will have the walker start going to node E, but when it
  // enters node B (the fork) we will interrupt it and tell it to go to
  // node A.
  it('can interrupt interruptible routes', async () => {
    // We don't expect any errors in this test.
    handleErrorSpy.and.callFake(fail);

    /** @type {!shaka.util.PublicPromise} */
    const atA = new shaka.util.PublicPromise();
    const interrupt = () => {
      const goToA = startNewRoute(nodeA, /* interruptible= */ false);
      goToA.onEnd = () => atA.resolve();
    };

    const goingToE = startNewRoute(nodeE, /* interruptible= */ true);
    goingToE.onEnter = (node) => {
      if (node == nodeB) {
        interrupt();
      }
    };

    await atA;

    const steps = getStepsTaken();
    expect(steps).toEqual([nodeB, nodeC, nodeD, nodeA]);
  });

  // We want to make sure that a non-interruptible route cannot be interrupted
  // by starting a new route. To do this, we are going to start off by going to
  // node c. When we get to node b, we will try to start a new route to node e.
  //
  // If the route was interrupted, we would go to straight to node e (node b is
  // a fork in the graph). However, since we expect the first route to finish,
  // we expect to see the walker go to node c and then continue around to get to
  // node e.
  it('cannot interrupt non-interruptible routes', async () => {
    // We don't expect any errors in this test.
    handleErrorSpy.and.callFake(fail);

    /** @type {!shaka.util.PublicPromise} */
    const atE = new shaka.util.PublicPromise();

    const interrupt = () => {
      const goToE = startNewRoute(nodeE, /* interruptible= */ false);
      goToE.onEnd = () => atE.resolve();
    };

    // Create a "trap" so that once we enter node B (the fork) that we will
    // issue a new route - this will ensure that we are trying to interrupt a
    // route mid-execution.
    const goingToC = startNewRoute(nodeC, /* interruptible= */ false);
    goingToC.onEnter = (node) => {
      interrupt();
    };

    await atE;

    const steps = getStepsTaken();
    expect(steps).toEqual([
      // First route.
      nodeB, nodeC,
      // Second route.
      nodeD, nodeA, nodeB, nodeE,
    ]);
  });

  // We do not want to execute steps for a route that will be interrupted
  // right after it starts. For this example, we queue-up three routes:
  //   1. Non-interruptible
  //   2. Interruptible
  //   3. Interruptible
  //
  // What we expect to see is that Route 1 finishes, Route 2 starts but takes
  // no steps, and Route 3 finishes.
  it('does not take steps for route interrupted before starting', async () => {
    /**
     * When a route starts, it will assign this value to its id (1, 2, or 3)
     * so we always know who was the most recent route to start.
     *
     * @type {?number}
     */
    let currentRoute = null;

    /**
     * We use this set to know who took steps. When the walker takes a step
     * we will add |currentRoute| to this set. That way we will know what
     * route we took steps on.
     *
     * @type {!Array.<?number>}
     */
    const tookSteps = [];

    enterNodeSpy.and.callFake((node) => {
      tookSteps.push(currentRoute);
      return AbortableOperation.completed(undefined);
    });

    const route1 = startNewRoute(nodeD, /* interruptible= */ false);
    route1.onStart = () => { currentRoute = 1; };

    const route2 = startNewRoute(nodeC, /* interruptible= */ true);
    route2.onStart = () => { currentRoute = 2; };

    const route3 = startNewRoute(nodeE, /* interruptible= */ true);
    route3.onStart = () => { currentRoute = 3; };

    // Wait until we get to the end of route 3, that should be the end.
    await completesRoute(route3);

    // Make sure we had the correct routes when taking each step.
    expect(tookSteps).toEqual([
      1, // A to B
      1, // B to C
      1, // C to D
      3, // D to A
      3, // A to B
      3, // B to E
    ]);
  });

  // When we destroy the walker, it should cancel all routes - even the
  // non-interruptible routes.
  it('cancels all routes when destroyed', async () => {
    // Start-up a couple routes, and then destroy the walker. We expect to see
    // both routes have their |onCancel| callbacks called. We make the first
    // be non-interruptible and the second route interruptible so that we can
    // see both types be cancelled by |destroy|. The non-interruptible route
    // must before first or else it would interrupt the other route.
    const goToC = startNewRoute(nodeC, /* interruptible */ false);
    const goToB = startNewRoute(nodeB, /* interruptible */ true);

    /** @type {jasmine.Spy} */
    const canceledCSpy = jasmine.createSpy('cancel c');
    goToC.onCancel = shaka.test.Util.spyFunc(canceledCSpy);

    /** @type {jasmine.Spy} */
    const canceledBSpy = jasmine.createSpy('cancel b');
    goToB.onCancel = shaka.test.Util.spyFunc(canceledBSpy);

    await walker.destroy();

    expect(canceledCSpy).toHaveBeenCalled();
    expect(canceledBSpy).toHaveBeenCalled();
  });

  it('calls handleError when step fails', async () => {
    // The specific error does not matter.
    const error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.BAD_ENCODING);

    // Make the walker fail when it hits node C. This should allow us to
    // exercise the |handleError| path.
    enterNodeSpy.and.callFake((at) => {
      return at == nodeC ?
          shaka.util.AbortableOperation.failed(error) :
          shaka.util.AbortableOperation.completed(undefined);
    });

    // We want to handle the error and return to a safe state, so just put the
    // walker back at node A.
    handleErrorSpy.and.returnValue(nodeA);

    // Go to D (passing through C). This should throw an error, so wait for the
    // error to be seen. The route must be abortable because we are going to
    // throw an abortable error.
    await failsRoute(startNewRoute(nodeD, /* interruptible */ true));

    expect(handleErrorSpy).toHaveBeenCalled();
  });

  // When we interrupt a route that has a step that can be aborted, it should
  // abort the operation and enter the error recovery mode.
  //
  // To model this we will make a node be a never-resolving node. We will enter
  // the node and then get stuck. From there we will request a new route, the
  // blocked op will abort, and then we will go to our new destination.
  it('can abort current step', async () => {
    // Because we need a node to start at after resetting, we will just use A.
    // There is no special reason for node A.
    handleErrorSpy.and.returnValue(Promise.resolve(nodeA));

    // Block when we enter node C so that we can re-route to node E and finish a
    // path.
    blockWalkerAt(nodeC);

    // Wait for us to enter node d before continuing. We introduce a small delay
    // to ensure that we are "stuck" on the abortable operation.
    const goingToD = startNewRoute(nodeD, /* interruptible */ true);
    await waitUntilEntering(goingToD, nodeC);
    await shaka.test.Util.delay(0.1);

    await completesRoute(startNewRoute(nodeE, /* interruptible */ true));
    expect(handleErrorSpy).toHaveBeenCalled();
  });

  // If we are in the middle of a node and |destroy| is called, we want to
  // ensure that we exit as soon as possible. If the current step is abortable
  // then we want to abort.
  it('can abort current step with destroy', async () => {
    // Because we need a node to start at after resetting, we will just use A.
    // There is no special reason for node A.
    handleErrorSpy.and.returnValue(Promise.resolve(nodeA));

    // Block when we enter node C so that we can re-route to node E and finish a
    // path.
    blockWalkerAt(nodeC);

    // Wait for us to enter node d before continuing. We introduce a small delay
    // to ensure that we are "stuck" on the abortable operation.
    const goingToD = startNewRoute(nodeD, /* interruptible */ true);
    await waitUntilEntering(goingToD, nodeC);
    await shaka.test.Util.delay(0.1);

    // We are "stuck" in nodeC. We will now destroy the walker which should
    // abort the nodeC step, enter error recovery mode, and then shutdown.
    await walker.destroy();
    expect(handleErrorSpy).toHaveBeenCalled();
  });

  /**
   * Ask the walker to start a new route. Since the requests from our tests
   * are very basic, wrapping the call should not hide too much information.
   *
   * @param {shaka.routing.Node} goingTo
   * @param {boolean} interruptible
   *
   * @return {shaka.routing.Walker.Listeners}
   */
  function startNewRoute(goingTo, interruptible) {
    return walker.startNewRoute((currentPayload) => {
      return {
        node: goingTo,
        payload: payload,
        interruptible: interruptible,
      };
    });
  }

  /**
   * Get the series of nodes that the walker went through during its "journey".
   *
   * @return {!Array.<shaka.routing.Node>}
   */
  function getStepsTaken() {
    // Use |onNode| to get the steps that completed.
    return enterNodeSpy.calls.allArgs().map((args) => args[0]);
  }

  /**
   * Configure the |enterNodeSpy| so that we will block when we enter |node|. In
   * order to unblock, the route will need to be interrupted.
   *
   * @param {shaka.routing.Node} node
   */
  function blockWalkerAt(node) {
    /** @type {!shaka.util.AbortableOperation} */
    const completedOp = AbortableOperation.completed(undefined);

    /** @type {!shaka.util.PublicPromise} */
    const waitForever = new shaka.util.PublicPromise();

    /** @type {!shaka.util.AbortableOperation} */
    const blockingOp = new AbortableOperation(
        waitForever,
        () => {
          waitForever.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.PLAYER,
              shaka.util.Error.Code.OPERATION_ABORTED));

          return waitForever;
        });

    enterNodeSpy.and.callFake((at) => {
      return at == node ? blockingOp : completedOp;
    });
  }

  /**
   * Create a promise that will resolve when we enter |node| while on the route
   * that produced |events|.
   *
   * @param {shaka.routing.Walker.Listeners} events
   * @param {shaka.routing.Node} node
   * @return {!Promise}
   */
  function waitUntilEntering(events, node) {
    return new Promise((resolve) => {
      events.onEnter = (node) => {
        if (node == nodeC) {
          resolve();
        }
      };
    });
  }

  /**
   * Create a promise from a walker's route's listeners. This assumes that the
   * route should finish. The promise will resolve if the route completes and
   * will reject if the route fails to complete for any reason.
   *
   * @param {shaka.routing.Walker.Listeners} events
   * @return {!Promise}
   */
  function completesRoute(events) {
    return new Promise((resolve, reject) => {
      events.onEnd = resolve;
      events.onCancel = reject;
      events.onError = reject;
    });
  }

  /**
   * Create a promise from a walker's route's listeners. This assumes that the
   * route should not finish. The promise will resolve if the route fails and
   * will reject if the route completes.
   *
   * @param {shaka.routing.Walker.Listeners} events
   * @return {!Promise}
   */
  function failsRoute(events) {
    return new Promise((resolve, reject) => {
      events.onEnd = reject;
      events.onCancel = resolve;
      events.onError = resolve;
    });
  }

  /**
   * Wrap a spy in a promise so that the promise will resolve once the spy is
   * called.
   *
   * @param {!jasmine.Spy} spy
   * @return {!Promise}
   */
  function waitOnSpy(spy) {
    return new Promise((resolve) => {
      spy.and.callFake(resolve);
    });
  }
});
