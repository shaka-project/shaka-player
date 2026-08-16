/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.EmeEncryptionScheme');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.polyfill');
goog.require('shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess');
goog.require('shaka.polyfill.EncryptionSchemeUtils');


/**
 * A polyfill to add support for EncryptionScheme queries in EME.
 *
 * Because this polyfill can't know what schemes the UA or CDM actually support,
 * it assumes support for the historically-supported schemes of each well-known
 * key system.
 *
 * @see https://wicg.github.io/encrypted-media-encryption-scheme/
 * @see https://github.com/w3c/encrypted-media/pull/457
 * @export
 */
shaka.polyfill.EmeEncryptionScheme = class {
  /**
   * Installs the polyfill.  To avoid the possibility of extra user prompts,
   * this will shim EME so long as it exists, without checking support for
   * encryptionScheme upfront.  The support check will happen on-demand the
   * first time EME is used.
   *
   * @export
   */
  static install() {
    const device = shaka.device.DeviceFactory.getDevice();
    if (!device.supportsEncryptionSchemePolyfill()) {
      return;
    }

    const logPrefix = 'EmeEncryptionSchemePolyfill:';

    if (shaka.polyfill.EmeEncryptionScheme.originalRMKSA_ ||
        navigator.emeEncryptionSchemePolyfilled) {
      shaka.log.debug(logPrefix, 'Already installed.');
      return;
    }
    if (!navigator.requestMediaKeySystemAccess ||
        // eslint-disable-next-line no-restricted-syntax
        !MediaKeySystemAccess.prototype.getConfiguration) {
      shaka.log.debug(logPrefix, 'EME not found');
      // No EME.
      return;
    }

    // Save the original.
    shaka.polyfill.EmeEncryptionScheme.originalRMKSA_ =
        navigator.requestMediaKeySystemAccess;

    // Patch in a method which will check for support on the first call.
    shaka.log.debug(logPrefix, 'Waiting to detect encryptionScheme support.');
    navigator.requestMediaKeySystemAccess =
        shaka.polyfill.EmeEncryptionScheme.probeRMKSA_;

    // Mark EME as polyfilled.  This keeps us from running into conflicts
    // between multiple versions of this (compiled Shaka lib vs
    // uncompiled source).
    navigator.emeEncryptionSchemePolyfilled = true;
  }

  /**
   * A shim for navigator.requestMediaKeySystemAccess to check for
   * encryptionScheme support.  Only used until we know if the browser has
   * native support for the encryptionScheme field.
   *
   * @this {Navigator}
   * @param {string} keySystem The key system ID.
   * @param {!Array<!MediaKeySystemConfiguration>} supportedConfigurations An
   *   array of supported configurations the application can use.
   * @return {!Promise<!MediaKeySystemAccess>} A Promise to a
   *   MediaKeySystemAccess instance.
   * @private
   */
  static async probeRMKSA_(keySystem, supportedConfigurations) {
    const logPrefix = 'EmeEncryptionSchemePolyfill:';

    goog.asserts.assert(this == navigator,
        'bad "this" for requestMediaKeySystemAccess');

    // Call the original version.  If the call succeeds, we look at the result
    // to decide if the encryptionScheme field is supported or not.
    const mediaKeySystemAccess =
        // eslint-disable-next-line no-restricted-syntax
        await shaka.polyfill.EmeEncryptionScheme.originalRMKSA_.call(
            this, keySystem, supportedConfigurations);

    const hasEncryptionScheme = shaka.polyfill.EncryptionSchemeUtils
        .hasEncryptionScheme(mediaKeySystemAccess);
    if (hasEncryptionScheme) {
      // The browser supports the encryptionScheme field!
      // No need for a patch.  Revert back to the original implementation.
      shaka.log.debug(logPrefix, 'Native encryptionScheme support found.');

      navigator.requestMediaKeySystemAccess =
          shaka.polyfill.EmeEncryptionScheme.originalRMKSA_;
      // Return the results, which are completely valid.
      return mediaKeySystemAccess;
    }

    // If we land here, the browser does _not_ support the encryptionScheme
    // field.  So we install another patch to check the encryptionScheme field
    // in future calls.
    shaka.log.debug(logPrefix, 'No native encryptionScheme support found. '+
        'Patching encryptionScheme support.');

    navigator.requestMediaKeySystemAccess =
        shaka.polyfill.EmeEncryptionScheme.polyfillRMKSA_;

    // The results we have may not be valid.  Run the query again through our
    // polyfill.
    // eslint-disable-next-line no-restricted-syntax
    return shaka.polyfill.EmeEncryptionScheme.polyfillRMKSA_.call(
        this, keySystem, supportedConfigurations);
  }

  /**
   * A polyfill for navigator.requestMediaKeySystemAccess to handle the
   * encryptionScheme field in browsers that don't support it.  It uses the
   * user-agent string to guess what encryption schemes are supported, then
   * those guesses are used to filter videoCapabilities and audioCapabilities
   * and reject unsupported schemes.
   *
   * @this {Navigator}
   * @param {string} keySystem The key system ID.
   * @param {!Array<!MediaKeySystemConfiguration>} supportedConfigurations An
   *   array of supported configurations the application can use.
   * @return {!Promise<!MediaKeySystemAccess>} A Promise to a
   *   MediaKeySystemAccess instance.
   * @private
   */
  static async polyfillRMKSA_(keySystem, supportedConfigurations) {
    goog.asserts.assert(this == navigator,
        'bad "this" for requestMediaKeySystemAccess');

    const supportedScheme =
        shaka.polyfill.EncryptionSchemeUtils.guessSupportedScheme(keySystem);

    // Filter the application's configurations based on our guess of what
    // encryption scheme is supported.
    const filteredSupportedConfigurations = [];
    for (const configuration of supportedConfigurations) {
      const filteredVideoCapabilities =
          shaka.polyfill.EmeEncryptionScheme.filterCapabilities_(
              configuration.videoCapabilities, supportedScheme);
      const filteredAudioCapabilities =
          shaka.polyfill.EmeEncryptionScheme.filterCapabilities_(
              configuration.audioCapabilities, supportedScheme);

      if (configuration.videoCapabilities &&
          configuration.videoCapabilities.length &&
          !filteredVideoCapabilities.length) {
        // We eliminated all of the video capabilities, so this configuration
        // is unusable.
      } else if (configuration.audioCapabilities &&
          configuration.audioCapabilities.length &&
          !filteredAudioCapabilities.length) {
        // We eliminated all of the audio capabilities, so this configuration
        // is unusable.
      } else {
        // Recreate a clone of the configuration and modify that.  This way, we
        // don't modify the application-provided config objects.
        /** @type {!MediaKeySystemConfiguration} */
        const clonedConfiguration = Object.assign({}, configuration);
        clonedConfiguration.videoCapabilities = filteredVideoCapabilities;
        clonedConfiguration.audioCapabilities = filteredAudioCapabilities;
        filteredSupportedConfigurations.push(clonedConfiguration);
      }
    }

    if (!filteredSupportedConfigurations.length) {
      // None of the application's configurations passed our encryptionScheme
      // filters, so this request fails.

      // As spec'd, this should be a DOMException, but there is not a public
      // constructor for this in all browsers.  This should be close enough for
      // most applications.
      const unsupportedError = new Error(
          'Unsupported keySystem or supportedConfigurations.');
      unsupportedError.name = 'NotSupportedError';
      unsupportedError['code'] = DOMException.NOT_SUPPORTED_ERR;
      throw unsupportedError;
    }

    // At this point, we have some filtered configurations that we think could
    // work.  Pass this subset to the native version of RMKSA.
    const mediaKeySystemAccess =
        // eslint-disable-next-line no-restricted-syntax
        await shaka.polyfill.EmeEncryptionScheme.originalRMKSA_.call(
            this, keySystem, filteredSupportedConfigurations);

    // Wrap the MKSA object in ours to provide the missing field in the
    // returned configuration.
    let videoScheme = null;
    let audioScheme = null;
    if (filteredSupportedConfigurations[0]) {
      if (filteredSupportedConfigurations[0].videoCapabilities) {
        videoScheme = filteredSupportedConfigurations[0]
            .videoCapabilities[0].encryptionScheme;
      }
      if (filteredSupportedConfigurations[0].audioCapabilities) {
        audioScheme = filteredSupportedConfigurations[0]
            .audioCapabilities[0].encryptionScheme;
      }
    }
    return new shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess(
        mediaKeySystemAccess, videoScheme, audioScheme);
  }

  /**
   * Filters out capabilities that don't match the supported encryption scheme.
   *
   * @param {!Array<!MediaKeySystemMediaCapability> | undefined} capabilities
   *   An array of capabilities, or null or undefined.
   * @param {?string} supportedScheme The encryption scheme that we think is
   *   supported by the key system.
   * @return {!Array<!MediaKeySystemMediaCapability> | undefined} A filtered
   *   array of capabilities based on |supportedScheme|.  May be undefined if
   *   the input was undefined.
   * @private
   */
  static filterCapabilities_(capabilities, supportedScheme) {
    if (!capabilities) {
      return capabilities;
    }

    return capabilities.filter((capability) => {
      return shaka.polyfill.EncryptionSchemeUtils.checkSupportedScheme(
          capability['encryptionScheme'], supportedScheme);
    });
  }
};

/**
 * The original requestMediaKeySystemAccess, before we patched it.
 *
 * @type {
 *   function(this:Navigator,
 *     string,
 *     !Array<!MediaKeySystemConfiguration>
 *   ):!Promise<!MediaKeySystemAccess>
 * }
 * @private
 */
shaka.polyfill.EmeEncryptionScheme.originalRMKSA_;


shaka.polyfill.register(shaka.polyfill.EmeEncryptionScheme.install);
