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
shakaDemo.setupInfo_ = function() {
  window.setInterval(shakaDemo.updateDebugInfo_, 125);
  shakaDemo.player_.addEventListener(
      'trackschanged', shakaDemo.onTracksChanged_);
  shakaDemo.player_.addEventListener(
      'adaptation', shakaDemo.onAdaptation_);
  document.getElementById('videoTracks').addEventListener(
      'change', shakaDemo.onTrackSelected_);
  document.getElementById('audioTracks').addEventListener(
      'change', shakaDemo.onTrackSelected_);
  document.getElementById('textTracks').addEventListener(
      'change', shakaDemo.onTrackSelected_);
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onTracksChanged_ = function(event) {
  // Update the track lists.
  var lists = {
    video: document.getElementById('videoTracks'),
    audio: document.getElementById('audioTracks'),
    text: document.getElementById('textTracks')
  };
  var formatters = {
    video: function(track) {
      return track.width + 'x' + track.height + ', ' +
             track.bandwidth + ' bits/s';
    },
    audio: function(track) {
      return 'language: ' + track.language + ', ' +
             track.bandwidth + ' bits/s';
    },
    text: function(track) {
      return 'language: ' + track.language + ' ' +
             '(' + track.kind + ')';
    }
  };

  // Clear the old track lists.
  Object.keys(lists).forEach(function(type) {
    var list = lists[type];
    while (list.firstChild) {
      list.removeChild(list.firstChild);
    }
  });

  // Populate with the new tracks.
  var tracks = shakaDemo.player_.getTracks();
  tracks.sort(function(t1, t2) {
    // Sort by language, then by bandwidth.
    if (t1.language) {
      var ret = t1.language.localeCompare(t2.language);
      if (ret) return ret;
    }
    return t1.bandwidth - t2.bandwidth;
  });
  tracks.forEach(function(track) {
    var list = lists[track.type];
    if (!list) return;
    var option = document.createElement('option');
    option.textContent = formatters[track.type](track);
    option.track = track;
    option.value = track.id;
    option.selected = track.active;
    list.appendChild(option);
  });
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onAdaptation_ = function(event) {
  var lists = {
    video: document.getElementById('videoTracks'),
    audio: document.getElementById('audioTracks'),
    text: document.getElementById('textTracks')
  };

  // Find the rows for the active tracks and select them.
  var tracks = shakaDemo.player_.getTracks();
  tracks.forEach(function(track) {
    if (!track.active) return;

    var list = lists[track.type];
    for (var i = 0; i < list.options.length; ++i) {
      var option = list.options[i];
      if (option.value == track.id) {
        option.selected = true;
        break;
      }
    }
  });
};


/**
 * @param {!Event} event
 * @private
 */
shakaDemo.onTrackSelected_ = function(event) {
  var list = event.target;
  var option = list.options[list.selectedIndex];
  var track = option.track;
  var player = shakaDemo.player_;

  player.selectTrack(track, /* clearBuffer */ true);

  // Adaptation might have been changed by calling selectTrack().
  // Update the adaptation checkbox.
  var enableAdaptation = player.getConfiguration().abr.enabled;
  document.getElementById('enableAdaptation').checked = enableAdaptation;
};


/** @private */
shakaDemo.updateDebugInfo_ = function() {
  var video = shakaDemo.video_;

  document.getElementById('videoResDebug').textContent =
      video.videoWidth + ' x ' + video.videoHeight;

  var behind = 0;
  var ahead = 0;

  var currentTime = video.currentTime;
  var buffered = video.buffered;
  for (var i = 0; i < buffered.length; ++i) {
    if (buffered.start(i) <= currentTime && buffered.end(i) >= currentTime) {
      ahead = buffered.end(i) - currentTime;
      behind = currentTime - buffered.start(i);
      break;
    }
  }

  document.getElementById('bufferedDebug').textContent =
      '- ' + behind.toFixed(0) + 's / ' + '+ ' + ahead.toFixed(0) + 's';
};
