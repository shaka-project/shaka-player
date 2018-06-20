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
goog.require('shaka.media.GapJumpingController');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.media.VideoWrapper');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.Timer');



/**
 * Creates a Playhead, which manages the video's current time.
 *
 * The Playhead provides mechanisms for setting the presentation's start time,
 * restricting seeking to valid time ranges, and stopping playback for startup
 * and re-buffering.
 *
 * @param {!HTMLMediaElement} video
 * @param {shakaExtern.Manifest} manifest
 * @param {shakaExtern.StreamingConfiguration} config
 * @param {?number} startTime The playhead's initial position in seconds. If
 *   null, defaults to the start of the presentation for VOD and the live-edge
 *   for live.
 * @param {function()} onSeek Called when the user agent seeks to a time within
 *   the presentation timeline.
 * @param {function(!Event)} onEvent Called when an event is raised to be sent
 *   to the application.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.Playhead = function(
    video, manifest, config, startTime, onSeek, onEvent) {
  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = manifest;

  /** @private {?shakaExtern.StreamingConfiguration} */
  this.config_ = config;

  /** @private {?function()} */
  this.onSeek_ = onSeek;

  /** @private {?shaka.util.Timer} */
  this.checkWindowTimer_ = null;

  /** @private {?number} */
  this.lastCorrectiveSeek_;

  /** @private {shaka.media.GapJumpingController} */
  this.gapController_ =
      new shaka.media.GapJumpingController(video, manifest, config, onEvent);

  /** @private {shaka.media.VideoWrapper} */
  this.videoWrapper_ = new shaka.media.VideoWrapper(
      video, this.onSeeking_.bind(this), this.getStartTime_(startTime));


  let poll = this.onPollWindow_ .bind(this);
  this.checkWindowTimer_ = new shaka.util.Timer(poll);
  this.checkWindowTimer_.scheduleRepeated(0.25);
};


/**
 * This is the minimum size (in seconds) that the seek range can be.  If it is
 * smaller than this, change it to be this big so we don't repeatedly seek to
 * keep within a zero-width window.
 * This has been increased to 3s long, to account for the weaker hardware on
 * Chromecasts.
 * @private {number}
 * @const
 */
shaka.media.Playhead.MIN_SEEK_RANGE_ = 3.0;


/** @override */
shaka.media.Playhead.prototype.destroy = function() {
  let p = Promise.all([
    this.videoWrapper_.destroy(),
    this.gapController_.destroy(),
  ]);
  this.videoWrapper_ = null;
  this.gapController_ = null;

  if (this.checkWindowTimer_ != null) {
    this.checkWindowTimer_.cancel();
    this.checkWindowTimer_ = null;
  }

  this.video_ = null;
  this.manifest_ = null;
  this.config_ = null;
  this.onSeek_ = null;

  return p;
};


/**
 * Adjust the start time.  Used by Player to implement the
 * streaming.startAtSegmentBoundary configuration.
 *
 * @param {number} startTime
 */
shaka.media.Playhead.prototype.setStartTime = function(startTime) {
  this.videoWrapper_.setTime(startTime);
};


/**
 * Gets the playhead's current (logical) position.
 *
 * @return {number}
 */
shaka.media.Playhead.prototype.getTime = function() {
  let time = this.videoWrapper_.getTime();
  if (this.video_.readyState > 0) {
    // Although we restrict the video's currentTime elsewhere, clamp it here to
    // ensure timing issues don't cause us to return a time outside the segment
    // availability window.  E.g., the user agent seeks and calls this function
    // before we receive the 'seeking' event.
    //
    // We don't buffer when the livestream video is paused and the playhead time
    // is out of the seek range; thus, we do not clamp the current time when the
    // video is paused.
    // https://github.com/google/shaka-player/issues/1121
    if (!this.video_.paused) {
      time = this.clampTime_(time);
    }
  }

  return time;
};


/**
 * Gets the playhead's initial position in seconds.
 *
 * @param {?number} startTime
 * @return {number}
 * @private
 */
