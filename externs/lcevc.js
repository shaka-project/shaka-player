/**
* @fileoverview Externs for LcevcDil
* compiler.
*
* @externs
*/
'use strict';

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
     *  @param {Object=} dilConfig
     */
  constructor(media, canvas, dilConfig) {
    /** @type {number} */
    this.aspectRatio;

    /** @type {Boolean} */
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
