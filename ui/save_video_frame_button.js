/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SaveVideoFrameButton');

goog.require('shaka.ads.Utils');
goog.require('shaka.cast.CastProxy');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.MediaElementEvent');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.SaveVideoFrameButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {shaka.cast.CastProxy} */
    this.castProxy_ = this.controls.getCastProxy();

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-save.video-frame-button');
    this.button_.classList.add('shaka-tooltip');

    /** @private {!shaka.ui.Icon} */
    this.icon_ = new shaka.ui.Icon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons['DOWNLOAD']);

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

    this.updateLocalizedStrings();

    this.parent.appendChild(this.button_);

    this.eventManager.listen(this.button_, 'click', () => {
      this.controls.takeScreenshot();
    });

    const vr = this.controls.getVR();
    this.eventManager.listen(vr, 'vrstatuschanged', () => {
      this.checkAvailability();
    });

    this.eventManager.listenMulti(
        this.adManager,
        [
          shaka.ads.Utils.AD_STARTED,
          shaka.ads.Utils.AD_STOPPED,
        ], () => {
          this.checkAvailability();
        });

    this.eventManager.listenMulti(
        this.player,
        [
          'unloading',
          'loaded',
        ], () => {
          this.checkAvailability();
        });

    this.eventManager.listenMulti(
        this.video,
        [
          shaka.util.MediaElementEvent.PLAY,
          shaka.util.MediaElementEvent.PAUSE,
          shaka.util.MediaElementEvent.SEEKING,
        ], () => {
          this.checkAvailability();
        });

    this.eventManager.listen(this.controls, 'caststatuschanged', () => {
      this.checkAvailability();
    });

    this.checkAvailability();
  }

  /** @override */
  checkAvailability() {
    shaka.ui.Utils.setDisplay(this.button_,
        this.controls.canTakeScreenshot() && !this.isSubMenuOpened);
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = this.localization.resolve(LocIds.DOWNLOAD_VIDEO_FRAME);
    this.button_.ariaLabel = label;
    this.nameSpan_.textContent = label;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SaveVideoFrameButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SaveVideoFrameButton(rootElement, controls);
  }
};


shaka.ui.OverflowMenu.registerElement(
    'save_video_frame', new shaka.ui.SaveVideoFrameButton.Factory());
