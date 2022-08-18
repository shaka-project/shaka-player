/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.Visualizer');

goog.require('shakaDemo.BoolInput');


/**
 * Manages a visualizer that shows the buffering progress of the player.
 */
shakaDemo.Visualizer = class {
  /**
   * @param {!HTMLCanvasElement} canvas
   * @param {!HTMLElement} div
   * @param {!HTMLElement} screenshotDiv
   * @param {!HTMLElement} controlsDiv
   * @param {!HTMLVideoElement} video
   * @param {!shaka.Player} player
   */
  constructor(canvas, div, screenshotDiv, controlsDiv, video, player) {
    /** @private {!HTMLCanvasElement} */
    this.canvas_ = canvas;

    /** @private {!HTMLElement} */
    this.div_ = div;

    this.active = false;

    /** @private {!HTMLElement} */
    this.screenshotDiv_ = screenshotDiv;

    /** @private {!HTMLVideoElement} */
    this.video_ = video;

    /** @private {!shaka.Player} */
    this.player_ = player;

    /** @private {boolean} */
    this.takeAutoScreenshots_ = false;

    /** @private {shaka.util.Timer} */
    this.timer_ = new shaka.util.Timer(() => {
      this.ageUpdates_();
      this.updateCanvas_();
      this.takeAutomaticScreenshots_();
    });

    /** @private {number} */
    this.lastCurrentTime_ = 0;

    /** @private {number} */
    this.colorIOffset_ = 0;

    /** @private {boolean} */
    this.autoScreenshotTaken_ = false;

    /**
     * @private {!Array.<{
     *   age: number,
     *   start: number,
     *   end: number,
     *   contentType: string,
     * }>}
     */
    this.updates_ = [];

    // Listen for when new buffers are appended.
    player.addEventListener('segmentappended', (event) => {
      const start = /** @type {number} */ (event['start']);
      const end = /** @type {number} */ (event['end']);
      const contentType = /** @type {string} */ (event['contentType']);
      this.updates_.push({age: 0, start, end, contentType});
    });

    // Add controls.
    const inputContainer = new shakaDemo.InputContainer(
        controlsDiv, null, shakaDemo.InputContainer.Style.VERTICAL, null);

    inputContainer.addRow(null, null);
    this.screenshotButton_ = document.createElement('button');
    inputContainer.latestElementContainer.appendChild(this.screenshotButton_);
    this.screenshotButton_.textContent = shakaDemoMain.getLocalizedString(
        shakaDemo.MessageIds.VISUALIZER_SCREENSHOT_BUTTON);
    this.screenshotButton_.classList.add('mdl-button');
    this.screenshotButton_.classList.add('mdl-button--colored');
    this.screenshotButton_.classList.add('mdl-js-button');
    this.screenshotButton_.classList.add('mdl-js-ripple-effect');
    this.screenshotButton_.addEventListener('click', () => {
      this.takeScreenshot_();
    });

    inputContainer.addRow(
        shakaDemo.MessageIds.VISUALIZER_AUTO_SCREENSHOT_TOGGLE, null);
    /** @private {!shakaDemo.BoolInput} */
    this.autoScreenshotToggle_ = new shakaDemo.BoolInput(
        inputContainer, shakaDemo.MessageIds.VISUALIZER_AUTO_SCREENSHOT_TOGGLE,
        (input) => {
          this.takeAutoScreenshots_ = input.checked;
        });
  }

  /** Starts the visualizer updating, and un-hides it. */
  start() {
    this.timer_.tickEvery(shakaDemo.Visualizer.updateFrequency_);
    this.div_.classList.remove('hidden');
    // Start out as though an automatic screenshot had been taken, so that it
    // doesn't take a screenshot during the initial buffering.
    this.autoScreenshotTaken_ = true;
  }

  /** Stops the visualizer updating, and hides it. */
  stop() {
    this.timer_.stop();
    this.div_.classList.add('hidden');
    this.updates_ = [];
  }

  /**
   * @param {!CanvasRenderingContext2D} ctx
   * @param {!Array.<string>} colors
   * @param {number} y
   * @param {number} h
   * @param {number} scaleFactor Measured in pixels per second.
   * @param {number} activeI
   * @private
   */
  drawBufferInfoCanvasBar_(ctx, colors, y, h, scaleFactor, activeI) {
    // Define the muted colors. These are used to signify the end of buffered
    // periods.
    const mutedColors = colors.filter((color) => {
      return color.replaceAll('F', 'A').replaceAll('0', '4');
    });

    /**
     * Converts a time value from seconds to screen position.
     * @param {number} time
     * @return {number}
     */
    const timeToPosition = (time) => {
      return Math.round((time - this.video_.currentTime) * scaleFactor +
          (this.canvas_.width / 2));
    };

    // Choose text drawing settings.
    const fontSize = Math.floor(h / 4);
    ctx.textAlign = 'center';
    ctx.font = 'bold ' + fontSize + 'px serif';
    ctx.textBaseline = 'bottom';
    const longFormText = scaleFactor > fontSize * 4;

    // Draw updates.
    for (const update of this.updates_) {
      let s = timeToPosition(update.start);
      let e = timeToPosition(update.end);
      if (e >= 0 && s < this.canvas_.width) {
        s = Math.max(s, 0);
        e = Math.min(e, this.canvas_.width);
        ctx.fillStyle = '#FFFFFF';
        // Note that these are drawn at reduced opacity, so that multiple
        // updates in the same time range (e.g. video and audio) will visibly
        // overlap.
        // They also fade away further over time, until they are gone entirely.
        ctx.globalAlpha =
            0.1 + 0.2 * (1 - update.age / shakaDemo.Visualizer.maxUpdateAge_);
        ctx.fillRect(s, y, e - s, h);
        ctx.globalAlpha = 1;

        // Also draw text labels, to show what type of segment this was.
        let text = update.contentType.toUpperCase();
        if (!longFormText) {
          text = text[0];
        }
        const textX = s + (e - s) / 2;
        let textY = y + h;
        switch (update.contentType) {
          case 'video':
            textY -= fontSize * 2;
            break;
          case 'audio':
            textY -= fontSize;
            break;
          // Text is at the bottom.
        }
        ctx.fillText(text, textX, textY);
      }
    }

    // Draw buffered ranges.
    const gapDetectionThreshold =
        this.player_.getConfiguration().streaming.gapDetectionThreshold;
    for (let i = 0; i < this.video_.buffered.length; i++) {
      let s = timeToPosition(this.video_.buffered.start(i));
      let e = timeToPosition(this.video_.buffered.end(i));
      if (e >= 0 && s < this.canvas_.width) {
        s = Math.max(s, 0);
        e = Math.min(e, this.canvas_.width);
        const colorI = (i - activeI + this.colorIOffset_ +
            10000 * colors.length) % colors.length;
        const barHeight = (h - 3 * fontSize) / colors.length;
        const barY = y + (colorI * barHeight);

        // Draw the bar as a richer color.
        ctx.fillStyle = colors[colorI];
        ctx.fillRect(s, barY, e - s, barHeight);

        // Draw the gap detection threshold as a more muted color.
        const gdtS = Math.max(s, timeToPosition(
            this.video_.buffered.end(i) - gapDetectionThreshold));
        ctx.fillStyle = mutedColors[colorI];
        ctx.fillRect(gdtS, barY, e - gdtS, barHeight);
      }
    }
  }

  /** @private */
  takeAutomaticScreenshots_() {
    if (this.video_.readyState <= 2) {
      // When the video stops, due to a lack of buffered material, take a
      // screenshot automatically, so that this information will not be lost
      // if this is a freeze.
      if (!this.autoScreenshotTaken_ && this.takeAutoScreenshots_) {
        this.takeScreenshot_();
        this.autoScreenshotTaken_ = true;
      }
    } else {
      this.autoScreenshotTaken_ = false;
    }
  }

  /** @private */
  ageUpdates_() {
    for (const update of this.updates_) {
      update.age += shakaDemo.Visualizer.updateFrequency_;
    }
    this.updates_ = this.updates_.filter((update) => {
      return update.age < shakaDemo.Visualizer.maxUpdateAge_;
    });
  }

  /** @private */
  takeScreenshot_() {
    shaka.util.Dom.removeAllChildren(this.screenshotDiv_);

    // Make the screenshot.
    const screenshotCanvas = /** @type {!HTMLCanvasElement} */ (
      document.createElement('canvas'));
    screenshotCanvas.width = this.canvas_.width;
    screenshotCanvas.height = this.canvas_.height;
    const ctx = /** @type {CanvasRenderingContext2D} */ (
      screenshotCanvas.getContext('2d'));
    ctx.drawImage(this.canvas_, 0, 0);
    this.screenshotDiv_.appendChild(screenshotCanvas);
  }

  /** @private */
  updateCanvas_() {
    // Make sure the size of the canvas data is the size of the canvas element.
    this.canvas_.width = this.canvas_.offsetWidth;
    this.canvas_.height = this.canvas_.offsetHeight;

    // Get the context.
    const ctx = /** @type {CanvasRenderingContext2D} */ (
      this.canvas_.getContext('2d'));
    ctx.imageSmoothingEnabled = false;

    // Make a black background.
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, this.canvas_.width, this.canvas_.height);

    // Define the colors.
    // Each buffered range is represented by a bar of a solid color, so that
    // gaps in the presentation are more visually obvious; the two bars
    // representing the two ranges will be at different y-positions and be
    // drawn with different colors.
    // These colors are, in order: red, green, and blue.
    const colors = ['#FF0000', '#00FF00', '#0000FF'];

    // Determine what buffered range is centered, so that colors can remain
    // consistent between frames.
    let activeI = -1;
    let lastActiveI = -1;
    const lastTime = this.lastCurrentTime_;
    const currentTime = this.video_.currentTime;
    const buffered = this.video_.buffered;
    for (let i = 0; i < buffered.length; i++) {
      if (lastTime >= buffered.start(i) && lastTime <= buffered.end(i)) {
        lastActiveI = i;
      }
      if (currentTime >= buffered.start(i) && currentTime <= buffered.end(i)) {
        activeI = i;
      }
    }
    this.lastCurrentTime_ = currentTime;

    // Determine if the video has moved between two buffered ranges. If so,
    // update the offset so that the colors remain consistent.
    if (activeI != -1 && lastActiveI != -1) {
      this.colorIOffset_ += activeI - lastActiveI;
    }

    // Draw bars at various zoom levels.
    const scaleFactors = [50, 5];
    const overallHeight = this.canvas_.height / scaleFactors.length;
    for (let i = 0; i < scaleFactors.length; i++) {
      const h = overallHeight * 0.75;
      const y = (overallHeight * i) + ((overallHeight - h) / 2);
      this.drawBufferInfoCanvasBar_(
          ctx, colors, y, h, scaleFactors[i], activeI);
    }

    // Draw the indicator tick at the center.
    ctx.fillStyle = '#FFFFFF';
    const tickWidth = 2;
    ctx.fillRect(
        (this.canvas_.width / 2) - (tickWidth / 2), 0,
        tickWidth, this.canvas_.height);
  }
};


/**
 * How many seconds an update event should be displayed.
 * @const {number}
 */
shakaDemo.Visualizer.maxUpdateAge_ = 20;


/**
 * How often the visualizer should update, in seconds.
 * @const {number}
 */
shakaDemo.Visualizer.updateFrequency_ = 0.05;
