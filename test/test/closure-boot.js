/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

(() => {
  const karmaUsesFrames = __karma__.config.useIframe ||
      !__karma__.config.runInParent;
  const isDebugPage = location.pathname.endsWith('/debug.html');

  // When Karma uses frames, or is on the debug page, it loads scripts by
  // inserting them directly into the HTML it serves.  Otherwise, it creates
  // new <script> elements at runtime and appends them to <head>.
  const karmaInsertsScriptsDirectly = karmaUsesFrames || isDebugPage;
  const karmaUsesCreateElement = !karmaInsertsScriptsDirectly;

  // We must always match Karma's methodology in Closure to avoid scripts
  // loading out of order.
  const closureShouldUseCreateElement = karmaUsesCreateElement;

  // This is how Closure's loader gets configured.  The setting
  // goog.ENABLE_CHROME_APP_SAFE_SCRIPT_LOADING means to use createElement.
  window['CLOSURE_UNCOMPILED_DEFINES'] = {
    'goog.ENABLE_CHROME_APP_SAFE_SCRIPT_LOADING': closureShouldUseCreateElement,
  };

  if (isDebugPage) {
    // In browser debug mode, we don't get Karma's dump() function.  Everything
    // is in browser context only, with no back-channel to the Karma server, so
    // we define Karma's dump() here to simply log to the browser.
    window.dump = (string) => {
      console.debug(string);
    };
  }
})();
