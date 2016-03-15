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

goog.provide('shaka.util.EventManager');

goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.MultiMap');



/**
 * Creates a new EventManager. An EventManager maintains a collection of "event
 * bindings" between event targets and event listeners.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.util.EventManager = function() {
  /**
   * Maps an event type to an array of event bindings.
   * @private {shaka.util.MultiMap.<!shaka.util.EventManager.Binding_>}
   */
  this.bindingMap_ = new shaka.util.MultiMap();
};


/**
 * @typedef {function(!Event)}
 */
shaka.util.EventManager.ListenerType;


/**
 * Detaches all event listeners.
 * @override
 */
shaka.util.EventManager.prototype.destroy = function() {
  this.removeAll();
  this.bindingMap_ = null;
  return Promise.resolve();
};


/**
 * Attaches an event listener to an event target.
 * @param {EventTarget} target The event target.
 * @param {string} type The event type.
 * @param {shaka.util.EventManager.ListenerType} listener The event listener.
 */
shaka.util.EventManager.prototype.listen = function(target, type, listener) {
  var binding = new shaka.util.EventManager.Binding_(target, type, listener);
  this.bindingMap_.push(type, binding);
};


/**
 * Detaches an event listener from an event target.
 * @param {EventTarget} target The event target.
 * @param {string} type The event type.
 */
shaka.util.EventManager.prototype.unlisten = function(target, type) {
  var list = this.bindingMap_.get(type) || [];

  for (var i = 0; i < list.length; ++i) {
    var binding = list[i];

    if (binding.target == target) {
      binding.unlisten();
      this.bindingMap_.remove(type, binding);
    }
  }
};


/**
 * Detaches all event listeners from all targets.
 */
shaka.util.EventManager.prototype.removeAll = function() {
  var list = this.bindingMap_.getAll();

  for (var i = 0; i < list.length; ++i) {
    list[i].unlisten();
  }

  this.bindingMap_.clear();
};



/**
 * Creates a new Binding_ and attaches the event listener to the event target.
 * @param {EventTarget} target The event target.
 * @param {string} type The event type.
 * @param {shaka.util.EventManager.ListenerType} listener The event listener.
 * @constructor
 * @private
 */
shaka.util.EventManager.Binding_ = function(target, type, listener) {
  /** @type {EventTarget} */
  this.target = target;

  /** @type {string} */
  this.type = type;

  /** @type {?shaka.util.EventManager.ListenerType} */
  this.listener = listener;

  this.target.addEventListener(type, listener, false);
};


/**
 * Detaches the event listener from the event target. This does nothing if the
 * event listener is already detached.
 */
shaka.util.EventManager.Binding_.prototype.unlisten = function() {
  if (!this.target)
    return;

  this.target.removeEventListener(this.type, this.listener, false);

  this.target = null;
  this.listener = null;
};

