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
 * A container for custom video controls.
 * @constructor
 * @suppress {missingProvide}
 */
function ShakaControls() {
  /** @private {shaka.cast.CastProxy} */
  this.castProxy_ = null;

  /** @private {boolean} */
  this.castAllowed_ = true;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = null;

  /** @private {HTMLMediaElement} */
  this.video_ = null;

  /** @private {shaka.Player} */
  this.player_ = null;

  /** @private {Element} */
  this.videoContainer_ = document.getElementById('videoContainer');

  /** @private {Element} */
  this.controls_ = document.getElementById('controls');

  /** @private {Element} */
  this.playPauseButton_ = document.getElementById('playPauseButton');

  /** @private {Element} */
  this.seekBar_ = document.getElementById('seekBar');

  /** @private {Element} */
  this.muteButton_ = document.getElementById('muteButton');

  /** @private {Element} */
  this.volumeBar_ = document.getElementById('volumeBar');

  /** @private {Element} */
  this.captionButton_ = document.getElementById('captionButton');

  /** @private {Element} */
  this.fullscreenButton_ = document.getElementById('fullscreenButton');

  /** @private {Element} */
  this.currentTime_ = document.getElementById('currentTime');

  /** @private {Element} */
  this.rewindButton_ = document.getElementById('rewindButton');

  /** @private {Element} */
  this.fastForwardButton_ = document.getElementById('fastForwardButton');

  /** @private {Element} */
  this.castButton_ = document.getElementById('castButton');

  /** @private {Element} */
  this.castReceiverName_ = document.getElementById('castReceiverName');

  /** @private {Element} */
  this.bufferingSpinner_ = document.getElementById('bufferingSpinner');

  /** @private {Element} */
  this.giantPlayButtonContainer_ =
      document.getElementById('giantPlayButtonContainer');

  /** @private {boolean} */
  this.isSeeking_ = false;

  /** @private {number} */
  this.trickPlayRate_ = 1;

  /** @private {?number} */
  this.seekTimeoutId_ = null;

  /** @private {?number} */
  this.mouseStillTimeoutId_ = null;
}


/**
 * Initializes the player controls.
 * @param {shaka.cast.CastProxy} castProxy
 * @param {function(!shaka.util.Error)} onError
 * @param {function(boolean)} notifyCastStatus
 */
ShakaControls.prototype.init = function(castProxy, onError, notifyCastStatus) {
  this.castProxy_ = castProxy;
  this.onError_ = onError;
  this.notifyCastStatus_ = notifyCastStatus;
  this.initMinimal(castProxy.getVideo(), castProxy.getPlayer());

  // IE11 doesn't treat the 'input' event correctly.
  // https://connect.microsoft.com/IE/Feedback/Details/856998
  // If you know a better way than a userAgent check to handle this, please
  // send a patch.
  var sliderInputEvent = 'input';
  // This matches IE11, but not Edge.  Edge does not have this problem.
  if (navigator.userAgent.indexOf('Trident/') >= 0) {
    sliderInputEvent = 'change';
  }

  this.playPauseButton_.addEventListener(
      'click', this.onPlayPauseClick_.bind(this));
  this.video_.addEventListener(
      'play', this.onPlayStateChange_.bind(this));
  this.video_.addEventListener(
      'pause', this.onPlayStateChange_.bind(this));

  this.seekBar_.addEventListener(
      'mousedown', this.onSeekStart_.bind(this));
  this.seekBar_.addEventListener(
      'touchstart', this.onSeekStart_.bind(this));
  this.seekBar_.addEventListener(
      sliderInputEvent, this.onSeekInput_.bind(this));
  this.seekBar_.addEventListener(
      'touchend', this.onSeekEnd_.bind(this));
  this.seekBar_.addEventListener(
      'mouseup', this.onSeekEnd_.bind(this));

  this.muteButton_.addEventListener(
      'click', this.onMuteClick_.bind(this));

  this.volumeBar_.addEventListener(
      sliderInputEvent, this.onVolumeInput_.bind(this));
  this.video_.addEventListener(
      'volumechange', this.onVolumeStateChange_.bind(this));
  // initialize volume display with a fake event
  this.onVolumeStateChange_();

  this.captionButton_.addEventListener(
      'click', this.onCaptionClick_.bind(this));
  this.player_.addEventListener(
      'texttrackvisibility', this.onCaptionStateChange_.bind(this));
  this.player_.addEventListener(
      'trackschanged', this.onTracksChange_.bind(this));
  // initialize caption state with a fake event
  this.onCaptionStateChange_();

  this.fullscreenButton_.addEventListener(
      'click', this.onFullscreenClick_.bind(this));

  this.currentTime_.addEventListener(
      'click', this.onCurrentTimeClick_.bind(this));

  this.rewindButton_.addEventListener(
      'click', this.onRewindClick_.bind(this));
  this.fastForwardButton_.addEventListener(
      'click', this.onFastForwardClick_.bind(this));

  this.castButton_.addEventListener(
      'click', this.onCastClick_.bind(this));

  this.videoContainer_.addEventListener(
      'touchstart', this.onContainerTouch_.bind(this));
  this.videoContainer_.addEventListener(
      'click', this.onPlayPauseClick_.bind(this));

  // Clicks in the controls should not propagate up to the video container.
  this.controls_.addEventListener(
      'click', function(event) { event.stopPropagation(); });

  this.videoContainer_.addEventListener(
      'mousemove', this.onMouseMove_.bind(this));
  this.videoContainer_.addEventListener(
      'mouseout', this.onMouseOut_.bind(this));

  this.castProxy_.addEventListener(
      'caststatuschanged', this.onCastStatusChange_.bind(this));
};


