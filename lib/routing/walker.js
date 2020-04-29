/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

goog.provide('shaka.routing.Walker');
goog.provide('shaka.routing.Walker.Implementation');

goog.require('goog.asserts');
goog.require('shaka.routing.Node');
goog.require('shaka.routing.Payload');
goog.require('shaka.util.IDestroyable');


/**
 * The walker moves through a graph node-by-node executing asynchronous work
 * as it enters each node.
 *
 * The walker accepts requests for where it should go next. Requests are queued
 * and executed in FIFO order. If the current request can be interrupted, it
 * will be cancelled and the next request started.
 *
 * A request says "I want to change where we are going". When the walker is
 * ready to change destinations, it will resolve the request, allowing the
 * destination to differ based on the current state and not the state when
 * the request was appended.
 *
 * Example (from shaka.Player):
 *  When we unload, we need to either go to the attached or detached state based
 *  on whether or not we have a video element.
 *
 *  When we are asked to unload, we don't know what other pending requests may
 *  be ahead of us (there could be attach requests or detach requests). We need
 *  to wait until its our turn to know if:
 *    - we should go to the attach state because we have a media element
 *    - we should go to the detach state because we don't have a media element
 *
 * The walker allows the caller to specify if a route can or cannot be
 * interrupted. This is to allow potentially dependent routes to wait until
 * other routes have finished.
 *
 * Example (from shaka.Player):
 *  A request to load content depends on an attach request finishing. We don't
 *  want load request to interrupt an attach request. By marking the attach
 *  request as non-interruptible we ensure that calling load before attach
 *  finishes will work.
 *
 * @implements {shaka.util.IDestroyable}
 * @final
 */
