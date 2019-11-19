/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.FakeEvent');


/**
 * @summary Create an Event work-alike object based on the provided dictionary.
 * The event should contain all of the same properties from the dict.
 *
 * @extends {Event}
 */
shaka.util.FakeEvent = class {
  /**
   * @param {string} type
   * @param {Object=} dict
   */
  constructor(type, dict = {}) {
    // Take properties from dict if present.
    for (const key in dict) {
      Object.defineProperty(this, key, {
        value: dict[key],
        writable: true,
        enumerable: true,
      });
    }

    // The properties below cannot be set by the dict.  They are all provided
    // for compatibility with native events.

    /** @const {boolean} */
    this.bubbles = false;

    /** @type {boolean} */
    this.cancelable = false;

    /** @type {boolean} */
    this.defaultPrevented = false;

    /**
     * According to MDN, Chrome uses high-res timers instead of epoch time.
     * Follow suit so that timeStamps on FakeEvents use the same base as
     * on native Events.
     * @const {number}
     * @see https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
     */
    this.timeStamp = window.performance && window.performance.now ?
        window.performance.now() : Date.now();

    /** @const {string} */
    this.type = type;

    /** @const {boolean} */
    this.isTrusted = false;

    /** @type {EventTarget} */
    this.currentTarget = null;

    /** @type {EventTarget} */
    this.target = null;

    /**
     * Non-standard property read by FakeEventTarget to stop processing
     * listeners.
     * @type {boolean}
     */
    this.stopped = false;
  }

  /**
   * Prevents the default action of the event.  Has no effect if the event isn't
   * cancellable.
   * @override
   */
  preventDefault() {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }

  /**
   * Stops processing event listeners for this event.  Provided for
   * compatibility with native Events.
   * @override
   */
  stopImmediatePropagation() {
    this.stopped = true;
  }

  /**
   * Does nothing, since FakeEvents do not bubble.  Provided for compatibility
   * with native Events.
   * @override
   */
  stopPropagation() {}
};
