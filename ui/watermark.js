/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.Watermark');
goog.requireType('shaka.ui.Controls');

goog.require('shaka.ui.Element');

/**
 * @typedef {{
 *   type: string,
 *   text: string,
 *   position: string,
 *   color: string,
 *   size: number,
 *   alpha: number,
 *   interval: number,
 *   skip: number
 * }}
 * @export
 */
shaka.ui.Watermark.Options;

/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.Watermark = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLCanvasElement} */
    this.canvas_ = /** @type {!HTMLCanvasElement} */ (document.createElement('canvas'));
    this.canvas_.style.position = 'absolute';
    this.canvas_.style.top = '0';
    this.canvas_.style.left = '0';
    this.canvas_.style.pointerEvents = 'none';

    this.parent.appendChild(this.canvas_);
    this.resizeCanvas_();

    /** @private {number|null} */
    this.animationId_ = null;

    // Listen for video container resize
    window.addEventListener('resize', () => this.resizeCanvas_());
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
   * @param {string} text
   * @param {shaka.ui.Watermark.Options=} options
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
      interval: 3000,
      skip: 500,
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
   * @param {!shaka.ui.Watermark.Options} config
   * @private
   */
  drawStaticWatermark_(config) {
    const ctx = /** @type {!CanvasRenderingContext2D} */ (
      this.canvas_.getContext('2d')
    );

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
   * @param {!shaka.ui.Watermark.Options} config
   * @private
   */
  startDynamicWatermark_(config) {
    // Cancel any existing animation
    if (this.animationId_) {
      cancelAnimationFrame(this.animationId_);
    }

    const ctx = /** @type {!CanvasRenderingContext2D} */ (
      this.canvas_.getContext('2d')
    );

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
   * Removes the watermark from the canvas
   * @export
   */
  removeWatermark() {
    if (this.animationId_) {
      cancelAnimationFrame(this.animationId_);
      this.animationId_ = null;
    }
    const ctx = /** @type {!CanvasRenderingContext2D} */ (
      this.canvas_.getContext('2d')
    );
    ctx.clearRect(0, 0, this.canvas_.width, this.canvas_.height);
  }

  /**
   * @override
   */
  release() {
    if (this.canvas_ && this.canvas_.parentNode) {
      this.canvas_.parentNode.removeChild(this.canvas_);
    }
    super.release();
  }
};
