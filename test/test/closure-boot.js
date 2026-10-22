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

  // Closure's own deps.js is not served, and dist/deps.js has all we need.
  window['CLOSURE_NO_DEPS'] = true;

  if (closureShouldUseCreateElement) {
    installRetryingScriptLoader();
  }

  /**
   * Replaces the way Closure creates script elements.  Closure appends them
   * all at once with async=false, so a script that fails to load (which
   * happens on slow devices like Chromecast) is silently skipped while the
   * scripts after it still run.  The classes that extend a skipped class then
   * fail to load, and the tests fail in confusing ways much later.
   *
   * Instead, load the scripts one by one in the same order, and retry the ones
   * that fail.  test/test/boot.js waits for all of them before starting.
   */
  function installRetryingScriptLoader() {
    const maxAttempts = 3;
    const retryDelayMs = 1000;

    /** @type {!Array<string>} */
    const queue = [];
    /** @type {!Array<string>} */
    const failed = [];
    /** @type {!Array<function()>} */
    let waiting = [];
    let loading = false;

    const loadNext = () => {
      if (!queue.length) {
        loading = false;
        const callbacks = waiting;
        waiting = [];
        for (const callback of callbacks) {
          callback();
        }
        return;
      }
      loading = true;
      const src = queue.shift();
      let attempt = 1;
      const tryLoad = () => {
        const script =
          /** @type {!HTMLScriptElement} */(document.createElement('script'));
        script['async'] = false;
        script.onload = loadNext;
        script.onerror = () => {
          script.remove();
          if (attempt < maxAttempts) {
            attempt++;
            console.warn('Retrying script that failed to load:', src);
            setTimeout(tryLoad, retryDelayMs);
          } else {
            failed.push(src);
            loadNext();
          }
        };
        script.src = src;
        document.head.appendChild(script);
      };
      tryLoad();
    };

    /**
     * @param {string} src
     * @return {boolean}
     */
    window['CLOSURE_IMPORT_SCRIPT'] = (src) => {
      queue.push(src);
      if (!loading) {
        loadNext();
      }
      return true;
    };

    /**
     * Resolves when all the scripts requested so far are loaded, and rejects
     * if any of them could not be loaded.
     *
     * @return {!Promise}
     */
    window['waitForClosureScripts'] = () => {
      return new Promise((resolve, reject) => {
        const done = () => {
          if (failed.length) {
            reject(new Error('Failed to load: ' + failed.join(', ')));
          } else {
            resolve();
          }
        };
        if (loading) {
          waiting.push(done);
        } else {
          done();
        }
      });
    };
  }

  if (isDebugPage) {
    // In browser debug mode, we don't get Karma's dump() function.  Everything
    // is in browser context only, with no back-channel to the Karma server, so
    // we define Karma's dump() here to simply log to the browser.
    window.dump = (string) => {
      console.debug(string);
    };
  }
})();
