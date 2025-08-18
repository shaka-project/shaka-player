/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SettingsMenu');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.MaterialSVGIcon');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Iterables');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @implements {shaka.extern.IUISettingsMenu}
 * @export
 */
shaka.ui.SettingsMenu = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {string} iconText
   */
  constructor(parent, controls, iconText) {
    super(parent, controls);

    /** @private {HTMLElement } */
    this.videoContainer_ = this.controls.getVideoContainer();

    this.addButton_(iconText);

    this.addMenu_();

    this.inOverflowMenu_();

    this.eventManager.listen(this.button, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.onButtonClick_();
    });

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;

    const resize = () => this.computeMaxHeight_();

    // Use ResizeObserver if available, fallback to window resize event
    if (window.ResizeObserver) {
      this.resizeObserver_ = new ResizeObserver(resize);
      this.resizeObserver_.observe(this.controls.getVideoContainer());
    } else {
      // Fallback for older browsers
      this.eventManager.listen(window, 'resize', resize);
    }
  }

  /** @override */
  release() {
    if (this.resizeObserver_) {
      this.resizeObserver_.disconnect();
      this.resizeObserver_ = null;
    }
    super.release();
  }


  /**
   * @param {string} iconText
   * @private
   */
  addButton_(iconText) {
    /** @protected {!HTMLButtonElement} */
    this.button = shaka.util.Dom.createButton();
    this.button.classList.add('shaka-overflow-button');

    /** @protected {!shaka.ui.MaterialSVGIcon}*/
    this.icon = new shaka.ui.MaterialSVGIcon(this.button, iconText);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');
    label.classList.add('shaka-overflow-button-label-inline');

    /** @protected {!HTMLElement}*/
    this.nameSpan = shaka.util.Dom.createHTMLElement('span');
    label.appendChild(this.nameSpan);

    /** @protected {!HTMLElement}*/
    this.currentSelection = shaka.util.Dom.createHTMLElement('span');
    this.currentSelection.classList.add('shaka-current-selection-span');
    label.appendChild(this.currentSelection);
    this.button.appendChild(label);

    this.parent.appendChild(this.button);
  }


  /** @private */
  addMenu_() {
    /** @protected {!HTMLElement}*/
    this.menu = shaka.util.Dom.createHTMLElement('div');
    this.menu.classList.add('shaka-no-propagation');
    this.menu.classList.add('shaka-show-controls-on-mouse-over');
    this.menu.classList.add('shaka-settings-menu');
    this.menu.classList.add('shaka-hidden');

    /** @protected {!HTMLButtonElement}*/
    this.backButton = shaka.util.Dom.createButton();
    this.backButton.classList.add('shaka-back-to-overflow-button');
    this.menu.appendChild(this.backButton);
    this.eventManager.listen(this.backButton, 'click', () => {
      this.controls.hideSettingsMenus();
    });

    /** @private {shaka.ui.MaterialSVGIcon} */
    this.backIcon_ = new shaka.ui.MaterialSVGIcon(this.backButton,
        shaka.ui.Enums.MaterialDesignSVGIcons.CLOSE);

    /** @protected {!HTMLElement}*/
    this.backSpan = shaka.util.Dom.createHTMLElement('span');
    this.backButton.appendChild(this.backSpan);

    const controlsContainer = this.controls.getControlsContainer();
    controlsContainer.appendChild(this.menu);
  }

  /** @private */
  inOverflowMenu_() {
    // Initially, submenus are created with a "Close" option. When present
    // inside of the overflow menu, that option must be replaced with a
    // "Back" arrow that returns the user to the main menu.
    if (this.parent.classList.contains('shaka-overflow-menu')) {
      this.backIcon_.use(shaka.ui.Enums.MaterialDesignSVGIcons.BACK);

      this.eventManager.listen(this.menu, 'click', () => {
        shaka.ui.Utils.setDisplay(this.menu, false);
        shaka.ui.Utils.setDisplay(this.parent, true);

        const isDisplayed =
        (element) => element.classList.contains('shaka-hidden') == false;

        const Iterables = shaka.util.Iterables;
        if (Iterables.some(this.parent.childNodes, isDisplayed)) {
          // Focus on the first visible child of the overflow menu
          const visibleElements =
            Iterables.filter(this.parent.childNodes, isDisplayed);
          /** @type {!HTMLElement} */ (visibleElements[0]).focus();
        }

        // Make sure controls are displayed
        this.controls.computeOpacity();

        this.computeMaxHeight_();
      });
    }
  }


  /** @private */
  onButtonClick_() {
    if (this.menu.classList.contains('shaka-hidden')) {
      this.controls.dispatchEvent(new shaka.util.FakeEvent('submenuopen'));
      shaka.ui.Utils.setDisplay(this.menu, true);
      shaka.ui.Utils.focusOnTheChosenItem(this.menu);
      this.computeMaxHeight_();
    } else {
      shaka.ui.Utils.setDisplay(this.menu, false);
    }
  }


  /**
   * @private
   */
  computeMaxHeight_() {
    const rectMenu = this.menu.getBoundingClientRect();
    const styleMenu = window.getComputedStyle(this.menu);
    const paddingTop = parseFloat(styleMenu.paddingTop);
    const paddingBottom = parseFloat(styleMenu.paddingBottom);
    const rectContainer = this.videoContainer_.getBoundingClientRect();
    const heightIntersection =
        rectMenu.bottom - rectContainer.top - paddingTop - paddingBottom;

    this.menu.style.maxHeight = heightIntersection + 'px';
  }
};
