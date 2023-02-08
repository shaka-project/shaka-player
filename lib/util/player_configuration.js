/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.PlayerConfiguration');

goog.require('goog.asserts');
goog.require('shaka.abr.SimpleAbrManager');
goog.require('shaka.config.AutoShowText');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.FairPlayUtils');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.Platform');


/**
 * @final
 * @export
 */
shaka.util.PlayerConfiguration = class {
  /**
   * @return {shaka.extern.PlayerConfiguration}
   * @export
   */
  static createDefault() {
    // This is a relatively safe default in the absence of clues from the
    // browser.  For slower connections, the default estimate may be too high.
    const bandwidthEstimate = 1e6; // 1Mbps

    let abrMaxHeight = Infinity;

    // Some browsers implement the Network Information API, which allows
    // retrieving information about a user's network connection.
    if (navigator.connection) {
      // If the user has checked a box in the browser to ask it to use less
      // data, the browser will expose this intent via connection.saveData.
      // When that is true, we will default the max ABR height to 360p. Apps
      // can override this if they wish.
      //
      // The decision to use 360p was somewhat arbitrary. We needed a default
      // limit, and rather than restrict to a certain bandwidth, we decided to
      // restrict resolution. This will implicitly restrict bandwidth and
      // therefore save data. We (Shaka+Chrome) judged that:
      //   - HD would be inappropriate
      //   - If a user is asking their browser to save data, 360p it reasonable
      //   - 360p would not look terrible on small mobile device screen
      // We also found that:
      //   - YouTube's website on mobile defaults to 360p (as of 2018)
      //   - iPhone 6, in portrait mode, has a physical resolution big enough
      //     for 360p widescreen, but a little smaller than 480p widescreen
      //     (https://apple.co/2yze4es)
      // If the content's lowest resolution is above 360p, AbrManager will use
      // the lowest resolution.
      if (navigator.connection.saveData) {
        abrMaxHeight = 360;
      }
    }

    const drm = {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      // These will all be verified by special cases in mergeConfigObjects_():
      servers: {},    // key is arbitrary key system ID, value must be string
      clearKeys: {},  // key is arbitrary key system ID, value must be string
      advanced: {},    // key is arbitrary key system ID, value is a record type
      delayLicenseRequestUntilPlayed: false,
      initDataTransform: (initData, initDataType, drmInfo) => {
        const keySystem = drmInfo.keySystem;
        if (keySystem == 'com.apple.fps.1_0' && initDataType == 'skd') {
          const cert = drmInfo.serverCertificate;
          const contentId =
              shaka.util.FairPlayUtils.defaultGetContentId(initData);
          initData = shaka.util.FairPlayUtils.initDataTransform(
              initData, contentId, cert);
        }
        return initData;
      },
      logLicenseExchange: false,
      updateExpirationTime: 1,
      preferredKeySystems: [],
      keySystemsMapping: {},
      // The Xbox One browser does not detect DRM key changes signalled by a
      // change in the PSSH in media segments. We need to parse PSSH from media
      // segments to detect key changes.
      parseInbandPsshEnabled: shaka.util.Platform.isXboxOne(),
      minHdcpVersion: '',
    };

    let supportsSequenceMode = true;
    if (shaka.util.Platform.isTizen3() ||
        shaka.util.Platform.isTizen2() ||
        shaka.util.Platform.isWebOS3() ||
        shaka.util.Platform.isPS4()) {
      supportsSequenceMode = false;
    }

    const manifest = {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      availabilityWindowOverride: NaN,
      disableAudio: false,
      disableVideo: false,
      disableText: false,
      disableThumbnails: false,
      defaultPresentationDelay: 0,
      segmentRelativeVttTiming: false,
      dash: {
        clockSyncUri: '',
        ignoreDrmInfo: false,
        disableXlinkProcessing: false,
        xlinkFailGracefully: false,
        ignoreMinBufferTime: false,
        autoCorrectDrift: true,
        initialSegmentLimit: 1000,
        ignoreSuggestedPresentationDelay: false,
        ignoreEmptyAdaptationSet: false,
        ignoreMaxSegmentDuration: false,
        keySystemsByURI: {
          'urn:uuid:1077efec-c0b2-4d02-ace3-3c1e52e2fb4b':
            'org.w3.clearkey',
          'urn:uuid:e2719d58-a985-b3c9-781a-b030af78d30e':
            'org.w3.clearkey',
          'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed':
            'com.widevine.alpha',
          'urn:uuid:9a04f079-9840-4286-ab92-e65be0885f95':
            'com.microsoft.playready',
          'urn:uuid:79f0049a-4098-8642-ab92-e65be0885f95':
            'com.microsoft.playready',
          'urn:uuid:f239e769-efa3-4850-9c16-a903c6932efb':
            'com.adobe.primetime',
        },
        manifestPreprocessor: (element) => {
          return shaka.util.ConfigUtils.referenceParametersAndReturn(
              [element],
              element);
        },
        sequenceMode: false,
      },
      hls: {
        ignoreTextStreamFailures: false,
        ignoreImageStreamFailures: false,
        defaultAudioCodec: 'mp4a.40.2',
        defaultVideoCodec: 'avc1.42E01E',
        ignoreManifestProgramDateTime: false,
        mediaPlaylistFullMimeType:
            'video/mp2t; codecs="avc1.42E01E, mp4a.40.2"',
        useSafariBehaviorForLive: true,
        liveSegmentsDelay: 3,
        sequenceMode: supportsSequenceMode,
      },
    };

    const streaming = {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      // Need some operation in the callback or else closure may remove calls
      // to the function as it would be a no-op.  The operation can't just be a
      // log message, because those are stripped in the compiled build.
      failureCallback: (error) => {
        shaka.log.error('Unhandled streaming error', error);
        return shaka.util.ConfigUtils.referenceParametersAndReturn(
            [error],
            undefined);
      },
      // When low latency streaming is enabled, rebufferingGoal will default to
      // 0.01 if not specified.
      rebufferingGoal: 2,
      bufferingGoal: 10,
      bufferBehind: 30,
      ignoreTextStreamFailures: false,
      alwaysStreamText: false,
      startAtSegmentBoundary: false,
      gapDetectionThreshold: 0.5,
      durationBackoff: 1,
      // Offset by 5 seconds since Chromecast takes a few seconds to start
      // playing after a seek, even when buffered.
      safeSeekOffset: 5,
      stallEnabled: true,
      stallThreshold: 1 /* seconds */,
      stallSkip: 0.1 /* seconds */,
      useNativeHlsOnSafari: true,
      // If we are within 2 seconds of the start of a live segment, fetch the
      // previous one.  This allows for segment drift, but won't download an
      // extra segment if we aren't close to the start.
      // When low latency streaming is enabled,  inaccurateManifestTolerance
      // will default to 0 if not specified.
      inaccurateManifestTolerance: 2,
      lowLatencyMode: false,
      autoLowLatencyMode: false,
      forceHTTPS: false,
      preferNativeHls: false,
      updateIntervalSeconds: 1,
      dispatchAllEmsgBoxes: false,
      observeQualityChanges: false,
      maxDisabledTime: 30,
      parsePrftBox: false,
      segmentPrefetchLimit: 0,
    };

    // WebOS, Tizen, and Chromecast have long hardware pipelines that respond
    // slowly to seeking.  Therefore we should not seek when we detect a stall
    // on one of these platforms.  Instead, default stallSkip to 0 to force the
    // stall detector to pause and play instead.
    if (shaka.util.Platform.isWebOS() ||
        shaka.util.Platform.isTizen() ||
        shaka.util.Platform.isChromecast()) {
      streaming.stallSkip = 0;
    }

    const offline = {
      // We need to set this to a throw-away implementation for now as our
      // default implementation will need to reference other fields in the
      // config. We will set it to our intended implementation after we have
      // the top-level object created.
      // eslint-disable-next-line require-await
      trackSelectionCallback: async (tracks) => tracks,

      downloadSizeCallback: async (sizeEstimate) => {
        if (navigator.storage && navigator.storage.estimate) {
          const estimate = await navigator.storage.estimate();
          // Limit to 95% of quota.
          return estimate.usage + sizeEstimate < estimate.quota * 0.95;
        } else {
          return true;
        }
      },

      // Need some operation in the callback or else closure may remove calls
      // to the function as it would be a no-op.  The operation can't just be a
      // log message, because those are stripped in the compiled build.
      progressCallback: (content, progress) => {
        return shaka.util.ConfigUtils.referenceParametersAndReturn(
            [content, progress],
            undefined);
      },

      // By default we use persistent licenses as forces errors to surface if
      // a platform does not support offline licenses rather than causing
      // unexpected behaviours when someone tries to plays downloaded content
      // without a persistent license.
      usePersistentLicense: true,

      numberOfParallelDownloads: 5,
    };

    const abr = {
      enabled: true,
      useNetworkInformation: true,
      defaultBandwidthEstimate: bandwidthEstimate,
      switchInterval: 8,
      bandwidthUpgradeTarget: 0.85,
      bandwidthDowngradeTarget: 0.95,
      restrictions: {
        minWidth: 0,
        maxWidth: Infinity,
        minHeight: 0,
        maxHeight: abrMaxHeight,
        minPixels: 0,
        maxPixels: Infinity,
        minFrameRate: 0,
        maxFrameRate: Infinity,
        minBandwidth: 0,
        maxBandwidth: Infinity,
      },
      advanced: {
        minTotalBytes: 128e3,
        minBytes: 16e3,
        fastHalfLife: 2,
        slowHalfLife: 5,
      },
      restrictToElementSize: false,
      restrictToScreenSize: false,
      ignoreDevicePixelRatio: false,
    };

    const cmcd = {
      enabled: false,
      sessionId: '',
      contentId: '',
      useHeaders: false,
    };

    const lcevc = {
      enabled: false,
      dynamicPerformanceScaling: true,
      logLevel: 0,
      drawLogo: false,
    };

    const mediaSource = {
      sourceBufferExtraFeatures: '',
      forceTransmux: false,
    };

    const AutoShowText = shaka.config.AutoShowText;

    /** @type {shaka.extern.PlayerConfiguration} */
    const config = {
      drm: drm,
      manifest: manifest,
      streaming: streaming,
      mediaSource: mediaSource,
      offline: offline,
      abrFactory: () => new shaka.abr.SimpleAbrManager(),
      abr: abr,
      autoShowText: AutoShowText.IF_SUBTITLES_MAY_BE_NEEDED,
      preferredAudioLanguage: '',
      preferredAudioLabel: '',
      preferredTextLanguage: '',
      preferredVariantRole: '',
      preferredTextRole: '',
      preferredAudioChannelCount: 2,
      preferredVideoCodecs: [],
      preferredAudioCodecs: [],
      preferForcedSubs: false,
      preferredDecodingAttributes: [],
      restrictions: {
        minWidth: 0,
        maxWidth: Infinity,
        minHeight: 0,
        maxHeight: Infinity,
        minPixels: 0,
        maxPixels: Infinity,
        minFrameRate: 0,
        maxFrameRate: Infinity,
        minBandwidth: 0,
        maxBandwidth: Infinity,
      },
      playRangeStart: 0,
      playRangeEnd: Infinity,
      textDisplayFactory: () => null,
      cmcd: cmcd,
      lcevc: lcevc,
    };

    // Add this callback so that we can reference the preferred audio language
    // through the config object so that if it gets updated, we have the
    // updated value.
    // eslint-disable-next-line require-await
    offline.trackSelectionCallback = async (tracks) => {
      return shaka.util.PlayerConfiguration.defaultTrackSelect(
          tracks, config.preferredAudioLanguage);
    };

    return config;
  }

  /**
   * Merges the given configuration changes into the given destination.  This
   * uses the default Player configurations as the template.
   *
   * @param {shaka.extern.PlayerConfiguration} destination
   * @param {!Object} updates
   * @param {shaka.extern.PlayerConfiguration=} template
   * @return {boolean}
   * @export
   */
  static mergeConfigObjects(destination, updates, template) {
    const overrides = {
      '.drm.keySystemsMapping': '',
      '.drm.servers': '',
      '.drm.clearKeys': '',
      '.drm.advanced': {
        distinctiveIdentifierRequired: false,
        persistentStateRequired: false,
        videoRobustness: '',
        audioRobustness: '',
        sessionType: '',
        serverCertificate: new Uint8Array(0),
        serverCertificateUri: '',
        individualizationServer: '',
      },
    };
    return shaka.util.ConfigUtils.mergeConfigObjects(
        destination, updates,
        template || shaka.util.PlayerConfiguration.createDefault(), overrides,
        '');
  }

  /**
   * @param {!Array.<shaka.extern.Track>} tracks
   * @param {string} preferredAudioLanguage
   * @return {!Array.<shaka.extern.Track>}
   */
  static defaultTrackSelect(tracks, preferredAudioLanguage) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const LanguageUtils = shaka.util.LanguageUtils;

    /** @type {!Array.<shaka.extern.Track>} */
    const allVariants = tracks.filter((track) => track.type == 'variant');

    /** @type {!Array.<shaka.extern.Track>} */
    let selectedVariants = [];

    // Find the locale that best matches our preferred audio locale.
    const closestLocale = LanguageUtils.findClosestLocale(
        preferredAudioLanguage,
        allVariants.map((variant) => variant.language));
    // If we found a locale that was close to our preference, then only use
    // variants that use that locale.
    if (closestLocale) {
      selectedVariants = allVariants.filter((variant) => {
        const locale = LanguageUtils.normalize(variant.language);
        return locale == closestLocale;
      });
    }

    // If we failed to get a language match, go with primary.
    if (selectedVariants.length == 0) {
      selectedVariants = allVariants.filter((variant) => {
        return variant.primary;
      });
    }

    // Otherwise, there is no good way to choose the language, so we don't
    // choose a language at all.
    if (selectedVariants.length == 0) {
      // Issue a warning, but only if the content has multiple languages.
      // Otherwise, this warning would just be noise.
      const languages = new Set(allVariants.map((track) => {
        return track.language;
      }));

      if (languages.size > 1) {
        shaka.log.warning('Could not choose a good audio track based on ' +
                          'language preferences or primary tracks.  An ' +
                          'arbitrary language will be stored!');
      }

      // Default back to all variants.
      selectedVariants = allVariants;
    }

    // From previously selected variants, choose the SD ones (height <= 480).
    const tracksByHeight = selectedVariants.filter((track) => {
      return track.height && track.height <= 480;
    });

    // If variants don't have video or no video with height <= 480 was
    // found, proceed with the previously selected tracks.
    if (tracksByHeight.length) {
      // Sort by resolution, then select all variants which match the height
      // of the highest SD res.  There may be multiple audio bitrates for the
      // same video resolution.
      tracksByHeight.sort((a, b) => {
        // The items in this list have already been screened for height, but the
        // compiler doesn't know that.
        goog.asserts.assert(a.height != null, 'Null height');
        goog.asserts.assert(b.height != null, 'Null height');

        return b.height - a.height;
      });
      selectedVariants = tracksByHeight.filter((track) => {
        return track.height == tracksByHeight[0].height;
      });
    }

    /** @type {!Array.<shaka.extern.Track>} */
    const selectedTracks = [];

    // If there are multiple matches at different audio bitrates, select the
    // middle bandwidth one.
    if (selectedVariants.length) {
      const middleIndex = Math.floor(selectedVariants.length / 2);
      selectedVariants.sort((a, b) => a.bandwidth - b.bandwidth);
      selectedTracks.push(selectedVariants[middleIndex]);
    }

    // Since this default callback is used primarily by our own demo app and by
    // app developers who haven't thought about which tracks they want, we
    // should select all image/text tracks, regardless of language.  This makes
    // for a better demo for us, and does not rely on user preferences for the
    // unconfigured app.
    for (const track of tracks) {
      if (track.type == ContentType.TEXT || track.type == ContentType.IMAGE) {
        selectedTracks.push(track);
      }
    }

    return selectedTracks;
  }
};
