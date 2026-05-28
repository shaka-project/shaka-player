/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.PlaybackRateSelection');

goog.require('goog.asserts');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.RangeElement');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.util.Dom');
goog.require('shaka.util.NumberUtils');
goog.requireType('shaka.ui.Controls');

/**
 * @extends {shaka.ui.SettingsMenu}
 * @final
 * @export
 */
shaka.ui.PlaybackRateSelection = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['PLAYBACK_RATE']);

    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.controls.getConfig();

    this.button.classList.add('shaka-playbackrate-button');
    this.menu.classList.add('shaka-playback-rates');
    this.button.classList.add('shaka-tooltip-status');

    if (!this.isSubMenu) {
      /** @private {HTMLElement} */
      this.playbackRateMark_ = shaka.util.Dom.createHTMLElement('span');
      this.playbackRateMark_.classList.add('shaka-overflow-playback-rate-mark');
      this.button.appendChild(this.playbackRateMark_);
    }

    /** @private {shaka.ui.RangeElement} */
    this.rateSlider_ = null;

    /** @private {HTMLElement} */
    this.speedValue_ = null;

    /** @private {HTMLButtonElement} */
    this.decreaseButton_ = null;

    /** @private {HTMLButtonElement} */
    this.increaseButton_ = null;

    this.buildUI_();

    this.eventManager.listenMulti(
        this.player,
        [
          'loaded',
          'ratechange',
        ], () => {
          this.updatePlaybackRateSelection_();
        });

    this.updateLocalizedStrings();
    this.updatePlaybackRateSelection_();
  }

  /** @override */
  release() {
    if (this.rateSlider_) {
      this.rateSlider_.release();
      this.rateSlider_ = null;
    }
    super.release();
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);
    this.button.ariaLabel = this.localization.resolve(LocIds.PLAYBACK_RATE);
    this.nameSpan.textContent = this.localization.resolve(LocIds.PLAYBACK_RATE);
    this.backSpan.textContent = this.localization.resolve(LocIds.PLAYBACK_RATE);
  }

  /** @private */
  buildUI_() {
    // Slider section
    const sliderSection = shaka.util.Dom.createHTMLElement('div');
    sliderSection.classList.add('shaka-playback-rate-slider-section');


    this.speedValue_ = shaka.util.Dom.createHTMLElement('div');
    this.speedValue_.classList.add('shaka-playback-rate-value');
    sliderSection.appendChild(this.speedValue_);

    // Slider row: [−] ──────slider────── [+]
    const sliderRow = shaka.util.Dom.createHTMLElement('div');
    sliderRow.classList.add('shaka-playback-rate-slider-row');

    // Decrease button (−)
    this.decreaseButton_ = shaka.util.Dom.createButton();
    this.decreaseButton_.classList.add('shaka-playback-rate-step-btn');
    this.decreaseButton_.classList.add('shaka-no-propagation');
    this.decreaseButton_.setAttribute('aria-label', '−');
    this.decreaseButton_.textContent = '−';
    sliderRow.appendChild(this.decreaseButton_);

    // Range slider.
    goog.asserts.assert(this.controls, 'Controls should not be null!');
    this.rateSlider_ = new shaka.ui.RangeElement(
        sliderRow,
        this.controls,
        /* containerClassNames= */
        ['shaka-playback-rate-slider-container', 'shaka-no-propagation'],
        /* barClassNames= */ ['shaka-playback-rate-slider'],
        /* enableWheel= */ true);

    this.rateSlider_.setStep(shaka.ui.PlaybackRateSelection.SLIDER_STEP);

    this.rateSlider_.onChange = () => {
      this.applyRate_(this.rateSlider_.getValue());
    };

    // Increase button (+)
    this.increaseButton_ = shaka.util.Dom.createButton();
    this.increaseButton_.classList.add('shaka-playback-rate-step-btn');
    this.increaseButton_.classList.add('shaka-no-propagation');
    this.increaseButton_.setAttribute('aria-label', '+');
    this.increaseButton_.textContent = '+';
    sliderRow.appendChild(this.increaseButton_);

    sliderSection.appendChild(sliderRow);
    this.menu.appendChild(sliderSection);

    // Step-button listeners.
    this.eventManager.listen(this.decreaseButton_, 'click', () => {
      this.stepRate_(-shaka.ui.PlaybackRateSelection.SLIDER_STEP);
    });
    this.eventManager.listen(this.increaseButton_, 'click', () => {
      this.stepRate_(shaka.ui.PlaybackRateSelection.SLIDER_STEP);
    });

    // Preset pill buttons (horizontal)

    const presetsRow = shaka.util.Dom.createHTMLElement('div');
    presetsRow.classList.add('shaka-playback-rate-presets');

    for (const rate of this.controls.getConfig().playbackRates) {
      const btn = shaka.util.Dom.createButton();
      btn.classList.add('shaka-playback-rate-preset-btn');
      btn.setAttribute('role', 'menuitemradio');
      btn.setAttribute('aria-checked', 'false');
      btn.dataset['rate'] = String(rate);
      btn.textContent = this.formatPresetLabel_(rate);

      this.eventManager.listen(btn, 'click', () => {
        this.applyRate_(rate);
      });

      presetsRow.appendChild(btn);
    }

    this.menu.appendChild(presetsRow);
  }

  /**
   * @param {number} rate
   * @private
   */
  applyRate_(rate) {
    if (rate === this.video.defaultPlaybackRate) {
      this.player.cancelTrickPlay();
    } else {
      this.player.trickPlay(rate, /* useTrickPlayTrack= */ false);
    }
  }

  /**
   * Steps the playback rate by `delta`, snapped to SLIDER_STEP and clamped to
   * the configured [playbackRateSliderMin, playbackRateSliderMax] range.
   *
   * Snapping the current rate to the step grid before adding delta ensures that
   * a programmatic value like 0.97 is brought back onto the grid (0.95 or
   * 1.00) on the next user interaction rather than accumulating floating-point
   * drift.
   *
   * @param {number} delta
   * @private
   */
  stepRate_(delta) {
    const config = this.controls.getConfig();
    const min = config.playbackRateSliderMin;
    const max = config.playbackRateSliderMax;
    const step = shaka.ui.PlaybackRateSelection.SLIDER_STEP;

    const current = this.player.getPlaybackRate();
    // Snap current rate to the nearest step grid point, then apply delta.
    const snapped = Math.round(current / step) * step;
    const raw = snapped + delta;
    // Eliminate floating-point noise (e.g. 0.05 * 20 → 1.0000000000000002).
    const next = parseFloat((Math.round(raw / step) * step).toPrecision(10));
    const clamped = Math.max(min, Math.min(max, next));

    this.applyRate_(clamped);
  }

  /**
   * Returns the effective slider range.
   *
   * Normally this is [playbackRateSliderMin, playbackRateSliderMax] from the
   * config.  If the current rate was set programmatically outside that range,
   * the bounds are extended just enough to keep the thumb visible.
   *
   * @return {{min: number, max: number}}
   * @private
   */
  getSliderRange_() {
    const config = this.controls.getConfig();
    let min = config.playbackRateSliderMin;
    let max = config.playbackRateSliderMax;
    const currentRate = this.player.getPlaybackRate();
    if (currentRate < min) {
      min = currentRate;
    }
    if (currentRate > max) {
      max = currentRate;
    }
    return {min, max};
  }

  /**
   * Syncs slider range/value, live value label, step-button disabled state,
   * and preset-pill highlights to the current player rate.
   * @private
   */
  updatePlaybackRateSelection_() {
    const config = this.controls.getConfig();
    const rate = this.player.getPlaybackRate();

    // Update slider range first (may be extended for out-of-config rates).
    const {min, max} = this.getSliderRange_();
    this.rateSlider_.setRange(min, max);
    this.rateSlider_.setValue(rate);

    // Large centred value label.
    this.speedValue_.textContent = rate.toFixed(2) + 'x';

    // Disable step buttons at the configured hard limits (not the extended
    // ones) so the user cannot go beyond the intended range by clicking.
    this.decreaseButton_.disabled = rate <= config.playbackRateSliderMin;
    this.increaseButton_.disabled = rate >= config.playbackRateSliderMax;

    // Highlight the matching preset pill, if any.
    const presetBtns =
        this.menu.querySelectorAll('.shaka-playback-rate-preset-btn');
    for (const btn of presetBtns) {
      const button = /** @type {!HTMLButtonElement} */ (btn);
      const btnRate = parseFloat(button.dataset['rate']);
      const isChosen =
          shaka.util.NumberUtils.isFloatEqual(btnRate, rate, 0.001);
      button.setAttribute('aria-checked', isChosen ? 'true' : 'false');
      button.classList.toggle('shaka-chosen-item', isChosen);
    }

    // Overflow-menu badge / tooltip.
    this.currentSelection.textContent = rate + 'x';
    this.button.setAttribute('shaka-status', rate + 'x');
    if (this.playbackRateMark_) {
      this.playbackRateMark_.textContent = rate + 'x';
    }
    this.updateColors_();
  }

  /**
   * Formats a preset rate for display inside a pill button.
   * Rules
   *   - Comma as decimal separator.
   *   - Always at least one decimal place (e.g. 1 to "1,0", 3 to "3,0").
   *
   * @param {number} rate
   * @return {string}
   * @private
   */
  formatPresetLabel_(rate) {
    // Determine how many decimal places the value naturally has.
    const str = rate.toString(); // e.g. "1", "1.25", "0.5"
    const dotIndex = str.indexOf('.');
    const decimals = dotIndex === -1 ? 0 : str.length - dotIndex - 1;
    // Show at least one decimal place.
    return rate.toFixed(Math.max(1, decimals)).replace('.', ',');
  }

  /** @private */
  updateColors_() {
    const colors = this.config_.playbackRateBarColors;

    const value = this.rateSlider_.getValue();
    const min = this.rateSlider_.getMin();
    const max = this.rateSlider_.getMax();

    // Convert current value to percentage within slider range.
    const percent = ((value - min) / (max - min)) * 100;

    const gradient = ['to right'];
    gradient.push(colors.level + '0%');
    gradient.push(colors.level + percent + '%');
    gradient.push(colors.base + percent + '%');
    gradient.push(colors.base + '100%');

    this.rateSlider_.setBackground(
        'linear-gradient(' + gradient.join(',') + ')');
  }
};


/**
 * Step size used for slider interaction and the +/- buttons.
 * @const {number}
 */
shaka.ui.PlaybackRateSelection.SLIDER_STEP = 0.05;


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.PlaybackRateSelection.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.PlaybackRateSelection(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'playback_rate', new shaka.ui.PlaybackRateSelection.Factory());

shaka.ui.Controls.registerElement(
    'playback_rate', new shaka.ui.PlaybackRateSelection.Factory());
