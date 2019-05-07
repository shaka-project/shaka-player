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


goog.provide('shaka.ui.PlayPauseButton');

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
shaka.ui.PlayPauseButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.button_ = shaka.util.Dom.createHTMLElement('button');
    this.button_.classList.add('shaka-play-pause-button');
    this.button_.classList.add('material-icons');
    this.parent.appendChild(this.button_);

    this.updateIcon_();
    this.updateAriaLabel_();

    const LOCALE_UPDATED = shaka.ui.Localization.LOCALE_UPDATED;
    this.eventManager.listen(this.localization, LOCALE_UPDATED, () => {
      this.updateAriaLabel_();
    });

    const LOCALE_CHANGED = shaka.ui.Localization.LOCALE_CHANGED;
    this.eventManager.listen(this.localization, LOCALE_CHANGED, () => {
      this.updateAriaLabel_();
    });

    this.eventManager.listen(this.video, 'play', () => {
      this.updateAriaLabel_();
      this.updateIcon_();
    });

    this.eventManager.listen(this.video, 'pause', () => {
      this.updateAriaLabel_();
      this.updateIcon_();
    });

    this.eventManager.listen(this.button_, 'click', () => {
      if (this.isPaused_()) {
        this.video.play();
      } else {
        this.video.pause();
      }
    });
  }

  /**
   * @return {boolean}
   * @private
   */
  isPaused_() {
    // The video element is in a paused state while seeking, but we don't count
    // that.
    return this.video.paused && !this.controls.isSeeking();
  }

  /** @private */
  updateAriaLabel_() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = this.isPaused_() ? LocIds.PLAY : LocIds.PAUSE;

    this.button_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(label));
  }

  /** @private */
  updateIcon_() {
    const Icons = shaka.ui.Enums.MaterialDesignIcons;
    this.button_.textContent = this.isPaused_() ? Icons.PLAY : Icons.PAUSE;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.PlayPauseButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.PlayPauseButton(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'play_pause', new shaka.ui.PlayPauseButton.Factory());
