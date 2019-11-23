/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ui.Utils');

goog.require('goog.asserts');


shaka.ui.Utils = class {
  /**
   * @param {!HTMLElement} element
   * @param {string} className
   * @return {!HTMLElement}
   */
  // TODO: This can be replaced by shaka.util.Dom.getElementByClassName
  static getFirstDescendantWithClassName(element, className) {
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
   * @return {!Element}
   */
  static checkmarkIcon() {
    const icon = shaka.util.Dom.createHTMLElement('i');
    icon.classList.add('material-icons');
    icon.classList.add('shaka-chosen-item');
    icon.textContent = shaka.ui.Enums.MaterialDesignIcons.CHECKMARK;
    // Screen reader should ignore icon text.
    icon.setAttribute('aria-hidden', 'true');
    return icon;
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

    // You can't use setDisplay with SVG on IE, because classList isn't on SVG
    // elements on that browser.  It's better to find out on Chrome through an
    // assertion, rather than wait for a failed test pass later on IE.
    goog.asserts.assert(!(element instanceof SVGElement),
        'Do not use setDisplay with SVG elements!');

    if (display) {
      element.classList.add('shaka-displayed');
      // Removing a non-existent class doesn't throw, so, even if
      // the element is not hidden, this should be fine. Same for displayed
      // below.
      element.classList.remove('shaka-hidden');
    } else {
      element.classList.add('shaka-hidden');
      element.classList.remove('shaka-displayed');
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
    const h = Math.floor(displayTime / 3600);
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
    }
    return text;
  }
};