/**
 * Initializes minimal player controls.  Used on both sender (indirectly) and
 * receiver (directly).
 * @param {HTMLMediaElement} video
 * @param {shaka.Player} player
 */
ShakaControls.prototype.initMinimal = function(video, player) {
  this.video_ = video;
  this.player_ = player;
  this.player_.addEventListener(
      'buffering', this.onBufferingStateChange_.bind(this));
  window.setInterval(this.updateTimeAndSeekRange_.bind(this), 125);
};


/**
 * This allows the application to inhibit casting.
 *
 * @param {boolean} allow
 */
ShakaControls.prototype.allowCast = function(allow) {
  this.castAllowed_ = allow;
  this.onCastStatusChange_(null);
};


/**
 * Used by the application to notify the controls that a load operation is
 * complete.  This allows the controls to recalculate play/paused state, which
 * is important for platforms like Android where autoplay is disabled.
 */
ShakaControls.prototype.loadComplete = function() {
  // If we are on Android or if autoplay is false, video.paused should be true.
  // Otherwise, video.paused is false and the content is autoplaying.
  this.onPlayStateChange_();
};


/**
 * Hiding the cursor when the mouse stops moving seems to be the only decent UX
 * in fullscreen mode.  Since we can't use pure CSS for that, we use events both
 * in and out of fullscreen mode.
 * @private
 */
ShakaControls.prototype.onMouseMove_ = function() {
  // Use the cursor specified in the CSS file.
  this.videoContainer_.style.cursor = '';
  // Show the controls.
  this.controls_.style.opacity = 1;

  // Hide the cursor when the mouse stops moving.
  // Only applies while the cursor is over the video container.
  if (this.mouseStillTimeoutId_) {
    // Reset the timer.
    window.clearTimeout(this.mouseStillTimeoutId_);
  }
  this.mouseStillTimeoutId_ = window.setTimeout(
      this.onMouseStill_.bind(this), 3000);
};


/** @private */
ShakaControls.prototype.onMouseOut_ = function() {
  // Expire the timer early.
  if (this.mouseStillTimeoutId_) {
    window.clearTimeout(this.mouseStillTimeoutId_);
  }
  // Run the timeout callback to hide the controls.
  // If we don't, the opacity style we set in onMouseMove_ will continue to
  // override the opacity in CSS and force the controls to stay visible.
  this.onMouseStill_();
};


/** @private */
ShakaControls.prototype.onMouseStill_ = function() {
  // The mouse has stopped moving.
  this.mouseStillTimeoutId_ = null;
  // Hide the cursor.  (NOTE: not supported on IE)
  this.videoContainer_.style.cursor = 'none';
  // Revert opacity control to CSS.  Hovering directly over the controls will
  // keep them showing, even in fullscreen mode.
  this.controls_.style.opacity = '';
};


/**
 * @param {!Event} event
 * @private
 */
ShakaControls.prototype.onContainerTouch_ = function(event) {
  if (!this.video_.duration) {
    // Can't play yet.  Ignore.
    return;
  }

  if (this.controls_.style.opacity == 1) {
    // The controls are showing.
    // Let this event continue and become a click.
  } else {
    // The controls are hidden, so show them.
    this.onMouseMove_();
    // Stop this event from becoming a click event.
    event.preventDefault();
  }
};


/** @private */
ShakaControls.prototype.onPlayPauseClick_ = function() {
  if (!this.video_.duration) {
    // Can't play yet.  Ignore.
    return;
  }

  this.player_.cancelTrickPlay();
  this.trickPlayRate_ = 1;

  if (this.video_.paused) {
    this.video_.play();
  } else {
    this.video_.pause();
  }
};


