/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.Loader');


/**
 * A stand-in type for the "shaka" namespace.  Used when loading the compiled
 * library or when referencing it in ManifestGenerator or TestScheme.
 *
 * The new compiler has a "typeof" annotation for classes, but it warns of an
 * incomplete type when used on the entire library namespace.  So instead, we
 * use this type, which maps out parts of the compiled namespace used in
 * top-level integration tests.
 *
 * @typedef {{
 *   Player: typeof shaka.Player,
 *   media: {
 *     SegmentReference: typeof shaka.media.SegmentReference,
 *     InitSegmentReference: typeof shaka.media.InitSegmentReference,
 *     SegmentIndex: typeof shaka.media.SegmentIndex,
 *     PresentationTimeline: typeof shaka.media.PresentationTimeline
 *   },
 *   net: {
 *     NetworkingEngine: typeof shaka.net.NetworkingEngine
 *   },
 *   offline: {
 *     Storage: typeof shaka.offline.Storage
 *   },
 *   ui: {
 *     Overlay: typeof shaka.ui.Overlay,
 *     Controls: typeof shaka.ui.Controls,
 *     Element: typeof shaka.ui.Element
 *   },
 *   util: {
 *     StringUtils: typeof shaka.util.StringUtils
 *   }
 * }}
 */
let shakaNamespaceType;


shaka.test.Loader = class {
  /**
   * @param {boolean} loadUncompiled
   * @return {!Promise.<shakaNamespaceType>}
   */
  static async loadShaka(loadUncompiled) {
    /** @type {!shaka.util.PublicPromise} */
    const loaded = new shaka.util.PublicPromise();
    /** @type {shakaNamespaceType} */
    let compiledShaka;

    if (loadUncompiled) {
      // For debugging purposes, use the uncompiled library.
      compiledShaka = window['shaka'];
      loaded.resolve();
    } else {
      // Load the compiled library as a module.
      // All tests in this suite will use the compiled library.
      require(['/base/dist/shaka-player.ui.js'], (shakaModule) => {
        try {
          compiledShaka = shakaModule;
          compiledShaka.net.NetworkingEngine.registerScheme(
              'test', shaka.test.TestScheme.plugin);
          compiledShaka.media.ManifestParser.registerParserByMime(
              'application/x-test-manifest',
              shaka.test.TestScheme.ManifestParser.factory);

          loaded.resolve();

          // We need to catch thrown exceptions here to propertly report errors
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

    await loaded;
    return compiledShaka;
  }
};
