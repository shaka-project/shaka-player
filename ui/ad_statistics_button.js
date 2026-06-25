/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.AdStatisticsButton');

goog.require('shaka.log');
goog.require('shaka.ads.Utils');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.StatisticsButtonBase');
goog.require('shaka.ui.Utils');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.StatisticsButtonBase}
 * @final
 * @export
 */
shaka.ui.AdStatisticsButton = class extends shaka.ui.StatisticsButtonBase {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        'shaka-ad-statistics-button', 'shaka-ad-statistics-container');

    /** @private {!shaka.extern.AdsStats} */
    this.currentStats_ = this.adManager.getStats();

    shaka.ui.Utils.setDisplay(this.statsButton, this.currentStats_.started > 0);

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

    this.statsParseFrom = new Map()
        .set('loadTimes', parseLoadTimes)
        .set('averageLoadTime', showNumber)
        .set('started', showNumber)
        .set('overlayAds', showNumber)
        .set('playedCompletely', showNumber)
        .set('skipped', showNumber)
        .set('errors', showNumber);

    this.eventManager.listen(this.statsButton, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.toggleContainer();
      this.updateLocalizedStrings();
    });

    this.eventManager.listen(this.player, 'loading', () => {
      this.updateStatsDisplay();
      this.checkAvailability();
    });

    this.eventManager.listen(
        this.adManager, shaka.ads.Utils.AD_STARTED, () => {
          this.updateStatsDisplay();
          this.checkAvailability();
        });

    this.updateLocalizedStrings();
    this.updateStatsDisplay();
    this.loadContainer_();
    this.checkAvailability();
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    const label = this.localization.resolve(LocIds.AD_STATISTICS);

    this.statsNameSpan.textContent = label;
    this.statsHeaderTitle.textContent = label;
    this.statsButton.ariaLabel = label;

    const labelText = this.statsContainer.classList.contains('shaka-hidden') ?
        LocIds.OFF : LocIds.ON;
    this.statsStateSpan.textContent = this.localization.resolve(labelText);
  }

  /** @override */
  checkAvailability() {
    const hasStats = this.currentStats_.started > 0 ||
        this.currentStats_.overlayAds > 0 ||
        this.currentStats_.playedCompletely > 0 ||
        this.currentStats_.skipped > 0 ||
        this.currentStats_.errors > 0;
    shaka.ui.Utils.setDisplay(
        this.statsButton, !this.isSubMenuOpened && hasStats);
    if (!hasStats && !this.statsContainer.classList.contains('shaka-hidden')) {
      this.toggleContainer();
    }
  }

  /** @private */
  loadContainer_() {
    this.buildStatsContainerHeader();

    for (const name of this.controls.getConfig().adStatisticsList) {
      if (name in this.currentStats_) {
        this.statsContainer.appendChild(this.generateStatComponent(name));
        this.statsList.push(name);
      } else {
        shaka.log.alwaysWarn('Unrecognized ad statistic element:', name);
      }
    }
  }

  /** @override */
  updateStatsDisplay() {
    this.currentStats_ = this.adManager.getStats();

    for (const name of this.statsList) {
      this.statsDisplayedElements.get(name).textContent =
          this.statsParseFrom.get(name)(name);
    }
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
