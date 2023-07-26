/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.lcevc.Dec');
goog.require('shaka.log');
goog.require('shaka.util.IReleasable');

/**
 * @summary
 *  lcevcDec - (MPEG-5 Part 2 LCEVC - Decoder Integration Layer) provides
 *  all the operations related to the enhancement and rendering
 *  of LCEVC enabled streams and on to a canvas.
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.lcevc.Dec = class {
  /**
   * @param {HTMLVideoElement} media The video element that will be attached to
   * LCEVC Dec for input.
   * @param {HTMLCanvasElement} canvas The canvas element that will be attached
   * to LCEVC Dec to render the enhanced frames.
   * @param {shaka.extern.LcevcConfiguration} lcevcConfig The LCEVC DEC
   * config object to initialize the LCEVC DEC.
   */
  constructor(media, canvas, lcevcConfig) {
    /** @private {?LCEVCdec.LCEVCdec} */
    this.dec_ = null;

    /** @private {number} */
    this.variantId_ = -1;

    /** @private {HTMLVideoElement} */
    this.media_ = media;

    /** @private {HTMLCanvasElement} */
    this.canvas_ = canvas;

    /** @private {shaka.extern.LcevcConfiguration} */
    this.decConfig_ = lcevcConfig;

    this.create_();
  }

  /**
   * Append data to the LCEVC Dec.
   * @param {BufferSource} data
   * @param {number} timestampOffset
   */
  appendBuffer(data, timestampOffset) {
    if (this.dec_) {
      // Timestamp offset describes how much offset should be applied to the
      // LCEVC enhancement to match the decoded video frame, as such it needs
      // to be negated.
      this.dec_.appendBuffer(data, 'video', this.variantId_, -timestampOffset);
    }
  }

  /**
   * Hide the canvas specifically in the case of a DRM Content
   */
  hideCanvas() {
    if (this.dec_) {
      this.canvas_.classList.add('shaka-hidden');
    }
  }

  /**
   * Create LCEVC Dec.
   * @private
   */
  create_() {
    if (this.isSupported_() && !this.dec_) {
      if (LCEVCdec.SupportObject.webGLSupport(this.canvas_)) {
        // Make sure the canvas is not hidden from a previous playback session.
        this.canvas_.classList.remove('shaka-hidden');
        this.dec_ = new LCEVCdec.LCEVCdec(
            this.media_,
            this.canvas_,
            this.decConfig_);
      }
    }
  }

  /**
   * Close LCEVC Dec.
   * @override
   * @export
   */
  release() {
    if (this.dec_) {
      this.dec_.close();
      this.dec_ = null;
    }
  }

  /**
   * Check if the LCEVC Dec lib is present and is supported by the browser.
   * @return {boolean}
   * @private
   */
  isSupported_() {
    if (typeof libDPIModule === 'undefined') {
      shaka.log.alwaysWarn(
          'Could not Find LCEVC Library dependencies on this page');
    }

    if (typeof LCEVCdec === 'undefined') {
      shaka.log.alwaysWarn('Could not Find LCEVC Library on this page');
    } else {
      if (!LCEVCdec.SupportObject.SupportStatus) {
        shaka.log.alwaysWarn(LCEVCdec.SupportObject.SupportError);
      }
    }

    return typeof LCEVCdec !== 'undefined' &&
      typeof libDPIModule !== 'undefined' &&
      this.canvas_ instanceof HTMLCanvasElement &&
      LCEVCdec.SupportObject.SupportStatus;
  }

  /**
   * Update current active variant
   * @param {shaka.extern.Track} track
   */
  updateVariant(track, manifestType) {
    let containerFormat = shaka.lcevc.Dec.ContainerFormat.MPEG2_TS;
    let streamingFormat = shaka.lcevc.Dec.StreamingFormat.OTHER;
    switch (track.mimeType) {
      case 'video/webm': {
        containerFormat = shaka.lcevc.Dec.ContainerFormat.WEBM;
        break;
      }
      case 'video/mp4': {
        containerFormat = shaka.lcevc.Dec.ContainerFormat.MP4;
        break;
      }
    }
    switch (manifestType) {
      case 'DASH': {
        streamingFormat = shaka.lcevc.Dec.StreamingFormat.DASH;
        break;
      }
      case 'HLS': {
        streamingFormat = shaka.lcevc.Dec.StreamingFormat.HLS;
        break;
      }
    }
    if (this.dec_) {
      this.variantId_ = track.id;
      this.dec_.setLevelSwitching(track.id, true);
      this.dec_.setContainerFormat(containerFormat);
      this.dec_.setStreamingFormat(streamingFormat);
    }
  }
};

/**
 * Container Formats.
 * @const @enum {number}
 */
shaka.lcevc.Dec.ContainerFormat = {
  MPEG2_TS: 0,
  WEBM: 1,
  MP4: 2,
};

/**
 * Streaming Formats.
 * @const @enum {number}
 */
shaka.lcevc.Dec.StreamingFormat = {
  HLS: 0,
  DASH: 1,
  OTHER: -1,
};
