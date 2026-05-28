/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AdStatisticsButton');

goog.require('shaka.log');
goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
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
shaka.ui.AdStatisticsButton = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLButtonElement} */
    this.button_ = shaka.util.Dom.createButton();
    this.button_.classList.add('shaka-ad-statistics-button');
    this.button_.classList.add('shaka-tooltip');
    this.button_.classList.add('shaka-no-propagation');
    this.button_.ariaPressed = 'false';

    /** @private {!shaka.ui.Icon} */
    this.icon_ = new shaka.ui.Icon(this.button_,
        shaka.ui.Enums.MaterialDesignSVGIcons['STATISTICS_ON']);

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
    this.container_.classList.add('shaka-ad-statistics-container');
    this.container_.classList.add('shaka-hidden');

    const controlsContainer = this.controls.getControlsContainer();
    controlsContainer.appendChild(this.container_);

    /** @private {!Array} */
    this.statisticsList_ = [];

    /** @private {!shaka.extern.AdsStats} */
    this.currentStats_ = this.adManager.getStats();

    shaka.ui.Utils.setDisplay(this.button_, this.currentStats_.started > 0);

    /** @private {!Map<string, HTMLElement>} */
    this.displayedElements_ = new Map();

    /** @private {!HTMLElement} */
    this.headerTitle_ = shaka.util.Dom.createHTMLElement('span');
    this.headerTitle_.classList.add('shaka-statistics-title');

    const parseLoadTimes = (name) => {
      let totalTime = 0;
      const loadTimes =
        /** @type {!Array<number>} */ (this.currentStats_[name]);
      for (const loadTime of loadTimes) {
        totalTime += parseFloat(loadTime);
      }
      return totalTime;
    };

    const showNumber = (name) => {
      return this.currentStats_[name];
    };

    /** @private {!Map<string, function(string): string>} */
    this.parseFrom_ = new Map()
        .set('loadTimes', parseLoadTimes)
        .set('averageLoadTime', showNumber)
        .set('started', showNumber)
        .set('overlayAds', showNumber)
        .set('playedCompletely', showNumber)
        .set('skipped', showNumber)
        .set('errors', showNumber);

    /** @private {shaka.util.Timer} */
    this.timer_ = new shaka.util.Timer(() => {
      this.updateStats_();
    });

    this.eventManager.listen(this.button_, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.onClick_();
      this.updateLocalizedStrings();
    });

    this.eventManager.listen(this.player, 'loading', () => {
      this.updateStats_();
      this.checkAvailability();
    });

    this.eventManager.listen(
        this.adManager, shaka.ads.Utils.AD_STARTED, () => {
          this.updateStats_();
          this.checkAvailability();
        });

    this.updateLocalizedStrings();
    this.updateStats_();
    this.loadContainer_();
    this.checkAvailability();
  }

  /** @private */
  onClick_() {
    if (this.container_.classList.contains('shaka-hidden')) {
      this.icon_.use(shaka.ui.Enums.MaterialDesignSVGIcons['STATISTICS_OFF']);
      this.timer_.tickEvery(0.1);
      shaka.ui.Utils.setDisplay(this.container_, true);
      this.button_.ariaPressed = 'true';
    } else {
      this.icon_.use(shaka.ui.Enums.MaterialDesignSVGIcons['STATISTICS_ON']);
      this.timer_.stop();
      shaka.ui.Utils.setDisplay(this.container_, false);
      this.button_.ariaPressed = 'false';
    }
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.nameSpan_.textContent =
        this.localization.resolve(LocIds.AD_STATISTICS);

    this.headerTitle_.textContent =
        this.localization.resolve(LocIds.AD_STATISTICS);

    this.button_.ariaLabel = this.localization.resolve(LocIds.AD_STATISTICS);

    const labelText = this.container_.classList.contains('shaka-hidden') ?
        LocIds.OFF : LocIds.ON;
    this.stateSpan_.textContent = this.localization.resolve(labelText);
  }

  /** @override */
  checkAvailability() {
    const hasStats = this.currentStats_.started > 0 ||
        this.currentStats_.overlayAds > 0 ||
        this.currentStats_.playedCompletely > 0 ||
        this.currentStats_.skipped > 0 ||
        this.currentStats_.errors > 0;
    shaka.ui.Utils.setDisplay(this.button_, !this.isSubMenuOpened && hasStats);
    if (hasStats && !this.container_.classList.contains('shaka-hidden')) {
      this.onClick_();
    }
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
    const header = shaka.util.Dom.createHTMLElement('div');
    header.classList.add('shaka-statistics-header');
    header.classList.add('shaka-no-propagation');
    header.appendChild(this.headerTitle_);
    const icon = new shaka.ui.Icon(header,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSE']);
    const iconElement = icon.getSvgElement();
    iconElement.classList.add('material-icons', 'notranslate');

    this.container_.appendChild(header);
    this.eventManager.listen(iconElement, 'click', () => {
      this.onClick_();
    });
    for (const name of this.controls.getConfig().adStatisticsList) {
      if (name in this.currentStats_) {
        this.container_.appendChild(this.generateComponent_(name));
        this.statisticsList_.push(name);
      } else {
        shaka.log.alwaysWarn('Unrecognized ad statistic element:', name);
      }
    }
  }

  /** @private */
  updateStats_() {
    this.currentStats_ = this.adManager.getStats();

    for (const name of this.statisticsList_) {
      this.displayedElements_.get(name).textContent =
          this.parseFrom_.get(name)(name);
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
shaka.ui.AdStatisticsButton.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.AdStatisticsButton(rootElement, controls);
  }
};


shaka.ui.OverflowMenu.registerElement(
    'ad_statistics', new shaka.ui.AdStatisticsButton.Factory());