/** @private */
ShakaControls.prototype.onPlayStateChange_ = function() {
  // Video is paused during seek, so don't show the play arrow while seeking:
  if (this.video_.paused && !this.isSeeking_) {
    this.playPauseButton_.textContent = 'play_arrow';
    this.giantPlayButtonContainer_.style.display = 'inline';
  } else {
    this.playPauseButton_.textContent = 'pause';
    this.giantPlayButtonContainer_.style.display = 'none';
  }
};


/** @private */
ShakaControls.prototype.onSeekStart_ = function() {
  this.isSeeking_ = true;
  this.video_.pause();
};


/** @private */
ShakaControls.prototype.onSeekInput_ = function() {
  if (!this.video_.duration) {
    // Can't seek yet.  Ignore.
    return;
  }

  // Update the UI right away.
  this.updateTimeAndSeekRange_();

  // Collect input events and seek when things have been stable for 125ms.
  if (this.seekTimeoutId_ != null) {
    window.clearTimeout(this.seekTimeoutId_);
  }
  this.seekTimeoutId_ = window.setTimeout(
      this.onSeekInputTimeout_.bind(this), 125);
};


/** @private */
ShakaControls.prototype.onSeekInputTimeout_ = function() {
  this.seekTimeoutId_ = null;
  this.video_.currentTime = parseFloat(this.seekBar_.value);
};


/** @private */
ShakaControls.prototype.onSeekEnd_ = function() {
  if (this.seekTimeoutId_ != null) {
    // They just let go of the seek bar, so end the timer early.
    window.clearTimeout(this.seekTimeoutId_);
    this.onSeekInputTimeout_();
  }

  this.isSeeking_ = false;
  this.video_.play();
};


/** @private */
ShakaControls.prototype.onMuteClick_ = function() {
  this.video_.muted = !this.video_.muted;
};


/**
 * Updates the controls to reflect volume changes.
 * @private
 */
ShakaControls.prototype.onVolumeStateChange_ = function() {
  if (this.video_.muted) {
    this.muteButton_.textContent = 'volume_off';
    this.volumeBar_.value = 0;
  } else {
    this.muteButton_.textContent = 'volume_up';
    this.volumeBar_.value = this.video_.volume;
  }

  var gradient = ['to right'];
  gradient.push('#ccc ' + (this.volumeBar_.value * 100) + '%');
  gradient.push('#000 ' + (this.volumeBar_.value * 100) + '%');
  gradient.push('#000 100%');
  this.volumeBar_.style.background =
      'linear-gradient(' + gradient.join(',') + ')';
};


/** @private */
ShakaControls.prototype.onVolumeInput_ = function() {
  this.video_.volume = parseFloat(this.volumeBar_.value);
  this.video_.muted = false;
};


/** @private */
ShakaControls.prototype.onCaptionClick_ = function() {
  this.player_.setTextTrackVisibility(!this.player_.isTextTrackVisible());
};


/** @private */
ShakaControls.prototype.onTracksChange_ = function() {
  var hasText = this.player_.getTracks().some(function(track) {
    return track.type == 'text';
  });
  this.captionButton_.style.display = hasText ? 'inherit' : 'none';
};


/** @private */
ShakaControls.prototype.onCaptionStateChange_ = function() {
  if (this.player_.isTextTrackVisible()) {
    this.captionButton_.style.color = 'white';
  } else {
    // Make the button look darker to show that the text track is inactive.
    this.captionButton_.style.color = 'rgba(255, 255, 255, 0.3)';
  }
};


/** @private */
ShakaControls.prototype.onFullscreenClick_ = function() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    this.videoContainer_.requestFullscreen();
  }
};


/** @private */
ShakaControls.prototype.onCurrentTimeClick_ = function() {
  // Jump to LIVE if the user clicks on the current time.
  if (this.player_.isLive()) {
    this.video_.currentTime = this.seekBar_.max;
  }
};


/**
 * Cycles trick play rate between -1, -2, -4, and -8.
 * @private
 */
ShakaControls.prototype.onRewindClick_ = function() {
  if (!this.video_.duration) {
    return;
  }

  this.trickPlayRate_ = (this.trickPlayRate_ > 0 || this.trickPlayRate_ < -4) ?
      -1 : this.trickPlayRate_ * 2;
  this.player_.trickPlay(this.trickPlayRate_);
};


/**
 * Cycles trick play rate between 1, 2, 4, and 8.
 * @private
 */
ShakaControls.prototype.onFastForwardClick_ = function() {
  if (!this.video_.duration) {
    return;
  }

  this.trickPlayRate_ = (this.trickPlayRate_ < 0 || this.trickPlayRate_ > 4) ?
      1 : this.trickPlayRate_ * 2;
  this.player_.trickPlay(this.trickPlayRate_);
};


