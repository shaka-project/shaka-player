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
    this.canvas_.style.width = '100%';
    this.canvas_.style.height = '100%';
    this.canvas_.style.zIndex = '2';
    this.canvas_.style.pointerEvents = 'none';

    this.parent.appendChild(this.canvas_);
    this.resizeCanvas_();

    /** @private {?shaka.ui.Watermark.Options} */
    this.currentConfig_ = null;

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
      this.eventManager.listen(window, 'resize', () => {
        this.resizeCanvas_();
      });
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
    const width = this.parent.offsetWidth;
    const height = this.parent.offsetHeight;

    if (this.canvas_.width === width && this.canvas_.height === height) {
      return;
    }

    this.canvas_.width = width;
    this.canvas_.height = height;

    if (this.currentConfig_) {
      this.showWatermark_(this.currentConfig_);
    }
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
      type: 'dynamic',
      text: text,
      position: 'top-right',
      color: 'rgba(255, 255, 255, 0.7)',
      size: 20,
      alpha: 0.7,
      skip: 5,
      displayDuration: 10,
      transitionDuration: 1,
      jitterSpeed: 0.5,
      jitterAmount: 1.2,
      maxRotationDeg: 3,
    };

    /** @type {!shaka.ui.Watermark.Options} */
    const config = /** @type {!shaka.ui.Watermark.Options} */ (
      Object.assign({}, defaultOptions, options || {}));

    this.currentConfig_ = config;

    this.showWatermark_(this.currentConfig_);
  }

  /**
   * @param {!shaka.ui.Watermark.Options} config
   * @private
   */
  showWatermark_(config) {
    this.removeWatermark();
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
    const ctx = this.getContext2D_();
    if (!ctx) {
      return;
    }

    let currentPosition = {left: 0, top: 0};
    let currentAlpha = 0;
    let phase = 'fadeIn'; // States: fadeIn, display, fadeOut, skip
    let phaseStartTime = null;

    /** @private {number} */
    let positionIndex = 0;

    const padding = 20;

    // Subtle effects
    const maxRotationDeg = config.maxRotationDeg;
    let jitterSpeed = config.jitterSpeed;
    let jitterAmount = config.jitterAmount;
    let currentRotation = 0;
    let baseOffsetX = 0;
    let baseOffsetY = 0;

    let jitterPhase = Math.random() * 2 * Math.PI;

    const getNextPosition = () => {
      ctx.font = `${config.size}px Arial`;
      const textMetrics = ctx.measureText(config.text);
      const textWidth = textMetrics.width;
      const textHeight = config.size;

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

      // Random rotation per position
      currentRotation =
        ((Math.random() * 2 - 1) * maxRotationDeg * Math.PI) / 180;


      jitterSpeed = config.jitterSpeed * (0.5 + Math.random());
      jitterAmount = config.jitterAmount * (0.5 + Math.random());
      jitterPhase = Math.random() * 2 * Math.PI;
      baseOffsetX = (Math.random() * 2 - 1) * jitterAmount;
      baseOffsetY = (Math.random() * 2 - 1) * jitterAmount;

      return position;
    };

    currentPosition = getNextPosition();

    const updateWatermark = (timestamp) => {
      if (!this.animationId_) {
        return;
      }

      if (!phaseStartTime) {
        phaseStartTime = timestamp;
      }

      const elapsed = (timestamp - phaseStartTime) / 1000;
      const transition = Math.max(config.transitionDuration, 0.0001);

      const width = this.canvas_.width;
      const height = this.canvas_.height;
      ctx.clearRect(0, 0, width, height);


      jitterPhase += 2 * Math.PI * jitterSpeed / 60;
      const jitterX = Math.sin(jitterPhase) * jitterAmount;
      const jitterY = Math.cos(jitterPhase) * jitterAmount;

      // State machine for watermark phases
      switch (phase) {
        case 'fadeIn':
          currentAlpha = Math.min(config.alpha,
              (elapsed / transition) * config.alpha);
          if (elapsed >= transition) {
            phase = 'display';
            phaseStartTime = timestamp;
          }
          break;
        case 'display':
          currentAlpha = config.alpha;
          if (elapsed >= config.displayDuration) {
            phase = 'fadeOut';
            phaseStartTime = timestamp;
          }
          break;
        case 'fadeOut':
          currentAlpha = Math.max(0,
              config.alpha * (1 - elapsed / transition));
          if (elapsed >= transition) {
            phase = 'skip';
            phaseStartTime = timestamp;
          }
          break;
        case 'skip':
          currentAlpha = 0;
          if (elapsed >= config.skip) {
            currentPosition = getNextPosition();
            phase = 'fadeIn';
            phaseStartTime = timestamp;
          }
          break;
      }

      // Draw watermark if visible
      if (currentAlpha > 0) {
        ctx.save();

        const x = currentPosition.left + baseOffsetX + jitterX;
        const y = currentPosition.top + baseOffsetY + jitterY;

        ctx.translate(x, y);
        ctx.rotate(currentRotation);

        ctx.globalAlpha = currentAlpha;
        ctx.fillStyle = config.color;
        ctx.font = `${config.size}px Arial`;
        ctx.fillText(config.text, 0, 0);

        ctx.restore();
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
    }

    super.release();
  }
};
