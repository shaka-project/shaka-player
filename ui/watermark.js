/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.Watermark');

goog.requireType('shaka.ui.Controls');

goog.require('shaka.ui.Element');

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
      console.error('2D context is not available');
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
   * @param {shaka.extern.WatermarkOptions=} options Watermark  options
   * @export
   */
  setTextWatermark(text, options) {
    /** @type {!shaka.extern.WatermarkOptions} */
    const defaultOptions = {
      type: 'static',
      text: text,
      position: 'top-right',
      color: 'rgba(255, 255, 255, 0.7)',
      size: 20,
      alpha: 0.7,
      interval: 3000,
      skip: 500,
    };

    /** @type {!shaka.extern.WatermarkOptions} */
    const config = /** @type {!shaka.extern.WatermarkOptions} */ (
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
   * @param {!shaka.extern.WatermarkOptions} config  configuration options
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
   * @param {!shaka.extern.WatermarkOptions} config  configuration options
   * @private
   */
  startDynamicWatermark_(config) {
    // Cancel any existing animation
    if (this.animationId_) {
      cancelAnimationFrame(this.animationId_);
    }

    const ctx = this.getContext2D_();
    if (!ctx) {
      return;
    }

    ctx.font = `${config.size}px Arial`;
    const textWidth = ctx.measureText(config.text).width;
    const textHeight = config.size;

    // Initial position
    let x = Math.random() * (this.canvas_.width - textWidth);
    let y = Math.random() * (this.canvas_.height - textHeight) + textHeight;

    // Random direction
    let dx = (Math.random() > 0.5 ? 1 : -1) * 2;
    let dy = (Math.random() > 0.5 ? 1 : -1) * 2;

    const animate = () => {
      ctx.clearRect(0, 0, this.canvas_.width, this.canvas_.height);
      ctx.globalAlpha = config.alpha;
      ctx.fillStyle = config.color;
      ctx.font = `${config.size}px Arial`;

      ctx.fillText(config.text, x, y);

      // Update position
      x += dx;
      y += dy;

      // Bounce off walls
      if (x <= 0 || x + textWidth >= this.canvas_.width) {
        dx = -dx;
        x = Math.max(0, Math.min(x, this.canvas_.width - textWidth));
      }
      if (y <= textHeight || y >= this.canvas_.height) {
        dy = -dy;
        y = Math.max(textHeight, Math.min(y, this.canvas_.height));
      }

      this.animationId_ = requestAnimationFrame(animate);
    };

    animate();
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
