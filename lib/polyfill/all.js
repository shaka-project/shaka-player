/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill');

goog.require('shaka.log');


/**
 * @summary A one-stop installer for all polyfills.
 * @see http://enwp.org/polyfill
 * @export
 */
shaka.polyfill = class {
  /**
   * Install all polyfills.
   * @export
   */
  static installAll() {
    for (const polyfill of shaka.polyfill.polyfills_) {
      try {
        polyfill.callback();
      } catch (error) {
        shaka.log.alwaysWarn('Error installing polyfill!', error);
      }
    }
  }

  /**
   * Registers a new polyfill to be installed.
   *
   * @param {function()} polyfill
   * @param {number=} priority An optional number priority.  Higher priorities
   *   will be executed before lower priority ones.  Default is 0.
   * @export
   */
  static register(polyfill, priority) {
    const newItem = {priority: priority || 0, callback: polyfill};
    for (let i = 0; i < shaka.polyfill.polyfills_.length; i++) {
      const item = shaka.polyfill.polyfills_[i];
      if (item.priority < newItem.priority) {
        shaka.polyfill.polyfills_.splice(i, 0, newItem);
        return;
      }
    }
    shaka.polyfill.polyfills_.push(newItem);
  }
};


/**
 * Contains the polyfills that will be installed.
 * @private {!Array<{priority: number, callback: function()}>}
 */
shaka.polyfill.polyfills_ = [];
