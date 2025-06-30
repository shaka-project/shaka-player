/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.EncryptionScheme');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.polyfill');

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
    const device = shaka.device.DeviceFactory.getDevice();
    if (!device.supportsEncryptionSchemePolyfill()) {
      return;
    }

    shaka.polyfill.EmeEncryptionScheme.install();
    shaka.polyfill.MCapEncryptionScheme.install();
  }
};


/**
 * A polyfill to add support for EncryptionScheme queries in EME.
 *
 * Because this polyfill can't know what schemes the UA or CDM actually support,
 * it assumes support for the historically-supported schemes of each well-known
 * key system.
 *
 * In source form, this is compatible with the Closure Compiler, CommonJS, and
 * AMD module formats.  It can also be directly included via a script tag.
 *
 * The minified bundle is a standalone module compatible with the CommonJS and
 * AMD module formats, and can also be directly included via a script tag.
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

/**
 * A polyfill to add support for EncryptionScheme queries in MediaCapabilities.
 *
 * Because this polyfill can't know what schemes the UA or CDM actually support,
 * it assumes support for the historically-supported schemes of each well-known
 * key system.
 *
 * In source form, this is compatible with the Closure Compiler, CommonJS, and
 * AMD module formats.  It can also be directly included via a script tag.
 *
 * The minified bundle is a standalone module compatible with the CommonJS and
 * AMD module formats, and can also be directly included via a script tag.
 *
 * @see https://wicg.github.io/encrypted-media-encryption-scheme/
 * @see https://github.com/w3c/encrypted-media/pull/457
 * @export
 */