/** @private */
ShakaControls.prototype.onCastClick_ = function() {
  if (this.castProxy_.isCasting()) {
    this.castProxy_.suggestDisconnect();
  } else {
    this.castButton_.disabled = true;
    this.castProxy_.cast().then(function() {
      this.castButton_.disabled = false;
      // Success!
    }.bind(this), function(error) {
      this.castButton_.disabled = false;
      if (error.code != shaka.util.Error.Code.CAST_CANCELED_BY_USER) {
        this.onError_(error);
      }
    }.bind(this));
  }
};


/**
 * @param {Event} event
 * @private
 */
ShakaControls.prototype.onCastStatusChange_ = function(event) {
  var canCast = this.castProxy_.canCast() && this.castAllowed_;
  var isCasting = this.castProxy_.isCasting();

  this.notifyCastStatus_(isCasting);
  this.castButton_.style.display = canCast ? 'inherit' : 'none';
  this.castButton_.textContent = isCasting ? 'cast_connected' : 'cast';
  this.castReceiverName_.style.display =
      isCasting ? 'inherit' : 'none';
  this.castReceiverName_.textContent =
      isCasting ? 'Casting to ' + this.castProxy_.receiverName() : '';
  this.controls_.classList.toggle('casting', this.castProxy_.isCasting());
};


/**
 * @param {Event} event
 * @private
 */
ShakaControls.prototype.onBufferingStateChange_ = function(event) {
  this.bufferingSpinner_.style.display =
      event.buffering ? 'inherit' : 'none';
};


/**
 * @param {boolean} show True to show trick play controls, false to show seek
 *   bar.
 */
ShakaControls.prototype.showTrickPlay = function(show) {
  this.seekBar_.parentElement.style.width = show ? 'auto' : '100%';
  this.seekBar_.style.display = show ? 'none' : 'flex';
  this.rewindButton_.style.display = show ? 'inline' : 'none';
  this.fastForwardButton_.style.display = show ? 'inline' : 'none';
};


/**
 * Called when the seek range or current time need to be updated.
 * @private
 */
ShakaControls.prototype.updateTimeAndSeekRange_ = function() {
  var displayTime = this.isSeeking_ ?
      this.seekBar_.value : this.video_.currentTime;
  var duration = this.video_.duration;
  var bufferedLength = this.video_.buffered.length;
  var bufferedStart = bufferedLength ? this.video_.buffered.start(0) : 0;
  var bufferedEnd = bufferedLength ? this.video_.buffered.end(0) : 0;
  var seekRange = this.player_.seekRange();

  this.seekBar_.min = seekRange.start;
  this.seekBar_.max = seekRange.end;

  if (this.player_.isLive()) {
    // The amount of time we are behind the live edge.
    var behindLive = Math.floor(seekRange.end - displayTime);
    displayTime = Math.max(0, behindLive);
    var showHour = (seekRange.end - seekRange.start) >= 3600;

    // Consider "LIVE" when less than 1 second behind the live-edge.  Always
    // show the full time string when seeking, including the leading '-';
    // otherwise, the time string "flickers" near the live-edge.
    if ((displayTime >= 1) || this.isSeeking_) {
      this.currentTime_.textContent =
          '- ' + this.buildTimeString_(displayTime, showHour);
      this.currentTime_.style.cursor = 'pointer';
    } else {
      this.currentTime_.textContent = 'LIVE';
      this.currentTime_.style.cursor = '';
    }

    if (!this.isSeeking_) {
      this.seekBar_.value = seekRange.end - displayTime;
    }
  } else {
    var showHour = duration >= 3600;
    this.currentTime_.textContent =
        this.buildTimeString_(displayTime, showHour);

    if (!this.isSeeking_) {
      this.seekBar_.value = displayTime;
    }

    this.currentTime_.style.cursor = '';
  }

  var gradient = ['to right'];
  if (bufferedLength == 0) {
    gradient.push('#000 0%');
  } else {
    // NOTE: the fallback to zero eliminates NaN.
    var bufferStartFraction = (bufferedStart / duration) || 0;
    var bufferEndFraction = (bufferedEnd / duration) || 0;
    var playheadFraction = (displayTime / duration) || 0;

    if (this.player_.isLive()) {
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
  this.seekBar_.style.background =
      'linear-gradient(' + gradient.join(',') + ')';
};


/**
 * Builds a time string, e.g., 01:04:23, from |displayTime|.
 *
 * @param {number} displayTime
 * @param {boolean} showHour
 * @return {string}
 * @private
 */
ShakaControls.prototype.buildTimeString_ = function(displayTime, showHour) {
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
