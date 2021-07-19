/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.MediaCapabilities');

goog.require('shaka.log');
goog.require('shaka.polyfill');
goog.require('shaka.util.Platform');


/**
 * @summary A polyfill to provide navigator.mediaCapabilities on all browsers.
 * This is necessary for Tizen 3, Xbox One and possibly others we have yet to
 * discover.
 */
shaka.polyfill.MediaCapabilities = class {
  /**
   * Install the polyfill if needed.
   */
  static install() {
    shaka.log.debug('MediaCapabilities: install');

    // Since MediaCapabilities is not fully supported on Chromecast yet, we
    // should always install polyfill for Chromecast.
    // TODO: re-evaluate MediaCapabilities in the future versions of Chromecast.
    if (!shaka.util.Platform.isChromecast() && navigator.mediaCapabilities) {
      shaka.log.debug(
          'MediaCapabilities: Native mediaCapabilities support found.');
      return;
    } else if (!window.MediaSource) {
      shaka.log.debug(
          'MediaSource must be available to install mediaCapabilities ',
          'polyfill.');
      return;
    }

    if (!navigator.mediaCapabilities) {
      navigator.mediaCapabilities = /** @type {!MediaCapabilities} */ ({});
    }
    navigator.mediaCapabilities.decodingInfo =
        shaka.polyfill.MediaCapabilities.decodingInfo_;
  }

  /**
   * @param {!MediaDecodingConfiguration} mediaDecodingConfig
   * @return {!Promise.<!MediaCapabilitiesDecodingInfo>}
   * @private
   */
  static async decodingInfo_(mediaDecodingConfig) {
    const res = {
      supported: false,
      powerEfficient: true,
      smooth: true,
      keySystemAccess: null,
      configuration: mediaDecodingConfig,
    };

    if (!mediaDecodingConfig) {
      return res;
    }

    // Use 'MediaSource.isTypeSupported' to check if the stream is supported.
    if (mediaDecodingConfig['video']) {
      const contentType = mediaDecodingConfig['video'].contentType;
      const isSupported = MediaSource.isTypeSupported(contentType);
      if (!isSupported) {
        return res;
      }
    }

    if (mediaDecodingConfig['audio']) {
      const contentType = mediaDecodingConfig['audio'].contentType;
      const isSupported = MediaSource.isTypeSupported(contentType);
      if (!isSupported) {
        return res;
      }
    }

    if (!mediaDecodingConfig.keySystemConfiguration) {
      // The variant is supported if it's unencrypted.
      res.supported = true;
      return Promise.resolve(res);
    } else {
      // Get the MediaKeySystemAccess for the key system.
      // Convert the MediaDecodingConfiguration object to a
      // MediaKeySystemConfiguration object.

      /** @type {MediaCapabilitiesKeySystemConfiguration} */
      const mediaCapkeySystemConfig =
          mediaDecodingConfig.keySystemConfiguration;
      const audioCapabilities = [];
      const videoCapabilities = [];

      if (mediaCapkeySystemConfig.audio) {
        const capability = {
          robustness: mediaCapkeySystemConfig.audio.robustness || '',
          contentType: mediaDecodingConfig.audio.contentType,
        };
        audioCapabilities.push(capability);
      }

      if (mediaCapkeySystemConfig.video) {
        const capability = {
          robustness: mediaCapkeySystemConfig.video.robustness || '',
          contentType: mediaDecodingConfig.video.contentType,
        };
        videoCapabilities.push(capability);
      }

      /** @type {MediaKeySystemConfiguration} */
      const mediaKeySystemConfig = {
        initDataTypes: [mediaCapkeySystemConfig.initDataType],
        distinctiveIdentifier: mediaCapkeySystemConfig.distinctiveIdentifier,
        persistentState: mediaCapkeySystemConfig.persistentState,
        sessionTypes: mediaCapkeySystemConfig.sessionTypes,
      };

      // Only add the audio video capablities if they have valid data.
      // Otherwise the query will fail.
      if (audioCapabilities.length) {
        mediaKeySystemConfig.audioCapabilities = audioCapabilities;
      }
      if (videoCapabilities.length) {
        mediaKeySystemConfig.videoCapabilities = videoCapabilities;
      }

      let keySystemAccess;
      try {
        keySystemAccess = await navigator.requestMediaKeySystemAccess(
            mediaCapkeySystemConfig.keySystem, [mediaKeySystemConfig]);
      } catch (e) {
        shaka.log.info('navigator.requestMediaKeySystemAccess failed.');
      }

      if (keySystemAccess) {
        res.supported = true;
        res.keySystemAccess = keySystemAccess;
      }
    }

    return res;
  }
};

// Install at a lower priority than MediaSource polyfill, so that we have
// MediaSource available first.
shaka.polyfill.register(shaka.polyfill.MediaCapabilities.install, -1);
