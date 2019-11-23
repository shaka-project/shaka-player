/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
goog.provide('shaka.polyfill.MathRound');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @summary A polyfill to patch math round bug on some browsers.
 * @see https://stackoverflow.com/q/12830742
 */
shaka.polyfill.MathRound = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    shaka.log.debug('mathRound.install');

    const testNumber = shaka.polyfill.MathRound.MAX_ACCURATE_INPUT_ + 1;
    if (Math.round(testNumber) != testNumber) {
      shaka.log.debug('polyfill Math.round');
      const originalMathRound = Math.round;
      Math.round = (number) => {
        let result = number;
        // Due to the precision of JavaScript numbers, the number must be
        // integer.
        if (number <= shaka.polyfill.MathRound.MAX_ACCURATE_INPUT_) {
          result = originalMathRound(number);
        }
        return result;
      };
    }
  }
};


/**
 @const {number}
 @private
 */
shaka.polyfill.MathRound.MAX_ACCURATE_INPUT_ = 0x10000000000000;


shaka.polyfill.register(shaka.polyfill.MathRound.install);
