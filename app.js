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
 * The application layer of the test application.
 * @class
 */
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
 * The buffered ahead debug element owned by the app.
 *
 * @private {Element}
 */
app.bufferedAheadDebug_ = null;


/**
 * The buffered behind debug element owned by the app.
 *
 * @private {Element}
 */
app.bufferedBehindDebug_ = null;


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
 * The app's bandwidth estimator, which will persist across playbacks.
 * This will allow second and subsequent playbacks to benefit from earlier
 * bandwidth estimations and avoid starting at a low-quality stream.
 *
 * @private {shaka.util.IBandwidthEstimator}
 */
app.estimator_ = null;


/**
 * True if polyfills have been installed.
 *
 * @private {boolean}
 */
app.polyfillsInstalled_ = false;


/**
 * The list of streams currently stored for offline playback.
 *
 * @private {Array.<string>}
 */
app.offlineStreams_ = [];


/**
 * @type {boolean} The state of adaptation before video cycling was started.
 * @private
 */
app.originalAdaptationEnabled_ = true;


/**
 * @type {?number} The lastest audio cycle interval set.
 * @private
 */
app.audioCycleInterval_ = null;


/**
 * @type {?number} The lastest video cycle interval set.
 * @private
 */
app.videoCycleInterval_ = null;


/**
 * Initializes the application.
 */
