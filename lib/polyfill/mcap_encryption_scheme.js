/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.MCapEncryptionScheme');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.polyfill');
goog.require('shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess');
goog.require('shaka.polyfill.EncryptionSchemeUtils');

/**
 * A polyfill to add support for EncryptionScheme queries in MediaCapabilities.
 *
 * Because this polyfill can't know what schemes the UA or CDM actually support,
 * it assumes support for the historically-supported schemes of each well-known
 * key system.
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
    const device = shaka.device.DeviceFactory.getDevice();
    if (!device.supportsEncryptionSchemePolyfill()) {
      return;
    }

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
   * Concurrent calls are serialised through a shared probePromise_ so that
   * exactly one MCap probe call is made regardless of how many callers arrive
   * before the first probe resolves.  Callers that arrive while a probe is
   * already in flight wait for it to finish and then re-dispatch through
   * whatever handler was installed as a result of that probe.
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

    // If a probe is already in flight, wait for it to settle then
    // re-dispatch so we don't race two separate installs of the polyfill.
    if (shaka.polyfill.MCapEncryptionScheme.probePromise_) {
      await shaka.polyfill.MCapEncryptionScheme.probePromise_;
      // eslint-disable-next-line no-restricted-syntax
      return navigator.mediaCapabilities.decodingInfo.call(
          this, requestedConfiguration);
    }

    // We are the first caller – own the probe.
    let resolveProbe;
    shaka.polyfill.MCapEncryptionScheme.probePromise_ =
        new Promise((resolve) => { resolveProbe = resolve; });

    let capabilities;
    try {
      // Call the original version.  If the call succeeds, we look at the
      // result to decide if the encryptionScheme field is supported or not.
      capabilities =
          // eslint-disable-next-line no-restricted-syntax
          await shaka.polyfill.MCapEncryptionScheme.originalDecodingInfo_.call(
              this, requestedConfiguration);
    } catch (error) {
      // The probe call itself failed.  Clear the promise so the next caller
      // can retry, then re-throw.
      shaka.polyfill.MCapEncryptionScheme.probePromise_ = null;
      resolveProbe();
      throw error;
    }

    // If the config is not supported, we don't need to try anything else.
    if (!capabilities.supported) {
      resolveProbe();
      return capabilities;
    }

    if (!requestedConfiguration.keySystemConfiguration) {
      // This was not a query regarding encrypted content.  The results are
      // valid, but won't tell us anything about native support for
      // encryptionScheme.  Just return the results.
      resolveProbe();
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

      resolveProbe();
      // Return the results, which are completely valid.
      return capabilities;
    }

    // If we land here, either the browser does not support the
    // encryptionScheme field, or the browser does not support EME-related
    // fields in MCap _at all_.

    // First, install a patch to check the mediaKeySystemAccess or
    // encryptionScheme field in future calls.
    shaka.log.debug(logPrefix, 'No native encryptionScheme support found. ' +
        'Patching encryptionScheme support.');

    navigator.mediaCapabilities.decodingInfo =
        shaka.polyfill.MCapEncryptionScheme.polyfillDecodingInfo_;

    // Unblock concurrent callers before continuing; they will now route
    // through polyfillDecodingInfo_ with their own arguments.
    resolveProbe();

    // Second, if _none_ of the EME-related fields of MCap are supported, fill
    // them in now before returning the results.
    if (!mediaKeySystemAccess) {
      // Wrap the MKSA in EmeEncryptionSchemePolyfillMediaKeySystemAccess
      // so that getConfiguration() includes the encryptionScheme field,
      // consistent with what polyfillDecodingInfo_ does for subsequent calls.
      const keySystemAccess =
          await shaka.polyfill.MCapEncryptionScheme.getMediaKeySystemAccess_(
              requestedConfiguration);
      capabilities.keySystemAccess =
          shaka.polyfill.MCapEncryptionScheme.wrapKeySystemAccess_(
              keySystemAccess, requestedConfiguration);
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
      const keySystemAccess =
          await shaka.polyfill.MCapEncryptionScheme.getMediaKeySystemAccess_(
              requestedConfiguration);
      capabilities.keySystemAccess =
          shaka.polyfill.MCapEncryptionScheme.wrapKeySystemAccess_(
              keySystemAccess, requestedConfiguration);
    }

    return capabilities;
  }

  /**
   * Wraps a MediaKeySystemAccess in
   * EmeEncryptionSchemePolyfillMediaKeySystemAccess, extracting the
   * encryptionScheme values from the requested configuration.
   *
   * Centralises the wrapping logic that was previously duplicated between
   * probeDecodingInfo_ and polyfillDecodingInfo_.
   *
   * @param {!MediaKeySystemAccess} keySystemAccess
   * @param {!MediaDecodingConfiguration} requestedConfiguration
   * @return {!shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess}
   * @private
   */
  static wrapKeySystemAccess_(keySystemAccess, requestedConfiguration) {
    const ksConfig = requestedConfiguration.keySystemConfiguration;
    const videoScheme =
        (ksConfig && ksConfig.video && ksConfig.video.encryptionScheme) || null;
    const audioScheme =
        (ksConfig && ksConfig.audio && ksConfig.audio.encryptionScheme) || null;
    return new shaka.polyfill.EmeEncryptionSchemePolyfillMediaKeySystemAccess(
        keySystemAccess, videoScheme, audioScheme);
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
 * A Promise used to serialise concurrent calls to probeDecodingInfo_.  Set to
 * a pending Promise while a probe is in flight; resolves (never rejects) once
 * navigator.mediaCapabilities.decodingInfo has been replaced.  Reset to null
 * if the probe call itself throws, so the next caller can retry.
 *
 * @type {Promise<void>|null}
 * @private
 */
shaka.polyfill.MCapEncryptionScheme.probePromise_ = null;

// Install at a low priority so that other EME polyfills go first.
shaka.polyfill.register(shaka.polyfill.MCapEncryptionScheme.install, -2);
