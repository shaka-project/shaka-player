/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.ToggleStereoscopicButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.MaterialSVGIcon');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.ToggleStereoscopicButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.toggleStereoscopicButton_ = shaka.util.Dom.createButton();
    this.toggleStereoscopicButton_.classList.add(
        'shaka-toggle-stereoscopic-button');
    this.toggleStereoscopicButton_.classList.add('shaka-tooltip');
    this.toggleStereoscopicButton_.ariaPressed = 'false';

    /** @private {!shaka.ui.MaterialSVGIcon} */
    this.toggleStereoscopicIcon_ = new shaka.ui.MaterialSVGIcon(
        this.toggleStereoscopicButton_,
        shaka.ui.Enums.MaterialDesignSVGIcons.TOGGLE_STEREOSCOPIC);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    this.toggleStereoscopicNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.toggleStereoscopicNameSpan_);

    this.toggleStereoscopicCurrentSelectionSpan_ =
      shaka.util.Dom.createHTMLElement('span');
    this.toggleStereoscopicCurrentSelectionSpan_.classList.add(
        'shaka-current-selection-span');
    label.appendChild(this.toggleStereoscopicCurrentSelectionSpan_);
    this.toggleStereoscopicButton_.appendChild(label);
    this.parent.appendChild(this.toggleStereoscopicButton_);

    // Setup strings in the correct language
    this.updateLocalizedStrings_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    const vr = this.controls.getVR();

    this.eventManager.listen(this.toggleStereoscopicButton_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      vr.toggleStereoscopicMode();
    });

    this.eventManager.listen(vr, 'vrstatuschanged', () => {
      this.checkAvailability_();
    });

    this.checkAvailability_();
  }


  /**
   * @private
   */
  checkAvailability_() {
    shaka.ui.Utils.setDisplay(this.toggleStereoscopicButton_,
        this.controls.isPlayingVR());
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.toggleStereoscopicButton_.ariaLabel =
        this.localization.resolve(LocIds.TOGGLE_STEREOSCOPIC);
    this.toggleStereoscopicNameSpan_.textContent =
        this.localization.resolve(LocIds.TOGGLE_STEREOSCOPIC);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.ToggleStereoscopicButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.ToggleStereoscopicButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'toggle_stereoscopic', new shaka.ui.ToggleStereoscopicButton.Factory());

shaka.ui.Controls.registerElement(
    'toggle_stereoscopic', new shaka.ui.ToggleStereoscopicButton.Factory());
