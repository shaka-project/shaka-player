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


goog.provide('shakaDemo.CloseButton');


/**
 * A custom UI button, to allow users to close the video element.
 * This cannot actually extend shaka.ui.Element, as that class does not exist
 * at load-time when in uncompiled mode.
 * @extends {shaka.ui.Element}
 */
shakaDemo.CloseButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);
    this.button_ = document.createElement('button');
    this.button_.classList.add('material-icons-round');
    this.button_.classList.add('close-button');
    this.button_.textContent = 'close'; // Close icon.
    this.parent.appendChild(this.button_);

    this.button_.addEventListener('click', () => {
      shakaDemoMain.unload();
    });

    // TODO: Make sure that the screenreader description of this control is
    // localized!
  }

  /** @override */
  destroy() {
    return Promise.resolve();
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shakaDemo.CloseButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shakaDemo.CloseButton(rootElement, controls);
  }
};

// This button is registered inside setup in shakaDemo.Main, rather than
// statically here, since shaka.ui.Controls does not exist in this stage of the
// load process.
