/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.IPlayheadObserver');
goog.provide('shaka.media.PlayheadObserverManager');

goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * A playhead observer is a system that watches for meaningful changes in state
 * that are dependent on playhead information. The observer is responsible for
 * managing its own listeners.
 *
 * @extends {shaka.util.IReleasable}
 * @interface
 */
shaka.media.IPlayheadObserver = class {
  /**
   * Check again (using an update playhead summary) if an event should be fired.
   * If an event should be fired, fire it.
   *
   * @param {number} positionInSeconds
   * @param {boolean} wasSeeking
   */
  poll(positionInSeconds, wasSeeking) {}
};


/**
 * The playhead observer manager is responsible for owning playhead observer
 * instances and polling them when needed. Destroying the manager will destroy
 * all observers managed by the manager.
 *
 * @implements {shaka.util.IReleasable}
 * @final
 */
shaka.media.PlayheadObserverManager = class {
  /**
   * @param {!HTMLMediaElement} mediaElement
   */
  constructor(mediaElement) {
    /** @private {HTMLMediaElement} */
    this.mediaElement_ = mediaElement;

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /**
     * The set of all observers that this manager is responsible for updating.
     * We are using a set to ensure that we don't double update an observer if
     * it is accidentally added twice.
     *
     * @private {!Set<shaka.media.IPlayheadObserver>}
     */
    this.observers_ = new Set();

    /**
     * To fire events semi-accurately, poll the observers 4 times a second. This
     * should be frequent enough to trigger an event close enough to its actual
     * occurrence without the user noticing a delay.
     *
     * @private {shaka.util.Timer}
     */
    this.pollingLoop_ = new shaka.util.Timer(() => {
      this.pollAllObservers_(/* seeking= */ false);
    }).tickNow();

    if (!mediaElement.paused) {
      this.pollingLoop_.tickEvery(/* seconds= */ 0.25);
    }

    this.eventManager_.listen(mediaElement, 'playing', () => {
      this.pollingLoop_.tickNow().tickEvery(/* seconds= */ 0.25);
    });
    this.eventManager_.listen(mediaElement, 'pause', () => {
      this.pollingLoop_.stop();
      if (isFinite(mediaElement.duration) && mediaElement.duration > 0) {
        // When playRangeEnd is set or when reaching the end of media, the media
        // element may pause instead of firing 'ended'. Poll observers with
        // the duration if playback paused at or near the end so that regions
        // starting at the presentation end are still entered.
        const tolerance = 0.5;
        if (mediaElement.currentTime >= mediaElement.duration - tolerance) {
          this.pollAllObservers_(/* seeking= */ false, mediaElement.duration);
        }
      }
    });
    this.eventManager_.listen(mediaElement, 'seeked', () => {
      this.pollingLoop_.tickNow();
      if (!mediaElement.paused) {
        this.pollingLoop_.tickEvery(/* seconds= */ 0.25);
      }
    });
    this.eventManager_.listen(mediaElement, 'ended', () => {
      // The end of the media fires 'pause' too, which has already stopped the
      // polling loop, so the last poll landed short of the end. Poll once more
      // using the duration, so that regions that start at the very end of the
      // presentation are still entered. Using the duration rather than the
      // current time also covers media that ends a few milliseconds before its
      // declared duration.
      this.pollAllObservers_(/* seeking= */ false, mediaElement.duration);
    });
  }

  /** @override */
  release() {
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    // We need to stop the loop or else we may try to use a released resource.
    this.pollingLoop_.stop();

    for (const observer of this.observers_) {
      observer.release();
    }

    this.observers_.clear();
  }

  /**
   * Have the playhead observer manager manage a new observer. This will ensure
   * that observers are only tracked once within the manager. After this call,
   * the manager will be responsible for the life cycle of |observer|.
   *
   * @param {!shaka.media.IPlayheadObserver} observer
   */
  manage(observer) {
    this.observers_.add(observer);
  }

  /**
   * Notify all the observers that we just seeked.
   *
   * @param {boolean} seeking
   */
  notifyOfSeek(seeking) {
    this.pollAllObservers_(seeking);
  }

  /**
   * @param {boolean} seeking
   * @param {number=} position The position to poll with, in seconds. Ignored
   *   when it is not a finite number, in which case the current time of the
   *   media element is used.
   * @private
   */
  pollAllObservers_(seeking, position) {
    const currentTime = isFinite(position) ?
        Number(position) : this.mediaElement_.currentTime;
    for (const observer of this.observers_) {
      observer.poll(currentTime, seeking);
    }
  }
};
