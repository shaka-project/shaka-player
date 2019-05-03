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


goog.provide('shaka.ui.Element');

goog.require('shaka.util.EventManager');


/**
 * @implements {shaka.extern.IUIElement}
 * @abstract
 * @export
 */
shaka.ui.Element = class {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    /** @protected {HTMLElement} */
    this.parent = parent;

    /** @protected {shaka.ui.Controls} */
    this.controls = controls;

    /** @protected {shaka.util.EventManager} */
    this.eventManager = new shaka.util.EventManager();

    /** @protected {shaka.ui.Localization} */
    this.localization = this.controls.getLocalization();

    /** @protected {shaka.Player} */
    this.player = this.controls.getPlayer();

    /** @protected {HTMLMediaElement} */
    this.video = this.controls.getVideo();
  }

  /**
   * @override
   * @export
   */
  destroy() {
    this.eventManager.release();

    this.parent = null;
    this.controls = null;
    this.eventManager = null;
    this.localization = null;
    this.player = null;
    this.video = null;

    return Promise.resolve();
  }
};
