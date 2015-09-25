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

goog.require('shaka.asserts');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.Player');
goog.require('shaka.player.TextTrack');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.polyfill.installAll');


var manifests = {
  'plainManifest': 'assets/car-20120827-manifest.mpd',
  'encryptedManifest': 'assets/car_cenc-20120827-manifest.mpd',
  'languagesManifest': 'assets/angel_one.mpd',
  'webmManifest': 'assets/feelings_vp9-20130806-manifest.mpd',
  'failoverManifest': 'assets/angel_one_failover.mpd',
  'bogusManifest': 'assets/does_not_exist',
  'highBitrateManifest':
      '//storage.googleapis.com/widevine-demo-media/sintel-1080p/dash.mpd',

  'captionFile': 'assets/test_subs.vtt'
};

const FUDGE_FACTOR = 0.3;


var integration = {
  'oritinalTimeout': 0,
  'setUp': function() {
    // Hijack assertions and convert failed assertions into failed tests.
    assertsToFailures.install();

    // Change the timeout.
    integration.originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 55000;  // ms

    // Install polyfills.
    shaka.polyfill.installAll();
  },
  'tearDown': function() {
    // Restore the timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = integration.originalTimeout;

    // Restore normal assertion behavior.
    assertsToFailures.uninstall();
  }
};


/**
 * Creates a new video element.
 *
 * @return {HTMLVideoElement}
 */
function createVideo() {
  var video = /** @type {HTMLVideoElement} */ (document.createElement('video'));
  video.crossOrigin = 'anonymous';
  video.width = 600;
  video.height = 400;
  video.autoplay = false;
  return video;
}


/**
 * Creates a new Player instance using the given video element.
 *
 * @param {HTMLVideoElement} video
 * @return {!shaka.player.Player}
 */
function createPlayer(video) {
  // Create a new player.
  var player = new shaka.player.Player(video);
  player.addEventListener('error', convertErrorToTestFailure, false);

  // Disable automatic adaptation unless it is needed for a test.
  // This makes test results more reproducible.
  player.configure({'enableAdaptation': false});

  return player;
}


/**
 * @param {!shaka.player.Player} player
 * @param {number} targetHeight
 * @return {shaka.player.VideoTrack} or null if not found.
 */
function getVideoTrackByHeight(player, targetHeight) {
  var tracks = player.getVideoTracks();
  for (var i = 0; i < tracks.length; ++i) {
    if (tracks[i].height == targetHeight) {
      return tracks[i];
    }
  }

  return null;
}


/**
 * @param {!shaka.player.Player} player
 * @return {shaka.player.TextTrack} or null if not found.
 */
function getActiveTextTrack(player) {
  var tracks = player.getTextTracks();
  for (var i = 0; i < tracks.length; ++i) {
    if (tracks[i].active) {
      return tracks[i];
    }
  }
  return null;
}


/**
 * @param {!shaka.player.Player} player
 * @return {shaka.player.AudioTrack} or null if not found.
 */
function getActiveAudioTrack(player) {
  var tracks = player.getAudioTracks();
  for (var i = 0; i < tracks.length; ++i) {
    if (tracks[i].active) {
      return tracks[i];
    }
  }
  return null;
}

