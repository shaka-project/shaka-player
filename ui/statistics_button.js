/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.StatisticsButton');

goog.require('shaka.ui.ContextMenu');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
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
    this.statisticsList_ = this.controls.getConfig().statisticsList;

    /** @private {!Object.<string, number>} */
    this.currentStats_ = [];

    /** @private {!Object.<string, string>} */
    this.parseFrom_ = {
      'width': 'px', 'height': 'px', 'completionPercent': 'percent',
      'bufferingTime': 'seconds', 'drmTimeSeconds': 'seconds',
      'licenseTime': 'seconds', 'liveLatency': 'seconds',
      'loadLatency': 'seconds', 'manifestTimeSeconds': 'seconds',
      'estimatedBandwidth': 'bits', 'streamBandwidth': 'bits',
      'maxSegmentDuration': 'time', 'pauseTime': 'time', 'playTime': 'time',
      'corruptedFrames': 'frames', 'decodedFrames': 'frames',
      'droppedFrames': 'frames',
    };

    /** @private {!Object.<string, Function>} */
    this.parseTo_ = {
      'px': (name) => {
        return this.currentStats_[name] + ' (px)';
      },
      'percent': (name) => {
        return this.currentStats_[name] + ' (%)';
      },
      'frames': (name) => {
        return this.currentStats_[name] + ' (frames)';
      },
      'seconds': (name) => {
        return this.currentStats_[name].toFixed(2) + ' (s)';
      },
      'bits': (name) => {
        return Math.round(this.currentStats_[name] / 1000) + ' (kbits/s)';
      },
      'time': (name) => {
        return shaka.ui.Utils.buildTimeString(
            this.currentStats_[name], false) + ' (m)';
      },
    };

    /** @private {shaka.util.Timer} */
    this.timer_ = new shaka.util.Timer(() => {
      this.onTimerTick_();
    });

    this.updateLocalizedStrings_();

    this.timer_.tickNow();

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
    value.textContent = this.parseTo_[this.parseFrom_[name]](name);
    section.appendChild(value);

    return section;
  }

  /** @private */
  onTimerTick_() {
    this.currentStats_ = this.player.getStats();
    this.container_.innerText = '';

    for (const name of this.statisticsList_) {
      if (name in this.currentStats_) {
        this.container_.appendChild(this.generateComponent_(name));
      }
    }
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


shaka.ui.ContextMenu.registerElement(
    'statistics', new shaka.ui.StatisticsButton.Factory());
