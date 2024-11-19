/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.MediaCapabilities');

goog.require('shaka.log');
goog.require('shaka.media.Capabilities');
goog.require('shaka.polyfill');
goog.require('shaka.util.DrmUtils');
goog.require('shaka.util.MimeUtils');
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
    // We can enable MediaCapabilities in Android and Fuchsia devices, but not
    // in Linux devices because the implementation is buggy.
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
    if (shaka.util.Platform.isChromecast() &&
        !shaka.util.Platform.isAndroidCastDevice() &&
        !shaka.util.Platform.isFuchsiaCastDevice()) {
      canUseNativeMCap = false;
    }
    if (shaka.util.Platform.isApple() ||
        shaka.util.Platform.isPS5() ||
        shaka.util.Platform.isPS4() ||
        shaka.util.Platform.isWebOS() ||
        shaka.util.Platform.isTizen() ||
        shaka.util.Platform.isEOS() ||
        shaka.util.Platform.isHisense() ||
        shaka.util.Platform.isComcastX1()) {
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
    /** @type {!MediaCapabilitiesDecodingInfo} */
    const res = {
      supported: false,
      powerEfficient: true,
      smooth: true,
      keySystemAccess: null,
      configuration: mediaDecodingConfig,
    };

    const videoConfig = mediaDecodingConfig['video'];
    const audioConfig = mediaDecodingConfig['audio'];

    if (mediaDecodingConfig.type == 'media-source') {
      if (!shaka.util.Platform.supportsMediaSource()) {
        return res;
      }

      if (videoConfig) {
        const isSupported =
            await shaka.polyfill.MediaCapabilities.checkVideoSupport_(
                videoConfig);
        if (!isSupported) {
          return res;
        }
      }

      if (audioConfig) {
        const isSupported =
            shaka.polyfill.MediaCapabilities.checkAudioSupport_(audioConfig);
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
      return res;
    } else {
      const mcapKeySystemConfig = mediaDecodingConfig.keySystemConfiguration;
      const keySystemAccess =
          await shaka.polyfill.MediaCapabilities.checkDrmSupport_(
              videoConfig, audioConfig, mcapKeySystemConfig);
      if (keySystemAccess) {
        res.supported = true;
        res.keySystemAccess = keySystemAccess;
      }
    }

    return res;
  }

  /**
   * @param {!VideoConfiguration} videoConfig The 'video' field of the
   *   MediaDecodingConfiguration.
   * @return {!Promise<boolean>}
   * @private
   */
  static async checkVideoSupport_(videoConfig) {
    // Use 'shaka.media.Capabilities.isTypeSupported' to check if
    // the stream is supported.
    // Cast platforms will additionally check canDisplayType(), which
    // accepts extended MIME type parameters.
    // See: https://github.com/shaka-project/shaka-player/issues/4726
    if (shaka.util.Platform.isChromecast()) {
      const isSupported =
          await shaka.polyfill.MediaCapabilities.canCastDisplayType_(
              videoConfig);
      return isSupported;
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
      return shaka.media.Capabilities.isTypeSupported(extendedType);
    }
    return shaka.media.Capabilities.isTypeSupported(videoConfig.contentType);
  }

  /**
   * @param {!AudioConfiguration} audioConfig The 'audio' field of the
   *   MediaDecodingConfiguration.
   * @return {boolean}
   * @private
   */
  static checkAudioSupport_(audioConfig) {
    let extendedType = audioConfig.contentType;
    if (shaka.util.Platform.isChromecast() && audioConfig.spatialRendering) {
      extendedType += '; spatialRendering=true';
    }
    return shaka.media.Capabilities.isTypeSupported(extendedType);
  }

  /**
   * @param {VideoConfiguration} videoConfig The 'video' field of the
   *   MediaDecodingConfiguration.
   * @param {AudioConfiguration} audioConfig The 'audio' field of the
   *   MediaDecodingConfiguration.
   * @param {!MediaCapabilitiesKeySystemConfiguration} mcapKeySystemConfig The
   *   'keySystemConfiguration' field of the MediaDecodingConfiguration.
   * @return {Promise<MediaKeySystemAccess>}
   * @private
   */
  static async checkDrmSupport_(videoConfig, audioConfig, mcapKeySystemConfig) {
    const MimeUtils = shaka.util.MimeUtils;
    const audioCapabilities = [];
    const videoCapabilities = [];

    if (mcapKeySystemConfig.audio) {
      const capability = {
        robustness: mcapKeySystemConfig.audio.robustness || '',
        contentType: audioConfig.contentType,
      };

      // Some Tizen devices seem to misreport AC-3 support, but correctly
      // report EC-3 support. So query EC-3 as a fallback for AC-3.
      // See https://github.com/shaka-project/shaka-player/issues/2989 for
      // details.
      if (shaka.util.Platform.isTizen() &&
          audioConfig.contentType.includes('codecs="ac-3"')) {
        capability.contentType = 'audio/mp4; codecs="ec-3"';
      }

      if (mcapKeySystemConfig.audio.encryptionScheme) {
        capability.encryptionScheme =
            mcapKeySystemConfig.audio.encryptionScheme;
      }

      audioCapabilities.push(capability);
    }

    if (mcapKeySystemConfig.video) {
      const capability = {
        robustness: mcapKeySystemConfig.video.robustness || '',
        contentType: videoConfig.contentType,
      };
      if (mcapKeySystemConfig.video.encryptionScheme) {
        capability.encryptionScheme =
            mcapKeySystemConfig.video.encryptionScheme;
      }
      videoCapabilities.push(capability);
    }

    /** @type {MediaKeySystemConfiguration} */
    const mediaKeySystemConfig = {
      initDataTypes: [mcapKeySystemConfig.initDataType],
      distinctiveIdentifier: mcapKeySystemConfig.distinctiveIdentifier,
      persistentState: mcapKeySystemConfig.persistentState,
      sessionTypes: mcapKeySystemConfig.sessionTypes,
    };

    // Only add audio / video capabilities if they have valid data.
    // Otherwise the query will fail.
    if (audioCapabilities.length) {
      mediaKeySystemConfig.audioCapabilities = audioCapabilities;
    }
    if (videoCapabilities.length) {
      mediaKeySystemConfig.videoCapabilities = videoCapabilities;
    }

    const videoMimeType = videoConfig ? videoConfig.contentType : '';
    const audioMimeType = audioConfig ? audioConfig.contentType : '';
    const videoCodec = MimeUtils.getBasicType(videoMimeType) + ';' +
        MimeUtils.getCodecBase(videoMimeType);
    const audioCodec = MimeUtils.getBasicType(audioMimeType) + ';' +
        MimeUtils.getCodecBase(audioMimeType);
    const keySystem = mcapKeySystemConfig.keySystem;

    /** @type {MediaKeySystemAccess} */
    let keySystemAccess = null;
    try {
      if (shaka.util.DrmUtils.hasMediaKeySystemAccess(
          videoCodec, audioCodec, keySystem)) {
        keySystemAccess = shaka.util.DrmUtils.getMediaKeySystemAccess(
            videoCodec, audioCodec, keySystem);
      } else {
        keySystemAccess = await navigator.requestMediaKeySystemAccess(
            mcapKeySystemConfig.keySystem, [mediaKeySystemConfig]);
        shaka.util.DrmUtils.setMediaKeySystemAccess(
            videoCodec, audioCodec, keySystem, keySystemAccess);
      }
    } catch (e) {
      shaka.log.info('navigator.requestMediaKeySystemAccess failed.');
    }

    return keySystemAccess;
  }

  /**
   * Checks if the given media parameters of the video or audio streams are
   * supported by the Cast platform.
   * @param {!VideoConfiguration} videoConfig The 'video' field of the
   *   MediaDecodingConfiguration.
   * @return {!Promise<boolean>} `true` when the stream can be displayed on a
   *   Cast device.
   * @private
   */
  static async canCastDisplayType_(videoConfig) {
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

    // Don't trust Closure types here.  Although transferFunction is string or
    // undefined, we don't want to count on the input type.  A switch statement
    // will, however, differentiate between null and undefined.  So we default
    // to a blank string.
    const transferFunction = videoConfig.transferFunction || '';

    // Based on internal sources.  Googlers, see go/cast-hdr-queries for source.
    switch (transferFunction) {
      // The empty case falls through to SDR.
      case '':
      // These are the only 3 values defined by MCap as of November 2024.
      case 'srgb':
        // https://en.wikipedia.org/wiki/Standard-dynamic-range_video
        // https://en.wikipedia.org/wiki/SRGB
        // https://en.wikipedia.org/wiki/Rec._709
        // This is SDR, standardized in BT 709.
        // The platform recognizes "eotf=bt709", but we can also omit it.
        break;

      case 'pq':
        // https://en.wikipedia.org/wiki/Perceptual_quantizer
        // This HDR transfer function is standardized as SMPTE ST 2084.
        displayType += '; eotf=smpte2084';
        break;

      case 'hlg':
        // https://en.wikipedia.org/wiki/Hybrid_log%E2%80%93gamma
        // This HDR transfer function is standardized as ARIB STD-B67.
        displayType += '; eotf=arib-std-b67';
        break;

      default:
        // An unrecognized transfer function.  Reject this query.
        return false;
    }

    let result = false;
    if (displayType in shaka.polyfill.MediaCapabilities
        .memoizedCanDisplayTypeRequests_) {
      result = shaka.polyfill.MediaCapabilities
          .memoizedCanDisplayTypeRequests_[displayType];
    } else {
      result = await cast.__platform__.canDisplayType(displayType);
      shaka.polyfill.MediaCapabilities
          .memoizedCanDisplayTypeRequests_[displayType] = result;
    }
    return result;
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
 * A cache that stores the canDisplayType result of calling
 * `cast.__platform__.canDisplayType`.
 *
 * @type {(Object<(!string), (!boolean)>)}
 * @export
 */
shaka.polyfill.MediaCapabilities.memoizedCanDisplayTypeRequests_ = {};

// Install at a lower priority than MediaSource polyfill, so that we have
// MediaSource available first.
shaka.polyfill.register(shaka.polyfill.MediaCapabilities.install, -1);