shaka.media.Playhead.prototype.getStartTime_ = function(startTime) {
  let timeline = this.manifest_.presentationTimeline;
  if (startTime == null) {
    if (timeline.getDuration() < Infinity) {
      // If the presentation is VOD, or if the presentation is live but has
      // finished broadcasting, then start from the beginning.
      startTime = timeline.getSeekRangeStart();
    } else {
      // Otherwise, start near the live-edge.
      startTime = timeline.getSeekRangeEnd();
    }
  } else if (startTime < 0) {
    // For live streams, if the startTime is negative, start from a certain
    // offset time from the live edge.  If the offset from the live edge is not
    // available, start from the current available segment start point instead,
    // handled by clampTime_().
    startTime = timeline.getSeekRangeEnd() + startTime;
  }
  return this.clampSeekToDuration_(this.clampTime_(startTime));
};


/**
 * Stops the playhead for buffering, or resumes the playhead after buffering.
 *
 * @param {boolean} buffering True to stop the playhead; false to allow it to
 *   continue.
 */
shaka.media.Playhead.prototype.setBuffering = function(buffering) {
  this.videoWrapper_.setBuffering(buffering);
};


/**
 * Gets the current effective playback rate.  This may be negative even if the
 * browser does not directly support rewinding.
 * @return {number}
 */
shaka.media.Playhead.prototype.getPlaybackRate = function() {
  return this.videoWrapper_.getPlaybackRate();
};


/**
 * Sets the playback rate.
 * @param {number} rate
 */
shaka.media.Playhead.prototype.setPlaybackRate = function(rate) {
  this.videoWrapper_.setPlaybackRate(rate);
};


/**
 * Called when a segment is appended by StreamingEngine, but not when a clear is
 * pending.  This means StreamingEngine will continue buffering forward from
 * what is buffered, so that we know about any gaps before the start.
 */
shaka.media.Playhead.prototype.onSegmentAppended = function() {
  this.gapController_.onSegmentAppended();
};


/**
 * Called on a recurring timer to keep the playhead from falling outside the
 * availability window.
 *
 * @private
 */
shaka.media.Playhead.prototype.onPollWindow_ = function() {
  // Don't catch up to the seek range when we are paused or empty.
  // The definition of "seeking" says that we are seeking until the buffered
  // data intersects with the playhead.  If we fall outside of the seek range,
  // it doesn't matter if we are in a "seeking" state.  We can and should go
  // ahead and catch up while seeking.
  if (this.video_.readyState == 0 || this.video_.paused) {
    return;
  }

  let currentTime = this.video_.currentTime;
  let timeline = this.manifest_.presentationTimeline;
  let seekStart = timeline.getSeekRangeStart();
  let seekEnd = timeline.getSeekRangeEnd();

  const minRange = shaka.media.Playhead.MIN_SEEK_RANGE_;
  if (seekEnd - seekStart < minRange) {
    seekStart = seekEnd - minRange;
  }

  if (currentTime < seekStart) {
    // The seek range has moved past the playhead.  Move ahead to catch up.
    let targetTime = this.reposition_(currentTime);
    shaka.log.info('Jumping forward ' + (targetTime - currentTime) +
                   ' seconds to catch up with the seek range.');
    this.video_.currentTime = targetTime;
  }
};


/**
 * Handles when a seek happens on the video.
 *
 * @private
 */
shaka.media.Playhead.prototype.onSeeking_ = function() {
  this.gapController_.onSeeking();
  let currentTime = this.videoWrapper_.getTime();
  let targetTime = this.reposition_(currentTime);

  const gapLimit = shaka.media.GapJumpingController.BROWSER_GAP_TOLERANCE;
  if (Math.abs(targetTime - currentTime) > gapLimit) {
    // You can only seek like this every so often. This is to prevent an
    // infinite loop on systems where changing currentTime takes a significant
    // amount of time (e.g. Chromecast).
    let time = new Date().getTime() / 1000;
    if (!this.lastCorrectiveSeek_ || this.lastCorrectiveSeek_ < time - 1) {
      this.lastCorrectiveSeek_ = time;
      this.videoWrapper_.setTime(targetTime);
      return;
    }
  }

  shaka.log.v1('Seek to ' + currentTime);
  this.onSeek_();
};


