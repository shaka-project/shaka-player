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

goog.provide('shaka.polyfill.Languages');

goog.require('shaka.polyfill.register');


/**
 * @namespace shaka.polyfill.Languages
 *
 * @summary A polyfill to provide navigator.languages on all browsers.
 * This is necessary for IE and possibly others we have yet to discover.
 */

/**
 * Install the polyfill if needed.
 */
shaka.polyfill.Languages.install = function() {
  if (navigator.languages) {
    // No need.
    return;
  }

  Object.defineProperty(navigator, 'languages', {
    get: () => {
      // If the browser provides a single language (all that we've seen), then
      // make an array out of that.  Otherwise, return English.
      if (navigator.language) {
        return [navigator.language];
      }
      return ['en'];
    },
  });
};

shaka.polyfill.register(shaka.polyfill.Languages.install);
