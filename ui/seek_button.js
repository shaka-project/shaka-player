/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SeekButton');

goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * Button that seeks backward or forward a fixed number of seconds, set by
 * the seekButtonDistance config.
 * Pass isForward=true to seek forward, false to seek backward.
 *
 * @extends {shaka.ui.Element}
 * @export
 */
shaka.ui.SeekButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {boolean} isForward  true → seek forward; false → seek backward
   */
  constructor(parent, controls, isForward) {
    super(parent, controls);

    /** @private {boolean} */
    this.isForward_ = isForward;

    /** @private {number} */
    this.distance_ = this.controls.getConfig().seekButtonDistance;

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add(isForward ?
        'shaka-seek-forward-button' : 'shaka-seek-backward-button');
    this.button_.classList.add('shaka-tooltip');
    this.button_.classList.add('shaka-no-propagation');

    const icon = new shaka.ui.Icon(this.button_);
    icon.use(shaka.ui.Enums.MaterialDesignSVGIcons[isForward ?
      'REPLAY_FORWARD' : 'REPLAY']);

    // The number of seconds goes inside the circular arrow.  It is part of
    // the SVG so that it scales with the icon, both in the control panel and
    // as a big button.
    const text = shaka.util.Dom.createSVGElement('text');
    text.classList.add('shaka-seek-button-distance');
    const distanceText = String(this.distance_);
    text.textContent = distanceText;
    text.setAttribute('x', '480');
    text.setAttribute('y', '-440');
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'central');
    text.setAttribute('font-size', distanceText.length > 2 ? '210' : '280');
    icon.getSvgElement().appendChild(text);

    this.parent.appendChild(this.button_);

    this.updateLocalizedStrings();
    this.checkAvailability();

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque() || !this.controls.isSeekBarShowing()) {
        return;
      }
      this.controls.seekIncrement(
          this.isForward_ ? this.distance_ : -this.distance_);
    });

    // The seek bar hides itself when there is nothing to seek (e.g. live
    // without a DVR window, or a linear ad), and it is created after the big
    // buttons, so follow its state on every refresh.
    this.eventManager.listen(this.controls, 'timeandseekrangeupdated', () => {
      this.checkAvailability();
    });
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;
    this.button_.ariaLabel = this.localization.resolve(
        this.isForward_ ? LocIds.SEEK_FORWARD : LocIds.SEEK_BACKWARD)
        .replace('[SECONDS]', String(this.distance_));
  }

  /** @override */
  checkAvailability() {
    shaka.ui.Utils.setDisplay(this.button_,
        this.distance_ > 0 && this.controls.isSeekBarShowing());
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SeekButton.SeekBackwardFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SeekButton(
        rootElement, controls, /* isForward= */ false);
  }
};

shaka.ui.Controls.registerElement(
    'seek_backward', new shaka.ui.SeekButton.SeekBackwardFactory());

shaka.ui.Controls.registerBigElement(
    'seek_backward', new shaka.ui.SeekButton.SeekBackwardFactory());


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.SeekButton.SeekForwardFactory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.SeekButton(
        rootElement, controls, /* isForward= */ true);
  }
};

shaka.ui.Controls.registerElement(
    'seek_forward', new shaka.ui.SeekButton.SeekForwardFactory());

shaka.ui.Controls.registerBigElement(
    'seek_forward', new shaka.ui.SeekButton.SeekForwardFactory());
