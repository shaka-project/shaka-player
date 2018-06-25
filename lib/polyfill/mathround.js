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
goog.provide('shaka.polyfill.MathRound');

goog.require('shaka.log');
goog.require('shaka.polyfill.register');

/**
 * @namespace shaka.polyfill.MathRound
 *
 * @summary A polyfill to patch math round bug on some browsers.
 * @see https://stackoverflow.com/q/12830742
 */


/**
 @const {number}
 @private
 */
shaka.polyfill.MathRound.MAX_ACCURATE_INPUT_ = 0x10000000000000;


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.MathRound.install = function() {
  shaka.log.debug('mathRound.install');

  let testNumber = shaka.polyfill.MathRound.MAX_ACCURATE_INPUT_ + 1;
  if (Math.round(testNumber) != testNumber) {
    shaka.log.debug('polyfill Math.round');
    let originalMathRound = Math.round;
    Math.round = function(number) {
      let result = number;
      // Due to the precision of JavaScript numbers, the number must be integer.
      if (number <= shaka.polyfill.MathRound.MAX_ACCURATE_INPUT_) {
        result = originalMathRound(number);
      }
      return result;
    };
  }
};

shaka.polyfill.register(shaka.polyfill.MathRound.install);
