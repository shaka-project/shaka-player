/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


goog.provide('shaka.ui.PipButton');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');


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

    /** @private {!HTMLMediaElement} */
    this.localVideo_ = this.controls.getLocalVideo();

    const LocIds = shaka.ui.Locales.Ids;
    /** @private {!HTMLElement} */
    this.pipButton_ = shaka.ui.Utils.createHTMLElement('button');
    this.pipButton_.classList.add('shaka-pip-button');

    /** @private {!HTMLElement} */
    this.pipIcon_ = shaka.ui.Utils.createHTMLElement('i');
    this.pipIcon_.classList.add('material-icons');
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.PIP;
    this.pipButton_.appendChild(this.pipIcon_);

    const label = shaka.ui.Utils.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    this.pipNameSpan_ = shaka.ui.Utils.createHTMLElement('span');
    this.pipNameSpan_.textContent =
      this.localization.resolve(LocIds.LABEL_PICTURE_IN_PICTURE);
    label.appendChild(this.pipNameSpan_);

    /** @private {!HTMLElement} */
    this.currentPipState_ = shaka.ui.Utils.createHTMLElement('span');
    this.currentPipState_.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentPipState_);

    this.pipButton_.appendChild(label);

    this.updateLocalizedStrings_();

    this.parent.appendChild(this.pipButton_);

    // Don't display the button if PiP is not supported or not allowed
    // TODO: Can this ever change? Is it worth creating the button if the below
    // condition is true?
    if (!this.isPipAllowed_()) {
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
        this.onPipClick_();
      });

    this.eventManager.listen(
      this.localVideo_, 'enterpictureinpicture', () => {
        this.onEnterPictureInPicture_();
      });

    this.eventManager.listen(
      this.localVideo_, 'leavepictureinpicture', () => {
        this.onLeavePictureInPicture_();
      });

    this.eventManager.listen(this.controls, 'caststatuschange', (e) => {
        this.onCastStatusChange_(e);
      });
  }


  /**
   * @return {boolean}
   * @private
   */
  isPipAllowed_() {
    return document.pictureInPictureEnabled &&
        !this.video.disablePictureInPicture;
  }


  /**
   * @return {!Promise}
   * @private
   */
  async onPipClick_() {
    try {
      if (!document.pictureInPictureElement) {
        await this.video.requestPictureInPicture();
      } else {
        await document.exitPictureInPicture();
      }
    } catch (error) {
      this.controls.dispatchEvent(new shaka.util.FakeEvent('error', {
        errorDetails: error,
      }));
    }
  }


  /** @private */
  onEnterPictureInPicture_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.EXIT_PIP;
    this.pipButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.ARIA_LABEL_EXIT_PICTURE_IN_PICTURE));
    this.currentPipState_.textContent =
        this.localization.resolve(LocIds.LABEL_PICTURE_IN_PICTURE_ON);
  }


  /** @private */
  onLeavePictureInPicture_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.pipIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.PIP;
    this.pipButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.ARIA_LABEL_ENTER_PICTURE_IN_PICTURE));
    this.currentPipState_.textContent =
        this.localization.resolve(LocIds.LABEL_PICTURE_IN_PICTURE_OFF);
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.pipNameSpan_.textContent =
      this.localization.resolve(LocIds.LABEL_PICTURE_IN_PICTURE);

    const ariaLabel = document.pictureInPictureElement ?
                         LocIds.ARIA_LABEL_EXIT_PICTURE_IN_PICTURE :
                         LocIds.ARIA_LABEL_ENTER_PICTURE_IN_PICTURE;
    this.pipButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(ariaLabel));

    const currentPipState = document.pictureInPictureElement ?
                            LocIds.LABEL_PICTURE_IN_PICTURE_ON :
                            LocIds.LABEL_PICTURE_IN_PICTURE_OFF;

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
      if (this.isPipAllowed_()) {
        shaka.ui.Utils.setDisplay(this.pipButton_, false);
      }
    } else {
      if (this.isPipAllowed_()) {
        shaka.ui.Utils.setDisplay(this.pipButton_, true);
      }
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
