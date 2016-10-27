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

goog.provide('shaka.media.Playhead');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IDestroyable');



/**
 * Creates a Playhead, which manages the video's current time.
 *
 * The Playhead provides mechanisms for setting the presentation's start time,
 * restricting seeking to valid time ranges, and stopping playback for startup
 * and re- buffering.
 *
 * @param {HTMLMediaElement} video
 * @param {!shaka.media.PresentationTimeline} timeline
 * @param {number} rebufferingGoal
 * @param {?number} startTime The playhead's initial position in seconds. If
 *   null, defaults to the start of the presentation for VOD and the live-edge
 *   for live.
 * @param {function(boolean)} onBuffering Called and passed true when stopped
 *   for buffering; called and passed false when proceeding after buffering.
 *   If passed true, the callback should not set the video's playback rate.
 * @param {function()} onSeek Called when the user agent seeks to a time within
 *   the presentation timeline.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.Playhead = function(
    video, timeline, rebufferingGoal, startTime, onBuffering, onSeek) {
  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {shaka.media.PresentationTimeline} */
  this.timeline_ = timeline;

  /** @private {number} */
  this.rebufferingGoal_ = rebufferingGoal;

  /**
   * The playhead's initial position in seconds, or null if it should
   * automatically be calculated later.
   * @private {?number}
   * @const
   */
  this.startTime_ = startTime;

  /** @private {?function(boolean)} */
  this.onBuffering_ = onBuffering;

  /** @private {?function()} */
  this.onSeek_ = onSeek;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {number} */
  this.playbackRate_ = 1;

  /** @private {?number} */
  this.trickPlayIntervalId_ = null;

  /** @private {?number} */
  this.watchdogTimer_ = null;

  // Check if the video has already loaded some metadata.
  if (video.readyState > 0) {
    this.onLoadedMetadata_();
  } else {
    this.eventManager_.listen(
        video, 'loadedmetadata', this.onLoadedMetadata_.bind(this));
  }

  this.eventManager_.listen(video, 'ratechange', this.onRateChange_.bind(this));
  this.startWatchdogTimer_();
};


/** @override */
shaka.media.Playhead.prototype.destroy = function() {
  var p = this.eventManager_.destroy();
  this.eventManager_ = null;
  this.cancelWatchdogTimer_();

  if (this.trickPlayIntervalId_ != null) {
    window.clearInterval(this.trickPlayIntervalId_);
    this.trickPlayIntervalId_ = null;
  }

  this.video_ = null;
  this.timeline_ = null;
  this.onBuffering_ = null;
  this.onSeek_ = null;

  return p;
};


/** @param {number} rebufferingGoal */
shaka.media.Playhead.prototype.setRebufferingGoal = function(rebufferingGoal) {
  this.rebufferingGoal_ = rebufferingGoal;
};


/**
 * Gets the playhead's current (logical) position.
 *
 * @return {number}
 */
shaka.media.Playhead.prototype.getTime = function() {
  if (this.video_.readyState > 0) {
    // Although we restrict the video's currentTime elsewhere, clamp it here to
    // ensure any timing issues (e.g., the user agent seeks and calls this
    // function before we receive the 'seeking' event) don't cause us to return
    // a time outside the segment availability window.
    return this.clampTime_(this.video_.currentTime);
  }

  return this.getStartTime_();
};


/**
 * Gets the playhead's initial position in seconds.
 *
 * @return {number}
 * @private
 */
shaka.media.Playhead.prototype.getStartTime_ = function() {
  if (this.startTime_) {
    return this.clampTime_(this.startTime_);
  }

  var startTime;
  if (this.timeline_.getDuration() < Infinity) {
    // If the presentation is VOD, or if the presentation is live but has
    // finished broadcasting, then start from the beginning.
    startTime = this.timeline_.getEarliestStart();
  } else {
    // Otherwise, start near the live-edge, but ensure that the startup
    // buffering goal can be met
    startTime = Math.max(
        this.timeline_.getSeekRangeEnd(),
        this.timeline_.getEarliestStart());
  }
  return startTime;
};


/**
 * Stops the playhead for buffering, or resumes the playhead after buffering.
 *
 * @param {boolean} buffering True to stop the playhead; false to allow it to
 *   continue.
 */
shaka.media.Playhead.prototype.setBuffering = function(buffering) {
  if (buffering != this.buffering_) {
    this.buffering_ = buffering;
    this.setPlaybackRate(this.playbackRate_);
    this.onBuffering_(buffering);
  }
};


/**
 * Starts the watchdog timer.
 * @private
 */
