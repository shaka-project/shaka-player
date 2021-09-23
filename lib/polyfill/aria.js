/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.Aria');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @summary A polyfill to add support for the ARIAMixin interface mixin, for
 * browsers that do not implement it (e.g. Firefox).
 * Note that IE also does not support ARIAMixin, but this polyfill does not work
 * for that platform, as it relies on getters and setters.
 * @see https://w3c.github.io/aria/#ARIAMixin
 * @see https://developer.mozilla.org/en-US/docs/Web/API/Element
 * @export
 */
shaka.polyfill.Aria = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    // eslint-disable-next-line no-restricted-syntax
    if (Object.getOwnPropertyDescriptor(Element.prototype, 'ariaHidden')) {
      shaka.log.info('Using native ARIAMixin interface.');
      return;
    }
    shaka.log.info('ARIAMixin interface not detected. Installing polyfill.');

    // Define a list of all of the ARIAMixin properties that we have externs
    // for.
    const attributes = [
      'ariaHidden',
      'ariaLabel',
      'ariaPressed',
      'ariaSelected',
    ];

    // Add each attribute, one by one.
    for (const attribute of attributes) {
      shaka.polyfill.Aria.addARIAMixinAttribute_(attribute);
    }
  }

  /**
   * Adds an attribute with the given name.
   * @param {string} name The name of the attribute, in camelCase.
   * @private
   */
  static addARIAMixinAttribute_(name) {
    const baseName = name.toLowerCase().replace(/^aria/, '');
    // NOTE: All the attributes listed in the method above begin with "aria".
    // However, to add extra protection against the possibility of XSS attacks
    // through this method, this enforces "aria-" at the beginning of the
    // snake-case name, even if somehow "aria" were missing from the input.
    const snakeCaseName = `aria-${baseName}`;

    /* eslint-disable no-restricted-syntax */
    Object.defineProperty(Element.prototype, name, {
      get() {
        const element = /** @type {!Element} */ (this);
        return element.getAttribute(snakeCaseName);
      },
      set(value) {
        const element = /** @type {!Element} */ (this);
        if (value == null || value == undefined) {
          element.removeAttribute(snakeCaseName);
        } else {
          element.setAttribute(snakeCaseName, value);
        }
      },
    });
    /* eslint-enable no-restricted-syntax */
  }
};


shaka.polyfill.register(shaka.polyfill.Aria.install);
