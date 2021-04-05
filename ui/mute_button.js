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
    this.button_.classList.add('material-icons-round');
    this.parent.appendChild(this.button_);
    this.updateAriaLabel_();
    this.updateIcon_();

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
        this.updateAriaLabel_();
      });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
        this.updateAriaLabel_();
      });

    this.eventManager.listen(this.button_, 'click', () => {
      this.video.muted = !this.video.muted;
    });

    this.eventManager.listen(this.video, 'volumechange', () => {
      this.updateAriaLabel_();
      this.updateIcon_();
    });
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = this.video.muted ? LocIds.UNMUTE : LocIds.MUTE;

    this.button_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(label));
  }

  /**
   * @private
   */
  updateIcon_() {
    this.button_.textContent = this.video.muted ?
                               shaka.ui.Enums.MaterialDesignIcons.UNMUTE :
                               shaka.ui.Enums.MaterialDesignIcons.MUTE;
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
