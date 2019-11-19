/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.util.Dom');

goog.require('goog.asserts');


/**
 * @export
 */
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
   * Creates an element, and cast the type from Element to HTMLElement.
   *
   * @return {!HTMLVideoElement}
   */
  static createVideoElement() {
    const video =
      /** @type {!HTMLVideoElement} */ (document.createElement('video'));

    video.muted = true;
    video.width = 600;
    video.height = 400;

    return video;
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

