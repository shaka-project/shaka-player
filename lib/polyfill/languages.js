/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.Languages');

goog.require('shaka.polyfill');


/**
 * @summary A polyfill to provide navigator.languages on all browsers.
 * This is necessary for IE and possibly others we have yet to discover.
 */
shaka.polyfill.Languages = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
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
  }
};


shaka.polyfill.register(shaka.polyfill.Languages.install);
