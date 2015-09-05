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
 * Unless required by receiverApplicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


/**
 * Implements the receiverApplication layer of the receiver.
 * @class
 */
var receiverApp = function() {};


/**
 * The video element owned by the receiverApp.
 *
 * @private {HTMLVideoElement}
 */
receiverApp.video_ = null;


/**
 * The video resolution debug element owned by the receiverApp.
 *
 * @private {?string}
 */
receiverApp.videoResDebug_ = null;


/**
 * The buffered ahead debug element owned by the receiverApp.
 *
 * @private {?string}
 */
receiverApp.bufferedAheadDebug_ = null;


/**
 * The buffered behind debug element owned by the receiverApp.
 *
 * @private {?string}
 */
receiverApp.bufferedBehindDebug_ = null;


/**
 * The player object owned by the receiverApp.
 *
 * @private {shaka.player.Player}
 */
receiverApp.player_ = null;


/**
 * The receiverApp's bandwidth estimator, which will persist across playbacks.
 * This will allow second and subsequent playbacks to benefit from earlier
 * bandwidth estimations and avoid starting at a low-quality stream.
 *
 * @private {shaka.util.IBandwidthEstimator}
 */
receiverApp.estimator_ = null;


/**
 * The current video configuration.
 */
receiverApp.config = {
  'forcePrefixed' : false,
  'preferredLanguage': 'en-US',
  'wvLicenseServerUrlInput' : null
};


/**
 * Initializes the receiverApplication.
 */
receiverApp.init = function() {
  receiverApp.video_ =
      /** @type {!HTMLVideoElement} */ (document.getElementById('video'));

  window.setInterval(receiverApp.updateDebugInfo_, 50);

  receiver.initialize();

  // current time updates
  receiverApp.video_.addEventListener('timeupdate', function() {
    receiver.broadcast('currentTime', receiverApp.video_.currentTime);
    var buffered = receiverApp.video_.buffered;
    receiver.broadcast('buffered', {
      'length': buffered.length,
      'start': buffered.start(0),
      'end': buffered.end(0)
    });
  });
  receiverApp.video_.addEventListener('playing', function() {
    receiverApp.onBuffering(false);
    receiver.broadcast('playing', receiverApp.video_.duration);
    receiver.cancelIdleTimeout();
  });
  receiverApp.video_.addEventListener('pause', function() {
    receiver.broadcast('paused', null);
    receiver.setIdleTimeout(receiver.IDLE_TIMEOUT_);
  });
  receiverApp.video_.addEventListener('volumechange', function() {
    receiver.broadcast('volume', {
      'volume': receiverApp.video_.volume,
      'muted': receiverApp.video_.muted
    });
  });
  receiverApp.video_.addEventListener('ended', function() {
    receiver.setIdleTimeout(receiver.IDLE_TIMEOUT_);
  });
};


/**
 * Loads a dash stream.
 * @param {appUtils.StreamState} streamInfo
 */
receiverApp.loadDashStream = function(streamInfo) {
  receiverApp.onBuffering(true);
  if (!receiverApp.player_) {
    receiverApp.installPolyfills_();
    receiverApp.initPlayer_();
  }

  console.assert(receiverApp.estimator_);
  if (receiverApp.estimator_.getDataAge() >= 3600) {
    // Disregard any bandwidth data older than one hour.  The user may have
    // changed networks if they are on a laptop or mobile device.
    receiverApp.estimator_ = new shaka.util.EWMABandwidthEstimator();
  }

  var estimator = /** @type {!shaka.util.IBandwidthEstimator} */(
      receiverApp.estimator_);
  var abrManager = new shaka.media.SimpleAbrManager();
  receiverApp.load_(
      new shaka.player.DashVideoSource(
          streamInfo.manifest,
          appUtils.interpretContentProtection.bind(
              null,
              receiverApp.player_,
              receiverApp.config.wvLicenseServerUrlInput),
          estimator,
          abrManager), streamInfo.time);
};


/**
 * Plays the video.
 */
receiverApp.play = function() {
  receiverApp.video_.play();
};


/**
 * Pauses the video.
 */
receiverApp.pause = function() {
  receiverApp.video_.pause();
};


/**
 * Sets the current time of the video.
 * @param {number} time
 */
receiverApp.setCurrentTime = function(time) {
  receiverApp.video_.currentTime = time;
};


/**
 * Updates the buffering display.
 * @param {boolean} buffering True if the video is buffering.
 */
receiverApp.onBuffering = function(buffering) {
  var bufferingSpinner = document.getElementById('bufferingSpinner');
  bufferingSpinner.style.display = buffering ? 'inherit' : 'none';
};


/**
 * Sets the current volume of the video.
 * @param {number} volume
 */
receiverApp.setVolume = function(volume) {
  receiverApp.video_.volume = volume;
};


/**
 * Mutes the video.
 * @param {boolean} mute
 */
receiverApp.mute = function(mute) {
  receiverApp.video_.muted = mute;
};


/**
 * Loads the given video source into the player.
 * @param {!shaka.player.IVideoSource} videoSource
 * @param {number} time The time the video should start at.
 * @private
 */
receiverApp.load_ = function(videoSource, time) {
  console.assert(receiverApp.player_ != null);

  receiverApp.player_.configure(
      {'preferredLanguage': receiverApp.config.preferredLanguage});
  receiverApp.player_.setPlaybackStartTime(time);

  // Error already handled through error event.
  receiverApp.player_.load(videoSource).catch(function() {});
};


/**
 * Update the debug information.
 * @private
 */
receiverApp.updateDebugInfo_ = function() {
  var debugMsg = appUtils.getVideoResDebug(receiverApp.video_);
  var bufferInfo = appUtils.getBufferDebug(receiverApp.video_);
  var debugInfo = {
    'videoResDebug': debugMsg,
    'bufferedAheadDebug': bufferInfo[0],
    'bufferedBehindDebug': bufferInfo[1]
  };
  receiver.broadcast('debugInfo', debugInfo);
};


/**
 * Installs the polyfills if the have not yet been installed.
 * @private
 */
receiverApp.installPolyfills_ = function() {
  appUtils.installPolyfills(receiverApp.config.forcePrefixed);
};


/**
 * Initializes the Player instance.
 * If the Player instance already exists then it is reinitialized.
 * @private
 */
receiverApp.initPlayer_ = function() {
  console.assert(receiverApp.player_ == null);
  if (receiverApp.player_) {
    return;
  }

  receiverApp.player_ = new shaka.player.Player(
      /** @type {!HTMLVideoElement} */ (receiverApp.video_));
  receiverApp.player_.addEventListener('error', receiverApp.onPlayerError_);

  receiverApp.estimator_ = new shaka.util.EWMABandwidthEstimator();
};


/**
 * Called when the player generates an error.
 * @param {!Event} event
 * @private
 */
receiverApp.onPlayerError_ = function(event) {
  console.error('Player error', event);
  receiverApp.player_.unload();
  receiverApp.player_ = null;
  receiverApp.onBuffering(false);
  receiver.broadcast('error', event.detail.name + ': ' + event.detail.message);
  receiver.setIdleTimeout(receiver.IDLE_TIMEOUT_);
};


if (document.readyState == 'complete' ||
    document.readyState == 'interactive') {
  receiverApp.init();
} else {
  document.addEventListener('DOMContentLoaded', receiverApp.init);
}
