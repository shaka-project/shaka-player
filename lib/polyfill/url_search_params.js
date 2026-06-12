/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.UrlSearchParams');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @export
 */
shaka.polyfill.UrlSearchParams = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    let installed = false;

    if (!window.URLSearchParams) {
      window.URLSearchParams = /** @type {?} */ (
        shaka.polyfill.UrlSearchParams.URLSearchParams_);
      installed = true;
    }

    // eslint-disable-next-line no-restricted-syntax
    if (window.URL && window.URL.prototype &&
        // eslint-disable-next-line no-restricted-syntax
        !('searchParams' in window.URL.prototype)) {
      // eslint-disable-next-line no-restricted-syntax
      const proto = window.URL.prototype;

      Object.defineProperty(proto, 'searchParams', {
        get: shaka.polyfill.UrlSearchParams.getSearchParams_,
        enumerable: true,
        configurable: true,
      });
      installed = true;
    }

    if (installed) {
      shaka.log.debug('UrlSearchParams.install');
    }
  }

  /**
   * @this {URL}
   * @return {!URLSearchParams}
   * @private
   */
  static getSearchParams_() {
    /** @type {!URL} */
    const url = this;

    /** @type {?URLSearchParams} */
    let urlSearchParams =
        shaka.polyfill.UrlSearchParams.searchParamsMap_.get(url);

    if (!urlSearchParams) {
      urlSearchParams = new window.URLSearchParams(url.search);
      const updateUrl = () => {
        const query = urlSearchParams.toString();
        url.search = query ? '?' + query : '';
      };

      const originalAppend = urlSearchParams.append;

      /**
       * @param {string} name
       * @param {string} value
       * @this {URLSearchParams}
       */
      // eslint-disable-next-line no-restricted-syntax
      urlSearchParams.append = function(name, value) {
        // eslint-disable-next-line no-restricted-syntax
        originalAppend.call(this, name, value);
        updateUrl();
      };

      const originalDelete = urlSearchParams.delete;

      /**
       * @param {string} name
       * @this {URLSearchParams}
       */
      // eslint-disable-next-line no-restricted-syntax
      urlSearchParams.delete = function(name) {
        // eslint-disable-next-line no-restricted-syntax
        originalDelete.call(this, name);
        updateUrl();
      };

      const originalSet = urlSearchParams.set;

      /**
       * @param {string} name
       * @param {string} value
       * @this {URLSearchParams}
       */
      // eslint-disable-next-line no-restricted-syntax
      urlSearchParams.set = function(name, value) {
        // eslint-disable-next-line no-restricted-syntax
        originalSet.call(this, name, value);
        updateUrl();
      };

      shaka.polyfill.UrlSearchParams.searchParamsMap_.set(url, urlSearchParams);
    }

    return urlSearchParams;
  }
};


/**
 * @private {!WeakMap<!URL, !URLSearchParams>}
 */
shaka.polyfill.UrlSearchParams.searchParamsMap_ = new WeakMap();


/**
 * @private
 */
shaka.polyfill.UrlSearchParams.URLSearchParams_ = class {
  /**
   * @param {(string | !Array<!Array<string>> | !Object<string, string>)=} init
   */
  constructor(init) {
    /** @private {!Array<!Array<string>>} */
    this.params_ = [];

    if (typeof init === 'string') {
      if (init.startsWith('?')) {
        init = init.substring(1);
      }
      if (init) {
        const pairs = init.split('&');
        for (const pair of pairs) {
          const parts = pair.split('=');
          const name = decodeURIComponent(parts[0].replace(/\+/g, ' '));
          const value = parts.length > 1 ?
              decodeURIComponent(parts[1].replace(/\+/g, ' ')) : '';
          this.append(name, value);
        }
      }
    } else if (Array.isArray(init)) {
      for (const pair of init) {
        this.append(pair[0], pair[1]);
      }
    } else if (init) {
      for (const key in init) {
        this.append(key, init[key]);
      }
    }
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  append(name, value) {
    this.params_.push([String(name), String(value)]);
  }

  /**
   * @param {string} name
   */
  delete(name) {
    const nameStr = String(name);
    this.params_ = this.params_.filter((pair) => pair[0] !== nameStr);
  }

  /**
   * @param {string} name
   * @return {?string}
   */
  get(name) {
    const nameStr = String(name);
    for (const pair of this.params_) {
      if (pair[0] === nameStr) {
        return pair[1];
      }
    }
    return null;
  }

  /**
   * @param {string} name
   * @return {!Array<string>}
   */
  getAll(name) {
    const nameStr = String(name);
    return this.params_
        .filter((pair) => pair[0] === nameStr)
        .map((pair) => pair[1]);
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  has(name) {
    const nameStr = String(name);
    return this.params_.some((pair) => pair[0] === nameStr);
  }

  /**
   * @param {string} name
   * @param {string} value
   */
  set(name, value) {
    const nameStr = String(name);
    const valueStr = String(value);
    let found = false;
    for (let i = 0; i < this.params_.length; i++) {
      if (this.params_[i][0] === nameStr) {
        if (!found) {
          this.params_[i][1] = valueStr;
          found = true;
        } else {
          this.params_.splice(i, 1);
          i--;
        }
      }
    }
    if (!found) {
      this.append(nameStr, valueStr);
    }
  }

  /**
   * @override
   */
  toString() {
    return this.params_.map((pair) => {
      return encodeURIComponent(pair[0]).replace(/%20/g, '+') + '=' +
             encodeURIComponent(pair[1]).replace(/%20/g, '+');
    }).join('&');
  }

  /**
   * @return {!Iterator<!Array<string>>}
   */
  entries() {
    let index = 0;
    const pairs = this.params_.map((pair) => [pair[0], pair[1]]);
    const iterator = {
      next: () => {
        if (index < pairs.length) {
          return {value: pairs[index++], done: false};
        }
        return {value: undefined, done: true};
      },
    };
    iterator[Symbol.iterator] = () => iterator;
    return /** @type {!Iterator<!Array<string>>} */ (iterator);
  }

  /**
   * @return {!Iterator<string>}
   */
  keys() {
    let index = 0;
    const pairs = this.params_;
    const iterator = {
      next: () => {
        if (index < pairs.length) {
          return {value: pairs[index++][0], done: false};
        }
        return {value: undefined, done: true};
      },
    };
    iterator[Symbol.iterator] = () => iterator;
    return /** @type {!Iterator<string>} */ (iterator);
  }

  /**
   * @return {!Iterator<string>}
   */
  values() {
    let index = 0;
    const pairs = this.params_;
    const iterator = {
      next: () => {
        if (index < pairs.length) {
          return {value: pairs[index++][1], done: false};
        }
        return {value: undefined, done: true};
      },
    };
    iterator[Symbol.iterator] = () => iterator;
    return /** @type {!Iterator<string>} */ (iterator);
  }

  /**
   * @param {function(string, string,
   *         !shaka.polyfill.UrlSearchParams.URLSearchParams_)} callback
   */
  forEach(callback) {
    for (const pair of this.params_) {
      callback(pair[1], pair[0], this);
    }
  }

  /**
   * @return {!Iterator<!Array<string>>}
   */
  [Symbol.iterator]() {
    return this.entries();
  }
};


shaka.polyfill.register(shaka.polyfill.UrlSearchParams.install);
