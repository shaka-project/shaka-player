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
   */
  getDuration() {}

  /**
   * @return {number}
   */
  getRemainingTime() {}

  /**
   * @return {number}
   */
  getTimeUntilSkippable() {}

  /**
   * @return {boolean}
   */
  isPaused() {}

  /**
   * @return {boolean}
   */
  isSkippable() {}

  /**
   * @return {boolean}
   */
  canSkipNow() {}

  skip() {}

  play() {}

  pause() {}

  /**
   * @return {number}
   */
  getVolume() {}

  /**
   * @param {number} volume
   */
  setVolume(volume) {}

  /**
   * @return {boolean}
   */
  isMuted() {}

  /**
   * @param {boolean} muted
   */
  setMuted(muted) {}

  /**
   * @param {number} width
   * @param {number} height
   */
  resize(width, height) {}

  /**
   * @return {number}
   */
  getSequenceLength() {}

  /**
   * @return {number}
   */
  getPositionInSequence() {}
};
