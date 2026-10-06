/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.MenuGroup');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.Utils');
goog.requireType('shaka.ui.Controls');


/**
 * A menu button that opens a submenu holding other UI elements, which may be
 * menu groups too.  Subclasses define the icon, the name and the elements
 * inside the group.  The group is only shown when at least one of its
 * elements is shown.
 *
 * @extends {shaka.ui.SettingsMenu}
 * @implements {shaka.extern.IUIMenuGroup}
 * @abstract
 * @export
 */
shaka.ui.MenuGroup = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {shaka.extern.UIIcon | string} icon
   */
  constructor(parent, controls, icon) {
    super(parent, controls, icon);

    this.button.classList.add('shaka-menu-group-button');
    this.menu.classList.add('shaka-menu-group');

    /** @private {!Array<shaka.extern.IUIElement>} */
    this.children_ = [];

    /**
     * The current selection span of the element given by
     * getSummaryElementName().
     * @private {?Element}
     */
    this.summarySpan_ = null;

    /**
     * Whether a submenu of one of the elements in the group is open.
     * @private {boolean}
     */
    this.isChildMenuOpened_ = false;

    this.createChildren_();

    this.button.classList.add(
        this.summarySpan_ ? 'shaka-tooltip-status' : 'shaka-tooltip');

    this.eventManager.listen(this.controls, 'submenuopen', (event) => {
      if (event['container'] == this.menu) {
        this.isChildMenuOpened_ = true;
        shaka.ui.Utils.setDisplay(this.backButton, false);
      }
    });
    this.eventManager.listen(this.controls, 'submenuclose', (event) => {
      const container = event['container'];
      if (!container || container == this.menu) {
        this.isChildMenuOpened_ = false;
        shaka.ui.Utils.setDisplay(this.backButton, true);
      }
    });

    // Follow the visibility and the current selection of the elements in the
    // group.
    /** @private {MutationObserver} */
    this.childrenObserver_ = new MutationObserver(() => this.update_());
    this.childrenObserver_.observe(this.menu, {
      attributes: true,
      attributeFilter: ['class'],
      characterData: true,
      childList: true,
      subtree: true,
    });

    this.updateLocalizedStrings();
    this.update_();
  }

  /** @override */
  release() {
    if (this.childrenObserver_) {
      this.childrenObserver_.disconnect();
      this.childrenObserver_ = null;
    }
    for (const child of this.children_) {
      child.release();
    }
    this.children_ = [];
    this.summarySpan_ = null;
    super.release();
  }

  /**
   * @override
   * @abstract
   */
  getName() {}

  /**
   * @override
   * @abstract
   */
  getChildElementNames() {}

  /** @override */
  getSummaryElementName() {
    return null;
  }

  /** @private */
  createChildren_() {
    const MenuGroup = shaka.ui.MenuGroup;
    const summaryName = this.getSummaryElementName();
    for (const name of this.getChildElementNames()) {
      const factory = shaka.ui.OverflowMenu.getElementFactory(name);
      if (!factory) {
        shaka.log.alwaysWarn('Unrecognized menu group element requested:',
            name);
        continue;
      }
      // Groups are created recursively, so a group that contains itself,
      // directly or not, would never stop.
      if (MenuGroup.namesInCreation_.includes(name)) {
        shaka.log.alwaysWarn('Menu group element contains itself:', name);
        continue;
      }
      const previousNodes = new Set(this.menu.childNodes);
      MenuGroup.namesInCreation_.push(name);
      try {
        goog.asserts.assert(this.controls, 'Controls should not be null!');
        this.children_.push(factory.create(this.menu, this.controls));
      } finally {
        MenuGroup.namesInCreation_.pop();
      }
      if (name == summaryName) {
        const newNodes = Array.from(this.menu.childNodes)
            .filter((node) => !previousNodes.has(node));
        for (const node of newNodes) {
          if (!(node instanceof HTMLElement)) {
            continue;
          }
          const span = node.querySelector('.shaka-current-selection-span');
          if (span && !node.classList.contains('shaka-sub-menu')) {
            this.summarySpan_ = span;
            break;
          }
        }
      }
    }
  }

  /**
   * @return {!Array<!Element>} The elements in the group that are shown.
   * @private
   */
  getShownChildren_() {
    const nodes = /** @type {!Array<!Element>} */ (Array.from(
        this.menu.childNodes).filter((node) => node instanceof HTMLElement));
    return nodes.filter((node) => {
      return node != this.backButton &&
          !node.classList.contains('shaka-sub-menu') &&
          !node.classList.contains('shaka-hidden');
    });
  }

  /** @private */
  update_() {
    if (!this.childrenObserver_) {
      return;
    }
    if (this.summarySpan_) {
      const summary = this.summarySpan_.textContent;
      if (this.currentSelection.textContent != summary) {
        this.currentSelection.textContent = summary;
        this.button.setAttribute('shaka-status', summary);
      }
    }
    this.checkAvailability();

    // Leave the group when it gets empty while it is open, e.g. when the
    // text is disabled while the subtitle style options are displayed.
    const isOpen = !this.menu.classList.contains('shaka-hidden');
    if (isOpen && !this.isChildMenuOpened_ &&
        !this.getShownChildren_().length) {
      const focusIsInMenu =
          this.menu.contains(this.menu.ownerDocument.activeElement);
      this.backButton.click();
      if (focusIsInMenu) {
        this.controls.restoreFocus();
      }
    }
  }

  /** @override */
  checkAvailability() {
    if (!this.children_) {
      return;
    }
    const available = !this.isSubMenuOpened &&
        this.getShownChildren_().length > 0;
    shaka.ui.Utils.setDisplay(this.button, available);
  }

  /** @override */
  focusOnMenuOpen() {
    const shownChildren = this.getShownChildren_();
    const target = shownChildren.length ?
        /** @type {!HTMLElement} */ (shownChildren[0]) : this.backButton;
    target.focus();
  }

  /** @override */
  shouldCloseOnMenuClick(event) {
    // Only the back button leaves the group.  Clicks on its elements open
    // their own submenus, or act on them.
    return this.backButton.contains(/** @type {?Node} */ (event.target));
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    const name = this.getName();
    this.button.ariaLabel = name;
    this.nameSpan.textContent = name;
    this.backSpan.textContent = name;
  }
};


/**
 * The names of the elements being created, from the outermost menu group to
 * the innermost one.
 *
 * @private {!Array<string>}
 */
shaka.ui.MenuGroup.namesInCreation_ = [];
