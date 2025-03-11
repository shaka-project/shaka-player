/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.lcevc.Dec');
goog.require('shaka.log');
goog.require('shaka.Deprecate');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.ManifestParserUtils');

/**
 * @summary
 *  lcevcDec - (MPEG-5 Part 2 LCEVC - Decoder) provides
 *  all the operations related to the enhancement and rendering
 *  of LCEVC enabled streams and on to a canvas.
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.lcevc.Dec = class {
  /**
   * @param {HTMLVideoElement} media The video element that will be attached to
   * LCEVC Decoder for input.
   * @param {HTMLCanvasElement} canvas The canvas element that will be attached
   * to LCEVC Decoder to render the enhanced frames.
   * @param {shaka.extern.LcevcConfiguration} lcevcConfig LCEVC configuration
   * object to initialize the LCEVC Decoder.
   * @param {boolean} isDualTrack
   */
  constructor(media, canvas, lcevcConfig, isDualTrack) {
    /**
     * LCEVC Decoder library based on availability, to check if either
     * lcevc_dil or lcevc_dec is present.
     * @private {LCEVCmodule}
     */
    this.lcevcLib_;

    /** @private {?LCEVCdec.LCEVCdec} */
    this.dec_ = null;

    /** @private {HTMLVideoElement} */
    this.media_ = media;

    /** @private {HTMLCanvasElement} */
    this.canvas_ = canvas;

    /** @private {shaka.extern.LcevcConfiguration} */
    this.decConfig_ = lcevcConfig;

    /** @private {boolean} */
    this.isDualTrack_ = isDualTrack;

    /** @private {boolean} */
    this.toBeDeprecated_ = false;

    this.create_();
  }

  /**
   * Append data to the LCEVC Dec.
   * @param {BufferSource} data
   * @param {number} timestampOffset
   * @param {shaka.extern.Stream} stream
   */
  appendBuffer(data, timestampOffset, stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    // LCEVC only supports VIDEO.
    if (stream.type !== ContentType.VIDEO ||
        (this.isDualTrack_ && !stream.baseOriginalId)) {
      return;
    }
    if (this.dec_) {
      // Timestamp offset describes how much offset should be applied to the
      // LCEVC enhancement to match the decoded video frame, as such it needs
      // to be negated.
      this.dec_.appendBuffer(data, 'video', stream.id, -timestampOffset,
          !this.isDualTrack_);
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
   * Create LCEVC Decoder.
   * @private
   */
  create_() {
    if (this.isSupported_() && !this.dec_) {
      if (this.lcevcLib_.SupportObject.webGLSupport(this.canvas_)) {
        // Make sure the canvas is not hidden from a previous playback session.
        this.canvas_.classList.remove('shaka-hidden');
        // Initiate LCEVC Dec Library based on the type of module available.
        if (this.toBeDeprecated_) {
          this.dec_ = new this.lcevcLib_.LcevcDil(
              this.media_,
              this.canvas_,
              this.decConfig_);
        } else {
          this.dec_ = new this.lcevcLib_.LCEVCdec(
              this.media_,
              this.canvas_,
              this.decConfig_);
        }
      }
    }
  }

  /**
   * Close LCEVC Decoder.
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
   * Check if the LCEVC Decoder lib is present and is supported by the browser.
   * @return {boolean}
   * @private
   */
  isSupported_() {
    if (typeof libDPIModule === 'undefined') {
      shaka.log.alwaysWarn(
          'Could not find LCEVC Library dependencies on this page');
    }

    // This is a check to make the LCEVC Dec Integration is backwards compatible
    // with previous Integration. This logic checks for both implementations
    // and uses the one available.
    if (typeof LCEVCdec !== 'undefined') {
      this.lcevcLib_ = LCEVCdec;
    } else {
      if (typeof LcevcDil !== 'undefined') {
        this.lcevcLib_ = LcevcDil;
        this.toBeDeprecated_ = true;
        shaka.Deprecate.deprecateFeature(5,
            'LcevcDil',
            'lcevc_dil.js is deprecated, please use lcevc_dec.js instead');
      } else {
        shaka.log.alwaysWarn('Could not find LCEVC Library on this page');
        return false;
      }
    }

    // Making Sure if there is a valid LCEVC Dec Library exists.
    if (typeof this.lcevcLib_.SupportObject === 'undefined') {
      shaka.log.alwaysWarn('Could not find LCEVC Library on this page');
      return false;
    } else {
      if (!this.lcevcLib_.SupportObject.SupportStatus) {
        shaka.log.alwaysWarn(this.lcevcLib_.SupportObject.SupportError);
      }
    }

    return typeof this.lcevcLib_ !== 'undefined' &&
      typeof libDPIModule !== 'undefined' &&
      this.canvas_ instanceof HTMLCanvasElement &&
      this.lcevcLib_.SupportObject.SupportStatus;
  }

  /**
   * Update current active variant
   * @param {shaka.extern.Variant} variant
   * @param {?string} manifestType
   */
  updateVariant(variant, manifestType) {
    let stream = variant.video;
    if (!stream) {
      return;
    }
    if (stream.dependencyStream) {
      stream = stream.dependencyStream;
    }
    let containerFormat = shaka.lcevc.Dec.ContainerFormat.MPEG2_TS;
    let streamingFormat = shaka.lcevc.Dec.StreamingFormat.OTHER;
    switch (stream.mimeType) {
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
      this.dec_.setLevelSwitching(stream.id, true);
      this.dec_.setContainerFormat(containerFormat);
      // This functionality is only available on the LCEVC Dec Library.
      if (!this.toBeDeprecated_) {
        this.dec_.setStreamingFormat(streamingFormat);
      }
    }
  }

  /**
   * Checks if a dual track content enhancement stream is supported.
   *
   * @param {shaka.extern.Stream} stream
   * @return {boolean}
   */
  static isStreamSupported(stream) {
    if (!stream || typeof LCEVCdec === 'undefined') {
      return false;
    }
    return stream.codecs == 'lvc1';
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