shaka.polyfill.MCapEncryptionScheme = class {
  /**
   * Installs the polyfill.  To avoid the possibility of extra user prompts,
   * this will shim MC so long as it exists, without checking support for
   * encryptionScheme upfront.  The support check will happen on-demand the
   * first time MC is used.
   *
   * @export
   */
  static install() {
    const logPrefix = 'McEncryptionSchemePolyfill:';

    if (shaka.polyfill.MCapEncryptionScheme.originalDecodingInfo_ ||
        navigator.mediaCapabilitiesEncryptionSchemePolyfilled) {
      shaka.log.debug(logPrefix, 'Already installed.');
      return;
    }
    if (!navigator.mediaCapabilities) {
      shaka.log.debug(logPrefix, 'MediaCapabilities not found');
      // No MediaCapabilities.
      return;
    }

    // Save the original.
    shaka.polyfill.MCapEncryptionScheme.originalDecodingInfo_ =
        navigator.mediaCapabilities.decodingInfo;

    // Patch in a method which will check for support on the first call.
    shaka.log.debug(logPrefix, 'Waiting to detect encryptionScheme support.');
    navigator.mediaCapabilities.decodingInfo =
        shaka.polyfill.MCapEncryptionScheme.probeDecodingInfo_;

    // Mark MediaCapabilities as polyfilled.  This keeps us from running into
    // conflicts between multiple versions of this (compiled Shaka lib vs
    // uncompiled source).
    navigator.mediaCapabilitiesEncryptionSchemePolyfilled = true;
  }

  /**
   * A shim for mediaCapabilities.decodingInfo to check for encryptionScheme
   * support.  Only used until we know if the browser has native support for the
   * encryptionScheme field.
   *
   * @this {MediaCapabilities}
   * @param {!MediaDecodingConfiguration} requestedConfiguration The requested
   *   decoding configuration.
   * @return {!Promise<!MediaCapabilitiesDecodingInfo>} A Promise to a result
   *   describing the capabilities of the browser in the request configuration.
   * @private
   */
  static async probeDecodingInfo_(requestedConfiguration) {
    const logPrefix = 'McEncryptionSchemePolyfill:';

    goog.asserts.assert(this == navigator.mediaCapabilities,
        'bad "this" for decodingInfo');

    // Call the original version.  If the call succeeds, we look at the result
    // to decide if the encryptionScheme field is supported or not.
    const capabilities =
        // eslint-disable-next-line no-restricted-syntax
        await shaka.polyfill.MCapEncryptionScheme.originalDecodingInfo_.call(
            this, requestedConfiguration);

    // If the config is not supported, we don't need to try anything else.
    if (!capabilities.supported) {
      return capabilities;
    }

    if (!requestedConfiguration.keySystemConfiguration) {
      // This was not a query regarding encrypted content.  The results are
      // valid, but won't tell us anything about native support for
      // encryptionScheme.  Just return the results.
      return capabilities;
    }

    const mediaKeySystemAccess = capabilities.keySystemAccess;

    const hasEncryptionScheme = shaka.polyfill.EncryptionSchemeUtils
        .hasEncryptionScheme(mediaKeySystemAccess);
    if (hasEncryptionScheme) {
      // The browser supports the encryptionScheme field!
      // No need for a patch.  Revert back to the original implementation.
      shaka.log.debug(logPrefix, 'Native encryptionScheme support found.');

      navigator.mediaCapabilities.decodingInfo =
          shaka.polyfill.MCapEncryptionScheme.originalDecodingInfo_;
      // Return the results, which are completely valid.
      return capabilities;
    }

    // If we land here, either the browser does not support the
    // encryptionScheme field, or the browser does not support EME-related
    // fields in MCap _at all_.

    // First, install a patch to check the mediaKeySystemAccess or
    // encryptionScheme field in future calls.
    shaka.log.debug(logPrefix, 'No native encryptionScheme support found. '+
        'Patching encryptionScheme support.');

    navigator.mediaCapabilities.decodingInfo =
        shaka.polyfill.MCapEncryptionScheme.polyfillDecodingInfo_;

    // Second, if _none_ of the EME-related fields of MCap are supported, fill
    // them in now before returning the results.
    if (!mediaKeySystemAccess) {
      capabilities.keySystemAccess =
          await shaka.polyfill.MCapEncryptionScheme.getMediaKeySystemAccess_(
              requestedConfiguration);
      return capabilities;
    }

    // If we land here, it's only the encryption scheme field that is missing.
    // The results we have may not be valid, since they didn't account for
    // encryption scheme.  Run the query again through our polyfill.
    // eslint-disable-next-line no-restricted-syntax
    return shaka.polyfill.MCapEncryptionScheme.polyfillDecodingInfo_.call(
        this, requestedConfiguration);
  }

  /**
   * A polyfill for mediaCapabilities.decodingInfo to handle the
   * encryptionScheme field in browsers that don't support it.  It uses the
   * user-agent string to guess what encryption schemes are supported, then
   * those guesses are used to reject unsupported schemes.
   *
   * @this {MediaCapabilities}
   * @param {!MediaDecodingConfiguration} requestedConfiguration The requested
   *   decoding configuration.
   * @return {!Promise<!MediaCapabilitiesDecodingInfo>} A Promise to a result
   *   describing the capabilities of the browser in the request configuration.
   * @private
   */
  static async polyfillDecodingInfo_(requestedConfiguration) {
    goog.asserts.assert(this == navigator.mediaCapabilities,
        'bad "this" for decodingInfo');

    let videoScheme = null;
    let audioScheme = null;

    if (requestedConfiguration.keySystemConfiguration) {
      const keySystemConfig = requestedConfiguration.keySystemConfiguration;

      const keySystem = keySystemConfig.keySystem;

      audioScheme = keySystemConfig.audio &&
          keySystemConfig.audio.encryptionScheme;
      videoScheme = keySystemConfig.video &&
          keySystemConfig.video.encryptionScheme;

      const supportedScheme =
          shaka.polyfill.EncryptionSchemeUtils.guessSupportedScheme(keySystem);

      const notSupportedResult = {
        powerEfficient: false,
        smooth: false,
        supported: false,
        keySystemAccess: null,
        configuration: requestedConfiguration,
      };

      if (!shaka.polyfill.EncryptionSchemeUtils.checkSupportedScheme(
          audioScheme, supportedScheme)) {
        return notSupportedResult;
      }
      if (!shaka.polyfill.EncryptionSchemeUtils.checkSupportedScheme(
          videoScheme, supportedScheme)) {
        return notSupportedResult;
      }
    }

    // At this point, either it's unencrypted or we assume the encryption scheme
    // is supported.  So delegate to the original decodingInfo() method.
    const capabilities =
        // eslint-disable-next-line no-restricted-syntax
        await shaka.polyfill.MCapEncryptionScheme.originalDecodingInfo_.call(
            this, requestedConfiguration);

    if (capabilities.keySystemAccess) {
      // If the result is supported and encrypted, this will be a
      // MediaKeySystemAccess instance.  Wrap the MKSA object in ours to provide
      // the missing field in the returned configuration.
      capabilities.keySystemAccess =
          new shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess(
              capabilities.keySystemAccess, videoScheme, audioScheme);
    } else if (requestedConfiguration.keySystemConfiguration) {
      // If the result is supported and the content is encrypted, we should have
      // a MediaKeySystemAccess instance as part of the result.  If we land
      // here, the browser doesn't support the EME-related fields of MCap.
      capabilities.keySystemAccess =
          await shaka.polyfill.MCapEncryptionScheme.getMediaKeySystemAccess_(
              requestedConfiguration);
    }

    return capabilities;
  }

  /**
   * Call navigator.requestMediaKeySystemAccess to get the MediaKeySystemAccess
   * information.
   *
   * @param {!MediaDecodingConfiguration} requestedConfiguration The requested
   *   decoding configuration.
   * @return {!Promise<!MediaKeySystemAccess>} A Promise to a
   *   MediaKeySystemAccess instance.
   * @private
   */
  static async getMediaKeySystemAccess_(requestedConfiguration) {
    const mediaKeySystemConfig =
          shaka.polyfill.MCapEncryptionScheme.convertToMediaKeySystemConfig_(
              requestedConfiguration);
    const keySystemAccess =
          await navigator.requestMediaKeySystemAccess(
              requestedConfiguration.keySystemConfiguration.keySystem,
              [mediaKeySystemConfig]);
    return keySystemAccess;
  }

  /**
   * Convert the MediaDecodingConfiguration object to a
   * MediaKeySystemConfiguration object.
   *
   * @param {!MediaDecodingConfiguration} decodingConfig The decoding
   *   configuration.
   * @return {!MediaKeySystemConfiguration} The converted MediaKeys
   *   configuration.
   * @private
   */
  static convertToMediaKeySystemConfig_(decodingConfig) {
    const mediaCapKeySystemConfig = decodingConfig.keySystemConfiguration;
    const audioCapabilities = [];
    const videoCapabilities = [];

    if (mediaCapKeySystemConfig.audio) {
      const capability = {
        robustness: mediaCapKeySystemConfig.audio.robustness || '',
        contentType: decodingConfig.audio.contentType,
        encryptionScheme: mediaCapKeySystemConfig.audio.encryptionScheme,
      };
      audioCapabilities.push(capability);
    }

    if (mediaCapKeySystemConfig.video) {
      const capability = {
        robustness: mediaCapKeySystemConfig.video.robustness || '',
        contentType: decodingConfig.video.contentType,
        encryptionScheme: mediaCapKeySystemConfig.video.encryptionScheme,
      };
      videoCapabilities.push(capability);
    }

    const initDataTypes = mediaCapKeySystemConfig.initDataType ?
        [mediaCapKeySystemConfig.initDataType] : [];

    /** @type {!MediaKeySystemConfiguration} */
    const mediaKeySystemConfig = {
      initDataTypes: initDataTypes,
      distinctiveIdentifier: mediaCapKeySystemConfig.distinctiveIdentifier,
      persistentState: mediaCapKeySystemConfig.persistentState,
      sessionTypes: mediaCapKeySystemConfig.sessionTypes,
    };

    // Only add the audio video capabilities if they have valid data.
    // Otherwise the query will fail.
    if (audioCapabilities.length) {
      mediaKeySystemConfig.audioCapabilities = audioCapabilities;
    }
    if (videoCapabilities.length) {
      mediaKeySystemConfig.videoCapabilities = videoCapabilities;
    }
    return mediaKeySystemConfig;
  }
};

