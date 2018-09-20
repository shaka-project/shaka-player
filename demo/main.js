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


/** @private {shaka.cast.CastProxy} */
shakaDemo.castProxy_ = null;


/** @private {HTMLMediaElement} */
shakaDemo.video_ = null;


/** @private {shaka.Player} */
shakaDemo.player_ = null;


/** @private {HTMLMediaElement} */
shakaDemo.localVideo_ = null;


/** @private {shaka.Player} */
shakaDemo.localPlayer_ = null;


/** @private {shakaExtern.SupportType} */
shakaDemo.support_;


/** @private {ShakaControls} */
shakaDemo.controls_ = null;


/** @private {boolean} */
shakaDemo.hashCanChange_ = false;


/** @private {boolean} */
shakaDemo.suppressHashChangeEvent_ = false;


/** @private {(number|undefined)} */
shakaDemo.startTime_ = undefined;


/**
 * @private
 * @const {string}
 */
shakaDemo.mainPoster_ =
    'https://shaka-player-demo.appspot.com/assets/poster.jpg';


/**
 * @private
 * @const {string}
 */
shakaDemo.audioOnlyPoster_ =
    'https://shaka-player-demo.appspot.com/assets/audioOnly.gif';


/**
 * The registered ID of the v2.4 Chromecast receiver demo.
 * @const {string}
 * @private
 */
shakaDemo.CC_APP_ID_ = '00A3C5E8';


/**
 * Initialize the application.
 */
shakaDemo.init = function() {
  document.getElementById('errorDisplayCloseButton').addEventListener(
      'click', shakaDemo.closeError);

  // Display the version number.
  document.getElementById('version').textContent = shaka.Player.version;

  // Fill in the language preferences based on browser config, if available.
  let language = navigator.language || 'en-us';
  document.getElementById('preferredAudioLanguage').value = language;
  document.getElementById('preferredTextLanguage').value = language;

  document.getElementById('preferredAudioChannelCount').value = '2';

  let params = shakaDemo.getParams_();

  shakaDemo.setupLogging_();

  shakaDemo.preBrowserCheckParams_(params);

  shaka.polyfill.installAll();

  // Display uncaught exceptions.
  window.addEventListener('error', function(event) {
    shakaDemo.onError_(/** @type {!shaka.util.Error} */ (event.error));
  });

  if (!shaka.Player.isBrowserSupported()) {
    let errorDisplayLink = document.getElementById('errorDisplayLink');
    let error = 'Your browser is not supported!';

    // IE8 and other very old browsers don't have textContent.
    if (errorDisplayLink.textContent === undefined) {
      errorDisplayLink.innerText = error;
    } else {
      errorDisplayLink.textContent = error;
    }

    // Disable the load/unload buttons.
    let loadButton = document.getElementById('loadButton');
    loadButton.disabled = true;
    document.getElementById('unloadButton').disabled = true;

    // Hide the error message's close button.
    let errorDisplayCloseButton =
        document.getElementById('errorDisplayCloseButton');
    errorDisplayCloseButton.style.display = 'none';

    // Make sure the error is seen.
    errorDisplayLink.style.fontSize = '250%';

    // TODO: Link to docs about browser support.  For now, disable link.
    errorDisplayLink.href = '#';
    // Disable for newer browsers:
    errorDisplayLink.style.pointerEvents = 'none';
    // Disable for older browsers:
    errorDisplayLink.style.textDecoration = 'none';
    errorDisplayLink.style.cursor = 'default';
    errorDisplayLink.onclick = function() { return false; };

    let errorDisplay = document.getElementById('errorDisplay');
    errorDisplay.style.display = 'block';
  } else {
    if (navigator.serviceWorker) {
      console.debug('Registering service worker.');
      navigator.serviceWorker.register('service_worker.js')
          .then(function(registration) {
            console.debug('Service worker registered!', registration.scope);
          }).catch(function(error) {
            console.error('Service worker registration failed!', error);
          });
    }

    /** @param {Event} event */
    let offlineStatusChanged = function(event) {
      let version = document.getElementById('version');
      let text = version.textContent;
      text = text.replace(' (offline)', '');
      if (!navigator.onLine) {
        text += ' (offline)';
      }
      version.textContent = text;
      shakaDemo.computeDisabledAssets();
    };
    window.addEventListener('online', offlineStatusChanged);
    window.addEventListener('offline', offlineStatusChanged);
    offlineStatusChanged(null);

    shaka.Player.probeSupport().then(function(support) {
      shakaDemo.support_ = support;

      let localVideo =
          /** @type {!HTMLVideoElement} */(document.getElementById('video'));
      let localPlayer = new shaka.Player(localVideo);
      shakaDemo.castProxy_ = new shaka.cast.CastProxy(
          localVideo, localPlayer, shakaDemo.CC_APP_ID_);

      shakaDemo.video_ = shakaDemo.castProxy_.getVideo();
      shakaDemo.player_ = shakaDemo.castProxy_.getPlayer();
      shakaDemo.player_.addEventListener('error', shakaDemo.onErrorEvent_);
      shakaDemo.localVideo_ = localVideo;
      shakaDemo.localPlayer_ = localPlayer;

      // Set the default poster.
      shakaDemo.localVideo_.poster = shakaDemo.mainPoster_;

      let asyncSetup = shakaDemo.setupAssets_();
      shakaDemo.setupOffline_();
      shakaDemo.setupConfiguration_();
      shakaDemo.setupInfo_();

      shakaDemo.controls_ = new ShakaControls();
      shakaDemo.controls_.init(shakaDemo.castProxy_, shakaDemo.onError_,
                               shakaDemo.onCastStatusChange_);

      asyncSetup.catch(function(error) {
        // shakaDemo.setupOfflineAssets_ errored while trying to
        // load the offline assets. Notify the user of this.
        shakaDemo.onError_(/** @type {!shaka.util.Error} */ (error));
      }).then(function() {
        shakaDemo.postBrowserCheckParams_(params);
        window.addEventListener('hashchange', shakaDemo.updateFromHash_);
      });
    }).catch(function(error) {
      // Some part of the setup of the demo app threw an error.
      // Notify the user of this.
      shakaDemo.onError_(/** @type {!shaka.util.Error} */ (error));
    });
  }
};


