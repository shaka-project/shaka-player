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
goog.require('shaka.ui.MaterialSVGIcon');
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

    /** @private {!shaka.ui.MaterialSVGIcon} */
    this.icon_ = new shaka.ui.MaterialSVGIcon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons.STATISTICS_ON);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-simple-overflow-button-label-inline');

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

    /** @private {!shaka.extern.Stats} */
    this.currentStats_ = this.player.getStats();

    /** @private {!Map<string, HTMLElement>} */
    this.displayedElements_ = new Map();


    const parsePx = (name) => {
      return this.currentStats_[name] + ' (px)';
    };

    const parseString = (name) => {
      return this.currentStats_[name];
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

    const parseErrors = (name) => {
      return this.currentStats_[name] + ' (errors)';
    };

    const parsePeriods = (name) => {
      return this.currentStats_[name] + ' (periods)';
    };

    const parseBytes = (name) => {
      const bytes = parseInt(this.currentStats_[name], 10);
      if (bytes > 2 * 1e9) {
        return (bytes / 1e9).toFixed(2) + 'GB';
      } else if (bytes > 1e6) {
        return (bytes / 1e6).toFixed(2) + 'MB';
      } else if (bytes > 1e3) {
        return (bytes / 1e3).toFixed(2) + 'KB';
      } else {
        return bytes + 'B';
      }
    };

    /** @private {!Map<string, function(string): string>} */
    this.parseFrom_ = new Map()
        .set('width', parsePx)
        .set('height', parsePx)
        .set('currentCodecs', parseString)
        .set('completionPercent', parsePercent)
        .set('bufferingTime', parseSeconds)
        .set('drmTimeSeconds', parseSeconds)
        .set('licenseTime', parseSeconds)
        .set('liveLatency', parseSeconds)
        .set('loadLatency', parseSeconds)
        .set('manifestTimeSeconds', parseSeconds)
        .set('estimatedBandwidth', parseBits)
        .set('streamBandwidth', parseBits)
        .set('maxSegmentDuration', parseSeconds)
        .set('pauseTime', parseTime)
        .set('playTime', parseTime)
        .set('corruptedFrames', parseFrames)
        .set('decodedFrames', parseFrames)
        .set('droppedFrames', parseFrames)
        .set('stallsDetected', parseStalls)
        .set('gapsJumped', parseGaps)
        .set('manifestSizeBytes', parseBytes)
        .set('bytesDownloaded', parseBytes)
        .set('nonFatalErrorCount', parseErrors)
        .set('manifestPeriodCount', parsePeriods)
        .set('manifestGapCount', parseGaps);

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
    if (this.container_.classList.contains('shaka-hidden')) {
      this.icon_.use(shaka.ui.Enums.MaterialDesignSVGIcons.STATISTICS_OFF);
      this.timer_.tickEvery(0.1);
      shaka.ui.Utils.setDisplay(this.container_, true);
    } else {
      this.icon_.use(shaka.ui.Enums.MaterialDesignSVGIcons.STATISTICS_ON);
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

  /**
   * @param {string} name
   * @return {!HTMLElement}
   * @private
   */
  generateComponent_(name) {
    const section = shaka.util.Dom.createHTMLElement('div');

    const label = shaka.util.Dom.createHTMLElement('label');
    label.textContent = name + ':';
    section.appendChild(label);

    const value = shaka.util.Dom.createHTMLElement('span');
    value.textContent = this.parseFrom_.get(name)(name);
    section.appendChild(value);

    this.displayedElements_.set(name, value);

    return section;
  }

  /** @private */
  loadContainer_() {
    const closeElement = shaka.util.Dom.createHTMLElement('div');
    closeElement.classList.add('shaka-no-propagation');
    closeElement.classList.add('shaka-statistics-close');
    const icon = new shaka.ui.MaterialSVGIcon(closeElement,
        shaka.ui.Enums.MaterialDesignSVGIcons.CLOSE);
    const iconElement = icon.getSvgElement();
    iconElement.classList.add('material-icons', 'notranslate');
    this.container_.appendChild(closeElement);
    this.eventManager.listen(iconElement, 'click', () => {
      this.onClick_();
    });
    for (const name of this.controls.getConfig().statisticsList) {
      if (name in this.currentStats_ && !this.skippedStats_.includes(name)) {
        const element = this.generateComponent_(name);
        this.container_.appendChild(element);
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
      const element = this.displayedElements_.get(name);
      element.textContent = this.parseFrom_.get(name)(name);
      if (element && element.parentElement) {
        const value = this.currentStats_[name];
        if (typeof value == 'string') {
          shaka.ui.Utils.setDisplay(element.parentElement, value != '');
        } else {
          shaka.ui.Utils.setDisplay(element.parentElement, !isNaN(value));
        }
      }
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
