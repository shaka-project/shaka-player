/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.MediaSourcePlayhead');
goog.provide('shaka.media.Playhead');
goog.provide('shaka.media.SrcEqualsPlayhead');

goog.require('goog.asserts');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.log');
goog.require('shaka.media.Capabilities');
goog.require('shaka.media.GapJumpingController');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.media.VideoWrapper');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.MediaReadyState');
goog.require('shaka.util.Timer');
goog.requireType('shaka.media.PresentationTimeline');


/**
 * Creates a Playhead, which manages the video's current time.
 *
 * The Playhead provides mechanisms for setting the presentation's start time,
 * restricting seeking to valid time ranges, and stopping playback for startup
 * and re-buffering.
 *
 * @extends {shaka.util.IReleasable}
 * @interface
 */
shaka.media.Playhead = class {
  /**
   * Called when the Player is ready to begin playback. Anything that depends
   * on setStartTime() should be done here, not in the constructor.
   *
   * @see https://github.com/shaka-project/shaka-player/issues/4244
   */
  ready() {}

  /**
   * Set the start time. If the content has already started playback, this will
   * be ignored.
   *
   * @param {number|Date} startTime
   */
  setStartTime(startTime) {}

  /**
   * Get the number of playback stalls detected by the StallDetector.
   *
   * @return {number}
   */
  getStallsDetected() {}

  /**
   * Get whether the playhead is currently jumping a gap.
   *
   * @return {boolean}
   */
  getIsJumpingGap() {}

  /**
   * Get the number of playback gaps jumped by the GapJumpingController.
   *
   * @return {number}
   */
  getGapsJumped() {}

  /**
   * Get the current playhead position. The position will be restricted to valid
   * time ranges.
   *
   * @return {number}
   */
  getTime() {}

  /**
   * Notify the playhead that the buffered ranges have changed.
   */
  notifyOfBufferingChange() {}

  /**
   * Check if the player has buffered enough content to make it to the end of
   * the presentation.
   * @return {boolean}
   */
  isBufferedToEnd() {}
};


/**
 * A playhead implementation that only relies on the media element.
 *
 * @implements {shaka.media.Playhead}
 * @final
 */
