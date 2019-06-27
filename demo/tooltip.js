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


goog.provide('shakaDemo.Tooltips');


/**
 * Creates and contains the MDL elements of a tooltip.
 */
shakaDemo.Tooltips = class {
  /**
   * @param {!Element} labeledElement
   * @param {string} message
   */
  static make(labeledElement, message) {
    tippy(labeledElement, {
      content: message,
      placement: 'bottom',
      arrow: true,
      animation: 'scale',
      size: 'large',
    });
    // TODO: The tooltip should be unreadable by screen readers, and this
    // tooltip info should instead be encoded into the object.
  }
};
