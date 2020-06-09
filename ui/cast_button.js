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


goog.provide('shaka.ui.CastButton');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.CastButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {shaka.cast.CastProxy} */
    this.castProxy_ = this.controls.getCastProxy();

    /** @private {!HTMLElement} */
    this.castButton_ = shaka.util.Dom.createHTMLElement('button');
    this.castButton_.classList.add('shaka-cast-button');
    this.castButton_.setAttribute('aria-pressed', 'false');

    /** @private {!HTMLElement} */
    this.castIcon_ = shaka.util.Dom.createHTMLElement('i');
    this.castIcon_.classList.add('material-icons-round');
    this.castIcon_.textContent = shaka.ui.Enums.MaterialDesignIcons.CAST;
    this.castButton_.appendChild(this.castIcon_);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    this.castNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.castNameSpan_);

    this.castCurrentSelectionSpan_ =
      shaka.util.Dom.createHTMLElement('span');
    this.castCurrentSelectionSpan_.classList.add(
      'shaka-current-selection-span');
    label.appendChild(this.castCurrentSelectionSpan_);
    this.castButton_.appendChild(label);
    this.parent.appendChild(this.castButton_);

    // Setup strings in the correct language
    this.updateLocalizedStrings_();

    // Setup button display and state according to the current cast status
    this.onCastStatusChange_();

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
        this.updateLocalizedStrings_();
    });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
        this.updateLocalizedStrings_();
    });

    this.eventManager.listen(this.castButton_, 'click', () => {
        this.onCastClick_();
      });

    this.eventManager.listen(this.controls, 'caststatuschanged', () => {
        this.onCastStatusChange_();
      });
  }


    /** @private */
  async onCastClick_() {
    if (this.castProxy_.isCasting()) {
      this.castProxy_.suggestDisconnect();
    } else {
      try {
        this.castButton_.disabled = true;
        await this.castProxy_.cast();
        this.castButton_.disabled = false;
      } catch (error) {
        this.castButton_.disabled = false;
        if (error.code != shaka.util.Error.Code.CAST_CANCELED_BY_USER) {
          this.controls.dispatchEvent(new shaka.util.FakeEvent('error', {
            detail: error,
          }));
        }
      }
    }
  }


  /**
   * @private
   */
  onCastStatusChange_() {
    const canCast = this.castProxy_.canCast() && this.controls.isCastAllowed();
    const isCasting = this.castProxy_.isCasting();
    const materialDesignIcons = shaka.ui.Enums.MaterialDesignIcons;
    shaka.ui.Utils.setDisplay(this.castButton_, canCast);
    this.castIcon_.textContent = isCasting ?
                                   materialDesignIcons.EXIT_CAST :
                                   materialDesignIcons.CAST;

    // Aria-pressed set to true when casting, set to false otherwise.
    if (canCast) {
      if (isCasting) {
        this.castButton_.setAttribute('aria-pressed', 'true');
      } else {
        this.castButton_.setAttribute('aria-pressed', 'false');
      }
    }

    this.setCurrentCastSelection_();
  }


  /**
   * @private
   */
  setCurrentCastSelection_() {
    if (this.castProxy_.isCasting()) {
      this.castCurrentSelectionSpan_.textContent =
          this.castProxy_.receiverName();
    } else {
      this.castCurrentSelectionSpan_.textContent =
          this.localization.resolve(shaka.ui.Locales.Ids.OFF);
    }
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.castButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.CAST));
    this.castNameSpan_.textContent =
        this.localization.resolve(LocIds.CAST);

    // If we're not casting, string "not casting" will be displayed,
    // which needs localization.
    this.setCurrentCastSelection_();
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.CastButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.CastButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
  'cast', new shaka.ui.CastButton.Factory());