shaka.media.Playhead.prototype.startWatchdogTimer_ = function() {
  this.cancelWatchdogTimer_();
  this.watchdogTimer_ =
      window.setTimeout(this.onWatchdogTimer_.bind(this), 250);
};


/**
 * Cancels the watchdog timer, if any.
 * @private
 */
shaka.media.Playhead.prototype.cancelWatchdogTimer_ = function() {
  if (this.watchdogTimer_) {
    window.clearTimeout(this.watchdogTimer_);
    this.watchdogTimer_ = null;
  }
};


/**
 * Called on a recurring timer to detect buffering events.
 * @private
 */
shaka.media.Playhead.prototype.onWatchdogTimer_ = function() {
  this.watchdogTimer_ = null;
  this.startWatchdogTimer_();

  // This uses an intersection of buffered ranges for both audio and video, so
  // it's an accurate way to determine if we are buffering or not.
  var bufferedAhead = shaka.media.TimeRangesUtils.bufferedAheadOf(
      this.video_.buffered, this.video_.currentTime);
  var bufferEnd = shaka.media.TimeRangesUtils.bufferEnd(this.video_.buffered);

  var fudgeFactor = shaka.media.Playhead.FUDGE_FACTOR_;
  var threshold = shaka.media.Playhead.UNDERFLOW_THRESHOLD_;

  var duration = this.video_.duration - fudgeFactor;

  var atEnd = (bufferEnd >= duration) || (this.video_.ended);
  if (!this.buffering_) {
    // If there are no buffered ranges but the playhead is at the end of
    // the video then we shouldn't enter a buffering state.
    if (!atEnd && bufferedAhead < threshold) {
      this.setBuffering(true);
    }
  } else {
    if (atEnd || bufferedAhead > this.rebufferingGoal_) {
      this.setBuffering(false);
    }
  }
};


/**
 * Gets the current effective playback rate.  This may be negative even if the
 * browser does not directly support rewinding.
 * @return {number}
 */
shaka.media.Playhead.prototype.getPlaybackRate = function() {
  return this.playbackRate_;
};


/**
 * Sets the playback rate.
 * @param {number} rate
 */
shaka.media.Playhead.prototype.setPlaybackRate = function(rate) {
  if (this.trickPlayIntervalId_ != null) {
    window.clearInterval(this.trickPlayIntervalId_);
    this.trickPlayIntervalId_ = null;
  }

  this.playbackRate_ = rate;
  // All major browsers support playback rates above zero.  Only need fake
  // trick play for negative rates.
  this.video_.playbackRate = (this.buffering_ || rate < 0) ? 0 : rate;

  if (!this.buffering_ && rate < 0) {
    // Defer creating the timer until we stop buffering.  This function will be
    // called again from setBuffering().
    this.trickPlayIntervalId_ = window.setInterval(function() {
      this.video_.currentTime += rate / 4;
    }.bind(this), 250);
  }
};


/**
 * Handles a 'ratechange' event.
 *
 * @private
 */
shaka.media.Playhead.prototype.onRateChange_ = function() {
  // NOTE: This will not allow explicitly setting the playback rate to 0 while
  // the playback rate is negative.  Pause will still work.
  var expectedRate =
      this.buffering_ || this.playbackRate_ < 0 ? 0 : this.playbackRate_;
  if (this.video_.playbackRate != expectedRate) {
    shaka.log.debug('Video playback rate changed to', this.video_.playbackRate);
    this.setPlaybackRate(this.video_.playbackRate);
  }
};


/**
 * Handles a 'loadedmetadata' event.
 *
 * @private
 */
shaka.media.Playhead.prototype.onLoadedMetadata_ = function() {
  this.eventManager_.unlisten(this.video_, 'loadedmetadata');

  // Move the real playhead to the start time.
  var targetTime = this.getStartTime_();
  if (Math.abs(this.video_.currentTime - targetTime) < 0.001) {
    this.eventManager_.listen(
        this.video_, 'seeking', this.onSeeking_.bind(this));
    this.eventManager_.listen(
        this.video_, 'playing', this.onPlaying_.bind(this));
  } else {
    this.eventManager_.listen(
        this.video_, 'seeking', this.onSeekingToStartTime_.bind(this));
    this.video_.currentTime = targetTime;
  }
};


/**
 * Handles the 'seeking' event from the initial jump to the start time (if
 * there is one).
 *
 * @private
 */
shaka.media.Playhead.prototype.onSeekingToStartTime_ = function() {
  goog.asserts.assert(this.video_.readyState > 0,
                      'readyState should be greater than 0');
  this.eventManager_.unlisten(this.video_, 'seeking');
  this.eventManager_.listen(this.video_, 'seeking', this.onSeeking_.bind(this));
  this.eventManager_.listen(this.video_, 'playing', this.onPlaying_.bind(this));
};


