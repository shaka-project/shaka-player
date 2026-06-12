/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.polyfill.URLAndSearchParams');

goog.require('shaka.log');
goog.require('shaka.polyfill');

/**
 * @summary A polyfill to provide the URL and URLSearchParams APIs in browsers
 * that do not implement them fully.
 *
 * URLSearchParams is polyfilled when absent or incomplete (missing methods,
 * iterator support, the size getter, or known encoding bugs in old Safari /
 * Edge).
 *
 * The URL constructor is polyfilled when it is absent or broken (e.g.
 * Chromium 47 on Tizen 3 rejects non-http(s) schemes such as skd://,
 * offline:, etc.). The polyfill is backed by an HTMLAnchorElement so
 * resolution follows the browser's own rules and always provides a live
 * searchParams instance.
 *
 * @see https://url.spec.whatwg.org/
 * @see https://url.spec.whatwg.org/#urlsearchparams
 * @export
 */
shaka.polyfill.URLAndSearchParams = class {
  /**
   * Install the polyfill if needed.
   * @export
   */
  static install() {
    shaka.log.debug('URLAndSearchParams.install');

    // Order matters: URLSearchParams must exist before URL is polyfilled
    // because URLImpl_ constructs URLSearchParams instances internally.
    shaka.polyfill.URLAndSearchParams.installURLSearchParams_();
    shaka.polyfill.URLAndSearchParams.installURL_();
  }

  /**
   * Installs a URLSearchParams implementation on window if the native one is
   * absent or incomplete.
   * @private
   */
  static installURLSearchParams_() {
    if (shaka.polyfill.URLAndSearchParams.isNativeURLSearchParamsComplete_()) {
      shaka.log.debug(
          'URLAndSearchParams: Native URLSearchParams support found.');
      return;
    }

    if (window.URLSearchParams) {
      shaka.log.info(
          'URLAndSearchParams: Native URLSearchParams is incomplete. ' +
          'Installing polyfill.');
    } else {
      shaka.log.info(
          'URLAndSearchParams: No native URLSearchParams found. ' +
          'Installing polyfill.');
    }

    window.URLSearchParams = /** @type {?} */ (
      shaka.polyfill.URLAndSearchParams.URLSearchParamsImpl_);
  }

  /**
   * Returns true if the native URLSearchParams implementation is complete and
   * bug-free. Checks cover known browser issues:
   *
   * - All required methods and iterator present on the prototype.
   * - `size` getter present (absent in many older browsers).
   * - Construction from a plain object works (broken in old Safari).
   * - %2B decodes to '+', not ' ' (Safari 10.1 bug).
   * - ' &' encodes to '+%26' (Edge encoding bug).
   * - Wrapped in try/catch for environments that expose URLSearchParams but
   *   throw on instantiation (e.g. some React Native versions).
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
      return false;
    }
  }

  /**
   * Returns true if the native URL constructor is complete and accepts
   * non-http(s) schemes without throwing.
   * @return {boolean}
   * @private
   */
  static isNativeURLComplete_() {
    try {
      const u = new URL('b', 'https://a');
      if (!u.href.startsWith('https://a')) {
        return false;
      }
      if (!u.searchParams ||
          typeof u.searchParams.toString !== 'function') {
        return false;
      }

      u.searchParams.append('x', '1');
      if (!u.href.includes('x=1')) {
        return false;
      }

      const withQuery = new URL('b', 'https://foo?a=1');
      if (!withQuery.href.startsWith('https://foo')) {
        return false;
      }
      if (!withQuery.searchParams ||
          typeof withQuery.searchParams.toString !== 'function') {
        return false;
      }

      const abs = new URL('https://example.com/path?q=1');
      if (!abs.searchParams ||
          typeof abs.searchParams.set !== 'function' ||
          typeof abs.searchParams.toString !== 'function') {
        return false;
      }
      // Verify that set() is actually reflected in the serialised URL.
      abs.searchParams.set('t', '2');
      if (!abs.href.includes('t=2')) {
        return false;
      }

      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Installs a URL polyfill backed by HTMLAnchorElement when the native URL
   * constructor is absent or broken (e.g. Chromium 47 on Tizen 3).
   * @private
   */
  static installURL_() {
    const URLAndSearchParams = shaka.polyfill.URLAndSearchParams;
    if (URLAndSearchParams.isNativeURLComplete_()) {
      shaka.log.debug('URLAndSearchParams: Native URL support found.');

      // If URLSearchParams was polyfilled, the native URL's searchParams
      // property needs to be overridden to use the polyfilled implementation.
      if (!URLAndSearchParams.isNativeURLSearchParamsComplete_()) {
        const USP = URLAndSearchParams.URLSearchParamsImpl_;
        // eslint-disable-next-line no-restricted-syntax
        Object.defineProperty(window.URL.prototype, 'searchParams', {
          // eslint-disable-next-line no-restricted-syntax
          get() {
            // Explicitly cast "this" to bypass Closure Compiler strictness
            const urlThis = /** @type {!URL} */ (/** @type {?} */ (this));

            if (!urlThis['shakaSearchParams_'] ||
                urlThis['shakaSearchString_'] !== urlThis.search) {
              const search = urlThis.search;
              const params = new USP(search ? search.substring(1) : '');
              urlThis['shakaSearchString_'] = search;

              // eslint-disable-next-line no-restricted-syntax
              const origAppend = params.append.bind(params);
              params.append = (name, value) => {
                origAppend(name, value);
                urlThis.search = params.toString();
                urlThis['shakaSearchString_'] = urlThis.search;
              };

              // eslint-disable-next-line no-restricted-syntax
              const origDelete = params.delete.bind(params);
              params.delete = (name) => {
                origDelete(name);
                urlThis.search = params.toString();
                urlThis['shakaSearchString_'] = urlThis.search;
              };

              // eslint-disable-next-line no-restricted-syntax
              const origSet = params.set.bind(params);
              params.set = (name, value) => {
                origSet(name, value);
                urlThis.search = params.toString();
                urlThis['shakaSearchString_'] = urlThis.search;
              };

              // eslint-disable-next-line no-restricted-syntax
              const origSort = params.sort.bind(params);
              params.sort = () => {
                origSort();
                urlThis.search = params.toString();
                urlThis['shakaSearchString_'] = urlThis.search;
              };

              urlThis['shakaSearchParams_'] = params;
            }
            return urlThis['shakaSearchParams_'];
          },
          configurable: true,
          enumerable: true,
        });
      }
      return;
    }

    shaka.log.info('URLAndSearchParams: Installing URL polyfill.');

    window.URL = /** @type {?} */ (URLAndSearchParams.URLImpl_);
  }
};


/**
 * A spec-compliant URLSearchParams implementation for browsers that lack one.
 *
 * Supports construction from a query string, a plain object, or an iterable
 * of [name, value] pairs, plus the full WHATWG method set.
 *
 * @implements {Iterable<!Array<string>>}
 * @see https://url.spec.whatwg.org/#urlsearchparams
 * @private
 */
shaka.polyfill.URLAndSearchParams.URLSearchParamsImpl_ = class {
  /**
   * @param {string|!Object<string,string>|
   *     !Iterable<!Array<string>>|undefined=} init
   */
  constructor(init) {
    /**
     * Ordered list of [name, value] pairs — the spec's "list of name-value
     * pairs".
     * @private {!Array<!Array<string>>}
     */
    this.params_ = [];

    if (init == null) {
      return;
    }

    if (typeof init === 'string') {
      const str = init.startsWith('?') ? init.slice(1) : init;
      this.parseQueryString_(str);
    } else if (typeof init === 'object') {
      if (typeof init[Symbol.iterator] === 'function') {
        for (const pair of /** @type {!Iterable<!Array<string>>} */ (init)) {
          if (!pair || pair.length !== 2) {
            throw new TypeError(
                'URLSearchParams: each iterable item must be a pair.');
          }
          this.params_.push([String(pair[0]), String(pair[1])]);
        }
      } else {
        for (const key of Object.keys(init)) {
          this.params_.push([key, String(
              /** @type {!Object<string,string>} */ (init)[key])]);
        }
      }
    }
  }

  /**
   * Parses an application/x-www-form-urlencoded query string.
   * @param {string} queryString  Without a leading '?'.
   * @private
   */
  parseQueryString_(queryString) {
    if (!queryString) {
      return;
    }
    for (const sequence of queryString.split('&')) {
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
      // Replace '+' with space before percent-decoding (HTML form encoding).
      name = name.replace(/\+/g, ' ');
      value = value.replace(/\+/g, ' ');

      const Impl = shaka.polyfill.URLAndSearchParams.URLSearchParamsImpl_;
      this.params_.push([Impl.decode_(name), Impl.decode_(value)]);
    }
  }

  /**
   * Percent-decodes a string, returning the original on error.
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
   * Serializes a value for use in a query string, encoding spaces as '+'.
   * @param {string} str
   * @return {string}
   * @private
   */
  static encode_(str) {
    return encodeURIComponent(str).replace(/%20/g, '+');
  }

  /** @param {string} name @param {string} value */
  append(name, value) {
    this.params_.push([name, value]);
  }

  /** @param {string} name */
  delete(name) {
    this.params_ = this.params_.filter((pair) => pair[0] !== name);
  }

  /**
   * @param {string} name
   * @return {?string}
   */
  get(name) {
    const found = this.params_.find((pair) => pair[0] === name);
    return found ? found[1] : null;
  }

  /**
   * @param {string} name
   * @return {!Array<string>}
   */
  getAll(name) {
    return this.params_
        .filter((pair) => pair[0] === name)
        .map((pair) => pair[1]);
  }

  /**
   * @param {string} name
   * @return {boolean}
   */
  has(name) {
    return this.params_.some((pair) => pair[0] === name);
  }

  /** @param {string} name @param {string} value */
  set(name, value) {
    let replaced = false;
    this.params_ = this.params_.reduce((acc, pair) => {
      if (pair[0] === name) {
        if (!replaced) {
          acc.push([name, value]);
          replaced = true;
        }
      } else {
        acc.push(pair);
      }
      return acc;
    }, /** @type {!Array<!Array<string>>} */ ([]));

    if (!replaced) {
      this.params_.push([name, value]);
    }
  }

  /** Sorts pairs in-place by name (ascending Unicode code-point order). */
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

  /** @return {!Iterator<string>} */
  keys() {
    return this.params_.map((pair) => pair[0]).values();
  }

  /** @return {!Iterator<string>} */
  values() {
    return this.params_.map((pair) => pair[1]).values();
  }

  /** @return {!Iterator<!Array<string>>} */
  entries() {
    return this.params_.slice().values();
  }

  /**
   * @override
   */
  [Symbol.iterator]() {
    return this.entries();
  }

  /**
   * @return {string}
   * @override
   */
  toString() {
    const Impl = shaka.polyfill.URLAndSearchParams.URLSearchParamsImpl_;
    return this.params_
        .map((pair) => Impl.encode_(pair[0]) + '=' + Impl.encode_(pair[1]))
        .join('&');
  }

  /** @return {number} */
  get size() {
    return this.params_.length;
  }
};


/**
 * A URL polyfill backed by an HTMLAnchorElement, for browsers whose native URL
 * constructor rejects non-http(s) schemes (e.g. Chromium 47 on Tizen 3).
 *
 * The anchor element handles all parsing and resolution; this class simply
 * exposes its properties through the standard URL interface and adds a live
 * searchParams instance.
 *
 * @see https://url.spec.whatwg.org/#url
 * @private
 */
shaka.polyfill.URLAndSearchParams.URLImpl_ = class {
  /**
   * @param {string} url
   * @param {string=} base
   */
  constructor(url, base) {
    url = String(url);

    // Build a document with a <base> element so the anchor resolves correctly.
    let doc = document;
    /** @type {?HTMLBaseElement} */
    let baseElement = null;

    if (base != null) {
      const baseStr = String(base);
      doc = document.implementation.createHTMLDocument('');
      baseElement = /** @type {!HTMLBaseElement} */ (
        doc.createElement('base'));
      baseElement.href = baseStr;
      doc.head.appendChild(baseElement);
    }

    const anchor = /** @type {!HTMLAnchorElement} */ (
      doc.createElement('a'));
    anchor.href = url;

    if (baseElement) {
      doc.body.appendChild(anchor);
      // Force the browser to re-resolve href against the base.
      // eslint-disable-next-line no-self-assign
      anchor.href = anchor.href;
    }

    // Validate: if no scheme was resolved, the URL is invalid.
    if (!anchor.protocol || anchor.protocol === ':') {
      throw new TypeError('Invalid URL: ' + url);
    }

    /**
     * @private {!HTMLAnchorElement}
     */
    this.anchor_ = anchor;

    // Build the live searchParams instance and wire up bidirectional sync.
    const search = anchor.search;

    // Use the polyfill implementation directly rather than going through
    // window.URLSearchParams.  This is important on devices (e.g. Tizen 3 /
    // where the native URLSearchParams exists but is incomplete, and where
    // installURLSearchParams_() may not have replaced window.URLSearchParams
    // yet at the time the first URLImpl_ instance is created (construction
    // order during early boot).  Using the concrete class avoids the "Cannot
    // read property 'toString' of undefined" failure that arises when a
    // native-but-broken URLSearchParams returns an instance whose toString is
    // missing.
    const USP = shaka.polyfill.URLAndSearchParams.URLSearchParamsImpl_;
    const params = new USP(search ? search.substring(1) : '');

    // Wrap each mutating method so that any change is immediately flushed back
    // to anchor_.search.  We use explicit named wrappers instead of a dynamic
    // bracket-access loop because Closure Compiler treats class instances as
    // structs and forbids computed-property access on them.
    const self = this;

    // eslint-disable-next-line no-restricted-syntax
    const origAppend = params.append.bind(params);
    params.append = (name, value) => {
      origAppend(name, value);
      self.search = params.toString();
    };

    // eslint-disable-next-line no-restricted-syntax
    const origDelete = params.delete.bind(params);
    params.delete = (name) => {
      origDelete(name);
      self.search = params.toString();
    };

    // eslint-disable-next-line no-restricted-syntax
    const origSet = params.set.bind(params);
    params.set = (name, value) => {
      origSet(name, value);
      self.search = params.toString();
    };

    // eslint-disable-next-line no-restricted-syntax
    const origSort = params.sort.bind(params);
    params.sort = () => {
      origSort();
      self.search = params.toString();
    };

    /**
     * Live URLSearchParams instance bound to this URL's query string.
     * @const {!URLSearchParams}
     */
    this.searchParams =
      /** @type {!URLSearchParams} */ (/** @type {?} */ (params));
  }

  /** @return {string} */
  get href() {
    // Strip a trailing '?' left by some browsers when the query is empty.
    return this.anchor_.href.replace(/\?$/, '');
  }

  /** @param {string} value */
  set href(value) {
    this.anchor_.href = value;
    this.search = this.anchor_.search;
  }

  /** @return {string} */
  get origin() {
    return this.protocol + '//' + this.host;
  }

  /** @return {string} */
  get protocol() {
    return this.anchor_.protocol;
  }

  /** @param {string} v */
  set protocol(v) {
    this.anchor_.protocol = v;
  }

  /**
   * @return {string}
   */
  get username() {
    return /** @type {string} */ (this.anchor_['username']) || '';
  }

  /** @param {string} v */
  set username(v) {
    this.anchor_['username'] = v;
  }

  /** @return {string} */
  get password() {
    return /** @type {string} */ (this.anchor_['password']) || '';
  }

  /** @param {string} v */
  set password(v) {
    this.anchor_['password'] = v;
  }

  /** @return {string} */
  get host() {
    return this.anchor_.host;
  }

  /** @param {string} v */
  set host(v) {
    this.anchor_.host = v;
  }

  /** @return {string} */
  get hostname() {
    return this.anchor_.hostname;
  }

  /** @param {string} v */
  set hostname(v) {
    this.anchor_.hostname = v;
  }

  /** @return {string} */
  get port() {
    return this.anchor_.port;
  }

  /** @param {string} v */
  set port(v) {
    this.anchor_.port = v;
  }

  /** @return {string} */
  get pathname() {
    // Normalize: some browsers omit the leading '/'.
    const p = this.anchor_.pathname;
    return p.startsWith('/') ? p : '/' + p;
  }

  /** @param {string} v */
  set pathname(v) {
    this.anchor_.pathname = v;
  }

  /** @return {string} */
  get search() {
    return this.anchor_.search;
  }

  /** @param {string} v */
  set search(v) {
    this.anchor_.search = v;
  }

  /** @return {string} */
  get hash() {
    return this.anchor_.hash;
  }

  /** @param {string} v */
  set hash(v) {
    this.anchor_.hash = v;
  }

  /**
   * @return {string}
   * @override
   */
  toString() {
    return this.href;
  }

  /**
   * @override
   */
  toJSON() {
    return this.href;
  }
};
