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
 * State of the stream currently playing.
 * @type {appUtils.StreamState}
 * @private
 */
app.streamState_ = {'manifest': '', 'time': 0};


/**
 * Initializes the application.
 */
app.init = function() {
  // Display the version number.
  document.getElementById('version').textContent = shaka.player.Player.version;

  // Set default values.
  document.getElementById('preferredLanguage').value = 'en-US';

  document.getElementById('licenseServerUrlInput').value =
      'assets/test_license.json';
  document.getElementById('mediaUrlInput').value = 'assets/bear-av-enc.webm';
  document.getElementById('subtitlesUrlInput').value = 'assets/test_subs.vtt';

  document.getElementById('mpdList').value =
      'assets/car_cenc-20120827-manifest.mpd';

  shaka.polyfill.installAll();

  app.video_ =
      /** @type {!HTMLVideoElement} */ (document.getElementById('video'));
  app.videoResDebug_ = document.getElementById('videoResDebug');
  app.bufferedAheadDebug_ = document.getElementById('bufferedAheadDebug');
  app.bufferedBehindDebug_ = document.getElementById('bufferedBehindDebug');
  window.setInterval(app.updateDebugInfo_, 50);

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

  var fields = location.search.split('?').slice(1).join('?');
  fields = fields ? fields.split(';') : [];
  var params = {};
  for (var i = 0; i < fields.length; ++i) {
    var kv = fields[i].split('=');
    params[kv[0]] = kv.slice(1).join('=');
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
 * Switches a locally playing stream to cast.
 */
app.switchStreamToCast = function() {
  // Stream has already been loaded into the player.
  // Only supporting DASH streams.
  if (app.video_.src && app.streamState_.manifest != '') {
    app.streamState_.time = app.video_.currentTime;
    sender.loadStream(app.streamState_);
    app.player_.unload();
  }
};


/**
 * Enables or disabled the stream options.
 * @param {boolean} enable True to enable stream options.
 */
app.enableStreamOptions = function(enable) {
  var options = document.querySelectorAll('.streamOption');
  for (var i = 0; i < options.length; ++i) {
    options[i].disabled = !enable;
  }
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
  if (!app.player_) return;
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

  var mediaUrl = document.getElementById('manifestUrlInput').value;
  var preferredLanguage = document.getElementById('preferredLanguage').value;

  console.assert(app.estimator_);
  var estimator = /** @type {!shaka.util.IBandwidthEstimator} */(
      app.estimator_);
  var abrManager = new shaka.media.SimpleAbrManager();
  var offlineSource = new shaka.player.OfflineVideoSource(
      null, estimator, abrManager);
  offlineSource.addEventListener('progress', app.progressEventHandler_);
  var wvServerUrl = document.getElementById('wvLicenseServerUrlInput').value;
  offlineSource.store(
      mediaUrl,
      preferredLanguage,
      appUtils.interpretContentProtection.bind(null, app.player_, wvServerUrl),
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
  // Set the cross-origin flag to anonymous to allow loading subtitle tracks
  // cross-origin, as in the Angel One clip.
  // TODO: Remove this when subtitles no longer use the track element.
  app.video_.crossOrigin = 'anonymous';

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
  var mediaUrl = document.getElementById('mediaUrlInput').value;
  var keySystem = document.getElementById('keySystemList').value;
  var licenseServerUrl = document.getElementById('licenseServerUrlInput').value;
  var subtitlesUrl = document.getElementById('subtitlesUrlInput').value;
  var config = keySystem ?
               {'keySystem': keySystem, 'licenseServerUrl': licenseServerUrl} :
               {'keySystem': ''};
  app.load_(new shaka.player.HttpVideoSource(mediaUrl, subtitlesUrl, config));
};


/**
 * Loads a dash stream.
 */
app.loadDashStream = function() {
  var mediaUrl = document.getElementById('manifestUrlInput').value;
  app.streamState_.manifest = mediaUrl;
  if (sender.state == sender.states.CAST_CONNECTED) {
    sender.loadStream(app.streamState_);
  } else {
    console.assert(app.estimator_);
    if (app.estimator_.getDataAge() >= 3600) {
      // Disregard any bandwidth data older than one hour.  The user may have
      // changed networks if they are on a laptop or mobile device.
      app.estimator_ = new shaka.util.EWMABandwidthEstimator();
    }

    var estimator = /** @type {!shaka.util.IBandwidthEstimator} */(
        app.estimator_);
    var abrManager = new shaka.media.SimpleAbrManager();
    var wvServerUrl = document.getElementById('wvLicenseServerUrlInput').value;
    app.load_(
        new shaka.player.DashVideoSource(
            mediaUrl,
            appUtils.interpretContentProtection.bind(
                null, app.player_, wvServerUrl),
            estimator,
            abrManager));
  }
};


/**
 * Loads an offline stream.
 */
app.loadOfflineStream = function() {
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
 * Loads the given video source into the player.
 * @param {!shaka.player.IVideoSource} videoSource
 * @private
 */
app.load_ = function(videoSource) {
  console.assert(app.player_ != null);

  var preferredLanguage = document.getElementById('preferredLanguage').value;
  app.player_.configure({'preferredLanguage': preferredLanguage});

  app.player_.load(videoSource).then(appUtils.breakOutOfPromise(
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
  if (sender.state == sender.states.CAST_CONNECTED) {
    app.videoResDebug_.textContent = sender.videoResDebug;
  } else {
    var debugMsg = appUtils.getVideoResDebug(app.video_);
    app.videoResDebug_.textContent = debugMsg;
  }
};


/**
 * Update the buffer information.
 * @private
 */
app.updateBufferDebug_ = function() {
  console.assert(app.bufferedAheadDebug_ && app.bufferedBehindDebug_);
  if (sender.state == sender.states.CAST_CONNECTED) {
    app.bufferedAheadDebug_.textContent = sender.bufferedAheadDebug;
    app.bufferedBehindDebug_.textContent = sender.bufferedBehindDebug;
  } else {
    var bufferInfo = appUtils.getBufferDebug(app.video_);
    app.bufferedAheadDebug_.textContent = bufferInfo[0];
    app.bufferedBehindDebug_.textContent = bufferInfo[1];
  }
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
