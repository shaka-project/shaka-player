/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('goog.asserts');


/**
 * @summary An assertion framework which is compiled out for deployment.
 *   NOTE: this is not the closure library version.  This uses the same name so
 *   the closure compiler will be able to use the conditions to assist type
 *   checking.
 */
goog.asserts = class {
  /**
   * @param {*} val
   * @param {string} message
   */
  static assert(val, message) {}
};


/**
 * @define {boolean} true to enable asserts, false otherwise.
 */
goog.asserts.ENABLE_ASSERTS = goog.DEBUG;


// Install assert functions.
if (goog.asserts.ENABLE_ASSERTS) {
  if (console.assert && console.assert.bind) {
    // eslint-disable-next-line no-restricted-syntax
    goog.asserts.assert = console.assert.bind(console);
  }
}
