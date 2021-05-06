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

goog.provide('shaka.test.Waiter');


shaka.test.Waiter = class {
  /** @param {!shaka.util.EventManager} eventManager */
  constructor(eventManager) {
    /** @private {shaka.util.EventManager} */
    this.eventManager_ = eventManager;

    /** @private {boolean} */
    this.failOnTimeout_ = true;

    /** @private {number} */
    this.timeoutSeconds_ = 5;
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
   * Wait for the video playhead to reach a certain target time.
   * Promise is resolved when the playhead reaches |timeGoal| or the video ends.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @param {number} timeGoal
   * @return {!Promise}
   */
  waitUntilPlayheadReaches(mediaElement, timeGoal) {
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
   * Wait for the video to end.
   *
   * @param {!HTMLMediaElement} mediaElement
   * @return {!Promise}
   */
  waitForEnd(mediaElement) {
    // Sometimes, the ended flag is not set, or the event does not fire,
    // (I'm looking at **you**, Safari), so also check if we've reached the
    // duration.
    if (mediaElement.ended ||
        mediaElement.currentTime >= mediaElement.duration) {
      return Promise.resolve();
    }

    // The name of what we're waiting for.
    const goalName = 'end of media';

    // Cleanup on timeout.
    const cleanup = () => {
      this.eventManager_.unlisten(mediaElement, 'timeupdate');
      this.eventManager_.unlisten(mediaElement, 'ended');
    };

    // The conditions for success.  Don't rely on either time, or the ended
    // flag, or the ended event, specifically.  Any of these is sufficient.
    // This flexibility cuts down on test flake on Safari (currently 14) in
    // particular, where the flag might be set, but the ended event did not
    // fire.
    const p = new Promise((resolve) => {
      this.eventManager_.listen(mediaElement, 'timeupdate', () => {
        if (mediaElement.currentTime >= mediaElement.duration ||
            mediaElement.ended) {
          cleanup();
          resolve();
        }
      });
      this.eventManager_.listen(mediaElement, 'ended', () => {
        cleanup();
        resolve();
      });
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
        this.logDebugInfoForMedia_(error.message, target);
      }

      // Reject or resolve based on our settings.
      if (failOnTimeout) {
        throw error;
      }
    });

    return Promise.race([success, timeout]);
  }

  /**
   * @param {string} message
   * @param {!HTMLMediaElement} mediaElement
   * @private
   */
  logDebugInfoForMedia_(message, mediaElement) {
    const buffered = [];
    for (let i = 0; i < mediaElement.buffered.length; ++i) {
      buffered.push({
        start: mediaElement.buffered.start(i),
        end: mediaElement.buffered.end(i),
      });
    }

    shaka.log.error(message,
        'current time', mediaElement.currentTime,
        'ready state', mediaElement.readyState,
        'playback rate', mediaElement.playbackRate,
        'paused', mediaElement.paused,
        'ended', mediaElement.ended,
        'buffered', buffered);
  }
};
