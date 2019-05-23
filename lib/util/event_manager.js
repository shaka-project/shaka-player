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

goog.require('goog.asserts');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.MultiMap');


/**
 * @summary
 * An EventManager maintains a collection of "event
 * bindings" between event targets and event listeners.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.util.EventManager = class {
  constructor() {
    /**
     * Maps an event type to an array of event bindings.
     * @private {shaka.util.MultiMap.<!shaka.util.EventManager.Binding_>}
     */
    this.bindingMap_ = new shaka.util.MultiMap();
  }


  /**
   * Detaches all event listeners.
   * @override
   */
  release() {
    this.removeAll();
    this.bindingMap_ = null;
  }


  /**
   * Attaches an event listener to an event target.
   * @param {EventTarget} target The event target.
   * @param {string} type The event type.
   * @param {shaka.util.EventManager.ListenerType} listener The event listener.
   */
  listen(target, type, listener) {
    if (!this.bindingMap_) {
      return;
    }

    const binding = new shaka.util.EventManager.Binding_(target, type,
        listener);
    this.bindingMap_.push(type, binding);
  }


  /**
   * Attaches an event listener to an event target.  The listener will be
   * removed when the first instance of the event is fired.
   * @param {EventTarget} target The event target.
   * @param {string} type The event type.
   * @param {shaka.util.EventManager.ListenerType} listener The event listener.
   */
  listenOnce(target, type, listener) {
    // Install a shim listener that will stop listening after the first event.
    const shim = (event) => {
      // Stop listening to this event.
      this.unlisten(target, type, shim);
      // Call the original listener.
      listener(event);
    };
    this.listen(target, type, shim);
  }


  /**
   * Detaches an event listener from an event target.
   * @param {EventTarget} target The event target.
   * @param {string} type The event type.
   * @param {shaka.util.EventManager.ListenerType=} listener The event listener.
   */
  unlisten(target, type, listener) {
    if (!this.bindingMap_) {
      return;
    }

    const list = this.bindingMap_.get(type) || [];

    for (const binding of list) {
      if (binding.target == target) {
        if (listener == binding.listener || !listener) {
          binding.unlisten();
          this.bindingMap_.remove(type, binding);
        }
      }
    }
  }


  /**
   * Detaches all event listeners from all targets.
   */
  removeAll() {
    if (!this.bindingMap_) {
      return;
    }

    const list = this.bindingMap_.getAll();

    for (const binding of list) {
      binding.unlisten();
    }

    this.bindingMap_.clear();
  }
};


/**
 * @typedef {function(!Event)}
 */
shaka.util.EventManager.ListenerType;


/**
 * Creates a new Binding_ and attaches the event listener to the event target.
 *
 * @private
 */
shaka.util.EventManager.Binding_ = class {
  /**
   * @param {EventTarget} target The event target.
   * @param {string} type The event type.
   * @param {shaka.util.EventManager.ListenerType} listener The event listener.
   */
  constructor(target, type, listener) {
    /** @type {EventTarget} */
    this.target = target;

    /** @type {string} */
    this.type = type;

    /** @type {?shaka.util.EventManager.ListenerType} */
    this.listener = listener;

    this.target.addEventListener(type, listener, false);
  }


  /**
   * Detaches the event listener from the event target. This does nothing if
   * the event listener is already detached.
   */
  unlisten() {
    goog.asserts.assert(this.target, 'Missing target');
    this.target.removeEventListener(this.type, this.listener, false);

    this.target = null;
    this.listener = null;
  }
};

