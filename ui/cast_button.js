/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.CastButton');

goog.require('shaka.cast.CastProxy');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.MaterialSVGIcon');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.requireType('shaka.cast.CastProxy');
goog.requireType('shaka.ui.Controls');


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

    /** @private {!HTMLButtonElement} */
    this.castButton_ = shaka.util.Dom.createButton();
    this.castButton_.classList.add('shaka-cast-button');
    this.castButton_.classList.add('shaka-tooltip');
    this.castButton_.ariaPressed = 'false';

    /** @private {!shaka.ui.MaterialSVGIcon} */
    this.castIcon_ = new shaka.ui.MaterialSVGIcon(this.castButton_,
        shaka.ui.Enums.MaterialDesignSVGIcons.CAST);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    label.classList.add('shaka-simple-overflow-button-label-inline');
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
      if (!this.controls.isOpaque()) {
        return;
      }
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
          this.controls.dispatchEvent(new shaka.util.FakeEvent(
              'error', (new Map()).set('detail', error)));
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
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
    shaka.ui.Utils.setDisplay(this.castButton_, canCast);
    this.castIcon_.use(isCasting ? Icons.EXIT_CAST : Icons.CAST);

    // Aria-pressed set to true when casting, set to false otherwise.
    if (canCast) {
      if (isCasting) {
        this.castButton_.ariaPressed = 'true';
      } else {
        this.castButton_.ariaPressed = 'false';
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

    this.castButton_.ariaLabel = this.localization.resolve(LocIds.CAST);
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

shaka.ui.Controls.registerElement(
    'cast', new shaka.ui.CastButton.Factory());
