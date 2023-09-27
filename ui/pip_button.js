/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.PipButton');

goog.require('shaka.ui.ContextMenu');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.PipButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {HTMLMediaElement} */
    this.localVideo_ = this.controls.getLocalVideo();

    /** @private {HTMLElement } */
    this.videoContainer_ = this.controls.getVideoContainer();

    const LocIds = shaka.ui.Locales.Ids;
    /** @private {!HTMLButtonElement} */
    this.pipButton_ = shaka.util.Dom.createButton();
    this.pipButton_.classList.add('shaka-pip-button');
    this.pipButton_.classList.add('shaka-tooltip');

    /** @private {!HTMLElement} */
    this.pipIcon_ = shaka.util.Dom.createHTMLElement('i');
    this.pipIcon_.classList.add('material-icons-round');
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.PIP;
    this.pipButton_.appendChild(this.pipIcon_);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    this.pipNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.pipNameSpan_.textContent =
      this.localization.resolve(LocIds.PICTURE_IN_PICTURE);
    label.appendChild(this.pipNameSpan_);

    /** @private {!HTMLElement} */
    this.currentPipState_ = shaka.util.Dom.createHTMLElement('span');
    this.currentPipState_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentPipState_);

    this.pipButton_.appendChild(label);

    this.updateLocalizedStrings_();

    this.parent.appendChild(this.pipButton_);

    // Don't display the button if PiP is not supported or not allowed.
    // TODO: Can this ever change? Is it worth creating the button if the below
    // condition is true?
    if (!this.controls.isPiPAllowed()) {
      shaka.ui.Utils.setDisplay(this.pipButton_, false);
    }

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.pipButton_, 'click', () => {
      this.controls.togglePiP();
    });

    this.eventManager.listen(this.localVideo_, 'enterpictureinpicture', () => {
      this.onEnterPictureInPicture_();
    });

    this.eventManager.listen(this.localVideo_, 'leavepictureinpicture', () => {
      this.onLeavePictureInPicture_();
    });

    this.eventManager.listen(this.controls, 'caststatuschanged', (e) => {
      this.onCastStatusChange_(e);
    });

    this.eventManager.listen(this.player, 'trackschanged', () => {
      this.onTracksChanged_();
    });

    if ('documentPictureInPicture' in window) {
      this.eventManager.listen(window.documentPictureInPicture, 'enter',
          (e) => {
            this.onEnterPictureInPicture_();

            const event = /** @type {DocumentPictureInPictureEvent} */(e);
            const pipWindow = event.window;
            this.eventManager.listenOnce(pipWindow, 'pagehide', () => {
              this.onLeavePictureInPicture_();
            });
          });
    }
  }

  /** @private */
  onEnterPictureInPicture_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.EXIT_PIP;
    this.pipButton_.ariaLabel =
        this.localization.resolve(LocIds.EXIT_PICTURE_IN_PICTURE);
    this.currentPipState_.textContent =
        this.localization.resolve(LocIds.ON);
  }


  /** @private */
  onLeavePictureInPicture_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.PIP;
    this.pipButton_.ariaLabel =
        this.localization.resolve(LocIds.ENTER_PICTURE_IN_PICTURE);
    this.currentPipState_.textContent =
        this.localization.resolve(LocIds.OFF);
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.pipNameSpan_.textContent =
      this.localization.resolve(LocIds.PICTURE_IN_PICTURE);

    const enabled = this.controls.isPiPEnabled();

    const ariaLabel = enabled ?
        LocIds.EXIT_PICTURE_IN_PICTURE :
        LocIds.ENTER_PICTURE_IN_PICTURE;
    this.pipButton_.ariaLabel = this.localization.resolve(ariaLabel);

    const currentPipState = enabled ? LocIds.ON : LocIds.OFF;

    this.currentPipState_.textContent =
        this.localization.resolve(currentPipState);
  }

  /**
   * @param {Event} e
   * @private
   */
  onCastStatusChange_(e) {
    const isCasting = e['newStatus'];

    if (isCasting) {
      // Picture-in-picture is not applicable if we're casting
      if (this.controls.isPiPAllowed()) {
        shaka.ui.Utils.setDisplay(this.pipButton_, false);
      }
    } else {
      if (this.controls.isPiPAllowed()) {
        shaka.ui.Utils.setDisplay(this.pipButton_, true);
      }
    }
  }


  /**
   * Display the picture-in-picture button only when the content contains video.
   * If it's displaying in picture-in-picture mode, and an audio only content is
   * loaded, exit the picture-in-picture display.
   * @return {!Promise}
   * @private
   */
  async onTracksChanged_() {
    if (!this.controls.isPiPAllowed()) {
      shaka.ui.Utils.setDisplay(this.pipButton_, false);
    } else if (this.player && this.player.isAudioOnly()) {
      shaka.ui.Utils.setDisplay(this.pipButton_, false);
      if (this.controls.isPiPEnabled()) {
        await this.controls.togglePiP();
      }
    } else {
      shaka.ui.Utils.setDisplay(this.pipButton_, true);
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.PipButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.PipButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'picture_in_picture', new shaka.ui.PipButton.Factory());

shaka.ui.Controls.registerElement(
    'picture_in_picture', new shaka.ui.PipButton.Factory());

shaka.ui.ContextMenu.registerElement(
    'picture_in_picture', new shaka.ui.PipButton.Factory());