shaka.media.SrcEqualsPlayhead = class {
  /**
   * @param {!HTMLMediaElement} mediaElement
   */
  constructor(mediaElement) {
    /** @private {HTMLMediaElement} */
    this.mediaElement_ = mediaElement;
    /** @private {boolean} */
    this.started_ = false;
    /** @private {?number|Date} */
    this.startTime_ = null;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();
  }

  /** @override */
  ready() {
    goog.asserts.assert(
        this.mediaElement_ != null,
        'Playhead should not be released before calling ready()',
    );

    // We listen for the canplay event so that we know when we can
    // interact with |currentTime|.
    // We were using loadeddata before, but if we set time on that event,
    // browser may adjust it on its own during live playback.
    const onCanPlay = () => {
      if (this.startTime_ == null ||
          (this.startTime_ == 0 && this.mediaElement_.duration != Infinity)) {
        this.started_ = true;
      } else {
        const currentTime = this.mediaElement_.currentTime;
        let newTime = null;
        if (typeof this.startTime_ === 'number') {
          newTime = this.startTime_;
        } else if (this.startTime_ instanceof Date) {
          const programStartTime = this.getProgramStartTime_();
          if (programStartTime !== null) {
            newTime = (this.startTime_.getTime() / 1000.0) - programStartTime;
            newTime = this.clampTime_(newTime);
          }
        }

        if (newTime == null) {
          this.started_ = true;
          return;
        }

        // Using the currentTime allows using a negative number in Live HLS
        if (newTime < 0) {
          newTime = Math.max(0, currentTime + newTime);
        }
        if (currentTime != newTime) {
          // Startup is complete only when the video element acknowledges the
          // seek.
          this.eventManager_.listenOnce(this.mediaElement_, 'seeking', () => {
            this.started_ = true;
          });
          this.mediaElement_.currentTime = newTime;
        } else {
          this.started_ = true;
        }
      }
    };

    shaka.util.MediaReadyState.waitForReadyState(this.mediaElement_,
        HTMLMediaElement.HAVE_FUTURE_DATA,
        this.eventManager_, () => {
          onCanPlay();
        });
  }

  /** @override */
  release() {
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    this.mediaElement_ = null;
  }

  /** @override */
  setStartTime(startTime) {
    // If we have already started playback, ignore updates to the start time.
    // This is just to make things consistent.
    this.startTime_ = this.started_ ? this.startTime_ : startTime;
  }

  /** @override */
  getTime() {
    // If we have not started playback yet, return the start time. However once
    // we start playback we assume that we can always return the current time.
    let time = this.started_ ?
                 this.mediaElement_.currentTime :
                 this.startTime_;
    if (time instanceof Date) {
      time = (time.getTime() / 1000.0) - (this.getProgramStartTime_() || 0);
      time = this.clampTime_(time);
    }

    // In the case that we have not started playback, but the start time was
    // never set, we don't know what the start time should be. To ensure we
    // always return a number, we will default back to 0.
    return time || 0;
  }

  /** @override */
  getStallsDetected() {
    return 0;
  }

  /** @override */
  getGapsJumped() {
    return 0;
  }

  /** @override */
  getIsJumpingGap() {
    return false;
  }

  /** @override */
  notifyOfBufferingChange() {}

  /** @override */
  isBufferedToEnd() {
    goog.asserts.assert(
        this.mediaElement_,
        'We need a video element to get buffering information');

    // If we have buffered to the duration of the content, it means we will have
    // enough content to buffer to the end of the presentation.
    const bufferEnd =
        shaka.media.TimeRangesUtils.bufferEnd(this.mediaElement_.buffered);

    // Because Safari's native HLS reports slightly inaccurate values for
    // bufferEnd here, we use a fudge factor.  Without this, we can end up in a
    // buffering state at the end of the stream.  See issue #2117.
    const fudge = 1;  // 1000 ms
    return bufferEnd != null &&
        bufferEnd >= this.mediaElement_.duration - fudge;
  }

  /**
   * @return {?number} program start time in seconds.
   * @private
   */
  getProgramStartTime_() {
    if (this.mediaElement_.getStartDate) {
      const startDate = this.mediaElement_.getStartDate();
      const startTime = startDate.getTime();
      if (!isNaN(startTime)) {
        return startTime / 1000.0;
      }
    }
    return null;
  }


  /**
   * @param {number} time
   * @return {number}
   * @private
   */
  clampTime_(time) {
    const seekable = this.mediaElement_.seekable;
    if (seekable.length > 0) {
      time = Math.max(seekable.start(0), time);
      time = Math.min(seekable.end(seekable.length - 1), time);
    }
    return time;
  }
};


/**
 * A playhead implementation that relies on the media element and a manifest.
 * When provided with a manifest, we can provide more accurate control than
 * the SrcEqualsPlayhead.
 *
 * TODO: Clean up and simplify Playhead.  There are too many layers of, methods
 *       for, and conditions on timestamp adjustment.
 *
 * @implements {shaka.media.Playhead}
 * @final
 */
