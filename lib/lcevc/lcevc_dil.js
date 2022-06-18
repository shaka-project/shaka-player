/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.lcevc.Dil');
goog.require('shaka.log');
goog.require('shaka.util.IReleasable');

/**
 * @summary
 *  lcevcDil - (MPEG-5 Part 2 LCEVC - Decoder Integration Layer) provides
 *  all the operations related to the enhancement and rendering
 *  of LCEVC enabled streams and on to a canvas.
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.lcevc.Dil = class {
  /**
   * @param {HTMLVideoElement} media The video element that will be attached to
   * LCEVC Dil for input.
   * @param {HTMLCanvasElement} canvas The canvas element that will be attached
   * to LCEVC Dil to render the enhanced frames.
   * @param {LcevcDil.LcevcDilConfig} dilConfig The LCEVC DIL
   * config object to initialize the LCEVC DIL.
   */
  constructor(media, canvas, dilConfig) {
    /** @private {?LcevcDil.LcevcDIL} */
    this.dil_ = null;

    /** @private {?Element} */
    this.parent_ = null;

    /** @private {?HTMLElement} */
    this.lcevcContainer_ = null;

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;

    /** @private {number} */
    this.level_ = -1;

    /** @private {shaka.lcevc.Dil.ContainerFormat} */
    this.containerFormat_ = shaka.lcevc.Dil.ContainerFormat.MPEG2_TS;

    /** @private {HTMLVideoElement} */
    this.media_ = media;

    /** @private {Element} */
    this.canvas_ = canvas;

    /** @private {LcevcDil.LcevcDilConfig} */
    this.dilConfig_ = dilConfig;

    this.createDil_();
  }

  /**
   * Append data to the LCEVC Dil.
   * @param {BufferSource} data
   */
  appendBuffer(data) {
    if (this.dil_) {
      this.dil_.appendBuffer(data, 'video', this.level_);
    }
  }

  /**
   * Hide the canvas and show original video element
   */
  hideCanvas() {
    if (this.dil_) {
      this.media_.classList.remove('shaka-hidden');
      this.canvas_.classList.add('shaka-hidden');
    }
  }

  /**
   * Create LCEVC Dil.
   * @private
   */
  createDil_() {
    if (this.isSupported_() && !this.dil_) {
      if (!this.canvas_) {
        this.getCanvas_();
      }
      if (LcevcDil.SupportObject.webGLSupport(this.canvas_)) {
        this.dil_ = new LcevcDil.LcevcDil(
            this.media_,
            this.canvas_,
            this.dilConfig_);
      }
    }
  }

  /**
   * Close LCEVC Dil.
   * @override
   * @export
   */
  release() {
    this.hideCanvas();
    if (this.dil_) {
      this.dil_.close();
      this.dil_ = null;
    }
    if (this.lcevcContainer_) {
      this.lcevcContainer_.remove();
    }
    if (this.resizeObserver_) {
      this.resizeObserver_.disconnect();
      this.resizeObserver_ = null;
    }
  }

  /**
   * Check if the LCEVC Dil lib is present and is supported by the browser.
   * @return {boolean}
   * @private
   */
  isSupported_() {
    if (typeof libDPIModule === 'undefined') {
      shaka.log.alwaysWarn(
          'Could not Find LCEVC Library dependencies on this page');
    }

    if (typeof LcevcDil === 'undefined') {
      shaka.log.alwaysWarn('Could not Find LCEVC Library on this page');
    } else {
      if (!LcevcDil.SupportObject.SupportStatus) {
        shaka.log.alwaysWarn(LcevcDil.SupportObject.SupportError);
      }
    }

    return typeof LcevcDil !== 'undefined' &&
      typeof libDPIModule !== 'undefined' &&
      LcevcDil.SupportObject.SupportStatus;
  }

  /**
   * Get canvas for LCEVC Dil to render if not exists.
   * @private
   */
  getCanvas_() {
    this.canvas_ = document.getElementsByClassName('shaka-canvas-container')[0];
    if (LcevcDil.SupportObject.webGLSupport(this.canvas_)) {
      if (this.canvas_) {
        this.canvas_.classList.remove('shaka-hidden');
      }
    }
  }

  /**
   * Updates LCEVC DIL with the index of the variant that is being downloaded.
   * @param {number} level Index of currently active variant.
   * @param {shaka.lcevc.Dil.ContainerFormat} containerFormat Container
   * Format of the stream.
   * @private
   */
  updateLevel_(level, containerFormat) {
    if (this.dil_) {
      this.level_ = level;
      this.containerFormat_ = containerFormat;
      this.dil_.setLevelSwitching(level,
          shaka.lcevc.Dil.AutoBuffer.BUFFER_PLAYOUT);
      this.dil_.setContainerFormat(containerFormat);
    }
  }

  /**
   * Update current active variant
   * @param {shaka.extern.Track} track
   */
  updateVariant(track) {
    let containerFormat = shaka.lcevc.Dil.ContainerFormat.MPEG2_TS;
    switch (track.mimeType) {
      case 'video/webm': {
        containerFormat = shaka.lcevc.Dil.ContainerFormat.WEBM;
        break;
      }
      case 'video/mp4': {
        containerFormat = shaka.lcevc.Dil.ContainerFormat.MP4;
        break;
      }
    }
    this.updateLevel_(track.id, containerFormat);
  }
};

/**
 * Container Formats.
 * @const @enum {number}
 */
shaka.lcevc.Dil.ContainerFormat = {
  MPEG2_TS: 0,
  MP4: 2,
  WEBM: 1,
};

/**
 * AutoBuffer - BUFFER_PLAYOUT is lcevcDil mode that switches
 * variant when the downloaded buffer has finished playing and
 * buffers from the new variant starts to play.
 * @const @enum {number}
 */
shaka.lcevc.Dil.AutoBuffer = {
  BUFFER_PLAYOUT: 1,
};
