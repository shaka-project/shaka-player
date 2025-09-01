/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.Utils');

goog.require('goog.asserts');
goog.require('shaka.ui.Enums');
goog.require('shaka.ui.MaterialSVGIcon');


shaka.ui.Utils = class {
  /**
   * @param {!HTMLElement} element
   * @param {string} className
   * @return {!HTMLElement}
   */
  static getFirstDescendantWithClassName(element, className) {
    // TODO: This can be replaced by shaka.util.Dom.getElementByClassName

    const descendant = shaka.ui.Utils.getDescendantIfExists(element, className);
    goog.asserts.assert(descendant != null, 'Should not be null!');

    return descendant;
  }


  /**
   * @param {!HTMLElement} element
   * @param {string} className
   * @return {?HTMLElement}
   */
  static getDescendantIfExists(element, className) {
    const childrenWithClassName = element.getElementsByClassName(className);
    if (childrenWithClassName.length) {
      return /** @type {!HTMLElement} */ (childrenWithClassName[0]);
    }

    return null;
  }


  /**
   * Finds a descendant of |menu| that has a 'shaka-chosen-item' class
   * and focuses on its' parent.
   *
   * @param {HTMLElement} menu
   */
  static focusOnTheChosenItem(menu) {
    if (!menu) {
      return;
    }
    const chosenItem = shaka.ui.Utils.getDescendantIfExists(
        menu, 'shaka-chosen-item');
    if (chosenItem) {
      chosenItem.parentElement.focus();
    }
  }


  /**
   * @return {!SVGElement}
   */
  static checkmarkIcon() {
    const icon = new shaka.ui.MaterialSVGIcon(null,
        shaka.ui.Enums.MaterialDesignSVGIcons.CHECKMARK);
    const iconElement = icon.getSvgElement();
    iconElement.classList.add('shaka-chosen-item');
    // Screen reader should ignore icon text.
    iconElement.ariaHidden = 'true';
    return iconElement;
  }


  /**
   * Depending on the value of display, sets/removes the css class of element to
   * either display it or hide it.
   *
   * @param {Element} element
   * @param {boolean} display
   */
  static setDisplay(element, display) {
    if (!element) {
      return;
    }

    if (display) {
      // Removing a non-existent class doesn't throw, so, even if
      // the element is not hidden, this should be fine.
      element.classList.remove('shaka-hidden');
    } else {
      element.classList.add('shaka-hidden');
    }
  }


  /**
   * Builds a time string, e.g., 01:04:23, from |displayTime|.
   *
   * @param {number} displayTime (in seconds)
   * @param {boolean} showHour
   * @return {string}
   */
  static buildTimeString(displayTime, showHour) {
    const d = Math.floor(displayTime / 86400);
    const h = Math.floor((displayTime % 86400) / 3600);
    const m = Math.floor((displayTime / 60) % 60);
    let s = Math.floor(displayTime % 60);
    if (s < 10) {
      s = '0' + s;
    }
    let text = m + ':' + s;
    if (showHour) {
      if (m < 10) {
        text = '0' + text;
      }
      text = h + ':' + text;
      if (d > 0) {
        if (h < 10) {
          text = '0' + text;
        }
        text = d + ':' + text;
      }
    }
    return text;
  }
};