app.init = function() {
  // Display the version number.
  document.getElementById('version').textContent = shaka.player.Player.version;

  // Set default values.
  document.getElementById('forcePrefixed').checked = false;
  document.getElementById('preferredLanguage').value = 'en-US';

  document.getElementById('licenseServerUrlInput').value =
      'assets/test_license.json';
  document.getElementById('mediaUrlInput').value = 'assets/bear-av-enc.webm';
  document.getElementById('subtitlesUrlInput').value = 'assets/test_subs.vtt';

  document.getElementById('mpdList').value =
      'assets/car_cenc-20120827-manifest.mpd';

  app.video_ =
      /** @type {!HTMLVideoElement} */ (document.getElementById('video'));
  app.videoResDebug_ = document.getElementById('videoResDebug');
  app.bufferedAheadDebug_ = document.getElementById('bufferedAheadDebug');
  app.bufferedBehindDebug_ = document.getElementById('bufferedBehindDebug');
  window.setInterval(app.updateDebugInfo_, 50);

  var fields = location.search.split('?').slice(1).join('?');
  fields = fields ? fields.split(';') : [];
  var params = {};
  for (var i = 0; i < fields.length; ++i) {
    var kv = fields[i].split('=');
    params[kv[0]] = kv.slice(1).join('=');
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

  // Retrieve and verify list of offline streams
  shaka.player.OfflineVideoSource.retrieveGroupIds().then(
      /** @param {!Array.<number>} groupIds */
      function(groupIds) {
        var groups = app.getOfflineGroups_();
        for (var i in groupIds) {
          var id = groupIds[i];
          var value = groups[id];
          if (!value) {
            value = 'Unknown Stream ID ' + id;
          }
          app.addOfflineStream_(value, id);
        }

        if ('offline' in params) {
          app.loadStream();
          app.onStreamTypeChange();
        }
      }
  ).catch(
      function(e) {
        console.error('Failed to retrieve group IDs', e);
      }
  );

  app.onMpdChange();

  playerControls.init(app.video_);

  if ('asset' in params) {
    document.getElementById('manifestUrlInput').value = params['asset'];
    app.onMpdCustom();
  }
  if ('license' in params) {
    document.getElementById('wvLicenseServerUrlInput').value =
        params['license'];
  }

  if ('dash' in params) {
    document.getElementById('streamTypeList').value = 'dash';
    app.loadStream();
  } else if ('http' in params) {
    document.getElementById('streamTypeList').value = 'http';
    app.loadStream();
  } else if ('offline' in params) {
    document.getElementById('streamTypeList').value = 'offline';
    // loadStream() deferred until group IDs loaded
  }
  app.onStreamTypeChange();

  if ('cycleVideo' in params) {
    document.getElementById('cycleVideo').checked = true;
    app.cycleVideo();
  }
  if ('cycleAudio' in params) {
    document.getElementById('cycleAudio').checked = true;
    app.cycleAudio();
  }
  app.video_.addEventListener('ended', function() {
    app.resetCycleState_('videoTracks', 'cycleVideo', true);
    app.resetCycleState_('audioTracks', 'cycleAudio', false);
  });
};


/**
 * Called when the stream type is changed.
 */
app.onStreamTypeChange = function() {
  var type = document.getElementById('streamTypeList').value;
  var on, off;
  var enable = document.querySelectorAll('#loadButton, #deleteButton');
  var disable = [];

  if (type == 'http') {
    on = document.querySelectorAll('.http');
    off = document.querySelectorAll('.dash, .offline');
  } else if (type == 'dash') {
    on = document.querySelectorAll('.dash');
    off = document.querySelectorAll('.http, .offline');
  } else if (type == 'offline') {
    on = document.querySelectorAll('.offline');
    off = document.querySelectorAll('.dash, .http');
    if (document.getElementById('offlineStreamList').options.length == 0) {
      disable = enable;
      enable = [];
    }
  }

  for (var i = 0; i < on.length; ++i) {
    on[i].style.display = 'table-row';
  }
  for (var i = 0; i < off.length; ++i) {
    off[i].style.display = 'none';
  }
  for (var i = 0; i < disable.length; ++i) {
    disable[i].disabled = true;
  }
  for (var i = 0; i < enable.length; ++i) {
    enable[i].disabled = false;
  }
};


/**
 * Called when a new MPD is selected.
 */
app.onMpdChange = function() {
  var mpd = document.getElementById('mpdList').value;
  document.getElementById('manifestUrlInput').value = mpd;
  app.checkMpdStorageStatus_();
};


/**
 * Called when the custom MPD field is used.
 */
app.onMpdCustom = function() {
  document.getElementById('mpdList').value = '';
  app.checkMpdStorageStatus_();
};


/**
 * Called when the MPD field changes to check the MPD's storage status.
 * @private
 */
app.checkMpdStorageStatus_ = function() {
  var mpd = document.getElementById('manifestUrlInput').value;
  if (app.offlineStreams_.indexOf(mpd) >= 0) {
    app.updateStoreButton_(true, 'Stream already stored');
  } else {
    app.updateStoreButton_(false, 'Store stream offline');
  }
};


/**
 * Called when a new video track is selected.
 *
 * @param {boolean=} opt_clearBuffer If true (and by default), removes the
 *     previous stream's content before switching to the new stream.
 */
app.onVideoChange = function(opt_clearBuffer) {
  var id = document.getElementById('videoTracks').value;
  document.getElementById('adaptationEnabled').checked = false;
  app.onAdaptationChange();
  app.player_.selectVideoTrack(id, opt_clearBuffer);
};


/**
 * Called when trick play is enabled or disabled.
 */
app.onTrickPlayChange = function() {
  var enable = document.getElementById('trickPlayEnabled').checked;
  playerControls.enableTrickPlayButtons(enable);
  if (!enable && app.player_) {
    app.player_.setPlaybackRate(1.0);
  }
};


/**
 * Called when adaptation is enabled or disabled.
 */
app.onAdaptationChange = function() {
  var enabled = document.getElementById('adaptationEnabled').checked;
  if (app.player_) {
    app.player_.configure({'enableAdaptation': enabled});
  }
};


/**
 * Called when a new audio track is selected.
 *
 * @param {boolean=} opt_clearBuffer If true (and by default), removes the
 *     previous stream's content before switching to the new stream.
 */
app.onAudioChange = function(opt_clearBuffer) {
  var id = document.getElementById('audioTracks').value;
  app.player_.selectAudioTrack(id, opt_clearBuffer);
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
 * A demo function to cycle through audio tracks.
 */
app.cycleAudio = function() {
  app.cycleTracks_('cycleAudio', 'audioTracks', 3, function() {
    app.onAudioChange(false);
  }, false);
};


/**
 * A demo function to cycle through video tracks.
 */
app.cycleVideo = function() {
  if (document.getElementById('cycleVideo').checked) {
    // Disable adaptation.
    var adaptationEnabled = document.getElementById('adaptationEnabled');
    app.originalAdaptationEnabled_ = adaptationEnabled.checked;
    adaptationEnabled.checked = false;
    adaptationEnabled.disabled = true;
    app.onAdaptationChange();
  }

  app.cycleTracks_('cycleVideo', 'videoTracks', 6, function() {
    // Select video track with immediate == false.  This switches in the same
    // smooth way as the AbrManager.
    app.onVideoChange(false);
  }, true);
};


/**
 * Common functionality for cycling through tracks.
 * @param {string} checkboxId
 * @param {string} tracksId
 * @param {number} seconds
 * @param {function()} onSelect
 * @param {boolean} isVideo
 * @private
 */
app.cycleTracks_ = function(checkboxId, tracksId, seconds, onSelect, isVideo) {
  var tracks = document.getElementById(tracksId);
  if (document.getElementById(checkboxId).checked) {
    // Prevent the user from changing the settings while we are cycling.
    tracks.disabled = true;

    var intervalId = window.setInterval(function() {
      var option = tracks.selectedOptions[0];
      if (option) {
        option = option.nextElementSibling || tracks.firstElementChild;
        tracks.value = option.value;
        onSelect();
      } else {
        app.resetCycleState_(tracksId, checkboxId, isVideo);
      }
    }, seconds * 1000);

    isVideo ? app.videoCycleInterval_ = intervalId :
        app.audioCycleInterval_ = intervalId;
  } else {
    app.resetCycleState_(tracksId, checkboxId, isVideo);
  }
};


/**
 * Resets the state of a cycle checkbox.
 * @param {string} tracksId
 * @param {string} checkboxId
 * @param {boolean} isVideo
 * @private
 */
app.resetCycleState_ = function(tracksId, checkboxId, isVideo) {
  var intervalId = isVideo ? app.videoCycleInterval_ : app.audioCycleInterval_;
  window.clearInterval(intervalId);
  document.getElementById(tracksId).disabled = false;
  document.getElementById(checkboxId).checked = false;
  if (isVideo) {
    // Re-enable adaptation.
    var adaptationEnabled = document.getElementById('adaptationEnabled');
    adaptationEnabled.disabled = false;
    adaptationEnabled.checked = app.originalAdaptationEnabled_;
    app.onAdaptationChange();
  }
};


/**
 * Deletes a group from storage.
 */
app.deleteStream = function() {
  if (!app.player_) {
    app.installPolyfills_();
    app.initPlayer_();
  }

  var deleteButton = document.getElementById('deleteButton');
  deleteButton.disabled = true;
  deleteButton.textContent = 'Deleting stream...';

  var offlineList = document.getElementById('offlineStreamList');
  var groupId = parseInt(offlineList.value, 10);
  var text = offlineList.options[offlineList.selectedIndex].text;
  console.assert(app.estimator_);
  var estimator = /** @type {!shaka.util.IBandwidthEstimator} */(
      app.estimator_);
  var abrManager = new shaka.media.SimpleAbrManager();
  var offlineSource = new shaka.player.OfflineVideoSource(
      groupId, estimator, abrManager);
  offlineSource.deleteGroup().then(
      function() {
        var deleted = app.offlineStreams_.indexOf(text);
        app.offlineStreams_.splice(deleted, 1);
        offlineList.removeChild(offlineList.childNodes[deleted]);
        var groups = app.getOfflineGroups_();
        delete groups[groupId];
        app.setOfflineGroups_(groups);
        app.removeOfflineStream_(groupId);
        deleteButton.textContent = 'Delete stream from storage';
        app.onStreamTypeChange();
        app.onMpdChange();
      }
  ).catch(
      function(e) {
        console.error('Error deleting stream', e);
        deleteButton.textContent = 'Delete stream from storage';
      });
};


/**
 * Stores a DASH stream for offline playback.
 */
app.storeStream = function() {
  app.updateStoreButton_(true, 'Storing...');

  if (!app.player_) {
    app.installPolyfills_();
    app.initPlayer_();
  }
  var mediaUrl = document.getElementById('manifestUrlInput').value;
  var preferredLanguage = document.getElementById('preferredLanguage').value;

  console.assert(app.estimator_);
  var estimator = /** @type {!shaka.util.IBandwidthEstimator} */(
      app.estimator_);
  var abrManager = new shaka.media.SimpleAbrManager();
  var offlineSource = new shaka.player.OfflineVideoSource(
      null, estimator, abrManager);
  offlineSource.addEventListener('progress', app.progressEventHandler_);
  offlineSource.store(
      mediaUrl, preferredLanguage, app.interpretContentProtection_,
      app.chooseOfflineTracks_.bind(null, offlineSource)
  ).then(
      function(groupId) {
        var groups = app.getOfflineGroups_();
        groups[groupId] = mediaUrl;
        app.setOfflineGroups_(groups);
        app.addOfflineStream_(mediaUrl, groupId);
        app.updateStoreButton_(true, 'Stream already stored');
        app.switchToOfflineStream_(groupId.toString());
      }
  ).catch(
      function(e) {
        console.error('Error storing stream', e);
        app.updateStoreButton_(false, 'Store stream offline');
      });
};


/**
 * Event handler for offline storage progress events.
 * @param {!Event} e
 * @private
 */
app.progressEventHandler_ = function(e) {
  app.updateStoreButton_(true, e.detail.toFixed(2) + ' percent stored');
};


/**
 * Get a map of MPD URLs to group IDs for all streams stored offline.
 * @return {!Object.<number, string>}
 * @private
 */
app.getOfflineGroups_ = function() {
  try {
    var data = window.localStorage.getItem('offlineGroups') || '{}';
    // JSON.parse can throw if the data stored isn't valid JSON.
    var groups = JSON.parse(data);
    return /** @type {!Object.<number, string>} */(groups);
  } catch (exception) {
    console.debug('Disregarding stored offlineGroups.');
    return {};
  }
};


/**
 * Store a map of group IDs to MPD URLs for all streams stored offline.
 * @param {!Object.<number, string>} groups
 * @private
 */
app.setOfflineGroups_ = function(groups) {
  window.localStorage.setItem('offlineGroups', JSON.stringify(groups));
};


/**
 * Updates the store button state.
 * @param {boolean} disabled True if the button should be disabled.
 * @param {string} text Text the button should display.
 * @private
 */
app.updateStoreButton_ = function(disabled, text) {
  var storeButton = document.getElementById('storeButton');
  storeButton.disabled = disabled;
  storeButton.textContent = text;
};


/**
 * Switch to the Offline stream interface within the app, with the groupId's
 * value targeted.
 * @param {string} groupId The id assigned to this stream by storage.
 * @private
 */
app.switchToOfflineStream_ = function(groupId) {
  document.getElementById('streamTypeList').value = 'offline';
  app.onStreamTypeChange();
  document.getElementById('offlineStreamList').value = groupId;
};


/**
 * Add an item to the list of offline streams in the test app UI.
 * @param {string} text The text associated with this stream.
 * @param {number} groupId The id assigned to this stream by storage.
 * @private
 */
app.addOfflineStream_ = function(text, groupId) {
  app.offlineStreams_.push(text);
  var item = document.createElement('option');
  item.textContent = text;
  item.value = groupId;
  document.getElementById('offlineStreamList').appendChild(item);
};


/**
 * Remove an item from the list of offline streams in the test app UI.
 * @param {number} groupId The id assigned to this stream by storage.
 * @private
 */
app.removeOfflineStream_ = function(groupId) {
  var list = document.getElementById('offlineStreamList');
  var options = list.options;
  for (var i = 0; i < options.length; ++i) {
    if (options[i].value == groupId) {
      list.removeChild(options[i]);
      return;
    }
  }
};


/**
 * Loads whatever stream type is selected.
 */
app.loadStream = function() {
  var type = document.getElementById('streamTypeList').value;
  if (type == 'http') {
    app.loadHttpStream();
  } else if (type == 'dash') {
    app.loadDashStream();
  } else {
    app.loadOfflineStream();
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
  var config = keySystem ?
               {'keySystem': keySystem, 'licenseServerUrl': licenseServerUrl} :
               {};
  app.load_(new shaka.player.HttpVideoSource(mediaUrl, subtitlesUrl, config));
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

  console.assert(app.estimator_);
  if (app.estimator_.getDataAge() >= 3600) {
    // Disregard any bandwidth data older than one hour.  The user may have
    // changed networks if they are on a laptop or mobile device.
    app.estimator_ = new shaka.util.EWMABandwidthEstimator();
  }

  var estimator = /** @type {!shaka.util.IBandwidthEstimator} */(
      app.estimator_);
  var abrManager = new shaka.media.SimpleAbrManager();
  app.load_(
      new shaka.player.DashVideoSource(
          mediaUrl,
          app.interpretContentProtection_,
          estimator,
          abrManager));
};


/**
 * Loads an offline stream.
 */
app.loadOfflineStream = function() {
  if (!app.player_) {
    app.installPolyfills_();
    app.initPlayer_();
  }
  var groupId = parseInt(
      document.getElementById('offlineStreamList').value, 10);
  console.assert(app.estimator_);
  var estimator = /** @type {!shaka.util.IBandwidthEstimator} */(
      app.estimator_);
  var abrManager = new shaka.media.SimpleAbrManager();
  app.load_(new shaka.player.OfflineVideoSource(
      groupId, estimator, abrManager));
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
  app.player_.configure({'preferredLanguage': preferredLanguage});

  app.player_.load(videoSource).then(app.breakOutOfPromise_(
      function() {
        app.aspectRatioSet_ = false;
        app.displayMetadata_();
        playerControls.setLive(app.player_.isLive());
      })
  ).catch(function() {});  // Error already handled through error event.
};


/**
 * Displays player metadata on the page.
 * @private
 */
app.displayMetadata_ = function() {
  console.assert(app.player_ != null);

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
 * Update the debug information.
 * @private
 */
app.updateDebugInfo_ = function() {
  app.updateVideoResDebug_();
  app.updateBufferDebug_();
};


/**
 * Update the video resolution information.
 * @private
 */
app.updateVideoResDebug_ = function() {
  console.assert(app.videoResDebug_);

  if (app.aspectRatioSet_ == false) {
    var aspect = app.video_.videoWidth / app.video_.videoHeight;
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
      app.video_.parentElement.style.width = w.toString() + 'px';
      app.video_.parentElement.style.height = h.toString() + 'px';

      app.aspectRatioSet_ = true;
    }
  }

  app.videoResDebug_.textContent =
      app.video_.videoWidth + ' x ' + app.video_.videoHeight;
};


/**
 * Update the buffer information.
 * @private
 */
app.updateBufferDebug_ = function() {
  console.assert(app.bufferedAheadDebug_ && app.bufferedBehindDebug_);

  var currentTime = app.video_.currentTime;
  var buffered = app.video_.buffered;
  var ahead = 0;
  var behind = 0;

  for (var i = 0; i < buffered.length; ++i) {
    if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
      ahead = buffered.end(i) - currentTime;
      behind = currentTime - buffered.start(i);
      break;
    }
  }

  app.bufferedAheadDebug_.textContent = Math.round(ahead) + ' seconds';
  app.bufferedBehindDebug_.textContent = Math.round(behind) + ' seconds';
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

  shaka.polyfill.installAll();

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
  app.player_.addEventListener('error', app.onPlayerError_);
  app.player_.addEventListener('adaptation', app.displayMetadata_);
  app.player_.addEventListener('bufferingStart',
      playerControls.onBuffering.bind(null, true));
  app.player_.addEventListener('bufferingEnd',
      playerControls.onBuffering.bind(null, false));
  app.player_.addEventListener('seekrangechanged',
      playerControls.onSeekRangeChanged);
  app.player_.addEventListener('trackschanged', app.displayMetadata_);

  app.estimator_ = new shaka.util.EWMABandwidthEstimator();
  playerControls.setPlayer(app.player_);

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
 * @param {!string} schemeIdUri
 * @param {!Element} contentProtection The ContentProtection XML element.
 * @return {Array.<shaka.player.DrmInfo.Config>}
 * @private
 */
app.interpretContentProtection_ = function(schemeIdUri, contentProtection) {
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  var wvLicenseServerUrlOverride =
      document.getElementById('wvLicenseServerUrlInput').value || null;

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
    var licenseServerUrl = null;
    for (var i = 0; i < contentProtection.childNodes.length; ++i) {
      var child = contentProtection.childNodes[i];
      if (child.nodeName == 'yt:SystemURL' &&
          child.getAttribute('type') == 'widevine') {
        licenseServerUrl = wvLicenseServerUrlOverride || child.textContent;
        break;
      }
    }
    if (licenseServerUrl) {
      return [{
        'keySystem': 'com.widevine.alpha',
        'licenseServerUrl': licenseServerUrl,
        'licensePostProcessor': app.postProcessYouTubeLicenseResponse_
      }];
    }
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
    return null;
  }

  console.warn('Unrecognized scheme:', schemeIdUri);
  return null;
};


/**
 * Post-process the YouTube license server's response, which has headers before
 * the actual license.
 *
 * @param {!Uint8Array} response
 * @return {!Uint8Array}
 * @private
 */
app.postProcessYouTubeLicenseResponse_ = function(response) {
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
          var restrictions = app.player_.getConfiguration()['restrictions'];
          restrictions.maxHeight = 576;
          app.player_.configure({'restrictions': restrictions});
        }
      }
    }
  }
  return Uint8ArrayUtils.fromString(responseStr);
};