/**
  * @return {!Object.<string, string>} params
  * @private
  */
shakaDemo.getParams_ = function() {
  // Read URL parameters.
  let fields = location.search.substr(1);
  fields = fields ? fields.split(';') : [];
  let fragments = location.hash.substr(1);
  fragments = fragments ? fragments.split(';') : [];

  // Because they are being concatenated in this order, if both an
  // URL fragment and an URL parameter of the same type are present
  // the URL fragment takes precendence.
  /** @type {!Array.<string>} */
  let combined = fields.concat(fragments);
  let params = {};
  for (let i = 0; i < combined.length; ++i) {
    let kv = combined[i].split('=');
    params[kv[0]] = kv.slice(1).join('=');
  }
  return params;
};


/**
  * @param {!Object.<string, string>} params
  * @private
  */
shakaDemo.preBrowserCheckParams_ = function(params) {
  if ('videoRobustness' in params) {
    document.getElementById('drmSettingsVideoRobustness').value =
        params['videoRobustness'];
  }
  if ('audioRobustness' in params) {
    document.getElementById('drmSettingsAudioRobustness').value =
        params['audioRobustness'];
  }
  if ('lang' in params) {
    document.getElementById('preferredAudioLanguage').value = params['lang'];
    document.getElementById('preferredTextLanguage').value = params['lang'];
  }
  if ('audiolang' in params) {
    document.getElementById('preferredAudioLanguage').value =
        params['audiolang'];
  }
  if ('textlang' in params) {
    document.getElementById('preferredTextLanguage').value = params['textlang'];
  }
  if ('channels' in params) {
    document.getElementById('preferredAudioChannelCount').value =
        params['channels'];
  }
  if ('asset' in params) {
    document.getElementById('manifestInput').value = params['asset'];
  }
  if ('license' in params) {
    document.getElementById('licenseServerInput').value = params['license'];
  }
  if ('certificate' in params) {
    document.getElementById('certificateInput').value = params['certificate'];
  }
  if ('availabilityWindowOverride' in params) {
    document.getElementById('availabilityWindowOverride').value =
        params['availabilityWindowOverride'];
  }
  if ('logtoscreen' in params) {
    document.getElementById('logToScreen').checked = true;
    // Call onLogChange_ manually, because setting checked
    // programatically doesn't fire a 'change' event.
    shakaDemo.onLogChange_();
  }
  if ('noinput' in params) {
    // Both the content container and body need different styles in this mode.
    document.getElementById('container').className = 'noinput';
    document.body.className = 'noinput';
  }
  if ('play' in params) {
    document.getElementById('enableLoadOnRefresh').checked = true;
  }
  if ('startTime' in params) {
    // Used manually for debugging start time issues in live streams.
    shakaDemo.startTime_ = parseInt(params['startTime'], 10);
  }
  // shaka.log is not set if logging isn't enabled.
  // I.E. if using the compiled version of shaka.
  if (shaka.log) {
    // The log level selector is only visible if logging is available.
    document.getElementById('logLevelListDiv').hidden = false;

    // Set log level.
    let toSelectValue;
    if ('vv' in params) {
      toSelectValue = 'vv';
      shaka.log.setLevel(shaka.log.Level.V2);
    } else if ('v' in params) {
      toSelectValue = 'v';
      shaka.log.setLevel(shaka.log.Level.V1);
    } else if ('debug' in params) {
      toSelectValue = 'debug';
      shaka.log.setLevel(shaka.log.Level.DEBUG);
    }
    if (toSelectValue) {
      // Set the log level selector to the proper value.
      let logLevelList = document.getElementById('logLevelList');
      for (let index = 0; index < logLevelList.length; index++) {
        if (logLevelList[index].value == toSelectValue) {
          logLevelList.selectedIndex = index;
          break;
        }
      }
    }
  }
};


