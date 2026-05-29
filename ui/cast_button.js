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
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
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

    /** @private {!shaka.ui.Icon} */
    this.castIcon_ = new shaka.ui.Icon(this.castButton_,
        shaka.ui.Enums.MaterialDesignSVGIcons['CAST']);

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
    this.updateLocalizedStrings();

    // Setup button display and state according to the current cast status
    this.onCastStatusChange_();

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
   *
   * Updates icon and aria state. Delegates visibility to checkAvailability()
   * so that the submenu state is always factored in from a single place.
   */
  onCastStatusChange_() {
    const isCasting = this.castProxy_.isCasting();
    const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;

    this.castIcon_.use(isCasting ? Icons['EXIT_CAST'] : Icons['CAST']);

    const canCast = this.castProxy_.canCast() && this.controls.isCastAllowed();
    if (canCast) {
      this.castButton_.ariaPressed = isCasting ? 'true' : 'false';
    }

    this.setCurrentCastSelection_();
    this.checkAvailability();
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

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    const label = this.localization.resolve(LocIds.CAST);
    this.castButton_.ariaLabel = label;
    this.castNameSpan_.textContent = label;

    // If we're not casting, string "not casting" will be displayed,
    // which needs localization.
    this.setCurrentCastSelection_();
  }

  /** @override */
  checkAvailability() {
    const canCast = this.castProxy_.canCast() && this.controls.isCastAllowed();
    shaka.ui.Utils.setDisplay(
        this.castButton_, canCast && !this.isSubMenuOpened);
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
