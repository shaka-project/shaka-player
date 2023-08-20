/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

shaka.test.Waiter = class {
  /** @param {!shaka.util.EventManager} eventManager */
  constructor(eventManager) {
    /** @private {shaka.util.EventManager} */
    this.eventManager_ = eventManager;

    /** @private {boolean} */
    this.failOnTimeout_ = true;

    /** @private {number} */
    this.timeoutSeconds_ = 5;

    /** @private {shaka.Player} */
    this.player_ = null;

    /** @private {shaka.media.MediaSourceEngine} */
    this.mediaSourceEngine_ = null;
  }

  // TODO: Consider replacing this with a settings argument on the individual
  // waiters, or resetting these settings after each wait.
  /**
   * Change the timeout time for subsequent wait operations.
   *
   * @param {number} timeoutSeconds
   * @return {!shaka.test.Waiter}
   */
  timeoutAfter(timeoutSeconds) {
    this.timeoutSeconds_ = timeoutSeconds;
    return this;
  }

  // TODO: Consider replacing this with a settings argument on the individual
  // waiters, or resetting these settings after each wait.
  /**
   * Change the timeout behavior (pass or fail) for subsequent wait operations.
   *
   * @param {boolean} shouldFailOnTimeout
   * @return {!shaka.test.Waiter}
   */
  failOnTimeout(shouldFailOnTimeout) {
    this.failOnTimeout_ = shouldFailOnTimeout;
    return this;
  }

  /**
   * For tests with access to MediaSourceEngine, this can provide better
   * debugging for buffered ranges on failure.
   *
   * @param {shaka.Player} player
   * @return {!shaka.test.Waiter}
   */
  setPlayer(player) {
    this.player_ = player;
    return this;
  }

  /**
   * For tests with access to MediaSourceEngine, this can provide better
   * debugging for buffered ranges on failure.
   *
   * @param {shaka.media.MediaSourceEngine} mediaSourceEngine
   * @return {!shaka.test.Waiter}
   */
  setMediaSourceEngine(mediaSourceEngine) {
    this.mediaSourceEngine_ = mediaSourceEngine;
    return this;
  }

  /**
   * Wait for the video playhead to move forward by some meaningful delta.  The
   * Promise is resolved when the playhead moves or the video ends.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @return {!Promise}
   */
  waitForMovement(mediaElement) {
    console.assert(!mediaElement.ended, 'Video should not be ended!');
    const timeGoal = mediaElement.currentTime + 1;
    return this.waitUntilPlayheadReaches(mediaElement, timeGoal);
  }

  /**
   * Wait for the video playhead to move forward by some meaningful delta.
   * If this happens before |timeout| seconds pass, the Promise is resolved.
   * Otherwise, the Promise is rejected.
   *
   * @param {!HTMLMediaElement} target
   * @param {number} timeout in seconds, after which the Promise fails
   * @return {!Promise}
   */
  waitForMovementOrFailOnTimeout(target, timeout) {
    this.timeoutAfter(timeout).failOnTimeout(true);
    return this.waitForMovement(target);
  }

  /**
   * Wait for the video playhead to reach a certain target time.
   * Promise is resolved when the playhead reaches |timeGoal| or the video ends.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @param {number} timeGoal
   * @return {!Promise}
   */
  waitUntilPlayheadReaches(mediaElement, timeGoal) {
    this.macPlaybackWorkaround_(mediaElement);

    // The name of what we're waiting for
    const goalName = 'movement from ' + mediaElement.currentTime +
                     ' to ' + timeGoal;

    // The conditions for success
    const p = new Promise((resolve) => {
      this.eventManager_.listen(mediaElement, 'timeupdate', () => {
        if (mediaElement.currentTime >= timeGoal || mediaElement.ended) {
          this.eventManager_.unlisten(mediaElement, 'timeupdate');
          resolve();
        }
      });
    });

    // The cleanup on timeout
    const cleanup = () => {
      this.eventManager_.unlisten(mediaElement, 'timeupdate');
    };

    return this.waitUntilGeneric_(goalName, p, cleanup, mediaElement);
  }

  /**
   * Wait for the video playhead to reach a certain target time.
   * If the playhead reaches |timeGoal| or the video ends before |timeout|
   * seconds pass, the Promise is resolved.
   * Otherwise, the Promise is rejected.
   * @param {!HTMLMediaElement} mediaElement
   * @param {number} timeGoal The time to wait for the playhead to reach.
   * @param {number} timeout Timeout in seconds, after which the Promise fails.
   * @return {!Promise}
   */
  waitUntilPlayheadReachesOrFailOnTimeout(mediaElement, timeGoal, timeout) {
    this.timeoutAfter(timeout).failOnTimeout(true);
    return this.waitUntilPlayheadReaches(mediaElement, timeGoal);
  }

  /**
   * Wait for the video to end.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @return {!Promise}
   */
  waitForEnd(mediaElement) {
    this.macPlaybackWorkaround_(mediaElement);

    // The name of what we're waiting for.
    const goalName = 'end of media';

    // The conditions for success.  Don't rely on either time, or the ended
    // flag, or the ended event, specifically.  Any of these is sufficient.
    // This flexibility cuts down on test flake on Safari (currently 14) in
    // particular, where the flag might be set, but the ended event did not
    // fire.  We also see flake on Firefox (currently 99), where test playbacks
    // sometimes stop right before duration is reached.  (Duration 60.01, audio
    // buffered to 60.01, video buffered to exactly 60.)
    const hasEnded = () => {
      return mediaElement.currentTime >= mediaElement.duration - 0.1 ||
          mediaElement.ended;
    };

    if (hasEnded()) {
      return Promise.resolve();
    }

    // Cleanup on timeout.
    let timer = null;
    const cleanup = () => {
      if (timer) {
        timer.stop();
      }
      this.eventManager_.unlisten(mediaElement, 'timeupdate');
      this.eventManager_.unlisten(mediaElement, 'ended');
    };

    const p = new Promise((resolve) => {
      const check = () => {
        if (hasEnded()) {
          cleanup();
          resolve();
        }
      };

      // In Firefox 99, there appears to be some bug in the browser preventing
      // events from being triggered at the end of the presentation.  So we
      // check for the end once per second.  Without this, StreamingEngine
      // integration tests were failing.
      timer = new shaka.util.Timer(check);
      timer.tickEvery(/* seconds= */ 1);
      this.eventManager_.listen(mediaElement, 'timeupdate', check);
      this.eventManager_.listen(mediaElement, 'ended', check);
    });

    return this.waitUntilGeneric_(goalName, p, cleanup, mediaElement);
  }

  /**
   * Wait for the video to end or for |timeout| seconds to pass, whichever
   * occurs first.  The Promise is resolved when either of these happens.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @param {number} timeout in seconds, after which the Promise succeeds
   * @return {!Promise}
   */
  waitForEndOrTimeout(mediaElement, timeout) {
    this.failOnTimeout(false).timeoutAfter(timeout);
    return this.waitForEnd(mediaElement);
  }

  /**
   * Wait until a certain amount of content is buffered.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @param {number} bufferingGoal in seconds, after which the Promise succeeds
   * @return {!Promise}
   */
  waitUntilBuffered(mediaElement, bufferingGoal) {
    // The name of what we're waiting for.
    const goalName = `${bufferingGoal} seconds buffered`;

    // The conditions for success.
    const bufferedEnough = () => {
      const end = shaka.media.TimeRangesUtils.bufferEnd(mediaElement.buffered);
      if (end == null) {
        return false;
      }
      return end - mediaElement.currentTime >= bufferingGoal;
    };

    if (bufferedEnough()) {
      return Promise.resolve();
    }

    // Cleanup on timeout.
    let timer = null;
    const cleanup = () => {
      if (timer) {
        timer.stop();
      }
      this.eventManager_.unlisten(mediaElement, 'timeupdate');
      this.eventManager_.unlisten(mediaElement, 'ended');
    };

    const p = new Promise((resolve) => {
      const check = () => {
        if (bufferedEnough()) {
          cleanup();
          resolve();
        }
      };

      timer = new shaka.util.Timer(check);
      timer.tickEvery(/* seconds= */ 1);
      this.eventManager_.listen(mediaElement, 'timeupdate', check);
      this.eventManager_.listen(mediaElement, 'ended', check);
    });

    return this.waitUntilGeneric_(goalName, p, cleanup, mediaElement);
  }

  /**
   * Wait for the given event.
   *
   * @param {!EventTarget} target
   * @param {string} eventName
   * @return {!Promise}
   */
  waitForEvent(target, eventName) {
    // The name of what we're waiting for
    const goalName = 'event ' + eventName;

    // The conditions for success
    const p = new Promise((resolve) => {
      this.eventManager_.listenOnce(target, eventName, resolve);
    });

    // The cleanup on timeout
    const cleanup = () => {
      this.eventManager_.unlisten(target, eventName);
    };

    return this.waitUntilGeneric_(goalName, p, cleanup, target);
  }

  /**
   * Wait for a certain Promise to be resolved, or throw on timeout.
   *
   * @param {!Promise} p
   * @param {string} label A name to give the Promise in error messages.
   * @return {!Promise}
   */
  waitForPromise(p, label) {
    const cleanup = () => {};
    const target = null;
    return this.waitUntilGeneric_(label, p, cleanup, target);
  }

  /**
   * Wait for a certain Promise to be resolved, or throw on timeout.
   * Handles all debug logging and timeouts generically.
   *
   * @param {string} goalName
   * @param {!Promise} p
   * @param {function()} cleanupOnTimeout
   * @param {EventTarget} target
   * @return {!Promise}
   * @private
   */
  waitUntilGeneric_(goalName, p, cleanupOnTimeout, target) {
    let goalMet = false;
    const startTime = Date.now();
    shaka.log.debug('Waiting for ' + goalName);

    // Cache the value of this when we start, in case it changes during the
    // async work below.
    const failOnTimeout = this.failOnTimeout_;

    // The original stacktrace will be lost if we create the Error in the
    // timeout callback below.  Create the Error now so that it has a more
    // useful stacktrace on timeout.
    const error = new Error('Timeout waiting for ' + goalName);

    const success = p.then(() => {
      goalMet = true;
      const endTime = Date.now();
      const seconds = ((endTime - startTime) / 1000).toFixed(2);
      shaka.log.debug(goalName + ' after ' + seconds + ' seconds');
    });

    const timeout = shaka.test.Util.delay(this.timeoutSeconds_).then(() => {
      // Avoid error logs and cleanup callback if we've already met the goal.
      if (goalMet) {
        return;
      }

      cleanupOnTimeout();

      // Improve the error message with media-specific debug info.
      if (target instanceof HTMLMediaElement) {
        this.logDebugInfoForMedia_(error, target);
      }

      // Reject or resolve based on our settings.
      if (failOnTimeout) {
        throw error;
      }
    });

    return Promise.race([success, timeout]);
  }

  /**
   * @param {!Error} error
   * @param {!HTMLMediaElement} mediaElement
   * @private
   */
  logDebugInfoForMedia_(error, mediaElement) {
    let buffered;
    if (this.player_) {
      buffered = this.player_.getBufferedInfo();
    } else if (this.mediaSourceEngine_) {
      buffered = this.mediaSourceEngine_.getBufferedInfo();
    } else {
      buffered = shaka.media.TimeRangesUtils.getBufferedInfo(
          mediaElement.buffered);
    }

    error.message += '\n' +
        `current time: ${mediaElement.currentTime}\n` +
        `duration: ${mediaElement.duration}\n` +
        `ready state: ${mediaElement.readyState}\n` +
        `playback rate: ${mediaElement.playbackRate}\n` +
        `paused: ${mediaElement.paused}\n` +
        `ended: ${mediaElement.ended}\n` +
        `buffered: ${JSON.stringify(buffered)}\n`;
    shaka.log.error(error.message);
  }

  /**
   * @param {!HTMLMediaElement} mediaElement
   * @private
   */
  macPlaybackWorkaround_(mediaElement) {
    if (shaka.util.Platform.isMac()) {
      // Work around bizarre playback slowdowns that only seem to occur with
      // WebDriver and only on Mac.  Increasing the playback rate allows tests
      // to complete without timing out.
      if (mediaElement.playbackRate == 1) {
        mediaElement.playbackRate = 2;
      }
    }
  }
};
