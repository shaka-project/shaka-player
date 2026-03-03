/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.SettingsMenu');

goog.require('shaka.ui.Element');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.FakeEvent');
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
   * @param {shaka.extern.UIIcon | string} iconText
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

    /** @private {MutationObserver} */
    this.mutationObserver_ = null;

    const resize = () => this.adjustCustomStyle_();

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
    if (this.mutationObserver_) {
      this.mutationObserver_.disconnect();
      this.mutationObserver_ = null;
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
    }
    if (!this.isSubMenu && this.controls.anySettingsMenusAreOpen()) {
      this.controls.hideSettingsMenus();
    } else {
      if (this.menu.classList.contains('shaka-hidden')) {
        if (this.isSubMenu) {
          this.controls.dispatchEvent(new shaka.util.FakeEvent('submenuopen'));
        }
        shaka.ui.Utils.setDisplay(this.menu, true);
        shaka.ui.Utils.focusOnTheChosenItem(this.menu);
        this.adjustCustomStyle_();
      } else {
        shaka.ui.Utils.setDisplay(this.menu, false);
      }
    }
  }


  /**
   * @private
   */
  adjustCustomStyle_() {
    if (this.isSubMenu) {
      // Submenus take up the style of the overflow element.
      return;
    }
    // Compute max height
    const rectMenu = this.menu.getBoundingClientRect();
    const styleMenu = window.getComputedStyle(this.menu);
    const paddingTop = parseFloat(styleMenu.paddingTop);
    const paddingBottom = parseFloat(styleMenu.paddingBottom);
    const rectContainer = this.videoContainer_.getBoundingClientRect();
    const gap = 5;
    const heightIntersection =
        rectMenu.bottom - rectContainer.top - paddingTop - paddingBottom - gap;

    this.menu.style.maxHeight = heightIntersection + 'px';

    // Compute horizontal position
    const bottomControlsPos =
        this.controls.getControlsContainer().getBoundingClientRect();
    const settingsMenuButtonPos =
        this.button.getBoundingClientRect();
    const leftGap = settingsMenuButtonPos.left - bottomControlsPos.left;
    const rightGap = bottomControlsPos.right - settingsMenuButtonPos.right;
    const EDGE_PADDING = 15;
    const MIN_GAP = 60;
    // Settings menu button is either placed to the left or center
    if (leftGap < rightGap) {
      const left = leftGap < MIN_GAP ?
          EDGE_PADDING : Math.max(leftGap, EDGE_PADDING);
      this.menu.style.left = left + 'px';
      this.menu.style.right = 'auto';
    } else {
      const right = rightGap < MIN_GAP ?
          EDGE_PADDING : Math.max(rightGap, EDGE_PADDING);
      this.menu.style.right = right + 'px';
      this.menu.style.left = 'auto';
    }
  }
};
