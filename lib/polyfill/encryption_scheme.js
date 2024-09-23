/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.EncryptionScheme');

goog.require('shaka.polyfill');
goog.require('shaka.util.Platform');

/**
 * @summary A polyfill to add support for EncryptionScheme queries in EME.
 * @see https://wicg.github.io/encrypted-media-encryption-scheme/
 * @see https://github.com/w3c/encrypted-media/pull/457
 * @see https://github.com/shaka-project/eme-encryption-scheme-polyfill
 * @export
 */
shaka.polyfill.EncryptionScheme = class {
  /**
   * Install the polyfill if needed.
   *
   * @suppress {missingRequire}
   * @export
   */
  static install() {
    // Skip polyfill for PlayStation 4 and SkyQ devices due to known crashes
    // caused by unsupported encryptionScheme handling. These platforms do not
    // require the polyfill, and forcing encryptionScheme processing can result
    // in playback crashes.
    if (shaka.util.Platform.isPS4() || shaka.util.Platform.isSkyQ()) {
      return;
    }

    EncryptionSchemePolyfills.install();
  }
};

// Install at a low priority so that other EME polyfills go first.
shaka.polyfill.register(shaka.polyfill.EncryptionScheme.install, -2);
