/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.MediaCapabilities');

goog.require('shaka.log');
goog.require('shaka.media.Capabilities');
goog.require('shaka.polyfill');
goog.require('shaka.util.Platform');


/**
 * @summary A polyfill to provide navigator.mediaCapabilities on all browsers.
 * This is necessary for Tizen 3, Xbox One and possibly others we have yet to
 * discover.
 * @export
 */
shaka.polyfill.MediaCapabilities = class {
  /**
   * Install the polyfill if needed.
   * @suppress {const}
   * @export
   */
  static install() {
    // Since MediaCapabilities implementation is buggy on the Chromecast
    // platform (see https://github.com/shaka-project/shaka-player/issues/4569),
    // we should always install polyfills on all Chromecast models.
    // TODO: re-evaluate MediaCapabilities in the future versions of Chromecast.
    // Since MediaCapabilities implementation is buggy in Apple browsers, we
    // should always install polyfill for Apple browsers.
    // See: https://github.com/shaka-project/shaka-player/issues/3530
    // TODO: re-evaluate MediaCapabilities in the future versions of Apple
    // Browsers.
    // Since MediaCapabilities implementation is buggy in PS5 browsers, we
    // should always install polyfill for PS5 browsers.
    // See: https://github.com/shaka-project/shaka-player/issues/3582
    // TODO: re-evaluate MediaCapabilities in the future versions of PS5
    // Browsers.
    // Since MediaCapabilities implementation does not exist in PS4 browsers, we
    // should always install polyfill.
    // Since MediaCapabilities implementation is buggy in Tizen browsers, we
    // should always install polyfill for Tizen browsers.
    // Since MediaCapabilities implementation is buggy in WebOS browsers, we
    // should always install polyfill for WebOS browsers.
    // Since MediaCapabilities implementation is buggy in EOS browsers, we
    // should always install polyfill for EOS browsers.
    // Since MediaCapabilities implementation is buggy in Hisense browsers, we
    // should always install polyfill for Hisense browsers.
    let canUseNativeMCap = true;
    if (shaka.util.Platform.isApple() ||
        shaka.util.Platform.isPS5() ||
        shaka.util.Platform.isPS4() ||
        shaka.util.Platform.isWebOS() ||
        shaka.util.Platform.isTizen() ||
        shaka.util.Platform.isChromecast() ||
        shaka.util.Platform.isEOS() ||
        shaka.util.Platform.isHisense()) {
      canUseNativeMCap = false;
    }
    if (canUseNativeMCap && navigator.mediaCapabilities) {
      shaka.log.info(
          'MediaCapabilities: Native mediaCapabilities support found.');
      return;
    }

    shaka.log.info('MediaCapabilities: install');

    if (!navigator.mediaCapabilities) {
      navigator.mediaCapabilities = /** @type {!MediaCapabilities} */ ({});
    }

    // Keep the patched MediaCapabilities object from being garbage-collected in
    // Safari.
    // See https://github.com/shaka-project/shaka-player/issues/3696#issuecomment-1009472718
    shaka.polyfill.MediaCapabilities.originalMcap =
        navigator.mediaCapabilities;

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

    const videoConfig = mediaDecodingConfig['video'];
    const audioConfig = mediaDecodingConfig['audio'];

    const Capabilities = shaka.media.Capabilities;

    if (mediaDecodingConfig.type == 'media-source') {
      if (!shaka.util.Platform.supportsMediaSource()) {
        return res;
      }
      // Use 'shaka.media.Capabilities.isTypeSupported'to check if
      // the stream is supported.
      // Cast platforms will additionally check canDisplayType(), which
      // accepts extended MIME type parameters.
      // See: https://github.com/shaka-project/shaka-player/issues/4726
      if (videoConfig) {
        let isSupported;
        if (shaka.util.Platform.isChromecast()) {
          isSupported =
              shaka.polyfill.MediaCapabilities.canCastDisplayType_(videoConfig);
        } else if (shaka.util.Platform.isTizen()) {
          let extendedType = videoConfig.contentType;
          if (videoConfig.width && videoConfig.height) {
            extendedType += `; width=${videoConfig.width}`;
            extendedType += `; height=${videoConfig.height}`;
          }
          if (videoConfig.framerate) {
            extendedType += `; framerate=${videoConfig.framerate}`;
          }
          if (videoConfig.bitrate) {
            extendedType += `; bitrate=${videoConfig.bitrate}`;
          }
          isSupported = Capabilities.isTypeSupported(extendedType);
        } else {
          isSupported = Capabilities.isTypeSupported(videoConfig.contentType);
        }
        if (!isSupported) {
          return res;
        }
      }

      if (audioConfig) {
        const contentType = audioConfig.contentType;
        const isSupported = Capabilities.isTypeSupported(contentType);
        if (!isSupported) {
          return res;
        }
      }
    } else if (mediaDecodingConfig.type == 'file') {
      if (videoConfig) {
        const contentType = videoConfig.contentType;
        const isSupported = shaka.util.Platform.supportsMediaType(contentType);
        if (!isSupported) {
          return res;
        }
      }

      if (audioConfig) {
        const contentType = audioConfig.contentType;
        const isSupported = shaka.util.Platform.supportsMediaType(contentType);
        if (!isSupported) {
          return res;
        }
      }
    } else {
      // Otherwise not supported.
      return res;
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

      // Only add the audio video capabilities if they have valid data.
      // Otherwise the query will fail.
      if (audioCapabilities.length) {
        mediaKeySystemConfig.audioCapabilities = audioCapabilities;
      }
      if (videoCapabilities.length) {
        mediaKeySystemConfig.videoCapabilities = videoCapabilities;
      }

      const cacheKey = shaka.polyfill.MediaCapabilities
          .generateKeySystemCacheKey_(
              mediaDecodingConfig.video ?
                  mediaDecodingConfig.video.contentType : '',
              mediaDecodingConfig.audio ?
                  mediaDecodingConfig.audio.contentType : '',
              mediaDecodingConfig.keySystemConfiguration.keySystem);

      let keySystemAccess;
      try {
        if (cacheKey in shaka.polyfill.MediaCapabilities
            .memoizedMediaKeySystemAccessRequests_) {
          keySystemAccess = shaka.polyfill.MediaCapabilities
              .memoizedMediaKeySystemAccessRequests_[cacheKey];
        } else {
          keySystemAccess = await navigator.requestMediaKeySystemAccess(
              mediaCapkeySystemConfig.keySystem, [mediaKeySystemConfig]);
          shaka.polyfill.MediaCapabilities
              .memoizedMediaKeySystemAccessRequests_[cacheKey] =
                keySystemAccess;
        }
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

  /**
   * Checks if the given media parameters of the video or audio streams are
   * supported by the Cast platform.
   * @param {!VideoConfiguration} videoConfig The 'video' field of the
   *     MediaDecodingConfiguration.
   * @return {boolean} `true` when the stream can be displayed on a Cast device.
   * @private
   */
  static canCastDisplayType_(videoConfig) {
    if (!(window.cast &&
        cast.__platform__ && cast.__platform__.canDisplayType)) {
      shaka.log.warning('Expected cast APIs to be available! Falling back to ' +
          'shaka.media.Capabilities.isTypeSupported() for type support.');
      return shaka.media.Capabilities.isTypeSupported(videoConfig.contentType);
    }

    let displayType = videoConfig.contentType;
    if (videoConfig.width && videoConfig.height) {
      displayType +=
          `; width=${videoConfig.width}; height=${videoConfig.height}`;
    }
    if (videoConfig.framerate) {
      displayType += `; framerate=${videoConfig.framerate}`;
    }
    if (videoConfig.transferFunction === 'pq') {
      // A "PQ" transfer function indicates this is an HDR-capable stream;
      // "smpte2084" is the published standard. We need to inform the platform
      // this query is specifically for HDR.
      displayType += '; eotf=smpte2084';
    }
    return cast.__platform__.canDisplayType(displayType);
  }

  /**
   * A method for generating a key for the MediaKeySystemAccessRequests cache.
   *
   * @param {!string} videoCodec
   * @param {!string} audioCodec
   * @param {!string} keySystem
   * @return {!string}
   * @private
   */
  static generateKeySystemCacheKey_(videoCodec, audioCodec, keySystem) {
    return `${videoCodec}#${audioCodec}#${keySystem}`;
  }
};

/**
 * A copy of the MediaCapabilities instance, to prevent Safari from
 * garbage-collecting the polyfilled method on it. We make it public and export
 * it to ensure that it is not stripped out by the compiler.
 *
 * @type {MediaCapabilities}
 * @export
 */
shaka.polyfill.MediaCapabilities.originalMcap = null;

/**
 * A cache that stores the MediaKeySystemAccess result of calling
 * `navigator.requestMediaKeySystemAccess` by a key combination of
 * video/audio codec and key system string.
 *
 * @type {(Object<(!string), (!MediaKeySystemAccess)>)}
 * @export
 */
shaka.polyfill.MediaCapabilities.memoizedMediaKeySystemAccessRequests_ = {};

// Install at a lower priority than MediaSource polyfill, so that we have
// MediaSource available first.
shaka.polyfill.register(shaka.polyfill.MediaCapabilities.install, -1);
