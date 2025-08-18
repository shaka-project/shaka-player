/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SaveVideoFrameButton');

goog.require('shaka.ads.Utils');
goog.require('shaka.cast.CastProxy');
goog.require('shaka.ui.ContextMenu');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.MaterialSVGIcon');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');


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

    const LocIds = shaka.ui.Locales.Ids;
    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-save.video-frame-button');
    this.button_.classList.add('shaka-tooltip');

    /** @private {!shaka.ui.MaterialSVGIcon} */
    this.icon_ = new shaka.ui.MaterialSVGIcon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons.DOWNLOAD);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    this.nameSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.nameSpan_.textContent =
        this.localization.resolve(LocIds.DOWNLOAD_VIDEO_FRAME);
    label.appendChild(this.nameSpan_);

    /** @private {!HTMLElement} */
    this.currentState_ = shaka.util.Dom.createHTMLElement('span');
    this.currentState_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentState_);

    this.button_.appendChild(label);

    this.updateLocalizedStrings_();

    this.parent.appendChild(this.button_);

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      this.onClick_();
    });

    const vr = this.controls.getVR();
    this.eventManager.listen(vr, 'vrstatuschanged', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(
        this.adManager, shaka.ads.Utils.AD_STARTED, () => {
          this.checkAvailability_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.Utils.AD_STOPPED, () => {
          this.checkAvailability_();
        });

    this.eventManager.listen(this.player, 'unloading', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.player, 'loaded', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.video, 'play', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.video, 'pause', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.video, 'seeking', () => {
      this.checkAvailability_();
    });

    this.eventManager.listen(this.controls, 'caststatuschanged', () => {
      this.checkAvailability_();
    });

    this.checkAvailability_();
  }


  /** @private */
  onClick_() {
    const canvas = /** @type {!HTMLCanvasElement}*/ (
      document.createElement('canvas'));
    const context = /** @type {CanvasRenderingContext2D} */ (
      canvas.getContext('2d'));

    const video = /** @type {!HTMLVideoElement} */ (
      this.controls.getLocalVideo());

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataURL = canvas.toDataURL('image/png');

    const downloadLink = /** @type {!HTMLAnchorElement}*/ (
      document.createElement('a'));
    downloadLink.href = dataURL;
    downloadLink.download =
        'videoframe_' + video.currentTime.toFixed(3) + '.png';
    downloadLink.click();
  }


  /**
   * @private
   */
  checkAvailability_() {
    let available = true;
    if (this.controls.isPlayingVR()) {
      available = false;
    }
    if (available && this.castProxy_.isCasting()) {
      available = false;
    }
    if (available &&
        (this.player.drmInfo() || this.player.isAudioOnly())) {
      available = false;
    }
    if (available && this.ad) {
      available = false;
    }
    if (available &&
        this.video.remote && this.video.remote.state != 'disconnected') {
      available = false;
    }
    shaka.ui.Utils.setDisplay(this.button_, available);
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.button_.ariaLabel =
        this.localization.resolve(LocIds.DOWNLOAD_VIDEO_FRAME);
    this.nameSpan_.textContent =
        this.localization.resolve(LocIds.DOWNLOAD_VIDEO_FRAME);
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

shaka.ui.ContextMenu.registerElement(
    'save_video_frame', new shaka.ui.SaveVideoFrameButton.Factory());
