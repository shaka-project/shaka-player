/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */
goog.provide('shaka.polyfill.Symbol');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @summary A polyfill to provide Symbol.prototype.description in all browsers.
 * See: https://caniuse.com/mdn-javascript_builtins_symbol_description
 * @export
 */
shaka.polyfill.Symbol = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    shaka.log.debug('Symbol.install');

    // eslint-disable-next-line no-restricted-syntax
    const proto = Symbol.prototype;

    if (!('description' in proto)) {
      Object.defineProperty(proto, 'description', {
        get: shaka.polyfill.Symbol.getSymbolDescription_,
      });
    }
  }

  /**
   * @this {Symbol}
   * @return {(string|undefined)}
   * @private
   */
  static getSymbolDescription_() {
    const m = /\((.*)\)/.exec(this.toString());
    return m ? m[1] : undefined;
  }
};


shaka.polyfill.register(shaka.polyfill.Symbol.install);
