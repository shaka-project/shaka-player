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
goog.require('shakaDemo.MessageIds');
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
     * @private {!Array.<!shakaDemo.InputContainer>}
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
    document.addEventListener('shaka-main-locale-changed', () => {
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
    this.addAbrSection_();
    this.addOfflineSection_();
    this.addDrmSection_();
    this.addStreamingSection_();
    this.addMediaSourceSection_();
    this.addManifestSection_();
    this.addRetrictionsSection_('',
        shakaDemo.MessageIds.RESTRICTIONS_SECTION_HEADER);
    this.addCmcdSection_();
    this.addLcevcSection_();
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
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.DrmConfiguration');
    this.addSection_(MessageIds.DRM_SECTION_HEADER, docLink)
        .addBoolInput_(MessageIds.DELAY_LICENSE,
            'drm.delayLicenseRequestUntilPlayed')
        .addBoolInput_(MessageIds.LOG_LICENSE_EXCHANGE,
            'drm.logLicenseExchange')
        .addNumberInput_(MessageIds.UPDATE_EXPIRATION_TIME,
            'drm.updateExpirationTime',
            /* canBeDecimal= */ true,
            /* canBeZero= */ false,
            /* canBeUnset= */ true)
        .addBoolInput_(MessageIds.PARSE_INBAND_PSSH_ENABLED,
            'drm.parseInbandPsshEnabled')
        .addTextInput_(MessageIds.MIN_HDCP_VERSION,
            'drm.minHdcpVersion');
    const advanced = shakaDemoMain.getConfiguration().drm.advanced || {};
    const addDRMAdvancedField = (name, valueName, suggestions) => {
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
          advanced[drmSystem][valueName] = input.value;
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
        MessageIds.VIDEO_ROBUSTNESS,
        'videoRobustness',
        robustnessSuggestions);
    addDRMAdvancedField(
        MessageIds.AUDIO_ROBUSTNESS,
        'audioRobustness',
        robustnessSuggestions);
    addDRMAdvancedField(
        MessageIds.DRM_SESSION_TYPE,
        'sessionType',
        sessionTypeSuggestions);

    this.addRetrySection_('drm', MessageIds.DRM_RETRY_SECTION_HEADER);
  }

  /** @private */
  addManifestSection_() {
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.ManifestConfiguration');
    this.addSection_(MessageIds.MANIFEST_SECTION_HEADER, docLink)
        .addBoolInput_(MessageIds.IGNORE_DASH_DRM,
            'manifest.dash.ignoreDrmInfo')
        .addBoolInput_(MessageIds.AUTO_CORRECT_DASH_DRIFT,
            'manifest.dash.autoCorrectDrift')
        .addBoolInput_(MessageIds.DISABLE_XLINK_PROCESSING,
            'manifest.dash.disableXlinkProcessing')
        .addBoolInput_(MessageIds.XLINK_FAIL_GRACEFULLY,
            'manifest.dash.xlinkFailGracefully')
        .addBoolInput_(MessageIds.IGNORE_DASH_SUGGESTED_PRESENTATION_DELAY,
            'manifest.dash.ignoreSuggestedPresentationDelay')
        .addBoolInput_(MessageIds.IGNORE_DASH_EMPTY_ADAPTATION_SET,
            'manifest.dash.ignoreEmptyAdaptationSet')
        .addBoolInput_(MessageIds.IGNORE_DASH_MAX_SEGMENT_DURATION,
            'manifest.dash.ignoreMaxSegmentDuration')
        .addBoolInput_(MessageIds.IGNORE_HLS_TEXT_FAILURES,
            'manifest.hls.ignoreTextStreamFailures')
        .addBoolInput_(MessageIds.IGNORE_HLS_IMAGE_FAILURES,
            'manifest.hls.ignoreImageStreamFailures')
        .addTextInput_(MessageIds.DEFAULT_AUDIO_CODEC,
            'manifest.hls.defaultAudioCodec')
        .addTextInput_(MessageIds.DEFAULT_VIDEO_CODEC,
            'manifest.hls.defaultVideoCodec')
        .addBoolInput_(MessageIds.IGNORE_MANIFEST_PROGRAM_DATE_TIME,
            'manifest.hls.ignoreManifestProgramDateTime')
        .addBoolInput_(MessageIds.USE_SAFARI_BEHAVIOR_FOR_LIVE,
            'manifest.hls.useSafariBehaviorForLive')
        .addNumberInput_(MessageIds.LIVE_SEGMENTS_DELAY,
            'manifest.hls.liveSegmentsDelay')
        .addBoolInput_(MessageIds.HLS_SEQUENCE_MODE,
            'manifest.hls.sequenceMode')
        .addNumberInput_(MessageIds.AVAILABILITY_WINDOW_OVERRIDE,
            'manifest.availabilityWindowOverride',
            /* canBeDecimal= */ true,
            /* canBeZero= */ false,
            /* canBeUnset= */ true)
        .addTextInput_(MessageIds.CLOCK_SYNC_URI, 'manifest.dash.clockSyncUri')
        .addNumberInput_(MessageIds.DEFAULT_PRESENTATION_DELAY,
            'manifest.defaultPresentationDelay')
        .addBoolInput_(MessageIds.IGNORE_MIN_BUFFER_TIME,
            'manifest.dash.ignoreMinBufferTime')
        .addNumberInput_(MessageIds.INITIAL_SEGMENT_LIMIT,
            'manifest.dash.initialSegmentLimit',
            /* canBeDecimal= */ false,
            /* canBeZero= */ false,
            /* canBeUnset= */ true)
        .addBoolInput_(MessageIds.DASH_SEQUENCE_MODE,
            'manifest.dash.sequenceMode')
        .addBoolInput_(MessageIds.DISABLE_AUDIO,
            'manifest.disableAudio')
        .addBoolInput_(MessageIds.DISABLE_VIDEO,
            'manifest.disableVideo')
        .addBoolInput_(MessageIds.DISABLE_TEXT,
            'manifest.disableText')
        .addBoolInput_(MessageIds.DISABLE_THUMBNAILS,
            'manifest.disableThumbnails')
        .addBoolInput_(MessageIds.SEGMENT_RELATIVE_VTT_TIMING,
            'manifest.segmentRelativeVttTiming');

    this.addRetrySection_('manifest', MessageIds.MANIFEST_RETRY_SECTION_HEADER);
  }

  /** @private */
  addAbrSection_() {
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.AbrConfiguration');
    this.addSection_(MessageIds.ADAPTATION_SECTION_HEADER, docLink)
        .addBoolInput_(MessageIds.ENABLED, 'abr.enabled')
        .addBoolInput_(MessageIds.NETWORK_INFORMATION,
            'abr.useNetworkInformation')
        .addNumberInput_(MessageIds.BANDWIDTH_ESTIMATE,
            'abr.defaultBandwidthEstimate')
        .addNumberInput_(MessageIds.BANDWIDTH_DOWNGRADE,
            'abr.bandwidthDowngradeTarget',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.BANDWIDTH_UPGRADE,
            'abr.bandwidthUpgradeTarget',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.SWITCH_INTERVAL,
            'abr.switchInterval',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.MIN_TOTAL_BYTES,
            'abr.advanced.minTotalBytes')
        .addNumberInput_(MessageIds.MIN_BYTES,
            'abr.advanced.minBytes')
        .addNumberInput_(MessageIds.FAST_HALF_LIFE,
            'abr.advanced.fastHalfLife',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.SLOW_HALF_LIFE,
            'abr.advanced.slowHalfLife',
            /* canBeDecimal= */ true)
        .addBoolInput_(MessageIds.RESTRICT_TO_ELEMENT_SIZE,
            'abr.restrictToElementSize')
        .addBoolInput_(MessageIds.RESTRICT_TO_SCREEN_SIZE,
            'abr.restrictToScreenSize')
        .addBoolInput_(MessageIds.IGNORE_DEVICE_PIXEL_RATIO,
            'abr.ignoreDevicePixelRatio');
    this.addRetrictionsSection_('abr',
        MessageIds.ADAPTATION_RESTRICTIONS_SECTION_HEADER);
  }

  /** @private */
  addCmcdSection_() {
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.CmcdConfiguration');
    this.addSection_(MessageIds.CMCD_SECTION_HEADER, docLink)
        .addBoolInput_(MessageIds.ENABLED, 'cmcd.enabled')
        .addTextInput_(MessageIds.SESSION_ID, 'cmcd.sessionId')
        .addTextInput_(MessageIds.CONTENT_ID, 'cmcd.contentId')
        .addBoolInput_(MessageIds.USE_HEADERS, 'cmcd.useHeaders');
  }

  /** @private */
  addLcevcSection_() {
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.LcevcConfiguration');
    this.addSection_(MessageIds.LCEVC_SECTION_HEADER, docLink)
        .addBoolInput_(MessageIds.ENABLED, 'lcevc.enabled')
        .addBoolInput_(MessageIds.LCEVC_DYNAMIC_PERFORMANCE_SCALING,
            'lcevc.dynamicPerformanceScaling')
        .addNumberInput_(MessageIds.LCEVC_LOG_LEVEL, 'lcevc.logLevel')
        .addBoolInput_(MessageIds.LCEVC_DRAW_LOGO, 'lcevc.drawLogo');
  }

  /**
   * @param {string} category
   * @param {!shakaDemo.MessageIds} sectionName
   * @private
   */
  addRetrictionsSection_(category, sectionName) {
    const MessageIds = shakaDemo.MessageIds;
    const prefix = (category ? category + '.' : '') + 'restrictions.';
    const docLink = this.resolveExternLink_('.Restrictions');
    this.addSection_(sectionName, docLink)
        .addNumberInput_(MessageIds.MIN_WIDTH, prefix + 'minWidth')
        .addNumberInput_(MessageIds.MAX_WIDTH, prefix + 'maxWidth')
        .addNumberInput_(MessageIds.MIN_HEIGHT, prefix + 'minHeight')
        .addNumberInput_(MessageIds.MAX_HEIGHT, prefix + 'maxHeight')
        .addNumberInput_(MessageIds.MIN_PIXELS, prefix + 'minPixels')
        .addNumberInput_(MessageIds.MAX_PIXELS, prefix + 'maxPixels')
        .addNumberInput_(MessageIds.MIN_FRAMERATE, prefix + 'minFrameRate')
        .addNumberInput_(MessageIds.MAX_FRAMERATE, prefix + 'maxFrameRate')
        .addNumberInput_(MessageIds.MIN_BANDWIDTH, prefix + 'minBandwidth')
        .addNumberInput_(MessageIds.MAX_BANDWIDTH, prefix + 'maxBandwidth');
  }

  /**
   * @param {string} category
   * @param {!shakaDemo.MessageIds} sectionName
   * @private
   */
  addRetrySection_(category, sectionName) {
    const MessageIds = shakaDemo.MessageIds;
    const prefix = category + '.retryParameters.';
    const docLink = this.resolveExternLink_('.RetryParameters');
    this.addSection_(sectionName, docLink)
        .addNumberInput_(MessageIds.MAX_ATTEMPTS, prefix + 'maxAttempts')
        .addNumberInput_(MessageIds.BASE_DELAY, prefix + 'baseDelay',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.BACKOFF_FACTOR, prefix + 'backoffFactor',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.FUZZ_FACTOR, prefix + 'fuzzFactor',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.TIMEOUT, prefix + 'timeout',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.STALL_TIMEOUT, prefix + 'stallTimeout',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.CONNECTION_TIMEOUT,
            prefix + 'connectionTimeout',
            /* canBeDecimal= */ true);
  }

  /** @private */
  addOfflineSection_() {
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.OfflineConfiguration');
    this.addSection_(MessageIds.OFFLINE_SECTION_HEADER, docLink)
        .addBoolInput_(MessageIds.USE_PERSISTENT_LICENSES,
            'offline.usePersistentLicense')
        .addNumberInput_(MessageIds.NUMBER_OF_PARALLEL_DOWNLOADS,
            'offline.numberOfParallelDownloads');
  }

  /** @private */
  addStreamingSection_() {
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.StreamingConfiguration');
    this.addSection_(MessageIds.STREAMING_SECTION_HEADER, docLink)
        .addNumberInput_(MessageIds.GAP_DETECTION_THRESHOLD,
            'streaming.gapDetectionThreshold',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.BUFFERING_GOAL,
            'streaming.bufferingGoal',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.DURATION_BACKOFF,
            'streaming.durationBackoff',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.REBUFFERING_GOAL,
            'streaming.rebufferingGoal',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.BUFFER_BEHIND,
            'streaming.bufferBehind',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.SAFE_SEEK_OFFSET,
            'streaming.safeSeekOffset',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.STALL_THRESHOLD,
            'streaming.stallThreshold',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.SAFE_SKIP_DISTANCE,
            'streaming.stallSkip',
            /* canBeDecimal= */ true)
        .addNumberInput_(MessageIds.INACCURATE_MANIFEST_TOLERANCE,
            'streaming.inaccurateManifestTolerance',
            /* canBeDecimal= */ true)
        .addBoolInput_(MessageIds.LOW_LATENCY,
            'streaming.lowLatencyMode')
        .addBoolInput_(MessageIds.AUTO_LOW_LATENCY,
            'streaming.autoLowLatencyMode')
        .addBoolInput_(MessageIds.FORCE_HTTPS,
            'streaming.forceHTTPS')
        .addBoolInput_(MessageIds.PREFER_NATIVE_HLS,
            'streaming.preferNativeHls')
        .addNumberInput_(MessageIds.UPDATE_INTERVAL_SECONDS,
            'streaming.updateIntervalSeconds',
            /* canBeDecimal= */ true)
        .addBoolInput_(MessageIds.DISPATCH_ALL_EMSG_BOXES,
            'streaming.dispatchAllEmsgBoxes')
        .addBoolInput_(MessageIds.OBSERVE_QUALITY_CHANGES,
            'streaming.observeQualityChanges')
        .addNumberInput_(MessageIds.MAX_DISABLED_TIME,
            'streaming.maxDisabledTime')
        .addNumberInput_(MessageIds.SEGMENT_PREFETCH_LIMIT,
            'streaming.segmentPrefetchLimit');

    if (!shakaDemoMain.getNativeControlsEnabled()) {
      this.addBoolInput_(MessageIds.ALWAYS_STREAM_TEXT,
          'streaming.alwaysStreamText');
    } else {
      // Add a fake custom fixed "input" that warns the users not to change it.
      const noop = (input) => {};
      this.addCustomBoolInput_(MessageIds.ALWAYS_STREAM_TEXT,
          noop, MessageIds.ALWAYS_STREAM_TEXT_WARNING);
      this.latestInput_.input().disabled = true;
      this.latestInput_.input().checked = true;
    }

    this.addBoolInput_(MessageIds.START_AT_SEGMENT_BOUNDARY,
        'streaming.startAtSegmentBoundary')
        .addBoolInput_(MessageIds.IGNORE_TEXT_FAILURES,
            'streaming.ignoreTextStreamFailures')
        .addBoolInput_(MessageIds.STALL_DETECTOR_ENABLED,
            'streaming.stallEnabled')
        .addBoolInput_(MessageIds.USE_NATIVE_HLS_SAFARI,
            'streaming.useNativeHlsOnSafari');
    this.addRetrySection_('streaming',
        MessageIds.STREAMING_RETRY_SECTION_HEADER);
  }

  /** @private */
  addMediaSourceSection_() {
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.MediaSourceConfiguration');
    this.addSection_(MessageIds.MEDIA_SOURCE_SECTION_HEADER, docLink)
        .addTextInput_(MessageIds.SOURCE_BUFFER_EXTRA_FEATURES,
            'mediaSource.sourceBufferExtraFeatures')
        .addBoolInput_(MessageIds.FORCE_TRANSMUX,
            'mediaSource.forceTransmux');
  }

  /** @private */
  addLanguageSection_() {
    const MessageIds = shakaDemo.MessageIds;
    const docLink = this.resolveExternLink_('.PlayerConfiguration');

    const autoShowTextOptions = shaka.config.AutoShowText;
    const localize = (name) => shakaDemoMain.getLocalizedString(name);
    const autoShowTextOptionNames = {
      'NEVER': localize(MessageIds.AUTO_SHOW_TEXT_NEVER),
      'ALWAYS': localize(MessageIds.AUTO_SHOW_TEXT_ALWAYS),
      'IF_PREFERRED_TEXT_LANGUAGE':
          localize(MessageIds.AUTO_SHOW_TEXT_IF_PREFERRED_TEXT_LANGUAGE),
      'IF_SUBTITLES_MAY_BE_NEEDED':
          localize(MessageIds.AUTO_SHOW_TEXT_IF_SUBTITLES_MAY_BE_NEEDED),
    };

    this.addSection_(MessageIds.LANGUAGE_SECTION_HEADER, docLink)
        .addTextInput_(MessageIds.AUDIO_LANGUAGE, 'preferredAudioLanguage')
        .addTextInput_(MessageIds.AUDIO_LABEL, 'preferredAudioLabel')
        .addTextInput_(MessageIds.TEXT_LANGUAGE, 'preferredTextLanguage')
        .addTextInput_(MessageIds.TEXT_ROLE, 'preferredTextRole')
        .addSelectInput_(
            MessageIds.AUTO_SHOW_TEXT,
            'autoShowText',
            autoShowTextOptions,
            autoShowTextOptionNames);
    const onChange = (input) => {
      shakaDemoMain.setUILocale(input.value);
      shakaDemoMain.remakeHash();
    };
    this.addCustomTextInput_(MessageIds.UI_LOCALE, onChange);
    this.latestInput_.input().value = shakaDemoMain.getUILocale();
    this.addNumberInput_(MessageIds.AUDIO_CHANNEL_COUNT,
        'preferredAudioChannelCount');
    this.addBoolInput_(MessageIds.PREFER_FORCED_SUBS,
        'preferForcedSubs');
  }

  /** @private */
  addMetaSection_() {
    const MessageIds = shakaDemo.MessageIds;
    this.addSection_(/* name= */ null, /* docLink= */ null);

    this.addCustomBoolInput_(MessageIds.SHAKA_CONTROLS, (input) => {
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
      this.addCustomBoolInput_(MessageIds.TRICK_PLAY_CONTROLS, (input) => {
        shakaDemoMain.setTrickPlayControlsEnabled(input.checked);
      });
      if (shakaDemoMain.getTrickPlayControlsEnabled()) {
        this.latestInput_.input().checked = true;
      }
    } else {
      // Add a fake custom fixed "input" that warns the users not to change it.
      const noop = (input) => {};
      this.addCustomBoolInput_(MessageIds.TRICK_PLAY_CONTROLS,
          noop, MessageIds.TRICK_PLAY_CONTROLS_WARNING);
      this.latestInput_.input().disabled = true;
      this.latestInput_.input().checked = false;
    }

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

    const localize = (name) => shakaDemoMain.getLocalizedString(name);
    const logLevels = {
      'info': localize(MessageIds.LOG_LEVEL_INFO),
      'debug': localize(MessageIds.LOG_LEVEL_DEBUG),
      'v': localize(MessageIds.LOG_LEVEL_V),
      'vv': localize(MessageIds.LOG_LEVEL_VV),
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
    this.addCustomSelectInput_(MessageIds.LOG_LEVEL, logLevels, onChange);
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
   * @param {?shakaDemo.MessageIds} name
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
   * @param {!shakaDemo.MessageIds} name
   * @param {string} valueName
   * @param {shakaDemo.MessageIds=} tooltipMessage
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
   * @param {!shakaDemo.MessageIds} name
   * @param {function(!HTMLInputElement)} onChange
   * @param {shakaDemo.MessageIds=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addCustomBoolInput_(name, onChange, tooltipMessage) {
    this.createRow_(name, tooltipMessage);
    const localized = shakaDemoMain.getLocalizedString(name);
    this.latestInput_ = new shakaDemo.BoolInput(
        this.getLatestSection_(), localized, onChange);
    return this;
  }

  /**
   * @param {!shakaDemo.MessageIds} name
   * @param {string} valueName
   * @param {shakaDemo.MessageIds=} tooltipMessage
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
   * @param {!shakaDemo.MessageIds} name
   * @param {function(!HTMLInputElement)} onChange
   * @param {shakaDemo.MessageIds=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addCustomTextInput_(name, onChange, tooltipMessage) {
    this.createRow_(name, tooltipMessage);
    const localized = shakaDemoMain.getLocalizedString(name);
    this.latestInput_ = new shakaDemo.TextInput(
        this.getLatestSection_(), localized, onChange);
    return this;
  }

  /**
   * @param {!shakaDemo.MessageIds} name
   * @param {string} valueName
   * @param {boolean=} canBeDecimal
   * @param {boolean=} canBeZero
   * @param {boolean=} canBeUnset
   * @param {shakaDemo.MessageIds=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addNumberInput_(name, valueName, canBeDecimal = false, canBeZero = true,
      canBeUnset = false, tooltipMessage) {
    const onChange = (input) => {
      shakaDemoMain.resetConfiguration(valueName);
      shakaDemoMain.remakeHash();
      if (input.value == 'Infinity') {
        shakaDemoMain.configure(valueName, Infinity);
        shakaDemoMain.remakeHash();
        return;
      }
      if (input.value == '' && canBeUnset) {
        return;
      }
      const valueAsNumber = Number(input.value);
      if (valueAsNumber == 0 && !canBeZero) {
        return;
      }
      if (!isNaN(valueAsNumber)) {
        if (Math.floor(valueAsNumber) != valueAsNumber && !canBeDecimal) {
          return;
        }
        shakaDemoMain.configure(valueName, valueAsNumber);
        shakaDemoMain.remakeHash();
      }
    };
    this.createRow_(name, tooltipMessage);
    const localized = shakaDemoMain.getLocalizedString(name);
    this.latestInput_ = new shakaDemo.NumberInput(
        this.getLatestSection_(), localized, onChange, canBeDecimal, canBeZero,
        canBeUnset);
    this.latestInput_.input().value =
        shakaDemoMain.getCurrentConfigValue(valueName);
    if (isNaN(Number(this.latestInput_.input().value)) && canBeUnset) {
      this.latestInput_.input().value = '';
    }
    return this;
  }

  /**
   * @param {!shakaDemo.MessageIds} name
   * @param {!Array.<string>} values
   * @param {function(!HTMLInputElement)} onChange
   * @param {shakaDemo.MessageIds=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addDatalistInput_(name, values, onChange, tooltipMessage) {
    this.createRow_(name, tooltipMessage);
    const localized = shakaDemoMain.getLocalizedString(name);
    this.latestInput_ = new shakaDemo.DatalistInput(
        this.getLatestSection_(), localized, onChange, values);
    return this;
  }

  /**
   * @param {!shakaDemo.MessageIds} name
   * @param {!Object.<string, string>} values
   * @param {function(!HTMLInputElement)} onChange
   * @param {shakaDemo.MessageIds=} tooltipMessage
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
   * @param {!shakaDemo.MessageIds} name
   * @param {string} valueName
   * @param {!Object.<string, ?>} options
   * @param {!Object.<string, string>} optionNames
   * @param {shakaDemo.MessageIds=} tooltipMessage
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
   * @param {!shakaDemo.MessageIds} name
   * @param {shakaDemo.MessageIds=} tooltipMessage
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
