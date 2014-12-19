/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Implements the application layer of the test application.
 */


/** @class */
var app = function() {};


/**
 * The video element owned by the app.
 *
 * @private {HTMLVideoElement}
 */
app.video_ = null;


/**
 * The video resolution debug element owned by the app.
 *
 * @private {Element}
 */
app.videoResDebug_ = null;


/**
 * True if the aspect ratio has been set for this playback.
 *
 * @private {boolean}
 */
app.aspectRatioSet_ = false;


/**
 * The player object owned by the app.
 *
 * @private {shaka.player.Player}
 */
app.player_ = null;


/**
 * True if polyfills have been installed.
 *
 * @private {boolean}
 */
app.polyfillsInstalled_ = false;


/**
 * Initializes the application.
 */
app.init = function() {
  // Set default values.
  document.getElementById('forcePrefixed').checked = false;
  document.getElementById('preferredLanguage').value = 'en-US';

  document.getElementById('licenseServerUrlInput').value =
      'assets/test_license.json';
  document.getElementById('mediaUrlInput').value = 'assets/bear-av-enc.mp4';
  document.getElementById('subtitlesUrlInput').value = 'assets/test_subs.vtt';

  document.getElementById('mpdList').value =
      'assets/car_cenc-20120827-manifest.mpd';

  app.video_ =
      /** @type {!HTMLVideoElement} */ (document.getElementById('video'));
  app.videoResDebug_ = document.getElementById('videoResDebug');
  window.setInterval(app.updateVideoSize_, 50);

  var fields = location.search.split('?').pop();
  fields = fields ? fields.split(';') : [];
  var params = {};
  for (var i = 0; i < fields.length; ++i) {
    var kv = fields[i].split('=');
    params[kv[0]] = kv[1];
  }

  if ('prefixed' in params) {
    document.getElementById('forcePrefixed').checked = true;
  }
  if ('lang' in params) {
    document.getElementById('preferredLanguage').value = params['lang'];
  }
  if ('nocenc' in params) {
    document.getElementById('mpdList').value =
        'assets/car-20120827-manifest.mpd';
  }
  if ('vp9' in params) {
    document.getElementById('mpdList').value =
        'assets/feelings_vp9-20130806-manifest.mpd';
  }
  if ('tng' in params) {
    document.getElementById('mpdList').value =
        'assets/angel_one.mpd';
  }
  if ('debug' in params && shaka.log) {
    shaka.log.setLevel(shaka.log.Level.DEBUG);
  }
  if ('v' in params && shaka.log) {
    shaka.log.setLevel(shaka.log.Level.V1);
  }

  app.onMpdChange();

  if ('dash' in params) {
    document.getElementById('streamTypeList').value = 'dash';
    app.onStreamTypeChange();
    app.loadStream();
  } else if ('http' in params) {
    document.getElementById('streamTypeList').value = 'http';
    app.onStreamTypeChange();
    app.loadStream();
  }
};


/**
 * Called when the stream type is changed.
 */
app.onStreamTypeChange = function() {
  var type = document.getElementById('streamTypeList').value;
  var on;
  var off;

  if (type == 'http') {
    on = document.getElementsByClassName('http');
    off = document.getElementsByClassName('dash');
  } else {
    on = document.getElementsByClassName('dash');
    off = document.getElementsByClassName('http');
  }

  for (var i = 0; i < on.length; ++i) {
    on[i].style.display = 'table-row';
  }
  for (var i = 0; i < off.length; ++i) {
    off[i].style.display = 'none';
  }
};


/**
 * Called when a new MPD is selected.
 */
app.onMpdChange = function() {
  document.getElementById('manifestUrlInput').value =
      document.getElementById('mpdList').value;
};


/**
 * Called when the custom MPD field is used.
 */
app.onMpdCustom = function() {
  document.getElementById('mpdList').value = '';
};


/**
 * Called when a new video track is selected.
 */
app.onVideoChange = function() {
  var id = document.getElementById('videoTracks').value;
  document.getElementById('adaptationEnabled').checked = false;
  app.onAdaptationChange();
  app.player_.selectVideoTrack(id);
};


/**
 * Called when adaptation is enabled or disabled.
 */
app.onAdaptationChange = function() {
  var enabled = document.getElementById('adaptationEnabled').checked;
  if (app.player_) {
    app.player_.enableAdaptation(enabled);
  }
};


/**
 * Called when a new audio track is selected.
 */
app.onAudioChange = function() {
  var id = document.getElementById('audioTracks').value;
  app.player_.selectAudioTrack(id);
};


/**
 * Called when a new text track is selected or its enabled state is changed.
 */
app.onTextChange = function() {
  var id = document.getElementById('textTracks').value;
  var enabled = document.getElementById('textEnabled').checked;
  app.player_.selectTextTrack(id);
  app.player_.enableTextTrack(enabled);
};


/**
 * A very lazy demo function to cycle through audio tracks.
 */
