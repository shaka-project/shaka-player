/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.SeekBasedTrickPlayController');

goog.require('shaka.log');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * A controller that performs trick-play (fast-forward / rewind) using repeated
 * seek operations instead of manipulating playback rate.  This approach is
 * universally supported because every platform supports seeking, whereas many
 * smart-TV platforms (WebOS, Tizen) do not reliably support playback rates
 * other than 1.
 *
 * The media element is kept paused during trick-play so that no buffer is
 * consumed.
 *
 * <h3>Cadence-timer model</h3>
 * A periodic timer fires at a rate-dependent interval (faster speeds → shorter
 * intervals).  Each tick computes a wall-clock target position:
 * {@code startPosition + rate × (now − startWallTime)}
 *
 * The controller then sets {@code video.currentTime} to that target.  If the
 * target is buffered, the browser decodes and renders the I-frame almost
 * instantly (~20 ms).  If the target is not buffered, the seek bar still
 * advances and the browser holds the last rendered frame — the streaming
 * engine continues downloading in the background without interruption.
 *
 * The streaming engine is resynced (via {@code seekTo()}) only when the
 * wall-clock target drifts far from the buffer ({@link SE_RESYNC_GAP_SEC_})
 * or on direction change.  This gives the SE long uninterrupted download
 * windows — critical for high-latency networks.
 *
 * <h3>VTP-inspired enhancements</h3>
 * The following techniques are ported from ExoPlayer's Virtual Trick Play
 * (VTP) system:
 * <ul>
 *   <li>Adaptive target frame rate that varies with speed and direction.</li>
 *   <li>Seek-interval throttling: if no frame renders within 8× the
 *       target interval, the cadence is slowed down to avoid futile seeks
 *       on slow networks.</li>
 *   <li>Overshoot correction: a circular buffer stores the last
 *       {@link LAST_N_MAX_} rendered positions.  On exit the player can
 *       seek back to the position that was actually displayed, avoiding a
 *       visual jump.</li>
 *   <li>Scrub mode: frame-by-frame seeking driven by external position
 *       updates (e.g. seek-bar drag) with render-pending gating.</li>
 * </ul>
 *
 * @implements {shaka.util.IReleasable}
 * @final
 */
