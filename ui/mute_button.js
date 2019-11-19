/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.MuteButton');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.MuteButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.button_ = shaka.util.Dom.createHTMLElement('button');
    this.button_.classList.add('shaka-mute-button');
    this.button_.classList.add('material-icons');
    this.button_.textContent = shaka.ui.Enums.MaterialDesignIcons.MUTE;
    this.parent.appendChild(this.button_);
    this.updateAriaLabel_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      if (this.ad) {
        this.ad.setMuted(!this.ad.isMuted());
      } else {
        this.video.muted = !this.video.muted;
      }
    });

    this.eventManager.listen(this.video, 'volumechange', () => {
      this.updateAriaLabel_();
      this.updateIcon_();
    });

    this.eventManager.listen(this.adManager,
        shaka.ads.AdManager.AD_VOLUME_CHANGED, () => {
          this.updateAriaLabel_();
          this.updateIcon_();
        });

    this.eventManager.listen(this.adManager,
        shaka.ads.AdManager.AD_MUTED, () => {
          this.updateAriaLabel_();
          this.updateIcon_();
        });

    this.eventManager.listen(this.adManager,
        shaka.ads.AdManager.AD_STOPPED, () => {
          // The base class also listens for this event and sets this.ad
          // to null. This is a safeguard in case of a race condition as
          // the label and icon code depends on this.ad being correctly
          // updated at the time it runs.
          this.ad = null;
          this.updateAriaLabel_();
          this.updateIcon_();
        });
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    const LocIds = shaka.ui.Locales.Ids;
    let label;
    if (this.ad) {
      label = this.ad.isMuted() ? LocIds.UNMUTE : LocIds.MUTE;
    } else {
      label = this.video.muted ? LocIds.UNMUTE : LocIds.MUTE;
    }

    this.button_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(label));
  }

  /**
   * @private
   */
  updateIcon_() {
    const Icons = shaka.ui.Enums.MaterialDesignIcons;
    let icon;
    if (this.ad) {
      icon = this.ad.isMuted() ? Icons.UNMUTE : Icons.MUTE;
    } else {
      icon = this.video.muted ? Icons.UNMUTE : Icons.MUTE;
    }
    this.button_.textContent = icon;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.MuteButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.MuteButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement('mute', new shaka.ui.MuteButton.Factory());