shaka.routing.Walker = class {
  /**
   * Create a new walker that starts at |startingAt| and with |startingWith|.
   * The instance of |startingWith| will be the one that the walker holds and
   * uses for its life. No one else should reference it.
   *
   * The per-instance behaviour for the walker is provided via |implementation|
   * which is used to connect this walker with the "outside world".
   *
   * @param {shaka.routing.Node} startingAt
   * @param {shaka.routing.Payload} startingWith
   * @param {shaka.routing.Walker.Implementation} implementation
   */
  constructor(startingAt, startingWith, implementation) {
    /** @private {?shaka.routing.Walker.Implementation} */
    this.implementation_ = implementation;

    /** @private {shaka.routing.Node} */
    this.currentlyAt_ = startingAt;

    /** @private {shaka.routing.Payload} */
    this.currentlyWith_ = startingWith;

    /**
     * When we run out of work to do, we will set this promise so that when
     * new work is added (and this is not null) it can be resolved. The only
     * time when this should be non-null is when we are waiting for more work.
     *
     * @private {shaka.util.PublicPromise}
     */
    this.waitForWork_ = null;

    /** @private {!Array.<shaka.routing.Walker.Request_>} */
    this.requests_ = [];

    /** @private {?shaka.routing.Walker.ActiveRoute_} */
    this.currentRoute_ = null;

    /** @private {shaka.util.AbortableOperation} */
    this.currentStep_ = null;

    /**
     * This flag is used by the main loop to know if it should keep doing work.
     * It will be true from now until |destroy| is called.
     *
     * @private {boolean}
     */
    this.isAlive_ = true;

    /**
     * Hold a reference to the main loop's promise so that we know when it has
     * exited. This will determine when |destroy| can resolve. Purposely make
     * the main loop start next interpreter cycle so that the constructor will
     * finish before it starts.
     *
     * @private {!Promise}
     */
    this.mainLoopPromise_ = Promise.resolve().then(() => this.mainLoop_());
  }

  /**
   * Get the current routing payload.
   *
   * @return {shaka.routing.Payload}
   */
  getCurrentPayload() {
    return this.currentlyWith_;
  }

  /** @override */
  async destroy() {
    // By setting |isAlive_| to |false|, we are telling the main loop to exit.
    // If the main loop is blocked waiting for new work, unblock it by
    // notifying.
    this.isAlive_ = false;

    // If we are executing a current step, we want to interrupt it so that we
    // can force the main loop to terminate.
    if (this.currentStep_) {
      this.currentStep_.abort();
    }

    // If we are waiting for more work, we want to wake-up the main loop so that
    // it can exit on its own.
    this.unblockMainLoop_();

    // Wait for the main loop to terminate so that an async operation won't
    // try and use state that we released.
    await this.mainLoopPromise_;

    // Any routes that we are not going to finish, we need to cancel. If we
    // don't do this, those listening will be left hanging.
    if (this.currentRoute_) {
      this.currentRoute_.listeners.onCancel();
    }
    for (const request of this.requests_) {
      request.listeners.onCancel();
    }

    // Release anything that could hold references to anything outside of this
    // class.
    this.currentRoute_ = null;
    this.requests_ = [];
    this.implementation_ = null;
  }

  /**
   * Ask the walker to start a new route. When the walker is ready to start a
   * new route, it will call |create| and |create| will provide the walker with
   * a new route to execute.
   *
   * If any previous calls to |startNewRoute| created non-interruptible routes,
   * |create| won't be called until all previous non-interruptible routes have
   * finished.
   *
   * This method will return a collection of listeners that the caller can hook
   * into. Any listener that the caller is interested should be assigned
   * immediately after calling |startNewRoute| or else they could miss the event
   * they want to listen for.
   *
   * @param {function(shaka.routing.Payload):?shaka.routing.Walker.Route} create
   * @return {shaka.routing.Walker.Listeners}
   */
  startNewRoute(create) {
    const listeners = {
      onStart: () => {},
      onEnd: () => {},
      onCancel: () => {},
      onError: (error) => {},
      onSkip: () => {},
      onEnter: () => {},
    };

    this.requests_.push({
      create: create,
      listeners: listeners,
    });

    // If we are in the middle of a step, try to abort it. If this is successful
    // the main loop will error and the walker will enter recovery mode.
    if (this.currentStep_) {
      this.currentStep_.abort();
    }

    // Tell the main loop that new work is available. If the main loop was not
    // blocked, this will be a no-op.
    this.unblockMainLoop_();

    return listeners;
  }

  /**
   * @return {!Promise}
   * @private
   */
  async mainLoop_() {
    while (this.isAlive_) {
      // eslint-disable-next-line no-await-in-loop
      await this.doOneThing_();
    }
  }

  /**
   * Do one thing to move the walker closer to its destination. This can be:
   *   1. Starting a new route.
   *   2. Taking one more step/finishing a route.
   *   3. Wait for a new route.
   *
   * @return {!Promise}
   * @private
   */
  doOneThing_() {
    if (this.tryNewRoute_()) {
      return Promise.resolve();
    }

    if (this.currentRoute_) {
      return this.takeNextStep_();
    }

    goog.asserts.assert(this.waitForWork_ == null,
                        'We should not have a promise yet.');

    // We have no more work to do. We will wait until new work has been provided
    // via request route or until we are destroyed.

    this.implementation_.onIdle(this.currentlyAt_);

    // Wait on a new promise so that we can be resolved by |waitForWork|. This
    // avoids us acting like a busy-wait.
    this.waitForWork_ = new shaka.util.PublicPromise();
    return this.waitForWork_;
  }

  /**
   * Check if the walker can start a new route. There are a couple ways this can
   * happen:
   *  1. We have a new request but no current route
   *  2. We have a new request and our current route can be interrupted
   *
   * @return {boolean}
   *    |true| when a new route was started (regardless of reason) and |false|
   *    when no new route was started.
   *
   * @private
   */
  tryNewRoute_() {
    goog.asserts.assert(
        this.currentStep_ == null,
        'We should never have a current step between taking steps.');

    if (this.requests_.length == 0) {
      return false;
    }

    // If the current route cannot be interrupted, we can't start a new route.
    if (this.currentRoute_ && !this.currentRoute_.interruptible) {
      return false;
    }

    // Stop any previously active routes. Even if we don't pick-up a new route,
    // this route should stop.
    if (this.currentRoute_) {
      this.currentRoute_.listeners.onCancel();
      this.currentRoute_ = null;
    }

    // Create and start the next route. We may not take any steps because it may
    // be interrupted by the next request.
    const request = this.requests_.shift();
    const newRoute = request.create(this.currentlyWith_);

    // Based on the current state of |payload|, a new route may not be
    // possible. In these cases |create| will return |null| to signal that
    // we should just stop the current route and move onto the next request
    // (in the next main loop iteration).
    if (newRoute) {
      request.listeners.onStart();

      // Convert the route created from the request's create method to an
      // active route.
      this.currentRoute_ = {
        node: newRoute.node,
        payload: newRoute.payload,
        interruptible: newRoute.interruptible,
        listeners: request.listeners,
      };
    } else {
      request.listeners.onSkip();
    }

    return true;
  }


  /**
   * Move forward one step on our current route. This assumes that we have a
   * current route. A couple things can happen when moving forward:
   *  1. An error - if an error occurs, it will signal an error occurred,
   *     attempt to recover, and drop the route.
   *  2. Move - if no error occurs, we will move forward. When we arrive at
   *     our destination, it will signal the end and drop the route.
   *
   * In the event of an error or arriving at the destination, we drop the
   * current route. This allows us to pick-up a new route next time the main
   * loop iterates.
   *
   * @return {!Promise}
   * @private
   */
  async takeNextStep_() {
    goog.asserts.assert(
        this.currentRoute_,
        'We need a current route to take the next step.');

    // Figure out where we are supposed to go next.
    this.currentlyAt_ = this.implementation_.getNext(
        this.currentlyAt_,
        this.currentlyWith_,
        this.currentRoute_.node,
        this.currentRoute_.payload);

    this.currentRoute_.listeners.onEnter(this.currentlyAt_);

    // Enter the new node, this is where things can go wrong since it is
    // possible for "supported errors" to occur - errors that the code using
    // the walker can't predict but can recover from.
    try {
      this.currentStep_ = this.implementation_.enterNode(
          /* node= */ this.currentlyAt_,
          /* has= */ this.currentlyWith_,
          /* wants= */ this.currentRoute_.payload);

      await this.currentStep_.promise;
      this.currentStep_ = null;

      // If we are at the end of the route, we need to signal it and clear the
      // route so that we will pick-up a new route next iteration.
      if (this.currentlyAt_ == this.currentRoute_.node) {
        this.currentRoute_.listeners.onEnd();
        this.currentRoute_ = null;
      }
    } catch (error) {
      if (error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
        goog.asserts.assert(
            this.currentRoute_.interruptible,
            'Do not put abortable steps in non-interruptible routes!');
        this.currentRoute_.listeners.onCancel();
      } else {
        // There was an error with this route, so we going to abandon it and
        // resolve the error. We don't reset the payload because the payload may
        // still contain useful information.
        this.currentRoute_.listeners.onError(error);
      }

      // The route and step are done. Clear them before we handle the error or
      // else we may attempt to abort |currrentStep_| when handling the error.
      this.currentRoute_ = null;
      this.currentStep_ = null;

      // Still need to handle error because aborting an operation could leave us
      // in an unexpected state.
      this.currentlyAt_ = await this.implementation_.handleError(
          this.currentlyWith_,
          error);
    }
  }

  /**
   * If the main loop is blocked waiting for new work, then resolve the promise
   * so that the next iteration of the main loop can execute.
   *
   * @private
   */
  unblockMainLoop_() {
    if (this.waitForWork_) {
      this.waitForWork_.resolve();
      this.waitForWork_ = null;
    }
  }
};

