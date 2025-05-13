/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.Config');

goog.require('goog.asserts');
goog.require('shakaDemo.BoolInput');
goog.require('shakaDemo.DatalistInput');
goog.require('shakaDemo.InputContainer');
goog.require('shakaDemo.NumberInput');
goog.require('shakaDemo.SelectInput');
goog.require('shakaDemo.TextInput');
goog.requireType('shakaDemo.Input');

/** @type {?shakaDemo.Config} */
let shakaDemoConfig;


/**
 * Shaka Player demo, configuration page layout.
 */
shakaDemo.Config = class {
  /**
   * Register the page configuration.
   */
  static init() {
    const container = shakaDemoMain.getHamburgerMenu();
    shakaDemoConfig = new shakaDemo.Config(container);
  }

  /** @param {!Element} container */
  constructor(container) {
    /** @private {!Element} */
    this.container_ = container;

    /**
     * A list of all sections.
     * @private {!Array<!shakaDemo.InputContainer>}
     */
    this.sections_ = [];

    /**
     * The input object for the control currently being constructed.
     * @private {?shakaDemo.Input}
     */
    this.latestInput_ = null;

    this.reload_();

    // Listen to external config changes (i.e. from hash changes).
    document.addEventListener('shaka-main-config-change', () => {
      // Respond to them by remaking. This is to avoid triggering any config
      // changes based on the config changes.
      this.reloadAndSaveState_();
    });
    document.addEventListener('shaka-main-drawer-state-change', () => {
      this.setContentAvailability_(shakaDemoMain.getIsDrawerOpen());
    });
    this.setContentAvailability_(shakaDemoMain.getIsDrawerOpen());
  }

  /**
   * @param {boolean} availability
   * @private
   */
  setContentAvailability_(availability) {
    if (availability) {
      this.container_.classList.remove('hidden');
    } else {
      this.container_.classList.add('hidden');
    }
  }

  /** @private */
  reload_() {
    shaka.util.Dom.removeAllChildren(this.container_);
    this.sections_ = [];

    this.addMetaSection_();
    this.addLanguageSection_();
    this.addCodecPreferenceSection_();
    this.addAbrSection_();
    this.addOfflineSection_();
    this.addDrmSection_();
    this.addStreamingSection_();
    this.addNetworkingSection_();
    this.addMediaSourceSection_();
    this.addManifestSection_();
    this.addDashManifestSection_();
    this.addHlsManifestSection_();
    this.addMssManifestSection_();
    this.addRetrySection_('manifest', 'Manifest Retry Parameters');
    this.addRestrictionsSection_('', 'Restrictions');
    this.addTextDisplayerSection_();
    this.addCmcdSection_();
    this.addCmsdSection_();
    this.addLcevcSection_();
    this.addAdsSection_();
  }

  /**
   * Remake the contents of the div. Unlike |reload_|, this will also remember
   * which sections were open.
   * @private
   */
  reloadAndSaveState_() {
    const wasOpenArray = this.sections_.map((section) => section.getIsOpen());
    this.reload_();
    for (let i = 0; i < wasOpenArray.length; i++) {
      const wasOpen = wasOpenArray[i];
      const section = this.sections_[i];
      if (wasOpen) {
        section.open();
      }
    }

    // Update the componentHandler, to account for any new MDL elements added.
    componentHandler.upgradeDom();
  }

  /** @private */
  addDrmSection_() {
    const widevineRobustnessLevels = {
      '': '',
      'SW_SECURE_CRYPTO': 'SW_SECURE_CRYPTO',
      'SW_SECURE_DECODE': 'SW_SECURE_DECODE',
      'HW_SECURE_CRYPTO': 'HW_SECURE_CRYPTO',
      'HW_SECURE_DECODE': 'HW_SECURE_DECODE',
      'HW_SECURE_ALL': 'HW_SECURE_ALL',
    };
    const docLink = this.resolveExternLink_('.DrmConfiguration');
    this.addSection_('DRM', docLink)
        .addBoolInput_('Delay License Request Until Played',
            'drm.delayLicenseRequestUntilPlayed')
        .addBoolInput_('Log license exchange data', 'drm.logLicenseExchange')
        .addNumberInput_('Update expiration time',
            'drm.updateExpirationTime',
            /* canBeDecimal= */ true,
            /* canBeZero= */ false,
            /* canBeUnset= */ true)
        .addBoolInput_('Parse inband "pssh" from media segments',
            'drm.parseInbandPsshEnabled')
        .addTextInput_('Min HDCP version', 'drm.minHdcpVersion')
        .addBoolInput_('Ignore duplicate init data',
            'drm.ignoreDuplicateInitData')
        .addSelectInput_('Default audio robustness for Widevine',
            'drm.defaultAudioRobustnessForWidevine',
            widevineRobustnessLevels, widevineRobustnessLevels)
        .addSelectInput_('Default video robustness for Widevine',
            'drm.defaultVideoRobustnessForWidevine',
            widevineRobustnessLevels, widevineRobustnessLevels);
    const advanced = shakaDemoMain.getConfiguration().drm.advanced || {};
    const addDRMAdvancedField = (name, valueName, suggestions,
        arrayString = false) => {
      // All advanced fields of a given type are set at once.
      this.addDatalistInput_(name, suggestions, (input) => {
        // Add in any common drmSystem not currently in advanced.
        for (const drmSystem of shakaDemo.Main.commonDrmSystems) {
          if (!(drmSystem in advanced)) {
            advanced[drmSystem] = shakaDemo.Main.defaultAdvancedDrmConfig();
          }
        }
        // Set the robustness.
        for (const drmSystem in advanced) {
          advanced[drmSystem][valueName] = arrayString ?
              input.value.split(',').filter(Boolean) :
              input.value;
        }
        shakaDemoMain.configure('drm.advanced', advanced);
        shakaDemoMain.remakeHash();
      });
      const keySystem = Object.keys(advanced)[0];
      if (keySystem) {
        const currentValue = advanced[keySystem][valueName];
        this.latestInput_.input().value = currentValue;
      }
    };

    const robustnessSuggestions = [
      'SW_SECURE_CRYPTO',
      'SW_SECURE_DECODE',
      'HW_SECURE_CRYPTO',
      'HW_SECURE_DECODE',
      'HW_SECURE_ALL',
      '150',
      '2000',
      '3000',
    ];

    const sessionTypeSuggestions = ['temporary', 'persistent-license'];

    addDRMAdvancedField(
        'Video Robustness', 'videoRobustness', robustnessSuggestions,
        /* arrayString= */ true);
    addDRMAdvancedField(
        'Audio Robustness', 'audioRobustness', robustnessSuggestions,
        /* arrayString= */ true);
    addDRMAdvancedField('Session Type', 'sessionType', sessionTypeSuggestions);

    this.addRetrySection_('drm', 'DRM Retry Parameters');
  }

  /** @private */
  addManifestSection_() {
    const docLink = this.resolveExternLink_('.ManifestConfiguration');
    this.addSection_('Manifest', docLink)
        .addNumberInput_('Availability Window Override',
            'manifest.availabilityWindowOverride',
            /* canBeDecimal= */ true,
            /* canBeZero= */ false,
            /* canBeUnset= */ true)
        .addNumberInput_('Default Presentation Delay',
            'manifest.defaultPresentationDelay',
            /* canBeDecimal= */ true,
            /* canBeZero= */ true)
        .addBoolInput_('Disable Audio', 'manifest.disableAudio')
        .addBoolInput_('Disable Video', 'manifest.disableVideo')
        .addBoolInput_('Disable Text', 'manifest.disableText')
        .addBoolInput_('Disable Thumbnails', 'manifest.disableThumbnails')
        .addBoolInput_('Disable I-Frames', 'manifest.disableIFrames')
        .addBoolInput_('Enable segment-relative VTT Timing',
            'manifest.segmentRelativeVttTiming')
        .addBoolInput_('Continue loading when paused',
            'manifest.continueLoadingWhenPaused')
        .addBoolInput_('Ignore supplemental codecs',
            'manifest.ignoreSupplementalCodecs')
        .addNumberInput_('Override the Update time of the manifest',
            'manifest.updatePeriod')
        .addBoolInput_('Ignore DRM Info', 'manifest.ignoreDrmInfo');
  }

  /** @private */
  addDashManifestSection_() {
    const docLink = this.resolveExternLink_('.ManifestConfiguration');
    this.addSection_('DASH Manifest', docLink)
        .addBoolInput_('Auto-Correct DASH Drift',
            'manifest.dash.autoCorrectDrift')
        .addBoolInput_('Disable Xlink processing',
            'manifest.dash.disableXlinkProcessing')
        .addBoolInput_('Xlink Should Fail Gracefully',
            'manifest.dash.xlinkFailGracefully')
        .addBoolInput_('Ignore DASH suggestedPresentationDelay',
            'manifest.dash.ignoreSuggestedPresentationDelay')
        .addBoolInput_('Ignore empty DASH AdaptationSets',
            'manifest.dash.ignoreEmptyAdaptationSet')
        .addBoolInput_('Ignore DASH maxSegmentDuration',
            'manifest.dash.ignoreMaxSegmentDuration')
        .addBoolInput_('Allow DASH multi type variants',
            'manifest.dash.multiTypeVariantsAllowed')
        .addTextInput_('Clock Sync URI', 'manifest.dash.clockSyncUri')
        .addBoolInput_('Ignore Min Buffer Time',
            'manifest.dash.ignoreMinBufferTime')
        .addNumberInput_('Initial Segment Limit',
            'manifest.dash.initialSegmentLimit',
            /* canBeDecimal= */ false,
            /* canBeZero= */ false,
            /* canBeUnset= */ true)
        .addBoolInput_('Enable DASH sequence mode',
            'manifest.dash.sequenceMode')
        .addBoolInput_('Use stream once in period flattening',
            'manifest.dash.useStreamOnceInPeriodFlattening')
        .addBoolInput_('Enable fast switching',
            'manifest.dash.enableFastSwitching');
  }

  /** @private */
  addHlsManifestSection_() {
    const docLink = this.resolveExternLink_('.ManifestConfiguration');
    this.addSection_('HLS Manifest', docLink)
        .addBoolInput_('Ignore HLS Text Stream Failures',
            'manifest.hls.ignoreTextStreamFailures')
        .addBoolInput_('Ignore HLS Image Stream Failures',
            'manifest.hls.ignoreImageStreamFailures')
        .addTextInput_('Default Audio Codec', 'manifest.hls.defaultAudioCodec')
        .addTextInput_('Default Video Codec', 'manifest.hls.defaultVideoCodec')
        .addTextInput_('Default media playlist full mime type',
            'manifest.hls.mediaPlaylistFullMimeType')
        .addBoolInput_('Ignore Program Date Time from manifest',
            'manifest.hls.ignoreManifestProgramDateTime')
        .addNumberInput_('Live segments delay',
            'manifest.hls.liveSegmentsDelay')
        .addBoolInput_('Enable HLS sequence mode', 'manifest.hls.sequenceMode')
        .addBoolInput_('Ignore Manifest Timestamps in Segments Mode',
            'manifest.hls.ignoreManifestTimestampsInSegmentsMode')
        .addBoolInput_('Disable codec guessing',
            'manifest.hls.disableCodecGuessing')
        .addBoolInput_('Disable closed caption detection',
            'manifest.hls.disableClosedCaptionsDetection')
        .addBoolInput_('Allow LL-HLS byterange optimization',
            'manifest.hls.allowLowLatencyByteRangeOptimization')
        .addBoolInput_('Allow range request to guess mime type',
            'manifest.hls.allowRangeRequestsToGuessMimeType');
  }

  /** @private */
  addMssManifestSection_() {
    const docLink = this.resolveExternLink_('.ManifestConfiguration');
    this.addSection_('MSS Manifest', docLink)
        .addBoolInput_('Enable MSS sequence mode', 'manifest.mss.sequenceMode');
  }

  /** @private */
  addAbrSection_() {
    const docLink = this.resolveExternLink_('.AbrConfiguration');
    this.addSection_('Adaptation', docLink)
        .addBoolInput_('Enabled', 'abr.enabled')
        .addBoolInput_('Use Network Information API',
            'abr.useNetworkInformation')
        .addNumberInput_('Default Bandwidth Estimate',
            'abr.defaultBandwidthEstimate')
        .addNumberInput_('Bandwidth Downgrade Target',
            'abr.bandwidthDowngradeTarget',
            /* canBeDecimal= */ true)
        .addNumberInput_('Bandwidth Upgrade Target',
            'abr.bandwidthUpgradeTarget',
            /* canBeDecimal= */ true)
        .addNumberInput_('Switch Interval', 'abr.switchInterval',
            /* canBeDecimal= */ true)
        .addNumberInput_('Min total Bytes', 'abr.advanced.minTotalBytes')
        .addNumberInput_('Min Bytes', 'abr.advanced.minBytes')
        .addNumberInput_('Fast half life', 'abr.advanced.fastHalfLife',
            /* canBeDecimal= */ true)
        .addNumberInput_('Slow half life', 'abr.advanced.slowHalfLife',
            /* canBeDecimal= */ true)
        .addBoolInput_('Restrict to element size', 'abr.restrictToElementSize')
        .addBoolInput_('Restrict to screen size', 'abr.restrictToScreenSize')
        .addBoolInput_('Ignore device pixel ratio',
            'abr.ignoreDevicePixelRatio')
        .addBoolInput_('Clear video buffer on abr rendition switch',
            'abr.clearBufferSwitch')
        .addNumberInput_('Safe margin on abr switch rendition',
            'abr.safeMarginSwitch',
            /* canBeDecimal= */ true)
        .addNumberInput_('Milliseconds to consider a request cached',
            'abr.cacheLoadThreshold',
            /* canBeDecimal= */ true)
        .addNumberInput_('Minimum time to switch',
            'abr.minTimeToSwitch',
            /* canBeDecimal= */ true,
            /* canBeZero= */ true)
        .addBoolInput_('Prefer Network Information bandwidth',
            'abr.preferNetworkInformationBandwidth')
        .addBoolInput_('Remove latency from first packet time',
            'abr.removeLatencyFromFirstPacketTime');
    this.addRestrictionsSection_('abr', 'Adaptation Restrictions');
  }

  /** @private */
  addTextDisplayerSection_() {
    const docLink = this.resolveExternLink_('.TextDisplayerConfiguration');
    this.addSection_('Text displayer', docLink)
        .addNumberInput_('Captions update period',
            'textDisplayer.captionsUpdatePeriod',
            /* canBeDecimal= */ true)
        .addNumberInput_('Font scale factor',
            'textDisplayer.fontScaleFactor',
            /* canBeDecimal= */ true);
  }

  /** @private */
  addCmcdSection_() {
    const docLink = this.resolveExternLink_('.CmcdConfiguration');
    this.addSection_('CMCD', docLink)
        .addBoolInput_('Enabled', 'cmcd.enabled')
        .addTextInput_('Session ID', 'cmcd.sessionId')
        .addTextInput_('Content ID', 'cmcd.contentId')
        .addTextInput_('Version', 'cmcd.version')
        .addNumberInput_('RTP safety Factor', 'cmcd.rtpSafetyFactor',
            /* canBeDecimal= */ true)
        .addBoolInput_('Use Headers', 'cmcd.useHeaders');
  }

  /** @private */
  addCmsdSection_() {
    const docLink = this.resolveExternLink_('.CmsdConfiguration');
    this.addSection_('CMSD', docLink)
        .addBoolInput_('Enabled', 'cmsd.enabled')
        .addBoolInput_('Apply maximum suggested bitrate',
            'cmsd.applyMaximumSuggestedBitrate')
        .addNumberInput_('Estimated throughput weight ratio',
            'cmsd.estimatedThroughputWeightRatio',
            /* canBeDecimal= */ true,
            /* canBeZero= */ true);
  }

  /** @private */
  addLcevcSection_() {
    const docLink = this.resolveExternLink_('.LcevcConfiguration');
    this.addSection_('MPEG-5 Part-2 LCEVC', docLink)
        .addBoolInput_('Enabled', 'lcevc.enabled')
        .addBoolInput_('LCEVC Dynamic Performance scaling',
            'lcevc.dynamicPerformanceScaling')
        .addNumberInput_('LCEVC Log Level', 'lcevc.logLevel')
        .addBoolInput_('Draw LCEVC Logo', 'lcevc.drawLogo')
        .addBoolInput_('Enable LCEVC Poster', 'lcevc.poster');
  }

  /** @private */
  addAdsSection_() {
    const docLink = this.resolveExternLink_('.AdsConfiguration');
    this.addSection_('Ads', docLink)
        .addBoolInput_('Custom playhead tracker',
            'ads.customPlayheadTracker')
        .addBoolInput_('Skip play detection',
            'ads.skipPlayDetection')
        .addBoolInput_('Supports multiple media elements',
            'ads.supportsMultipleMediaElements')
        .addBoolInput_('Ignore HLS Interstitial',
            'ads.disableHLSInterstitial')
        .addBoolInput_('Ignore DASH Interstitial',
            'ads.disableDASHInterstitial')
        .addBoolInput_('Allow preload on DOM elements',
            'ads.allowPreloadOnDomElements')
        .addBoolInput_('Allow start in the middle of an interstitial',
            'ads.allowStartInMiddleOfInterstitial');
  }

  /**
   * @param {string} category
   * @param {string} sectionName
   * @private
   */
  addRestrictionsSection_(category, sectionName) {
    const prefix = (category ? category + '.' : '') + 'restrictions.';
    const docLink = this.resolveExternLink_('.Restrictions');
    this.addSection_(sectionName, docLink)
        .addNumberInput_('Min Width', prefix + 'minWidth')
        .addNumberInput_('Max Width', prefix + 'maxWidth')
        .addNumberInput_('Min Height', prefix + 'minHeight')
        .addNumberInput_('Max Height', prefix + 'maxHeight')
        .addNumberInput_('Min Pixels', prefix + 'minPixels')
        .addNumberInput_('Max Pixels', prefix + 'maxPixels')
        .addNumberInput_('Min Framerate', prefix + 'minFrameRate')
        .addNumberInput_('Max Framerate', prefix + 'maxFrameRate')
        .addNumberInput_('Min Bandwidth', prefix + 'minBandwidth')
        .addNumberInput_('Max Bandwidth', prefix + 'maxBandwidth')
        .addNumberInput_('Min Channels Count', prefix + 'minChannelsCount')
        .addNumberInput_('Max Channels Count', prefix + 'maxChannelsCount');
  }

  /**
   * @param {string} category
   * @param {string} sectionName
   * @private
   */
  addRetrySection_(category, sectionName) {
    const prefix = category + '.retryParameters.';
    const docLink = this.resolveExternLink_('.RetryParameters');
    this.addSection_(sectionName, docLink)
        .addNumberInput_('Max Attempts', prefix + 'maxAttempts',
            /* canBeDecimal= */ false,
            /* canBeZero= */ false)
        .addNumberInput_('Base Delay', prefix + 'baseDelay',
            /* canBeDecimal= */ true)
        .addNumberInput_('Backoff Factor', prefix + 'backoffFactor',
            /* canBeDecimal= */ true)
        .addNumberInput_('Fuzz Factor', prefix + 'fuzzFactor',
            /* canBeDecimal= */ true)
        .addNumberInput_('Timeout Factor', prefix + 'timeout',
            /* canBeDecimal= */ true)
        .addNumberInput_('Stall Timeout', prefix + 'stallTimeout',
            /* canBeDecimal= */ true)
        .addNumberInput_('Connection Timeout', prefix + 'connectionTimeout',
            /* canBeDecimal= */ true);
  }

  /** @private */
  addOfflineSection_() {
    const docLink = this.resolveExternLink_('.OfflineConfiguration');
    this.addSection_('Offline', docLink)
        .addBoolInput_('Use Persistent Licenses',
            'offline.usePersistentLicense')
        .addNumberInput_('Number of Parallel Downloads',
            'offline.numberOfParallelDownloads');
  }

  /** @private */
  addStreamingSection_() {
    const docLink = this.resolveExternLink_('.StreamingConfiguration');
    this.addSection_('Streaming', docLink)
        .addNumberInput_('Gap detection threshold',
            'streaming.gapDetectionThreshold',
            /* canBeDecimal= */ true)
        .addNumberInput_('Gap padding',
            'streaming.gapPadding',
            /* canBeDecimal= */ true)
        .addNumberInput_('Gap Jump Timer Time', 'streaming.gapJumpTimerTime',
            /* canBeDecimal= */ true)
        .addNumberInput_('Buffering Goal', 'streaming.bufferingGoal',
            /* canBeDecimal= */ true)
        .addNumberInput_('Duration Backoff', 'streaming.durationBackoff',
            /* canBeDecimal= */ true)
        .addNumberInput_('Rebuffering Goal', 'streaming.rebufferingGoal',
            /* canBeDecimal= */ true,
            /* canBeZero= */ true)
        .addNumberInput_('Buffer Behind', 'streaming.bufferBehind',
            /* canBeDecimal= */ true)
        .addNumberInput_('Eviction Goal', 'streaming.evictionGoal',
            /* canBeDecimal= */ true)
        .addNumberInput_('Safe Seek Offset', 'streaming.safeSeekOffset',
            /* canBeDecimal= */ true)
        .addNumberInput_('Safe Seek Offset', 'streaming.safeSeekEndOffset',
            /* canBeDecimal= */ true)
        .addNumberInput_('Stall Threshold', 'streaming.stallThreshold',
            /* canBeDecimal= */ true)
        .addNumberInput_('Safe Skip Distance', 'streaming.stallSkip',
            /* canBeDecimal= */ true)
        .addNumberInput_('Inaccurate Manifest Tolerance',
            'streaming.inaccurateManifestTolerance',
            /* canBeDecimal= */ true)
        .addBoolInput_('Low Latency Mode', 'streaming.lowLatencyMode')
        .addBoolInput_('Prefer native DASH playback when available',
            'streaming.preferNativeDash')
        .addBoolInput_('Prefer native HLS playback when available',
            'streaming.preferNativeHls')
        .addNumberInput_('Update interval seconds',
            'streaming.updateIntervalSeconds',
            /* canBeDecimal= */ true)
        .addBoolInput_('Observe media quality changes',
            'streaming.observeQualityChanges')
        .addNumberInput_('Max Variant Disabled Time',
            'streaming.maxDisabledTime')
        .addNumberInput_('Segment Prefetch Limit',
            'streaming.segmentPrefetchLimit',
            /* canBeDecimal= */ false,
            /* canBeZero= */ true,
            /* canBeUnset= */ true)
        .addCustomTextInput_('Prefetch audio languages', (input) => {
          shakaDemoMain.configure(
              'streaming.prefetchAudioLanguages',
              input.value.split(',').filter(Boolean));
        })
        .addBoolInput_('Disable Audio Prefetch',
            'streaming.disableAudioPrefetch')
        .addBoolInput_('Disable Text Prefetch',
            'streaming.disableTextPrefetch')
        .addBoolInput_('Disable Video Prefetch',
            'streaming.disableVideoPrefetch')
        .addBoolInput_('Allow Media Source recoveries',
            'streaming.allowMediaSourceRecoveries')
        .addNumberInput_('Minimum time between recoveries',
            'streaming.minTimeBetweenRecoveries')
        .addBoolInput_('VOD Dynamic Playback Rate Buffer Control',
            'streaming.vodDynamicPlaybackRate')
        .addNumberInput_('VOD Dynamic Playback Rate Low Buffer Rate',
            'streaming.vodDynamicPlaybackRateLowBufferRate',
            /* canBeDecimal= */ true)
        .addNumberInput_('VOD Dynamic Playback Rate Buffer Ratio',
            'streaming.vodDynamicPlaybackRateBufferRatio',
            /* canBeDecimal= */ true)
        .addBoolInput_('Clear decodingInfo cache on unload',
            'streaming.clearDecodingCache');
    if (!shakaDemoMain.getNativeControlsEnabled()) {
      this.addBoolInput_('Always Stream Text', 'streaming.alwaysStreamText');
    } else {
      // Add a fake custom fixed "input" that warns the users not to change it.
      const noop = (input) => {};
      this.addCustomBoolInput_('Always Stream Text', noop,
          'Text must always be streamed while native controls are enabled, ' +
          'for captions to work.');
      this.latestInput_.input().disabled = true;
      this.latestInput_.input().checked = true;
    }

    const hdrLevels = {
      '': '',
      'AUTO': 'AUTO',
      'SDR': 'SDR',
      'PQ': 'PQ',
      'HLG': 'HLG',
    };
    const hdrLevelNames = {
      'AUTO': 'Auto Detect',
      'SDR': 'SDR',
      'PQ': 'PQ',
      'HLG': 'HLG',
      '': 'No Preference',
    };
    this.addSelectInput_('Preferred HDR Level', 'preferredVideoHdrLevel',
        hdrLevels, hdrLevelNames);

    const videoLayouts = {
      '': '',
      'CH-STEREO': 'CH-STEREO',
      'CH-MONO': 'CH-MONO',
    };
    const videoLayoutsNames = {
      'CH-STEREO': 'Stereoscopic',
      'CH-MONO': 'Monoscopic',
      '': 'No Preference',
    };
    this.addSelectInput_('Preferred video layout', 'preferredVideoLayout',
        videoLayouts, videoLayoutsNames);

    const strategyOptions = shaka.config.CrossBoundaryStrategy;
    const strategyOptionsNames = {
      'KEEP': 'Keep',
      'RESET': 'Reset',
      'RESET_TO_ENCRYPTED': 'Reset to encrypted',
      'RESET_ON_ENCRYPTION_CHANGE': 'Reset on encryption change',
    };

    this.addBoolInput_('Start At Segment Boundary',
        'streaming.startAtSegmentBoundary')
        .addBoolInput_('Ignore Text Stream Failures',
            'streaming.ignoreTextStreamFailures')
        .addBoolInput_('Stall Detector Enabled', 'streaming.stallEnabled')
        .addBoolInput_('Use native HLS for FairPlay',
            'streaming.useNativeHlsForFairPlay')
        .addNumberInput_('Time window at end to preload next URL',
            'streaming.preloadNextUrlWindow',
            /* canBeDecimal= */ true,
            /* canBeZero= */ true)
        .addNumberInput_('Load timeout for src=',
            'streaming.loadTimeout',
            /* canBeDecimal= */ true)
        .addBoolInput_('Don\'t choose codecs',
            'streaming.dontChooseCodecs')
        .addBoolInput_('Should fix timestampOffset',
            'streaming.shouldFixTimestampOffset')
        .addBoolInput_('Avoid eviction on QuotaExceededError',
            'streaming.avoidEvictionOnQuotaExceededError')
        .addSelectInput_('Cross Boundary Strategy',
            'streaming.crossBoundaryStrategy',
            strategyOptions, strategyOptionsNames)
        .addBoolInput_(
            'Return to end of live window when outside of live window',
            'streaming.returnToEndOfLiveWindowWhenOutside');
    this.addRetrySection_('streaming', 'Streaming Retry Parameters');
    this.addLiveSyncSection_();
  }

  /** @private */
  addLiveSyncSection_() {
    const docLink = this.resolveExternLink_('.LiveSyncConfiguration');
    this.addSection_('Streaming Live Sync', docLink);
    this.addBoolInput_('Live Sync', 'streaming.liveSync.enabled')
        .addNumberInput_('Target latency',
            'streaming.liveSync.targetLatency',
            /* canBeDecimal= */ true,
            /* canBeZero= */ true)
        .addNumberInput_('Target latency tolerance',
            'streaming.liveSync.targetLatencyTolerance',
            /* canBeDecimal= */ true,
            /* canBeZero= */ true)
        .addNumberInput_('Max playback rate',
            'streaming.liveSync.maxPlaybackRate',
            /* canBeDecimal= */ true,
            /* canBeZero= */ false)
        .addNumberInput_('Min playback rate',
            'streaming.liveSync.minPlaybackRate',
            /* canBeDecimal= */ true)
        .addBoolInput_('Panic Mode', 'streaming.liveSync.panicMode')
        .addNumberInput_('Panic Mode Threshold',
            'streaming.liveSync.panicThreshold')
        .addBoolInput_('Dynamic Target Latency',
            'streaming.liveSync.dynamicTargetLatency.enabled')
        .addNumberInput_('Dynamic Target Latency Stability Threshold',
            'streaming.liveSync.dynamicTargetLatency.stabilityThreshold')
        .addNumberInput_('Dynamic Target Latency Rebuffer Increment',
            'streaming.liveSync.dynamicTargetLatency.rebufferIncrement',
            /* canBeDecimal= */ true,
            /* canBeZero= */ true)
        .addNumberInput_('Dynamic Target Latency Max Attempts',
            'streaming.liveSync.dynamicTargetLatency.maxAttempts')
        .addNumberInput_('Dynamic Target Latency Max Latency',
            'streaming.liveSync.dynamicTargetLatency.maxLatency')
        .addNumberInput_('Dynamic Target Latency Min Latency',
            'streaming.liveSync.dynamicTargetLatency.minLatency');
  }

  /** @private */
  addNetworkingSection_() {
    const docLink = this.resolveExternLink_('.NetworkingConfiguration');
    this.addSection_('Networking', docLink)
        .addBoolInput_('Force HTTP', 'networking.forceHTTP')
        .addBoolInput_('Force HTTPS', 'networking.forceHTTPS')
        .addNumberInput_('Min bytes for progress events',
            'networking.minBytesForProgressEvents');
  }

  /** @private */
  addMediaSourceSection_() {
    const docLink = this.resolveExternLink_('.MediaSourceConfiguration');

    const strategyOptions = shaka.config.CodecSwitchingStrategy;
    const strategyOptionsNames = {
      'RELOAD': 'reload',
      'SMOOTH': 'smooth',
    };

    this.addSection_('Media source', docLink)
        .addBoolInput_('Force Transmux', 'mediaSource.forceTransmux')
        .addBoolInput_('Insert fake encryption in init segments when needed ' +
            'by the platform.', 'mediaSource.insertFakeEncryptionInInit')
        .addBoolInput_('Force enca.ChannelCount to 2 for EC-3 audio if ' +
          'needed by the platform.', 'mediaSource.correctEc3Enca')
        .addSelectInput_(
            'Codec Switching Strategy',
            'mediaSource.codecSwitchingStrategy',
            strategyOptions,
            strategyOptionsNames)
        .addBoolInput_('Dispatch all emsg boxes',
            'mediaSource.dispatchAllEmsgBoxes')
        .addBoolInput_('Uses source elements',
            'mediaSource.useSourceElements')
        .addBoolInput_('Expect updateEnd when duration is truncated',
            'mediaSource.durationReductionEmitsUpdateEnd');
  }

  /** @private */
  addLanguageSection_() {
    const docLink = this.resolveExternLink_('.PlayerConfiguration');

    const autoShowTextOptions = shaka.config.AutoShowText;
    const autoShowTextOptionNames = {
      'NEVER': 'Never',
      'ALWAYS': 'Always',
      'IF_PREFERRED_TEXT_LANGUAGE': 'If preferred text language',
      'IF_SUBTITLES_MAY_BE_NEEDED': 'If subtitles may be needed',
    };

    this.addSection_('Language', docLink)
        .addTextInput_('Preferred Audio Language', 'preferredAudioLanguage')
        .addTextInput_('Preferred Audio Label', 'preferredAudioLabel')
        .addTextInput_('Preferred Video Label', 'preferredVideoLabel')
        .addTextInput_('Preferred Variant Role', 'preferredVariantRole')
        .addTextInput_('Preferred Text Language', 'preferredTextLanguage')
        .addTextInput_('Preferred Text Role', 'preferredTextRole')
        .addSelectInput_('Auto-Show Text',
            'autoShowText',
            autoShowTextOptions,
            autoShowTextOptionNames);
    const onChange = (input) => {
      shakaDemoMain.setUILocale(input.value);
      shakaDemoMain.remakeHash();
    };
    this.addCustomTextInput_('Preferred UI Locale', onChange);
    this.latestInput_.input().value = shakaDemoMain.getUILocale();
    this.addNumberInput_('Preferred Audio Channel Count',
        'preferredAudioChannelCount');
    this.addBoolInput_('Prefer Spatial Audio', 'preferSpatialAudio');
    this.addBoolInput_('Prefer Forced Subs', 'preferForcedSubs');
  }

  /** @private */
  addCodecPreferenceSection_() {
    const docLink = this.resolveExternLink_('.PlayerConfiguration');

    this.addSection_('Codec preference', docLink)
        .addArrayStringInput_('Preferred video codecs',
            'preferredVideoCodecs')
        .addArrayStringInput_('Preferred audio codecs',
            'preferredAudioCodecs')
        .addArrayStringInput_('Preferred text formats',
            'preferredTextFormats');
  }

  /** @private */
  addMetaSection_() {
    this.addSection_(/* name= */ null, /* docLink= */ null);

    this.addCustomBoolInput_('Shaka Controls', (input) => {
      shakaDemoMain.setNativeControlsEnabled(!input.checked);
      if (input.checked) {
        // Forcibly set |streaming.alwaysStreamText| to true.
        shakaDemoMain.configure('streaming.alwaysStreamText', true);
        shakaDemoMain.remakeHash();
      }
      // Enabling/disabling Shaka Controls will change how other controls in
      // the config work, so reload the page.
      this.reloadAndSaveState_();
    });
    // TODO: Re-add the tooltipMessage of 'Takes effect next load.' once we
    // are ready to add ALL of the tooltip messages.
    if (!shakaDemoMain.getNativeControlsEnabled()) {
      this.latestInput_.input().checked = true;
    }

    if (!shakaDemoMain.getNativeControlsEnabled()) {
      this.addCustomBoolInput_('Enabled Trick Play Controls', (input) => {
        shakaDemoMain.setTrickPlayControlsEnabled(input.checked);
      });
      if (shakaDemoMain.getTrickPlayControlsEnabled()) {
        this.latestInput_.input().checked = true;
      }
    } else {
      // Add a fake custom fixed "input" that warns the users not to change it.
      const noop = (input) => {};
      this.addCustomBoolInput_('Enabled Trick Play Controls',
          noop, 'Trick Play controls require the Shaka UI.');
      this.latestInput_.input().disabled = true;
      this.latestInput_.input().checked = false;
    }
    this.addCustomBoolInput_('Enabled custom context menu', (input) => {
      shakaDemoMain.setCustomContextMenuEnabled(input.checked);
    });
    if (shakaDemoMain.getCustomContextMenuEnabled()) {
      this.latestInput_.input().checked = true;
    }

    this.addCustomTextInput_('Watermark text', (input) => {
      shakaDemoMain.setWatermarkText(input.value);
    });
    this.latestInput_.input().value = shakaDemoMain.getWatermarkText();

    // shaka.log is not set if logging isn't enabled.
    // I.E. if using the release version of shaka.
    if (!shaka['log']) {
      return;
    }

    // Access shaka.log using bracket syntax because shaka.log is not exported.
    // Exporting the logging methods proved to be a bad solution, both in terms
    // of difficulty and in terms of what changes it would require of the
    // architectural design of Shaka Player, so this non-type-safe solution is
    // the best remaining way to get the Closure compiler to compile this
    // method.
    const Level = shaka['log']['Level'];
    const setLevel = shaka['log']['setLevel'];

    const logLevels = {
      'info': 'Info',
      'debug': 'Debug',
      'v': 'Verbose',
      'vv': 'Very Verbose',
    };
    const onChange = (input) => {
      switch (input.value) {
        case 'info':
          setLevel(Level['INFO']);
          break;
        case 'debug':
          setLevel(Level['DEBUG']);
          break;
        case 'vv':
          setLevel(Level['V2']);
          break;
        case 'v':
          setLevel(Level['V1']);
          break;
      }
      shakaDemoMain.remakeHash();
    };
    this.addCustomSelectInput_('Log Level', logLevels, onChange);
    const input = this.latestInput_.input();
    switch (shaka['log']['currentLevel']) {
      case Level['DEBUG']:
        input.value = 'debug';
        break;
      case Level['V2']:
        input.value = 'vv';
        break;
      case Level['V1']:
        input.value = 'v';
        break;
      default:
        input.value = 'info';
        break;
    }
  }

  /**
   * @param {string} suffix
   * @return {string}
   * @private
   */
  resolveExternLink_(suffix) {
    return '../docs/api/shaka.extern.html#' + suffix;
  }

  /**
   * @param {?string} name
   * @param {?string} docLink
   * @return {!shakaDemo.Config}
   * @private
   */
  addSection_(name, docLink) {
    const style = name ?
                  shakaDemo.InputContainer.Style.ACCORDION :
                  shakaDemo.InputContainer.Style.VERTICAL;
    this.sections_.push(new shakaDemo.InputContainer(
        this.container_, name, style, docLink));

    return this;
  }

  /**
   * @param {string} name
   * @param {string} valueName
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addBoolInput_(name, valueName, tooltipMessage) {
    const onChange = (input) => {
      shakaDemoMain.configure(valueName, input.checked);
      shakaDemoMain.remakeHash();
    };
    this.addCustomBoolInput_(name, onChange, tooltipMessage);
    if (shakaDemoMain.getCurrentConfigValue(valueName)) {
      this.latestInput_.input().checked = true;
    }
    return this;
  }

  /**
   * @param {string} name
   * @param {function(!HTMLInputElement)} onChange
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addCustomBoolInput_(name, onChange, tooltipMessage) {
    this.createRow_(name, tooltipMessage);
    this.latestInput_ = new shakaDemo.BoolInput(
        this.getLatestSection_(), name, onChange);
    return this;
  }

  /**
   * @param {!string} name
   * @param {string} valueName
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addArrayStringInput_(name, valueName, tooltipMessage) {
    const onChange = (input) => {
      shakaDemoMain.configure(valueName,
          input.value.split(',').filter(Boolean));
      shakaDemoMain.remakeHash();
    };
    this.addCustomTextInput_(name, onChange, tooltipMessage);
    const configValue = /** @type {!Array<string>} */ (
      shakaDemoMain.getCurrentConfigValue(valueName));
    this.latestInput_.input().value = configValue.join(',');
    return this;
  }

  /**
   * @param {!string} name
   * @param {string} valueName
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addTextInput_(name, valueName, tooltipMessage) {
    const onChange = (input) => {
      shakaDemoMain.configure(valueName, input.value);
      shakaDemoMain.remakeHash();
    };
    this.addCustomTextInput_(name, onChange, tooltipMessage);
    this.latestInput_.input().value =
        shakaDemoMain.getCurrentConfigValue(valueName);
    return this;
  }

  /**
   * @param {string} name
   * @param {function(!HTMLInputElement)} onChange
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addCustomTextInput_(name, onChange, tooltipMessage) {
    this.createRow_(name, tooltipMessage);
    this.latestInput_ = new shakaDemo.TextInput(
        this.getLatestSection_(), name, onChange);
    return this;
  }

  /**
   * @param {string} name
   * @param {string} valueName
   * @param {boolean=} canBeDecimal
   * @param {boolean=} canBeZero
   * @param {boolean=} canBeUnset
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addNumberInput_(name, valueName, canBeDecimal = false, canBeZero = true,
      canBeUnset = false, tooltipMessage) {
    const onChange = (input) => {
      if (input.value == 'Infinity') {
        shakaDemoMain.configure(valueName, Infinity);
      } else if (input.value == '' && canBeUnset) {
        shakaDemoMain.resetConfiguration(valueName);
      } else {
        const valueAsNumber = Number(input.value);
        if (valueAsNumber == 0 && !canBeZero) {
          shakaDemoMain.resetConfiguration(valueName);
        } else if (isNaN(valueAsNumber)) {
          shakaDemoMain.resetConfiguration(valueName);
        } else {
          if (Math.floor(valueAsNumber) != valueAsNumber && !canBeDecimal) {
            shakaDemoMain.resetConfiguration(valueName);
          } else {
            shakaDemoMain.configure(valueName, valueAsNumber);
          }
        }
      }
      shakaDemoMain.remakeHash();
    };
    this.createRow_(name, tooltipMessage);
    this.latestInput_ = new shakaDemo.NumberInput(
        this.getLatestSection_(), name, onChange, canBeDecimal, canBeZero,
        canBeUnset);
    this.latestInput_.input().value =
        shakaDemoMain.getCurrentConfigValue(valueName);
    if (isNaN(Number(this.latestInput_.input().value)) && canBeUnset) {
      this.latestInput_.input().value = '';
    }
    return this;
  }

  /**
   * @param {string} name
   * @param {!Array<string>} values
   * @param {function(!HTMLInputElement)} onChange
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addDatalistInput_(name, values, onChange, tooltipMessage) {
    this.createRow_(name, tooltipMessage);
    this.latestInput_ = new shakaDemo.DatalistInput(
        this.getLatestSection_(), name, onChange, values);
    return this;
  }

  /**
   * @param {string} name
   * @param {!Object<string, string>} values
   * @param {function(!HTMLInputElement)} onChange
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addCustomSelectInput_(name, values, onChange, tooltipMessage) {
    this.createRow_(name, tooltipMessage);
    // The input is not provided a name, as (in this enclosed space) it makes
    // the actual field unreadable.
    this.latestInput_ = new shakaDemo.SelectInput(
        this.getLatestSection_(), null, onChange, values);
    return this;
  }

  /**
   * @param {string} name
   * @param {string} valueName
   * @param {!Object<string, ?>} options
   * @param {!Object<string, string>} optionNames
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addSelectInput_(name, valueName, options, optionNames, tooltipMessage) {
    const onChange = (input) => {
      shakaDemoMain.configure(valueName, options[input.value]);
      shakaDemoMain.remakeHash();
    };

    // If there are any translations missing for option names, fill in the
    // constant from the enum.  This ensures new enum values are usable in the
    // demo in some form, even if they are forgotten in the demo config.
    for (const key in options) {
      if (!(key in optionNames)) {
        optionNames[key] = key;
      }
    }

    this.addCustomSelectInput_(name, optionNames, onChange, tooltipMessage);

    const initialValue = shakaDemoMain.getCurrentConfigValue(valueName);
    for (const key in options) {
      if (options[key] == initialValue) {
        this.latestInput_.input().value = key;
      }
    }

    return this;
  }

  /**
   * @param {string} name
   * @param {string=} tooltipMessage
   * @private
   */
  createRow_(name, tooltipMessage) {
    this.getLatestSection_().addRow(name, tooltipMessage || null);
  }

  /**
   * Gets the latest section. Results in a failed assert if there is no latest
   * section.
   * @return {!shakaDemo.InputContainer}
   * @private
   */
  getLatestSection_() {
    goog.asserts.assert(this.sections_.length > 0,
        'Must have at least one section.');
    return this.sections_[this.sections_.length - 1];
  }
};


document.addEventListener('shaka-main-loaded', shakaDemo.Config.init);
document.addEventListener('shaka-main-cleanup', () => {
  shakaDemoConfig = null;
});