/**
 * Decide if a license server from the demo app URI matches the configuration
 * of a demo asset.
 *
 * @param {!shakaAssets.AssetInfo} assetInfo
 * @param {?string} licenseUri
 * @return {boolean}
 * @private
 */
shakaDemo.licenseServerMatch_ = function(assetInfo, licenseUri) {
  // If no license server was specified, assume that this is a match.
  // This provides backward compatibility and shorter URIs.
  if (!licenseUri) {
    return true;
  }

  // If a server is specified in the URI, but not in the asset, it's not a
  // match.  It's not clear when this would ever be meaningful, so the decision
  // not to match is arbitrary.
  if (licenseUri && !assetInfo.licenseServers) {
    return false;
  }

  // Otherwise, it's a match only if the license server in the URI matches what
  // is in the asset config.
  for (let k in assetInfo.licenseServers) {
    if (licenseUri == assetInfo.licenseServers[k]) {
      return true;
    }
  }

  return false;
};


/**
 * @param {!Object.<string, string>} params
 * @private
 */
shakaDemo.postBrowserCheckParams_ = function(params) {
  // If a custom asset was given in the URL, select it now.
  if ('asset' in params) {
    let assetList = document.getElementById('assetList');
    let assetUri = params['asset'];
    let licenseUri = params['license'];
    let isDefault = false;
    // Check all options except the last, which is 'custom asset'.
    for (let index = 0; index < assetList.options.length - 1; index++) {
      if (assetList[index].asset &&
          assetList[index].asset.manifestUri == assetUri &&
          shakaDemo.licenseServerMatch_(assetList[index].asset, licenseUri)) {
        assetList.selectedIndex = index;
        isDefault = true;
        break;
      }
    }
    if (isDefault) {
      // Clear the custom fields.
      document.getElementById('manifestInput').value = '';
      document.getElementById('licenseServerInput').value = '';
    } else {
      // It was a custom asset, so put it into the custom field.
      assetList.selectedIndex = assetList.options.length - 1;
      let customAsset = document.getElementById('customAsset');
      customAsset.style.display = 'block';
    }

    // Call updateButtons_ manually, because changing assetList
    // programatically doesn't fire a 'change' event.
    shakaDemo.updateButtons_(/* canHide */ true);
  }

  let smallGapLimit = document.getElementById('smallGapLimit');
  smallGapLimit.placeholder = 0.5; // The default smallGapLimit.
  if ('smallGapLimit' in params) {
    smallGapLimit.value = params['smallGapLimit'];
    // Call onGapInput_ manually, because setting the value
    // programatically doesn't fire 'input' event.
    let fakeEvent = /** @type {!Event} */({target: smallGapLimit});
    shakaDemo.onGapInput_(fakeEvent);
  }

  let jumpLargeGaps = document.getElementById('jumpLargeGaps');
  if ('jumpLargeGaps' in params) {
    jumpLargeGaps.checked = true;
    // Call onJumpLargeGapsChange_ manually, because setting checked
    // programatically doesn't fire a 'change' event.
    let fakeEvent = /** @type {!Event} */({target: jumpLargeGaps});
    shakaDemo.onJumpLargeGapsChange_(fakeEvent);
  } else {
    jumpLargeGaps.checked =
        shakaDemo.player_.getConfiguration().streaming.jumpLargeGaps;
  }

  if ('noadaptation' in params) {
    let enableAdaptation = document.getElementById('enableAdaptation');
    enableAdaptation.checked = false;
    // Call onAdaptationChange_ manually, because setting checked
    // programatically doesn't fire a 'change' event.
    let fakeEvent = /** @type {!Event} */({target: enableAdaptation});
    shakaDemo.onAdaptationChange_(fakeEvent);
  }

  if ('trickplay' in params) {
    let showTrickPlay = document.getElementById('showTrickPlay');
    showTrickPlay.checked = true;
    // Call onTrickPlayChange_ manually, because setting checked
    // programatically doesn't fire a 'change' event.
    let fakeEvent = /** @type {!Event} */({target: showTrickPlay});
    shakaDemo.onTrickPlayChange_(fakeEvent);
  }

  if ('nativecontrols' in params) {
    let showNative = document.getElementById('showNative');
    showNative.checked = true;
    // Call onNativeChange_ manually, because setting checked
    // programatically doesn't fire a 'change' event.
    let fakeEvent = /** @type {!Event} */({target: showNative});
    shakaDemo.onNativeChange_(fakeEvent);
  }

  // Allow the hash to be changed, and give it an initial change.
  shakaDemo.hashCanChange_ = true;
  shakaDemo.hashShouldChange_();

  if ('noinput' in params || 'play' in params) {
    shakaDemo.load();
  }
};