/**
 * The original decodingInfo, before we patched it.
 *
 * @type {
 *   function(this:MediaCapabilities,
 *     !MediaDecodingConfiguration
 *   ):!Promise<!MediaCapabilitiesDecodingInfo>
 * }
 * @private
 */
shaka.polyfill.MCapEncryptionScheme.originalDecodingInfo_;

/**
 * A wrapper around MediaKeySystemAccess that adds encryptionScheme
 *   fields to the configuration, to emulate what a browser with native support
 *   for this field would do.
 *
 * @see https://github.com/w3c/encrypted-media/pull/457
 * @see https://github.com/WICG/encrypted-media-encryption-scheme/issues/13
 * @implements {MediaKeySystemAccess}
 */
shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess = class {
  /**
   * @param {!MediaKeySystemAccess} mksa A native MediaKeySystemAccess instance
   *   to wrap.
   * @param {?string|undefined} videoScheme The encryption scheme to add to the
   *   configuration for video.
   * @param {?string|undefined} audioScheme The encryption scheme to add to the
   *   configuration for audio.
   */
  constructor(mksa, videoScheme, audioScheme) {
    /**
     * @const {!MediaKeySystemAccess}
     * @private
     */
    this.mksa_ = mksa;

    /**
     * @const {?string}
     * @private
     */
    this.videoScheme_ = videoScheme || null;

    /**
     * @const {?string}
     * @private
     */
    this.audioScheme_ = audioScheme || null;

    /** @const {string} */
    this.keySystem = mksa.keySystem;
  }

  /**
   * @override
   * @return {!MediaKeySystemConfiguration} A MediaKeys config with
   *   encryptionScheme fields added
   */
  getConfiguration() {
    // A browser which supports the encryptionScheme field would always return
    // that field in the resulting configuration.  So here, we emulate that.
    const configuration = this.mksa_.getConfiguration();

    if (configuration.videoCapabilities) {
      for (const capability of configuration.videoCapabilities) {
        capability['encryptionScheme'] = this.videoScheme_;
      }
    }

    if (configuration.audioCapabilities) {
      for (const capability of configuration.audioCapabilities) {
        capability['encryptionScheme'] = this.audioScheme_;
      }
    }

    return configuration;
  }

  /**
   * @override
   * @return {!Promise<!MediaKeys>} A passthrough of the native MediaKeys object
   */
  createMediaKeys() {
    return this.mksa_.createMediaKeys();
  }
};

shaka.polyfill.EncryptionSchemeUtils = class {
  /**
   * Guess the supported encryption scheme for the key system.
   *
   * @param {string} keySystem The key system ID.
   * @return {?string} A guess at the encryption scheme this key system
   *   supports.
   */
  static guessSupportedScheme(keySystem) {
    if (keySystem.startsWith('com.widevine')) {
      return 'cenc';
    } else if (keySystem.startsWith('com.microsoft')) {
      return 'cenc';
    } else if (keySystem.startsWith('com.chromecast')) {
      return 'cenc';
    } else if (keySystem.startsWith('com.adobe')) {
      return 'cenc';
    } else if (keySystem.startsWith('org.w3')) {
      return 'cenc';
    } else if (keySystem.startsWith('com.apple')) {
      return 'cbcs';
    } else if (keySystem.startsWith('com.huawei')) {
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

// Install at a low priority so that other EME polyfills go first.
shaka.polyfill.register(shaka.polyfill.EncryptionScheme.install, -2);
