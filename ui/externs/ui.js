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
 *   showUnbufferedStart: boolean,
 *   seekBarColors: shaka.extern.UISeekBarColors,
 *   volumeBarColors: shaka.extern.UIVolumeBarColors,
 *   trackLabelFormat: shaka.ui.TrackLabelFormat,
 *   fadeDelay: number,
 *   doubleClickForFullscreen: boolean,
 *   enableKeyboardPlaybackControls: boolean,
 *   enableFullscreenOnRotation: boolean
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
 *   and Shaka Player v2.6+.
 *   <br>
 *   A value of true matches the default behavior of Shaka Player v2.5.
 *   <br>
 *   Defaults to true in v2.5.  Will default to false in v2.6+.
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
 *   LANGUAGE_ROLE means both are shown, or just language if there is no role.
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
     * @protected {shaka.Player|shaka.extern.Player}
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

/**
 * @struct
 * @implements {shaka.util.IDestroyable}
 * @extends {shaka.util.FakeEventTarget}
 *
 */
shaka.extern.Player = class {
/**
 * Get the range of time (in seconds) that seeking is allowed. If the player has
 * not loaded content, this will return a range from 0 to 0.
 * @param {boolean=} real
 * @return {{start: number, end: number}}
 *
 */
seekRange(real) {}
/**
 * Get if the player is playing live content. If the player has not loaded
 * content, this will return |false|.
 *
 * @return {boolean}
 *
 */
isLive() {}
/**
 * Check if the player is currently in a buffering state (has too little content
 * to play smoothly). If the player has not loaded content, this will return
 * |false|.
 *
 * @return {boolean}
 *
 */
isBuffering() {}
/**
 * Cancel trick-play. If the player has not loaded content or is still loading
 * content this will be a no-op.
 *
 *
 */
cancelTrickPlay() {}
/**
 * After destruction, a Player object cannot be used again.
 *
 * @override
 *
 */
destroy() {}

/**
 * Tell the player to load the content at |assetUri| and start playback at
 * |startTime|. Before calling |load|, a call to |attach| must have succeeded.
 *
 * Calls to |load| will interrupt any in-progress calls to |load| but cannot
 * interrupt calls to |attach|, |detach|, or |unload|.
 *
 * @param {string} assetUri
 * @param {?number=} startTime
 *    When |startTime| is |null| or |undefined|, playback will start at the
 *    default start time (startTime=0 for VOD and startTime=liveEdge for LIVE).
 * @param {string|shaka.extern.ManifestParser.Factory=} mimeType
 * @return {!Promise}
 *
 */
load(assetUri, startTime, mimeType) {}
/**
 * Return a copy of the current configuration.  Modifications of the returned
 * value will not affect the Player's active configuration.  You must call
 * player.configure() to make changes.
 *
 * @return {shaka.extern.PlayerConfiguration}
 */
getConfiguration() {}
/**
 * Get the current playhead position as a date. This should only be called when
 * the player has loaded a live stream. If the player has not loaded a live
 * stream, this will return |null|.
 *
 * @return {Date}
 */
getPlayheadTimeAsDate() {}
/**
 * Check if the text displayer is enabled.
 *
 * @return {boolean}
 */
isTextTrackVisible() {}
/**
 * Enable or disable the text displayer.  If the player is in an unloaded state,
 * the request will be applied next time content is loaded.
 *
 * @param {boolean} isVisible
 * @return {!Promise}
 */
setTextTrackVisibility(isVisible) {}
/**
 * Return a list of variant tracks that can be switched to in the current
 * period. If there are multiple periods, you must seek to the period in order
 * to get variants from that period.
 *
 * If the player has not loaded content, this will return an empty list.
 *
 * @return {!Array.<shaka.extern.Track>}
 */
getVariantTracks() {}
/**
 * Check if the manifest contains only audio-only content. If the player has not
 * loaded content, this will return |false|.
 *
 * The player does not support content that contain more than one type of
 * variants (i.e. mixing audio-only, video-only, audio-video). Content will be
 * filtered to only contain one type of variant.
 *
 * @return {boolean}
 */
isAudioOnly() {}
/**
 * Return a list of text tracks that can be switched to in the current period.
 * If there are multiple periods, you must seek to a period in order to get
 * text tracks from that period.
 *
 * If the player has not loaded content, this will return an empty list.
 *
 * @export
 */
getTextTracks() {}
/**
 * Add an event listener to this object.
 *
 * @param {string} type The event type to listen for.
 * @param {shaka.util.FakeEventTarget.ListenerType} listener The callback or
 *   listener object to invoke.
 * @param {(!AddEventListenerOptions|boolean)=} options Ignored.
 * @override
 */
addEventListener(type, listener, options) {}
/**
 * Remove an event listener from this object.
 *
 * @param {string} type The event type for which you wish to remove a listener.
 * @param {shaka.util.FakeEventTarget.ListenerType} listener The callback or
 *   listener object to remove.
 * @param {(EventListenerOptions|boolean)=} options Ignored.
 * @override
 */
removeEventListener(type, listener, options) {}
/**
 * Dispatch an event from this object.
 *
 * @param {!Event} event The event to be dispatched from this object.
 * @return {boolean} True if the default action was prevented.
 * @override
 */
dispatchEvent(event) {}
};
