/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.PlayerConfiguration');

goog.require('goog.asserts');
goog.require('shaka.abr.SimpleAbrManager');
goog.require('shaka.config.AutoShowText');
goog.require('shaka.config.CodecSwitchingStrategy');
goog.require('shaka.config.CrossBoundaryStrategy');
goog.require('shaka.config.RepeatMode');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.drm.DrmUtils');
goog.require('shaka.drm.FairPlay');
goog.require('shaka.log');
goog.require('shaka.media.Capabilities');
goog.require('shaka.media.PreferenceBasedCriteria');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.ConfigUtils');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');


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
    const minBytes = 16e3;

    let abrMaxHeight = Infinity;

    const device = shaka.device.DeviceFactory.getDevice();

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
      persistentSessionOnlinePlayback: false,
      persistentSessionsMetadata: [],
      initDataTransform: (initData, initDataType, drmInfo) => {
        if (shaka.drm.DrmUtils.isMediaKeysPolyfilled('apple') &&
            initDataType == 'skd') {
          const cert = drmInfo.serverCertificate;
          const contentId =
              shaka.drm.FairPlay.defaultGetContentId(initData);
          initData = shaka.drm.FairPlay.initDataTransform(
              initData, contentId, cert);
        }
        return initData;
      },
      logLicenseExchange: false,
      updateExpirationTime: 1,
      preferredKeySystems: [],
      keySystemsMapping: {},
      parseInbandPsshEnabled: false,
      minHdcpVersion: '',
      ignoreDuplicateInitData: true,
      defaultAudioRobustnessForWidevine: 'SW_SECURE_CRYPTO',
      defaultVideoRobustnessForWidevine: 'SW_SECURE_DECODE',
    };

    let codecSwitchingStrategy = shaka.config.CodecSwitchingStrategy.RELOAD;
    if (shaka.media.Capabilities.isChangeTypeSupported() &&
        device.supportsSmoothCodecSwitching()) {
      codecSwitchingStrategy = shaka.config.CodecSwitchingStrategy.SMOOTH;
    }

    const manifest = {
      retryParameters: shaka.net.NetworkingEngine.defaultRetryParameters(),
      availabilityWindowOverride: NaN,
      disableAudio: false,
      disableVideo: false,
      disableText: false,
      disableThumbnails: false,
      disableIFrames: false,
      defaultPresentationDelay: 0,
      segmentRelativeVttTiming: false,
      raiseFatalErrorOnManifestUpdateRequestFailure: false,
      continueLoadingWhenPaused: true,
      ignoreSupplementalCodecs: false,
      updatePeriod: -1,
      ignoreDrmInfo: false,
      enableAudioGroups: true,
      dash: {
        clockSyncUri: '',
        disableXlinkProcessing: true,
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
          'urn:uuid:94ce86fb-07ff-4f43-adb8-93d2fa968ca2':
            'com.apple.fps',
          'urn:uuid:3d5e6d35-9b9a-41e8-b843-dd3c6e72c42c':
            'com.huawei.wiseplay',
        },
        manifestPreprocessor:
            shaka.util.PlayerConfiguration.defaultManifestPreprocessor,
        manifestPreprocessorTXml:
            shaka.util.PlayerConfiguration.defaultManifestPreprocessorTXml,
        sequenceMode: false,
        useStreamOnceInPeriodFlattening: false,
        enableFastSwitching: true,
      },
      hls: {
        ignoreTextStreamFailures: false,
        ignoreImageStreamFailures: false,
        defaultAudioCodec: 'mp4a.40.2',
        defaultVideoCodec: 'avc1.42E01E',
        ignoreManifestProgramDateTime: false,
        ignoreManifestProgramDateTimeForTypes: [],
        mediaPlaylistFullMimeType:
            'video/mp2t; codecs="avc1.42E01E, mp4a.40.2"',
        liveSegmentsDelay: 3,
        sequenceMode: device.supportsSequenceMode(),
        ignoreManifestTimestampsInSegmentsMode: false,
        disableCodecGuessing: false,
        disableClosedCaptionsDetection: false,
        allowLowLatencyByteRangeOptimization: true,
        allowRangeRequestsToGuessMimeType: false,
      },
      mss: {
        manifestPreprocessor:
            shaka.util.PlayerConfiguration.defaultManifestPreprocessor,
        manifestPreprocessorTXml:
            shaka.util.PlayerConfiguration.defaultManifestPreprocessorTXml,
        sequenceMode: false,
        keySystemsBySystemId: {
          '9a04f079-9840-4286-ab92-e65be0885f95':
            'com.microsoft.playready',
          '79f0049a-4098-8642-ab92-e65be0885f95':
            'com.microsoft.playready',
        },
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
      rebufferingGoal: 0,
      bufferingGoal: 10,
      bufferBehind: 30,
      evictionGoal: 1,
      ignoreTextStreamFailures: false,
      alwaysStreamText: false,
      startAtSegmentBoundary: false,
      gapDetectionThreshold: 0.5,
      gapPadding: 0,
      gapJumpTimerTime: 0.25 /* seconds */,
      durationBackoff: 1,
      // Offset by 5 seconds since Chromecast takes a few seconds to start
      // playing after a seek, even when buffered.
      safeSeekOffset: 5,
      safeSeekEndOffset: 0,
      stallEnabled: true,
      stallThreshold: 1 /* seconds */,
      stallSkip: 0.1 /* seconds */,
      useNativeHlsForFairPlay: true,
      // If we are within 2 seconds of the start of a live segment, fetch the
      // previous one.  This allows for segment drift, but won't download an
      // extra segment if we aren't close to the start.
      // When low latency streaming is enabled,  inaccurateManifestTolerance
      // will default to 0 if not specified.
      inaccurateManifestTolerance: 2,
      lowLatencyMode: true,
      preferNativeDash: false,
      preferNativeHls: false,
      updateIntervalSeconds: 1,
      observeQualityChanges: false,
      maxDisabledTime: 30,
      // When low latency streaming is enabled, segmentPrefetchLimit will
      // default to 2 if not specified.
      segmentPrefetchLimit: 1,
      prefetchAudioLanguages: [],
      disableAudioPrefetch: false,
      disableTextPrefetch: false,
      disableVideoPrefetch: false,
      liveSync: {
        enabled: false,
        targetLatency: 0.5,
        targetLatencyTolerance: 0.5,
        maxPlaybackRate: 1.1,
        minPlaybackRate: 0.95,
        panicMode: false,
        panicThreshold: 60,
        dynamicTargetLatency: {
          enabled: false,
          stabilityThreshold: 60,
          rebufferIncrement: 0.5,
          maxAttempts: 10,
          maxLatency: 4,
          minLatency: 1,
        },
      },
      allowMediaSourceRecoveries: true,
      minTimeBetweenRecoveries: 5,
      vodDynamicPlaybackRate: false,
      vodDynamicPlaybackRateLowBufferRate: 0.95,
      vodDynamicPlaybackRateBufferRatio: 0.5,
      preloadNextUrlWindow: 30,
      loadTimeout: 30,
      clearDecodingCache: false,
      dontChooseCodecs: false,
      shouldFixTimestampOffset: false,
      avoidEvictionOnQuotaExceededError: false,
      crossBoundaryStrategy: shaka.config.CrossBoundaryStrategy.KEEP,
      returnToEndOfLiveWindowWhenOutside: false,
    };

    const networking = {
      forceHTTP: false,
      forceHTTPS: false,
      minBytesForProgressEvents: minBytes,
    };

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
        minChannelsCount: 0,
        maxChannelsCount: Infinity,
      },
      advanced: {
        minTotalBytes: 128e3,
        minBytes,
        fastHalfLife: 2,
        slowHalfLife: 5,
      },
      restrictToElementSize: false,
      restrictToScreenSize: false,
      ignoreDevicePixelRatio: false,
      clearBufferSwitch: false,
      safeMarginSwitch: 0,
      cacheLoadThreshold: 5,
      minTimeToSwitch: 0,
      preferNetworkInformationBandwidth: false,
      removeLatencyFromFirstPacketTime: true,
    };

    const cmcd = {
      enabled: false,
      sessionId: '',
      contentId: '',
      rtpSafetyFactor: 5,
      useHeaders: false,
      includeKeys: [],
      version: 1,
      targets: [],
    };

    const cmsd = {
      enabled: true,
      applyMaximumSuggestedBitrate: true,
      estimatedThroughputWeightRatio: 0.5,
    };

    const lcevc = {
      enabled: false,
      dynamicPerformanceScaling: true,
      logLevel: 0,
      drawLogo: false,
      poster: true,
    };

    const mediaSource = {
      codecSwitchingStrategy: codecSwitchingStrategy,
      addExtraFeaturesToSourceBuffer: (mimeType) => {
        return shaka.util.ConfigUtils.referenceParametersAndReturn(
            [mimeType],
            '');
      },
      forceTransmux: false,
      insertFakeEncryptionInInit: true,
      correctEc3Enca: false,
      modifyCueCallback: (cue, uri) => {
        return shaka.util.ConfigUtils.referenceParametersAndReturn(
            [cue, uri],
            undefined);
      },
      dispatchAllEmsgBoxes: false,
      useSourceElements: true,
      durationReductionEmitsUpdateEnd: true,
    };

    const ads = {
      customPlayheadTracker: false,
      skipPlayDetection: false,
      supportsMultipleMediaElements: true,
      disableHLSInterstitial: false,
      disableDASHInterstitial: false,
      allowPreloadOnDomElements: true,
      allowStartInMiddleOfInterstitial: true,
    };

    const textDisplayer = {
      captionsUpdatePeriod: 0.25,
      fontScaleFactor: 1,
    };

    const queue = {
      preloadNextUrlWindow: Infinity,
      preloadPrevItem: true,
      repeatMode: shaka.config.RepeatMode.OFF,
    };

    const AutoShowText = shaka.config.AutoShowText;

    /** @type {shaka.extern.PlayerConfiguration} */
    const config = {
      drm: drm,
      manifest: manifest,
      streaming: streaming,
      networking: networking,
      mediaSource: mediaSource,
      offline: offline,
      abrFactory: () => new shaka.abr.SimpleAbrManager(),
      adaptationSetCriteriaFactory:
          (...args) => new shaka.media.PreferenceBasedCriteria(...args),
      abr: abr,
      autoShowText: AutoShowText.IF_SUBTITLES_MAY_BE_NEEDED,
      preferredAudioLanguage: '',
      preferredAudioLabel: '',
      preferredTextLanguage: '',
      preferredAudioRole: '',
      preferredVideoRole: '',
      preferredTextRole: '',
      preferredAudioChannelCount: 2,
      preferredVideoHdrLevel: 'AUTO',
      preferredVideoLayout: '',
      preferredVideoLabel: '',
      preferredVideoCodecs: [],
      preferredAudioCodecs: [],
      preferredTextFormats: [],
      preferForcedSubs: false,
      preferSpatialAudio: false,
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
        minChannelsCount: 0,
        maxChannelsCount: Infinity,
      },
      playRangeStart: 0,
      playRangeEnd: Infinity,
      textDisplayer: textDisplayer,
      textDisplayFactory: () => null,
      cmcd: cmcd,
      cmsd: cmsd,
      lcevc: lcevc,
      ads: ads,
      ignoreHardwareResolution: false,
      queue: queue,
    };

    // Add this callback so that we can reference the preferred audio language
    // through the config object so that if it gets updated, we have the
    // updated value.
    // eslint-disable-next-line require-await
    offline.trackSelectionCallback = async (tracks) => {
      return shaka.util.PlayerConfiguration.defaultTrackSelect(
          tracks, config.preferredAudioLanguage,
          config.preferredVideoHdrLevel);
    };

    return device.adjustConfig(config);
  }

  /**
   * @return {!Object}
   * @export
   */
  static createDefaultForLL() {
    return {
      streaming: {
        inaccurateManifestTolerance: 0,
        segmentPrefetchLimit: 2,
        updateIntervalSeconds: 0.1,
        maxDisabledTime: 1,
        retryParameters: {
          baseDelay: 100,
        },
      },
      manifest: {
        dash: {
          autoCorrectDrift: false,
        },
        retryParameters: {
          baseDelay: 100,
        },
      },
      drm: {
        retryParameters: {
          baseDelay: 100,
        },
      },
    };
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
        videoRobustness: [],
        audioRobustness: [],
        sessionType: '',
        serverCertificate: new Uint8Array(0),
        serverCertificateUri: '',
        individualizationServer: '',
        headers: {},
      },
    };
    return shaka.util.ConfigUtils.mergeConfigObjects(
        destination, updates,
        template || shaka.util.PlayerConfiguration.createDefault(), overrides,
        '');
  }

  /**
   * @param {!Array<shaka.extern.Track>} tracks
   * @param {string} preferredAudioLanguage
   * @param {string} preferredVideoHdrLevel
   * @return {!Array<shaka.extern.Track>}
   */
  static defaultTrackSelect(
      tracks, preferredAudioLanguage, preferredVideoHdrLevel) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const LanguageUtils = shaka.util.LanguageUtils;

    let hdrLevel = preferredVideoHdrLevel;
    if (hdrLevel == 'AUTO') {
      const someHLG = tracks.some((track) => {
        if (track.hdr && track.hdr == 'HLG') {
          return true;
        }
        return false;
      });
      const device = shaka.device.DeviceFactory.getDevice();
      hdrLevel = device.getHdrLevel(someHLG);
    }

    /** @type {!Array<shaka.extern.Track>} */
    const allVariants = tracks.filter((track) => {
      if (track.type != 'variant') {
        return false;
      }
      if (track.hdr && track.hdr != hdrLevel) {
        return false;
      }
      return true;
    });

    /** @type {!Array<shaka.extern.Track>} */
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

    /** @type {!Array<shaka.extern.Track>} */
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

  /**
   * @param {!Element} element
   * @return {!Element}
   */
  static defaultManifestPreprocessor(element) {
    return shaka.util.ConfigUtils.referenceParametersAndReturn(
        [element],
        element);
  }

  /**
   * @param {!shaka.extern.xml.Node} element
   * @return {!shaka.extern.xml.Node}
   */
  static defaultManifestPreprocessorTXml(element) {
    return shaka.util.ConfigUtils.referenceParametersAndReturn(
        [element],
        element);
  }
};
