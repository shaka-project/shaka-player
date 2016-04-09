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
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onConfigKeyUp_ = function(event) {
  // Update the configuration if the user presses enter.
  if (event.keyCode != 13) return;

  shakaDemo.player_.configure(/** @type {shakaExtern.PlayerConfiguration} */({
    preferredAudioLanguage:
        document.getElementById('preferredAudioLanguage').value,
    preferredTextLanguage:
        document.getElementById('preferredTextLanguage').value
  }));
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
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onTrickPlayChange_ = function(event) {
  // Show/hide trick play controls.
  shakaDemo.controls_.showTrickPlay(event.target.checked);
};
