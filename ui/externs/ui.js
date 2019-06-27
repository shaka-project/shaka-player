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


/**
 * @externs
 * @suppress {duplicate} To prevent compiler errors with the namespace
 *   being declared both here and by goog.provide in the library.
 */

/** @namespace */
var shaka = {};

/** @namespace */
shaka.extern = {};


/**
 * @typedef {{
 *   controlPanelElements: !Array.<string>,
 *   overflowMenuButtons: !Array.<string>,
 *   addSeekBar: boolean,
 *   castReceiverAppId: string
 * }}
 *
 * @property {!Array.<string>} controlPanelElements
 *   The ordered list of control panel elements of the UI.
 * @property {!Array.<string>} overflowMenuButtons
 *   The ordered list of the overflow menu buttons.
 * @property {boolean} addSeekBar
 *   Whether or not a seek bar should be part of the UI.
 * @property {string} castReceiverAppId
 *   Receiver app id to use for the Chromecast support.
 * @exportDoc
 */
shaka.extern.UIConfiguration;


/**
 * Interface for UI elements.
 *
 * @extends {shaka.util.IDestroyable}
 * @interface
 * @exportDoc
 */
shaka.extern.IUIElement = class {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    /**
     * @protected {HTMLElement}
     * @exportDoc
     */
    this.parent;

    /**
     * @protected {shaka.ui.Controls}
     * @exportDoc
     */
    this.controls;

    /**
     * @protected {shaka.util.EventManager}
     * @exportDoc
     */
    this.eventManager;

    /**
     * @protected {shaka.ui.Localization}
     * @exportDoc
     */
    this.localization;

    /**
     * @protected {shaka.Player}
     * @exportDoc
     */
    this.player;

    /**
     * @protected {HTMLMediaElement}
     * @exportDoc
     */
    this.video;
  }

  /**
   * @override
   */
  destroy() {}
};


/**
 * A factory for creating a UI element.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.IUIElement.Factory = class {
  /**
   * @param {!HTMLElement} rootElement
   * @param {!shaka.ui.Controls} controls
   * @return {!shaka.extern.IUIElement}
   */
  create(rootElement, controls) {}
};
