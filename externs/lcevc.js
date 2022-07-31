/**
* @fileoverview Externs for LcevcDil
* compiler.
*
* @externs
*/

// This empty namespace is declared to check if LcevcDil libraries are loaded.
var libDPIModule = {};
var LcevcDil = {};

/**
* LCEVC DIL constructor
* @constructor
*/
LcevcDil.LcevcDIL = class {
  /**
     *  @param {HTMLVideoElement} media
     *  @param {Element} canvas
     *  @param {shaka.extern.LcevcConfiguration} dilConfig
     */
  constructor(media, canvas, dilConfig) {
  }

  /**
   * Append the video buffers before they are appended to
   * Media Source Extensions SourceBuffer. Here the lcevc data
   * will be parsed and managed to enahnce frames based on timestamps.
   *
   * @param {!BufferSource} data Video Buffer Data.
   * @param {string} type Type of Video Buffer Data.
   * @param {number} variantId Variant that the fragment belongs to.
   */
  appendBuffer(data, type, variantId) {}

  /**
   * Set current variant as variantId to the LCEVC decoder
   * @param {!number} variantId
   * @param {!boolean} autoBufferSwitch is lcevcDil mode that switches variant
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
   * Close LCEVC DIL
   */
  close() {}
};

/**
 * LCEVC Support Check
 */
LcevcDil.SupportObject = {

  /**
   * Check if canvas has WebGL support
   * @param {Element} canvas
   * @return {boolean} true if requirements are met.
   */
  webGLSupport(canvas) {},

};

/**
 * LCEVC Support Checklist Result
 * @type {boolean}
 */
LcevcDil.SupportObject.SupportStatus;

/**
 * LCEVC Support CheckList Error if any.
 * @type {string}
 */
LcevcDil.SupportObject.SupportError;
