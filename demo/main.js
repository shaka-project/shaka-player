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


/** @private {HTMLVideoElement} */
shakaDemo.video_ = null;


/** @private {shaka.Player} */
shakaDemo.player_ = null;


/** @private {shakaExtern.SupportType} */
shakaDemo.support_;


/** @private {ShakaControls} */
shakaDemo.controls_ = null;


/**
 * Initialize the application.
 */
shakaDemo.init = function() {
  // Display the version number.
  document.getElementById('version').textContent = shaka.Player.version;

  // Fill in the language preferences based on browser config, if available.
  var language = navigator.language || 'en-us';
  document.getElementById('preferredAudioLanguage').value = language;
  document.getElementById('preferredTextLanguage').value = language;

  // Read URL parameters.
  var fields = location.search.split('?').slice(1).join('?');
  fields = fields ? fields.split(';') : [];
  var params = {};
  for (var i = 0; i < fields.length; ++i) {
    var kv = fields[i].split('=');
    params[kv[0]] = kv.slice(1).join('=');
  }

  if ('lang' in params) {
    document.getElementById('preferredAudioLanguage').value = params['lang'];
    document.getElementById('preferredTextLanguage').value = params['lang'];
  }
  if ('asset' in params) {
    document.getElementById('manifestInput').value = params['asset'];
  }
  if ('license' in params) {
    document.getElementById('licenseServerInput').value = params['license'];
  }

  if ('vv' in params && shaka.log) {
    shaka.log.setLevel(shaka.log.Level.V2);
  } else if ('v' in params && shaka.log) {
    shaka.log.setLevel(shaka.log.Level.V1);
  } else if ('debug' in params && shaka.log) {
    shaka.log.setLevel(shaka.log.Level.DEBUG);
  }

  shakaDemo.setupLogging_();

  shaka.polyfill.installAll();

  shaka.Player.support().then(function(support) {
    shakaDemo.support_ = support;

    if (shakaDemo.support_.supported == false) {
      var errorDisplay = document.getElementById('errorDisplay');
      var error = 'Your browser is not supported!';

      // IE8 and other very old browsers don't have textContent.
      if (errorDisplay.textContent === undefined) {
        errorDisplay.innerText = error;
      } else {
        errorDisplay.textContent = error;
      }

      // Disable the load button.
      var loadButton = document.getElementById('loadButton');
      loadButton.disabled = true;

      // Make sure the error is seen.
      errorDisplay.style.fontSize = '250%';
    } else {
      shakaDemo.video_ =
          /** @type {!HTMLVideoElement} */(document.getElementById('video'));
      shakaDemo.player_ = new shaka.Player(shakaDemo.video_);
      shakaDemo.player_.addEventListener('error', shakaDemo.onErrorEvent_);

      shakaDemo.setupAssets_();
      shakaDemo.setupConfiguration_();
      shakaDemo.setupInfo_();

      shakaDemo.controls_ = new ShakaControls();
      shakaDemo.controls_.init(shakaDemo.video_, shakaDemo.player_);

      // If a custom asset was given in the URL, select it now.
      if ('asset' in params) {
        var assetList = document.getElementById('assetList');
        var customAsset = document.getElementById('customAsset');
        assetList.selectedIndex = assetList.options.length - 1;
        customAsset.style.display = 'block';
      }

      if ('play' in params) {
        shakaDemo.load();
      }
    }
  });
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onErrorEvent_ = function(event) {
  var error = event.detail;
  shakaDemo.onError_(error);
};


/**
 * @param {!shaka.util.Error} error
 * @private
 */
shakaDemo.onError_ = function(error) {
  console.error('Player error', error);
  var message = error.message || ('Error code ' + error.code);
  var errorDisplay = document.getElementById('errorDisplay');
  errorDisplay.textContent = message;
};


// IE 9 fires DOMContentLoaded, and enters the "interactive"
// readyState, before document.body has been initialized, so wait
// for window.load.
if (document.readyState == 'loading' ||
    document.readyState == 'interactive') {
  if (window.attachEvent) {
    // IE8
    window.attachEvent('onload', shakaDemo.init);
  } else {
    window.addEventListener('load', shakaDemo.init);
  }
} else {
  shakaDemo.init();
}
