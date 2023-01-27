/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SettingsMenu');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
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

    this.addButton_(iconText);

    this.addMenu_();

    this.inOverflowMenu_();

    this.eventManager.listen(this.button, 'click', () => {
      this.onButtonClick_();
    });
  }


  /**
   * @param {string} iconText
   * @private
   */
  addButton_(iconText) {
    /** @protected {!HTMLButtonElement} */
    this.button = shaka.util.Dom.createButton();
    this.button.classList.add('shaka-overflow-button');

    /** @protected {!HTMLElement}*/
    this.icon = shaka.util.Dom.createHTMLElement('i');
    this.icon.classList.add('material-icons-round');
    this.icon.textContent = iconText;
    this.button.appendChild(this.icon);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');
    label.classList.add('shaka-overflow-menu-only');

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

    const backIcon = shaka.util.Dom.createHTMLElement('i');
    backIcon.classList.add('material-icons-round');
    backIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.CLOSE;
    this.backButton.appendChild(backIcon);

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
      this.backButton.firstChild.textContent =
            shaka.ui.Enums.MaterialDesignIcons.BACK;

      this.eventManager.listen(this.backButton, 'click', () => {
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
      });
    }
  }


  /** @private */
  onButtonClick_() {
    if (this.menu.classList.contains('shaka-hidden')) {
      this.controls.dispatchEvent(new shaka.util.FakeEvent('submenuopen'));
      shaka.ui.Utils.setDisplay(this.menu, true);
      shaka.ui.Utils.focusOnTheChosenItem(this.menu);
    } else {
      shaka.ui.Utils.setDisplay(this.menu, false);
    }
  }
};
