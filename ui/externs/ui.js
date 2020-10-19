/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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
 *   played: string,
 *   adBreaks: string
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
 * @property {string} adBreaks
 *   The CSS background color applied to the portion of the seek bar showing
 *   when the ad breaks are scheduled to occur on the timeline.
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
 *   showUnbufferedStart: boolean,
 *   seekBarColors: shaka.extern.UISeekBarColors,
 *   volumeBarColors: shaka.extern.UIVolumeBarColors,
 *   trackLabelFormat: shaka.ui.TrackLabelFormat,
 *   fadeDelay: number,
 *   doubleClickForFullscreen: boolean,
 *   enableKeyboardPlaybackControls: boolean,
 *   enableFullscreenOnRotation: boolean,
 *   forceLandscapeOnFullscreen: boolean
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
 * @property {boolean} showUnbufferedStart
 *   If true, color any unbuffered region at the start of the seek bar as
 *   unbuffered (using the "base" color).  If false, color any unbuffered region
 *   at the start of the seek bar as played (using the "played" color).
 *   <br>
 *   A value of false matches the default behavior of Chrome's native controls
 *   and Shaka Player v3.0+.
 *   <br>
 *   A value of true matches the default behavior of Shaka Player v2.5.
 *   <br>
 *   Defaults to false.
 * @property {shaka.extern.UISeekBarColors} seekBarColors
 *   The CSS colors applied to the seek bar.  This allows you to override the
 *   colors used in the linear gradient constructed in JavaScript, since you
 *   cannot easily do this in pure CSS.
 * @property {shaka.extern.UIVolumeBarColors} volumeBarColors
 *   The CSS colors applied to the volume bar.  This allows you to override the
 *   colors used in the linear gradient constructed in JavaScript, since you
 *   cannot do this in pure CSS.
 * @property {shaka.ui.TrackLabelFormat} trackLabelFormat
 *   An enum that determines what is shown in the labels for text track and
 *   audio variant selection.
 *   LANGUAGE means that only the language of the item is shown.
 *   ROLE means that only the role of the item is shown.
 *   LANGUAGE_ROLE means both language and role are shown, or just language if
 *   there is no role.
 *   LABEL means the non-standard DASH "label" attribute or the HLS "NAME"
 *   attribute are shown.
 *   Defaults to LANGUAGE.
 * @property {number} fadeDelay
 *   The delay (in seconds) before fading out the controls once the user stops
 *   interacting with them.  We recommend setting this to 3 on your cast
 *   receiver UI.
 *   Defaults to 0.
 * @property {boolean} doubleClickForFullscreen
 *   Whether or not double-clicking on the UI should cause it to enter
 *   fullscreen.
 *   Defaults to true.
 * @property {boolean} enableKeyboardPlaybackControls
 *   Whether or not playback controls via keyboard is enabled, such as seek
 *   forward, seek backward, jump to the beginning/end of the video.
 *   Defaults to true.
 * @property {boolean} enableFullscreenOnRotation
 *   Whether or not to enter/exit fullscreen mode when the screen is rotated.
 *   Defaults to true.
 * @property {boolean} forceLandscapeOnFullscreen
 *   Whether or not the device should rotate to landscape mode when the video
 *   enters fullscreen.  Note that this behavior is based on an experimental
 *   browser API, and may not work on all platforms.
 *   Defaults to true.
 */
shaka.extern.UIConfiguration;


/**
 * Interface for UI elements.  UI elements should inherit from the concrete base
 * class shaka.ui.Element.  The members defined in this extern's constructor are
 * all available from the base class, and are defined here to keep the compiler
 * from renaming them.
 *
 * @extends {shaka.util.IReleasable}
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

    /**
     * @protected {shaka.extern.IAdManager}
     * @exportDoc
     */
    this.adManager;

    /**
     * @protected {shaka.extern.IAd}
     * @exportDoc
     */
    this.ad;
  }

  /**
   * @override
   */
  release() {}
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
