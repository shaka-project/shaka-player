/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.EncryptionSchemeUtils');

goog.require('shaka.log');
goog.require('shaka.device.DeviceFactory');

shaka.polyfill.EncryptionSchemeUtils = class {
  /**
   * Guess the supported encryption scheme for the key system.
   *
   * @param {string} keySystem The key system ID.
   * @return {?string} A guess at the encryption scheme this key system
   *   supports.
   */
  static guessSupportedScheme(keySystem) {
    if (keySystem.startsWith('com.apple')) {
      return 'cbcs';
    }
    if (keySystem.startsWith('com.widevine') ||
        keySystem.startsWith('com.microsoft') ||
        keySystem.startsWith('com.chromecast') ||
        keySystem.startsWith('org.w3') ||
        keySystem.startsWith('com.huawei')) {
      return 'cenc';
    }

    // We don't have this key system in our map!
    shaka.log.alwaysWarn('EmeEncryptionSchemePolyfill: Unknown key system:',
        keySystem, 'Please contribute!');

    return null;
  }

  /**
   * @param {?MediaKeySystemAccess} mediaKeySystemAccess A native
   *   MediaKeySystemAccess instance from the browser.
   * @return {boolean} True if browser natively supports encryptionScheme.
   */
  static hasEncryptionScheme(mediaKeySystemAccess) {
    if (!mediaKeySystemAccess) {
      return false;
    }
    const configuration = mediaKeySystemAccess.getConfiguration();

    // It doesn't matter which capability we look at.  For this check, they
    // should all produce the same result.
    const firstVideoCapability =
        configuration.videoCapabilities && configuration.videoCapabilities[0];
    const firstAudioCapability =
        configuration.audioCapabilities && configuration.audioCapabilities[0];
    const firstCapability = firstVideoCapability || firstAudioCapability;

    // If supported by the browser, the encryptionScheme field must appear in
    // the returned configuration, regardless of whether or not it was
    // specified in the supportedConfigurations given by the application.
    if (firstCapability && firstCapability['encryptionScheme'] !== undefined) {
      return true;
    }
    return false;
  }

  /**
   * @param {(string|undefined|null)} scheme Encryption scheme to check
   * @param {?string} supportedScheme A guess at the encryption scheme this
   *   supports.
   * @return {boolean} True if the scheme is compatible.
   */
  static checkSupportedScheme(scheme, supportedScheme) {
    if (!scheme) {
      // Not encrypted = always supported
      return true;
    }

    if (scheme == supportedScheme) {
      // The assumed-supported legacy scheme for this platform.
      return true;
    }

    if (scheme == 'cbcs' || scheme == 'cbcs-1-9') {
      const device = shaka.device.DeviceFactory.getDevice();
      if (device.supportsCbcsWithoutEncryptionSchemeSupport()) {
        return true;
      }
    }

    return false;
  }
};
