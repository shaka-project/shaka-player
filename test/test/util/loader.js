/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

shaka.test.Loader = class {
  /**
   * @param {boolean} loadUncompiled
   * @return {!Promise<shaka>}
   */
  static async loadShaka(loadUncompiled) {
    /** @type {!Promise.PromiseWithResolvers} */
    const loaded = Promise.withResolvers();
    /** @type {shaka} */
    let compiledShaka;

    if (loadUncompiled) {
      // For debugging purposes, use the uncompiled library.
      compiledShaka = window['shaka'];
      loaded.resolve();
    } else {
      // Load the compiled library as a module.
      // All tests in this suite will use the compiled library.
      require(['/base/dist/shaka-player.experimental.js'], (shakaModule) => {
        try {
          compiledShaka = shakaModule;
          compiledShaka.net.NetworkingEngine.registerScheme(
              'test', shaka.test.TestScheme.plugin);
          compiledShaka.media.ManifestParser.registerParserByMime(
              'application/x-test-manifest',
              shaka.test.TestScheme.ManifestParser.factory);

          loaded.resolve();

          // We need to catch thrown exceptions here to properly report errors
          // in the registration process above.
          // eslint-disable-next-line no-restricted-syntax
        } catch (error) {
          loaded.reject('Failed to register with compiled player.');
          shaka.log.error('Error registering with compiled player.', error);
        }
      }, (error) => {
        loaded.reject('Failed to load compiled player.');
        shaka.log.error('Error loading compiled player.', error);
      });
    }

    await loaded.promise;
    return compiledShaka;
  }
};
