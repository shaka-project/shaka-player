/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.ui.UIIcon');

goog.require('shaka.util.Dom');

/**
 * @final
 * @export
 */
shaka.ui.UIIcon = class {
  /**
   * @param {?Element} parent
   * @param {?(shaka.extern.UIIcon | string)=} icon
   */
  constructor(parent, icon) {
    this.parent = parent;

    /** @private {!SVGElement} */
    this.svg_ = shaka.util.Dom.createSVGElement('svg');

    /** @private {!SVGElement} */
    this.path_ = shaka.util.Dom.createSVGElement('path');

    this.svg_.classList.add('shaka-ui-icon');
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
   * If a single string is passed, it is treated as an SVG path
   * @param {shaka.extern.UIIcon | string} icon
   * @export
   */
  use(icon) {
    // check if it is empty string or null or undefined
    if (!icon) return;

    if (typeof icon == 'string') {
      this._applyInlinedSVG(icon, null);
    } else if (typeof icon == 'object') {
      const url = icon['url'];
      const path = icon['path'];
      const viewBox = icon['viewBox'];

      if (url) {
        // let handle the background-color (icon color) by CSS
        this.svg_.style.setProperty('background-color', '');
        this.svg_.style.setProperty('mask-image', `url("${url}")`);
      } else if (path) {
        this._applyInlinedSVG(path, viewBox);
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
   */
  _applyInlinedSVG(path, viewBox) {
    // do not need a background color if mask-image isn't using
    this.svg_.style.setProperty('background-color', 'transparent');
    this.svg_.setAttribute('viewBox', viewBox || '0 -960 960 960');

    // remove all previous path elements
    this._emptyChildNodes();

    if (Array.isArray(path)) {
      for (let i = 0, l = path.length; i < l; i++) {
        this._addPath(path[i]);
      }
    } else if (path) {
      this._addPath(path);
    }
  }

  /**
   * Add a path element, call `emptyChildNodes()` first to clean previous
   * path elements.
   * @param {string} path
   * @private
   */
  _addPath(path) {
    const el = shaka.util.Dom.createSVGElement('path');
    el.setAttribute('d', path);
    this.svg_.appendChild(el);
  }

  /**
   * Remove all the child nodes from svg element
   * @private
   */
  _emptyChildNodes() {
    const childNodes = this.svg_.childNodes;
    for (let i = 0, l = childNodes.length, child; i < l; i++) {
      child = childNodes[i];
      if (child instanceof SVGPathElement) child.remove()
    }
  }
};
