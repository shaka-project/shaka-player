/**
 * @license
 * Copyright 2015 Google Inc.
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
 * Application utility class.
 * @class
 */
var appUtils = function() {};


/**
 * @typedef {{
 *    time: number,
 *    manifest: string
 *  }}
 */
appUtils.StreamState;


/**
 * True if the aspect ratio has been set for this playback.
 *
 * @private {boolean}
 */
appUtils.aspectRatioSet_ = false;


/**
 * Exceptions thrown in 'then' handlers are not seen until catch.
 * Promises can therefore mask what would otherwise be uncaught exceptions.
 * As a utility to work around this, wrap the function in setTimeout so that
 * it is called outside of the Promise's 'then' handler.
 *
 * @param {function(...)} fn
 * @return {function(...)}
 */
appUtils.breakOutOfPromise = function(fn) {
  return window.setTimeout.bind(window, fn, 0);
};


/**
 * Returns the buffer information.
 * @param {HTMLVideoElement} video
 * @return {Array.<string>} ['buffered ahead info', 'buffered behind info']
 */
appUtils.getBufferDebug = function(video) {
  var currentTime = video.currentTime;
  var buffered = video.buffered;
  var ahead = 0;
  var behind = 0;

  for (var i = 0; i < buffered.length; ++i) {
    if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
      ahead = buffered.end(i) - currentTime;
      behind = currentTime - buffered.start(i);
      break;
    }
  }

  return [Math.round(ahead) + ' seconds', Math.round(behind) + ' seconds'];
};


/**
 * Returns the video resolution information.
 * @param {HTMLVideoElement} video
 * @return {string}
 */
appUtils.getVideoResDebug = function(video) {
  if (appUtils.aspectRatioSet_ == false) {
    var aspect = video.videoWidth / video.videoHeight;
    if (aspect) {
      // Round off common aspect ratios.
      if (Math.abs(aspect - (16 / 9)) < 0.01) {
        aspect = 16 / 9;
      } else if (Math.abs(aspect - (4 / 3)) < 0.01) {
        aspect = 4 / 3;
      }

      // Resize the video container to match the aspect ratio of the media.
      var h = 576;
      var w = h * aspect;
      video.parentElement.style.width = w.toString() + 'px';
      video.parentElement.style.height = h.toString() + 'px';

      appUtils.aspectRatioSet_ = true;
    }
  }
  return video.videoWidth + ' x ' + video.videoHeight;
};


/**
 * Called to interpret ContentProtection elements from the MPD.
 * @param {shaka.player.Player} player
 * @param {?string} wvLicenseServerUrl Override the license server URL.
 *    If none, give an empty string.
 * @param {!string} schemeIdUri
 * @param {!Node} contentProtection The ContentProtection XML element.
 * @return {Array.<shaka.player.DrmInfo.Config>}
 */
