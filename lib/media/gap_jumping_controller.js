/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.GapJumpingController');
goog.provide('shaka.media.StallDetector');
goog.provide('shaka.media.StallDetector.Implementation');
goog.provide('shaka.media.StallDetector.MediaElementImplementation');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.PresentationTimeline');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * GapJumpingController handles jumping gaps that appear within the content.
 * This will only jump gaps between two buffered ranges, so we should not have
 * to worry about the availability window.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.media.GapJumpingController = class {
  /**
   * @param {!HTMLMediaElement} video
   * @param {!shaka.media.PresentationTimeline} timeline
   * @param {shaka.extern.StreamingConfiguration} config
   * @param {function(!Event)} onEvent
   *     Called when an event is raised to be sent to the application.
   */
  constructor(video, timeline, config, onEvent) {
    /** @private {?function(!Event)} */
    this.onEvent_ = onEvent;

    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {?shaka.media.PresentationTimeline} */
    this.timeline_ = timeline;

    /** @private {?shaka.extern.StreamingConfiguration} */
    this.config_ = config;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {boolean} */
    this.started_ = false;

    /** @private {boolean} */
    this.seekingEventReceived_ = false;

    /** @private {number} */
    this.startTime_ = 0;

    /** @private {boolean} */
    this.isJumpingGap_ = false;

    /** @private {number} */
    this.gapsJumped_ = 0;

    /** @private {number} */
    this.stallsDetected_ = 0;

    /**
     * The stall detector tries to keep the playhead moving forward. It is
     * managed by the gap-jumping controller to avoid conflicts. On some
     * platforms, the stall detector is not wanted, so it may be null.
     *
     * @private {shaka.media.StallDetector}
     */
    this.stallDetector_ = this.createStallDetector_();

    /** @private {boolean} */
    this.hadSegmentAppended_ = false;

    this.eventManager_.listen(video, 'waiting', () => this.onPollGapJump_());

    /**
     * We can't trust |readyState| or 'waiting' events on all platforms. To make
     * up for this, we poll the current time. If we think we are in a gap, jump
     * out of it.
     *
     * See: https://bit.ly/2McuXxm and https://bit.ly/2K5xmJO
     *
     * @private {?shaka.util.Timer}
     */
    this.gapJumpTimer_ = new shaka.util.Timer(() => {
      this.onPollGapJump_();
    }).tickEvery(this.config_.gapJumpTimerTime);
  }


  /** @override */
  release() {
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    if (this.gapJumpTimer_ != null) {
      this.gapJumpTimer_.stop();
      this.gapJumpTimer_ = null;
    }

    if (this.stallDetector_) {
      this.stallDetector_.release();
      this.stallDetector_ = null;
    }

    this.onEvent_ = null;
    this.timeline_ = null;
    this.video_ = null;
  }


  /**
   * Called when a segment is appended by StreamingEngine, but not when a clear
   * is pending. This means StreamingEngine will continue buffering forward from
   * what is buffered.  So we know about any gaps before the start.
   */
  onSegmentAppended() {
    this.hadSegmentAppended_ = true;
    if (this.gapJumpTimer_) {
      this.gapJumpTimer_.tickEvery(this.config_.gapJumpTimerTime);
    }
    this.onPollGapJump_();
  }

  /**
   * Called when playback has started and the video element is
   * listening for seeks.
   *
   * @param {number} startTime
   */
  onStarted(startTime) {
    if (this.video_.seeking && !this.seekingEventReceived_) {
      this.seekingEventReceived_ = true;
      this.startTime_ = startTime;
    }
    if (this.gapJumpTimer_) {
      this.gapJumpTimer_.tickEvery(this.config_.gapJumpTimerTime);
    }
    this.onPollGapJump_();
  }

  /** Called when a seek has started. */
  onSeeking() {
    this.seekingEventReceived_ = true;
    this.hadSegmentAppended_ = false;
    if (this.gapJumpTimer_) {
      this.gapJumpTimer_.tickEvery(this.config_.gapJumpTimerTime);
    }
    this.onPollGapJump_();
  }


  /**
   * Returns the total number of playback gaps jumped.
   * @return {number}
   */
  getGapsJumped() {
    return this.gapsJumped_;
  }


  /**
   * Returns the number of playback stalls detected.
   * @return {number}
   */
  getStallsDetected() {
    return this.stallsDetected_;
  }

  /**
   * Returns whether the player is currently jumping a gap.
   *
   * @return {boolean}
   */
  getIsJumpingGap() {
    return this.isJumpingGap_;
  }


  /**
   * Called on a recurring timer to check for gaps in the media.  This is also
   * called in a 'waiting' event.
   *
   * @private
   */
  onPollGapJump_() {
    // Don't gap jump before the video is ready to play.
    if (this.video_.readyState == 0) {
      return;
    }
    // Do not gap jump if seeking has begun, but the seeking event has not
    // yet fired for this particular seek.
    if (this.video_.seeking) {
      if (!this.seekingEventReceived_) {
        return;
      }
    } else {
      this.seekingEventReceived_ = false;
    }
    // Don't gap jump while paused, so that you don't constantly jump ahead
    // while paused on a livestream.  We make an exception for time 0, since we
    // may be _required_ to seek on startup before play can begin, but only if
    // autoplay is enabled.
    if (this.video_.paused && (this.video_.currentTime != this.startTime_ ||
      (!this.video_.autoplay && this.video_.currentTime == this.startTime_))) {
      return;
    }

    if (this.stallDetector_ && this.stallDetector_.poll()) {
      // Some action was taken by StallDetector, so don't do anything yet.
      return;
    }


    const currentTime = this.video_.currentTime;
    const buffered = this.video_.buffered;
    const gapDetectionThreshold = this.config_.gapDetectionThreshold;

    const gapIndex = shaka.media.TimeRangesUtils.getGapIndex(
        buffered, currentTime, gapDetectionThreshold);

    // The current time is unbuffered or is too far from a gap.
    if (gapIndex == null) {
      return;
    }

    // If we are before the first buffered range, this could be an unbuffered
    // seek.  So wait until a segment is appended so we are sure it is a gap.
    if (gapIndex == 0 && !this.hadSegmentAppended_) {
      return;
    }

    // StreamingEngine can buffer past the seek end, but still don't allow
    // seeking past it.
    let jumpTo = buffered.start(gapIndex);
    const gapPadding = this.config_.gapPadding;
    // Workaround for some platforms. On theses platforms video element
    // often rounds value we want to set as currentTime and we are not able
    // to jump over the gap.
    if (gapPadding) {
      jumpTo = Math.ceil((jumpTo + gapPadding) * 100) / 100;
    }
    const seekEnd = this.timeline_.getSeekRangeEnd();
    if (jumpTo >= seekEnd) {
      return;
    }

    const jumpSize = jumpTo - currentTime;

    // If we jump to exactly the gap start, we may detect a small gap due to
    // rounding errors or browser bugs.  We can ignore these extremely small
    // gaps since the browser should play through them for us.
    if (jumpSize < shaka.media.GapJumpingController.BROWSER_GAP_TOLERANCE) {
      return;
    }

    if (gapIndex == 0) {
      shaka.log.info(
          'Jumping forward', jumpSize,
          'seconds because of gap before start time of', jumpTo);
    } else {
      shaka.log.info(
          'Jumping forward', jumpSize, 'seconds because of gap starting at',
          buffered.end(gapIndex - 1), 'and ending at', jumpTo);
    }

    this.seek_(jumpTo);
    // This accounts for the possibility that we jump a gap at the start
    // position but we jump _into_ another gap. By setting the start
    // position to the new jumpTo we ensure that the check above will
    // pass even though the video is still paused.
    if (currentTime == this.startTime_) {
      this.startTime_ = jumpTo;
    }
    this.gapsJumped_++;
    this.onEvent_(
        new shaka.util.FakeEvent(shaka.util.FakeEvent.EventName.GapJumped));
  }

  /**
   * Seek to a specific time in the video.
   * @param {number} time The time to seek to, in seconds.
   * @private
   */
  seek_(time) {
    this.isJumpingGap_ = true;
    this.eventManager_.listenOnce(this.video_, 'seeked', () => {
      this.isJumpingGap_ = false;
    });
    this.video_.currentTime = time;
  }

  /**
   * Create and configure a stall detector using the player's streaming
   * configuration settings. If the player is configured to have no stall
   * detector, this will return |null|.
   * @return {shaka.media.StallDetector}
   * @private
   */
  createStallDetector_() {
    if (!this.config_.stallEnabled) {
      return null;
    }
    goog.asserts.assert(this.video_, 'Must have video');

    // Cache the values from the config so that changes to the config won't
    // change the initialized behaviour.
    const threshold = this.config_.stallThreshold;
    const skip = this.config_.stallSkip;

    const onStall = async (at, duration) => {
      goog.asserts.assert(this.video_, 'Must have video');
      const bufferedInfo =
          shaka.media.TimeRangesUtils.getBufferedInfo(this.video_.buffered);
      if (!bufferedInfo.length) {
        // Nothing in the buffer.
        return;
      }
      shaka.log.debug(`Stall detected at ${at} for ${duration} seconds.`);

      if (skip) {
        shaka.log.debug(`Seeking forward ${skip} seconds to break stall.`);
        this.video_.currentTime += skip;
      } else {
        shaka.log.debug(
            'Wait for play to avoid reject a possible other play call.');
        await this.video_.play();
        if (!this.video_) {
          return;
        }
        shaka.log.debug('Pausing and unpausing to break stall.');
        this.video_.pause();
        this.video_.play();
      }
      this.stallsDetected_++;
      this.onEvent_(new shaka.util.FakeEvent(
          shaka.util.FakeEvent.EventName.StallDetected));
    };

    // When we see a stall, we will try to "jump-start" playback by moving the
    // playhead forward.
    const detector = new shaka.media.StallDetector(
        new shaka.media.StallDetector.MediaElementImplementation(this.video_),
        threshold, onStall);

    return detector;
  }
};


