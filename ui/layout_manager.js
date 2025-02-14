/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.LayoutManager');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('goog.asserts');

// Type definition is now in ui/externs/layout_manager.js

/**
 * A UI component that manages the layout and configuration of the video player.
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.LayoutManager = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.parent_ = parent;

    /** @private {!shaka.ui.LayoutManager.Options} */
    this.currentConfig_ = /** @type {!shaka.ui.LayoutManager.Options} */ ({
      addBigPlayButton: true,
      addSeekBar: true,
      buttonShape: 'Circle',
      collapseInSettings: [],
      confirmBeforeAutoResume: false,
      conserveQualityAcrossSession: false,
      conserveSelectedCaptionLanguage: false,
      conserveSpeedAcrossSession: false,
      conserveVolumeAcrossSession: false,
      controlPanelElements: [],
      enableAirPlay: false,
      enableAutoResumeLocal: false,
      enableChapters: false,
      enableChromecast: false,
      enableDoubleTapSkip: false,
      enableKeyboardShortcuts: true,
      enableLockControls: false,
      enablePiP: false,
      enableReportBug: false,
      enableSaveOffline: false,
      enableTooltips: true,
      hideControlsOnPause: false,
      initialDurationPosition: 'center',
      initialPlayButtonShape: 'Circle',
      overflowMenuButtons: [],
      playbackRates: [],
      playerName: '',
      primaryColor: '#ff0000',
      seekBarColors: {
        base: 'rgba(255, 255, 255, 0.3)',
        buffered: 'rgba(255, 255, 255, 0.54)',
        played: 'rgb(255, 255, 255)',
        adBreaks: 'rgb(255, 204, 0)',
      },
      showCaptionsControl: true,
      showFullScreen: true,
      showPlayPauseBtn: true,
      showProgressBar: true,
      showQualityControl: true,
      showReplayAtEnd: true,
      showScrubbingPreview: true,
      showSpeedControl: true,
      showTimeText: true,
      skipDuration: 10,
    });

    /** @private {!shaka.ui.Controls} */
    this.controls_ = controls;

    /** @private {string} */
    this.defaultPrimaryColor_ = '#ff0000';

    // Create and inject styles for the big play button
    this.injectStyles_();

    // Create the big play button element
    this.createBigPlayButton_();
  }

  /**
   * Gets the current primary color or default.
   * @return {string}
   * @private
   */
  getPrimaryColor_() {
    return /** @type {string} */ (
      this.currentConfig_.primaryColor || this.defaultPrimaryColor_);
  }

  /**
   * Injects the required styles for the layout manager.
   * @private
   */
  injectStyles_() {
    const styleId = 'shaka-layout-manager-styles';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        .shaka-video-container {
          position: relative;
        }
        .shaka-big-play-button {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          width: 80px;
          height: 80px;
          background-color: ${this.getPrimaryColor_()} !important;
          border-radius: 50%;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.3s ease;
          z-index: 100;
          opacity: 0.8;
        }
        .shaka-big-play-button:hover {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1.1);
        }
        .shaka-big-play-button::after {
          content: '';
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 20px 0 20px 35px;
          border-color: transparent transparent transparent white;
          margin-left: 7px;
        }
        .shaka-seek-bar .shaka-progress-bar-filled,
        .shaka-volume-bar .shaka-progress-bar-filled {
          background-color: ${this.getPrimaryColor_()};
        }
        .shaka-button-circle {
          border-radius: 50%;
        }
        .shaka-button-square {
          border-radius: 8px;
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Updates styles when configuration changes.
   * @private
   */
  updateStyles_() {
    const styleElement = document.getElementById('shaka-layout-manager-styles');
    if (styleElement) {
      styleElement.remove();
    }
    this.injectStyles_();
  }

  /**
   * Creates and sets up the big play button.
   * @private
   */
  createBigPlayButton_() {
    const container = this.controls_.getControlsContainer().parentElement;
    container.classList.add('shaka-video-container');

    const button = document.createElement('div');
    button.className = 'shaka-big-play-button';
    container.appendChild(button);

    // Add click handler
    button.addEventListener('click', () => {
      const video = this.controls_.getVideo();
      if (video.paused) {
        video.play();
        container.classList.add('playing');
        button.classList.add('playing');
      } else {
        video.pause();
        container.classList.remove('playing');
        button.classList.remove('playing');
      }
    });

    // Add video event listeners
    const video = this.controls_.getVideo();
    video.addEventListener('play', () => {
      container.classList.add('playing');
      button.classList.add('playing');
    });

    video.addEventListener('pause', () => {
      container.classList.remove('playing');
      button.classList.remove('playing');
    });
  }

  /**
   * Gets the controls container element.
   * @return {!HTMLElement}
   * @private
   * @throws {Error} If the controls container is not found
   */
  getControlsContainer_() {
    const container = this.parent_.querySelector('.shaka-controls-container');
    if (!container) {
      throw new Error('Could not find shaka controls container');
    }
    return /** @type {!HTMLElement} */ (container);
  }

  /**
   * Applies the provided configuration to the player layout.
   * @param {!shaka.ui.LayoutManager.Options} config
   * @export
   */
  applyConfig(config) {
    // Merge the new configuration with the current configuration
    this.currentConfig_ = /** @type {!shaka.ui.LayoutManager.Options} */ (
      Object.assign({}, this.currentConfig_, config)
    );

    // Update big play button
    const bigPlayButton = this.parent.querySelector('.shaka-big-play-button');
    if (bigPlayButton) {
      bigPlayButton.style.display =
        this.currentConfig_.addBigPlayButton ? '' : 'none';

      if (this.currentConfig_.initialPlayButtonShape) {
        bigPlayButton.classList
            .remove('shaka-play-button-circle', 'shaka-play-button-square');
        bigPlayButton.classList
            .add(`shaka-play-button-${this.currentConfig_
                .initialPlayButtonShape.toLowerCase()}`);
      }
    }

    // Update control panel elements
    if (this.currentConfig_.controlPanelElements) {
      this.updateControlPanel_(this.currentConfig_);
    }

    // Update primary color
    if (this.currentConfig_.primaryColor) {
      this.applyCustomStyles_(this.currentConfig_);
    }

    // Update other UI elements and settings
    this.updateSettingsMenu_(this.currentConfig_.collapseInSettings || []);
  }

  /**
   * Updates the control panel based on configuration.
   * @param {!shaka.ui.LayoutManager.Options} config
   * @private
   */
  updateControlPanel_(config) {
    const controlPanel = this.getControlsContainer_();
    if (!controlPanel) {
      return;
    }

    // Control panel elements visibility
    const controlSelectors = [
      {selector: '.shaka-play-pause-button',
        condition: config.showPlayPauseBtn},
      {selector: '.shaka-time-container',
        condition: config.showTimeText},
      {selector: '.shaka-fullscreen-button',
        condition: config.showFullScreen},
      {selector: '.shaka-resolution-button',
        condition: config.showQualityControl},
      {selector: '.shaka-speed-button',
        condition: config.showSpeedControl},
    ];

    for (let i = 0; i < controlSelectors.length; i++) {
      const {selector, condition} = controlSelectors[i];
      const element = controlPanel.querySelector(selector);
      if (element) {
        element.style.display = condition !== false ? '' : 'none';
      }
    }
  }

  /**
   * Applies custom styles based on the configuration.
   * @param {!shaka.ui.LayoutManager.Options} config
   * @private
   */
  applyCustomStyles_(config) {
    // Remove any existing custom big play button styles
    const existingStyles = document.querySelectorAll(
        'style[data-big-play-button-color]');
    for (let i = 0; i < existingStyles.length; i++) {
      existingStyles[i].remove();
    }

    // Update big play button color
    if (config.bigPlayButtonColor) {
      const style = document.createElement('style');
      style.setAttribute('data-big-play-button-color', 'true');
      style.textContent = `
        .shaka-big-play-button {
          background-color: ${config.bigPlayButtonColor} !important;
        }
        .shaka-big-play-button:hover {
          background-color: ${config.bigPlayButtonColor} !important;
          opacity: 1;
        }
      `;
      document.head.appendChild(style);

      // Additional method to ensure color is applied
      const container = this.getControlsContainer_();
      const bigPlayButton = container.querySelector('.shaka-big-play-button');
      if (bigPlayButton) {
        bigPlayButton.style.setProperty('background-color',
            config.bigPlayButtonColor, 'important');
      }
    }

    // Update seek bar and volume bar colors
    if (config.seekBarColors) {
      const style = document.createElement('style');
      style.textContent = `
        .shaka-seek-bar .shaka-progress-bar {
          background-color: ${config.seekBarColors.base ||
             'rgba(255, 255, 255, 0.3)'};
        }
        .shaka-seek-bar .shaka-progress-bar-filled {
          background-color: ${config.seekBarColors.played ||
             'rgb(255, 255, 255)'};
        }
        .shaka-volume-bar .shaka-progress-bar {
          background-color: ${config.seekBarColors.base ||
             'rgba(255, 255, 255, 0.3)'};
        }
        .shaka-volume-bar .shaka-progress-bar-filled {
          background-color: ${config.seekBarColors.played ||
             'rgb(255, 255, 255)'};
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Convert hex color to RGB values
   * @param {string} hex
   * @return {?{r: number, g: number, b: number}}
   * @private
   */
  hexToRGB_(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : null;
  }

  /**
   * Updates the settings menu with collapsed items.
   * @param {!Array<string>} collapsedItems
   * @private
   */
  updateSettingsMenu_(collapsedItems) {
    goog.asserts.assert(this.controls_, 'Controls must be initialized');
    const controls = this.controls_;
    if (typeof controls.setSettingsMenuItems === 'function') {
      controls.setSettingsMenuItems(collapsedItems);
    }
  }

  /**
   * Gets the current configuration.
   * @return {!Object}
   * @export
   */
  getCurrentConfig() {
    return this.currentConfig_;
  }
};
