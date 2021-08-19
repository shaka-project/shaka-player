/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shakaDemo.InputContainer');


goog.require('shakaDemo.Tooltips');
goog.requireType('shakaDemo.MessageIds');

/**
 * Creates elements for containing inputs. It represents a single "section" of
 * input.
 * It contains a number of "rows", each of which contains an optional label and
 * an input.
 * It also has an optional header, which can contain style-dependent
 * functionality.
 */
shakaDemo.InputContainer = class {
  /**
   * @param {!Element} parentDiv
   * @param {?shakaDemo.MessageIds} headerText The text to be displayed by
   *   the header. If null, there will be no header.
   * @param {!shakaDemo.InputContainer.Style} style
   * @param {?string} docLink
   */
  constructor(parentDiv, headerText, style, docLink) {
    /** @private {!shakaDemo.InputContainer.Style} */
    this.style_ = style;

    /** @private {?Element} */
    this.header_;

    /** @private {!Element} */
    this.table_ = document.createElement('div');

    /** @private {?Element} */
    this.latestRow_;

    /** @private {?string} */
    this.defaultRowClass_ = null;

    /** @type {?Element} */
    this.latestElementContainer;

    /** @type {?shakaDemo.MessageIds} */
    this.latestTooltip;

    /** @private {number} */
    this.numRows_ = 0;

    if (headerText) {
      this.createHeader_(parentDiv, headerText);
    }
    this.table_.classList.add(style);
    if (style == shakaDemo.InputContainer.Style.ACCORDION) {
      this.table_.classList.add('hidden');
    }
    parentDiv.appendChild(this.table_);
    if (docLink) {
      this.addDocLink_(this.table_, docLink);
    }
  }

  /**
   * @return {boolean} true if this is an open accordion menu, false otherwise
   */
  getIsOpen() {
    if (this.style_ == shakaDemo.InputContainer.Style.ACCORDION) {
      return this.table_.classList.contains('show');
    }
    return false;
  }

  /** If this is an accordion menu, open it. */
  open() {
    if (!this.style_ == shakaDemo.InputContainer.Style.ACCORDION) {
      return;
    }
    this.table_.classList.remove('hidden');
    setTimeout(() => {
      this.table_.classList.add('show');
    }, /* milliseconds= */ 20);
    this.header_.classList.add('mdl-button--colored');
  }

  /** If this is an accordion menu, close it. */
  close() {
    if (this.style_ != shakaDemo.InputContainer.Style.ACCORDION) {
      return;
    }
    this.table_.classList.remove('show');
    this.table_.addEventListener('transitionend', (e) => {
      this.table_.classList.add('hidden');
    }, {once: true});
    this.header_.classList.remove('mdl-button--colored');
  }

  /**
   * @param {!Element} parentDiv
   * @param {shakaDemo.MessageIds} headerText
   * @private
   */
  createHeader_(parentDiv, headerText) {
    if (this.style_ == shakaDemo.InputContainer.Style.ACCORDION) {
      this.header_ = document.createElement('button');
      this.header_.classList.add('mdl-button--raised');
      this.header_.classList.add('mdl-button');
      this.header_.classList.add('mdl-js-button');
      this.header_.classList.add('mdl-js-ripple-effect');
      this.header_.addEventListener('click', () => {
        // Show/hide the table.
        if (this.getIsOpen()) {
          this.close();
        } else {
          this.open();
        }
      });
    } else {
      this.header_ = document.createElement('div');
      this.header_.classList.add('input-header');
    }
    this.header_.textContent = shakaDemoMain.getLocalizedString(headerText);
    parentDiv.appendChild(this.header_);
  }

  /**
   * Creates a link that links to a section within the Shaka Player docs.
   * @param {!Element} parentDiv
   * @param {string} docLink
   * @private
   */
  addDocLink_(parentDiv, docLink) {
    const link = /** @type {!HTMLAnchorElement} */(document.createElement('a'));
    link.href = docLink;
    link.target = '_blank';
    link.classList.add('mdl-button');
    link.classList.add('mdl-js-button');
    link.classList.add('mdl-js-ripple-effect');
    link.classList.add('mdl-button--colored');

    const icon = document.createElement('i');
    icon.classList.add('material-icons-round');
    icon.textContent = 'help';

    link.appendChild(icon);
    parentDiv.appendChild(link);
  }

  /**
   * Set the default row class for future calls to addRow().
   *
   * @param {?string} rowClass
   */
  setDefaultRowClass(rowClass) {
    this.defaultRowClass_ = rowClass;
  }

  /**
   * Return the CSS class list for the container.
   *
   * @return {!DOMTokenList}
   */
  getClassList() {
    return this.table_.classList;
  }

  /**
   * Makes a row, for storing an input.
   * @param {?shakaDemo.MessageIds} labelString
   * @param {?shakaDemo.MessageIds} tooltipString
   * @param {string=} rowClass
   */
  addRow(labelString, tooltipString, rowClass) {
    rowClass = rowClass || this.defaultRowClass_ || '';
    this.latestRow_ = document.createElement('div');
    if (rowClass) {
      this.latestRow_.classList.add(rowClass);
    }
    this.table_.appendChild(this.latestRow_);

    const elementId = 'input-container-row-' + this.numRows_;
    this.numRows_ += 1;

    if (labelString) {
      const label = document.createElement('label');
      label.setAttribute('for', elementId);
      label.classList.add('input-container-label');
      const labelText = document.createElement('b');
      labelText.textContent = shakaDemoMain.getLocalizedString(labelString);
      label.appendChild(labelText);
      this.latestRow_.appendChild(label);
    }

    this.latestElementContainer = document.createElement('div');
    this.latestRow_.appendChild(this.latestElementContainer);

    this.latestElementContainer.classList.add('input-container-row');
    this.latestElementContainer.id = elementId;

    this.latestTooltip = tooltipString;
    if (tooltipString) {
      shakaDemo.Tooltips.make(this.latestRow_, tooltipString);
      // Keep the row from being focused.
      this.latestRow_.setAttribute('tabindex', -1);
      this.latestRow_.classList.add('borderless');
    }
  }
};

/** @enum {string} */
shakaDemo.InputContainer.Style = {
  VERTICAL: 'input-container-style-vertical',
  ACCORDION: 'input-container-style-accordion',
  FLEX: 'input-container-style-flex',
};
