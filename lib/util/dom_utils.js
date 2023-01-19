/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.util.Dom');

goog.require('goog.asserts');


// TODO: revisit this when Closure Compiler supports partially-exported classes.
/** @export */
shaka.util.Dom = class {
  /**
   * Creates an element, and cast the type from Element to HTMLElement.
   *
   * @param {string} tagName
   * @return {!HTMLElement}
   */
  static createHTMLElement(tagName) {
    const element =
      /** @type {!HTMLElement} */ (document.createElement(tagName));
    return element;
  }


  /**
   * Create a "button" element with the correct type.
   *
   * The compiler is very picky about the use of the "disabled" property on
   * HTMLElement, since it is only defined on certain subclasses of that.  This
   * method merely creates a button and casts it to the correct type.
   *
   * @return {!HTMLButtonElement}
   */
  static createButton() {
    const button = document.createElement('button');
    button.setAttribute('type', 'button');
    return /** @type {!HTMLButtonElement} */ (button);
  }


  /**
   * Cast a Node/Element to an HTMLElement
   *
   * @param {!Node|!Element} original
   * @return {!HTMLElement}
   */
  static asHTMLElement(original) {
    return /** @type {!HTMLElement}*/ (original);
  }


  /**
   * Cast a Node/Element to an HTMLMediaElement
   *
   * @param {!Node|!Element} original
   * @return {!HTMLMediaElement}
   */
  static asHTMLMediaElement(original) {
    return /** @type {!HTMLMediaElement}*/ (original);
  }


  /**
   * Returns the element with a given class name.
   * Assumes the class name to be unique for a given parent.
   *
   * @param {string} className
   * @param {!HTMLElement} parent
   * @return {!HTMLElement}
   */
  static getElementByClassName(className, parent) {
    const elements = parent.getElementsByClassName(className);
    goog.asserts.assert(elements.length == 1,
        'Should only be one element with class name ' + className);

    return shaka.util.Dom.asHTMLElement(elements[0]);
  }

  /**
   * Remove all of the child nodes of an element.
   * @param {!Element} element
   * @export
   */
  static removeAllChildren(element) {
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }
};

