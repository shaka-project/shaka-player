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

goog.provide('shaka.util.FakeEvent');



/**
 * Create an Event work-alike object based on the dictionary.
 * The event should contain all of the same properties from the dict.
 *
 * @param {string} type
 * @param {Object=} opt_dict
 * @constructor
 * @extends {Event}
 */
shaka.util.FakeEvent = function(type, opt_dict) {
  // Take properties from dict if present.
  var dict = opt_dict || {};
  for (var key in dict) {
    this[key] = dict[key];
  }


  // These Properties below cannot be set by dict.  They are all provided for
  // compatibility with native events.

  /** @const {boolean} */
  this.bubbles = false;

  /** @const {boolean} */
  this.cancelable = false;

  /** @const {boolean} */
  this.defaultPrevented = false;

  /**
   * According to MDN, Chrome uses high-res timers instead of epoch time.
   * Follow suit so that timeStamps on FakeEvents use the same base as
   * on native Events.
   * @const {number}
   * @see https://developer.mozilla.org/en-US/docs/Web/API/Event/timeStamp
   */
  this.timeStamp = window.performance ? window.performance.now() : Date.now();

  /** @const {string} */
  this.type = type;

  /** @const {boolean} */
  this.isTrusted = false;

  /** @type {EventTarget} */
  this.currentTarget = null;

  /** @type {EventTarget} */
  this.target = null;


  /**
   * Non-standard property read by FakeEventTarget to stop processing listeners.
   * @type {boolean}
   */
  this.stopped = false;
};


/**
 * Does nothing, since FakeEvents have no default.  Provided for compatibility
 * with native Events.
 */
shaka.util.FakeEvent.prototype.preventDefault = function() {};


/**
 * Stops processing event listeners for this event.  Provided for compatibility
 * with native Events.
 */
shaka.util.FakeEvent.prototype.stopImmediatePropagation = function() {
  this.stopped = true;
};


/**
 * Does nothing, since FakeEvents do not bubble.  Provided for compatibility
 * with native Events.
 */
shaka.util.FakeEvent.prototype.stopPropagation = function() {};
