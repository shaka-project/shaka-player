/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.URLSearchParams');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @summary A polyfill to provide URLSearchParams and URL.prototype.searchParams
 * in browsers that do not support them natively.
 * URLSearchParams allows reading and writing query strings in a structured way.
 * URL.prototype.searchParams exposes a live URLSearchParams instance bound
 * to the URL's query string.
 * @see https://url.spec.whatwg.org/#urlsearchparams
 * @see https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams
 * @export
 */
shaka.polyfill.URLSearchParams = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    shaka.log.debug('URLSearchParams.install');

    shaka.polyfill.URLSearchParams.installURLSearchParams_();
    shaka.polyfill.URLSearchParams.installURLSearchParamsOnURL_();
  }

  /**
   * Installs a URLSearchParams implementation on window if the native one is
   * absent or incomplete.
   * @private
   */
  static installURLSearchParams_() {
    if (shaka.polyfill.URLSearchParams.isNativeURLSearchParamsComplete_()) {
      shaka.log.debug('URLSearchParams: Native URLSearchParams support found.');
      return;
    }

    if (window.URLSearchParams) {
      shaka.log.info(
          'URLSearchParams: Native URLSearchParams is incomplete. ' +
          'Installing polyfill.');
    } else {
      shaka.log.info(
          'URLSearchParams: No native support found. Installing polyfill.');
    }

    const impl = shaka.polyfill.URLSearchParams.URLSearchParamsImpl_;
    window.URLSearchParams = /** @type {?} */ (impl);
  }

  /**
   * Returns true if the native URLSearchParams implementation is complete and
   * bug-free.
   *
   * - Constructing from a plain object (broken in old Safari).
   * - Decoding %2B as '+' and not as a space (Safari 10.1 bug).
   * - Encoding ' &' correctly (Edge bug).
   * - Presence of `size` getter (absent in many older browsers).
   * - All required methods present on the prototype.
   * - Wrapped in try/catch because some environments (e.g. React Native)
   *   expose URLSearchParams but throw on instantiation.
   *
   * @return {boolean}
   * @private
   */
  static isNativeURLSearchParamsComplete_() {
    try {
      const USP = window.URLSearchParams;
      if (!USP) {
        return false;
      }

      // eslint-disable-next-line no-restricted-syntax
      const proto = USP.prototype;

      // All methods and the iterator required by the WHATWG URL standard.
      const requiredMethods = [
        'append', 'delete', 'get', 'getAll', 'has', 'set', 'sort',
        'forEach', 'keys', 'values', 'entries',
      ];
      if (!requiredMethods.every((m) => typeof proto[m] === 'function')) {
        return false;
      }
      if (typeof proto[Symbol.iterator] !== 'function') {
        return false;
      }
      if (!('size' in proto)) {
        return false;
      }

      // Construction from a plain object must work (broken in old Safari).
      if (new USP({a: '1'}).toString() !== 'a=1') {
        return false;
      }

      // %2B must decode to '+', not ' ' (Safari 10.1 bug).
      if (new USP('s=%2B').get('s') !== '+') {
        return false;
      }

      // ' &' must encode to '+%26' (Edge encoding bug).
      const ampersandTest = new USP();
      ampersandTest.append('s', ' &');
      if (ampersandTest.toString() !== 's=+%26') {
        return false;
      }

      return true;
    } catch (e) {
      // URLSearchParams exists but throws on construction .
      return false;
    }
  }

  /**
   * Returns true if URL.prototype.searchParams is present and functional.
   * Some browsers expose the getter but return undefined or throw.
   * @return {boolean}
   * @private
   */
  static isNativeSearchParamsOnURLComplete_() {
    try {
      // eslint-disable-next-line no-restricted-syntax
      if (!('searchParams' in URL.prototype)) {
        return false;
      }
      // Verify the getter actually returns a working URLSearchParams instance.
      const sp = new URL('http://a.com/?x=1').searchParams;
      return sp != null && typeof sp.get === 'function' && sp.get('x') === '1';
    } catch (e) {
      return false;
    }
  }

  /**
   * Installs URL.prototype.searchParams if it is missing or broken.
   * Requires URLSearchParams to be available (native or polyfilled) first.
   * @private
   */
  static installURLSearchParamsOnURL_() {
    if (!window.URL) {
      shaka.log.debug(
          'URLSearchParams: window.URL not available; ' +
          'skipping searchParams polyfill.');
      return;
    }

    if (shaka.polyfill.URLSearchParams.isNativeSearchParamsOnURLComplete_()) {
      shaka.log.debug(
          'URLSearchParams: Native URL.prototype.searchParams found.');
      return;
    }

    shaka.log.info(
        'URLSearchParams: URL.prototype.searchParams missing or broken. ' +
        'Installing polyfill.');

    // WeakMap to cache one URLSearchParams instance per URL object so that
    // repeated access returns the same live instance.
    const cache = new WeakMap();

    // eslint-disable-next-line no-restricted-syntax
    Object.defineProperty(URL.prototype, 'searchParams', {
      // eslint-disable-next-line no-restricted-syntax
      get() {
        const url = /** @type {!URL} */ (this);

        if (cache.has(url)) {
          return /** @type {!URLSearchParams} */ (cache.get(url));
        }

        // Bootstrap from the current search string.
        const params = new window.URLSearchParams(
            url.search ? url.search.slice(1) : '');

        // Wrap every mutating method so that url.search (and therefore
        // url.href / url.toString()) stays in sync after each change.
        const mutating = ['append', 'delete', 'set', 'sort'];
        for (const method of mutating) {
          const original =
          // eslint-disable-next-line no-restricted-syntax
          /** @type {!Function} */ (params[method].bind(params));

          params[method] = /** @type {?} */ ((...args) => {
            original(...args);
            url.search = params.toString();
          });
        }

        cache.set(url, params);
        return params;
      },
      // Spec says searchParams is read-only; no setter is defined.
      enumerable: true,
      configurable: true,
    });
  }
};