/** @private */
shakaDemo.updateFromHash_ = function() {
  // Hash changes made by us should be ignored.  We only want to respond to hash
  // changes made by the user in the URL bar.
  if (shakaDemo.suppressHashChangeEvent_) {
    shakaDemo.suppressHashChangeEvent_ = false;
    return;
  }

  let params = shakaDemo.getParams_();
  shakaDemo.preBrowserCheckParams_(params);
  shakaDemo.postBrowserCheckParams_(params);
};


/** @private */
shakaDemo.hashShouldChange_ = function() {
  if (!shakaDemo.hashCanChange_) {
    return;
  }

  let params = [];
  let oldParams = shakaDemo.getParams_();

  // Save the current asset.
  let assetUri;
  let licenseServerUri;
  if (shakaDemo.player_) {
    assetUri = shakaDemo.player_.getManifestUri();
    let drmInfo = shakaDemo.player_.drmInfo();
    if (drmInfo) {
      licenseServerUri = drmInfo.licenseServerUri;
    }
  }
  let assetList = document.getElementById('assetList');
  if (assetUri) {
    // Store the currently playing asset URI.
    params.push('asset=' + assetUri);

    // Is the asset a default asset?
    let isDefault = false;
    // Check all options except the last, which is 'custom asset'.
    for (let index = 0; index < assetList.options.length - 1; index++) {
      if (assetList[index].asset.manifestUri == assetUri) {
        isDefault = true;
        break;
      }
    }

    // If it's a custom asset we should store whatever the license
    // server URI is.
    if (!isDefault && licenseServerUri) {
      params.push('license=' + licenseServerUri);
    }
  } else {
    if (assetList.selectedIndex == assetList.length - 1) {
      // It's a custom asset.
      let manifestInputValue = document.getElementById('manifestInput').value;
      if (manifestInputValue) {
        params.push('asset=' + manifestInputValue);
      }

      let licenseInputValue =
          document.getElementById('licenseServerInput').value;
      if (licenseInputValue) {
        params.push('license=' + licenseInputValue);
      }

      let certificateInputValue =
          document.getElementById('certificateInput').value;
      if (certificateInputValue) {
        params.push('certificate=' + certificateInputValue);
      }
    } else {
      // It's a default asset.
      params.push('asset=' +
          assetList[assetList.selectedIndex].asset.manifestUri);
    }
  }

  // Save config panel state.
  if (document.getElementById('smallGapLimit').value.length) {
    params.push('smallGapLimit=' +
        document.getElementById('smallGapLimit').value);
  }
  if (document.getElementById('jumpLargeGaps').checked) {
    params.push('jumpLargeGaps');
  }
  let audioLang = document.getElementById('preferredAudioLanguage').value;
  let textLang = document.getElementById('preferredTextLanguage').value;
  if (textLang != audioLang) {
    params.push('audiolang=' + audioLang);
    params.push('textlang=' + textLang);
  } else {
    params.push('lang=' + audioLang);
  }
  let channels = document.getElementById('preferredAudioChannelCount').value;
  if (channels != '2') {
    params.push('channels=' + channels);
  }
  if (document.getElementById('logToScreen').checked) {
    params.push('logtoscreen');
  }
  if (!document.getElementById('enableAdaptation').checked) {
    params.push('noadaptation');
  }
  if (document.getElementById('showTrickPlay').checked) {
    params.push('trickplay');
  }
  if (document.getElementById('showNative').checked) {
    params.push('nativecontrols');
  }
  let availabilityWindowOverride =
      document.getElementById('availabilityWindowOverride').value;
  if (availabilityWindowOverride) {
    params.push('availabilityWindowOverride=' + availabilityWindowOverride);
  }
  if (shaka.log) {
    let logLevelList = document.getElementById('logLevelList');
    let logLevel = logLevelList[logLevelList.selectedIndex].value;
    if (logLevel != 'info') {
      params.push(logLevel);
    }
  }
  if (document.getElementById('enableLoadOnRefresh').checked) {
    params.push('play');
  }

  // These parameters must be added manually, so preserve them.
  if ('noinput' in oldParams) {
    params.push('noinput');
  }
  if (shakaDemo.startTime_ != undefined) {
    params.push('startTime=' + shakaDemo.startTime_);
  }

  // Store values for drm configuration.
  let videoRobustness =
      document.getElementById('drmSettingsVideoRobustness').value;
  if (videoRobustness) {
    params.push('videoRobustness=' + videoRobustness);
  }
  let audioRobustness =
      document.getElementById('drmSettingsAudioRobustness').value;
  if (audioRobustness) {
    params.push('audioRobustness=' + audioRobustness);
  }

  // These parameters must be added manually, so preserve them.
  // These are only used by the loader in load.js to decide which version of
  // the library to load.
  let buildType = 'uncompiled';
  let strippedHash = '#' + params.join(';');
  if ('build' in oldParams) {
    params.push('build=' + oldParams['build']);
    buildType = oldParams['build'];
  } else if ('compiled' in oldParams) {
    params.push('build=compiled');
    buildType = 'compiled';
  }

  (['compiled', 'debug_compiled', 'uncompiled']).forEach(function(type) {
    let elem = document.getElementById(type + '_link');
    if (buildType == type) {
      elem.classList.add('disabled_link');
      elem.removeAttribute('href');
      elem.title = 'currently selected';
    } else {
      elem.classList.remove('disabled_link');
      elem.onclick = function() {
        location.hash = strippedHash + ';build=' + type;
        location.reload();
        return false;
      };
    }
  });

  // Check if uncompiled mode is supported.  This function is provided by the
  // bootstrapping system in load.js.
  if (!window['shakaUncompiledModeSupported']()) {
    let uncompiledLink = document.getElementById('uncompiled_link');
    uncompiledLink.classList.add('disabled_link');
    uncompiledLink.removeAttribute('href');
    uncompiledLink.title = 'requires a newer browser';
    uncompiledLink.onclick = null;
  }

  let newHash = '#' + params.join(';');
  if (newHash != location.hash) {
    // We want to suppress hashchange events triggered here.  We only want to
    // respond to hashchange events initiated by the user in the URL bar.
    shakaDemo.suppressHashChangeEvent_ = true;
    location.hash = newHash;
  }

  // If search is already blank, setting it triggers a navigation and reloads
  // the page.  Only blank out the search if we have just upgraded from search
  // parameters to hash parameters.
  if (location.search) {
    location.search = '';
  }
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onErrorEvent_ = function(event) {
  let error = event.detail;
  shakaDemo.onError_(error);
};


/**
 * @param {!shaka.util.Error} error
 * @private
 */
shakaDemo.onError_ = function(error) {
  console.error('Player error', error);
  let link = document.getElementById('errorDisplayLink');

  // Don't let less serious or equally serious errors replace what is already
  // shown.  The first error is usually the most important one, and the others
  // may distract us in bug reports.

  // If this is an unexpected non-shaka.util.Error, severity is null.
  if (error.severity == null) {
    // Treat these as the most severe, since they should not happen.
    error.severity = /** @type {shaka.util.Error.Severity} */(99);
  }

  // Always show the new error if:
  //   1. there is no error showing currently
  //   2. the new error is more severe than the old one
  if (link.severity == null ||
      error.severity > link.severity) {
    let message = error.message || ('Error code ' + error.code);
    if (error.code) {
      link.href = '../docs/api/shaka.util.Error.html#value:' + error.code;
    } else {
      link.href = '';
    }
    link.textContent = message;
    // By converting severity == null to 99, non-shaka errors will not be
    // replaced by any subsequent error.
    link.severity = error.severity || 99;
    // Make the link clickable only if we have an error code.
    link.style.pointerEvents = error.code ? 'auto' : 'none';
    document.getElementById('errorDisplay').style.display = 'block';
  }
};


/**
 * Closes the error bar.
 */
shakaDemo.closeError = function() {
  document.getElementById('errorDisplay').style.display = 'none';
  let link = document.getElementById('errorDisplayLink');
  link.href = '';
  link.textContent = '';
  link.severity = null;
};


// IE 9 fires DOMContentLoaded, and enters the "interactive" readyState, before
// document.body has been initialized, so wait for window.load.
if (document.readyState == 'loading' ||
    document.readyState == 'interactive') {
  if (window.attachEvent) {
    // IE8
    window.attachEvent('onload', shakaDemo.init);
  } else {
    window.addEventListener('load', shakaDemo.init);
  }
} else {
  /**
   * Poll for Shaka Player on window.  On IE 11, the document is "ready", but
   * there are still deferred scripts being loaded.  This does not occur on
   * Chrome or Edge, which set the document's state at the correct time.
   */
  let pollForShakaPlayer = function() {
    if (window.shaka) {
      shakaDemo.init();
    } else {
      setTimeout(pollForShakaPlayer, 100);
    }
  };
  pollForShakaPlayer();
}