app.cycleAudio = function() {
  var intervalId = window.setInterval(function() {
    // On EOF, the video goes into a paused state.
    if (app.video_.paused) {
      window.clearInterval(intervalId);
      return;
    }

    var audioTracks = document.getElementById('audioTracks');
    var option = audioTracks.selectedOptions[0];
    option = option.nextElementSibling || audioTracks.firstElementChild;
    audioTracks.value = option.value;
    app.onAudioChange();
  }, 3000);
};


/**
 * Loads whatever stream type is selected.
 */
app.loadStream = function() {
  var type = document.getElementById('streamTypeList').value;
  if (type == 'http') {
    app.loadHttpStream();
  } else {
    app.loadDashStream();
  }
};


/**
 * Loads an http stream.
 */
app.loadHttpStream = function() {
  if (!app.player_) {
    app.installPolyfills_();
    app.initPlayer_();
  }

  var mediaUrl = document.getElementById('mediaUrlInput').value;
  var keySystem = document.getElementById('keySystemList').value;
  var licenseServerUrl = document.getElementById('licenseServerUrlInput').value;
  var subtitlesUrl = document.getElementById('subtitlesUrlInput').value;
  var drmSchemeInfo = null;
  if (keySystem) {
    drmSchemeInfo = new shaka.player.DrmSchemeInfo(
        keySystem, false, licenseServerUrl, false, null, null);
  }

  app.load_(new shaka.player.HttpVideoSource(mediaUrl, subtitlesUrl,
                                             drmSchemeInfo));
};


/**
 * Loads a dash stream.
 */
app.loadDashStream = function() {
  if (!app.player_) {
    app.installPolyfills_();
    app.initPlayer_();
  }

  var mediaUrl = document.getElementById('manifestUrlInput').value;

  app.load_(
      new shaka.player.DashVideoSource(
          mediaUrl,
          app.interpretContentProtection_));
};


/**
 * Exceptions thrown in 'then' handlers are not seen until catch.
 * Promises can therefore mask what would otherwise be uncaught exceptions.
 * As a utility to work around this, wrap the function in setTimeout so that
 * it is called outside of the Promise's 'then' handler.
 *
 * @param {function(...)} fn
 * @return {function(...)}
 * @private
 */
app.breakOutOfPromise_ = function(fn) {
  return window.setTimeout.bind(window, fn, 0);
};


/**
 * Loads the given video source into the player.
 * @param {!shaka.player.IVideoSource} videoSource
 * @private
 */
app.load_ = function(videoSource) {
  console.assert(app.player_ != null);

  var preferredLanguage = document.getElementById('preferredLanguage').value;
  app.player_.setPreferredLanguage(preferredLanguage);

  app.player_.load(videoSource).then(app.breakOutOfPromise_(
      function() {
        app.displayMetadata_();
      })
  ).catch(function() {});  // Error already handled through error event.
};


/**
 * Displays player metadata on the page.
 * @private
 */
app.displayMetadata_ = function() {
  console.assert(app.player_ != null);
  app.aspectRatioSet_ = false;

  // Populate video tracks.
  var videoTracksList = document.getElementById('videoTracks');
  while (videoTracksList.firstChild) {
    videoTracksList.removeChild(videoTracksList.firstChild);
  }
  var videoTracks = app.player_.getVideoTracks();
  videoTracks.sort(shaka.player.VideoTrack.compare);
  for (var i = 0; i < videoTracks.length; ++i) {
    var track = videoTracks[i];
    var item = document.createElement('option');
    item.textContent = track.width + 'x' + track.height + ', ' +
                       track.bandwidth + ' bits/s';
    item.value = track.id;
    item.selected = track.active;
    videoTracksList.appendChild(item);
  }

  // Populate audio tracks.
  var audioTracksList = document.getElementById('audioTracks');
  while (audioTracksList.firstChild) {
    audioTracksList.removeChild(audioTracksList.firstChild);
  }
  var audioTracks = app.player_.getAudioTracks();
  audioTracks.sort(shaka.player.AudioTrack.compare);
  for (var i = 0; i < audioTracks.length; ++i) {
    var track = audioTracks[i];
    var item = document.createElement('option');
    item.textContent = 'language: ' + track.lang + ', ' +
                       track.bandwidth + ' bits/s';
    item.value = track.id;
    item.selected = track.active;
    audioTracksList.appendChild(item);
  }

  // Populate text tracks.
  var textTracksList = document.getElementById('textTracks');
  while (textTracksList.firstChild) {
    textTracksList.removeChild(textTracksList.firstChild);
  }
  var textTracks = app.player_.getTextTracks();
  textTracks.sort(shaka.player.TextTrack.compare);
  for (var i = 0; i < textTracks.length; ++i) {
    var track = textTracks[i];
    var item = document.createElement('option');
    item.textContent = 'language: ' + track.lang;
    item.value = track.id;
    item.selected = track.active;
    if (track.enabled) {
      document.getElementById('textEnabled').checked = true;
    }
    textTracksList.appendChild(item);
  }
};


