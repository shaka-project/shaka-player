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

/**
 * @fileoverview Shaka Player demo, main section.
 *
 * @suppress {visibility} to work around compiler errors until we can
 *   refactor the demo into classes that talk via public method.  TODO
 */


/** @suppress {duplicate} */
var shakaDemo = shakaDemo || {};  // eslint-disable-line no-var


/** @private */
shakaDemo.setupConfiguration_ = function() {
  document.getElementById('smallGapLimit').addEventListener(
      'input', shakaDemo.onGapInput_);
  document.getElementById('jumpLargeGaps').addEventListener(
      'change', shakaDemo.onJumpLargeGapsChange_);
  document.getElementById('preferredAudioLanguage').addEventListener(
      'input', shakaDemo.onConfigInput_);
  document.getElementById('preferredTextLanguage').addEventListener(
      'input', shakaDemo.onConfigInput_);
  document.getElementById('preferredAudioChannelCount').addEventListener(
      'input', shakaDemo.onConfigInput_);
  document.getElementById('showNative').addEventListener(
      'change', shakaDemo.onNativeChange_);
  document.getElementById('showTrickPlay').addEventListener(
      'change', shakaDemo.onTrickPlayChange_);
  document.getElementById('enableAdaptation').addEventListener(
      'change', shakaDemo.onAdaptationChange_);
  document.getElementById('logLevelList').addEventListener(
      'change', shakaDemo.onLogLevelChange_);
  document.getElementById('enableLoadOnRefresh').addEventListener(
      'change', shakaDemo.onLoadOnRefreshChange_);
  document.getElementById('drmSettingsVideoRobustness').addEventListener(
      'input', shakaDemo.onDrmSettingsChange_);
  document.getElementById('drmSettingsAudioRobustness').addEventListener(
      'input', shakaDemo.onDrmSettingsChange_);
  document.getElementById('availabilityWindowOverride').addEventListener(
      'input', shakaDemo.onAvailabilityWindowOverrideChange_);

  let robustnessSuggestions = document.getElementById('robustnessSuggestions');
  if (shakaDemo.support_.drm['com.widevine.alpha']) {
    let widevineSuggestions = ['SW_SECURE_CRYPTO', 'SW_SECURE_DECODE',
      'HW_SECURE_CRYPTO', 'HW_SECURE_DECODE', 'HW_SECURE_ALL'];
    // Add Widevine robustness suggestions if it is supported.
    widevineSuggestions.forEach(function(suggestion) {
      let option = document.createElement('option');
      option.value = suggestion;
      option.textContent = 'Widevine';
      robustnessSuggestions.appendChild(option);
    });
  }
};


/** @private */
shakaDemo.onLoadOnRefreshChange_ = function() {
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onDrmSettingsChange_ = function(event) {
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onAvailabilityWindowOverrideChange_ = function(event) {
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onLogLevelChange_ = function(event) {
  // shaka.log is not set if logging isn't enabled.
  // I.E. if using the release version of shaka.
  if (shaka.log) {
    let logLevel = event.target[event.target.selectedIndex];
    switch (logLevel.value) {
      case 'info':
        shaka.log.setLevel(shaka.log.Level.INFO);
        break;
      case 'debug':
        shaka.log.setLevel(shaka.log.Level.DEBUG);
        break;
      case 'vv':
        shaka.log.setLevel(shaka.log.Level.V2);
        break;
      case 'v':
        shaka.log.setLevel(shaka.log.Level.V1);
        break;
    }
    // Change the hash, to mirror this.
    shakaDemo.hashShouldChange_();
  }
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onJumpLargeGapsChange_ = function(event) {
  shakaDemo.player_.configure(({
    streaming: {jumpLargeGaps: event.target.checked}
  }));
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onGapInput_ = function(event) {
  let smallGapLimit = Number(event.target.value);
  let useDefault = isNaN(smallGapLimit) || event.target.value.length == 0;
  shakaDemo.player_.configure(({
    streaming: {
      smallGapLimit: useDefault ? undefined : smallGapLimit
    }
  }));
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onConfigInput_ = function(event) {
  let preferredAudioChannelCount =
      Number(document.getElementById('preferredAudioChannelCount').value) || 2;
  shakaDemo.player_.configure(/** @type {shakaExtern.PlayerConfiguration} */({
    preferredAudioLanguage:
        document.getElementById('preferredAudioLanguage').value,
    preferredTextLanguage:
        document.getElementById('preferredTextLanguage').value,
    preferredAudioChannelCount: preferredAudioChannelCount,
  }));
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onAdaptationChange_ = function(event) {
  // Update adaptation config.
  shakaDemo.player_.configure({
    abr: {enabled: event.target.checked}
  });
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onNativeChange_ = function(event) {
  let showTrickPlay = document.getElementById('showTrickPlay');

  if (event.target.checked) {
    showTrickPlay.checked = false;
    showTrickPlay.disabled = true;
    shakaDemo.controls_.showTrickPlay(false);
    shakaDemo.controls_.setEnabled(false);
  } else {
    showTrickPlay.disabled = false;
    shakaDemo.controls_.setEnabled(true);
  }

  // Update text streaming config.  When we use native controls, we must always
  // stream text.  This is because the native controls can't send an event when
  // the text display state changes, so we can't use the display state to choose
  // when to stream text.
  shakaDemo.player_.configure({
    streaming: {alwaysStreamText: event.target.checked}
  });

  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onTrickPlayChange_ = function(event) {
  // Show/hide trick play controls.
  shakaDemo.controls_.showTrickPlay(event.target.checked);
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};
