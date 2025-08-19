/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.VisualizerButton');

/**
 * A custom UI overflow button, to allow users to show the visualizer.
 * This cannot actually extend shaka.ui.Element, as that class does not exist
 * at load-time when in uncompiled mode.
 * @extends {shaka.ui.Element}
 */
shakaDemo.VisualizerButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.button_ = /** @type {!HTMLButtonElement} */ (
      document.createElement('button'));
    this.button_.classList.add('shaka-pip-button');
    this.button_.classList.add('shaka-tooltip');

    /** @private {!shaka.ui.MaterialSVGIcon} */
    this.icon_ = /** @type {!shaka.ui.MaterialSVGIcon} */ (
      new shaka.ui.MaterialSVGIcon(this.button_));
    this.setIcon_();

    const label = document.createElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    this.nameSpan_ = document.createElement('span');
    label.appendChild(this.nameSpan_);
    this.nameSpan_.textContent = 'Buffer Visualizer';

    /** @private {!HTMLElement} */
    this.currentPipState_ = /** @type {!HTMLElement} */ (
      document.createElement('span'));
    this.currentPipState_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentPipState_);

    this.button_.appendChild(label);

    this.parent.appendChild(this.button_);

    this.eventManager.listen(this.button_, 'click', () => {
      shakaDemoMain.setIsVisualizerActive(
          !shakaDemoMain.getIsVisualizerActive());
      shakaDemoMain.remakeHash();
      this.setIcon_();
    });

    /** @private {shaka.cast.CastProxy} */
    this.castProxy_ = this.controls.getCastProxy();

    this.eventManager.listen(this.controls, 'caststatuschanged', () => {
      this.button_.disabled = this.castProxy_.isCasting();
      if (this.castProxy_.isCasting() &&
          shakaDemoMain.getIsVisualizerActive()) {
        shakaDemoMain.setIsVisualizerActive(false);
      }
      this.setDisplay_(!this.castProxy_.isCasting());
    });

    this.eventManager.listen(document, 'fullscreenchange', () => {
      this.setDisplay_(!this.controls.isFullScreenEnabled());
    });

    this.setDisplay_(!this.controls.isFullScreenEnabled());
  }

  /** @private */
  setIcon_() {
    if (shakaDemoMain.getIsVisualizerActive()) {
      // eslint-disable-next-line @stylistic/max-len
      this.icon_.use('M680-160q-17 0-28.5-11.5T640-200v-200q0-17 11.5-28.5T680-440h80q17 0 28.5 11.5T800-400v200q0 17-11.5 28.5T760-160h-80Zm-240 0q-17 0-28.5-11.5T400-200v-560q0-17 11.5-28.5T440-800h80q17 0 28.5 11.5T560-760v560q0 17-11.5 28.5T520-160h-80Zm-240 0q-17 0-28.5-11.5T160-200v-360q0-17 11.5-28.5T200-600h80q17 0 28.5 11.5T320-560v360q0 17-11.5 28.5T280-160h-80Z');
    } else {
      // eslint-disable-next-line @stylistic/max-len
      this.icon_.use('M320-280q17 0 28.5-11.5T360-320v-200q0-17-11.5-28.5T320-560q-17 0-28.5 11.5T280-520v200q0 17 11.5 28.5T320-280Zm160 0q17 0 28.5-11.5T520-320v-320q0-17-11.5-28.5T480-680q-17 0-28.5 11.5T440-640v320q0 17 11.5 28.5T480-280Zm160 0q17 0 28.5-11.5T680-320v-80q0-17-11.5-28.5T640-440q-17 0-28.5 11.5T600-400v80q0 17 11.5 28.5T640-280Zm80-320q-17 0-28.5-11.5T680-640v-40h-40q-17 0-28.5-11.5T600-720q0-17 11.5-28.5T640-760h40v-40q0-17 11.5-28.5T720-840q17 0 28.5 11.5T760-800v40h40q17 0 28.5 11.5T840-720q0 17-11.5 28.5T800-680h-40v40q0 17-11.5 28.5T720-600ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h320q17 0 28.5 11.5T560-800v160q0 33 23.5 56.5T640-560h160q17 0 28.5 11.5T840-520v320q0 33-23.5 56.5T760-120H200Z');
    }
  }


  /**
   * @param {boolean} display
   * @private
   */
  setDisplay_(display) {
    if (display) {
      // Removing a non-existent class doesn't throw, so, even if
      // the element is not hidden, this should be fine.
      this.button_.classList.remove('shaka-hidden');
    } else {
      this.button_.classList.add('shaka-hidden');
    }
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shakaDemo.VisualizerButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shakaDemo.VisualizerButton(rootElement, controls);
  }
};

// This button is registered inside setup in shakaDemo.Main, rather than
// statically here, since shaka.ui.Controls does not exist in this stage of the
// load process.