/**
 * @typedef {{
 *   getNext: function(
 *       shaka.routing.Node,
 *       shaka.routing.Payload,
 *       shaka.routing.Node,
 *       shaka.routing.Payload):shaka.routing.Node,
 *   enterNode: function(
 *       shaka.routing.Node,
 *       shaka.routing.Payload,
 *       shaka.routing.Payload):!shaka.util.AbortableOperation,
 *   handleError: function(
 *       shaka.routing.Payload,
 *       !Error):!Promise.<shaka.routing.Node>,
 *   onIdle: function(shaka.routing.Node)
 * }}
 *
 * @description
 *   There are some parts of the walker that will be per-instance. This type
 *   provides those per-instance parts.
 *
 * @property {function(
 *     shaka.routing.Node,
 *     shaka.routing.Payload,
 *     shaka.routing.Node,
 *     shaka.routing.Payload):shaka.routing.Node getNext
 *   Get the next node that the walker should move to. This method will be
 *   passed (in this order) the current node, current payload, destination
 *   node, and destination payload.
 *
 * @property {function(
 *     shaka.routing.Node,
 *     shaka.routing.Payload,
 *     shaka.routing.Payload):!Promise} enterNode
 *   When the walker moves into a node, it will call |enterNode| and allow the
 *   implementation to change the current payload. This method will be passed
 *   (in this order) the node the walker is entering, the current payload, and
 *   the destination payload. This method should NOT modify the destination
 *   payload.
 *
 * @property {function(
 *     shaka.routing.Payload,
 *     !Error):!Promise.<shaka.routing.Node> handleError
 *   This is the callback for when |enterNode| fails. It is passed the current
 *   payload and the error. If a step is aborted, the error will be
 *   OPERATION_ABORTED. It should reset all external dependences, modify the
 *   payload, and return the new current node. Calls to |handleError| should
 *   always resolve and the walker should always be able to continue operating.
 *
 * @property {function(shaka.routing.Node)} onIdle
 *   This is the callback for when the walker has finished processing all route
 *   requests and needs to wait for more work. |onIdle| will be passed the
 *   current node.  After |onIdle| has been called, the walker will block until
 *   a new request is made, or the walker is destroyed.
 */
shaka.routing.Walker.Implementation;

