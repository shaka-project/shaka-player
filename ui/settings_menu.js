/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SettingsMenu');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
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

    this.eventManager.listen(this.button, 'click', () => {
      this.onButtonClick_();
    });
  }


  /**
   * @param {string} iconText
   * @private
   */
  addButton_(iconText) {
    /** @protected {!HTMLElement}*/
    this.button = shaka.util.Dom.createHTMLElement('button');

    /** @protected {!HTMLElement}*/
    this.icon = shaka.util.Dom.createHTMLElement('i');
    this.icon.classList.add('material-icons');
    this.icon.textContent = iconText;
    this.button.appendChild(this.icon);

    const label = shaka.util.Dom.createHTMLElement('label');
    label.classList.add('shaka-overflow-button-label');

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
    this.menu.classList.add('shaka-fade-out-on-mouse-out');

    /** @protected {!HTMLElement}*/
    this.backButton = shaka.util.Dom.createHTMLElement('button');
    this.backButton.classList.add('shaka-back-to-overflow-button');
    this.menu.appendChild(this.backButton);

    const backIcon = shaka.util.Dom.createHTMLElement('i');
    backIcon.classList.add('material-icons');
    backIcon.textContent = shaka.ui.Enums.MaterialDesignIcons.BACK;
    this.backButton.appendChild(backIcon);

    /** @protected {!HTMLElement}*/
    this.backSpan = shaka.util.Dom.createHTMLElement('span');
    this.backButton.appendChild(this.backSpan);

    const controlsContainer = this.controls.getControlsContainer();
    controlsContainer.appendChild(this.menu);
  }


  /** @private */
  onButtonClick_() {
    this.controls.dispatchEvent(new shaka.util.FakeEvent('submenuopen'));
    shaka.ui.Utils.setDisplay(this.menu, true);
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);
  }
};
