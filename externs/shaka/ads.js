/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */

/**
 * An object that's responsible for all the ad-related logic
 * in the player.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.IAdManager = class extends EventTarget {};


/**
 * A factory for creating the ad manager.  This will be called with 'new'.
 *
 * @typedef {function(new:shaka.extern.IAdManager)}
 * @exportDoc
 */
shaka.extern.IAdManager.Factory;


/**
 * Interface for Ad objects.
 *
 * @extends {shaka.util.IReleasable}
 * @interface
 * @exportDoc
 */
shaka.extern.IAd = class {
  /**
   * @return {number}
   * @export
   */
  getDuration() {}

  /**
   * @return {number}
   * @export
   */
  getRemainingTime() {}

  /**
   * @return {number}
   * @export
   */
  getTimeUntilSkippable() {}

  /**
   * @return {boolean}
   * @export
   */
  isPaused() {}

  /**
   * @return {boolean}
   * @export
   */
  isSkippable() {}

  /**
   * @return {boolean}
   * @export
   */
  canSkipNow() {}

  /**
   * @export
   */
  skip() {}

  /**
   * @export
   */
  play() {}

  /**
   * @export
   */
  pause() {}

  /**
   * @return {number}
   * @export
   */
  getVolume() {}

  /**
   * @param {number} volume
   * @export
   */
  setVolume(volume) {}

  /**
   * @return {boolean}
   * @export
   */
  isMuted() {}

  /**
   * @param {boolean} muted
   * @export
   */
  setMuted(muted) {}

  /**
   * @param {number} width
   * @param {number} height
   * @export
   */
  resize(width, height) {}

  /**
   * @return {number}
   * @export
   */
  getSequenceLength() {}

  /**
   * @return {number}
   * @export
   */
  getPositionInSequence() {}
};
