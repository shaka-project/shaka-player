/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.StatisticsButton');

goog.require('shaka.log');
goog.require('shaka.ui.ContextMenu');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Timer');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.StatisticsButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-statistics-button');

    /** @private {!HTMLElement} */
    this.icon_ = shaka.util.Dom.createHTMLElement('i');
    this.icon_.classList.add('material-icons-round');
    this.icon_.textContent =
      shaka.ui.Enums.MaterialDesignIcons.STATISTICS_ON;
    this.button_.appendChild(this.icon_);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');

    /** @private {!HTMLElement} */
    this.nameSpan_ = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.nameSpan_);

    /** @private {!HTMLElement} */
    this.stateSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.stateSpan_.classList.add('shaka-current-selection-span');
    label.appendChild(this.stateSpan_);

    this.button_.appendChild(label);

    this.parent.appendChild(this.button_);

    /** @private {!HTMLElement} */
    this.container_ = shaka.util.Dom.createHTMLElement('div');
    this.container_.classList.add('shaka-no-propagation');
    this.container_.classList.add('shaka-show-controls-on-mouse-over');
    this.container_.classList.add('shaka-statistics-container');
    this.container_.classList.add('shaka-hidden');

    const controlsContainer = this.controls.getControlsContainer();
    controlsContainer.appendChild(this.container_);

    /** @private {!Array} */
    this.statisticsList_ = [];

    /** @private {!Array} */
    this.skippedStats_ = ['stateHistory', 'switchHistory'];

    /** @private {!Object.<string, number>} */
    this.currentStats_ = this.player.getStats();

    /** @private {!Object.<string, HTMLElement>} */
    this.displayedElements_ = {};


    const parsePx = (name) => {
      return this.currentStats_[name] + ' (px)';
    };

    const parsePercent = (name) => {
      return this.currentStats_[name] + ' (%)';
    };

    const parseFrames = (name) => {
      return this.currentStats_[name] + ' (frames)';
    };

    const parseSeconds = (name) => {
      return this.currentStats_[name].toFixed(2) + ' (s)';
    };

    const parseBits = (name) => {
      return Math.round(this.currentStats_[name] / 1000) + ' (kbits/s)';
    };

    const parseTime = (name) => {
      return shaka.ui.Utils.buildTimeString(
          this.currentStats_[name], false) + ' (m)';
    };

    const parseGaps = (name) => {
      return this.currentStats_[name] + ' (gaps)';
    };

    const parseStalls = (name) => {
      return this.currentStats_[name] + ' (stalls)';
    };

    /** @private {!Object.<string, function(string):string>} */
    this.parseFrom_ = {
      'width': parsePx,
      'height': parsePx,
      'completionPercent': parsePercent,
      'bufferingTime': parseSeconds,
      'drmTimeSeconds': parseSeconds,
      'licenseTime': parseSeconds,
      'liveLatency': parseSeconds,
      'loadLatency': parseSeconds,
      'manifestTimeSeconds': parseSeconds,
      'estimatedBandwidth': parseBits,
      'streamBandwidth': parseBits,
      'maxSegmentDuration': parseTime,
      'pauseTime': parseTime,
      'playTime': parseTime,
      'corruptedFrames': parseFrames,
      'decodedFrames': parseFrames,
      'droppedFrames': parseFrames,
      'stallsDetected': parseStalls,
      'gapsJumped': parseGaps,
    };

    /** @private {shaka.util.Timer} */
    this.timer_ = new shaka.util.Timer(() => {
      this.onTimerTick_();
    });

    this.updateLocalizedStrings_();

    this.loadContainer_();

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(
        this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
          this.updateLocalizedStrings_();
        });

    this.eventManager.listen(this.button_, 'click', () => {
      this.onClick_();
      this.updateLocalizedStrings_();
    });
  }

  /** @private */
  onClick_() {
    shaka.ui.Utils.setDisplay(this.parent, false);

    if (this.container_.classList.contains('shaka-hidden')) {
      this.icon_.textContent =
          shaka.ui.Enums.MaterialDesignIcons.STATISTICS_OFF;
      this.timer_.tickEvery(0.1);
      shaka.ui.Utils.setDisplay(this.container_, true);
    } else {
      this.icon_.textContent =
          shaka.ui.Enums.MaterialDesignIcons.STATISTICS_ON;
      this.timer_.stop();
      shaka.ui.Utils.setDisplay(this.container_, false);
    }
  }

  /** @private */
  updateLocalizedStrings_() {
    const LocIds = shaka.ui.Locales.Ids;

    this.nameSpan_.textContent =
        this.localization.resolve(LocIds.STATISTICS);

    this.button_.ariaLabel = this.localization.resolve(LocIds.STATISTICS);

    const labelText = this.container_.classList.contains('shaka-hidden') ?
        LocIds.OFF : LocIds.ON;
    this.stateSpan_.textContent = this.localization.resolve(labelText);
  }

  /** @private */
  generateComponent_(name) {
    const section = shaka.util.Dom.createHTMLElement('div');

    const label = shaka.util.Dom.createHTMLElement('label');
    label.textContent = name + ':';
    section.appendChild(label);

    const value = shaka.util.Dom.createHTMLElement('span');
    value.textContent = this.parseFrom_[name](name);
    section.appendChild(value);

    this.displayedElements_[name] = value;

    return section;
  }

  /** @private */
  loadContainer_() {
    for (const name of this.controls.getConfig().statisticsList) {
      if (name in this.currentStats_ && !this.skippedStats_.includes(name)) {
        this.container_.appendChild(this.generateComponent_(name));
        this.statisticsList_.push(name);
      } else {
        shaka.log.alwaysWarn('Unrecognized statistic element:', name);
      }
    }
  }

  /** @private */
  onTimerTick_() {
    this.currentStats_ = this.player.getStats();

    for (const name of this.statisticsList_) {
      this.displayedElements_[name].textContent =
          this.parseFrom_[name](name);
    }
  }

  /** @override */
  release() {
    this.timer_.stop();
    this.timer_ = null;
    super.release();
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.StatisticsButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.StatisticsButton(rootElement, controls);
  }
};


shaka.ui.OverflowMenu.registerElement(
    'statistics', new shaka.ui.StatisticsButton.Factory());

shaka.ui.ContextMenu.registerElement(
    'statistics', new shaka.ui.StatisticsButton.Factory());