/**
 * A minimal but spec-compliant URLSearchParams implementation.
 *
 * Supports:
 *   - Construction from a query string, an object, or an iterable of pairs.
 *   - append / delete / get / getAll / has / set
 *   - forEach / keys / values / entries / Symbol.iterator
 *   - toString
 *
 * @implements {Iterable<!Array<string>>}
 * @private
 */
shaka.polyfill.URLSearchParams.URLSearchParamsImpl_ = class {
  /**
   * @param {string|!Object<string,string>|
   *         !Iterable<!Array<string>>|undefined} init
   */
  constructor(init) {
    /**
     * Internal storage as an ordered list of [name, value] pairs, matching the
     * spec's "list of name-value pairs".
     * @private {!Array<!Array<string>>}
     */
    this.params_ = [];

    if (init == null || init == undefined) {
      return;
    }

    if (typeof init === 'string') {
      // Remove a leading '?' if present, as callers often pass location.search.
      const str = init.startsWith('?') ? init.slice(1) : init;
      this.parseQueryString_(str);
    } else if (typeof init === 'object') {
      if (typeof init[Symbol.iterator] === 'function') {
        // Iterable of [name, value] pairs (e.g. another URLSearchParams, or a
        // plain array of two-element arrays).
        for (const pair of /** @type {!Iterable<!Array<string>>} */ (init)) {
          if (!pair || pair.length !== 2) {
            throw new TypeError(
                'URLSearchParams: each iterable item must be a pair.');
          }
          this.params_.push([String(pair[0]), String(pair[1])]);
        }
      } else {
        // Plain object — iterate own enumerable keys.
        for (const key of Object.keys(init)) {
          this.params_.push([key, String(
              /** @type {!Object<string,string>} */ (init)[key])]);
        }
      }
    }
  }

  /**
   * Parses an application/x-www-form-urlencoded query string into the internal
   * list, following the WHATWG URL standard parsing steps.
   * @param {string} queryString A query string without a leading '?'.
   * @private
   */
  parseQueryString_(queryString) {
    if (!queryString) {
      return;
    }
    // Split on '&' and ';' as per the spec's "urlencoded string parser".
    const sequences = queryString.split('&');
    for (const sequence of sequences) {
      if (sequence === '') {
        continue;
      }
      const eqIdx = sequence.indexOf('=');
      let name;
      let value;
      if (eqIdx < 0) {
        name = sequence;
        value = '';
      } else {
        name = sequence.slice(0, eqIdx);
        value = sequence.slice(eqIdx + 1);
      }
      // Replace '+' with a space before percent-decoding (HTML form encoding).
      name = name.replace(/\+/g, ' ');
      value = value.replace(/\+/g, ' ');
      this.params_.push([
        shaka.polyfill.URLSearchParams.URLSearchParamsImpl_.decode_(name),
        shaka.polyfill.URLSearchParams.URLSearchParamsImpl_.decode_(value),
      ]);
    }
  }

  /**
   * Percent-decodes a string, returning the original string on error.
   * @param {string} str
   * @return {string}
   * @private
   */
  static decode_(str) {
    try {
      return decodeURIComponent(str);
    } catch (e) {
      return str;
    }
  }

  /**
   * Appends a new name/value pair to the list.
   * @param {string} name
   * @param {string} value
   */
  append(name, value) {
    this.params_.push([name, value]);
  }

  /**
   * Deletes all pairs whose name matches.
   * @param {string} name
   */
  delete(name) {
    this.params_ = this.params_.filter((pair) => pair[0] !== name);
  }

  /**
   * Returns the first value associated with the given name, or null.
   * @param {string} name
   * @return {?string}
   */
  get(name) {
    const found = this.params_.find((pair) => pair[0] === name);
    return found ? found[1] : null;
  }

  /**
   * Returns all values associated with the given name.
   * @param {string} name
   * @return {!Array<string>}
   */
  getAll(name) {
    return this.params_
        .filter((pair) => pair[0] === name)
        .map((pair) => pair[1]);
  }

  /**
   * Returns true if the given name is present in the list.
   * @param {string} name
   * @return {boolean}
   */
  has(name) {
    return this.params_.some((pair) => pair[0] === name);
  }

  /**
   * Sets the value for name, replacing existing entries with the same name.
   * If no entry exists a new one is appended.
   * @param {string} name
   * @param {string} value
   */
  set(name, value) {
    let replaced = false;
    // Replace the first occurrence and delete all others.
    this.params_ = this.params_.reduce((acc, pair) => {
      if (pair[0] === name) {
        if (!replaced) {
          acc.push([name, value]);
          replaced = true;
        }
        // Skip subsequent duplicates.
      } else {
        acc.push(pair);
      }
      return acc;
    }, /** @type {!Array<!Array<string>>} */ ([]));

    if (!replaced) {
      this.params_.push([name, value]);
    }
  }

  /**
   * Sorts all pairs in-place by name, in ascending Unicode code-point order.
   */
  sort() {
    this.params_.sort((a, b) => {
      if (a[0] < b[0]) {
        return -1;
      }
      if (a[0] > b[0]) {
        return 1;
      }
      return 0;
    });
  }

  /**
   * Calls the callback for each pair.
   * @param {function(string, string, !URLSearchParams)} callback
   * @param {*=} thisArg
   */
  forEach(callback, thisArg) {
    for (const pair of this.params_) {
      // eslint-disable-next-line no-restricted-syntax
      callback.call(thisArg, pair[1], pair[0],
          /** @type {!URLSearchParams} */ (/** @type {?} */ (this)));
    }
  }

  /**
   * Returns an iterator over all names.
   * @return {!Iterator<string>}
   */
  keys() {
    return this.params_.map((pair) => pair[0]).values();
  }

  /**
   * Returns an iterator over all values.
   * @return {!Iterator<string>}
   */
  values() {
    return this.params_.map((pair) => pair[1]).values();
  }

  /**
   * Returns an iterator over all [name, value] pairs.
   * @return {!Iterator<!Array<string>>}
   */
  entries() {
    return this.params_.slice().values();
  }

  /**
   * Default iterator — same as entries().
   * @override
   */
  [Symbol.iterator]() {
    return this.entries();
  }

  /**
   * Serializes the list to an application/x-www-form-urlencoded string.
   * @return {string}
   * @override
   */
  toString() {
    return this.params_
        .map((pair) => {
          return encodeURIComponent(pair[0]) + '=' +
              encodeURIComponent(pair[1]);
        })
        .join('&');
  }


  /**
   * Returns the number of name/value pairs in the list.
   * @return {number}
   */
  get size() {
    return this.params_.length;
  }
};


shaka.polyfill.register(shaka.polyfill.URLSearchParams.install);
