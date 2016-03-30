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
   * The playhead's initial position in seconds.
   * @private {number}
   * @const
   */
  this.startTime_;

  /** @private {?function(boolean)} */
  this.onBuffering_ = onBuffering;

  /** @private {?function()} */
  this.onSeek_ = onSeek;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {number} */
  this.lastPlaybackRate_ = 0;

  // Set the start time.
  if (startTime == null) {
    if (timeline.getDuration() < Number.POSITIVE_INFINITY) {
      startTime = timeline.getSegmentAvailabilityStart();
    } else {
      // For live presentations, ensure that the startup buffering goal can be
      // met.
      startTime =
          Math.max(timeline.getSegmentAvailabilityEnd() - rebufferingGoal,
                   timeline.getSegmentAvailabilityStart());
    }
  }
  this.startTime_ = startTime;
  shaka.log.debug('Starting the presentation at ' + startTime + ' seconds...');

  // Check if the video has already loaded some metadata.
  if (video.readyState > 0) {
    this.onLoadedMetadata_();
  } else {
    this.eventManager_.listen(
        video, 'loadedmetadata', this.onLoadedMetadata_.bind(this));
  }
};


/** @override */
shaka.media.Playhead.prototype.destroy = function() {
  var p = this.eventManager_.destroy();
  this.eventManager_ = null;

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
  var time = this.video_.readyState > 0 ?
             this.video_.currentTime :
             this.startTime_;
  // Although we restrict the video's currentTime elsewhere, clamp it here to
  // ensure any timing issues (e.g., the user agent seeks and calls this
  // function before we receive the 'seeking' event) don't cause us to return a
  // time outside the segment availability window.
  return this.clampTime_(time);
};


/**
 * Stops the playhead for buffering, or resumes the playhead after buffering.
 *
 * @param {boolean} buffering True to stop the playhead; false to allow it to
 *   continue.
 */
shaka.media.Playhead.prototype.setBuffering = function(buffering) {
  if (buffering && !this.buffering_) {
    this.lastPlaybackRate_ = this.video_.playbackRate;
    this.video_.playbackRate = 0;
    this.buffering_ = true;
    this.onBuffering_(true);
  } else if (!buffering && this.buffering_) {
    if (this.video_.playbackRate == 0) {
      // The app hasn't set a new playback rate, so restore the old one.
      this.video_.playbackRate = this.lastPlaybackRate_;
    } else {
      // There's nothing we could have done to stop the app from setting a new
      // rate, so we don't need to do anything here.
    }
    this.buffering_ = false;
    this.onBuffering_(false);
  }
};


/**
 * Handles a 'loadedmetadata' event.
 *
 * @private
 */
shaka.media.Playhead.prototype.onLoadedMetadata_ = function() {
  this.eventManager_.unlisten(this.video_, 'loadedmetadata');
  this.eventManager_.listen(this.video_, 'seeking', this.onSeeking_.bind(this));

  // Move the real playhead to the start time.
  var targetTime = this.clampTime_(this.startTime_);
  if (this.video_.currentTime != targetTime)
    this.video_.currentTime = targetTime;
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

  if (targetTime != currentTime) {
    shaka.log.debug('Repositioning playhead...',
                    'currentTime=' + currentTime,
                    'targetTime=' + targetTime);
    // Triggers another call to onSeeking_().
    this.video_.currentTime = targetTime;

    // Sometimes, IE and Edge ignore this re-seek.  Check every 100ms and try
    // again if need be, up to 10 tries.
    // Delay stats over 100 runs of a reseeking integration test:
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

    return;
  }

  shaka.log.v1('Seek to ' + currentTime);
  this.onSeek_();
};


/**
 * Computes a time to reposition the playhead to after a seek.
 *
 * @param {number} currentTime
 * @return {number} The time to reposition the playhead to.
 * @private
 */
shaka.media.Playhead.prototype.reposition_ = function(currentTime) {
  var availabilityDuration = this.timeline_.getSegmentAvailabilityDuration();
  var live = (availabilityDuration != null) &&
             (availabilityDuration < Number.POSITIVE_INFINITY);

  var start = this.timeline_.getSegmentAvailabilityStart();
  var end = this.timeline_.getSegmentAvailabilityEnd();

  if (!live) {
    if (currentTime < start) {
      shaka.log.v1('Seek before start.');
      return start;
    } else if (currentTime > end) {
      shaka.log.v1('Seek past end.');
      return end;
    }
    return currentTime;
  }

  // TODO: Link to public doc that explains the following code.

  var left = start + 1;
  var safe = left + this.rebufferingGoal_;

  if (currentTime >= safe && currentTime <= end) {
    shaka.log.v1('Seek in safe region.');
    return currentTime;
  }

  var bufferedAhead = shaka.media.TimeRangesUtils.bufferedAheadOf(
      this.video_.buffered, currentTime);
  if ((bufferedAhead != 0) && (currentTime >= left && currentTime <= end)) {
    shaka.log.v1('Seek outside safe region & in buffered region.');
    return currentTime;
  } else if (currentTime > end) {
    shaka.log.v1('Seek past end.');
    return end;
  } else if ((end < safe) && (currentTime >= left && currentTime <= end)) {
    // The segment availability window is so small we cannot reposition the
    // playhead normally; however, since |currentTime| is within the window, we
    // don't have to do anything.
    shaka.log.v1('Seek outside safe region & in unbuffered region,',
                 'but cannot reposition the playhead.');
    return currentTime;
  }

  // It's not safe to buffer from |currentTime|, so reposition the playhead.
  shaka.log.v1('Seek outside safe region & in unbuffered region,',
               'or seek before start');
  return Math.min(safe + 2, end);
};


/**
 * Clamps the given time to the segment availability window.
 *
 * @param {number} time The time in seconds.
 * @return {number} The clamped time in seconds.
 * @private
 */
shaka.media.Playhead.prototype.clampTime_ = function(time) {
  var start = this.timeline_.getSegmentAvailabilityStart();
  if (time < start) return start;

  var end = this.timeline_.getSegmentAvailabilityEnd();
  if (time > end) return end;

  return time;
};

