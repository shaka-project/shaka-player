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
   * Concurrent calls are serialised through a shared probePromise_ so that
   * exactly one CDM probe call is made regardless of how many callers arrive
   * before the first probe resolves.  Callers that arrive while a probe is
   * already in flight wait for it to finish and then re-dispatch through
   * whatever handler was installed as a result of that probe.
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

    // If a probe is already in flight, wait for it to settle then
    // re-dispatch so we don't race two separate installs of the polyfill.
    if (shaka.polyfill.EmeEncryptionScheme.probePromise_) {
      // The probe promise resolves (never rejects) once the detection is done
      // and navigator.requestMediaKeySystemAccess has been replaced.
      await shaka.polyfill.EmeEncryptionScheme.probePromise_;
      // eslint-disable-next-line no-restricted-syntax
      return navigator.requestMediaKeySystemAccess.call(
          this, keySystem, supportedConfigurations);
    }

    // We are the first caller – own the probe.  Create a Promise that other
    // concurrent callers can await; resolve it (via resolveProbe) once we have
    // replaced navigator.requestMediaKeySystemAccess.
    let resolveProbe;
    shaka.polyfill.EmeEncryptionScheme.probePromise_ =
        new Promise((resolve) => { resolveProbe = resolve; });

    let mediaKeySystemAccess;
    try {
      // Call the original version.  If the call succeeds, we look at the
      // result to decide if the encryptionScheme field is supported or not.
      mediaKeySystemAccess =
          // eslint-disable-next-line no-restricted-syntax
          await shaka.polyfill.EmeEncryptionScheme.originalRMKSA_.call(
              this, keySystem, supportedConfigurations);
    } catch (error) {
      // The probe call itself failed (key system not available, bad config,
      // etc.).  Clear the promise so the next caller can retry the probe with
      // its own arguments, then re-throw so this caller gets the error.
      shaka.polyfill.EmeEncryptionScheme.probePromise_ = null;
      resolveProbe();
      throw error;
    }

    const hasEncryptionScheme = shaka.polyfill.EncryptionSchemeUtils
        .hasEncryptionScheme(mediaKeySystemAccess);
    if (hasEncryptionScheme) {
      // The browser supports the encryptionScheme field!
      // No need for a patch.  Revert back to the original implementation.
      shaka.log.debug(logPrefix, 'Native encryptionScheme support found.');

      navigator.requestMediaKeySystemAccess =
          shaka.polyfill.EmeEncryptionScheme.originalRMKSA_;

      // Unblock concurrent callers before returning.
      resolveProbe();
      // Return the results, which are completely valid.
      return mediaKeySystemAccess;
    }

    // If we land here, the browser does _not_ support the encryptionScheme
    // field.  So we install another patch to check the encryptionScheme field
    // in future calls.
    shaka.log.debug(logPrefix, 'No native encryptionScheme support found. ' +
        'Patching encryptionScheme support.');

    navigator.requestMediaKeySystemAccess =
        shaka.polyfill.EmeEncryptionScheme.polyfillRMKSA_;

    // Unblock concurrent callers before continuing; they will now route
    // through polyfillRMKSA_ with their own arguments.
    resolveProbe();

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

    // Read the scheme from the configuration the browser actually chose
    // (reflected in getConfiguration()) rather than always assuming index [0]
    // of our filtered list.  We match the returned config against our filtered
    // list by looking at the first video/audio capability content type, then
    // pull the encryptionScheme we originally requested for that slot.
    let videoScheme = null;
    let audioScheme = null;

    const chosenConfig = mediaKeySystemAccess.getConfiguration();

    // Find the filtered config whose first capability content type matches the
    // first capability reported by the browser.  Fall back to index 0 if we
    // cannot find a match (should not happen in practice).
    const matchingConfig = shaka.polyfill.EmeEncryptionScheme
        .findMatchingConfig_(chosenConfig, filteredSupportedConfigurations) ||
        filteredSupportedConfigurations[0];

    if (matchingConfig) {
      if (matchingConfig.videoCapabilities &&
          matchingConfig.videoCapabilities.length) {
        videoScheme =
            matchingConfig.videoCapabilities[0]['encryptionScheme'] || null;
      }
      if (matchingConfig.audioCapabilities &&
          matchingConfig.audioCapabilities.length) {
        audioScheme =
            matchingConfig.audioCapabilities[0]['encryptionScheme'] || null;
      }
    }
    return new shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess(
        mediaKeySystemAccess, videoScheme, audioScheme);
  }

  /**
   * Attempts to match the browser-chosen configuration (from getConfiguration)
   * against the filtered configurations we submitted, using the first
   * capability's contentType as a key.
   *
   * @param {!MediaKeySystemConfiguration} chosenConfig The configuration
   *   returned by MediaKeySystemAccess.getConfiguration().
   * @param {!Array<!MediaKeySystemConfiguration>} filteredConfigs The filtered
   *   configurations that were submitted to requestMediaKeySystemAccess.
   * @return {MediaKeySystemConfiguration|undefined}
   * @private
   */
  static findMatchingConfig_(chosenConfig, filteredConfigs) {
    const chosenVideoType = chosenConfig.videoCapabilities &&
        chosenConfig.videoCapabilities[0] &&
        chosenConfig.videoCapabilities[0].contentType;
    const chosenAudioType = chosenConfig.audioCapabilities &&
        chosenConfig.audioCapabilities[0] &&
        chosenConfig.audioCapabilities[0].contentType;

    return filteredConfigs.find((config) => {
      const videoType = config.videoCapabilities &&
          config.videoCapabilities[0] &&
          config.videoCapabilities[0].contentType;
      const audioType = config.audioCapabilities &&
          config.audioCapabilities[0] &&
          config.audioCapabilities[0].contentType;
      return videoType === chosenVideoType && audioType === chosenAudioType;
    });
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

/**
 * A Promise used to serialise concurrent calls to probeRMKSA_.  Set to a
 * pending Promise while a probe is in flight; resolves (never rejects) once
 * navigator.requestMediaKeySystemAccess has been replaced.  Reset to null if
 * the probe call itself throws, so the next caller can retry.
 *
 * @type {Promise<void>|null}
 * @private
 */
shaka.polyfill.EmeEncryptionScheme.probePromise_ = null;


shaka.polyfill.register(shaka.polyfill.EmeEncryptionScheme.install);