shaka.media.MediaSourcePlayhead = class {
  /**
   * @param {!HTMLMediaElement} mediaElement
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.extern.StreamingConfiguration} config
   * @param {?number|Date} startTime
   *     The playhead's initial position in seconds. If null, defaults to the
   *     start of the presentation for VOD and the live-edge for live.
   * @param {function()} onSeek
   *     Called when the user agent seeks to a time within the presentation
   *     timeline.
   * @param {function(!Event)} onEvent
   *     Called when an event is raised to be sent to the application.
   */
  constructor(mediaElement, manifest, config, startTime, onSeek, onEvent) {
    /**
     * The seek range must be at least this number of seconds long. If it is
     * smaller than this, change it to be this big so we don't repeatedly seek
     * to keep within a zero-width window.
     *
     * This is 3s long, to account for the weaker hardware on platforms like
     * Chromecast.
     *
     * @private {number}
     */
    this.minSeekRange_ = 3.0;

    /** @private {HTMLMediaElement} */
    this.mediaElement_ = mediaElement;

    /** @private {shaka.media.PresentationTimeline} */
    this.timeline_ = manifest.presentationTimeline;

    /** @private {?shaka.extern.StreamingConfiguration} */
    this.config_ = config;

    /** @private {function()} */
    this.onSeek_ = onSeek;

    /** @private {?number} */
    this.lastCorrectiveSeek_ = null;

    /** @private {shaka.media.GapJumpingController} */
    this.gapController_ = new shaka.media.GapJumpingController(
        mediaElement,
        manifest.presentationTimeline,
        config,
        onEvent);

    /** @private {shaka.media.VideoWrapper} */
    this.videoWrapper_ = new shaka.media.VideoWrapper(
        mediaElement,
        () => this.onSeeking_(),
        (realStartTime) => this.onStarted_(realStartTime),
        () => this.getStartTime_(startTime));

    /** @type {shaka.util.Timer} */
    this.checkWindowTimer_ = new shaka.util.Timer(() => {
      this.onPollWindow_();
    });
  }

  /** @override */
  ready() {
    this.checkWindowTimer_.tickEvery(/* seconds= */ 0.25);
  }

  /** @override */
  release() {
    if (this.videoWrapper_) {
      this.videoWrapper_.release();
      this.videoWrapper_ = null;
    }

    if (this.gapController_) {
      this.gapController_.release();
      this.gapController_= null;
    }

    if (this.checkWindowTimer_) {
      this.checkWindowTimer_.stop();
      this.checkWindowTimer_ = null;
    }

    this.config_ = null;
    this.timeline_ = null;
    this.videoWrapper_ = null;
    this.mediaElement_ = null;

    this.onSeek_ = () => {};
  }

  /** @override */
  setStartTime(startTime) {
    this.videoWrapper_.setTime(this.getStartTime_(startTime));
  }

  /** @override */
  getTime() {
    const time = this.videoWrapper_.getTime();

    // Although we restrict the video's currentTime elsewhere, clamp it here to
    // ensure timing issues don't cause us to return a time outside the segment
    // availability window.  E.g., the user agent seeks and calls this function
    // before we receive the 'seeking' event.
    //
    // We don't buffer when the livestream video is paused and the playhead time
    // is out of the seek range; thus, we do not clamp the current time when the
    // video is paused.
    // https://github.com/shaka-project/shaka-player/issues/1121
    if (this.mediaElement_.readyState > 0 && !this.mediaElement_.paused) {
      return this.clampTime_(time);
    }

    return time;
  }

  /** @override */
  getStallsDetected() {
    return this.gapController_.getStallsDetected();
  }

  /** @override */
  getGapsJumped() {
    return this.gapController_.getGapsJumped();
  }

  /** @override */
  getIsJumpingGap() {
    return this.gapController_.getIsJumpingGap();
  }

  /**
   * Gets the playhead's initial position in seconds.
   *
   * @param {?number|Date} startTime
   * @return {number}
   * @private
   */
  getStartTime_(startTime) {
    if (startTime == null) {
      if (this.timeline_.getDuration() < Infinity) {
        // If the presentation is VOD, or if the presentation is live but has
        // finished broadcasting, then start from the beginning.
        startTime = this.timeline_.getSeekRangeStart();
      } else {
        // Otherwise, start near the live-edge.
        startTime = this.timeline_.getSeekRangeEnd();
      }
    } else if (startTime instanceof Date) {
      const presentationStartTime =
          this.timeline_.getInitialProgramDateTime() ||
          this.timeline_.getPresentationStartTime();
      goog.asserts.assert(presentationStartTime != null,
          'Presentation start time should not be null!');
      startTime = (startTime.getTime() / 1000.0) - presentationStartTime;
    } else if (startTime < 0) {
      // For live streams, if the startTime is negative, start from a certain
      // offset time from the live edge.  If the offset from the live edge is
      // not available, start from the current available segment start point
      // instead, handled by clampTime_().
      startTime = this.timeline_.getSeekRangeEnd() + startTime;
    }

    return this.clampSeekToDuration_(
        this.clampTime_(/** @type {number} */(startTime)));
  }

  /** @override */
  notifyOfBufferingChange() {
    this.gapController_.onSegmentAppended();
  }

  /** @override */
  isBufferedToEnd() {
    goog.asserts.assert(
        this.mediaElement_,
        'We need a video element to get buffering information');
    goog.asserts.assert(
        this.timeline_,
        'We need a timeline to get buffering information');

    // Live streams are "buffered to the end" when they have buffered to the
    // live edge or beyond (into the region covered by the presentation delay).
    if (this.timeline_.isLive()) {
      const liveEdge = this.timeline_.getSegmentAvailabilityEnd();
      const bufferEnd =
          shaka.media.TimeRangesUtils.bufferEnd(this.mediaElement_.buffered);

      if (bufferEnd != null && bufferEnd >= liveEdge) {
        return true;
      }
    }

    return false;
  }

  /**
   * Called on a recurring timer to keep the playhead from falling outside the
   * availability window.
   *
   * @private
   */
  onPollWindow_() {
    // Don't catch up to the seek range when we are paused or empty.
    // The definition of "seeking" says that we are seeking until the buffered
    // data intersects with the playhead.  If we fall outside of the seek range,
    // it doesn't matter if we are in a "seeking" state.  We can and should go
    // ahead and catch up while seeking.
    if (this.mediaElement_.readyState == 0 || this.mediaElement_.paused) {
      return;
    }

    const currentTime = this.videoWrapper_.getTime();
    let seekStart = this.timeline_.getSeekRangeStart();
    const seekEnd = this.timeline_.getSeekRangeEnd();

    if (seekEnd - seekStart < this.minSeekRange_) {
      seekStart = seekEnd - this.minSeekRange_;
    }

    if (currentTime < seekStart) {
      // The seek range has moved past the playhead.  Move ahead to catch up.
      const targetTime = this.reposition_(currentTime);
      shaka.log.info('Jumping forward ' + (targetTime - currentTime) +
                     ' seconds to catch up with the seek range.');
      this.mediaElement_.currentTime = targetTime;
    }
  }

  /**
   * Called when the video element has started up and is listening for new seeks
   *
   * @param {number} startTime
   * @private
   */
  onStarted_(startTime) {
    this.gapController_.onStarted(startTime);
  }

  /**
   * Handles when a seek happens on the video.
   *
   * @private
   */
  onSeeking_() {
    this.gapController_.onSeeking();
    const currentTime = this.videoWrapper_.getTime();
    const targetTime = this.reposition_(currentTime);

    const gapLimit = shaka.media.GapJumpingController.BROWSER_GAP_TOLERANCE;

    // We don't need to perform corrective seeks for the playhead range when
    // MediaSource's setLiveSeekableRange() can handle it for us.
    const mightNeedCorrectiveSeek =
        !shaka.media.Capabilities.isInfiniteLiveStreamDurationSupported();

    if (mightNeedCorrectiveSeek &&
        Math.abs(targetTime - currentTime) > gapLimit) {
      let canCorrectiveSeek = false;
      const seekDelay = shaka.device.DeviceFactory.getDevice().seekDelay();
      if (seekDelay) {
        // You can only seek like this every so often. This is to prevent an
        // infinite loop on systems where changing currentTime takes a
        // significant amount of time (e.g. Chromecast).
        const time = Date.now() / 1000;
        if (!this.lastCorrectiveSeek_ ||
            this.lastCorrectiveSeek_ < time - seekDelay) {
          this.lastCorrectiveSeek_ = time;
          canCorrectiveSeek = true;
        }
      } else {
        canCorrectiveSeek = true;
      }
      if (canCorrectiveSeek) {
        this.videoWrapper_.setTime(targetTime);
        return;
      }
    }

    shaka.log.v1('Seek to ' + currentTime);
    this.onSeek_();
  }

  /**
   * Clamp seek times and playback start times so that we never seek to the
   * presentation duration.  Seeking to or starting at duration does not work
   * consistently across browsers.
   *
   * @see https://github.com/shaka-project/shaka-player/issues/979
   * @param {number} time
   * @return {number} The adjusted seek time.
   * @private
   */
  clampSeekToDuration_(time) {
    const duration = this.timeline_.getDuration();
    if (time >= duration) {
      goog.asserts.assert(this.config_.durationBackoff >= 0,
          'Duration backoff must be non-negative!');
      return duration - this.config_.durationBackoff;
    }
    return time;
  }

  /**
   * Computes a new playhead position that's within the presentation timeline.
   *
   * @param {number} currentTime
   * @return {number} The time to reposition the playhead to.
   * @private
   */
  reposition_(currentTime) {
    goog.asserts.assert(
        this.config_,
        'Cannot reposition playhead when it has been destroyed');

    /** @type {function(number)} */
    const isBuffered = (playheadTime) => shaka.media.TimeRangesUtils.isBuffered(
        this.mediaElement_.buffered, playheadTime);

    const rebufferingGoal = this.config_.rebufferingGoal;
    const safeSeekOffset = this.config_.safeSeekOffset;

    let start = this.timeline_.getSeekRangeStart();
    const end = this.timeline_.getSeekRangeEnd();
    const duration = this.timeline_.getDuration();

    if (end - start < this.minSeekRange_) {
      start = end - this.minSeekRange_;
    }

    // With live content, the beginning of the availability window is moving
    // forward.  This means we cannot seek to it since we will "fall" outside
    // the window while we buffer.  So we define a "safe" region that is far
    // enough away.  For VOD, |safe == start|.
    const safe = this.timeline_.getSafeSeekRangeStart(rebufferingGoal);

    // These are the times to seek to rather than the exact destinations.  When
    // we seek, we will get another event (after a slight delay) and these steps
    // will run again.  So if we seeked directly to |start|, |start| would move
    // on the next call and we would loop forever.
    const seekStart = this.timeline_.getSafeSeekRangeStart(safeSeekOffset);
    const seekSafe = this.timeline_.getSafeSeekRangeStart(
        rebufferingGoal + safeSeekOffset);

    if (currentTime >= duration) {
      shaka.log.v1('Playhead past duration.');
      return this.clampSeekToDuration_(currentTime);
    }

    if (currentTime > end) {
      shaka.log.v1('Playhead past end.');
      // We remove the safeSeekEndOffset of the seek end to avoid the player
      // to be block at the edge in a live stream
      return end - this.config_.safeSeekEndOffset;
    }

    if (currentTime < start) {
      if (this.timeline_.isLive() &&
          this.config_.returnToEndOfLiveWindowWhenOutside) {
        return end - this.config_.safeSeekEndOffset;
      }
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
  }

  /**
   * Clamps the given time to the seek range.
   *
   * @param {number} time The time in seconds.
   * @return {number} The clamped time in seconds.
   * @private
   */
  clampTime_(time) {
    const start = this.timeline_.getSeekRangeStart();
    if (time < start) {
      return start;
    }

    const end = this.timeline_.getSeekRangeEnd();
    if (time > end) {
      return end;
    }

    return time;
  }
};
