/**
 * Copyright 2014 Google Inc.
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
 * @fileoverview Implements a concrete EventTarget class.
 */



/**
 * Creates a new FakeEventTarget.
 * @constructor
 */
FakeEventTarget = function() {
  /** @private {!Object.<string, Array.<!Object>>} */
  this.listenerMap_ = {};
};


/**
 * Adds an event listener.
 * @param {string} type The event type.
 * @param {function(!Object)} listener The event listener.
 */
FakeEventTarget.prototype.addEventListener = function(type, listener) {
  var listeners = this.listenerMap_[type];
  if (listeners) {
    if (listeners.indexOf(listener) == -1) {
      listeners.push(listener);
    }
  } else {
    this.listenerMap_[type] = [listener];
  }
};


/**
 * Removes an event listener.
 * @param {string} type The event type.
 * @param {function(!Object)} listener The event listener.
 */
FakeEventTarget.prototype.removeEventListener = function(type, listener) {
  var listeners = this.listenerMap_[type];

  if (!listeners) {
    return;
  }

  for (var i = 0; i < listeners.length; i++) {
    if (listener == listeners[i]) {
      listeners.splice(i, 1);
      break;
    }
  }
};


/**
 * Dispatches an event.
 * @param {string} type The event type.
 * @param {Object=} opt_event Optional event object.
 */
FakeEventTarget.prototype.dispatchEvent = function(type, opt_event) {
  var event = opt_event || {};

  var listeners = this.listenerMap_[type];

  if (!listeners) {
    return;
  }

  for (var i = 0; i < listeners.length; i++) {
    listeners[i](event);
  }
};

