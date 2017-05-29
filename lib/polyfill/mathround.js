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
 * @summary A polyfill to patch math round bug on IE11.
 */


/**
 * Install the polyfill if needed.
 */
shaka.polyfill.MathRound.install = function() {
  shaka.log.debug('mathRound.install');

  var agent = navigator.userAgent;
  if (agent && agent.indexOf('rv:11.0') >= 0) {
    shaka.log.debug('fix mathRound on IE11');
    var original_mathRound = Math.round;
    Math.round = function(number) {
      var result = number;
      // workaround for IE brain-dead Math.round() implementation
      // https://stackoverflow.com/questions/12830742/javascript-math-round-bug-in-ie
      if (number < 4503599627370496) {
        result = original_mathRound(number);
      }
      return result;
    };
  }
};

shaka.polyfill.register(shaka.polyfill.MathRound.install);