/**
 * Handles a 'seeking' event.
 *
 * @private
 */
shaka.media.Playhead.prototype.onSeeking_ = function() {
  goog.asserts.assert(this.video_.readyState > 0,
                      'readyState should be greater than 0');

  var currentTime = this.video_.currentTime;
  var targetTime = this.reposition_(currentTime);

  if (Math.abs(targetTime - currentTime) > 0.001) {
    this.movePlayhead_(currentTime, targetTime);
    return;
  }

  shaka.log.v1('Seek to ' + currentTime);
  this.onSeek_();
};


/**
 * Handles a 'playing' event.
 *
 * @private
 */
shaka.media.Playhead.prototype.onPlaying_ = function() {
  goog.asserts.assert(this.video_.readyState > 0,
                      'readyState should be greater than 0');

  var currentTime = this.video_.currentTime;
  var targetTime = this.reposition_(currentTime);

  if (Math.abs(targetTime - currentTime) > 0.001)
    this.movePlayhead_(currentTime, targetTime);
};


/**
 * Computes a new playhead position that's within the presentation timeline.
 *
 * @param {number} currentTime
 * @return {number} The time to reposition the playhead to.
 * @private
 */
shaka.media.Playhead.prototype.reposition_ = function(currentTime) {
  var timeline = this.timeline_;
  var start = timeline.getEarliestStart();
  var end = timeline.getSegmentAvailabilityEnd();

  if (!timeline.isLive() ||
      timeline.getSegmentAvailabilityDuration() == Infinity) {
    // If the presentation is live but has an infinite segment availability
    // duration then we can treat it as VOD since the start of the window is
    // not moving.
    if (currentTime < start) {
      shaka.log.v1('Playhead before start.');
      return start;
    } else if (currentTime > end) {
      shaka.log.v1('Playhead past end.');
      return end;
    }
    return currentTime;
  }

  // TODO: Link to public doc that explains the following code.

  var left = start + 1;
  var safe = left + this.rebufferingGoal_;

  if (currentTime >= safe && currentTime <= end) {
    shaka.log.v1('Playhead in safe region.');
    return currentTime;
  }

  var bufferedAhead = shaka.media.TimeRangesUtils.bufferedAheadOf(
      this.video_.buffered, currentTime);
  if ((bufferedAhead != 0) && (currentTime >= left && currentTime <= end)) {
    shaka.log.v1('Playhead outside safe region & in buffered region.');
    return currentTime;
  } else if (currentTime > end) {
    shaka.log.v1('Playhead past end.');
    return end;
  } else if ((end < safe) && (currentTime >= left && currentTime <= end)) {
    // The segment availability window is so small we cannot reposition the
    // playhead normally; however, since |currentTime| is within the window, we
    // don't have to do anything.
    shaka.log.v1('Playhead outside safe region & in unbuffered region,',
                 'but cannot reposition the playhead.');
    return currentTime;
  }

  // It's not safe to buffer from |currentTime|, so reposition the playhead.
  shaka.log.v1('Playhead outside safe region & in unbuffered region,',
               'or playhead before start');
  return Math.min(safe + 2, end);
};


/**
 * Moves the playhead to the target time, triggering a call to onSeeking_().
 *
 * @param {number} currentTime
 * @param {number} targetTime
 * @private
 */
shaka.media.Playhead.prototype.movePlayhead_ = function(
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
  var tries = 0;
  var recheck = (function() {
    if (!this.video_) return;
    if (tries++ >= 10) return;

    if (this.video_.currentTime == currentTime) {
      // Sigh.  Try again.
      this.video_.currentTime = targetTime;
      setTimeout(recheck, 100);
    }
  }).bind(this);
  setTimeout(recheck, 100);
};


/**
 * Clamps the given time to the segment availability window.
 *
 * @param {number} time The time in seconds.
 * @return {number} The clamped time in seconds.
 * @private
 */
shaka.media.Playhead.prototype.clampTime_ = function(time) {
  var start = this.timeline_.getEarliestStart();
  if (time < start) return start;

  var end = this.timeline_.getSegmentAvailabilityEnd();
  if (time > end) return end;

  return time;
};


/**
 * The threshold for underflow, in seconds.  If there is less than this amount
 * of data buffered, we will consider the player to be out of data.
 *
 * @private {number}
 * @const
 */
shaka.media.Playhead.UNDERFLOW_THRESHOLD_ = 0.5;


/**
 * A fudge factor used when comparing buffered ranges to the duration to
 * determine if we have buffered all available content.
 *
 * @private {number}
 * @const
 */
shaka.media.Playhead.FUDGE_FACTOR_ = 0.05;
