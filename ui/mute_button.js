/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.MuteButton');

goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
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

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-mute-button');
    this.button_.classList.add('shaka-tooltip');
    this.button_.classList.add('shaka-no-propagation');
    this.button_.ariaPressed = 'false';

    /** @private {!shaka.ui.Icon} */
    this.icon_ = new shaka.ui.Icon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons['MUTE']);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    this.nameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.nameSpan_);

    /** @private {!HTMLElement} */
    this.currentState_ = shaka.util.Dom.createHTMLElement('span');
    this.currentState_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentState_);

    this.button_.appendChild(label);

    this.parent.appendChild(this.button_);
    this.updateLocalizedStrings();
    this.updateIcon_();

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      if (this.ad && this.ad.isLinear()) {
        this.ad.setMuted(!this.ad.isMuted());
      } else {
        if (!this.video.muted && this.video.volume == 0) {
          this.video.volume = 1;
        } else {
          this.video.muted = !this.video.muted;
        }
      }
    });

    this.eventManager.listen(this.video, 'volumechange', () => {
      this.updateLocalizedStrings();
      this.updateIcon_();
    });

    this.eventManager.listen(this.player, 'loading', () => {
      this.updateLocalizedStrings();
      this.updateIcon_();
    });

    this.eventManager.listenMulti(
        this.player,
        [
          'loaded',
          'unloading',
          'trackschanged',
        ], () => {
          this.checkAvailability();
        });

    this.eventManager.listen(this.controls, 'caststatuschanged', () => {
      this.updateLocalizedStrings();
      this.updateIcon_();
    });

    this.eventManager.listenMulti(
        this.adManager,
        [
          shaka.ads.Utils.AD_VOLUME_CHANGED,
          shaka.ads.Utils.AD_MUTED,
        ], () => {
          this.updateLocalizedStrings();
          this.updateIcon_();
        });

    this.eventManager.listen(this.adManager,
        shaka.ads.Utils.AD_STARTED, () => {
          this.checkAvailability();
        });

    this.eventManager.listen(this.adManager,
        shaka.ads.Utils.AD_STOPPED, () => {
          // The base class also listens for this event and sets this.ad
          // to null. This is a safeguard in case of a race condition as
          // the label and icon code depends on this.ad being correctly
          // updated at the time it runs.
          this.ad = null;
          this.updateLocalizedStrings();
          this.updateIcon_();
          this.checkAvailability();
        });

    this.checkAvailability();
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;
    let locId;
    if (this.ad && this.ad.isLinear()) {
      locId = this.ad.isMuted() ? LocIds.UNMUTE : LocIds.MUTE;
    } else {
      locId = (this.video.muted || this.video.volume == 0) ?
          LocIds.UNMUTE : LocIds.MUTE;
    }
    const label = this.localization.resolve(locId);

    this.button_.ariaLabel = label;
    this.button_.ariaPressed = locId == LocIds.UNMUTE ? 'true' : 'false';
    this.nameSpan_.textContent = label;
  }

  /**
   * @private
   */
  updateIcon_() {
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    let icon;
    if (this.ad && this.ad.isLinear()) {
      icon = this.ad.isMuted() ? Icons['UNMUTE'] : Icons['MUTE'];
    } else {
      icon = (this.video.muted || this.video.volume == 0) ?
          Icons['UNMUTE'] : Icons['MUTE'];
    }
    this.icon_.use(icon);
  }

  /** @override */
  checkAvailability() {
    let available = true;
    if (this.ad && this.ad.isLinear()) {
      // We can't tell if the Ad has audio or not.
      available = true;
    } else if (this.player.isVideoOnly()) {
      available = false;
    }
    shaka.ui.Utils.setDisplay(this.button_, available && !this.isSubMenuOpened);
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

shaka.ui.OverflowMenu.registerElement(
    'mute', new shaka.ui.MuteButton.Factory());

shaka.ui.Controls.registerElement(
    'mute', new shaka.ui.MuteButton.Factory());

shaka.ui.Controls.registerBigElement(
    'mute', new shaka.ui.MuteButton.Factory());