/**
 * The limit, in seconds, for the gap size that we will assume the browser will
 * handle for us.
 * @const
 */
shaka.media.GapJumpingController.BROWSER_GAP_TOLERANCE = 0.001;


/**
 * Some platforms/browsers can get stuck in the middle of a buffered range (e.g.
 * when seeking in a background tab). Detect when we get stuck so that the
 * player can respond.
 *
 * @implements {shaka.util.IReleasable}
 * @final
 */
shaka.media.StallDetector = class {
  /**
   * @param {shaka.media.StallDetector.Implementation} implementation
   * @param {number} stallThresholdSeconds
   * @param {function(number, number)} onStall
   *     Callback that should be called when a stall is detected.
   */
  constructor(implementation, stallThresholdSeconds, onStall) {
    /** @private {shaka.media.StallDetector.Implementation} */
    this.implementation_ = implementation;
    /** @private {boolean} */
    this.wasMakingProgress_ = implementation.shouldBeMakingProgress();
    /** @private {number} */
    this.value_ = implementation.getPresentationSeconds();
    /** @private {number} */
    this.lastUpdateSeconds_ = implementation.getWallSeconds();
    /** @private {boolean} */
    this.didJump_ = false;

    /**
     * The amount of time in seconds that we must have the same value of
     * |value_| before we declare it as a stall.
     *
     * @private {number}
     */
    this.stallThresholdSeconds_ = stallThresholdSeconds;

    /** @private {?function(number, number)} */
    this.onStall_ = onStall;
  }

  /** @override */
  release() {
    // Drop external references to make things easier on the GC.
    if (this.implementation_) {
      this.implementation_.release();
    }
    this.implementation_ = null;
    this.onStall_ = null;
  }

  /**
   * Have the detector update itself and fire the "on stall" callback if a stall
   * was detected.
   *
   * @return {boolean} True if action was taken.
   */
  poll() {
    const impl = this.implementation_;

    const shouldBeMakingProgress = impl.shouldBeMakingProgress();
    const value = impl.getPresentationSeconds();
    const wallTimeSeconds = impl.getWallSeconds();

    const acceptUpdate = this.value_ != value ||
                         this.wasMakingProgress_ != shouldBeMakingProgress;

    if (acceptUpdate) {
      this.lastUpdateSeconds_ = wallTimeSeconds;
      this.value_ = value;
      this.wasMakingProgress_ = shouldBeMakingProgress;
      this.didJump_ = false;
    }

    const stallSeconds = wallTimeSeconds - this.lastUpdateSeconds_;

    const triggerCallback = stallSeconds >= this.stallThresholdSeconds_ &&
                            shouldBeMakingProgress && !this.didJump_;

    if (triggerCallback) {
      if (this.onStall_) {
        this.onStall_(this.value_, stallSeconds);
      }
      this.didJump_ = true;
      // If the onStall_ method updated the current time, update our stored
      // value so we don't think that was an update.
      this.value_ = impl.getPresentationSeconds();
    }

    return triggerCallback;
  }
};

