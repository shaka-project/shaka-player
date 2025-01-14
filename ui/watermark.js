/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.Watermark');

goog.requireType('shaka.ui.Controls');

goog.require('shaka.ui.Element');
goog.require('shaka.log');

/**
 * A UI component that adds watermark functionality to the Shaka Player.
 * Allows adding text watermarks with various customization options.
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.Watermark = class extends shaka.ui.Element {
  /**
   * Creates a new Watermark instance.
   * @param {!HTMLElement} parent The parent element for the watermark canvas
   * @param {!shaka.ui.Controls} controls The controls instance
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLCanvasElement} */
    this.canvas_ = /** @type {!HTMLCanvasElement} */ (
      document.createElement('canvas')
    );
    this.canvas_.style.position = 'absolute';
    this.canvas_.style.top = '0';
    this.canvas_.style.left = '0';
    this.canvas_.style.pointerEvents = 'none';

    this.parent.appendChild(this.canvas_);
    this.resizeCanvas_();

    /** @private {number|null} */
    this.animationId_ = null;

    /** @private {ResizeObserver|null} */
    this.resizeObserver_ = null;

    // Use ResizeObserver if available, fallback to window resize event
    if (window.ResizeObserver) {
      this.resizeObserver_ = new ResizeObserver(() => this.resizeCanvas_());
      this.resizeObserver_.observe(this.parent);
    } else {
      // Fallback for older browsers
      window.addEventListener('resize', () => this.resizeCanvas_());
    }
  }

  /**
   * Gets the 2D rendering context safely
   * @return {?CanvasRenderingContext2D}
   * @private
   */
  getContext2D_() {
    const ctx = this.canvas_.getContext('2d');
    if (!ctx) {
      shaka.log.error('2D context is not available');
      return null;
    }
    return /** @type {!CanvasRenderingContext2D} */ (ctx);
  }

  /**
   * Resize canvas to match video container
   * @private
   */
  resizeCanvas_() {
    this.canvas_.width = this.parent.offsetWidth;
    this.canvas_.height = this.parent.offsetHeight;
  }

  /**
   * Sets a text watermark on the video with customizable options.
   * The watermark can be either static (fixed position) or dynamic (moving).
   * @param {string} text The text to display as watermark
   * @param {?shaka.ui.Watermark.Options=} options  configuration options
   * @export
   */
  setTextWatermark(text, options) {
    /** @type {!shaka.ui.Watermark.Options} */
    const defaultOptions = {
      type: 'static',
      text: text,
      position: 'top-right',
      color: 'rgba(255, 255, 255, 0.7)',
      size: 20,
      alpha: 0.7,
      interval: 2 * 1000,
      skip: 0.5 * 1000,
      displayDuration: 2 * 1000,
      transitionDuration: 0.5,
    };

    /** @type {!shaka.ui.Watermark.Options} */
    const config = /** @type {!shaka.ui.Watermark.Options} */ (
      Object.assign({}, defaultOptions, options || defaultOptions)
    );

    if (config.type === 'static') {
      this.drawStaticWatermark_(config);
    } else if (config.type === 'dynamic') {
      this.startDynamicWatermark_(config);
    }
  }

  /**
   * Draws a static watermark on the canvas.
   * @param {!shaka.ui.Watermark.Options} config  configuration options
   * @private
   */
  drawStaticWatermark_(config) {
    const ctx = this.getContext2D_();
    if (!ctx) {
      return;
    }

    ctx.clearRect(0, 0, this.canvas_.width, this.canvas_.height);

    ctx.globalAlpha = config.alpha;
    ctx.fillStyle = config.color;
    ctx.font = `${config.size}px Arial`;

    const metrics = ctx.measureText(config.text);
    const padding = 20;
    let x;
    let y;

    switch (config.position) {
      case 'top-left':
        x = padding;
        y = config.size + padding;
        break;
      case 'top-right':
        x = this.canvas_.width - metrics.width - padding;
        y = config.size + padding;
        break;
      case 'bottom-left':
        x = padding;
        y = this.canvas_.height - padding;
        break;
      case 'bottom-right':
        x = this.canvas_.width - metrics.width - padding;
        y = this.canvas_.height - padding;
        break;
      default:
        x = (this.canvas_.width - metrics.width) / 2;
        y = (this.canvas_.height + config.size) / 2;
    }

    ctx.fillText(config.text, x, y);
  }

  /**
   * Starts a dynamic watermark animation on the canvas.
   * @param {!shaka.ui.Watermark.Options} config  configuration options
   * @private
   */
  startDynamicWatermark_(config) {
    const ctx = /** @type {!CanvasRenderingContext2D} */ (
      this.canvas_.getContext('2d')
    );
    let currentPosition = {left: 0, top: 0};
    let currentAlpha = 0;
    let phase = 'fadeIn'; // States: fadeIn, display, fadeOut, transition

    let displayFrames = Math.round(config.displayDuration * 60); // 60fps
    const transitionFrames = Math.round(config.transitionDuration * 60);
    const fadeSpeed = 1 / (transitionFrames / 2); // Smoother fade speed

    /** @private {number} */
    let positionIndex = 0;

    const getNextPosition = () => {
      ctx.font = `${config.size}px Arial`;
      const textMetrics = ctx.measureText(config.text);
      const textWidth = textMetrics.width;
      const textHeight = config.size;
      const padding = 20;

      // Define fixed positions
      const positions = [
        // Top-left
        {
          left: padding,
          top: textHeight + padding,
        },
        // Top-right
        {
          left: this.canvas_.width - textWidth - padding,
          top: textHeight + padding,
        },
        // Bottom-left
        {
          left: padding,
          top: this.canvas_.height - padding,
        },
        // Bottom-right
        {
          left: this.canvas_.width - textWidth - padding,
          top: this.canvas_.height - padding,
        },
        // Center
        {
          left: (this.canvas_.width - textWidth) / 2,
          top: (this.canvas_.height + textHeight) / 2,
        },
      ];

      // Cycle through positions
      const position = positions[positionIndex];
      positionIndex = (positionIndex + 1) % positions.length;
      return position;
    };

    currentPosition = getNextPosition();

    const updateWatermark = () => {
      if (!this.animationId_) {
        return;
      }

      const width = this.canvas_.width;
      const height = this.canvas_.height;
      ctx.clearRect(0, 0, width, height);

      // State machine for watermark phases
      switch (phase) {
        case 'fadeIn':
          currentAlpha = Math.min(config.alpha, currentAlpha + fadeSpeed);
          if (currentAlpha >= config.alpha) {
            phase = 'display';
          }
          break;
        case 'display':
          if (--displayFrames <= 0) {
            phase = 'fadeOut';
          }
          break;
        case 'fadeOut':
          currentAlpha = Math.max(0, currentAlpha - fadeSpeed);
          if (currentAlpha <= 0) {
            phase = 'transition';
            currentPosition = getNextPosition();
            displayFrames = Math.round(config.displayDuration * 60);
            phase = 'fadeIn';
          }
          break;
      }

      // Draw watermark if visible
      if (currentAlpha > 0) {
        ctx.globalAlpha = currentAlpha;
        ctx.fillStyle = config.color;
        ctx.font = `${config.size}px Arial`;
        ctx.fillText(config.text, currentPosition.left, currentPosition.top);
      }

      // Request next frame if animation is still active
      if (this.animationId_) {
        this.animationId_ = requestAnimationFrame(updateWatermark);
      }
    };

    // Start the animation loop
    this.animationId_ = requestAnimationFrame(updateWatermark);
  }

  /**
   * Removes the current watermark from the video and stops any animations.
   * @export
   */
  removeWatermark() {
    if (this.animationId_) {
      cancelAnimationFrame(this.animationId_);
      this.animationId_ = null;
    }
    const ctx = this.getContext2D_();
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, this.canvas_.width, this.canvas_.height);
  }

  /**
   * Releases the watermark instance and cleans up the canvas element.
   * @override
   */
  release() {
    if (this.canvas_ && this.canvas_.parentNode) {
      this.canvas_.parentNode.removeChild(this.canvas_);
    }

    // Clean up resize observer if it exists
    if (this.resizeObserver_) {
      this.resizeObserver_.disconnect();
      this.resizeObserver_ = null;
    } else {
      // Remove window resize listener if we were using that
      window.removeEventListener('resize', () => this.resizeCanvas_());
    }

    super.release();
  }
};