shaka.media.SeekBasedTrickPlayController = class {
  /**
   * @param {shaka.media.SeekBasedTrickPlayController.Harness} harness
   */
  constructor(harness) {
    /** @private {?shaka.media.SeekBasedTrickPlayController.Harness} */
    this.harness_ = harness;

    /** @private {number} */
    this.rate_ = 0;

    /** @private {boolean} */
    this.isActive_ = false;

    /**
     * True while a seek has been issued and the browser has not yet fired
     * the {@code seeked} event.  Ported from ExoPlayer VTP's
     * {@code ScrubTrickPlay.renderPending}.  When true, new seeks are
     * suppressed unless forced by the throttle timeout.
     * @private {boolean}
     */
    this.renderPending_ = false;

    /**
     * Wall-clock timestamp (ms) when the last seek was issued (i.e. when
     * {@code video.currentTime} was last set).  Used by the force-seek
     * timeout to determine if enough time has elapsed to override the
     * render-pending gate.
     * @private {number}
     */
    this.lastSeekIssuedWall_ = 0;

    /**
     * Wall-clock timestamp (ms) recorded when the current rate/direction
     * session started.  Together with {@link startPosition_} it anchors the
     * linear position computation.
     * @private {number}
     */
    this.startWallTime_ = 0;

    /**
     * Media position (seconds) at the moment the current rate/direction
     * session started.
     * @private {number}
     */
    this.startPosition_ = 0;

    /**
     * Cadence timer that drives the seek loop.  Fires at a rate-dependent
     * interval computed by {@link computeTickInterval_}.
     * @private {shaka.util.Timer}
     */
    this.cadenceTimer_ = new shaka.util.Timer(() => this.seekStep_());

    /**
     * Wall-clock timestamp (ms) of the last {@code seekTo} notification sent
     * to the streaming engine.  Used to debounce SE notifications so that
     * in-flight segment downloads are not aborted too frequently.
     * @private {number}
     */
    this.lastSeekToWallTime_ = 0;

    /**
     * Media position (seconds) of the last I-frame that was actually
     * rendered (i.e. seeked to a buffered position).  Used by
     * {@link findNewFrame_} to detect when the SE has downloaded a new
     * segment that extends beyond the currently displayed frame.
     * @private {number}
     */
    this.lastRenderedTime_ = 0;

    // ── VTP enhancements ──

    /**
     * Wall-clock timestamp (ms) of the last successful frame render (i.e.
     * the last time we seeked to a buffered position).  Used by the
     * throttling logic to detect render stalls.
     * @private {number}
     */
    this.lastRenderWallTime_ = 0;

    /**
     * Whether the seek cadence is currently throttled because frames have
     * not been rendering in time.
     * @private {boolean}
     */
    this.isThrottled_ = false;

    /**
     * Circular buffer that stores the media positions (seconds) of the
     * most recently rendered frames.  Used for overshoot correction when
     * trick play is cancelled — the player seeks back to one of these
     * positions instead of staying at the current (possibly far-ahead)
     * video.currentTime.
     *
     * Ported from ExoPlayer's {@code LastNPositions} inner class.
     *
     * @private {!Array<number>}
     */
    this.lastNPositions_ = [];

    /**
     * Write index for the circular {@link lastNPositions_} buffer.
     * @private {number}
     */
    this.lastNWriteIdx_ = 0;

    /**
     * Number of valid entries in the circular {@link lastNPositions_}
     * buffer (may be less than capacity before the first wrap-around).
     * @private {number}
     */
    this.lastNCount_ = 0;

    // ── Scrub mode state ──

    /**
     * True when the controller is in scrub mode (frame-by-frame seeking
     * driven by external position updates).
     * @private {boolean}
     */
    this.isScrubbing_ = false;

    /**
     * True while a scrub seek is pending — the previous seek has not yet
     * rendered a frame.  A new {@link scrubSeek} call will be suppressed
     * until this clears.
     * @private {boolean}
     */
    this.scrubRenderPending_ = false;

    /**
     * Media position (seconds) of the last accepted scrub seek.  Used to
     * gate out small movements that would not produce a new I-frame.
     * @private {number}
     */
    this.lastScrubPosition_ = 0;

    // ── requestVideoFrameCallback integration ──

    /**
     * True when the controller is using requestVideoFrameCallback (via the
     * harness {@code watchFrames} method) for accurate frame-render tracking.
     * When false, the controller falls back to the {@code isBuffered()}
     * approximation.
     * @private {boolean}
     */
    this.useFrameCallback_ = false;

    /**
     * Teardown function returned by {@code harness.watchFrames()}.  Calling
     * it stops the requestVideoFrameCallback loop.
     * @private {?function()}
     */
    this.stopFrameWatcherFn_ = null;

    /**
     * Set by {@link notifyNewSegment} and consumed by {@link seekStep_}.
     * When true, seekStep_ knows that it was invoked immediately after a
     * segment was appended — the streaming engine has no in-flight
     * download at this point, making it safe to call {@code seekTo()}
     * (which triggers {@code SE.seeked()}) without aborting work.
     * @private {boolean}
     */
    this.postAppend_ = false;
  }

  /** @override */
  release() {
    if (this.isActive_) {
      this.stop();
    }
    if (this.isScrubbing_) {
      this.stopScrub();
    }
    this.stopFrameWatcher_();
    if (this.cadenceTimer_) {
      this.cadenceTimer_.stop();
      this.cadenceTimer_ = null;
    }
    this.lastNPositions_ = [];
    this.lastNCount_ = 0;
    this.lastNWriteIdx_ = 0;
    this.harness_ = null;
  }

  /**
   * Start seek-based trick play at the given rate.
   *
   * Positive rates move forward, negative rates move backward.  The magnitude
   * determines how many seconds the playhead advances per real second (e.g.
   * rate=4 → 4 seconds of content per real second).
   *
   * If already active this is equivalent to calling {@link changeRate}.
   *
   * @param {number} rate  Must not be 0.
   */
  start(rate) {
    if (rate === 0) {
      shaka.log.alwaysWarn(
          'SeekBasedTrickPlayController: rate 0 is not supported.');
      return;
    }

    this.rate_ = rate;

    if (this.isActive_) {
      // Already running — just update the rate.
      this.changeRate(rate);
      return;
    }

    this.isActive_ = true;
    this.isThrottled_ = false;
    this.renderPending_ = false;
    this.lastSeekIssuedWall_ = 0;
    this.resetLastNPositions_();
    this.anchorPosition_();
    this.lastRenderedTime_ = this.harness_.getPresentationTime();
    this.lastRenderWallTime_ = Date.now();

    // Notify the streaming engine once so it starts fetching I-frames from
    // the current position in the correct direction.
    const pos = this.harness_.getPresentationTime();
    this.harness_.seekTo(pos);
    this.lastSeekToWallTime_ = Date.now();

    // Start frame-render tracking via requestVideoFrameCallback if
    // available.  This provides more accurate render timestamps for
    // throttling and overshoot correction.
    this.startFrameWatcher_();

    // Issue the first seek immediately.
    this.seekStep_();
  }

  /**
   * Change the trick-play rate while active.  Has no effect if not active.
   *
   * @param {number} rate
   */
  changeRate(rate) {
    if (rate === 0) {
      shaka.log.alwaysWarn(
          'SeekBasedTrickPlayController: rate 0 is not supported.');
      return;
    }
    const directionChanged = (this.rate_ > 0) !== (rate > 0);
    this.rate_ = rate;

    // Re-anchor so the position computation stays correct after rate change.
    this.anchorPosition_();
    // Reset throttle and render-pending on rate change.
    this.isThrottled_ = false;
    this.renderPending_ = false;

    if (directionChanged && this.isActive_) {
      // Notify SE on direction change so it starts fetching in the new
      // direction from the current position.
      const pos = this.harness_.getPresentationTime();
      this.lastRenderedTime_ = pos;
      this.lastRenderWallTime_ = Date.now();
      this.resetLastNPositions_();
      this.harness_.seekTo(pos);
      this.lastSeekToWallTime_ = Date.now();
    }
  }

  /**
   * Stop seek-based trick play.
   */
  stop() {
    if (!this.isActive_) {
      return;
    }
    this.isActive_ = false;
    this.rate_ = 0;
    this.isThrottled_ = false;
    this.renderPending_ = false;
    this.stopFrameWatcher_();
    if (this.cadenceTimer_) {
      this.cadenceTimer_.stop();
    }
  }

  /**
   * @return {boolean} Whether seek-based trick play is currently active.
   */
  isActive() {
    return this.isActive_;
  }

  /**
   * @return {number} The current trick play rate, or 0 if inactive.
   */
  getRate() {
    return this.rate_;
  }

  /**
   * Return the current trick-play direction.
   *
   * @return {shaka.media.SeekBasedTrickPlayController.Direction}
   */
  getDirection() {
    if (this.isScrubbing_) {
      return shaka.media.SeekBasedTrickPlayController.Direction.SCRUB;
    }
    if (!this.isActive_) {
      return shaka.media.SeekBasedTrickPlayController.Direction.NONE;
    }
    return this.rate_ > 0 ?
        shaka.media.SeekBasedTrickPlayController.Direction.FORWARD :
        shaka.media.SeekBasedTrickPlayController.Direction.REVERSE;
  }

  /**
   * Called by the Player when the video element fires the {@code seeked}
   * event.  Clears the render-pending gate and — only when the position
   * is actually buffered — records it as a rendered frame for overshoot
   * correction and {@link findNewFrame_} tracking.
   *
   * The browser fires {@code seeked} even for seeks to unbuffered
   * positions (the video element just holds the last decoded frame).
   * Unconditionally advancing {@code lastRenderedTime_} on those events
   * caused it to race ahead of the I-frame buffer, making
   * {@link findNewFrame_} unable to detect newly-downloaded segments
   * ({@code bufferEnd > lastRenderedTime_ + THRESHOLD} was always false).
   *
   * ExoPlayer's equivalent ({@code trickFrameRendered}) only fires when
   * an I-frame is queued to the decoder ({@code isKeyFrame()} guard in
   * {@code onQueueInputBuffer}), so unbuffered seeks never signal a
   * render.  The {@code isBuffered} check here is the Shaka equivalent.
   */
  onSeekComplete() {
    if (!this.isActive_ && !this.isScrubbing_) {
      return;
    }

    this.renderPending_ = false;

    const pos = this.harness_ ? this.harness_.getPresentationTime() : 0;

    // Only update render-tracking state when the position is buffered,
    // meaning the browser actually decoded and displayed a new frame.
    // Seeks to unbuffered positions fire 'seeked' too but the browser
    // just holds the last frame — advancing lastRenderedTime_ here would
    // push it past the buffer frontier and starve findNewFrame_().
    const realRender = this.harness_ && this.harness_.isBuffered(pos);
    if (realRender) {
      this.lastRenderedTime_ = pos;
      this.lastRenderWallTime_ = Date.now();
      this.pushLastNPosition_(pos);
      this.isThrottled_ = false;

      if (this.harness_.onTrickFrameRendered) {
        this.harness_.onTrickFrameRendered(pos);
      }
    }

    if (this.isScrubbing_) {
      this.scrubRenderPending_ = false;
      return;
    }

    // Immediately schedule the next seek step when a real frame was
    // rendered — this minimises inter-frame latency when the browser
    // resolves seeks quickly (i.e. buffered content).  For unbuffered
    // seeks, let the cadence timer handle pacing to avoid a rapid
    // no-render loop.
    if (realRender && this.isActive_ && this.cadenceTimer_) {
      this.cadenceTimer_.stop();
      this.seekStep_();
    }
  }

  /**
   * Notify the controller that a new I-frame segment has been appended to
   * the buffer.  This provides zero-delay frame detection: instead of
   * waiting for the next cadence-timer tick to poll the buffer, the
   * controller immediately checks for a renderable frame and displays it.
   *
   * Called from the Player's {@code onSegmentAppended} callback during
   * trick play (video content type only).
   */
  notifyNewSegment() {
    if (!this.isActive_ || !this.harness_) {
      return;
    }

    // Flag that this seekStep_ invocation happens right after a segment
    // append.  The SE has no in-flight download at this point, so it is
    // safe to redirect it via seekTo() without aborting work.
    this.postAppend_ = true;

    // Cancel the pending cadence tick — seekStep_ will reschedule.
    this.cadenceTimer_.stop();
    this.seekStep_();
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Scrub mode (VTP-inspired frame-by-frame seeking)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Enter scrub mode.  The media element should already be paused and the
   * I-frame track activated by the Player before calling this.
   */
  startScrub() {
    this.isScrubbing_ = true;
    this.scrubRenderPending_ = false;
    this.lastScrubPosition_ = this.harness_ ?
        this.harness_.getPresentationTime() : 0;
    this.resetLastNPositions_();
    this.lastRenderWallTime_ = Date.now();
    this.startFrameWatcher_();
  }

  /**
   * Seek to {@code positionSec} in scrub mode.  If the position is too
   * close to the previous scrub position (less than
   * {@link SCRUB_THRESHOLD_SEC_}) the request is ignored.  If a previous
   * scrub seek is still pending (frame not yet rendered) the request is
   * also ignored unless {@code force} is true.
   *
   * @param {number} positionSec  Target position in seconds.
   * @param {boolean=} force  If true, skip the render-pending gate.
   * @return {boolean}  True if the seek was issued.
   */
  scrubSeek(positionSec, force = false) {
    if (!this.isScrubbing_ || !this.harness_) {
      return false;
    }

    // Gate: don't seek if the previous scrub hasn't rendered yet.
    if (this.scrubRenderPending_ && !force) {
      return false;
    }

    const THRESHOLD =
        shaka.media.SeekBasedTrickPlayController.SCRUB_THRESHOLD_SEC_;
    if (Math.abs(positionSec - this.lastScrubPosition_) < THRESHOLD &&
        !force) {
      return false;
    }

    this.scrubRenderPending_ = true;
    this.lastScrubPosition_ = positionSec;

    // Use a full seekTo so the SE fetches from the scrub position.
    this.harness_.seekTo(positionSec);
    this.lastSeekToWallTime_ = Date.now();

    // If the position is buffered, record a successful render
    // immediately — the browser will decode the I-frame almost
    // instantly for a paused element.  We always do this regardless
    // of whether rVFC is active because rVFC (and the 'seeked' event)
    // may not fire when the audio SourceBuffer lacks data at this
    // position (the MSE buffered-intersection issue).
    if (this.harness_.isBuffered(positionSec)) {
      this.scrubRenderPending_ = false;
      this.lastRenderedTime_ = positionSec;
      this.lastRenderWallTime_ = Date.now();
      this.pushLastNPosition_(positionSec);
      if (this.harness_.onTrickFrameRendered) {
        this.harness_.onTrickFrameRendered(positionSec);
      }
    }

    return true;
  }

  /**
   * Exit scrub mode.
   */
  stopScrub() {
    this.isScrubbing_ = false;
    this.scrubRenderPending_ = false;
    this.stopFrameWatcher_();
  }

  /**
   * @return {boolean} Whether scrub mode is active.
   */
  isScrubActive() {
    return this.isScrubbing_;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Overshoot correction (VTP-inspired LastNPositions)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Compute a corrected position to seek to when cancelling trick play.
   * Returns the position of a recently-rendered frame that accounts for
   * the reaction time it takes the user to release the button.
   *
   * <p>The algorithm is ported from ExoPlayer's VTP overshoot correction:
   * given the target frame rate for the current speed, determine how many
   * frames correspond to {@link REACTION_TIME_MS_} and jump that many
   * entries back in the rendered-positions circular buffer.</p>
   *
   * @return {?number}  Corrected position in seconds, or null if not
   *     enough data is available.
   */
  getOvershootCorrectionPosition() {
    if (this.lastNCount_ === 0) {
      return null;
    }

    const fps = this.computeTargetFrameRate_();
    const frameIntervalMs = 1000 / fps;
    const REACTION =
        shaka.media.SeekBasedTrickPlayController.REACTION_TIME_MS_;
    const jumpBack = Math.min(
        Math.round(REACTION / frameIntervalMs),
        this.lastNCount_ - 1);

    if (jumpBack <= 0) {
      return null;
    }

    // Read backwards from the most-recently-written position.
    const MAX = shaka.media.SeekBasedTrickPlayController.LAST_N_MAX_;
    let idx = (this.lastNWriteIdx_ - 1 - jumpBack + MAX * 2) % MAX;
    if (idx < 0) {
      idx += MAX;
    }
    const correctedPos = this.lastNPositions_[idx];

    // Sanity check: don't correct if the delta is unreasonably large.
    const THRESHOLD =
        shaka.media.SeekBasedTrickPlayController
            .OVERSHOOT_CORRECTION_THRESHOLD_SEC_;
    const currentPos = this.harness_ ?
        this.harness_.getPresentationTime() : correctedPos;
    if (Math.abs(correctedPos - currentPos) > THRESHOLD) {
      return null;
    }

    return correctedPos;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Private: position anchoring
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Snapshot the current playhead position and wall-clock time as the
   * reference point for computing future target positions.  Called on start
   * and on every rate/direction change.
   * @private
   */
  anchorPosition_() {
    this.startPosition_ = this.harness_ ?
        this.harness_.getPresentationTime() : 0;
    this.startWallTime_ = Date.now();
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Private: requestVideoFrameCallback frame watcher
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Start watching for video frame renders via the harness
   * {@code watchFrames} method (backed by requestVideoFrameCallback).  If
   * the harness does not provide this method, the controller falls back to
   * the {@code isBuffered()} approximation — no error is raised.
   *
   * @private
   */
  startFrameWatcher_() {
    this.stopFrameWatcher_();
    if (!this.harness_ || !this.harness_.watchFrames) {
      return;
    }
    const cleanup = this.harness_.watchFrames((positionSec) => {
      this.renderPending_ = false;
      // Gate render-tracking on isBuffered — same rationale as
      // onSeekComplete().  RVFC may fire for seeks where the browser
      // holds the previous frame (no new decode).  If we update
      // lastRenderedTime_ to the seek target in that case, it races
      // ahead of the buffer and starves findNewFrame_().
      const realRender = this.harness_ &&
          this.harness_.isBuffered(positionSec);
      if (realRender) {
        this.lastRenderedTime_ = positionSec;
        this.lastRenderWallTime_ = Date.now();
        this.pushLastNPosition_(positionSec);
        this.isThrottled_ = false;
        if (this.isScrubbing_) {
          this.scrubRenderPending_ = false;
        }
        if (this.harness_ && this.harness_.onTrickFrameRendered) {
          this.harness_.onTrickFrameRendered(positionSec);
        }
      }
    });
    if (cleanup) {
      this.stopFrameWatcherFn_ = cleanup;
      this.useFrameCallback_ = true;
    }
  }

  /**
   * Stop the frame watcher if active.
   * @private
   */
  stopFrameWatcher_() {
    if (this.stopFrameWatcherFn_) {
      this.stopFrameWatcherFn_();
      this.stopFrameWatcherFn_ = null;
    }
    this.useFrameCallback_ = false;
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Private: cadence-timer seek loop
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Core seek-step.  Runs on each cadence-timer tick.
   *
   * Implements ExoPlayer VTP's render-pending gate: a seek is only issued
   * when no previous seek is pending (the browser has fired {@code seeked}
   * since the last {@code video.currentTime} assignment).  If a seek has
   * been pending for longer than {@code THROTTLE_FACTOR × tickInterval},
   * we force the next seek anyway — exactly matching ExoPlayer's
   * {@code shouldForceSeek} logic.
   *
   * The wall-clock target always advances (so the seek bar tracks the
   * declared speed), but frames are rendered only as fast as the browser/
   * network can deliver them.
   *
   * @private
   */
  seekStep_() {
    if (!this.harness_ || !this.isActive_) {
      return;
    }

    // Consume the post-append flag before any early return.
    this.postAppend_ = false;

    const seekRange = this.harness_.getSeekRange();
    if (!seekRange || seekRange.start === seekRange.end) {
      shaka.log.warning(
          'SeekBasedTrickPlayController: no seekable range available.');
      this.stop();
      this.harness_.onBoundaryReached();
      return;
    }

    // ── Wall-clock target ──
    const elapsedSec = (Date.now() - this.startWallTime_) / 1000;
    let targetTime = this.startPosition_ + this.rate_ * elapsedSec;
    targetTime = Math.max(seekRange.start, Math.min(targetTime, seekRange.end));

    const isForward = this.rate_ > 0;

    // Boundary check.
    if ((isForward && targetTime >= seekRange.end - 0.5) ||
        (!isForward && targetTime <= seekRange.start + 0.5)) {
      this.renderPending_ = false;
      this.harness_.seekVideoOnly(
          isForward ? seekRange.end : seekRange.start);
      this.stop();
      this.harness_.onBoundaryReached();
      return;
    }

    // ── Render-pending gate (ExoPlayer VTP pattern) ──
    // Only issue a new seek if the browser has finished rendering the
    // previous one (renderPending_ == false).  If the previous seek has
    // been pending too long, force a new seek to keep progressing.
    const now = Date.now();
    const tickIntervalMs = this.computeTickInterval_() * 1000;
    const THROTTLE =
        shaka.media.SeekBasedTrickPlayController.THROTTLE_FACTOR_;
    const timeSinceLastSeek = now - this.lastSeekIssuedWall_;
    const shouldForceSeek =
        this.renderPending_ && timeSinceLastSeek > THROTTLE * tickIntervalMs;

    if (!this.renderPending_ || shouldForceSeek) {
      // Determine seek target.  ExoPlayer always seeks to the wall-clock
      // target — even when unbuffered — so that video.currentTime tracks
      // the declared speed and the browser can render any frame that
      // becomes available.  We do the same, but first check whether there
      // is a newly-downloaded I-frame that we can display immediately
      // (findNewFrame_).  This provides faster visual feedback when the
      // SE has downloaded content the wall-clock target has already
      // passed.
      let seekTarget = targetTime;

      if (!this.harness_.isBuffered(targetTime)) {
        // Wall-clock target is not buffered.  Check for a renderable
        // I-frame that the SE has downloaded since the last render.
        const newFrame = this.findNewFrame_(isForward);
        if (newFrame !== null) {
          seekTarget = newFrame;
        }
        // If no new frame either, we still seek to the wall-clock
        // target so that video.currentTime reflects the expected
        // position.  The browser will hold the last decoded frame and
        // onSeekComplete() / watchFrames will NOT advance
        // lastRenderedTime_ (because the isBuffered gate will fail).
      }

      // Always issue the seek (matches ExoPlayer's executeSeek()).
      this.renderPending_ = true;
      this.lastSeekIssuedWall_ = now;
      this.harness_.seekVideoOnly(seekTarget);

      // ── Synchronous render detection ──
      // The MSE spec defines HTMLMediaElement.buffered as the intersection
      // of ALL active SourceBuffer ranges.  During trick play the audio
      // SourceBuffer is not being populated, so the browser's seek to a
      // video-only-buffered position may never complete — the 'seeked'
      // event and requestVideoFrameCallback both stay silent because the
      // position falls outside the intersection.
      //
      // isBuffered() checks the VIDEO SourceBuffer directly, bypassing
      // the intersection.  If the target is video-buffered we can
      // safely record a rendered frame right now — the browser will
      // decode the I-frame within a few milliseconds for a paused
      // element.  The async callbacks (onSeekComplete / watchFrames)
      // remain as complementary signals but are no longer the sole
      // render-detection path.
      if (this.harness_.isBuffered(seekTarget)) {
        this.renderPending_ = false;
        this.lastRenderedTime_ = seekTarget;
        this.lastRenderWallTime_ = now;
        this.pushLastNPosition_(seekTarget);
        this.isThrottled_ = false;
        if (this.harness_ && this.harness_.onTrickFrameRendered) {
          this.harness_.onTrickFrameRendered(seekTarget);
        }
      }
    }

    // ── SE resync ──
    this.maybeResyncSE_(targetTime);

    // ── Schedule next tick ──
    this.cadenceTimer_.tickAfter(this.computeTickInterval_());
  }

  /**
   * Check if the streaming engine has downloaded a new I-frame segment that
   * extends the buffer beyond the last rendered position.  Returns the
   * position to seek to, or null if nothing new is available.
   *
   * Forward: checks if {@code bufferEnd} has grown past lastRendered.
   * Reverse: checks if {@code bufferStart} has shrunk below lastRendered.
   *
   * @param {boolean} isForward
   * @return {?number}  Position to seek to, or null.
   * @private
   */
  findNewFrame_(isForward) {
    const THRESHOLD =
        shaka.media.SeekBasedTrickPlayController.NEW_FRAME_THRESHOLD_;
    const OFFSET =
        shaka.media.SeekBasedTrickPlayController.FRAME_OFFSET_;

    if (isForward) {
      const bufEnd = this.harness_.getBufferEnd();
      if (bufEnd != null && bufEnd > this.lastRenderedTime_ + THRESHOLD) {
        const pos = bufEnd - OFFSET;
        if (this.harness_.isBuffered(pos)) {
          return pos;
        }
      }
    } else {
      const bufStart = this.harness_.getBufferStart();
      if (bufStart != null &&
          bufStart < this.lastRenderedTime_ - THRESHOLD) {
        const pos = bufStart + OFFSET;
        if (this.harness_.isBuffered(pos)) {
          return pos;
        }
      }
    }
    return null;
  }

  /**
   * Resync the streaming engine when the wall-clock target has drifted far
   * from the buffer.  Uses a gap threshold + time debounce to avoid aborting
   * downloads too frequently.
   *
   * @param {number} targetTime
   * @private
   */
  maybeResyncSE_(targetTime) {
    const GAP = shaka.media.SeekBasedTrickPlayController.SE_RESYNC_GAP_SEC_;
    const INTERVAL =
        shaka.media.SeekBasedTrickPlayController.SE_RESYNC_INTERVAL_MS_;
    const now = Date.now();

    // Time debounce — never resync more often than INTERVAL.
    if (now - this.lastSeekToWallTime_ < INTERVAL) {
      return;
    }

    const isForward = this.rate_ > 0;
    const bufEnd = this.harness_.getBufferEnd();
    const bufStart = this.harness_.getBufferStart();

    let needsResync = false;

    if (bufEnd == null || bufStart == null) {
      // Nothing buffered at all — SE must be told where to fetch.
      needsResync = true;
    } else if (isForward && targetTime > bufEnd + GAP) {
      // Target has run far ahead of the buffer.
      needsResync = true;
    } else if (!isForward && targetTime < bufStart - GAP) {
      // Target has run far behind the buffer (reverse).
      needsResync = true;
    }

    if (needsResync) {
      this.harness_.seekTo(targetTime);
      this.lastSeekToWallTime_ = now;
    }
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Private: frame rate & tick interval (VTP-inspired adaptive FPS)
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Compute the target frame rate (frames per second) for the current
   * trick-play rate.  The formula is ported from ExoPlayer VTP's
   * {@code getTargetFrameRateForPlaybackSpeed()}:
   *
   * <ul>
   *   <li>Forward: {@code fps = |rate| × 0.067 + 2.5}</li>
   *   <li>Reverse: {@code fps = |rate| × 0.043 + 2.5} (slower for a
   *       smoother reverse UX)</li>
   * </ul>
   *
   * The result is clamped to [{@link MIN_FPS_}, {@link MAX_FPS_}].
   *
   * @return {number}
   * @private
   */
  computeTargetFrameRate_() {
    const absRate = Math.abs(this.rate_);
    const isForward = this.rate_ > 0;

    // Read config values from the harness if available; otherwise fall
    // back to the class-level constants (which are the ExoPlayer VTP
    // defaults).  This ensures that user-configured FPS tuning takes
    // effect.
    const config = this.harness_ && this.harness_.getConfig ?
        this.harness_.getConfig() : null;

    const FWD_FACTOR = config ? config.forwardFpsFactor :
        shaka.media.SeekBasedTrickPlayController.FPS_FWD_FACTOR_;
    const REV_FACTOR = config ? config.reverseFpsFactor :
        shaka.media.SeekBasedTrickPlayController.FPS_REV_FACTOR_;
    const BASE_FPS = config ? config.baseFps :
        shaka.media.SeekBasedTrickPlayController.FPS_BASE_;
    const MIN = config ? config.minFps :
        shaka.media.SeekBasedTrickPlayController.MIN_FPS_;
    const MAX = config ? config.maxFps :
        shaka.media.SeekBasedTrickPlayController.MAX_FPS_;

    const factor = isForward ? FWD_FACTOR : REV_FACTOR;
    const fps = absRate * factor + BASE_FPS;
    return Math.max(MIN, Math.min(fps, MAX));
  }

  /**
   * Compute the cadence-timer interval based on the adaptive target frame
   * rate.  The interval is simply {@code 1 / targetFPS}.
   *
   * @return {number} Interval in seconds.
   * @private
   */
  computeTickInterval_() {
    return 1 / this.computeTargetFrameRate_();
  }

  // ──────────────────────────────────────────────────────────────────────
  //  Private: circular buffer for rendered positions
  // ──────────────────────────────────────────────────────────────────────

  /**
   * Reset the circular buffer that tracks the last N rendered positions.
   * @private
   */
  resetLastNPositions_() {
    const MAX = shaka.media.SeekBasedTrickPlayController.LAST_N_MAX_;
    this.lastNPositions_ = new Array(MAX);
    this.lastNWriteIdx_ = 0;
    this.lastNCount_ = 0;
  }

  /**
   * Push a rendered position into the circular buffer.
   * @param {number} positionSec
   * @private
   */
  pushLastNPosition_(positionSec) {
    const MAX = shaka.media.SeekBasedTrickPlayController.LAST_N_MAX_;
    this.lastNPositions_[this.lastNWriteIdx_] = positionSec;
    this.lastNWriteIdx_ = (this.lastNWriteIdx_ + 1) % MAX;
    if (this.lastNCount_ < MAX) {
      this.lastNCount_++;
    }
  }
};


/**
 * Trick-play direction.
 * @enum {string}
 */
shaka.media.SeekBasedTrickPlayController.Direction = {
  FORWARD: 'forward',
  REVERSE: 'reverse',
  SCRUB: 'scrub',
  NONE: 'none',
};


/**
 * @typedef {{
 *   getPresentationTime: function():number,
 *   getSeekRange: function():({start: number, end: number}),
 *   getSeekCadence: function():number,
 *   seekTo: function(number),
 *   seekVideoOnly: function(number),
 *   isBuffered: function(number):boolean,
 *   getBufferEnd: function():?number,
 *   getBufferStart: function():?number,
 *   onBoundaryReached: function(),
 *   onTrickFrameRendered: (function(number)|undefined),
 *   watchFrames: (Function|undefined),
 *   getConfig: (function():shaka.extern.SeekBasedTrickPlayConfiguration|
 *       undefined),
 * }}
 *
 * @description
 *   A harness that abstracts the player from the controller, making it easier
 *   to test.
 *
 * @property {function():number} getPresentationTime
 *   Get the current playhead position in seconds.
 *
 * @property {function():({start: number, end: number})} getSeekRange
 *   Get the current seekable range.
 *
 * @property {function():number} getSeekCadence
 *   Get the interval in seconds between cadence-timer ticks.
 *   (Retained in the harness for potential future use; not actively used by
 *   the sequential-seek loop.)
 *
 * @property {function(number)} seekTo
 *   Full seek: sets {@code video.currentTime} AND notifies the streaming
 *   engine (calls {@code StreamingEngine.seeked()}).
 *
 * @property {function(number)} seekVideoOnly
 *   Lightweight seek: only sets {@code video.currentTime} without notifying
 *   the streaming engine, allowing it to continue pre-fetching ahead.
 *
 * @property {function(number):boolean} isBuffered
 *   Returns whether the given time (seconds) is currently in the video
 *   buffer.
 *
 * @property {function():?number} getBufferEnd
 *   Returns the end time (seconds) of the current video buffer, or null if
 *   nothing is buffered.
 *
 * @property {function():?number} getBufferStart
 *   Returns the start time (seconds) of the current video buffer, or null
 *   if nothing is buffered.
 *
 * @property {function()} onBoundaryReached
 *   Called when the playhead reaches the start or end of the seekable range.
 *
 * @property {(function(number)|undefined)} onTrickFrameRendered
 *   Optional callback invoked each time a trick-play frame is rendered
 *   (i.e. seeked to a buffered position).  The argument is the media
 *   position (seconds) of the rendered frame.
 *
 * @property {(Function|undefined)} watchFrames
 *   Optional.  Starts watching for video frame renders via
 *   {@code requestVideoFrameCallback}.  Takes a callback that receives the
 *   media position (seconds) of each rendered frame.  Returns a teardown
 *   function to stop watching, or null if the API is not supported.  When
 *   provided, the controller uses it for more accurate render tracking in
 *   throttling and overshoot correction.
 *
 * @property {(function():shaka.extern.SeekBasedTrickPlayConfiguration|
 *     undefined)} getConfig
 *   Optional.  Returns the current seek-based trick play configuration
 *   object.  When provided, the controller reads FPS tuning values
 *   ({@code forwardFpsFactor}, {@code reverseFpsFactor}, {@code baseFps},
 *   {@code minFps}, {@code maxFps}) from the returned config instead of
 *   using class-level constants.  This allows runtime configuration.
 */
shaka.media.SeekBasedTrickPlayController.Harness;


/**
 * Distance (in seconds) between the wall-clock target and the buffer edge
 * before the streaming engine is resynced.  Larger values give the SE more
 * uninterrupted download time; smaller values keep downloads closer to the
 * display position.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.SE_RESYNC_GAP_SEC_ = 10;


/**
 * Minimum interval (in milliseconds) between consecutive {@code seekTo()}
 * calls that notify the streaming engine.  Prevents aborting downloads too
 * frequently on slow networks.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.SE_RESYNC_INTERVAL_MS_ = 5000;


/**
 * Minimum distance (in seconds) that the buffer frontier must exceed beyond
 * {@code lastRenderedTime_} before a new frame is considered available.
 * Prevents re-rendering the same segment boundary.  Must be smaller than
 * typical I-frame segment duration (2–10 s).
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.NEW_FRAME_THRESHOLD_ = 0.5;


/**
 * Small inward offset (seconds) from the buffer frontier to ensure the seek
 * lands on a position that is reliably reported as buffered.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.FRAME_OFFSET_ = 0.1;


// ── VTP-ported constants ──


/**
 * Forward frame-rate factor.  Target FPS for forward trick play is
 * {@code |rate| × FPS_FWD_FACTOR + FPS_BASE}.
 * Ported from ExoPlayer VTP's {@code getTargetFrameRateForPlaybackSpeed()}.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.FPS_FWD_FACTOR_ = 0.067;


/**
 * Reverse frame-rate factor.  Reverse uses a lower multiplier than forward
 * because reverse I-frame rendering on the web platform is inherently
 * slower (each seek must land on a sync sample, and the browser typically
 * decodes forward to the nearest keyframe).
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.FPS_REV_FACTOR_ = 0.043;


/**
 * Base frame rate added to the speed-dependent component.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.FPS_BASE_ = 2.5;


/**
 * Minimum target FPS (clamp floor).
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.MIN_FPS_ = 2;


/**
 * Maximum target FPS (clamp ceiling).
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.MAX_FPS_ = 10;


/**
 * Throttle multiplier.  If no frame has rendered within
 * {@code THROTTLE_FACTOR × tickInterval}, the next tick interval is
 * multiplied by this factor.  Ported from ExoPlayer VTP which uses 8×.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.THROTTLE_FACTOR_ = 8;


/**
 * Maximum number of rendered positions stored in the circular buffer.
 * Ported from ExoPlayer VTP's {@code LAST_RENDER_POSITIONS_MAX = 15}.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.LAST_N_MAX_ = 15;


/**
 * Reaction time (milliseconds) used for overshoot correction.  When trick
 * play ends, we jump back this many milliseconds' worth of frames to
 * account for human reaction time.  Ported from ExoPlayer VTP's
 * {@code REACTION_TIME_FOR_OVERSHOOT = 250}.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.REACTION_TIME_MS_ = 250;


/**
 * Maximum distance (seconds) for overshoot correction.  If the corrected
 * position is farther than this from the current position, correction is
 * skipped.  Ported from ExoPlayer VTP's
 * {@code TRICK_PLAY_CORRECTION_THRESHOLD_MS = 18000}.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController
    .OVERSHOOT_CORRECTION_THRESHOLD_SEC_ = 18;


/**
 * Minimum distance (seconds) between scrub positions before a new scrub
 * seek is issued.  Prevents excessive seeks when the user drags the seek
 * bar slowly.
 *
 * @const {number}
 * @private
 */
shaka.media.SeekBasedTrickPlayController.SCRUB_THRESHOLD_SEC_ = 1;
