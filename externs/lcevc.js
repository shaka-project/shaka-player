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
     *  @param {HTMLCanvasElement} canvas
     *  @param {LcevcDil.LcevcDilConfig} dilConfig
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
   * SourceBuffer. Here the lcevc data will be extracted and managed in line
   * with ranges given by the SourceBuffer.buffered() call result
   *
   * @param {!BufferSource} data fMP4 fragment.
   * @param {string} type Type of the fragment.
   * @param {number} level Level (Variant) that the fragment belongs to.
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
   * @param {!number} autoBufferSwitch decides when the variants
   * need to be switched based on type of mode.
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

/**
 * @typedef {{
 *   logLevel: number,
 *   dps: boolean,
 *   logo: boolean,
 * }}
 *
 * @description LCEVC DIL Custom Config that can be passed
 * through the constructor.
 * @property {!number} logLevel for LCEVC DIl Logs. Defaults to 0.
 * @property {!boolean} dps or dynamic performance scaling. When true,
 * dps is triggered when the system is not able to decode frames within a
 * specific tolerance of the fps of the video and disables LCEVC decoding
 * for some time. The base video will be shown upscaled to target resolution.
 * If it is triggered again within a short period of time, the disabled
 * time will be higher and if it is triggered three times in a row the LCEVC
 * decoding will be disabled for that playback session.
 * If dps is false, LCEVC decode will be forced and will drop frames
 * appropriately if performance is sub optimal. Defaults to true.
 * @property {!boolean} logo is placed on the top right hand corner
 * which only appears when the LCEVC enahanced Frames are being rendered.
 * Defaults to true for the lib but is forced to false in this integration
 * unless explicitly set to true through config.
 */
LcevcDil.LcevcDilConfig;
