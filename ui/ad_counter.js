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


goog.provide('shaka.ui.AdCounter');

goog.require('goog.asserts');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Localization');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.AdCounter = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    this.container_ = shaka.util.Dom.createHTMLElement('div');
    this.container_.classList.add('shaka-ad-counter');
    this.parent.appendChild(this.container_);

    /** @private {!HTMLElement} */
    this.span_ = shaka.util.Dom.createHTMLElement('span');
    this.container_.appendChild(this.span_);

    /**
     * The timer that tracks down the ad progress.
     *
     * @private {shaka.util.Timer}
     */
    this.timer_ = new shaka.util.Timer(() => {
      this.onTimerTick_();
    });

    this.updateAriaLabel_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateAriaLabel_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STARTED, () => {
          this.onAdStarted_();
        });

    this.eventManager.listen(
        this.adManager, shaka.ads.AdManager.AD_STOPPED, () => {
          this.reset_();
        });
  }

  /**
   * @private
   */
  updateAriaLabel_() {
    // TODO
  }

  /**
   * @private
   */
  onAdStarted_() {
    this.timer_.tickNow();
    this.timer_.tickEvery(0.5);
  }

  /**
   * @private
   */
  onTimerTick_() {
    goog.asserts.assert(this.ad != null,
        'this.ad should exist at this point');

    const secondsLeft = Math.round(this.ad.getRemainingTime());
    if (secondsLeft > 0) {
      // TODO: This should be formatted and localized according to the
      // loc team's guidelines on the localization of expressions.
      // e.g. the string should be something like 'Ad: %remainingAdTime%.'
      this.span_.textContent = 'Ad: ' + secondsLeft;
    } else {
      this.reset_();
    }
  }

  /**
   * @private
   */
  reset_() {
    this.timer_.stop();
    // Controls are going to hide the whole ad panel once the ad is over,
    // this is just a safeguard.
    this.span_.textContent = '';
  }
};

