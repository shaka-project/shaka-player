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


goog.provide('shaka.test.UiUtils');


shaka.test.UiUtils = class {
  /**
   * Simulates a native event (e.g. 'click') on the given element.
   *
   * @param {EventTarget} target
   * @param {string} name
   */
  static simulateEvent(target, name) {
    const type = {
      'click': 'MouseEvent',
      'dblclick': 'MouseEvent',
    }[name] || 'CustomEvent';

    // Note we can't use the MouseEvent constructor since it isn't supported on
    // IE11.
    const event = document.createEvent(type);
    event.initEvent(name, true, true);
    target.dispatchEvent(event);
  }
};
