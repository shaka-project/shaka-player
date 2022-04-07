/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.lcevc.Dil');
goog.require('shaka.log');
goog.require('shaka.util.Dom');
goog.require('shaka.util.IReleasable');

/**
 * @summary
 * lcevcDil - (MPEG-5 Part 2 LCEVC - Decoder Integration Layer) provides
 *  all the operations related to the enhancement and rendering
 *  of LCEVC enabled streams and on to a canvas.
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.lcevc.Dil = class {
  /**
   * @param {HTMLMediaElement} media The video element that will be attached to
   * LCEVC Dil for input.
   * @param {HTMLElement} canvas The canvas element that will be attached to
   * LCEVC Dil to render the enhanced frames.
   * @param {LcevcDil.LcevcDilConfig | undefined | null} dilConfig The LCEVC DIL
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

    this.level_ = -1;
    this.containerFormat_ = 0;
    this.media_ = /** @type {HTMLVideoElement} */ (media);
    this.canvas_ = /** @type {HTMLCanvasElement} */ (canvas);
    this.dilConfig_ = /** @type {LcevcDil.LcevcDilConfig} */ (dilConfig);
    if (!this.dilConfig_) {
      this.dilConfig_ = {};
    }
    // This line is optional forcing the config to hide the LCEVC watermark
    // that is displayed on the left hand side top corner.
    if (!this.dilConfig_['logo']) {
      this.dilConfig_['logo'] = false;
    }
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
      this.media_.style.display = 'block';
      this.canvas_.style.display = 'none';
    }
  }

  /**
    * Show the canvas and hide original video element
    */
  showCanvas() {
    if (this.dil_) {
      this.media_.style.display = 'none';
      this.canvas_.style.display = 'block';
    }
  }

  /**
   * Create LCEVC Dil.
   * @private
   */
  createDil_() {
    if (this.isSupported_() && !this.dil_) {
      if (!this.canvas_) {
        this.createCanvas_();
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
    if (this.canvas_) {
      this.canvas_.remove();
    }
  }

  /**
   * Check if LCEVC Dil exists.
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
   * Create canvas for LCEVC Dil to render if not exists.
   * @private
   */
  createCanvas_() {
    this.canvas_ = /** @type {HTMLCanvasElement} */
      (shaka.util.Dom.createHTMLElement('canvas'));
    if (LcevcDil.SupportObject.webGLSupport(this.canvas_)) {
      this.lcevcContainer_ = shaka.util.Dom.createHTMLElement('div');
      this.lcevcContainer_.style.position = 'relative';

      this.canvas_.style.position = 'absolute';
      this.media_.style.display = 'none';

      this.parent_ = this.media_.parentElement;
      if (this.parent_) {
        this.lcevcContainer_.appendChild(this.canvas_);
        this.parent_.appendChild(this.lcevcContainer_);
        if ('ResizeObserver' in window) {
          this.resizeObserver_ = new ResizeObserver((_entries) => {
            window.requestAnimationFrame(() => {
              this.playerResize_(this.lcevcContainer_, this.dil_,
                  this.media_, this.canvas_);
            });
          });
          this.resizeObserver_.observe(this.parent_);
        }
        this.playerResize_(this.lcevcContainer_, this.dil_,
            this.media_, this.canvas_);
      }
    }
  }

  /**
   * Resizing the container based on the source video dimensions.
   * @param {HTMLElement} lcevcContainer
   * @param {LcevcDil.LcevcDIL} lcevcDil
   * @param {HTMLVideoElement} mediaElement
   * @param {HTMLCanvasElement} canvas
   * @private
   */
  playerResize_(lcevcContainer, lcevcDil, mediaElement, canvas) {
    const lcevcContainerParent = /** @type {HTMLElement} */
      (lcevcContainer.parentElement);

    if (this.isSupported_()) {
      // We try to find the actual aspect ratio with the lcevc enhanced frame
      // if this value is not a valid value we default it to 1920x1080
      const aspectRatio = (lcevcDil && lcevcDil.aspectRatio > 0 ?
        lcevcDil.aspectRatio :
        mediaElement.videoWidth / mediaElement.videoHeight) || 1920 / 1080;
      lcevcContainer.style.width =
        `${(lcevcContainerParent).offsetWidth}px`;
      if (lcevcDil && lcevcDil.isFullscreen) {
        lcevcContainer.style.height = `${window.innerHeight}px`;
        if (canvas.height < lcevcContainer.offsetHeight) {
          this.canvas_.style.top =
          `${(window.innerHeight - canvas.height) / 2}px`;
        } else {
          canvas.style.top = '';
          canvas.style.height = `${window.innerHeight}px`;
        }
      } else {
        lcevcContainer.style.height =
          `${lcevcContainerParent.offsetWidth / aspectRatio}px`;

        canvas.style.height = `${lcevcContainer.offsetHeight}px`;
        canvas.style.top = '';
      }
    }
  }

  /**
   * Updates LCEVC DIL with the index of the variant that is being downloaded.
   * @param {number} level // Index of currently active variant.
   * @param {number} containerFormat // Container Format of the stream.
   * @private
   */
  updateLevel_(level, containerFormat) {
    if (this.dil_) {
      this.level_ = level;
      this.containerFormat_ = containerFormat;
      this.dil_.setLevelSwitching(level, 1);
      this.dil_.setContainerFormat(containerFormat);
    }
  }

  /**
   * Update current active variant
   * @param {Array<shaka.extern.Track>} tracks
   */
  updateVariant(tracks) {
    let containerFormat = shaka.lcevc.Dil.ContainerFormat.MPEG2_TS;
    for (let iterator = 0; iterator < tracks.length; iterator += 1) {
      if (tracks[iterator].active) {
        switch (tracks[iterator].mimeType) {
          case 'video/webm': {
            containerFormat = shaka.lcevc.Dil.ContainerFormat.WEBM;
            break;
          }
          case 'video/mp4': {
            containerFormat = shaka.lcevc.Dil.ContainerFormat.MP4;
            break;
          }
        }
        this.updateLevel_(iterator, containerFormat);
        break;
      }
    }
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
