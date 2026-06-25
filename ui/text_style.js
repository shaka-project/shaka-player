/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.TextStyleMenu');

goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');
goog.requireType('shaka.ui.TextStylePreview');


/**
 * Abstract base for text style configuration menus (position, size, etc.).
 * Subclasses implement the template methods getItems / getLabelForItem /
 * onItemSelected / getPreviewConfigForItem / getCurrentValueLabel.
 *
 * @extends {shaka.ui.SettingsMenu}
 * @template T
 * @abstract
 * @export
 */
shaka.ui.TextStyleMenu = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   * @param {string} icon
   */
  constructor(parent, controls, icon) {
    super(parent, controls, icon);

    this.eventManager.listenMulti(
        this.player,
        [
          'loading',
          'unloading',
          'configurationchanged',
          'trackschanged',
        ], () => {
          this.updateCurrentSelection_();
          this.checkAvailability();
        });
  }

  /** @override */
  checkAvailability() {
    const tracks = this.player.getTextTracks() || [];
    const hasTrack = tracks.some((track) => track.active);
    const available = hasTrack && !this.isSubMenuOpened &&
        this.controls.getConfig().captionsStyles;
    shaka.ui.Utils.setDisplay(this.button, available);
    this.button.ariaPressed = available ? 'true' : 'false';
  }

  /** @override */
  onMenuOpen() {
    this.controls.showTextStylePreview();
  }

  /** @override */
  onMenuClose() {
    this.controls.hideTextStylePreview();
  }

  /**
   * @return {!Array<T>}
   * @protected
   */
  getItems() { return []; }

  /**
   * @param {T} item
   * @return {string}
   * @protected
   */
  getLabelForItem(item) { return ''; }

  /**
   * @param {T} item
   * @protected
   */
  onItemSelected(item) {}

  /**
   * @param {T} item
   * @return {!shaka.ui.TextStylePreview.Configuration}
   * @protected
   */
  getPreviewConfigForItem(item) { return {}; }

  /**
   * @return {string}
   * @protected
   */
  getCurrentValueLabel() { return ''; }

  /**
   * Clears and rebuilds the menu items, then refreshes the selection indicator.
   * Call from the subclass constructor and from updateLocalizedStrings() when
   * item labels are localized strings.
   * @protected
   */
  rebuildMenu() {
    const backButton = shaka.ui.Utils.getFirstDescendantWithClassName(
        this.menu, 'shaka-back-to-overflow-button');
    shaka.util.Dom.removeAllChildren(this.menu);
    this.menu.appendChild(backButton);

    for (const item of this.getItems()) {
      const button = shaka.util.Dom.createButton();
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', 'false');
      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = this.getLabelForItem(item);
      button.appendChild(span);

      this.eventManager.listen(button, 'click', () => {
        this.onItemSelected(item);
        this.updateCurrentSelection_();
      });

      shaka.ui.Utils.addHoverAndFocusListeners(
          this.eventManager, button,
          () => this.controls.updateTextStylePreview(
              this.getPreviewConfigForItem(item)),
          () => this.controls.resetTextStylePreview());

      this.menu.appendChild(button);
    }

    this.updateCurrentSelection_();
    shaka.ui.Utils.focusOnTheChosenItem(this.menu);
  }

  /** @private */
  updateCurrentSelection_() {
    const checkmarkIcon = shaka.ui.Utils.getDescendantIfExists(
        this.menu, 'shaka-ui-icon shaka-chosen-item');
    if (checkmarkIcon) {
      const prevButton = checkmarkIcon.parentElement;
      prevButton.setAttribute('aria-checked', 'false');
      const prevSpan = prevButton.getElementsByTagName('span')[0];
      if (prevSpan) {
        prevSpan.classList.remove('shaka-chosen-item');
      }
      prevButton.removeChild(checkmarkIcon);
    }

    const currentLabel = this.getCurrentValueLabel();
    const span = Array.from(this.menu.querySelectorAll('span'))
        .find((el) => el.textContent === currentLabel);
    if (span) {
      const button = span.parentElement;
      button.appendChild(shaka.ui.Utils.checkmarkIcon());
      shaka.ui.Utils.setChosenItem(button, span);
    }
    this.currentSelection.textContent = currentLabel;
  }
};
