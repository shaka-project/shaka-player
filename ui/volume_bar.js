/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.VolumeBar');

goog.require('goog.asserts');
goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.RangeElement');
goog.require('shaka.ui.Utils');


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

    if (!this.config_.alwaysShowVolumeBar) {
      this.container.classList.add('shaka-volume-bar-container-allow-hiding');
    }

    // We use a range of 100 to avoid problems with Firefox.
    // See https://github.com/shaka-project/shaka-player/issues/3987
    this.setRange(0, 100);

    this.eventManager.listen(this.video,
        'volumechange',
        () => this.onPresentationVolumeChange_());

    this.eventManager.listen(this.player,
        'loading',
        () => this.onPresentationVolumeChange_());

    this.eventManager.listen(this.player,
        'loaded',
        () => this.checkAvailability_());

    this.eventManager.listen(this.player,
        'unloading',
        () => this.checkAvailability_());

    this.eventManager.listen(this.player,
        'trackschanged',
        () => this.checkAvailability_());

    this.eventManager.listen(this.controls,
        'caststatuschanged',
        () => this.onPresentationVolumeChange_());

    this.eventManager.listen(this.adManager,
        shaka.ads.Utils.AD_VOLUME_CHANGED,
        () => this.onAdVolumeChange_());

    this.eventManager.listen(this.adManager,
        shaka.ads.Utils.AD_MUTED,
        () => this.onAdVolumeChange_());

    this.eventManager.listen(this.adManager,
        shaka.ads.Utils.AD_STARTED,
        () => this.checkAvailability_());

    this.eventManager.listen(this.adManager,
        shaka.ads.Utils.AD_STOPPED, () => {
          this.checkAvailability_();
          this.onPresentationVolumeChange_();
        });

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

    this.checkAvailability_();
  }

  /**
   * Update the video element's state to match the input element's state.
   * Called by the base class when the input element changes.
   *
   * @override
   */
  onChange() {
    if (this.ad && this.ad.isLinear()) {
      this.ad.setVolume(this.getValue() / 100);
    } else {
      this.video.volume = this.getValue() / 100;
      if (this.video.volume > 0) {
        this.video.muted = false;
      }
    }
  }

  /** @private */
  onPresentationVolumeChange_() {
    if (this.video.muted) {
      this.setValue(0);
    } else {
      this.setValue(this.video.volume * 100);
    }

    this.updateColors_();
  }

  /** @private */
  onAdVolumeChange_() {
    goog.asserts.assert(this.ad != null,
        'This.ad should exist at this point!');

    const volume = this.ad.getVolume();
    this.setValue(volume * 100);
    this.updateColors_();
  }

  /** @private */
  updateColors_() {
    const colors = this.config_.volumeBarColors;
    const gradient = ['to right'];
    gradient.push(colors.level + this.getValue() + '%');
    gradient.push(colors.base + this.getValue() + '%');
    gradient.push(colors.base + '100%');

    this.container.style.background =
        'linear-gradient(' + gradient.join(',') + ')';
  }

  /** @private */
  updateAriaLabel_() {
    this.bar.ariaLabel = this.localization.resolve(shaka.ui.Locales.Ids.VOLUME);
  }

  /** @private */
  checkAvailability_() {
    let available = true;
    if (this.ad && this.ad.isLinear()) {
      // We can't tell if the Ad has audio or not.
      available = true;
    } else if (this.player.isVideoOnly()) {
      available = false;
    }
    shaka.ui.Utils.setDisplay(this.container, available);
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
