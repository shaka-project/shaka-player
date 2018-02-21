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

goog.provide('shaka.media.VideoWrapper');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Timer');



/**
 * Creates a new VideoWrapper that manages setting current time and playback
 * rate.  This handles seeks before content is loaded and ensuring the video
 * time is set properly.  This doesn't handle repositioning within the
 * presentation window.
 *
 * @param {!HTMLMediaElement} video
 * @param {function()} onSeek Called when the video seeks.
 * @param {number} startTime The time to start at.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.VideoWrapper = function(video, onSeek, startTime) {
  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {?function()} */
  this.onSeek_ = onSeek;

  /** @private {number} */
  this.startTime_ = startTime;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {number} */
  this.playbackRate_ = 1;

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {shaka.util.Timer} */
  this.trickPlayTimer_ = null;

  /**
   * Used to batch up early seeks and delay until video.currentTime is updated.
   *
   * @private {shaka.util.Timer}
   */
  this.earlySeekTimer_ = new shaka.util.Timer(this.onEarlySeek_.bind(this));


  // Check if the video has already loaded some metadata.
  if (video.readyState > 0) {
    this.onLoadedMetadata_();
  } else {
    this.eventManager_.listenOnce(
        video, 'loadedmetadata', this.onLoadedMetadata_.bind(this));

    // Check for early seeks before we have any media loaded.
    // See onEarlySeek_() for details.
    this.eventManager_.listen(video, 'timeupdate', () => {
      // In practice, the value of video.currentTime doesn't change before the
      // event is fired.  Delay 100ms and batch up changes.
      this.earlySeekTimer_.schedule(0.1 /* seconds */);
    });
  }

  this.eventManager_.listen(video, 'ratechange', this.onRateChange_.bind(this));
};


/** @override */
shaka.media.VideoWrapper.prototype.destroy = function() {
  let p = this.eventManager_.destroy();
  this.eventManager_ = null;

  if (this.trickPlayTimer_ != null) {
    this.trickPlayTimer_.cancel();
    this.trickPlayTimer_ = null;
  }

  if (this.earlySeekTimer_ != null) {
    this.earlySeekTimer_.cancel();
    this.earlySeekTimer_ = null;
  }

  this.video_ = null;
  this.onSeek_ = null;

  return p;
};


/**
 * Gets the video's current (logical) position.
 *
 * @return {number}
 */
shaka.media.VideoWrapper.prototype.getTime = function() {
  if (this.video_.readyState > 0) {
    return this.video_.currentTime;
  } else {
    return this.startTime_;
  }
};


/**
 * Sets the current time of the video.
 *
 * @param {number} time
 */
shaka.media.VideoWrapper.prototype.setTime = function(time) {
  if (this.video_.readyState > 0) {
    this.movePlayhead_(this.video_.currentTime, time);
  } else {
    this.startTime_ = time;
    setTimeout(this.onSeek_, 0);
  }
};


/**
 * Gets the current effective playback rate.  This may be negative even if the
 * browser does not directly support rewinding.
 * @return {number}
 */
shaka.media.VideoWrapper.prototype.getPlaybackRate = function() {
  return this.playbackRate_;
};


/**
 * Sets the playback rate.
 * @param {number} rate
 */
shaka.media.VideoWrapper.prototype.setPlaybackRate = function(rate) {
  if (this.trickPlayTimer_ != null) {
    this.trickPlayTimer_.cancel();
    this.trickPlayTimer_ = null;
  }

  this.playbackRate_ = rate;
  // All major browsers support playback rates above zero.  Only need fake
  // trick play for negative rates.
  this.video_.playbackRate = (this.buffering_ || rate < 0) ? 0 : rate;

  if (!this.buffering_ && rate < 0) {
    // Defer creating the timer until we stop buffering.  This function will be
    // called again from setBuffering().
    let trickPlay = () => { this.video_.currentTime += rate / 4; };
    this.trickPlayTimer_ = new shaka.util.Timer(trickPlay);
    this.trickPlayTimer_.scheduleRepeated(0.25);
  }
};


/**
 * Stops the playhead for buffering, or resumes the playhead after buffering.
 *
 * @param {boolean} buffering True to stop the playhead; false to allow it to
 *   continue.
 */