/**
 * @interface
 */
shaka.media.StallDetector.Implementation = class {
  /**
   * Check if the presentation time should be changing. This will return |true|
   * when we expect the presentation time to change.
   *
   * @return {boolean}
   */
  shouldBeMakingProgress() {}

  /**
   * Get the presentation time in seconds.
   *
   * @return {number}
   */
  getPresentationSeconds() {}

  /**
   * Get the time wall time in seconds.
   *
   * @return {number}
   */
  getWallSeconds() {}

  /**
   * Releases object
   */
  release() {}
};


/**
 * Some platforms/browsers can get stuck in the middle of a buffered range (e.g.
 * when seeking in a background tab). Force a seek to help get it going again.
 *
 * @implements {shaka.media.StallDetector.Implementation}
 * @final
 */
shaka.media.StallDetector.MediaElementImplementation = class {
  /**
   * @param {!HTMLMediaElement} mediaElement
   */
  constructor(mediaElement) {
    /** @private {!HTMLMediaElement} */
    this.mediaElement_ = mediaElement;
    /**
     * For listeners scoped to the lifetime of the instance.
     * @private {shaka.util.EventManager}
     */
    this.audioEventManager_ = new shaka.util.EventManager();
    /**
     * Audio focus state
     * @private {boolean}
     */
    this.audioFocusPaused_ = false;
    // Audio Focus temporary leads to playback pause.
    this.audioEventManager_.listen(this.mediaElement_,
        'audiofocuspaused', () => {
          shaka.log.info(`Audio focus paused`);
          this.audioFocusPaused_ = true;
        });
    // Audio Focus is granted. App can play now.
    this.audioEventManager_.listen(this.mediaElement_,
        'audiofocusgranted', () => {
          shaka.log.info(`Audio focus granted`);
          this.audioFocusPaused_ = false;
        });
    // Audio focus is lost, app shouldn't play anymore.
    this.audioEventManager_.listen(this.mediaElement_,
        'audiofocuslost', () => {
          shaka.log.info(`Audio focus lost`);
          this.audioFocusPaused_ = true;
        });
  }

  /** @override */
  shouldBeMakingProgress() {
    // If we are not trying to play, the lack of change could be misidentified
    // as a stall.
    if (this.mediaElement_.paused) {
      return false;
    }
    if (this.mediaElement_.playbackRate == 0) {
      return false;
    }
    // If playback paused due to no audio focus, we ignore the stall.
    if (this.audioFocusPaused_) {
      return false;
    }
    // If we have don't have enough content, we are not stalled, we are
    // buffering.
    if (this.mediaElement_.buffered.length == 0) {
      return false;
    }

    return this.hasContentFor_(this.mediaElement_.buffered,
        /* timeInSeconds= */ this.mediaElement_.currentTime);
  }

  /** @override */
  getPresentationSeconds() {
    return this.mediaElement_.currentTime;
  }

  /** @override */
  getWallSeconds() {
    return Date.now() / 1000;
  }

  /**
   * Check if we have buffered enough content to play at |timeInSeconds|. Ignore
   * the end of the buffered range since it may not play any more on all
   * platforms.
   *
   * @param {!TimeRanges} buffered
   * @param {number} timeInSeconds
   * @return {boolean}
   * @private
   */
  hasContentFor_(buffered, timeInSeconds) {
    const TimeRangesUtils = shaka.media.TimeRangesUtils;
    for (const {start, end} of TimeRangesUtils.getBufferedInfo(buffered)) {
      // Can be as much as 100ms before the range
      if (timeInSeconds < start - 0.1) {
        continue;
      }
      // Must be at least 500ms inside the range
      if (timeInSeconds > end - 0.5) {
        continue;
      }

      return true;
    }

    return false;
  }

  /** @override */
  release() {
    if (this.audioEventManager_) {
      this.audioEventManager_.release();
    }
    this.audioEventManager_ = null;
  }
};

