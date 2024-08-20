/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.AbortController');

goog.require('shaka.polyfill');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');

/**
 * @summary A polyfill for systems that do not implement AbortController.
 * This is used both with the fetch API for HTTP requests and inside the HLS
 * parser.
 * @export
 * @extends AbortController
 */
shaka.polyfill.AbortController = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    if (window.AbortController) {
      // Not needed.
      return;
    }

    window.AbortController = shaka.polyfill.AbortController;
    window.AbortSignal = shaka.polyfill.AbortController.AbortSignal;
  }

  /** */
  constructor() {
    /** @private {!shaka.polyfill.AbortController.AbortSignal} */
    this.signal_ = new shaka.polyfill.AbortController.AbortSignal();
  }

  /**
   * @override
   * @suppress {const|duplicate} Since the original is defined as "const", we
   *   need this suppression to override it.
   */
  get signal() {
    return this.signal_;
  }

  /**
   * @param {*=} reason
   * @override
   */
  abort(reason) {
    this.signal_.doAbort_(reason);
  }
};

/**
 * @summary A polyfill for AbortSignal, part of the AbortController API.
 * @extends AbortSignal
 */
shaka.polyfill.AbortController.AbortSignal = class {
  /** */
  constructor() {
    /** @private {boolean} */
    this.aborted_ = false;

    /** @private {*} */
    this.reason_ = undefined;

    /** @type {?function(!Event)} */
    this.onabort = null;

    /** @private {!shaka.util.FakeEventTarget} */
    this.eventTarget_ = new shaka.util.FakeEventTarget();
  }

  /** @override */
  addEventListener(type, listener, options) {
    return this.eventTarget_.addEventListener(type, listener, options);
  }

  /** @override */
  removeEventListener(type, listener, options) {
    return this.eventTarget_.removeEventListener(type, listener, options);
  }

  /** @override */
  dispatchEvent(event) {
    return this.eventTarget_.dispatchEvent(event);
  }

  /** @override */
  get aborted() {
    return this.aborted_;
  }

  /** @override */
  get reason() {
    return this.reason_;
  }

  /** @override */
  throwIfAborted() {
    if (this.aborted_) {
      throw this.reason_;
    }
  }

  /**
   * @param {*} reason
   * @private
   */
  doAbort_(reason) {
    if (this.aborted_) {
      return;
    }

    this.aborted_ = true;
    this.reason_ = reason;
    if (this.reason_ === undefined) {
      // This is equivalent to a native implementation.
      this.reason_ = new DOMException(
          'signal is aborted without reason', 'AbortError');
    }

    // According to MDN:
    // "Event type - A generic Event with no added properties."
    const event = new shaka.util.FakeEvent('abort');
    if (this.onabort) {
      this.onabort(event);
    }
    this.dispatchEvent(event);
  }

  /** @override */
  static abort(reason) {
    const signal = new shaka.polyfill.AbortController.AbortSignal();
    signal.doAbort_(reason);
    return signal;
  }

  /** @override */
  static timeout(timeMs) {
    const signal = new shaka.polyfill.AbortController.AbortSignal();

    window.setTimeout(() => {
      // This is equivalent to a native implementation.
      signal.doAbort_(new DOMException('signal timed out', 'TimeoutError'));
    }, timeMs);

    return signal;
  }
};


shaka.polyfill.register(shaka.polyfill.AbortController.install);