appUtils.interpretContentProtection = function(
    player, wvLicenseServerUrl, schemeIdUri, contentProtection) {
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
  var wvLicenseServerUrlOverride = wvLicenseServerUrl || null;

  if (schemeIdUri == 'com.youtube.clearkey') {
    // This is the scheme used by YouTube's MediaSource demo.
    var license;
    for (var i = 0; i < contentProtection.childNodes.length; ++i) {
      var child = contentProtection.childNodes[i];
      if (child.nodeName == 'ytdrm:License') {
        license = child;
        break;
      }
    }
    if (!license) {
      return null;
    }
    var keyid = Uint8ArrayUtils.fromHex(license.getAttribute('keyid'));
    var key = Uint8ArrayUtils.fromHex(license.getAttribute('key'));
    var keyObj = {
      kty: 'oct',
      kid: Uint8ArrayUtils.toBase64(keyid, false),
      k: Uint8ArrayUtils.toBase64(key, false)
    };
    var jwkSet = {keys: [keyObj]};
    license = JSON.stringify(jwkSet);
    var initData = {
      'initData': keyid,
      'initDataType': 'webm'
    };
    var licenseServerUrl = 'data:application/json;base64,' +
        window.btoa(license);
    return [{
      'keySystem': 'org.w3.clearkey',
      'licenseServerUrl': licenseServerUrl,
      'initData': initData
    }];
  }

  if (schemeIdUri == 'http://youtube.com/drm/2012/10/10') {
    // This is another scheme used by YouTube.
    var configs = [];
    var postProcessor =
        appUtils.postProcessYouTubeLicenseResponse_.bind(null, player);
    var playReadyPreProcessor = appUtils.preProcessYouTubePlayReadyRequest_;

    for (var i = 0; i < contentProtection.childNodes.length; ++i) {
      var child = contentProtection.childNodes[i];
      if (child.nodeName == 'yt:SystemURL') {
        var licenseServerUrl = wvLicenseServerUrlOverride || child.textContent;
        if (child.getAttribute('type') == 'widevine') {
          configs.push({
            'keySystem': 'com.widevine.alpha',
            'licenseServerUrl': licenseServerUrl,
            'licensePostProcessor': postProcessor
          });
        } else if (child.getAttribute('type') == 'playready') {
          configs.push({
            'keySystem': 'com.microsoft.playready',
            'licenseServerUrl': licenseServerUrl,
            'licensePostProcessor': postProcessor,
            'licensePreProcessor': playReadyPreProcessor
          });
        }
      }
    }
    return configs;
  }

  if (schemeIdUri.toLowerCase() ==
      'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed') {
    // This is the UUID which represents Widevine in the edash-packager.
    var licenseServerUrl =
        wvLicenseServerUrlOverride || '//widevine-proxy.appspot.com/proxy';
    return [{
      'keySystem': 'com.widevine.alpha',
      'licenseServerUrl': licenseServerUrl
    }];
  }

  if (schemeIdUri == 'urn:mpeg:dash:mp4protection:2011') {
    // Ignore without a warning.
    var isOnlyProtection =
      !!contentProtection.parentNode.querySelectorAll('ContentProtection').length;
    if (isOnlyProtection) {
      return [{
        'keySystem': 'com.microsoft.playready',
        'licenseServerUrl': 'http://playready.directtaps.net/pr/svc/rightsmanager.asmx?PlayRight=1&UseSimpleNonPersistentLicense=1',
      }];
    }
    return null;
  }

  console.warn('Unrecognized scheme:', schemeIdUri);
  return null;
};


/**
 * Post-process the YouTube license server's response, which has headers before
 * the actual license.
 * @param {shaka.player.Player} player
 * @param {!Uint8Array} response
 * @return {!Uint8Array}
 * @private
 */
appUtils.postProcessYouTubeLicenseResponse_ = function(player, response) {
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
  var responseStr = Uint8ArrayUtils.toString(response);
  var index = responseStr.indexOf('\r\n\r\n');
  if (index >= 0) {
    // Strip off the headers.
    var headers = responseStr.substr(0, index).split('\r\n');
    responseStr = responseStr.substr(index + 4);
    console.info('YT HEADERS:', headers);

    // Check for restrictions on HD content.
    for (var i = 0; i < headers.length; ++i) {
      var k = headers[i].split(': ')[0];
      var v = headers[i].split(': ')[1];
      if (k == 'Authorized-Format-Types') {
        var types = v.split(',');
        if (types.indexOf('HD') == -1) {
          // This license will not permit HD playback.
          console.info('HD disabled.');
          var restrictions = player.getConfiguration()['restrictions'];
          restrictions.maxHeight = 576;
          player.configure({'restrictions': restrictions});
        }
      }
    }
  }
  return Uint8ArrayUtils.fromString(responseStr);
};


/**
 * Pre-process YouTube PlayReady license requests.
 * @param {!shaka.player.DrmInfo.LicenseRequestInfo} info
 * @private
 */
appUtils.preProcessYouTubePlayReadyRequest_ = function(info) {
  // The headers added by the standard pre-processor are not accepted by the YT
  // frontend.
  info.headers = {};
};
