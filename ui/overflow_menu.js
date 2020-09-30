/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


goog.provide('shaka.ui.OverflowMenu');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.ui.Constants');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.Localization');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
 shaka.ui.OverflowMenu = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!shaka.extern.UIConfiguration} */
    this.config_ = this.controls.getConfig();

    /** @private {HTMLElement} */
    this.controlsContainer_ = this.controls.getControlsContainer();

    /** @private {!Array.<shaka.extern.IUIElement>} */
    this.children_ = [];

    this.addOverflowMenuButton_();

    this.addOverflowMenu_();

    this.createChildren_();

    const backToOverflowMenuButtons =
        this.controls.getVideoContainer().getElementsByClassName(
            'shaka-back-to-overflow-button');

    for (let i = 0; i < backToOverflowMenuButtons.length; i++) {
      const button = backToOverflowMenuButtons[i];
      this.eventManager.listen(button, 'click', () => {
        // Hide the submenus, display the overflow menu
        this.controls.hideSettingsMenus();
        shaka.ui.Utils.setDisplay(this.overflowMenu_, true);

        // If there are back to overflow menu buttons, there must be
        // overflow menu buttons, but oh well
        if (this.overflowMenu_.childNodes.length) {
          /** @type {!HTMLElement} */ (this.overflowMenu_.childNodes[0])
            .focus();
        }

        // Make sure controls are displayed
        this.controls.computeOpacity();
      });
    }

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_UPDATED, () => {
        this.updateAriaLabel_();
      });

    this.eventManager.listen(
      this.localization, shaka.ui.Localization.LOCALE_CHANGED, () => {
        this.updateAriaLabel_();
      });


    this.eventManager.listen(
      this.controls, 'submenuopen', () => {
        // Hide the main overflow menu if one of the sub menus has
        // been opened.
        shaka.ui.Utils.setDisplay(this.overflowMenu_, false);
      });


    this.eventManager.listen(
      this.overflowMenu_, 'touchstart', (event) => {
        this.controls.setLastTouchEventTime(Date.now());
        event.stopPropagation();
      });

    this.eventManager.listen(this.overflowMenuButton_, 'click', () => {
        this.onOverflowMenuButtonClick_();
      });

    this.updateAriaLabel_();
  }

  /** @override */
  async destroy() {
    this.controlsContainer_ = null;

    await Promise.all(this.children_.map((child) => child.destroy()));
    this.children_ = [];

    await super.destroy();
  }

  /**
   * @param {string} name
   * @param {!shaka.extern.IUIElement.Factory} factory
   * @export
   */
  static registerElement(name, factory) {
    shaka.ui.OverflowMenu.elementNamesToFactories_.set(name, factory);
  }


  /**
   * @private
   */
  addOverflowMenu_() {
    /** @private {!HTMLElement} */
    this.overflowMenu_ = shaka.util.Dom.createHTMLElement('div');
    this.overflowMenu_.classList.add('shaka-overflow-menu');
    this.overflowMenu_.classList.add('shaka-no-propagation');
    this.overflowMenu_.classList.add('shaka-show-controls-on-mouse-over');
    this.overflowMenu_.classList.add('shaka-settings-menu');
    this.controlsContainer_.appendChild(this.overflowMenu_);
  }


  /**
   * @private
   */
  addOverflowMenuButton_() {
    /** @private {!HTMLElement} */
    this.overflowMenuButton_ = shaka.util.Dom.createHTMLElement('button');
    this.overflowMenuButton_.classList.add('shaka-overflow-menu-button');
    this.overflowMenuButton_.classList.add('shaka-no-propagation');
    this.overflowMenuButton_.classList.add('material-icons-round');
    this.overflowMenuButton_.textContent =
      shaka.ui.Enums.MaterialDesignIcons.OPEN_OVERFLOW;
    this.parent.appendChild(this.overflowMenuButton_);
  }


  /**
   * @private
   */
  createChildren_() {
    for (let i = 0; i < this.config_.overflowMenuButtons.length; i++) {
      const name = this.config_.overflowMenuButtons[i];
      if (shaka.ui.OverflowMenu.elementNamesToFactories_.get(name)) {
        const factory =
            shaka.ui.OverflowMenu.elementNamesToFactories_.get(name);
        goog.asserts.assert(this.controls, 'Controls should not be null!');
        this.children_.push(factory.create(this.overflowMenu_, this.controls));
      } else {
        shaka.log.alwaysWarn('Unrecognized overflow menu element requested:',
                             name);
      }
    }
  }


  /** @private */
  onOverflowMenuButtonClick_() {
    if (this.controls.anySettingsMenusAreOpen()) {
      this.controls.hideSettingsMenus();
    } else {
      shaka.ui.Utils.setDisplay(this.overflowMenu_, true);
      this.controls.computeOpacity();

      // If overflow menu has currently visible buttons, focus on the
      // first one, when the menu opens.
      const isDisplayed = function(element) {
        return element.classList.contains('shaka-hidden') == false;
      };

      const Iterables = shaka.util.Iterables;
      if (Iterables.some(this.overflowMenu_.childNodes, isDisplayed)) {
        // Focus on the first visible child of the overflow menu
        const visibleElements =
          Iterables.filter(this.overflowMenu_.childNodes, isDisplayed);
        /** @type {!HTMLElement} */ (visibleElements[0]).focus();
      }
    }
  }


  /**
   * @private
   */
  updateAriaLabel_() {
    const LocIds = shaka.ui.Locales.Ids;
    this.overflowMenuButton_.setAttribute(shaka.ui.Constants.ARIA_LABEL,
        this.localization.resolve(LocIds.MORE_SETTINGS));
  }
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.OverflowMenu.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.OverflowMenu(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
  'overflow_menu', new shaka.ui.OverflowMenu.Factory());


/** @private {!Map.<string, !shaka.extern.IUIElement.Factory>} */
shaka.ui.OverflowMenu.elementNamesToFactories_ = new Map();

