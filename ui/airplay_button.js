/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AirPlayButton');

goog.require('goog.asserts');
goog.require('shaka.Player');
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
shaka.ui.AirPlayButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.airplayButton_ = shaka.util.Dom.createButton();
    this.airplayButton_.classList.add('shaka-airplay-button');
    this.airplayButton_.classList.add('shaka-tooltip');
    this.airplayButton_.ariaPressed = 'false';

    new shaka.ui.MaterialSVGIcon(this.airplayButton_).use(
        shaka.ui.Enums.MaterialDesignSVGIcons.AIRPLAY);

    // Don't show the button if AirPlay is not supported.
    if (!window.WebKitPlaybackTargetAvailabilityEvent) {
      this.airplayButton_.classList.add('shaka-hidden');
    }

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    this.airplayNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.airplayNameSpan_);

    this.airplayCurrentSelectionSpan_ =
      shaka.util.Dom.createHTMLElement('span');
    this.airplayCurrentSelectionSpan_.classList.add(
        'shaka-current-selection-span');
    label.appendChild(this.airplayCurrentSelectionSpan_);
    this.airplayButton_.appendChild(label);
    this.parent.appendChild(this.airplayButton_);

    // Setup strings in the correct language
    this.updateLocalizedStrings_();

    // Setup button display and state according to the current airplay status
    this.onAirPlayStatusChange_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.airplayButton_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.onAirPlayClick_();
    });

    const video = this.controls.getVideo();
    goog.asserts.assert(video != null, 'Should have a video!');

    this.eventManager.listen(video,
        'webkitplaybacktargetavailabilitychanged', (e) => {
          const event = /** @type {!AirPlayEvent} */ (e);
          this.onAirPlayAvailabilityChange_(event);
        });

    this.eventManager.listen(video,
        'webkitcurrentplaybacktargetiswirelesschanged', () => {
          this.onAirPlayStatusChange_();
        });
  }


  /**
   * @private
   */
  onAirPlayClick_() {
    const video = this.controls.getVideo();
    goog.asserts.assert(video != null, 'Should have a video!');
    video.webkitShowPlaybackTargetPicker();
  }

  /**
   * @param {!AirPlayEvent} e
   * @private
   */
  onAirPlayAvailabilityChange_(e) {
    const canCast = e.availability == 'available';
    const loadMode = this.player.getLoadMode();
    const srcMode = loadMode == shaka.Player.LoadMode.SRC_EQUALS;
    shaka.ui.Utils.setDisplay(this.airplayButton_, canCast && srcMode);
  }


  /**
   * @private
   */
  onAirPlayStatusChange_() {
    const video = this.controls.getVideo();
    goog.asserts.assert(video != null, 'Should have a video!');
    const isCasting = video && video.webkitCurrentPlaybackTargetIsWireless;

    // Aria-pressed set to true when casting, set to false otherwise.
    if (isCasting) {
      this.airplayButton_.ariaPressed = 'true';
    } else {
      this.airplayButton_.ariaPressed = 'false';
    }
  }


  /**
   * @private
   */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.airplayButton_.ariaLabel = this.localization.resolve(LocIds.AIRPLAY);
    this.airplayNameSpan_.textContent =
        this.localization.resolve(LocIds.AIRPLAY);
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.AirPlayButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.AirPlayButton(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'airplay', new shaka.ui.AirPlayButton.Factory());

shaka.ui.Controls.registerElement(
    'airplay', new shaka.ui.AirPlayButton.Factory());
