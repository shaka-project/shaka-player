/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.lcevc.Dil');

goog.require('shaka.util.Dom');

/**
 * @export
 * @summary
 * lcevcDil provides all the operations related to the enhancement and rendering
 * of LCEVC enabled streams and on to a canvas.
 */
shaka.lcevc.Dil = class {
  /**
   * @param {HTMLMediaElement} media The video element that will be attached to
   * LCEVC Dil for input.
   * @param {HTMLElement} canvas The canvas element that will be attached to
   * LCEVC Dil to render the enhanced frames.
   * @param {Object} dilConfig The LCEVC DIL config object
   * to initialize the LCEVC DIL.
   */
  constructor(media, canvas, dilConfig) {
    /** @private {?LcevcDil.LcevcDIL} */
    this.dil_ = null;

    /** @private {?Element} */
    this.parent_ = null;

    /** @private {?HTMLElement} */
    this.lcevcContainer_ = null;

    /** @private {?HTMLElement} */
    this.videoControls_ = null;

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;

    this.level_ = -1;
    this.containerFormat_ = 0;
    this.media_ = /** @type {HTMLVideoElement} */ (media);
    this.canvas_ = /** @type {HTMLCanvasElement} */ (canvas);
    this.dilConfig_ = dilConfig;

    // This line is optional forcing the config to hide the LCEVC watermark
    // that is displayed on the left hand side top corner.
    if (!this.dilConfig_['logo']) {
      this.dilConfig_['logo'] = false;
    }
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
    if (!this.dil_) {
      if (!this.canvas_) {
        this.createCanvas_();
      }
      this.dil_ = new LcevcDil.LcevcDil(
          this.media_,
          this.canvas_,
          this.dilConfig_);

      this.setControlsStyle_();
    }
  }

  /**
   * Reset LCEVC Dil.
   */
  async reset() {
    const INVALID_LEVEL = -2;
    if (this.dil_) {
      this.dil_.setCurrentLevel(INVALID_LEVEL);
      await Promise.resolve();
      this.dil_.setLevelSwitching(this.level_, 1);
    }
  }

  /**
   * Close LCEVC Dil.
   */
  close() {
    if (this.dil_) {
      this.dil_.close();
      this.dil_ = null;
    }
    this.lcevcContainer_.remove();
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
   */
  static isSupported() {
    return typeof LcevcDil !== 'undefined' &&
    typeof libDPIModule !== 'undefined';
  }

  /**
   * Create canvas for LCEVC Dil to render if not exists.
   * @private
   */
  createCanvas_() {
    this.lcevcContainer_ = shaka.util.Dom.createHTMLElement('div');
    this.lcevcContainer_.style.position = 'relative';

    if (this.dilConfig_['playerControls']) {
      this.videoControls_ = shaka.util.Dom.getElementById(
          this.dilConfig_['playerControls']['controlsID']);
      this.videoControls_.id = this.dilConfig_['playerControls']['controlsID'];
      this.lcevcContainer_.appendChild(this.videoControls_);
    }

    this.canvas_ = /** @type {HTMLCanvasElement} */
      (shaka.util.Dom.createHTMLElement('canvas'));
    this.canvas_.style.position = 'absolute';
    this.media_.style.display = 'none';

    this.parent_ = this.media_.parentElement;
    if (this.parent_) {
      this.lcevcContainer_.appendChild(this.canvas_);
      this.parent_.appendChild(this.lcevcContainer_);

      this.resizeObserver_ = new ResizeObserver((_entries) => {
        window.requestAnimationFrame(() => {
          this.playerResize_(this.lcevcContainer_, this.dil_,
              this.media_, this.canvas_);
        });
      });

      this.resizeObserver_.observe(this.parent_);
    }
  }

  /**
   * Resizing the container based on the source video dimensions.
   * @private
   */
  playerResize_(lcevcContainer, lcevcDil, mediaElement, canvas) {
    const lcevcContainerParent = /** @type {HTMLElement} */
      (lcevcContainer.parentElement);

    if (lcevcDil) {
      // We try to find the actual aspect ratio with the lcevc enhanced frame
      // if this value is not a valid value we default it to 1920x1080
      const aspectRatio = (lcevcDil && lcevcDil.aspectRatio > 0 ?
        lcevcDil.aspectRatio :
        mediaElement.videoWidth / mediaElement.videoHeight) || 1920 / 1080;
      lcevcContainer.style.width =
        `${(lcevcContainerParent).offsetWidth}px`;
      if (lcevcDil && lcevcDil.isFullscreen) {
        lcevcContainer.style.height =
          `${window.innerHeight - this.videoControls_.offsetHeight}px`;

        if (canvas.height < lcevcContainer.offsetHeight) {
          this.canvas_.style.top =
          `${(window.innerHeight - canvas.height) / 2}px`;
        } else {
          canvas.style.top = '';
          canvas.style.height =
            `${window.innerHeight - this.videoControls_.offsetHeight}px`;
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
   * Set styles for video controls
   * @private
   * */
  setControlsStyle_() {
    if (this.videoControls_) {
      this.videoControls_.style.position = 'absolute';
      this.videoControls_.style.bottom = '0px';
      this.videoControls_.style.width = '100%';
      this.videoControls_.style.zIndex = '200';
    }
  }

  /**
   * Update Variant Level.
   * @param {number} level
   * @param {number} containerFormat
   * @private
   */
  updateLevel_(level, containerFormat) {
    this.createDil_();
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
    let containerFormat = 0;
    for (let iterator = 0; iterator < tracks.length; iterator += 1) {
      if (tracks[iterator].active) {
        if (tracks[iterator].mimeType === 'video/webm') {
          containerFormat = 1;
        }
        if (tracks[iterator].mimeType === 'video/mp4') {
          containerFormat = 2;
        }
        this.updateLevel_(iterator, containerFormat);
        break;
      }
    }
  }
};
