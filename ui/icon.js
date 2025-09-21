/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.Icon');

goog.require('shaka.util.Dom');

/**
 * @final
 * @export
 */
shaka.ui.Icon = class {
  /**
   * @param {?Element} parent
   * @param {?(shaka.extern.UIIcon | string)=} icon
   */
  constructor(parent, icon) {
    this.parent = parent;

    /** @private {!SVGElement} */
    this.svg_ = shaka.util.Dom.createSVGElement('svg');

    this.svg_.classList.add('shaka-ui-icon');
    this.svg_.setAttribute('viewBox', '0 -960 960 960');

    if (icon) {
      this.use(icon);
    }

    if (this.parent) {
      parent.appendChild(this.svg_);
    }
  }

  /**
   * If a single string is passed, it is treated as an SVG path
   * @param {shaka.extern.UIIcon | string} icon
   * @export
   */
  use(icon) {
    // check if it is empty string or null or undefined
    if (!icon) {
      return;
    }

    // remove all previous path elements
    this.emptyChildNodes_();

    if (typeof icon == 'string') {
      this.svg_.style.setProperty('font-size', '');
      this.applyInlinedSVG_(icon, null);
    } else if (typeof icon == 'object') {
      const url = icon['url'];
      const path = icon['path'];
      const viewBox = icon['viewBox'];
      const size = icon['size'];

      this.svg_.style.setProperty('font-size', size ? size + 'px': '');

      if (url) {
        // let handle the background-color (icon color) by CSS
        this.svg_.style.setProperty('background-color', 'currentColor');
        this.svg_.style.setProperty('mask-image', `url("${url}")`);
      } else if (path) {
        this.applyInlinedSVG_(path, viewBox);
      }
    }
  }

  /**
   * @return {!SVGElement}
   * @export
   */
  getSvgElement() {
    return this.svg_;
  }


  /**
   * @param {string | Array<string>} path
   * @param {?string} viewBox
   * @private
   */
  applyInlinedSVG_(path, viewBox) {
    // do not need a background color if mask-image isn't using
    this.svg_.style.setProperty('background-color', 'transparent');
    this.svg_.style.setProperty('mask-image', '');
    this.svg_.setAttribute('viewBox', viewBox || '0 -960 960 960');

    if (Array.isArray(path)) {
      for (let i = 0, l = path.length; i < l; i++) {
        this.addPath_(path[i]);
      }
    } else if (path) {
      this.addPath_(path);
    }
  }

  /**
   * Add a path element, call `emptyChildNodes()` first to clean previous
   * path elements.
   * @param {string} path
   * @private
   */
  addPath_(path) {
    const el = shaka.util.Dom.createSVGElement('path');
    el.setAttribute('d', path);
    this.svg_.appendChild(el);
  }

  /**
   * Remove all the child nodes from svg element
   * @private
   */
  emptyChildNodes_() {
    const childNodes = this.svg_.childNodes;
    for (let i = 0, l = childNodes.length, child; i < l; i++) {
      child = childNodes[i];
      if (child instanceof SVGPathElement) {
        child.remove();
      }
    }
  }
};
