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
var shakaDemo = shakaDemo || {};


/** @private */
shakaDemo.setupConfiguration_ = function() {
  document.getElementById('preferredAudioLanguage').addEventListener(
      'keyup', shakaDemo.onConfigKeyUp_);
  document.getElementById('preferredTextLanguage').addEventListener(
      'keyup', shakaDemo.onConfigKeyUp_);
  document.getElementById('showTrickPlay').addEventListener(
      'change', shakaDemo.onTrickPlayChange_);
  document.getElementById('enableAdaptation').addEventListener(
      'change', shakaDemo.onAdaptationChange_);
  document.getElementById('logLevelList').addEventListener(
      'change', shakaDemo.onLogLevelChange_);
  document.getElementById('enableAutoplay').addEventListener(
      'change', shakaDemo.onAutoplayChange_);
};


/** @private */
shakaDemo.onAutoplayChange_ = function() {
  // Change the hash, to mirror this.
  shakaDemo.hashShouldChange_();
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onLogLevelChange_ = function(event) {
  // shaka.log is not set if logging isn't enabled.
  // I.E. if using the compiled version of shaka.
  if (shaka.log) {
    var logLevel = event.target[event.target.selectedIndex];
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
shakaDemo.onConfigKeyUp_ = function(event) {
  shakaDemo.player_.configure(/** @type {shakaExtern.PlayerConfiguration} */({
    preferredAudioLanguage:
        document.getElementById('preferredAudioLanguage').value,
    preferredTextLanguage:
        document.getElementById('preferredTextLanguage').value
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
  shakaDemo.player_.configure(/** @type {shakaExtern.PlayerConfiguration} */({
    abr: { enabled: event.target.checked }
  }));
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
