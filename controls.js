/**
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
 *
 * @fileoverview Implements the video controls overlay.
 */


/** @class */
var playerControls = function() {};


/** @private {boolean} */
playerControls.isLive_;


/** @private {HTMLVideoElement} */
playerControls.video_;


/**
 * Initializes the player controls.
 * @param {!HTMLVideoElement} video
 */
playerControls.init = function(video) {
  var videoContainer = document.getElementById('videoContainer');
  var playButton = document.getElementById('playButton');
  var pauseButton = document.getElementById('pauseButton');
  var seekBar = document.getElementById('seekBar');
  var muteButton = document.getElementById('muteButton');
  var unmuteButton = document.getElementById('unmuteButton');
  var volumeBar = document.getElementById('volumeBar');
  var fullscreenButton = document.getElementById('fullscreenButton');

  var seeking = false;

  playerControls.isLive_ = false;
  playerControls.video_ = video;

  // play
  playButton.addEventListener('click', function() {
    if (!video.src) return;
    video.play();
  });
  video.addEventListener('play', function() {
    playButton.style.display = 'none';
    pauseButton.style.display = 'block';
  });

  // pause
  pauseButton.addEventListener('click', function() {
    video.pause();
  });
  video.addEventListener('pause', function() {
    if (!seeking) {
      pauseButton.style.display = 'none';
      playButton.style.display = 'block';
    }
  });

  // seek
  seekBar.addEventListener('mousedown', function() {
    seeking = true;
  });
  seekBar.addEventListener('input', function() {
    if (video.duration) {
      video.currentTime = seekBar.value;
    }
  });
  seekBar.addEventListener('mouseup', function() {
    seeking = false;
  });
  // initialize seek bar with 0
  seekBar.value = 0;

  // mute/unmute
  muteButton.addEventListener('click', function() {
    video.muted = true;
  });
  unmuteButton.addEventListener('click', function() {
    video.muted = false;
  });

  // volume
  volumeBar.oninput = function() {
    video.volume = volumeBar.value;
    video.muted = false;
  };

  // volume & mute updates
  video.addEventListener('volumechange', function() {
    if (video.muted) {
      muteButton.style.display = 'none';
      unmuteButton.style.display = 'block';
    } else {
      unmuteButton.style.display = 'none';
      muteButton.style.display = 'block';
    }

    volumeBar.value = video.muted ? 0 : video.volume;
    var gradient = ['to right'];
    gradient.push('#ccc ' + (volumeBar.value * 100) + '%');
    gradient.push('#000 ' + (volumeBar.value * 100) + '%');
    gradient.push('#000 100%');
    volumeBar.style.background =
        'linear-gradient(' + gradient.join(',') + ')';
  });
  // initialize volume display with a fake event
  video.dispatchEvent(new Event('volumechange'));

  // current time & seek bar updates
  video.addEventListener('timeupdate', function() {
    if (!playerControls.isLive_) {
      playerControls.updateTimeAndSeekRange(null);
    }
  });

  // fullscreen
  fullscreenButton.onclick = function() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoContainer.requestFullscreen();
    }
  };

  // fullscreen updates
  var normalSize = {};
  document.addEventListener('fullscreenchange', function() {
    if (document.fullscreenElement) {
      // remember previous size
      normalSize.w = videoContainer.style.width;
      normalSize.h = videoContainer.style.height;
      // expand the container
      videoContainer.style.width = '100%';
      videoContainer.style.height = '100%';
    } else {
      // restore the previous size
      videoContainer.style.width = normalSize.w;
      videoContainer.style.height = normalSize.h;
    }
  });
};


/**
 * Called by the application to set the buffering state.
 * @param {boolean} bufferingState
 */
playerControls.onBuffering = function(bufferingState) {
  var bufferingSpinner = document.getElementById('bufferingSpinner');
  bufferingSpinner.style.display = bufferingState ? 'flex' : 'none';
};


/**
 * Called by the application to set the live playback state.
 * @param {boolean} liveState True if the stream is live.
 */
playerControls.setLive = function(liveState) {
  playerControls.isLive_ = liveState;
};


/**
 * Called by the application when the seek range changes for live content,
 * or when the play head moves for non-live content.
 * @param {Event|{start: number, end: number}} event
 *     or null for non-live content.
 */
playerControls.updateTimeAndSeekRange = function(event) {
  var video = playerControls.video_;
  var currentTime = document.getElementById('currentTime');
  var seekBar = document.getElementById('seekBar');

  var showHour = video.duration >= 3600;
  var displayTime = video.currentTime;
  var prefix = '';
  if (playerControls.isLive_) {
    // The amount of time we are behind the live edge.
    displayTime = Math.max(0, Math.floor(event.end - video.currentTime));
    if (displayTime) prefix = '-';
    showHour = (event.end - event.start) >= 3600;
  }

  var h = Math.floor(displayTime / 3600);
  var m = Math.floor((displayTime / 60) % 60);
  var s = Math.floor(displayTime % 60);
  if (s < 10) s = '0' + s;
  var text = m + ':' + s;
  if (showHour) {
    if (m < 10) text = '0' + text;
    text = h + ':' + text;
  }
  currentTime.innerText = prefix + text;

  if (playerControls.isLive_) {
    seekBar.min = event.start;
    seekBar.max = event.end;
    seekBar.value = event.end - displayTime;
  } else {
    seekBar.min = 0;
    seekBar.max = video.duration;
    seekBar.value = video.currentTime;
  }

  var gradient = ['to right'];
  var buffered = video.buffered;
  if (buffered.length == 0) {
    gradient.push('#000 0%');
  } else {
    // NOTE: the fallback to zero eliminates NaN.
    var bufferStartFraction = (buffered.start(0) / video.duration) || 0;
    var bufferEndFraction = (buffered.end(0) / video.duration) || 0;
    var playheadFraction = (video.currentTime / video.duration) || 0;

    if (playerControls.isLive_) {
      var bufferStart = Math.max(buffered.start(0), event.start);
      var bufferEnd = Math.min(buffered.end(0), event.end);
      var seekRangeSize = event.end - event.start;
      bufferStartFraction = (bufferStart / seekRangeSize) || 0;
      bufferEndFraction = (bufferEnd / seekRangeSize) || 0;
      playheadFraction = ((event.end - displayTime) / seekRangeSize) || 0;
    }

    gradient.push('#000 ' + (bufferStartFraction * 100) + '%');
    gradient.push('#ccc ' + (bufferStartFraction * 100) + '%');
    gradient.push('#ccc ' + (playheadFraction * 100) + '%');
    gradient.push('#444 ' + (playheadFraction * 100) + '%');
    gradient.push('#444 ' + (bufferEndFraction * 100) + '%');
    gradient.push('#000 ' + (bufferEndFraction * 100) + '%');
  }
  seekBar.style.background = 'linear-gradient(' + gradient.join(',') + ')';
};

