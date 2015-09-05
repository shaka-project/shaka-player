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
 * @fileoverview A utility base class which is a non-DOM work-alike for
 * EventTarget.  This simplifies the dispatch of events from custom classes.
 */

goog.provide('shaka.util.FakeEventTarget');

goog.require('shaka.asserts');
goog.require('shaka.util.MultiMap');



/**
 * A work-alike for EventTarget.  Only DOM elements may be true EventTargets,
 * but this can be used as a base class to provide event dispatch to non-DOM
 * classes.
 *
 * @param {shaka.util.FakeEventTarget} parent The parent for the purposes of
 *     event bubbling.  Note that events on a FakeEventTarget can only bubble
 *     to other FakeEventTargets.
 * @struct
 * @constructor
 * @implements {EventTarget}
 * @export
 */
shaka.util.FakeEventTarget = function(parent) {
  /**
   * @private {!shaka.util.MultiMap.<shaka.util.FakeEventTarget.ListenerType>}
   */
  this.listeners_ = new shaka.util.MultiMap();

  /** @protected {shaka.util.FakeEventTarget} */
  this.parent = parent;
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
 *     listener object to invoke.
 * @param {boolean=} opt_capturing True to listen during the capturing phase,
 *     false to listen during the bubbling phase.  Note that FakeEventTarget
 *     does not support the capturing phase from the standard event model.
 * @override
 */
shaka.util.FakeEventTarget.prototype.addEventListener =
    function(type, listener, opt_capturing) {
  // We don't support the capturing phase.
  shaka.asserts.assert(!opt_capturing);
  if (!opt_capturing) {
    this.listeners_.push(type, listener);
  }
};


/**
 * Remove an event listener from this object.
 *
 * @param {string} type The event type for which you wish to remove a listener.
 * @param {shaka.util.FakeEventTarget.ListenerType} listener The callback or
 *     listener object to remove.
 * @param {boolean=} opt_capturing True to remove a listener for the capturing
 *     phase, false to remove a listener for the bubbling phase.  Note that
 *     FakeEventTarget does not support the capturing phase from the standard
 *     event model.
 * @override
 */
shaka.util.FakeEventTarget.prototype.removeEventListener =
    function(type, listener, opt_capturing) {
  // We don't support the capturing phase.
  shaka.asserts.assert(!opt_capturing);
  if (!opt_capturing) {
    this.listeners_.remove(type, listener);
  }
};


/**
 * Dispatch an event from this object.
 *
 * @param {!Event} event The event to be dispatched from this object.
 * @return {boolean} True if the default action was prevented.
 * @override
 */
shaka.util.FakeEventTarget.prototype.dispatchEvent = function(event) {
  // Overwrite the Event's properties.  Assignment doesn't work in most
  // browsers.  Object.defineProperties seems to work, although some browsers
  // need the original properties deleted first.
  delete event.srcElement;
  delete event.target;
  delete event.currentTarget;
  Object.defineProperties(event, {
    'srcElement': { 'value': null, 'writable': true },
    // target may be set many times if an event is re-dispatched.
    'target': { 'value': this, 'writable': true },
    // currentTarget will be set many times by recursiveDispatch_().
    'currentTarget': { 'value': null, 'writable': true }
  });

  return this.recursiveDispatch_(event);
};


/**
 * Dispatches an event recursively without changing its original target.
 *
 * @param {!Event} event
 * @return {boolean} True if the default action was prevented.
 * @private
 */
shaka.util.FakeEventTarget.prototype.recursiveDispatch_ = function(event) {
  event.currentTarget = this;

  var list = this.listeners_.get(event.type) || [];

  for (var i = 0; i < list.length; ++i) {
    var listener = list[i];
    try {
      if (listener.handleEvent) {
        listener.handleEvent(event);
      } else {
        listener.call(this, event);
      }
      // NOTE: If needed, stopImmediatePropagation() would be checked here.
    } catch (exception) {
      // Exceptions during event handlers should not affect the caller,
      // but should appear on the console as uncaught, according to MDN:
      // http://goo.gl/N6Ff27
      shaka.log.error('Uncaught exception in event handler', exception);
    }
  }

  // NOTE: If needed, stopPropagation() would be checked here.
  if (this.parent && event.bubbles) {
    this.parent.recursiveDispatch_(event);
  }

  return event.defaultPrevented;
};

