/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.MaterialSVGIcon');

goog.require('shaka.util.Dom');

/**
 * @final
 * @export
 */
shaka.ui.MaterialSVGIcon = class {
  /**
   * @param {?Element} parent
   * @param {?string=} icon
   */
  constructor(parent, icon) {
    this.parent = parent;

    /** @private {!SVGElement} */
    this.svg_ = shaka.util.Dom.createSVGElement('svg');

    /** @private {!SVGElement} */
    this.path_ = shaka.util.Dom.createSVGElement('path');

    this.svg_.classList.add('material-svg-icon');
    this.svg_.setAttribute('viewBox', '0 -960 960 960');

    if (icon) {
      this.use(icon);
    }

    this.svg_.appendChild(this.path_);

    if (this.parent) {
      parent.appendChild(this.svg_);
    }
  }

  /**
   * @param {string} icon
   * @export
   */
  use(icon) {
    if (icon && typeof icon == 'string') {
      this.path_.setAttribute('d', icon);
    }
  }

  /**
   * @return {!SVGElement}
   * @export
   */
  getSvgElement() {
    return this.svg_;
  }
};
