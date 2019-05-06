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


goog.provide('shaka.ui.FullscreenButton');

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
shaka.ui.FullscreenButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    this.button_ = shaka.util.Dom.createHTMLElement('button');
    this.button_.classList.add('shaka-fullscreen-button');
    this.button_.classList.add('material-icons');

    // Don't show the button if fullscreen is not supported
    if (!document.fullscreenEnabled) {
      this.button_.classList.add('shaka-hidden');
    }

    this.button_.textContent = shaka.ui.Enums.MaterialDesignIcons.FULLSCREEN;
    this.parent.appendChild(this.button_);
    this.updateAriaLabel_();

    /** @private {!HTMLElement} */
    this.videoContainer_ = this.controls.getVideoContainer();

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
        this.updateAriaLabel_();
      });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
        this.updateAriaLabel_();
      });

    this.eventManager.listen(this.button_, 'click', () => {
        this.toggleFullScreen_();
      });

    if (screen.orientation) {
      this.eventManager.listen(screen.orientation, 'change', () => {
        this.onScreenRotation_();
      });
    }

    this.eventManager.listen(document, 'fullscreenchange', () => {
        this.updateIcon_();
        this.updateAriaLabel_();
      });
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = document.fullscreenElement ?
        LocIds.EXIT_FULL_SCREEN : LocIds.FULL_SCREEN;

    this.button_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(label));
  }

  /**
   * @private
   */
  updateIcon_() {
    this.button_.textContent =
      document.fullscreenElement ?
      shaka.ui.Enums.MaterialDesignIcons.EXIT_FULLSCREEN :
      shaka.ui.Enums.MaterialDesignIcons.FULLSCREEN;
  }

  /**
   * @private
   */
  async toggleFullScreen_() {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      // If you are in PiP mode, leave PiP mode first.
      try {
        if (document.pictureInPictureElement) {
          await document.exitPictureInPicture();
        }
      } catch (error) {
        this.controls.dispatchEvent(new shaka.util.FakeEvent('error', {
          detail: error,
        }));
      }
      await this.videoContainer_.requestFullscreen();
    }
  }

  /**
   * When a mobile device is rotated to landscape layout, and the video is
   * loaded, make the demo app go into fullscreen.
   * Similarly, exit fullscreen when the device is rotated to portrait layout.
   * @private
   */
  onScreenRotation_() {
    if (!this.video ||
        this.video.readyState == 0 ||
        this.controls.getCastProxy().isCasting()) return;

    if (screen.orientation.type.includes('landscape') &&
        !document.fullscreenElement) {
      this.videoContainer_.requestFullscreen();
    } else if (screen.orientation.type.includes('portrait') &&
        document.fullscreenElement) {
      document.exitFullscreen();
    }
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.FullscreenButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.FullscreenButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
  'fullscreen', new shaka.ui.FullscreenButton.Factory());

