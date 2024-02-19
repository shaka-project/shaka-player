/*! @license
 * Shaka Player
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
* @fileoverview Externs for LcevcDec
* compiler.
*
* @externs
*/

// This empty namespace is declared to check if LcevcDec libraries are loaded.
/** @const */
var libDPIModule = {};
/** @const */
var LCEVCdec = {};

/**
* LCEVC Dec constructor
* @constructor
*/
LCEVCdec.LCEVCdec = class {
  /**
   * @param {HTMLVideoElement} media
   * @param {HTMLCanvasElement} canvas
   * @param {shaka.extern.LcevcConfiguration} lcevcConfig
   */
  constructor(media, canvas, lcevcConfig) {
  }

  /**
   * Append the video buffers before they are appended to
   * Media Source Extensions SourceBuffer. Here the lcevc data
   * will be parsed and managed to enhance frames based on timestamps.
   *
   * @param {!BufferSource} data Video Buffer Data.
   * @param {string} type Type of Video Buffer Data.
   * @param {number} variantId Variant that the fragment belongs to.
   * @param {number} timestampOffset Timestamp offset for appended segments
   */
  appendBuffer(data, type, variantId, timestampOffset) {}

  /**
   * Set current variant as variantId to the LCEVC decoder
   * @param {!number} variantId
   * @param {!boolean} autoBufferSwitch is lcevcDec mode that switches variant
   * when the downloaded buffer from last variant has finished playing and
   * buffers from the new variant starts to play.
   */
  setLevelSwitching(variantId, autoBufferSwitch) {}

  /**
   * Set container Format for LCEVC Data Parsing.
   * @param {!number} containerFormat container type of the stream.
   */
  setContainerFormat(containerFormat) {}

  /**
   * Set streaming Format for LCEVC Data Parsing.
   * @param {!number} streamingFormat container type of the stream.
   */
  setStreamingFormat(streamingFormat) {}

  /**
   * Close LCEVC DEC
   */
  close() {}

  /**
   * Returns a boolean indicating if LCEVCdec supports fullscreen
   * for the provided element in webkit (iOS) browsers.
   * @param {HTMLDivElement} fullScreenElement element to be checked
   * @return {boolean} true if fullscreen is supported
   */
  webkitSupportsFullscreen(fullScreenElement) {}

  /**
   * Enter fullscreen on a webkit (iOS) browser for a div tag.
   * @param {HTMLDivElement} fullScreenElement element to display in fullscreen
   */
  webkitEnterFullscreen(fullScreenElement) {}

  /**
   * Exit fullscreen on a webkit (iOS) browser for a div tag.
   * @param {HTMLDivElement} fullScreenElement exit fullscreen for this element
   */
  webkitExitFullscreen(fullScreenElement) {}

  /**
   * Returns a boolean indicating if LCEVCdec is currently displaying
   * in fullscreen on webkit (iOS) browsers.
   * @return {boolean} true if currently displaying in fullscreen
   */
  webkitDisplayingFullscreen() {}

  /**
   * Returns a boolean indicating if LCEVCdec will handle device rotation
   * events on webkit (iOS) browsers for entering and exiting fullscreen.
   * @return {boolean} true if LCEVCdec will handle device rotation events
   */
  webkitHandlesOnRotationEvents() {}
};

/**
 * The older module interface, for backward compatibility.
 * Typed to the same interface, but under a different name.
 * @type {typeof LCEVCdec.LCEVCdec}
 */
LCEVCdec.LcevcDil;

/**
 * LCEVC Support Check
 */
LCEVCdec.SupportObject = {

  /**
   * Check if canvas has WebGL support
   * @param {HTMLCanvasElement} canvas
   * @return {boolean} true if requirements are met.
   */
  webGLSupport(canvas) {},

};

/**
 * LCEVC Support Checklist Result
 * @type {boolean}
 */
LCEVCdec.SupportObject.SupportStatus;

/**
 * LCEVC Support CheckList Error if any.
 * @type {string}
 */
LCEVCdec.SupportObject.SupportError;

/**
 * Typedef for the module interface.  Both LCEVCdec (new module) and LcevcDil
 * (old module) implement roughly the same interface.
 *
 * @typedef {typeof LCEVCdec}
 */
var LCEVCmodule;
