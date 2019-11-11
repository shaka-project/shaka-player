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
   * @return {boolean}
   */
  isPaused() {}

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
};