/**
 * Called to choose tracks for offline storage.
 * @param {!shaka.player.OfflineVideoSource} videoSource
 * @return {!Promise.<!Array.<number>>} A promise to an array of track IDs.
 * @private
 */
app.chooseOfflineTracks_ = function(videoSource) {
  var ids = [];

  var videoTracks = videoSource.getVideoTracks();
  if (videoTracks.length) {
    videoTracks.sort(shaka.player.VideoTrack.compare);
    // Initially, choose the smallest track.
    var track = videoTracks[0];
    // Remove HD tracks (larger than 576p).
    videoTracks = videoTracks.filter(function(track) {
      return track.width <= 1024 && track.height <= 576;
    });
    // If there are any left, choose the largest one.
    if (videoTracks.length) {
      track = videoTracks.pop();
    }
    ids.push(track.id);
  }

  var audioTracks = videoSource.getAudioTracks();
  if (audioTracks.length) {
    // The video source gives you the preferred language first.
    // Remove any tracks from other languages first.
    var lang = audioTracks[0].lang;
    audioTracks = audioTracks.filter(function(track) {
      return track.lang == lang;
    });
    // From what's left, choose the middle stream.  If we have high, medium,
    // and low quality audio, this is medium.  If we only have high and low,
    // this is high.
    var index = Math.floor(audioTracks.length / 2);
    ids.push(audioTracks[index].id);
  }

  var textTracks = videoSource.getTextTracks();
  if (textTracks.length) {
    // Ask for all text tracks to be saved.
    textTracks.forEach(function(track) {
      ids.push(track.id);
    });
  }

  // This could just as well be an asynchronous method that involves user input.
  return Promise.resolve(ids);
};


if (document.readyState == 'complete' ||
    document.readyState == 'interactive') {
  app.init();
} else {
  document.addEventListener('DOMContentLoaded', app.init);
}
