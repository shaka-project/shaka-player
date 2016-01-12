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
 * The video controls overlay for the test app.
 * @class
 */
var playerControls = function() {};


/** @private {boolean} */
playerControls.isLive_;


/** @private {boolean} */
playerControls.isSeeking_;


/** @private {HTMLVideoElement} */
playerControls.video_;


/** @private {!{start: number, end: number}} */
playerControls.seekRange_ = {start: 0, end: 0};


/** @private {shaka.player.Player} */
playerControls.player_ = null;


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
  var currentTime = document.getElementById('currentTime');
  var rewindButton = document.getElementById('rewindButton');
  var fastForwardButton = document.getElementById('fastForwardButton');
  var castButton = document.getElementById('castButton');
  var castConnectedButton = document.getElementById('castConnectedButton');

  // IE11 doesn't treat the 'input' event correctly.
  // https://connect.microsoft.com/IE/Feedback/Details/856998
  // If you know a better way than a userAgent check to handle this, please
  // send a patch.
  var sliderInputEvent = 'input';
  // This matches IE11, but not Edge.  Edge does not have this problem.
  if (navigator.userAgent.indexOf('Trident/') >= 0) {
    sliderInputEvent = 'change';
  }

  playerControls.isLive_ = false;
  playerControls.isSeeking_ = false;
  playerControls.video_ = video;

  // play
  playButton.addEventListener('click', function() {
    if (sender.state == sender.states.CAST_CONNECTED) {
      sender.play();
    } else {
      if (!video.src) return;
      playerControls.player_.setPlaybackRate(1);
      video.play();
    }
  });
  video.addEventListener('play', function() {
    playerControls.displayPlayButton(false);
  });

  // pause
  pauseButton.addEventListener('click', function() {
    if (sender.state == sender.states.CAST_CONNECTED) {
      sender.pause();
    } else {
      video.pause();
    }
  });
  video.addEventListener('pause', function() {
    if (!playerControls.isSeeking_) {
      playerControls.displayPlayButton(true);
    }
  });

  // seek
  var seekTimeoutId = null;
  var onSeekStart = function() {
    playerControls.isSeeking_ = true;
    if (sender.state == sender.states.CAST_CONNECTED) {
      sender.pause();
    } else {
      video.pause();
    }
  };
  var onSeekInputTimeout = function() {
    seekTimeoutId = null;
    if (sender.state == sender.states.CAST_CONNECTED) {
      sender.setCurrentTime(seekBar.value);
    } else {
      video.currentTime = seekBar.value;
    }
  };
  var onSeekInput = function() {
    if (sender.state == sender.states.CAST_CONNECTED) {
      if (!sender.currentMediaDuration) return;
    } else if (!video.duration) {
      // Can't seek.  Ignore.
      return;
    }

    // Update the UI right away.
    playerControls.updateTimeAndSeekRange();

    // Collect input events and seek when things have been stable for 100ms.
    if (seekTimeoutId) {
      window.clearTimeout(seekTimeoutId);
    }
    seekTimeoutId = window.setTimeout(onSeekInputTimeout, 100);
  };
  var onSeekEnd = function() {
    if (seekTimeoutId) {
      window.clearTimeout(seekTimeoutId);
      onSeekInputTimeout();
    }

    playerControls.isSeeking_ = false;
    if (sender.state == sender.states.CAST_CONNECTED) {
      sender.play();
    } else {
      video.play();
    }
  };
  seekBar.addEventListener('mousedown', onSeekStart);
  seekBar.addEventListener('touchstart', onSeekStart);
  seekBar.addEventListener(sliderInputEvent, onSeekInput);
  seekBar.addEventListener('mouseup', onSeekEnd);
  seekBar.addEventListener('touchend', onSeekEnd);
  // initialize seek bar with 0
  seekBar.value = 0;

  // mute/unmute
  muteButton.addEventListener('click', function() {
    if (sender.state == sender.states.CAST_CONNECTED) {
      sender.mute(true);
    } else {
      video.muted = true;
    }
  });
  unmuteButton.addEventListener('click', function() {
    if (sender.state == sender.states.CAST_CONNECTED) {
      sender.mute(false);
    } else {
      video.muted = false;
    }
  });

  // volume
  volumeBar.addEventListener(sliderInputEvent, function() {
    if (sender.state == sender.states.CAST_CONNECTED) {
      sender.setVolume(volumeBar.value);
      sender.mute(false);
    } else {
      video.volume = volumeBar.value;
      video.muted = false;
    }
  });

  video.addEventListener('volumechange', playerControls.onVolumeChange);

  // initialize volume display with a fake event
  playerControls.onVolumeChange();

  // current time & seek bar updates
  video.addEventListener('timeupdate', function() {
    if (!playerControls.isLive_) {
      playerControls.updateTimeAndSeekRange();
    }
  });

  // fullscreen
  fullscreenButton.addEventListener('click', function() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      videoContainer.requestFullscreen();
    }
  });

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


  // Jump to LIVE if the user clicks on the current time.
  currentTime.addEventListener('click', function() {
    if (playerControls.isLive_) {
      video.currentTime = seekBar.max;
    }
  });

  // trick play
  rewindButton.addEventListener('click', playerControls.onRewind);
  fastForwardButton.addEventListener('click', playerControls.onFastForward);

  // cast
  castButton.addEventListener('click', sender.launch);
  // stop casting
  castConnectedButton.addEventListener('click', sender.stop);
};


