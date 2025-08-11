/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.MaterialSVGIcon');

goog.require('shaka.ui.Enums');
goog.require('shaka.util.Dom');

/**
 * @final
 * @export
 */
shaka.ui.MaterialSVGIcon = class {
  /**
   * @param {?HTMLElement} parent
   */
  constructor(parent) {
    this.parent = parent;

    /** @private {!SVGElement} */
    this.svg_ = shaka.util.Dom.createSVGElement('svg');

    /** @private {!SVGElement} */
    this.path_ = shaka.util.Dom.createSVGElement('path');

    this.svg_.classList.add('material-svg-icon');
    this.svg_.setAttribute('viewBox', '0 -960 960 960');

    this.svg_.appendChild(this.path_);

    if (this.parent) {
      parent.appendChild(this.svg_);
    }
  }

  /**
   * @param {shaka.ui.Enums.MaterialDesignSVGIcons} icon
   * @export
   */
  use(icon) {
    this.path_.setAttribute('d', icon);
  }

  /**
   * @return {!SVGElement}
   * @export
   */
  getSvgElement() {
    return this.svg_;
  }
};