/**
 * Clamp seek times and playback start times so that we never seek to the
 * presentation duration.  Seeking to or starting at duration does not work
 * consistently across browsers.
 *
 * TODO: Clean up and simplify Playhead.  There are too many layers of, methods
 * for, and conditions on timestamp adjustment.
 *
 * @see https://github.com/google/shaka-player/issues/979
 * @param {number} time
 * @return {number} The adjusted seek time.
 * @private
 */
shaka.media.Playhead.prototype.clampSeekToDuration_ = function(time) {
  let timeline = this.manifest_.presentationTimeline;
  let duration = timeline.getDuration();
  if (time >= duration) {
    goog.asserts.assert(this.config_.durationBackoff >= 0,
                        'Duration backoff must be non-negative!');
    return duration - this.config_.durationBackoff;
  }
  return time;
};


/**
 * Computes a new playhead position that's within the presentation timeline.
 *
 * @param {number} currentTime
 * @return {number} The time to reposition the playhead to.
 * @private
 */
shaka.media.Playhead.prototype.reposition_ = function(currentTime) {
  goog.asserts.assert(this.manifest_ && this.config_, 'Must not be destroyed');

  /** @type {function(number)} */
  let isBuffered =
      shaka.media.TimeRangesUtils.isBuffered.bind(null, this.video_.buffered);

  let rebufferingGoal = shaka.util.StreamUtils.getRebufferingGoal(
      this.manifest_, this.config_, 1 /* scaleFactor */);

  let timeline = this.manifest_.presentationTimeline;
  let start = timeline.getSeekRangeStart();
  let end = timeline.getSeekRangeEnd();
  let duration = timeline.getDuration();

  const minRange = shaka.media.Playhead.MIN_SEEK_RANGE_;
  if (end - start < minRange) {
    start = end - minRange;
  }

  // With live content, the beginning of the availability window is moving
  // forward.  This means we cannot seek to it since we will "fall" outside the
  // window while we buffer.  So we define a "safe" region that is far enough
  // away.  For VOD, |safe == start|.
  let safe = timeline.getSafeSeekRangeStart(rebufferingGoal);

  // These are the times to seek to rather than the exact destinations.  When
  // we seek, we will get another event (after a slight delay) and these steps
  // will run again.  So if we seeked directly to |start|, |start| would move
  // on the next call and we would loop forever.
  //
  // Offset by 5 seconds since Chromecast takes a few seconds to start playing
  // after a seek, even when buffered.
  let seekStart = timeline.getSafeSeekRangeStart(5);
  let seekSafe = timeline.getSafeSeekRangeStart(rebufferingGoal + 5);


  if (currentTime >= duration) {
    shaka.log.v1('Playhead past duration.');
    return this.clampSeekToDuration_(currentTime);
  }

  if (currentTime > end) {
    shaka.log.v1('Playhead past end.');
    return end;
  }

  if (currentTime < start) {
    if (isBuffered(seekStart)) {
      shaka.log.v1('Playhead before start & start is buffered');
      return seekStart;
    } else {
      shaka.log.v1('Playhead before start & start is unbuffered');
      return seekSafe;
    }
  }

  if (currentTime >= safe || isBuffered(currentTime)) {
    shaka.log.v1('Playhead in safe region or in buffered region.');
    return currentTime;
  } else {
    shaka.log.v1('Playhead outside safe region & in unbuffered region.');
    return seekSafe;
  }
};


/**
 * Clamps the given time to the seek range.
 *
 * @param {number} time The time in seconds.
 * @return {number} The clamped time in seconds.
 * @private
 */
shaka.media.Playhead.prototype.clampTime_ = function(time) {
  let start = this.manifest_.presentationTimeline.getSeekRangeStart();
  if (time < start) return start;

  let end = this.manifest_.presentationTimeline.getSeekRangeEnd();
  if (time > end) return end;

  return time;
};