/**
 * Set the player. Is needed for trick play.
 * @param {shaka.player.Player} player
 */
playerControls.setPlayer = function(player) {
  playerControls.player_ = player;
};


/**
 * Changes the play/pause button display.
 * @param {boolean} play True if play should be displayed, false if pause.
 */
playerControls.displayPlayButton = function(play) {
  document.getElementById('pauseButton').style.display =
      play ? 'none' : 'block';
  document.getElementById('playButton').style.display = play ? 'block' : 'none';
};


/**
 * Updates the controls to display whether cast is connected.
 * @param {boolean} connected True if cast is connected.
 */
playerControls.displayCastConnection = function(connected) {
  document.getElementById('castButton').style.display =
      connected ? 'none' : 'block';
  document.getElementById('castConnectedButton').style.display =
      connected ? 'block' : 'none';
  document.getElementById('fullscreenButton').style.display =
      connected ? 'none' : 'block';
};


/**
 * Updates the controls to reflect volume changes.
 */
playerControls.onVolumeChange = function() {
  var muted, volume;
  var muteButton = document.getElementById('muteButton');
  var unmuteButton = document.getElementById('unmuteButton');
  var volumeBar = document.getElementById('volumeBar');
  if (sender.state == sender.states.CAST_CONNECTED) {
    muted = sender.currentMediaMuted;
    volume = sender.currentMediaVolume;
  } else {
    var video = playerControls.video_;
    muted = video.muted;
    volume = video.volume;
  }
  if (muted) {
    muteButton.style.display = 'none';
    unmuteButton.style.display = 'block';
  } else {
    unmuteButton.style.display = 'none';
    muteButton.style.display = 'block';
  }

  volumeBar.value = muted ? 0 : volume;
  var gradient = ['to right'];
  gradient.push('#ccc ' + (volumeBar.value * 100) + '%');
  gradient.push('#000 ' + (volumeBar.value * 100) + '%');
  gradient.push('#000 100%');
  volumeBar.style.background = 'linear-gradient(' + gradient.join(',') + ')';
};


/**
 * Called by the application to set the buffering state.
 * @param {boolean} bufferingState
 */
playerControls.onBuffering = function(bufferingState) {
  var bufferingSpinner = document.getElementById('bufferingSpinner');
  bufferingSpinner.style.display = bufferingState ? 'inherit' : 'none';
};


/**
 * Called by the application when the seek range changes.
 * @param {Event|{start: number, end: number}} event
 */
playerControls.onSeekRangeChanged = function(event) {
  playerControls.seekRange_.start = event.start;
  playerControls.seekRange_.end = event.end;
  playerControls.updateTimeAndSeekRange();
};


/**
 * Called by the application to set the live playback state.
 * @param {boolean} liveState True if the stream is live.
 */
playerControls.setLive = function(liveState) {
  playerControls.isLive_ = liveState;
};


/**
 * Called when rewind button is pressed. Will circle play between -1, -2, -4
 * and -8 playback rates.
 */
playerControls.onRewind = function() {
  if (!playerControls.player_) return;
  var rate = playerControls.player_.getPlaybackRate();
  playerControls.player_.setPlaybackRate(
      rate > 0 || rate < -4 ? -1.0 : rate * 2);
  playerControls.video_.play();
};


/**
 * Called when fastForward button is pressed. Will circle play between 1, 2,
 * 4 and 8 playback rates.
 */
playerControls.onFastForward = function() {
  if (!playerControls.player_) return;
  var rate = playerControls.player_.getPlaybackRate();
  playerControls.player_.setPlaybackRate(rate < 0 || rate > 4 ? 1.0 : rate * 2);
  playerControls.video_.play();
};


