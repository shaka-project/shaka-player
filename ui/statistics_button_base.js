/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.StatisticsButtonBase');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Timer');
goog.requireType('shaka.ui.Controls');


/**
 * Abstract base class shared by StatisticsButton and AdStatisticsButton.
 * Handles the common button/container DOM setup, toggle logic, and row
 * generation; subclasses supply the stats source, parse map, and layout.
 *
 * @extends {shaka.ui.Element}
 * @abstract
 * @export
 */
shaka.ui.StatisticsButtonBase = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {string} buttonClass  CSS class added to the button element
   * @param {string} containerClass  CSS class added to the stats container
   */
  constructor(parent, controls, buttonClass, containerClass) {
    super(parent, controls);

    /** @protected {!HTMLButtonElement} */
    this.statsButton = shaka.util.Dom.createButton();
    this.statsButton.classList.add(buttonClass);
    this.statsButton.classList.add('shaka-tooltip');
    this.statsButton.classList.add('shaka-no-propagation');
    this.statsButton.ariaPressed = 'false';

    /** @protected {!shaka.ui.Icon} */
    this.statsIcon = new shaka.ui.Icon(this.statsButton,
        shaka.ui.Enums.MaterialDesignSVGIcons['STATISTICS_ON']);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-simple-overflow-button-label-inline');

    /** @protected {!HTMLElement} */
    this.statsNameSpan = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.statsNameSpan);

    /** @protected {!HTMLElement} */
    this.statsStateSpan = shaka.util.Dom.createHTMLElement('span');
    this.statsStateSpan.classList.add('shaka-current-selection-span');
    label.appendChild(this.statsStateSpan);

    this.statsButton.appendChild(label);
    this.parent.appendChild(this.statsButton);

    /** @protected {!HTMLElement} */
    this.statsContainer = shaka.util.Dom.createHTMLElement('div');
    this.statsContainer.classList.add('shaka-no-propagation');
    this.statsContainer.classList.add('shaka-show-controls-on-mouse-over');
    this.statsContainer.classList.add(containerClass);
    this.statsContainer.classList.add('shaka-hidden');

    const controlsContainer = this.controls.getControlsContainer();
    controlsContainer.appendChild(this.statsContainer);

    /** @protected {!Array} */
    this.statsList = [];

    /** @protected {!Map<string, HTMLElement>} */
    this.statsDisplayedElements = new Map();

    /** @protected {!Map<string, function(string): string>} */
    this.statsParseFrom = new Map();

    /** @protected {!HTMLElement} */
    this.statsHeaderTitle = shaka.util.Dom.createHTMLElement('span');
    this.statsHeaderTitle.classList.add('shaka-statistics-title');

    /** @protected {shaka.util.Timer} */
    this.statsTimer = new shaka.util.Timer(() => {
      this.updateStatsDisplay();
    });
  }

  /** @override */
  release() {
    this.statsTimer.stop();
    this.statsTimer = null;
    super.release();
  }

  /**
   * Toggles the stats container visibility and the periodic update timer.
   * @protected
   */
  toggleContainer() {
    if (this.statsContainer.classList.contains('shaka-hidden')) {
      this.statsIcon.use(
          shaka.ui.Enums.MaterialDesignSVGIcons['STATISTICS_OFF']);
      this.statsTimer.tickEvery(0.1);
      shaka.ui.Utils.setDisplay(this.statsContainer, true);
      this.statsButton.ariaPressed = 'true';
    } else {
      this.statsIcon.use(
          shaka.ui.Enums.MaterialDesignSVGIcons['STATISTICS_ON']);
      this.statsTimer.stop();
      shaka.ui.Utils.setDisplay(this.statsContainer, false);
      this.statsButton.ariaPressed = 'false';
    }
  }

  /**
   * Creates a label+value row for one stat and registers it for updates.
   * @param {string} name
   * @return {!HTMLElement}
   * @protected
   */
  generateStatComponent(name) {
    const section = shaka.util.Dom.createHTMLElement('div');

    const label = shaka.util.Dom.createHTMLElement('label');
    label.textContent = name + ':';
    section.appendChild(label);

    const value = shaka.util.Dom.createHTMLElement('span');
    value.textContent = this.statsParseFrom.get(name)(name);
    section.appendChild(value);

    this.statsDisplayedElements.set(name, value);

    return section;
  }

  /**
   * Appends the shared header (title span + close icon) to the container.
   * Subclasses call this at the top of their loadContainer_() implementation.
   * @protected
   */
  buildStatsContainerHeader() {
    const header = shaka.util.Dom.createHTMLElement('div');
    header.classList.add('shaka-statistics-header');
    header.classList.add('shaka-no-propagation');
    header.appendChild(this.statsHeaderTitle);
    const icon = new shaka.ui.Icon(header,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSE']);
    const iconElement = icon.getSvgElement();
    iconElement.classList.add('material-icons', 'notranslate');
    this.statsContainer.appendChild(header);
    this.eventManager.listen(iconElement, 'click', () => {
      this.toggleContainer();
    });
  }

  /** @protected */
  updateStatsDisplay() {}
};
