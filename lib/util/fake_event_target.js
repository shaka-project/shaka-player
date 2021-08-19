/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.FakeEventTarget');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.MultiMap');


/**
 * @summary A work-alike for EventTarget.  Only DOM elements may be true
 * EventTargets, but this can be used as a base class to provide event dispatch
 * to non-DOM classes.  Only FakeEvents should be dispatched.
 *
 * @implements {EventTarget}
 * @exportInterface
 */
shaka.util.FakeEventTarget = class {
  /** */
  constructor() {
    /**
     * @private {!shaka.util.MultiMap.<shaka.util.FakeEventTarget.ListenerType>}
     */
    this.listeners_ = new shaka.util.MultiMap();

    /**
     * The target of all dispatched events.  Defaults to |this|.
     * @type {EventTarget}
     */
    this.dispatchTarget = this;
  }

  /**
   * Add an event listener to this object.
   *
   * @param {string} type The event type to listen for.
   * @param {shaka.util.FakeEventTarget.ListenerType} listener The callback or
   *   listener object to invoke.
   * @param {(!AddEventListenerOptions|boolean)=} options Ignored.
   * @override
   * @exportInterface
   */
  addEventListener(type, listener, options) {
    this.listeners_.push(type, listener);
  }

  /**
   * Add an event listener to this object that is invoked for all events types
   * the object fires.
   *
   * @param {shaka.util.FakeEventTarget.ListenerType} listener The callback or
   *   listener object to invoke.
   * @exportInterface
   */
  listenToAllEvents(listener) {
    this.addEventListener(shaka.util.FakeEventTarget.ALL_EVENTS_, listener);
  }

  /**
   * Remove an event listener from this object.
   *
   * @param {string} type The event type for which you wish to remove a
   *   listener.
   * @param {shaka.util.FakeEventTarget.ListenerType} listener The callback or
   *   listener object to remove.
   * @param {(EventListenerOptions|boolean)=} options Ignored.
   * @override
   * @exportInterface
   */
  removeEventListener(type, listener, options) {
    this.listeners_.remove(type, listener);
  }

  /**
   * Dispatch an event from this object.
   *
   * @param {!Event} event The event to be dispatched from this object.
   * @return {boolean} True if the default action was prevented.
   * @override
   * @exportInterface
   */
  dispatchEvent(event) {
    // In many browsers, it is complex to overwrite properties of actual Events.
    // Here we expect only to dispatch FakeEvents, which are simpler.
    goog.asserts.assert(event instanceof shaka.util.FakeEvent,
        'FakeEventTarget can only dispatch FakeEvents!');

    let listeners = this.listeners_.get(event.type) || [];
    const universalListeners =
      this.listeners_.get(shaka.util.FakeEventTarget.ALL_EVENTS_);
    if (universalListeners) {
      listeners = listeners.concat(universalListeners);
    }

    // Execute this event on listeners until the event has been stopped or we
    // run out of listeners.
    for (const listener of listeners) {
      // Do this every time, since events can be re-dispatched from handlers.
      event.target = this.dispatchTarget;
      event.currentTarget = this.dispatchTarget;

      try {
        // Check for the |handleEvent| member to test if this is a
        // |EventListener| instance or a basic function.
        if (listener.handleEvent) {
          listener.handleEvent(event);
        } else {
          // eslint-disable-next-line no-restricted-syntax
          listener.call(this, event);
        }
      } catch (exception) {
        // Exceptions during event handlers should not affect the caller,
        // but should appear on the console as uncaught, according to MDN:
        // https://mzl.la/2JXgwRo
        shaka.log.error('Uncaught exception in event handler', exception,
            exception ? exception.message : null,
            exception ? exception.stack : null);
      }

      if (event.stopped) {
        break;
      }
    }

    return event.defaultPrevented;
  }
};

/**
 * These are the listener types defined in the closure extern for EventTarget.
 * @typedef {EventListener|function(!Event):*}
 * @exportInterface
 */
shaka.util.FakeEventTarget.ListenerType;


/**
 * @const {string}
 * @private
 */
shaka.util.FakeEventTarget.ALL_EVENTS_ = 'All';
