/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VolumeBar');

goog.require('goog.asserts');
goog.require('shaka.ads.AdManager');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.RangeElement');


/**
 * @extends {shaka.ui.RangeElement}
 * @final
 * @export
 */
shaka.ui.VolumeBar = class extends shaka.ui.RangeElement {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        ['shaka-volume-bar-container'], ['shaka-volume-bar']);

    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.controls.getConfig();

    this.eventManager.listen(this.video,
        'volumechange',
        () => this.onPresentationVolumeChange_());

    this.eventManager.listen(this.adManager,
        shaka.ads.AdManager.AD_VOLUME_CHANGED,
        () => this.onAdVolumeChange_());

    this.eventManager.listen(this.adManager,
        shaka.ads.AdManager.AD_MUTED,
        () => this.onAdVolumeChange_());

    this.eventManager.listen(this.adManager,
        shaka.ads.AdManager.AD_STOPPED,
        () => this.onPresentationVolumeChange_());

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_UPDATED,
        () => this.updateAriaLabel_());

    this.eventManager.listen(this.localization,
        shaka.ui.Localization.LOCALE_CHANGED,
        () => this.updateAriaLabel_());

    // Initialize volume display and label.
    this.onPresentationVolumeChange_();
    this.updateAriaLabel_();

    if (this.ad) {
      // There was already an ad.
      this.onChange();
    }
  }

  /**
   * Update the video element's state to match the input element's state.
   * Called by the base class when the input element changes.
   *
   * @override
   */
  onChange() {
    if (this.ad) {
      this.ad.setVolume(this.getValue());
    } else {
      this.video.volume = this.getValue();
      if (this.video.volume == 0) {
        this.video.muted = true;
      } else {
        this.video.muted = false;
      }
    }
  }

  /** @private */
  onPresentationVolumeChange_() {
    if (this.video.muted) {
      this.setValue(0);
    } else {
      this.setValue(this.video.volume);
    }

    this.updateColors_();
  }

  /** @private */
  onAdVolumeChange_() {
    goog.asserts.assert(this.ad != null,
        'This.ad should exist at this point!');

    const volume = this.ad.getVolume();
    this.setValue(volume);
    this.updateColors_();
  }

  /** @private */
  updateColors_() {
    const colors = this.config_.volumeBarColors;
    const gradient = ['to right'];
    gradient.push(colors.level + (this.getValue() * 100) + '%');
    gradient.push(colors.base + (this.getValue() * 100) + '%');
    gradient.push(colors.base + '100%');

    this.container.style.background =
        'linear-gradient(' + gradient.join(',') + ')';
  }

  /** @private */
  updateAriaLabel_() {
    this.bar.ariaLabel = this.localization.resolve(shaka.ui.Locales.Ids.VOLUME);
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.VolumeBar.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.VolumeBar(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement('volume', new shaka.ui.VolumeBar.Factory());
