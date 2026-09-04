/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.CaptionStyle');

goog.require('shaka.config.PositionArea');
goog.require('shaka.ui.Controls');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.Icon');
goog.require('shaka.ui.Locales');
goog.require('shaka.ui.OverflowMenu');
goog.require('shaka.ui.SettingsMenu');
goog.require('shaka.ui.TextPosition');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.TextStylePreview');


/**
 * Submenu for configuring subtitle style (size, position, etc.).
 *
 * @extends {shaka.ui.SettingsMenu}
 * @final
 * @export
 */
shaka.ui.CaptionStyle = class extends shaka.ui.SettingsMenu {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_STYLE']);

    this.button.classList.add('shaka-caption-style-button');
    this.button.classList.add('shaka-tooltip');
    this.menu.classList.add('shaka-caption-style-menu');

    /** @private {shaka.ui.CaptionStyle.Page_} */
    this.currentPage_ = shaka.ui.CaptionStyle.Page_.ROOT;

    /** @private {HTMLButtonElement} */
    this.sizeButton_ = shaka.util.Dom.createButton();
    this.sizeButton_.classList.add('shaka-overflow-button');
    this.sizeButton_.setAttribute('role', 'menuitem');
    this.sizeButton_.setAttribute('aria-haspopup', 'true');
    this.sizeButton_.setAttribute('aria-expanded', 'false');

    /** @private {shaka.ui.Icon} */
    this.sizeIcon_ = new shaka.ui.Icon(this.sizeButton_,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_SIZE']);

    const sizeLabel = shaka.util.Dom.createHTMLElement('label');
    sizeLabel.classList.add('shaka-overflow-button-label');
    sizeLabel.classList.add('shaka-overflow-menu-only');
    sizeLabel.classList.add('shaka-overflow-button-label-inline');

    /** @private {HTMLElement} */
    this.sizeNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    sizeLabel.appendChild(this.sizeNameSpan_);

    /** @private {HTMLElement} */
    this.sizeValueSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.sizeValueSpan_.classList.add('shaka-current-selection-span');
    sizeLabel.appendChild(this.sizeValueSpan_);
    this.sizeButton_.appendChild(sizeLabel);

    this.eventManager.listen(this.sizeButton_, 'click', (e) => {
      e.stopPropagation();
      this.showPage_(shaka.ui.CaptionStyle.Page_.SIZE);
    });

    /** @private {HTMLButtonElement} */
    this.positionButton_ = shaka.util.Dom.createButton();
    this.positionButton_.classList.add('shaka-overflow-button');
    this.positionButton_.setAttribute('role', 'menuitem');
    this.positionButton_.setAttribute('aria-haspopup', 'true');
    this.positionButton_.setAttribute('aria-expanded', 'false');

    /** @private {shaka.ui.Icon} */
    this.positionIcon_ = new shaka.ui.Icon(this.positionButton_,
        shaka.ui.Enums.MaterialDesignSVGIcons['CLOSED_CAPTIONS_POSITION']);

    const positionLabel = shaka.util.Dom.createHTMLElement('label');
    positionLabel.classList.add('shaka-overflow-button-label');
    positionLabel.classList.add('shaka-overflow-menu-only');
    positionLabel.classList.add('shaka-overflow-button-label-inline');

    /** @private {HTMLElement} */
    this.positionNameSpan_ = shaka.util.Dom.createHTMLElement('span');
    positionLabel.appendChild(this.positionNameSpan_);

    /** @private {HTMLElement} */
    this.positionValueSpan_ = shaka.util.Dom.createHTMLElement('span');
    this.positionValueSpan_.classList.add('shaka-current-selection-span');
    positionLabel.appendChild(this.positionValueSpan_);
    this.positionButton_.appendChild(positionLabel);

    this.eventManager.listen(this.positionButton_, 'click', (e) => {
      e.stopPropagation();
      this.showPage_(shaka.ui.CaptionStyle.Page_.POSITION);
    });

    /** @private {!Array<!HTMLButtonElement>} */
    this.sizeButtons_ = [];

    /** @private {!Array<!HTMLButtonElement>} */
    this.positionButtons_ = [];

    this.buildPositionButtons_();
    this.buildSizeButtons_();

    this.eventManager.listenMulti(
        this.player,
        [
          'loading',
          'unloading',
          'configurationchanged',
          'trackschanged',
          'textchanged',
        ], () => {
          this.updateSelectionsAndLabels_();
          this.checkAvailability();
        });

    this.updateLocalizedStrings();
    this.checkAvailability();
  }

  /** @override */
  onBackButtonClick(event) {
    if (this.currentPage_ !== shaka.ui.CaptionStyle.Page_.ROOT) {
      this.controls.hideTextStylePreview();
      const prevPage = this.currentPage_;
      this.showPage_(shaka.ui.CaptionStyle.Page_.ROOT);
      if (prevPage === shaka.ui.CaptionStyle.Page_.SIZE) {
        this.sizeButton_.focus();
      } else if (prevPage === shaka.ui.CaptionStyle.Page_.POSITION) {
        this.positionButton_.focus();
      }
      return true;
    }
    return false;
  }

  /**
   * @param {shaka.ui.CaptionStyle.Page_} page
   * @private
   */
  showPage_(page) {
    this.currentPage_ = page;
    this.sizeButton_.setAttribute(
        'aria-expanded',
        page === shaka.ui.CaptionStyle.Page_.SIZE ? 'true' : 'false');
    this.positionButton_.setAttribute(
        'aria-expanded',
        page === shaka.ui.CaptionStyle.Page_.POSITION ? 'true' : 'false');

    this.render_();

    if (page === shaka.ui.CaptionStyle.Page_.SIZE ||
        page === shaka.ui.CaptionStyle.Page_.POSITION) {
      this.controls.showTextStylePreview();
      const chosenItem = shaka.ui.Utils.getDescendantIfExists(
          this.menu, 'shaka-chosen-item');
      if (chosenItem) {
        chosenItem.parentElement.focus();
      } else {
        const buttons = page === shaka.ui.CaptionStyle.Page_.SIZE ?
            this.sizeButtons_ : this.positionButtons_;
        if (buttons.length) {
          buttons[0].focus();
        } else {
          this.backButton.focus();
        }
      }
    } else if (page === shaka.ui.CaptionStyle.Page_.ROOT) {
      this.sizeButton_.focus();
    }
  }

  /**
   * Clears the menu keeping the back button and populates it for the current
   * page.
   * @private
   */
  render_() {
    const LocIds = shaka.ui.Locales.Ids;
    shaka.ui.Utils.clearMenuKeepingBackButton(this.menu);

    switch (this.currentPage_) {
      case shaka.ui.CaptionStyle.Page_.ROOT:
        this.backSpan.textContent =
            this.localization.resolve(LocIds.SUBTITLE_STYLE);
        this.menu.appendChild(this.sizeButton_);
        this.menu.appendChild(this.positionButton_);
        this.updateSelectionsAndLabels_();
        break;
      case shaka.ui.CaptionStyle.Page_.SIZE:
        this.backSpan.textContent =
            this.localization.resolve(LocIds.SUBTITLE_SIZE);
        for (const button of this.sizeButtons_) {
          this.menu.appendChild(button);
        }
        this.updateSelectionsAndLabels_();
        break;
      case shaka.ui.CaptionStyle.Page_.POSITION:
        this.backSpan.textContent =
            this.localization.resolve(LocIds.SUBTITLE_POSITION);
        for (const button of this.positionButtons_) {
          this.menu.appendChild(button);
        }
        this.updateSelectionsAndLabels_();
        break;
    }
  }

  /**
   * Helper to build a list of radio option buttons for a style property.
   *
   * @param {!Array<T>} items
   * @param {function(T): string} getLabel
   * @param {function(T)} onSelect
   * @param {function(T):
   *     !shaka.ui.TextStylePreview.Configuration} getPreviewConfig
   * @return {!Array<!HTMLButtonElement>}
   * @template T
   * @private
   */
  createRadioOptionButtons_(items, getLabel, onSelect, getPreviewConfig) {
    const buttons = [];
    for (const item of items) {
      const button = shaka.util.Dom.createButton();
      button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', 'false');
      const span = shaka.util.Dom.createHTMLElement('span');
      span.textContent = getLabel(item);
      button.appendChild(span);

      this.eventManager.listen(button, 'click', () => {
        onSelect(item);
        this.updateSelectionsAndLabels_();
        this.controls.hideTextStylePreview();
      });

      shaka.ui.Utils.addHoverAndFocusListeners(
          this.eventManager, button,
          () => this.controls.updateTextStylePreview(getPreviewConfig(item)),
          () => this.controls.resetTextStylePreview());

      buttons.push(button);
    }
    return buttons;
  }

  /** @private */
  buildSizeButtons_() {
    this.sizeButtons_ = this.createRadioOptionButtons_(
        this.controls.getConfig().captionsFontScaleFactors,
        (factor) => factor * 100 + '%',
        (factor) =>
          this.player.configure('textDisplayer.fontScaleFactor', factor),
        (factor) => ({fontScaleFactor: factor}));
  }

  /** @private */
  buildPositionButtons_() {
    this.positionButtons_ = this.createRadioOptionButtons_(
        Object.values(shaka.config.PositionArea),
        (pos) =>
          shaka.ui.TextPosition.getNameOfPosition(pos, this.localization),
        (pos) => this.player.configure('textDisplayer.positionArea', pos),
        (pos) => ({positionArea: pos}));
  }

  /** @private */
  updateSelectionsAndLabels_() {
    const sizeLabel = this.getCurrentSizeLabel_();
    const positionLabel = this.getCurrentPositionLabel_();

    if (this.currentSelection) {
      this.currentSelection.textContent =
          [sizeLabel, positionLabel].filter(Boolean).join(' · ');
    }

    if (this.sizeValueSpan_) {
      this.sizeValueSpan_.textContent = sizeLabel;
    }
    if (this.positionValueSpan_) {
      this.positionValueSpan_.textContent = positionLabel;
    }

    if (this.currentPage_ === shaka.ui.CaptionStyle.Page_.SIZE) {
      this.updateRadioSelection_(this.sizeButtons_, sizeLabel);
    } else if (this.currentPage_ === shaka.ui.CaptionStyle.Page_.POSITION) {
      this.updateRadioSelection_(this.positionButtons_, positionLabel);
    }
  }

  /**
   * @param {!Array<!HTMLButtonElement>} buttons
   * @param {string} currentLabel
   * @private
   */
  updateRadioSelection_(buttons, currentLabel) {
    for (const button of buttons) {
      const checkmarkIcon = shaka.ui.Utils.getDescendantIfExists(
          button, 'shaka-ui-icon shaka-chosen-item');
      if (checkmarkIcon) {
        button.removeChild(checkmarkIcon);
      }
      button.setAttribute('aria-checked', 'false');
      const span = /** @type {HTMLElement} */ (button.querySelector('span'));
      if (span) {
        span.classList.remove('shaka-chosen-item');
        if (span.textContent === currentLabel) {
          button.appendChild(shaka.ui.Utils.checkmarkIcon());
          shaka.ui.Utils.setChosenItem(button, span);
        }
      }
    }
  }

  /**
   * @return {string}
   * @private
   */
  getCurrentSizeLabel_() {
    if (!this.player) {
      return '';
    }
    const config = this.player.getConfiguration();
    const fontScaleFactor = config && config.textDisplayer ?
        config.textDisplayer.fontScaleFactor : 1;
    return fontScaleFactor * 100 + '%';
  }

  /**
   * @return {string}
   * @private
   */
  getCurrentPositionLabel_() {
    if (!this.player) {
      return '';
    }
    const config = this.player.getConfiguration();
    const positionArea = config && config.textDisplayer ?
        config.textDisplayer.positionArea : shaka.config.PositionArea.DEFAULT;
    return shaka.ui.TextPosition.getNameOfPosition(
        positionArea, this.localization);
  }

  /** @override */
  checkAvailability() {
    const tracks = this.player ? (this.player.getTextTracks() || []) : [];
    const hasTrack = tracks.some((track) => track.active);
    const available = hasTrack && !this.isSubMenuOpened &&
        this.controls.getConfig().captionsStyles;
    shaka.ui.Utils.setDisplay(this.button, available);
  }

  /** @override */
  onMenuOpen() {
    this.showPage_(shaka.ui.CaptionStyle.Page_.ROOT);
  }

  /** @override */
  onMenuClose() {
    this.controls.hideTextStylePreview();
    this.currentPage_ = shaka.ui.CaptionStyle.Page_.ROOT;
  }

  /** @override */
  updateLocalizedStrings() {
    const LocIds = shaka.ui.Locales.Ids;

    this.backButton.ariaLabel = this.localization.resolve(LocIds.BACK);

    const styleLabel = this.localization.resolve(LocIds.SUBTITLE_STYLE);
    this.button.ariaLabel = styleLabel;
    this.nameSpan.textContent = styleLabel;

    this.sizeNameSpan_.textContent =
        this.localization.resolve(LocIds.SUBTITLE_SIZE);
    this.positionNameSpan_.textContent =
        this.localization.resolve(LocIds.SUBTITLE_POSITION);

    // Update position button labels with newly resolved strings.
    const positions = Object.values(shaka.config.PositionArea);
    for (let i = 0;
      i < positions.length && i < this.positionButtons_.length;
      i++) {
      const span = this.positionButtons_[i].querySelector('span');
      if (span) {
        span.textContent = shaka.ui.TextPosition.getNameOfPosition(
            positions[i], this.localization);
      }
    }

    this.render_();
  }

  /** @override */
  release() {
    this.sizeIcon_ = null;
    this.positionIcon_ = null;
    this.sizeButton_ = null;
    this.positionButton_ = null;
    this.sizeNameSpan_ = null;
    this.sizeValueSpan_ = null;
    this.positionNameSpan_ = null;
    this.positionValueSpan_ = null;
    this.sizeButtons_ = [];
    this.positionButtons_ = [];
    super.release();
  }
};


/**
 * @enum {string}
 * @private
 */
shaka.ui.CaptionStyle.Page_ = {
  ROOT: 'root',
  SIZE: 'size',
  POSITION: 'position',
};


/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.CaptionStyle.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.CaptionStyle(rootElement, controls);
  }
};

shaka.ui.OverflowMenu.registerElement(
    'captions-style', new shaka.ui.CaptionStyle.Factory());

shaka.ui.OverflowMenu.registerElement(
    'captions-styles', new shaka.ui.CaptionStyle.Factory());

shaka.ui.Controls.registerElement(
    'captions-style', new shaka.ui.CaptionStyle.Factory());

shaka.ui.Controls.registerElement(
    'captions-styles', new shaka.ui.CaptionStyle.Factory());
