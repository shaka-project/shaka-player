/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SettingsMenu');

goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.MenuBase');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.FakeEvent');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.MenuBase}
 * @implements {shaka.extern.IUISettingsMenu}
 * @export
 */
shaka.ui.SettingsMenu = class extends shaka.ui.MenuBase {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {shaka.extern.UIIcon | string} iconText
   */
  constructor(parent, controls, iconText) {
    super(parent, controls);

    this.addButton_(iconText);

    this.addMenu_();

    /** @private {boolean} */
    this.isMenuOpened_ = false;

    this.inOverflowMenu_();

    this.eventManager.listen(this.button, 'click', () => {
      if (!this.controls.isOpaque()) {
        return;
      }
      this.onButtonClick_();
    });

    /** @private {MutationObserver} */
    this.mutationObserver_ = null;

    /** @private {MutationObserver} */
    this.menuMutationObserver_ = null;

    if (window.MutationObserver) {
      this.menuMutationObserver_ = new MutationObserver(() => {
        if (this.menu.classList.contains('shaka-hidden')) {
          this.notifyMenuClose_();
        } else {
          this.notifyMenuOpen_();
        }
      });
      this.menuMutationObserver_.observe(this.menu, {
        attributes: true,
        attributeFilter: ['class'],
      });
    }
  }

  /** @override */
  release() {
    if (this.mutationObserver_) {
      this.mutationObserver_.disconnect();
      this.mutationObserver_ = null;
    }
    if (this.menuMutationObserver_) {
      this.menuMutationObserver_.disconnect();
      this.menuMutationObserver_ = null;
    }
    super.release();
  }


  /**
   * @param {shaka.extern.UIIcon | string} iconText
   * @private
   */
  addButton_(iconText) {
    /** @protected {!HTMLButtonElement} */
    this.button = shaka.util.Dom.createButton();
    this.button.setAttribute('aria-haspopup', 'true');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.classList.add('shaka-overflow-button');

    /** @protected {!shaka.ui.Icon}*/
    this.icon = new shaka.ui.Icon(this.button, iconText);

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
    this.menu.setAttribute('role', 'menu');
    if (this.isSubMenu) {
      this.menu.classList.add('shaka-sub-menu');
    } else {
      this.menu.classList.add('shaka-settings-menu');
    }
    this.menu.classList.add('shaka-hidden');

    /** @protected {!HTMLButtonElement}*/
    this.backButton = shaka.util.Dom.createButton();
    this.backButton.classList.add('shaka-back-to-overflow-button');
    this.menu.appendChild(this.backButton);
    this.eventManager.listen(this.backButton, 'click', () => {
      this.controls.hideSettingsMenus();
      this.backButton.focus();
    });

    /** @private {shaka.ui.Icon} */
    this.backIcon_ = new shaka.ui.Icon(this.backButton,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSE']);

    /** @protected {!HTMLElement}*/
    this.backSpan = shaka.util.Dom.createHTMLElement('span');
    this.backButton.appendChild(this.backSpan);

    if (this.isSubMenu) {
      this.parent.appendChild(this.menu);
    } else {
      const controlsContainer = this.controls.getControlsContainer();
      controlsContainer.appendChild(this.menu);
    }
  }

  /** @private */
  inOverflowMenu_() {
    // Initially, submenus are created with a "Close" option. When present
    // inside of the overflow menu, that option must be replaced with a
    // "Back" arrow that returns the user to the main menu.
    if (this.isSubMenu) {
      this.backIcon_.use(shaka.ui.Enums.MaterialDesignSVGIcons['BACK']);

      this.eventManager.listen(this.menu, 'click', () => {
        this.notifyMenuClose_();
        this.controls.dispatchEvent(new shaka.util.FakeEvent('submenuclose'));
        shaka.ui.Utils.setDisplay(this.menu, false);
        shaka.ui.Utils.setDisplay(this.parent, true);
      });

      let prevHidden = this.parent.classList.contains('shaka-hidden');

      this.mutationObserver_ = new MutationObserver((mutations) => {
        if (!this.parent) {
          return;
        }
        for (const m of mutations) {
          if (m.type === 'attributes' && m.attributeName === 'class') {
            const newHidden = this.parent.classList.contains('shaka-hidden');
            if (newHidden && prevHidden != newHidden) {
              if (!this.menu.classList.contains('shaka-hidden')) {
                this.notifyMenuClose_();
              }
              this.controls.dispatchEvent(
                  new shaka.util.FakeEvent('submenuclose'));
              shaka.ui.Utils.setDisplay(this.menu, false);
            }
            prevHidden = newHidden;
          }
        }
      });

      this.mutationObserver_.observe(this.parent, {
        attributes: true,
        attributeFilter: ['class'],
        attributeOldValue: true,
      });
    }
  }


  /** @private */
  onButtonClick_() {
    if (!this.parent.classList.contains('shaka-context-menu')) {
      this.controls.hideContextMenus();
      this.button.setAttribute('aria-expanded', 'false');
    }
    if (!this.isSubMenu && this.controls.anySettingsMenusAreOpen()) {
      this.controls.hideSettingsMenus();
    } else {
      if (this.menu.classList.contains('shaka-hidden')) {
        if (this.isSubMenu) {
          this.controls.dispatchEvent(new shaka.util.FakeEvent('submenuopen'));
        }
        shaka.ui.Utils.setDisplay(this.menu, true);
        this.notifyMenuOpen_();
        shaka.ui.Utils.focusOnTheChosenItem(this.menu);
        this.adjustCustomStyle();
        this.button.setAttribute('aria-expanded', 'true');
      } else {
        this.notifyMenuClose_();
        shaka.ui.Utils.setDisplay(this.menu, false);
        this.button.setAttribute('aria-expanded', 'false');
        this.button.focus();
      }
    }
  }

  /** @private */
  notifyMenuOpen_() {
    if (this.isMenuOpened_) {
      return;
    }

    this.isMenuOpened_ = true;
    this.onMenuOpen();
  }

  /** @private */
  notifyMenuClose_() {
    if (!this.isMenuOpened_) {
      return;
    }

    this.isMenuOpened_ = false;
    this.onMenuClose();
  }

  /** @protected */
  onMenuOpen() {}

  /** @protected */
  onMenuClose() {}

  /** @override */
  adjustCustomStyle() {
    // Submenus inherit the positioning of their parent overflow element.
    if (this.isSubMenu) {
      return;
    }
    this.adjustMenuStyle(
        this.menu,
        this.button,
        this.controls.getControlsContainer());
  }
};
