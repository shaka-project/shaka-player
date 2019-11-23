/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.Spacer');

goog.require('shaka.ui.Element');
goog.require('shaka.util.Dom');


/**
 * @extends {shaka.ui.Element}
 * @final
 * @export
 */
shaka.ui.Spacer = class extends shaka.ui.Element {
  /**
   * @param {!HTMLElement} parent
   * @param {!shaka.ui.Controls} controls
   */
  constructor(parent, controls) {
    super(parent, controls);

    /** @private {!HTMLElement} */
    const div = shaka.util.Dom.createHTMLElement('div');
    div.classList.add('shaka-spacer');
    // Make screen readers ignore the spacer
    div.setAttribute('aria-hidden', true);
    this.parent.appendChild(div);
  }
};

/**
 * @implements {shaka.extern.IUIElement.Factory}
 * @final
 */
shaka.ui.Spacer.Factory = class {
  /** @override */
  create(rootElement, controls) {
    return new shaka.ui.Spacer(rootElement, controls);
  }
};

shaka.ui.Controls.registerElement(
    'spacer', new shaka.ui.Spacer.Factory());
