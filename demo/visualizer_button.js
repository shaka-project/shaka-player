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

    /** @private {!HTMLElement} */
    this.icon_ = /** @type {!HTMLElement} */ (
      document.createElement('i'));
    this.icon_.classList.add('material-icons-round');
    this.setIcon_();
    this.button_.appendChild(this.icon_);

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
      this.setIcon_();
    });
  }

  /** @private */
  setIcon_() {
    if (shakaDemoMain.getIsVisualizerActive()) {
      this.icon_.textContent = 'bar_chart';
    } else {
      this.icon_.textContent = 'add_chart';
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