/**
 * Requests fullscreen mode.
 */
app.requestFullscreen = function() {
  if (app.player_) {
    app.player_.requestFullscreen();
  }
};


/**
 * Update video resolution information.
 * @private
 */
app.updateVideoSize_ = function() {
  if (app.aspectRatioSet_ == false) {
    var aspect = app.video_.videoWidth / app.video_.videoHeight;
    if (aspect) {
      // Round off common aspect ratios.
      if (Math.abs(aspect - (16 / 9)) < 0.01) {
        aspect = 16 / 9;
      } else if (Math.abs(aspect - (4 / 3)) < 0.01) {
        aspect = 4 / 3;
      }

      // Resize the video tag to match the aspect ratio of the media.
      var h = 576;
      var w = h * aspect;
      app.video_.width = w.toString();
      app.video_.height = h.toString();

      app.aspectRatioSet_ = true;
    }
  }

  app.videoResDebug_.innerText =
      app.video_.videoWidth + ' x ' + app.video_.videoHeight;
};


/**
 * Installs the polyfills if the have not yet been installed.
 * @private
 */
app.installPolyfills_ = function() {
  if (app.polyfillsInstalled_)
    return;

  var forcePrefixedElement = document.getElementById('forcePrefixed');
  var forcePrefixed = forcePrefixedElement.checked;

  // Once the setting is applied, it cannot be changed.
  forcePrefixedElement.disabled = true;
  forcePrefixedElement.title = 'EME choice locked in for this browser session.';

  if (forcePrefixed) {
    window['MediaKeys'] = null;
    window['MediaKeySession'] = null;
    HTMLMediaElement.prototype['setMediaKeys'] = null;
    Navigator.prototype['requestMediaKeySystemAccess'] = null;
  }

  shaka.polyfill.Fullscreen.install();
  shaka.polyfill.MediaKeys.install();
  shaka.polyfill.VideoPlaybackQuality.install();

  app.polyfillsInstalled_ = true;
};


/**
 * Initializes the Player instance.
 * If the Player instance already exists then it is reinitialized.
 * @private
 */
app.initPlayer_ = function() {
  console.assert(app.player_ == null);
  if (app.player_) {
    return;
  }

  app.player_ =
      new shaka.player.Player(/** @type {!HTMLVideoElement} */ (app.video_));
  app.player_.addEventListener('error', app.onPlayerError_, false);
  app.player_.addEventListener('adaptation', app.displayMetadata_, false);

  // Load the adaptation setting.
  app.onAdaptationChange();
};


/**
 * Called when the player generates an error.
 * @param {!Event} event
 * @private
 */
app.onPlayerError_ = function(event) {
  console.error('Player error', event);
};


/**
 * Called to interpret ContentProtection elements from the MPD.
 * @param {!shaka.dash.mpd.ContentProtection} contentProtection The MPD element.
 * @return {shaka.player.DrmSchemeInfo} or null if the element is not
 *     understood by this application.
 * @private
 */
app.interpretContentProtection_ = function(contentProtection) {
  var StringUtils = shaka.util.StringUtils;

  var override = document.getElementById('wvLicenseServerUrlInput');
  if (override.value) {
    // The user is using the test app's UI to override the MPD.
    // This is useful to test external MPDs when no mapping is known in
    // advance.
    return new shaka.player.DrmSchemeInfo(
        'com.widevine.alpha', true, override.value, false, null, null);
  }

  if (contentProtection.schemeIdUri == 'com.youtube.clearkey') {
    // This is the scheme used by YouTube's MediaSource demo.
    var child = contentProtection.children[0];
    var keyid = StringUtils.fromHex(child.getAttribute('keyid'));
    var key = StringUtils.fromHex(child.getAttribute('key'));
    var keyObj = {
      kty: 'oct',
      kid: StringUtils.toBase64(keyid, false),
      k: StringUtils.toBase64(key, false)
    };
    var jwkSet = {keys: [keyObj]};
    var license = JSON.stringify(jwkSet);
    var initData = {
      initData: StringUtils.toUint8Array(keyid),
      initDataType: 'cenc'
    };
    var licenseServerUrl = 'data:application/json;base64,' +
        StringUtils.toBase64(license);
    return new shaka.player.DrmSchemeInfo(
        'org.w3.clearkey', false, licenseServerUrl, false, initData, null);
  }

  if (contentProtection.schemeIdUri ==
      'urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed') {
    // This is the UUID which represents Widevine in the edash-packager.
    var licenseServerUrl = 'http://widevine-proxy.appspot.com/proxy';
    return new shaka.player.DrmSchemeInfo(
        'com.widevine.alpha', true, licenseServerUrl, false, null, null);
  }

  console.warn('Unrecognized scheme: ' + contentProtection.schemeIdUri);
  return null;
};


if (document.readyState == 'complete' ||
    document.readyState == 'interactive') {
  app.init();
} else {
  document.addEventListener('DOMContentLoaded', app.init);
}