/**
 * @typedef {{
 *   onStart: function(),
 *   onEnd: function(),
 *   onCancel: function(),
 *   onError: function(!Error),
 *   onSkip: function(),
 *   onEnter: function(shaka.routing.Node)
 * }}
 *
 * @description
 *   The collection of callbacks that the walker will call while executing a
 *   route. By setting these immediately after calling |startNewRoute|
 *   the user can react to route-specific events.
 *
 * @property {function()} onStart
 *   The callback for when the walker has accepted the route and will soon take
 *   the first step unless interrupted. Either |onStart| or |onSkip| will be
 *   called.
 *
 * @property {function()} onEnd
 *   The callback for when the walker has reached the end of the route. For
 *   every route that had |onStart| called, either |onEnd|, |onCancel|, or
 *   |onError| will be called.
 *
 * @property {function()} onCancel
 *   The callback for when the walker is stopping a route before getting to the
 *   end. This will be called either when a new route is interrupting the route,
 *   or the walker is being destroyed mid-route. |onCancel| will only be called
 *   when a route has been interrupted by another route or the walker is being
 *   destroyed.
 *
 * @property {function()} onError
 *   The callback for when the walker failed to execute the route because an
 *   unexpected error occurred. The walker will enter a recovery mode and the
 *   route will be abandoned.
 *
 * @property {function()} onSkip
 *   The callback for when the walker was ready to start the route, but the
 *   create-method returned |null|.
 *
 * @property {function()} onEnter
 *   The callback for when the walker enters a node. This will allow us to
 *   track the progress of the walker within a per-route scope.
 */
shaka.routing.Walker.Listeners;

/**
 * @typedef {{
 *   node: shaka.routing.Node,
 *   payload: shaka.routing.Payload,
 *   interruptible: boolean
 * }}
 *
 * @description
 *   The public description of where the walker should go. This is created
 *   when the callback given to |startNewRoute| is called by the walker.
 *
 * @property {shaka.routing.Node} node
 *   The node that the walker should move towards. This will be passed to
 *   |shaka.routing.Walker.Implementation.getNext| to help determine where to
 *   go next.
 *
 * @property {shaka.routing.Payload| payload
 *   The payload that the walker should have once it arrives at |node|. This
 *   will be passed to the |shaka.routing.Walker.Implementation.getNext| to
 *   help determine where to go next.
 *
 * @property {boolean} interruptible
 *   Whether or not this route can be interrupted by another request. When
 *   |true| this route will be interrupted so that a pending request can be
 *   resolved. When |false|, the route will be allowed to finished before
 *   resolving the next request.
 */
shaka.routing.Walker.Route;

/**
 * @typedef {{
 *   node: shaka.routing.Node,
 *   payload: shaka.routing.Payload,
 *   interruptible: boolean,
 *   listeners: shaka.routing.Walker.Listeners
 * }}
 *
 * @description
 *   The active route is the walker's internal representation of a route. It
 *   is the union of |shaka.routing.Walker.Request_| and the
 *   |shaka.routing.Walker.Route| created by |shaka.routing.Walker.Request_|.
 *
 * @property {shaka.routing.Node} node
 *   The node that the walker should move towards. This will be passed to
 *   |shaka.routing.Walker.Implementation.getNext| to help determine where to
 *   go next.
 *
 * @property {shaka.routing.Payload| payload
 *   The payload that the walker should have once it arrives at |node|. This
 *   will be passed to the |shaka.routing.Walker.Implementation.getNext| to
 *   help determine where to go next.
 *
 * @property {boolean} interruptible
 *   Whether or not this route can be interrupted by another request. When
 *   |true| this route will be interrupted so that a pending request can be
 *   resolved. When |false|, the route will be allowed to finished before
 *   resolving the next request.
 *
 * @property {shaka.routing.Walker.Listeners} listeners
 *   The listeners that the walker can used to communicate with whoever
 *   requested the route.
 *
 * @private
 */
shaka.routing.Walker.ActiveRoute_;

/**
 * @typedef {{
 *   create: function(shaka.routing.Payload):?shaka.routing.Walker.Route,
 *   listeners: shaka.routing.Walker.Listeners
 * }}
 *
 * @description
 *   The request is how users can talk to the walker. They can give the walker
 *   a request and when the walker is ready, it will resolve the request by
 *   calling |create|.
 *
 * @property {
 *     function(shaka.routing.Payload):?shaka.routing.Walker.Route} create
 *   The function called when the walker is ready to start a new route. This can
 *   return |null| to say that the request was not possible and should be
 *   skipped.
 *
 * @property {shaka.routing.Walker.Listeners} listeners
 *   The collection of callbacks that the walker will use to talk to whoever
 *   provided the request.
 *
 * @private
 */
shaka.routing.Walker.Request_;
