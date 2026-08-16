/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.MuteVolumeBar');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.MuteButton');
goog.require('shaka.ui.VolumeBar');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.MuteVolumeBar = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /**
     * @private {!HTMLElement}
     */
    this.container_ = shaka.util.Dom.createHTMLElement('div');
    this.container_.classList.add('shaka-mute-volume-container');
    this.parent.appendChild(this.container_);

    /**
     * MuteButton rendered inside the shared container.
     * @private {!shaka.ui.MuteButton}
     */
    this.muteButton_ = new shaka.ui.MuteButton(this.container_, controls);

    /**
     * VolumeBar rendered inside the shared container.
     * @private {!shaka.ui.VolumeBar}
     */
    this.volumeBar_ = new shaka.ui.VolumeBar(this.container_, controls);
  }

  /** @override */
  release() {
    this.muteButton_.release();
    this.volumeBar_.release();
    super.release();
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.MuteVolumeBar.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.MuteVolumeBar(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'mute_volume', new shaka.ui.MuteVolumeBar.Factory());
