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
 *   base: string,
 *   buffered: string,
 *   played: string
 * }}
 *
 * @property {string} base
 *   The CSS background color applied to the base of the seek bar, on top of
 *   which the buffer level and playback position are shown.
 * @property {string} buffered
 *   The CSS background color applied to the portion of the seek bar showing
 *   what has been buffered ahead of the playback position.
 * @property {string} played
 *   The CSS background color applied to the portion of the seek bar showing
 *   what has been played already.
 */
shaka.extern.UISeekBarColors;

/**
 * @typedef {{
 *   base: string,
 *   level: string
 * }}
 *
 * @property {string} base
 *   The CSS background color applied to the base of the volume bar, on top of
 *   which the volume level is shown.
 * @property {string} level
 *   The CSS background color applied to the portion of the volume bar showing
 *   the volume level.
 */
shaka.extern.UIVolumeBarColors;

/**
 * @typedef {{
 *   controlPanelElements: !Array.<string>,
 *   overflowMenuButtons: !Array.<string>,
 *   addSeekBar: boolean,
 *   addBigPlayButton: boolean,
 *   castReceiverAppId: string,
 *   clearBufferOnQualityChange: boolean,
 *   seekBarColors: shaka.extern.UISeekBarColors,
 *   volumeBarColors: shaka.extern.UIVolumeBarColors
 * }}
 *
 * @property {!Array.<string>} controlPanelElements
 *   The ordered list of control panel elements of the UI.
 * @property {!Array.<string>} overflowMenuButtons
 *   The ordered list of the overflow menu buttons.
 * @property {boolean} addSeekBar
 *   Whether or not a seek bar should be part of the UI.
 * @property {boolean} addBigPlayButton
 *   Whether or not a big play button in the center of the video
 *   should be part of the UI.
 * @property {string} castReceiverAppId
 *   Receiver app id to use for the Chromecast support.
 * @property {boolean} clearBufferOnQualityChange
 *   Only applicable if the resolution selection is part of the UI.
 *   Whether buffer should be cleared when changing resolution
 *   via UI. Clearing buffer would result in immidiate change of quality,
 *   but playback may flicker/stall for a sec as the content in new
 *   resolution is being buffered. Not clearing the buffer will mean
 *   we play the content in the previously selected resolution that we
 *   already have buffered before switching to the new resolution.
 * @property {shaka.extern.UISeekBarColors} seekBarColors
 *   The CSS colors applied to the seek bar.  This allows you to override the
 *   colors used in the linear gradient constructed in JavaScript, since you
 *   cannot easily do this in pure CSS.
 * @property {shaka.extern.UIVolumeBarColors} volumeBarColors
 *   The CSS colors applied to the volume bar.  This allows you to override the
 *   colors used in the linear gradient constructed in JavaScript, since you
 *   cannot do this in pure CSS.
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
