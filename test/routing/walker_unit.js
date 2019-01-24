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
  // For our tests, we will not use the payload in our routing logic. To
  // avoid distracting the reader with payload details, hide them here.
  const payload = {
    factory: null,
    mediaElement: null,
    mimeType: null,
    startTime: null,
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

  beforeEach(() => {
    enterNodeSpy = jasmine.createSpy('enterNode');
    handleErrorSpy = jasmine.createSpy('handleError');

    const implementation = {
      getNext: (at, has, goingTo, wants) => getNext(at, goingTo),
      enterNode: shaka.test.Util.spyFunc(enterNodeSpy),
      handleError: shaka.test.Util.spyFunc(handleErrorSpy),
    };

    walker = new shaka.routing.Walker(nodeA, payload, implementation);
  });

  afterEach(async () => {
    await walker.destroy();
  });

  // The walker should move node-by-node, so starting in node A (see beforeEach)
  // and going to nodeD, we should see the walker enter nodeB, nodeC, and nodeD.
  // We won't see it enter nodeA because it starts there and therefore never
  // "enters" that node.
  it('moves node-by-node', async () => {
    // We don't expect any errors in this test.
    handleErrorSpy.and.callFake(fail);

    const events = startNewRoute(nodeD, /* interruptible= */ false);

    await new Promise((resolve, reject) => {
      events.onEnd = resolve;
      events.onCancel = reject;
      events.onError = reject;
    });

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
    let interrupt = () => {
      const goToA = startNewRoute(nodeA, /* interruptible= */ false);
      goToA.onEnd = () => atA.resolve();
    };

    // Create a "trap" so that once we enter node B (the fork) that we will
    // issue a new route - this will ensure that we are interrupting a route
    // mid-execution.
    enterNodeSpy.and.callFake((node) => {
      // Make sure we only interrupt once.
      if (node == nodeB && interrupt) {
        interrupt();
        interrupt = null;
      }
    });

    startNewRoute(nodeE, /* interruptible= */ true);

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

    let interrupt = () => {
      const goToE = startNewRoute(nodeE, /* interruptible= */ false);
      goToE.onEnd = () => atE.resolve();
    };

    // Create a "trap" so that once we enter node B (the fork) that we will
    // issue a new route - this will ensure that we are trying to interrupt a
    // route mid-execution.
    enterNodeSpy.and.callFake((node) => {
      // Make sure we only interrupt once.
      if (node == nodeB && interrupt) {
        interrupt();
        interrupt = null;
      }
    });

    startNewRoute(nodeC, /* interruptible= */ false);
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
    });

    const route1 = startNewRoute(nodeD, /* interruptible= */ false);
    route1.onStart = () => { currentRoute = 1; };

    const route2 = startNewRoute(nodeC, /* interruptible= */ true);
    route2.onStart = () => { currentRoute = 2; };

    const route3 = startNewRoute(nodeE, /* interruptible= */ true);
    route3.onStart = () => { currentRoute = 3; };

    // Wait until we get to the end of route 3, that should be the end.
    await new Promise((resolve) => { route3.onEnd = resolve; });

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
});
