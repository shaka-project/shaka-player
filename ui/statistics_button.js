/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.StatisticsButton');

goog.require('shaka.log');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.StatisticsButtonBase');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.StatisticsButtonBase}
 * @final
 * @export
 */
shaka.ui.StatisticsButton = class extends shaka.ui.StatisticsButtonBase {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        'shaka-statistics-button', 'shaka-statistics-container');

    /** @private {!Array} */
    this.skippedStats_ = ['stateHistory', 'switchHistory'];

    /** @private {!shaka.extern.Stats} */
    this.currentStats_ = this.player.getStats();

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
      const value = this.currentStats_[name];
      return shaka.ui.Utils.buildTimeString(value, value > 3600);
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

    this.statsParseFrom = new Map()
        .set('width', parsePx)
        .set('height', parsePx)
        .set('currentCodecs', parseString)
        .set('completionPercent', parsePercent)
        .set('bufferingTime', parseSeconds)
        .set('drmTimeSeconds', parseSeconds)
        .set('licenseTime', parseSeconds)
        .set('liveLatency', parseSeconds)
        .set('loadLatency', parseSeconds)
        .set('timeToFirstFrame', parseSeconds)
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

    this.updateLocalizedStrings();

    this.loadContainer_();

    this.eventManager.listen(this.statsButton, 'click', () => {
      this.toggleContainer();
      this.updateLocalizedStrings();
    });
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    const label = this.localization.resolve(LocIds.STATISTICS);

    this.statsNameSpan.textContent = label;
    this.statsHeaderTitle.textContent = label;
    this.statsButton.ariaLabel = label;

    const labelText = this.statsContainer.classList.contains('shaka-hidden') ?
        LocIds.OFF : LocIds.ON;
    this.statsStateSpan.textContent = this.localization.resolve(labelText);
  }

  /** @override */
  checkAvailability() {
    shaka.ui.Utils.setDisplay(this.statsButton, !this.isSubMenuOpened);
  }

  /** @private */
  loadContainer_() {
    this.buildStatsContainerHeader();

    /**
     * @const {!Array<{label: string, stats: !Array<string>}>}
     */
    const groups = [
      {
        label: 'Video',
        stats: [
          'width',
          'height',
          'currentCodecs',
        ],
      },
      {
        label: 'Network',
        stats: [
          'estimatedBandwidth',
          'streamBandwidth',
          'maxSegmentDuration',
          'bytesDownloaded',
        ],
      },
      {
        label: 'Load',
        stats: [
          'loadLatency',
          'timeToFirstFrame',
          'manifestTimeSeconds',
          'drmTimeSeconds',
          'licenseTime',
        ],
      },
      {
        label: 'Playback',
        stats: [
          'playTime',
          'pauseTime',
          'bufferingTime',
          'liveLatency',
          'completionPercent',
        ],
      },
      {
        label: 'Frames',
        stats: [
          'decodedFrames',
          'droppedFrames',
          'corruptedFrames',
        ],
      },
      {
        label: 'Stability',
        stats: [
          'stallsDetected',
          'gapsJumped',
          'nonFatalErrorCount',
        ],
      },
      {
        label: 'Manifest',
        stats: [
          'manifestSizeBytes',
          'manifestPeriodCount',
          'manifestGapCount',
        ],
      },
    ];

    const configList = this.controls.getConfig().statisticsList;

    /** @type {!Set<string>} Track which stats have already been rendered */
    const rendered = new Set();

    /** @param {string} labelText */
    const appendSectionLabel = (labelText) => {
      const el = shaka.util.Dom.createHTMLElement('div');
      el.classList.add('shaka-statistics-section-label');
      el.textContent = labelText;
      this.statsContainer.appendChild(el);
    };

    const appendDivider = () => {
      const el = shaka.util.Dom.createHTMLElement('div');
      el.classList.add('shaka-statistics-divider');
      this.statsContainer.appendChild(el);
    };

    let firstGroup = true;

    for (const group of groups) {
      // Only render stats that the integrator has configured AND that the
      // player is actually reporting (skipping stateHistory / switchHistory).
      const groupStats = group.stats.filter((name) =>
        configList.includes(name) &&
        name in this.currentStats_ &&
        !this.skippedStats_.includes(name));

      if (groupStats.length === 0) {
        continue;
      }

      if (!firstGroup) {
        appendDivider();
      }
      firstGroup = false;

      appendSectionLabel(group.label);

      for (const name of groupStats) {
        this.statsContainer.appendChild(this.generateStatComponent(name));
        this.statsList.push(name);
        rendered.add(name);
      }
    }

    // Any configured stat not covered by the groups above goes into 'Other'.
    const remaining = configList.filter((name) =>
      !rendered.has(name) &&
      name in this.currentStats_ &&
      !this.skippedStats_.includes(name));

    if (remaining.length > 0) {
      appendDivider();
      appendSectionLabel('Other');
      for (const name of remaining) {
        this.statsContainer.appendChild(this.generateStatComponent(name));
        this.statsList.push(name);
      }
    }

    for (const name of configList) {
      if (!(name in this.currentStats_)) {
        shaka.log.alwaysWarn('Unrecognized statistic element:', name);
      }
    }
  }

  /** @override */
  updateStatsDisplay() {
    this.currentStats_ = this.player.getStats();

    for (const name of this.statsList) {
      const element = this.statsDisplayedElements.get(name);
      element.textContent = this.statsParseFrom.get(name)(name);
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
