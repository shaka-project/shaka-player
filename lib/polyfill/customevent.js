/**
 * Copyright 2015 Google Inc.
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
 *
 * @fileoverview A polyfill to implement the CustomEvent constructor.
 *
 * @see http://enwp.org/polyfill
 */

goog.provide('shaka.polyfill.CustomEvent');


/**
 * @namespace shaka.polyfill.CustomEvent
 * @export
 *
 * @summary A polyfill to implement the CustomEvent constructor on browsers
 * which don't have one or don't allow its direct use.
 */


/**
 * Install the polyfill if needed.
 * @export
 */
shaka.polyfill.CustomEvent.install = function() {
  var present = 'CustomEvent' in window;

  if (present) {
    try {
      new CustomEvent('');
    } catch (exception) {
      present = false;
    }
  }

  if (!present) {
    window['CustomEvent'] = shaka.polyfill.CustomEvent.ctor_;
  }
};



/**
 * @this {CustomEvent}
 * @constructor
 * @param {string} type
 * @param {CustomEventInit=} opt_init
 * @private
 */
shaka.polyfill.CustomEvent.ctor_ = function(type, opt_init) {
  var event = /** @type {!CustomEvent} */(document.createEvent('CustomEvent'));
  var init = opt_init || { bubbles: false, cancelable: false, detail: null };
  event.initCustomEvent(type, !!init.bubbles, !!init.cancelable, init.detail);
  return event;
};

