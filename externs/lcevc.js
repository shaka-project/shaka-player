/**
* @fileoverview Externs for LcevcDil
* compiler.
*
* @externs
*/

var libDPIModule = {};
var LcevcDil = {};

/**
* LCEVC DIL constructor
* @constructor
*/
LcevcDil.LcevcDIL = class {
  /**
     *  @param {HTMLVideoElement} media
     *  @param {HTMLCanvasElement} canvas
     *  @param {Object} dilConfig
     */
  constructor(media, canvas, dilConfig) {
    /** @type {number} */
    this.aspectRatio;

    /** @type {boolean} */
    this.isFullscreen;
  }

  /**
   * Append the fMP4 fragments
   * after they are appended to Media Source Extensions
   * SourceBuffer. Here the lcevc data will be extracted and manged in line with
   * the ranges given by the SourceBuffer.buffered() call result
   *
   * @param {!BufferSource} data fMP4 fragment.
   * @param {string} type The type of the fragment.
   * @param {!number} level The level of the fragment.
   */
  appendBuffer(data, type, level) {}

  /**
   * Set current variant as level to the LCEVC decoder
   * @param {!number} level The variant of the fragment.
   */
  setCurrentLevel(level) {}

  /**
   * Set current variant as level to the LCEVC decoder
   * @param {!number} level
   * @param {!number} autoBufferSwitch
   */
  setLevelSwitching(level, autoBufferSwitch) {}

  /**
   * Set container Format for LCEVC Data.
   * @param {!number} containerFormat if enhancement data travels in container
   */
  setContainerFormat(containerFormat) {}

  /**
   * Close the DIL
   */
  close() {}
};

/**
* LCEVC Support Check
*/
LcevcDil.SupportObject = {

  /**
   * Check if canvas has WebGL support
   *  @param {HTMLCanvasElement} canvas
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

/**
 * @typedef {{
 *   logLevel: number,
 *   dps: boolean,
 *   logo: boolean,
 * }}
 *
 * @description LCEVC DIL Custom Config that can be passed
 * through the constructor.
 * @property {number} logLevel // LogLevel for LCEVC DIl Logs. Defaults to 0.
 * @property {boolean} dps // The dynamic performance scaling
 * or DPS checks and disable LCEVC for some time.
 * If it is triggered again in a short period of time, the disabled
 * time will be higher and if it is done in three times in a row the LCEVC
 * Dil will always be disabled for that playback session. Defaults to true.
 * @property {boolean} logo // LCCEVC Logo placed on the top right hand corner
 * which only appears when the LCEVC enahanced Frames are being rendered.
 * Defaults to true for the lib but is forced to false in this integration
 * unless explicitly set to true through config.
 */
LcevcDil.LcevcDilConfig;
