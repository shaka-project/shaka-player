/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.ContextMenu');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.ui.Element');
goog.require('shaka.ui.Utils');
goog.require('shaka.util.Dom');
goog.requireType('shaka.ui.Controls');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.ContextMenu = class extends shaka.ui.Element {
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

    /** @private {!HTMLElement} */
    this.contextMenu_ = shaka.util.Dom.createHTMLElement('div');
    this.contextMenu_.classList.add('shaka-no-propagation');
    this.contextMenu_.classList.add('shaka-context-menu');
    this.contextMenu_.classList.add('shaka-hidden');

    this.controlsContainer_.appendChild(this.contextMenu_);

    this.eventManager.listen(this.controlsContainer_, 'contextmenu', (e) => {
      if (this.contextMenu_.classList.contains('shaka-hidden')) {
        e.preventDefault();

        const controlsLocation =
            this.controlsContainer_.getBoundingClientRect();
        this.contextMenu_.style.left = `${e.clientX - controlsLocation.left}px`;
        this.contextMenu_.style.top = `${e.clientY - controlsLocation.top}px`;

        shaka.ui.Utils.setDisplay(this.contextMenu_, true);
      } else {
        shaka.ui.Utils.setDisplay(this.contextMenu_, false);
      }
    });

    this.eventManager.listen(window, 'click', () => {
      shaka.ui.Utils.setDisplay(this.contextMenu_, false);
    });

    this.createChildren_();
  }

  /** @override */
  release() {
    this.controlsContainer_ = null;

    for (const element of this.children_) {
      element.release();
    }

    this.children_ = [];
    super.release();
  }

  /**
   * @param {string} name
   * @param {!shaka.extern.IUIElement.Factory} factory
   * @export
   */
  static registerElement(name, factory) {
    shaka.ui.ContextMenu.elementNamesToFactories_.set(name, factory);
  }

  /**
   * @private
   */
  createChildren_() {
    for (const name of this.config_.contextMenuElements) {
      const factory =
          shaka.ui.ContextMenu.elementNamesToFactories_.get(name);
      if (factory) {
        goog.asserts.assert(this.controls, 'Controls should not be null!');
        this.children_.push(factory.create(this.contextMenu_, this.controls));
      } else {
        shaka.log.alwaysWarn('Unrecognized context menu element:', name);
      }
    }
  }
};

/** @private {!Map.<string, !shaka.extern.IUIElement.Factory>} */
shaka.ui.ContextMenu.elementNamesToFactories_ = new Map();
