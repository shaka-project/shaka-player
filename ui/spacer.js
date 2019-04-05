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


goog.provide('shaka.ui.Spacer');

goog.require('shaka.ui.Element');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.Spacer = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    const div = shaka.util.Dom.createHTMLElement('div');
    div.classList.add('shaka-spacer');
    // Make screen readers ignore the spacer
    div.setAttribute('aria-hidden', true);
    this.parent.appendChild(div);
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.Spacer.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.Spacer(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
  'spacer', new shaka.ui.Spacer.Factory());
