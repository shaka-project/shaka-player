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
   * @param {string} url
   * @param {string=} mimeType
   * @return {!HTMLSourceElement}
   */
  static createSourceElement(url, mimeType = '') {
    const source =
      /** @type {HTMLSourceElement} */ (document.createElement('source'));
    source.src = url;
    source.type = mimeType;
    return source;
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
   * Cast a Node/Element to an HTMLCanvasElement
   *
   * @param {!Node|!Element} original
   * @return {!HTMLCanvasElement}
   */
  static asHTMLCanvasElement(original) {
    return /** @type {!HTMLCanvasElement}*/ (original);
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

  /**
   * Load a new font on the page. If the font was already loaded, it does
   * nothing.
   *
   * @param {string} name
   * @param {string} url
   * @return {!Promise<void>}
   */
  static async addFont(name, url) {
    if (!('fonts' in document && 'FontFace' in window)) {
      return;
    }
    await document.fonts.ready;
    if (!('entries' in document.fonts)) {
      return;
    }
    const fontFaceSetIteratorToArray = (target) => {
      const iterable = target.entries();
      const results = [];
      let iterator = iterable.next();
      while (iterator.done === false) {
        results.push(iterator.value);
        iterator = iterable.next();
      }
      return results;
    };
    for (const fontFace of fontFaceSetIteratorToArray(document.fonts)) {
      if (fontFace.family === name && fontFace.display === 'swap') {
        // Font already loaded.
        return;
      }
    }
    const fontFace = new FontFace(name, `url(${url})`, {display: 'swap'});
    document.fonts.add(fontFace);
  }
};

