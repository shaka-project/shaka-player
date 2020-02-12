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
   * @exportTypescript
   */
  getDuration() {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getRemainingTime() {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getTimeUntilSkippable() {}

  /**
   * @return {boolean}
   * @exportTypescript
   */
  isPaused() {}

  /**
   * @return {boolean}
   * @exportTypescript
   */
  isSkippable() {}

  /**
   * @return {boolean}
   * @exportTypescript
   */
  canSkipNow() {}

  /**
   * @exportTypescript
   */
  skip() {}

  /**
   * @exportTypescript
   */
  play() {}

  /**
   * @exportTypescript
   */
  pause() {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getVolume() {}

  /**
   * @param {number} volume
   * @exportTypescript
   */
  setVolume(volume) {}

  /**
   * @return {boolean}
   * @exportTypescript
   */
  isMuted() {}

  /**
   * @param {boolean} muted
   * @exportTypescript
   */
  setMuted(muted) {}

  /**
   * @param {number} width
   * @param {number} height
   * @exportTypescript
   */
  resize(width, height) {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getSequenceLength() {}

  /**
   * @return {number}
   * @exportTypescript
   */
  getPositionInSequence() {}
};
