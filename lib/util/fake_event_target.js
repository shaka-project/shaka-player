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

goog.provide('shaka.util.FakeEventTarget');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.MultiMap');



/**
 * A work-alike for EventTarget.  Only DOM elements may be true EventTargets,
 * but this can be used as a base class to provide event dispatch to non-DOM
 * classes.  Only FakeEvents should be dispatched.
 *
 * @struct
 * @constructor
 * @implements {EventTarget}
 */
shaka.util.FakeEventTarget = function() {
  /**
   * @private {!shaka.util.MultiMap.<shaka.util.FakeEventTarget.ListenerType>}
   */
  this.listeners_ = new shaka.util.MultiMap();

  /**
   * The target of all dispatched events.  Defaults to |this|.
   * @type {EventTarget}
   */
  this.dispatchTarget = this;
};


/**
 * These are the listener types defined in the closure extern for EventTarget.
 * @typedef {EventListener|function(!Event):(boolean|undefined)}
 */
shaka.util.FakeEventTarget.ListenerType;


/**
 * Add an event listener to this object.
 *
 * @param {string} type The event type to listen for.
 * @param {shaka.util.FakeEventTarget.ListenerType} listener The callback or
 *   listener object to invoke.
 * @param {boolean=} opt_capturing Ignored.  FakeEventTargets do not have
 *   parents, so events neither capture nor bubble.
 * @override
 */
shaka.util.FakeEventTarget.prototype.addEventListener =
    function(type, listener, opt_capturing) {
  this.listeners_.push(type, listener);
};


/**
 * Remove an event listener from this object.
 *
 * @param {string} type The event type for which you wish to remove a listener.
 * @param {shaka.util.FakeEventTarget.ListenerType} listener The callback or
 *   listener object to remove.
 * @param {boolean=} opt_capturing Ignored.  FakeEventTargets do not have
 *   parents, so events neither capture nor bubble.
 * @override
 */
shaka.util.FakeEventTarget.prototype.removeEventListener =
    function(type, listener, opt_capturing) {
  this.listeners_.remove(type, listener);
};


/**
 * Dispatch an event from this object.
 *
 * @param {!Event} event The event to be dispatched from this object.
 * @return {boolean} True if the default action was prevented.
 * @override
 */
shaka.util.FakeEventTarget.prototype.dispatchEvent = function(event) {
  // In many browsers, it is complex to overwrite properties of actual Events.
  // Here we expect only to dispatch FakeEvents, which are simpler.
  goog.asserts.assert(event instanceof shaka.util.FakeEvent,
                      'FakeEventTarget can only dispatch FakeEvents!');

  var list = this.listeners_.get(event.type) || [];

  for (var i = 0; i < list.length; ++i) {
    // Do this every time, since events can be re-dispatched from handlers.
    event.target = this.dispatchTarget;
    event.currentTarget = this.dispatchTarget;

    var listener = list[i];
    try {
      if (listener.handleEvent) {
        listener.handleEvent(event);
      } else {
        listener.call(this, event);
      }
    } catch (exception) {
      // Exceptions during event handlers should not affect the caller,
      // but should appear on the console as uncaught, according to MDN:
      // http://goo.gl/N6Ff27
      shaka.log.error('Uncaught exception in event handler', exception);
    }

    if (event.stopped) {
      break;
    }
  }

  return event.defaultPrevented;
};