/**
 * Called by the application to switch trick play controls and the seek bar.
 * @param {boolean} enable True if trick play should be enabled, if false
 *    seekbar will be enabled.
 */
playerControls.enableTrickPlayButtons = function(enable) {;
  var seekBar = document.getElementById('seekBar');
  var rewindButton = document.getElementById('rewindButton');
  var fastForwardButton = document.getElementById('fastForwardButton');
  rewindButton.style.display = enable ? 'block' : 'none';
  fastForwardButton.style.display = enable ? 'block' : 'none';
  seekBar.style.display = enable ? 'none' : 'block';
};


/**
 * Called when the seek range or current time need to be updated.
 */
playerControls.updateTimeAndSeekRange = function() {
  var displayTime, duration, bufferedLength, bufferedStart, bufferedEnd;
  if (sender.state == sender.states.CAST_CONNECTED) {
    displayTime = sender.currentMediaTime;
    duration = sender.currentMediaDuration;
    bufferedLength = sender.currentMediaBuffered.length;
    bufferedStart = sender.currentMediaBuffered.start;
    bufferedEnd = sender.currentMediaBuffered.end;
  } else {
    var video = playerControls.video_;
    displayTime = video.currentTime;
    duration = video.duration;
    bufferedLength = video.buffered.length;
    bufferedStart = bufferedLength ? video.buffered.start(0) : 0;
    bufferedEnd = bufferedLength ? video.buffered.end(0) : 0;
  }

  var seekRange = playerControls.seekRange_;
  var currentTime = document.getElementById('currentTime');
  var seekBar = document.getElementById('seekBar');

  if (playerControls.isSeeking_) {
    displayTime = seekBar.value;
  }

  // Set |currentTime|.
  if (playerControls.isLive_) {
    // The amount of time we are behind the live edge.
    displayTime = Math.max(0, Math.floor(seekRange.end - displayTime));
    var showHour = (seekRange.end - seekRange.start) >= 3600;

    // Consider "LIVE" when 1 second or less behind the live-edge.  Always show
    // the full time string when seeking, including the leading '-'; otherwise,
    // the time string "flickers" near the live-edge.
    if ((displayTime > 1) || playerControls.isSeeking_) {
      currentTime.textContent =
          '- ' + playerControls.buildTimeString_(displayTime, showHour);
    } else {
      currentTime.textContent = 'LIVE';
    }

    seekBar.min = seekRange.start;
    seekBar.max = seekRange.end;
    if (!playerControls.isSeeking_) {
      seekBar.value = seekRange.end - displayTime;
    }
  } else {
    var showHour = duration >= 3600;
    currentTime.textContent =
        playerControls.buildTimeString_(displayTime, showHour);

    seekBar.min = 0;
    seekBar.max = duration;
    if (!playerControls.isSeeking_) {
      seekBar.value = displayTime;
    }
  }

  var gradient = ['to right'];
  if (bufferedLength == 0) {
    gradient.push('#000 0%');
  } else {
    // NOTE: the fallback to zero eliminates NaN.
    var bufferStartFraction = (bufferedStart / duration) || 0;
    var bufferEndFraction = (bufferedEnd / duration) || 0;
    var playheadFraction = (displayTime / duration) || 0;

    if (playerControls.isLive_) {
      var bufferStart = Math.max(bufferedStart, seekRange.start);
      var bufferEnd = Math.min(bufferedEnd, seekRange.end);
      var seekRangeSize = seekRange.end - seekRange.start;
      var bufferStartDistance = bufferStart - seekRange.start;
      var bufferEndDistance = bufferEnd - seekRange.start;
      var playheadDistance = displayTime - seekRange.start;
      bufferStartFraction = (bufferStartDistance / seekRangeSize) || 0;
      bufferEndFraction = (bufferEndDistance / seekRangeSize) || 0;
      playheadFraction = (playheadDistance / seekRangeSize) || 0;
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


/**
 * Builds a time string, e.g., 01:04:23, from |displayTime|.
 *
 * @param {number} displayTime
 * @param {boolean} showHour
 * @return {string}
 * @private
 */
playerControls.buildTimeString_ = function(displayTime, showHour) {
  var h = Math.floor(displayTime / 3600);
  var m = Math.floor((displayTime / 60) % 60);
  var s = Math.floor(displayTime % 60);
  if (s < 10) s = '0' + s;
  var text = m + ':' + s;
  if (showHour) {
    if (m < 10) text = '0' + text;
    text = h + ':' + text;
  }
  return text;
};