shaka.media.VideoWrapper.prototype.setBuffering = function(buffering) {
  if (buffering != this.buffering_) {
    this.buffering_ = buffering;
    this.setPlaybackRate(this.playbackRate_);
  }
};


/**
 * Handles a 'ratechange' event.
 *
 * @private
 */
shaka.media.VideoWrapper.prototype.onRateChange_ = function() {
  // NOTE: This will not allow explicitly setting the playback rate to 0 while
  // the playback rate is negative.  Pause will still work.
  let expectedRate =
      this.buffering_ || this.playbackRate_ < 0 ? 0 : this.playbackRate_;

  // Native controls in Edge trigger a change to playbackRate and set it to 0
  // when seeking.  If we don't exclude 0 from this check, we will force the
  // rate to stay at 0 after a seek with Edge native controls.
  // https://github.com/google/shaka-player/issues/951
  if (this.video_.playbackRate && this.video_.playbackRate != expectedRate) {
    shaka.log.debug('Video playback rate changed to', this.video_.playbackRate);
    this.setPlaybackRate(this.video_.playbackRate);
  }
};


/**
 * Handles a 'loadedmetadata' event.
 *
 * @private
 */
shaka.media.VideoWrapper.prototype.onLoadedMetadata_ = function() {
  // We are out of the phase in which "early seek" may occur, so stop listening
  // for the 'timeupdate' event.
  this.eventManager_.unlisten(this.video_, 'timeupdate');

  // Cancel any pending early seek timer.  Cancelation is important because it
  // resolves a race between the first "timeupdate" and the "loadedmetadata"
  // event.  On some browsers, "timeupdate" fires right before "loadedmetadata",
  // which would cause earlySeekTimer_ to fire inappropriately and trigger a
  // failed assertion.
  this.earlySeekTimer_.cancel();

  if (Math.abs(this.video_.currentTime - this.startTime_) < 0.001) {
    this.onSeekingToStartTime_();
  } else {
    this.eventManager_.listenOnce(
        this.video_, 'seeking', this.onSeekingToStartTime_.bind(this));
    this.video_.currentTime = this.startTime_;
  }
};


/**
 * Handles the 'seeking' event from the initial jump to the start time (if
 * there is one).
 *
 * @private
 */
shaka.media.VideoWrapper.prototype.onSeekingToStartTime_ = function() {
  goog.asserts.assert(this.video_.readyState > 0,
                      'readyState should be greater than 0');
  this.eventManager_.listen(this.video_, 'seeking', () => this.onSeek_());
};


/**
 * Handles a 'timeupdate' event that occurs before metadata is loaded, which
 * would indicate that the user is seeking.
 *
 * Note that a 'seeking' event will not fire before content is loaded.  In this
 * state, the playhead can only move as a result of a seek action, so timeupdate
 * is a good choice.
 *
 * @private
 */
shaka.media.VideoWrapper.prototype.onEarlySeek_ = function() {
  goog.asserts.assert(this.video_.readyState == 0,
                      'readyState should be 0 for early seeking');

  this.startTime_ = this.video_.currentTime;
  this.onSeek_();
};


/**
 * Moves the playhead to the target time, triggering a call to onSeeking_().
 *
 * @param {number} currentTime
 * @param {number} targetTime
 * @private
 */
shaka.media.VideoWrapper.prototype.movePlayhead_ = function(
    currentTime, targetTime) {
  shaka.log.debug('Moving playhead...',
                  'currentTime=' + currentTime,
                  'targetTime=' + targetTime);
  this.video_.currentTime = targetTime;

  // Sometimes, IE and Edge ignore re-seeks.  Check every 100ms and try
  // again if need be, up to 10 tries.
  // Delay stats over 100 runs of a re-seeking integration test:
  // IE     -   0ms -  47%
  // IE     - 100ms -  63%
  // Edge   -   0ms -   2%
  // Edge   - 100ms -  40%
  // Edge   - 200ms -  32%
  // Edge   - 300ms -  24%
  // Edge   - 400ms -   2%
  // Chrome -   0ms - 100%
  // TODO: File a bug on IE/Edge about this.
  let tries = 0;
  let recheck = () => {
    if (!this.video_) return;
    if (tries++ >= 10) return;

    if (this.video_.currentTime == currentTime) {
      // Sigh.  Try again.
      this.video_.currentTime = targetTime;
      setTimeout(recheck, 100);
    }
  };
  setTimeout(recheck, 100);
};
