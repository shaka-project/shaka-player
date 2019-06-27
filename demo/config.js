/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


goog.provide('shakaDemo.Config');


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

    /** @private {!Set.<string>} */
    this.addedFields_ = new Set();

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
    shaka.ui.Utils.removeAllChildren(this.container_);
    this.sections_ = [];

    this.addMetaSection_();
    this.addLanguageSection_();
    this.addAbrSection_();
    this.addOfflineSection_();
    this.addDrmSection_();
    this.addStreamingSection_();
    this.addManifestSection_();
    this.addRetrictionsSection_('', '');
    this.checkSectionCompleteness_();
    this.checkSectionValidity_();
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
    const docLink = this.resolveExternLink_('.DrmConfiguration');
    this.addSection_('DRM', docLink)
        .addBoolInput_('Delay License Request Until Played',
                       'drm.delayLicenseRequestUntilPlayed');
    const advanced = shakaDemoMain.getConfiguration().drm.advanced;
    const robustnessSuggestions = [
      'SW_SECURE_CRYPTO',
      'SW_SECURE_DECODE',
      'HW_SECURE_CRYPTO',
      'HW_SECURE_DECODE',
      'HW_SECURE_ALL',
    ];
    const addRobustnessField = (name, valueName) => {
      // All robustness fields of a given type are set at once.
      this.addDatalistInput_(name, robustnessSuggestions, (input) => {
        // Add in any common drmSystem not currently in advanced.
        for (const drmSystem of shakaDemo.Main.commonDrmSystems) {
          if (!(drmSystem in advanced)) {
            advanced[drmSystem] = {
              distinctiveIdentifierRequired: false,
              persistentStateRequired: false,
              videoRobustness: '',
              audioRobustness: '',
              serverCertificate: null,
              individualizationServer: '',
            };
          }
        }
        // Set the robustness.
        for (let drmSystem in advanced) {
          advanced[drmSystem][valueName] = input.value;
        }
        shakaDemoMain.configure('drm.advanced', advanced);
        shakaDemoMain.remakeHash();
      });
      goog.asserts.assert(advanced, 'Advanced config should exist!');
      const keySystem = Object.keys(advanced)[0];
      if (keySystem) {
        const currentRobustness = advanced[keySystem][valueName];
        this.latestInput_.input().value = currentRobustness;
      }
    };
    addRobustnessField('Video Robustness', 'videoRobustness');
    addRobustnessField('Audio Robustness', 'audioRobustness');
    this.addRetrySection_('drm', 'DRM');
  }

  /** @private */
  addManifestSection_() {
    const docLink = this.resolveExternLink_('.ManifestConfiguration');
    this.addSection_('Manifest', docLink)
        .addBoolInput_('Ignore DASH DRM Info', 'manifest.dash.ignoreDrmInfo')
        .addBoolInput_('Auto-Correct DASH Drift',
                       'manifest.dash.autoCorrectDrift')
        .addBoolInput_('Xlink Should Fail Gracefully',
                       'manifest.dash.xlinkFailGracefully')
        .addNumberInput_('Availability Window Override',
                         'manifest.availabilityWindowOverride',
                         /* canBeDecimal = */ true,
                         /* canBeZero = */ false,
                         /* canBeUnset = */ true)
        .addTextInput_('Clock Sync URI', 'manifest.dash.clockSyncUri')
        .addBoolInput_('Ignore DRM Info', 'manifest.dash.ignoreDrmInfo')
        .addNumberInput_('Default Presentation Delay',
                         'manifest.dash.defaultPresentationDelay')
        .addBoolInput_('Ignore Min Buffer Time',
                       'manifest.dash.ignoreMinBufferTime');

    this.addRetrySection_('manifest', 'Manifest');
  }

  /** @private */
  addAbrSection_() {
    const docLink = this.resolveExternLink_('.AbrConfiguration');
    this.addSection_('Adaptation', docLink)
        .addBoolInput_('Enabled', 'abr.enabled')
        .addNumberInput_('Default Bandwidth Estimate',
                         'abr.defaultBandwidthEstimate')
        .addNumberInput_('Bandwidth Downgrade Target',
                         'abr.bandwidthDowngradeTarget',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Bandwidth Upgrade Target',
                         'abr.bandwidthUpgradeTarget',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Switch Interval',
                         'abr.switchInterval',
                         /* canBeDecimal = */ true);
    this.addRetrictionsSection_('abr', 'Adaptation');
  }

  /**
   * @param {string} category
   * @param {string} categoryName
   * @private
   */
  addRetrictionsSection_(category, categoryName) {
    const prefix = (category ? category + '.' : '') + 'restrictions.';
    const sectionName = (categoryName ? categoryName + ' ' : '') +
                        'Restrictions';
    const docLink = this.resolveExternLink_('.Restrictions');
    this.addSection_(sectionName, docLink)
        .addNumberInput_('Min Width', prefix + 'minWidth')
        .addNumberInput_('Max Width', prefix + 'maxWidth')
        .addNumberInput_('Min Height', prefix + 'minHeight')
        .addNumberInput_('Max Height', prefix + 'maxHeight')
        .addNumberInput_('Min Pixels', prefix + 'minPixels')
        .addNumberInput_('Max Pixels', prefix + 'maxPixels')
        .addNumberInput_('Min Bandwidth', prefix + 'minBandwidth')
        .addNumberInput_('Max Bandwidth', prefix + 'maxBandwidth');
  }

  /**
   * @param {string} category
   * @param {string} categoryName
   * @private
   */
  addRetrySection_(category, categoryName) {
    const prefix = category + '.retryParameters.';
    const docLink = this.resolveExternLink_('.RetryParameters');
    this.addSection_(categoryName + ' Retry Parameters', docLink)
        .addNumberInput_('Max Attempts', prefix + 'maxAttempts')
        .addNumberInput_('Base Delay',
                         prefix + 'baseDelay',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Backoff Factor',
                         prefix + 'backoffFactor',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Fuzz Factor',
                         prefix + 'fuzzFactor',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Timeout',
                         prefix + 'timeout',
                         /* canBeDecimal = */ true);
  }

  /** @private */
  addOfflineSection_() {
    const docLink = this.resolveExternLink_('.OfflineConfiguration');
    this.addSection_('Offline', docLink)
        .addBoolInput_('Use Persistent Licenses',
                       'offline.usePersistentLicense');
  }

  /** @private */
  addStreamingSection_() {
    const docLink = this.resolveExternLink_('.StreamingConfiguration');
    this.addSection_('Streaming', docLink)
        .addNumberInput_('Maximum Small Gap Size', 'streaming.smallGapLimit',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Buffering Goal', 'streaming.bufferingGoal',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Duration Backoff', 'streaming.durationBackoff',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Rebuffering Goal', 'streaming.rebufferingGoal',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Buffer Behind', 'streaming.bufferBehind',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Safe Seek Offset', 'streaming.safeSeekOffset',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Stall Threshold', 'streaming.stallThreshold',
                         /* canBeDecimal = */ true)
        .addNumberInput_('Safe Skip Distance', 'streaming.stallSkip',
                         /* canBeDecimal = */ true);

    if (!shakaDemoMain.getNativeControlsEnabled()) {
      this.addBoolInput_('Always Stream Text', 'streaming.alwaysStreamText');
    } else {
      // Add a fake custom fixed "input" that warns the users not to change it.
      const noop = (input) => {};
      const tooltipMessage = 'Text must always be streamed while native ' +
                             'controls are enabled, for captions to work.';
      this.addCustomBoolInput_('Always Stream Text', noop, tooltipMessage);
      this.latestInput_.input().disabled = true;
      this.latestInput_.input().checked = true;
    }

    this.addBoolInput_('Jump Large Gaps', 'streaming.jumpLargeGaps')
        .addBoolInput_('Force Transmux TS', 'streaming.forceTransmuxTS')
        .addBoolInput_('Start At Segment Boundary',
                       'streaming.startAtSegmentBoundary')
        .addBoolInput_('Ignore Text Stream Failures',
                       'streaming.ignoreTextStreamFailures')
        .addBoolInput_('Stall Detector Enabled', 'streaming.stallEnabled');
    this.addRetrySection_('streaming', 'Streaming');
  }

  /** @private */
  addLanguageSection_() {
    const docLink = this.resolveExternLink_('.PlayerConfiguration');
    this.addSection_('Language', docLink)
        .addTextInput_('Preferred Audio Language', 'preferredAudioLanguage')
        .addTextInput_('Preferred Text Language', 'preferredTextLanguage');
    const onChange = (input) => {
      shakaDemoMain.setUILocale(input.value);
    };
    this.addCustomTextInput_('Preferred UI Locale', onChange);
    this.latestInput_.input().value = shakaDemoMain.getUILocale();
    this.addNumberInput_('Preferred Audio Channel Count',
                         'preferredAudioChannelCount');
  }

  /** @private */
  addMetaSection_() {
    this.addSection_(/* name = */ '', /* docLink = */ null);

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

    // shaka.log is not set if logging isn't enabled.
    // I.E. if using the release version of shaka.
    if (!shaka['log']) return;

    // Access shaka.log using bracket syntax because shaka.log is not exported.
    // Exporting the logging methods proved to be a bad solution, both in terms
    // of difficulty and in terms of what changes it would require of the
    // architectural design of Shaka Player, so this non-type-safe solution is
    // the best remaining way to get the Closure compiler to compile this
    // method.
    const Level = shaka['log']['Level'];
    const setLevel = shaka['log']['setLevel'];

    const logLevels = {
        'info': 'Info', 'debug': 'Debug', 'v': 'Verbose', 'vv': 'Very Verbose'};
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
    this.addSelectInput_('Log Level', logLevels, onChange);
    const input = this.latestInput_.input();
    switch (shaka['log']['currentLevel']) {
      case Level['DEBUG']: input.value = 'debug'; break;
      case Level['V2']: input.value = 'vv'; break;
      case Level['V1']: input.value = 'v'; break;
      default: input.value = 'info'; break;
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
   * @param {string} name
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
    this.addedFields_.add(valueName);
    return this;
  }

  /**
   * @param {string} name
   * @param {function(!Element)} onChange
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
   * @param {string} name
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
    this.addedFields_.add(valueName);
    return this;
  }

  /**
   * @param {string} name
   * @param {function(!Element)} onChange
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
    this.latestInput_ = new shakaDemo.NumberInput(
        this.getLatestSection_(), name, onChange, canBeDecimal, canBeZero,
        canBeUnset);
    this.latestInput_.input().value =
        shakaDemoMain.getCurrentConfigValue(valueName);
    if (isNaN(Number(this.latestInput_.input().value)) && canBeUnset) {
      this.latestInput_.input().value = '';
    }
    this.addedFields_.add(valueName);
    return this;
  }

  /**
   * @param {string} name
   * @param {!Array.<string>} values
   * @param {function(!Element)} onChange
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
   * @param {!Object.<string, string>} values
   * @param {function(!Element)} onChange
   * @param {string=} tooltipMessage
   * @return {!shakaDemo.Config}
   * @private
   */
  addSelectInput_(name, values, onChange, tooltipMessage) {
    this.createRow_(name, tooltipMessage);
    this.latestInput_ = new shakaDemo.SelectInput(
        this.getLatestSection_(), name, onChange, values);
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
   * Checks for config values that do not have corresponding fields.
   * @private
   */
  checkSectionCompleteness_() {
    const configPrimitives = new Set(['number', 'string', 'boolean']);

    /**
     * Recursively checks all of the sections of the config object.
     * @param {!Object} section
     * @param {string} accumulatedName
     */
    const check = (section, accumulatedName) => {
      for (const key in section) {
        const name = (accumulatedName) ? (accumulatedName + '.' + key) : (key);
        const value = section[key];
        if (configPrimitives.has(typeof value)) {
          if (!this.addedFields_.has(name)) {
            console.warn('WARNING: Does not have config field for ' + name);
          }
        } else {
          // It's a sub-section.
          check(value, name);
        }
      }
    };
    check(shakaDemoMain.getConfiguration(), '');
  }

  /**
   * Checks for config fields that point to invalid/obsolete config values.
   * @private
   */
  checkSectionValidity_() {
    for (const field of this.addedFields_) {
      const value = shakaDemoMain.getCurrentConfigValue(field);
      if (value == undefined) {
        console.warn('WARNING: Invalid config field ' + field);
      }
    }
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
