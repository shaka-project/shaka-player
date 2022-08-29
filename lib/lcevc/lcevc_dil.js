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
   * @param {shaka.extern.LcevcConfiguration} dilConfig The LCEVC DIL
   * config object to initialize the LCEVC DIL.
   */
  constructor(media, canvas, dilConfig) {
    /** @private {?LcevcDil.LcevcDIL} */
    this.dil_ = null;

    /** @private {number} */
    this.variantId_ = -1;

    /** @private {HTMLVideoElement} */
    this.media_ = media;

    /** @private {HTMLCanvasElement} */
    this.canvas_ = canvas;

    /** @private {shaka.extern.LcevcConfiguration} */
    this.dilConfig_ = dilConfig;

    this.create_();
  }

  /**
   * Append data to the LCEVC Dil.
   * @param {BufferSource} data
   */
  appendBuffer(data) {
    if (this.dil_) {
      this.dil_.appendBuffer(data, 'video', this.variantId_);
    }
  }

  /**
   * Hide the canvas specifically in the case of a DRM Content
   */
  hideCanvas() {
    if (this.dil_) {
      this.canvas_.classList.add('shaka-hidden');
    }
  }

  /**
   * Create LCEVC Dil.
   * @private
   */
  create_() {
    if (this.isSupported_() && !this.dil_) {
      if (LcevcDil.SupportObject.webGLSupport(this.canvas_)) {
        // Make sure the canvas is not hidden from a previous playback session.
        this.canvas_.classList.remove('shaka-hidden');
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
    if (this.dil_) {
      this.dil_.close();
      this.dil_ = null;
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
      this.canvas_ instanceof HTMLCanvasElement &&
      LcevcDil.SupportObject.SupportStatus;
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
    if (this.dil_) {
      this.variantId_ = track.id;
      this.dil_.setLevelSwitching(track.id, true);
      this.dil_.setContainerFormat(containerFormat);
    }
  }
};

/**
 * Container Formats.
 * @const @enum {number}
 */
shaka.lcevc.Dil.ContainerFormat = {
  MPEG2_TS: 0,
  WEBM: 1,
  MP4: 2,
};
