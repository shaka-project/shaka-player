/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.RecenterVRButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.RecenterVRButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.recenterVRButton_ = shaka.util.Dom.createButton();
    this.recenterVRButton_.classList.add('shaka-recenter-vr-button');
    this.recenterVRButton_.classList.add('shaka-tooltip');

    /** @private {!shaka.ui.Icon} */
    this.recenterVRIcon_ = new shaka.ui.Icon(this.recenterVRButton_,
        shaka.ui.Enums.MaterialDesignSVGIcons['RECENTER_VR']);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    this.recenterVRNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.recenterVRNameSpan_);

    this.recenterVRCurrentSelectionSpan_ =
      shaka.util.Dom.createHTMLElement('span');
    this.recenterVRCurrentSelectionSpan_.classList.add(
        'shaka-current-selection-span');
    label.appendChild(this.recenterVRCurrentSelectionSpan_);
    this.recenterVRButton_.appendChild(label);
    this.parent.appendChild(this.recenterVRButton_);

    // Setup strings in the correct language
    this.updateLocalizedStrings();

    const vr = this.controls.getVR();

    this.eventManager.listen(this.recenterVRButton_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      vr.reset();
    });

    this.eventManager.listen(vr, 'vrstatuschanged', () => {
      this.checkAvailability();
    });

    this.checkAvailability();
  }

  /** @override */
  checkAvailability() {
    shaka.ui.Utils.setDisplay(this.recenterVRButton_,
        this.controls.isPlayingVR() && !this.isSubMenuOpened);
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;
    const label = this.localization.resolve(LocIds.RECENTER_VR);
    this.recenterVRButton_.ariaLabel = label;
    this.recenterVRNameSpan_.textContent = label;
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.RecenterVRButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.RecenterVRButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'recenter_vr', new shaka.ui.RecenterVRButton.Factory());

shaka.ui.Controls.registerElement(
    'recenter_vr', new shaka.ui.RecenterVRButton.Factory());
