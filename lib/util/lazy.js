/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Lazy');

goog.require('goog.asserts');


/**
 * @summary
 * This contains a single value that is lazily generated when it is first
 * requested.  This can store any value except "undefined".
 *
 * @template T
 */
shaka.util.Lazy = class {
  /** @param {function():T} gen */
  constructor(gen) {
    /** @private {function():T} */
    this.gen_ = gen;

    /** @private {T|undefined} */
    this.value_ = undefined;
  }

  /** @return {T} */
  value() {
    if (this.value_ === undefined) {
      // Compiler complains about unknown fields without this cast.
      this.value_ = /** @type {*} */ (this.gen_());
      goog.asserts.assert(
          this.value_ !== undefined, 'Unable to create lazy value');
    }
    return this.value_;
  }

  /** Resets the value of the lazy function, so it has to be remade. */
  reset() {
    this.value_ = undefined;
  }
};
