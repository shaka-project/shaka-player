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

goog.provide('shaka.media.GapJumpingController');

goog.require('shaka.log');
goog.require('shaka.media.StallDetector');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * Creates a new GapJumpingController that handles jumping gaps that appear
 * within the content.  This will only jump gaps between two buffered ranges,
 * so we should not have to worry about the availability window.
 *
 * @param {!HTMLMediaElement} video
 * @param {!shaka.media.PresentationTimeline} timeline
 * @param {shaka.extern.StreamingConfiguration} config
 * @param {function(!Event)} onEvent Called when an event is raised to be sent
 *   to the application.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IReleasable}
 */
shaka.media.GapJumpingController = function(video, timeline, config, onEvent) {
  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {?shaka.media.PresentationTimeline} */
  this.timeline_ = timeline;

  /** @private {?shaka.extern.StreamingConfiguration} */
  this.config_ = config;

  /** @private {?function(!Event)} */
  this.onEvent_ = onEvent;

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {?shaka.util.Timer} */
  this.gapJumpTimer_ = null;

  /** @private {boolean} */
  this.seekingEventReceived_ = false;

  /** @private {number} */
  this.prevReadyState_ = video.readyState;

  /** @private {boolean} */
  this.didFireLargeGap_ = false;

  /**
   * Used to detect stalls and to "jump-start" playback when a stall is
   * detected. We will update it manually to avoid conflicts with gap-jumping.
   *
   * @private {shaka.media.StallDetector}
   */
  this.stallDetector_ = new shaka.media.StallDetector(
      new shaka.media.StallDetector.MediaElementImplementation(video),
      /* thresholdSeconds= */ 1.0);
  // When we see a stall, seek forward 1/10 of a second.
  this.stallDetector_.onStall((at, duration) => {
    shaka.log.debug('Stall detected at', at, 'for', duration, 'seconds.');
    shaka.log.debug('Seeking forward 0.1 seconds because of stall.');
    video.currentTime += 0.1;
  });

  /** @private {boolean} */
  this.hadSegmentAppended_ = false;


  let pollGap = this.onPollGapJump_.bind(this);
  this.eventManager_.listen(video, 'waiting', pollGap);

  // We can't trust readyState or 'waiting' events on all platforms.  So poll
  // the current time and if we are in a gap, jump it.
  // See: https://bit.ly/2McuXxm and https://bit.ly/2K5xmJO
  this.gapJumpTimer_ = new shaka.util.Timer(pollGap);
  this.gapJumpTimer_.start(/* seconds= */ 0.25, /* repeating= */ true);
};


/**
 * The limit, in seconds, for the gap size that we will assume the browser will
 * handle for us.
 * @const
 */
shaka.media.GapJumpingController.BROWSER_GAP_TOLERANCE = 0.001;


/** @override */
shaka.media.GapJumpingController.prototype.release = function() {
  if (this.eventManager_) {
    this.eventManager_.release();
    this.eventManager_ = null;
  }

  if (this.gapJumpTimer_ != null) {
    this.gapJumpTimer_.stop();
    this.gapJumpTimer_ = null;
  }

  this.onEvent_ = null;
  this.timeline_ = null;
  this.video_ = null;
};


/**
 * Called when a segment is appended by StreamingEngine, but not when a clear is
 * pending.  This means StreamingEngine will continue buffering forward from
 * what is buffered.  So we know about any gaps before the start.
 */
shaka.media.GapJumpingController.prototype.onSegmentAppended = function() {
  this.hadSegmentAppended_ = true;
  this.onPollGapJump_();
};


/** Called when a seek has started. */
shaka.media.GapJumpingController.prototype.onSeeking = function() {
  this.seekingEventReceived_ = true;
  this.hadSegmentAppended_ = false;
  this.didFireLargeGap_ = false;
};


/**
 * Called on a recurring timer to check for gaps in the media.  This is also
 * called in a 'waiting' event.
 *
 * @private
 */
shaka.media.GapJumpingController.prototype.onPollGapJump_ = function() {
  // Don't gap jump before the video is ready to play.
  if (this.video_.readyState == 0) return;
  // Do not gap jump if seeking has begun, but the seeking event has not
  // yet fired for this particular seek.
  if (this.video_.seeking) {
    if (!this.seekingEventReceived_) {
      return;
    }
  } else {
    this.seekingEventReceived_ = false;
  }
  // Don't gap jump while paused, so that you don't constantly jump ahead while
  // paused on a livestream.
  if (this.video_.paused) return;


  // When the ready state changes, we have moved on, so we should fire the large
  // gap event if we see one.
  if (this.video_.readyState != this.prevReadyState_) {
    this.didFireLargeGap_ = false;
    this.prevReadyState_ = this.video_.readyState;
  }

  const smallGapLimit = this.config_.smallGapLimit;
  let currentTime = this.video_.currentTime;
  let buffered = this.video_.buffered;

  let gapIndex = shaka.media.TimeRangesUtils.getGapIndex(buffered, currentTime);

  // The current time is unbuffered or is too far from a gap.
  if (gapIndex == null) {
    this.stallDetector_.poll();
    return;
  }
  // If we are before the first buffered range, this could be an unbuffered
  // seek.  So wait until a segment is appended so we are sure it is a gap.
  if (gapIndex == 0 && !this.hadSegmentAppended_) {
    return;
  }

  // StreamingEngine can buffer past the seek end, but still don't allow seeking
  // past it.
  let jumpTo = buffered.start(gapIndex);
  let seekEnd = this.timeline_.getSeekRangeEnd();
  if (jumpTo >= seekEnd) {
    return;
  }

  let jumpSize = jumpTo - currentTime;
  let isGapSmall = jumpSize <= smallGapLimit;
  let jumpLargeGap = false;

  // If we jump to exactly the gap start, we may detect a small gap due to
  // rounding errors or browser bugs.  We can ignore these extremely small gaps
  // since the browser should play through them for us.
  if (jumpSize < shaka.media.GapJumpingController.BROWSER_GAP_TOLERANCE) {
    return;
  }

  if (!isGapSmall && !this.didFireLargeGap_) {
    this.didFireLargeGap_ = true;

    // Event firing is synchronous.
    let event = new shaka.util.FakeEvent(
        'largegap', {'currentTime': currentTime, 'gapSize': jumpSize});
    event.cancelable = true;
    this.onEvent_(event);

    if (this.config_.jumpLargeGaps && !event.defaultPrevented) {
      jumpLargeGap = true;
    } else {
      shaka.log.info('Ignoring large gap at', currentTime, 'size', jumpSize);
    }
  }

  if (isGapSmall || jumpLargeGap) {
    if (gapIndex == 0) {
      shaka.log.info(
          'Jumping forward', jumpSize,
          'seconds because of gap before start time of', jumpTo);
    } else {
      shaka.log.info(
          'Jumping forward', jumpSize, 'seconds because of gap starting at',
          buffered.end(gapIndex - 1), 'and ending at', jumpTo);
    }

    this.video_.currentTime = jumpTo;
  }
};

