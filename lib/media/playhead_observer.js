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

goog.provide('shaka.media.IPlayheadObserver');
goog.provide('shaka.media.PlayheadObserverManager');

goog.require('shaka.util.IReleasable');


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
 * The playhead observer mananger is responsible for owning playhead observer
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

    /**
     * The set of all observers that this manager is responsible for updating.
     * We are using a set to ensure that we don't double update an observer if
     * it is accidentally added twice.
     *
     * @private {!Set.<shaka.media.IPlayheadObserver>}
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
    }).tickEvery(/* seconds= */ 0.25);
  }

  /** @override */
  release() {
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
   */
  notifyOfSeek() {
    this.pollAllObservers_(/* seeking= */ true);
  }

  /**
   * @param {boolean} seeking
   * @private
   */
  pollAllObservers_(seeking) {
    for (const observer of this.observers_) {
      observer.poll(
          this.mediaElement_.currentTime,
          seeking);
    }
  }
};
