/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.URL');


shaka.util.URL = class {
  /**
   * Resolves a relative URL against a base URL.
   *
   * @param {string} base
   * @param {string} relative
   * @return {string}
   */
  static resolve(base, relative) {
    if (shaka.util.URL.isAbsolute_(base)) {
      return new URL(relative, base).toString();
    }
    return shaka.util.URL.resolveRelativeBase_(base, relative);
  }

  /**
   * Resolves an array of relative URIs to the given base URIs.
   * This will result in M*N number of URIs.
   *
   * Note: This method is slow in SmartTVs and Consoles.
   *
   * @param {!Array<string>} baseUris
   * @param {!Array<string>} relativeUris
   * @param {string=} extraQueryParams
   * @return {!Array<string>}
   */
  static resolveUris(baseUris, relativeUris, extraQueryParams = '') {
    if (relativeUris.length == 0) {
      return baseUris;
    }

    const resolvedUris = [];

    for (const base of baseUris) {
      // Whether the native constructor will take this base is a property of
      // the base alone, so it is checked once per base here rather than once
      // per resolved URI in the inner loop.
      const baseIsAbsolute = shaka.util.URL.isAbsolute_(base);

      for (const relative of relativeUris) {
        if (!baseIsAbsolute) {
          let uri = shaka.util.URL.resolveRelativeBase_(base, relative);
          if (extraQueryParams) {
            uri = shaka.util.URL.appendRawQuery_(uri, extraQueryParams);
          }
          resolvedUris.push(uri);
          continue;
        }

        const url = new URL(relative, base);

        if (extraQueryParams) {
          // extraQueryParams expected format: "a=1&b=2"
          // Append as raw text rather than through url.searchParams.
          // Mutating url.searchParams would re-encode the query parameters
          // already present in the URL, corrupting signed URLs whose tokens
          // must survive byte-for-byte.  See setRawParams_ for details.
          const extra = extraQueryParams.replace(/^[?&]/, '');
          const search = url.search.replace(/^\?/, '');
          url.search = search ? (search + '&' + extra) : extra;
        }

        resolvedUris.push(url.toString());
      }
    }

    return resolvedUris;
  }

  /**
   * Returns the scheme (protocol without trailing colon) of a URI string.
   * Works with both standard URLs and custom/unknown schemes (e.g. offline:)
   * that the native URL constructor would reject.
   *
   * @param {string} uri
   * @return {string} The scheme in lower-case, or '' if none found.
   */
  static getScheme(uri) {
    try {
      // URL constructor normalises the protocol to lower-case and always
      // appends a colon, so we just strip it.
      const scheme = new URL(uri).protocol.slice(0, -1);
      // Guard against environments where new URL('') returns about:blank
      // instead of throwing (e.g. old WebKit / Tizen 3).
      if (scheme && uri.toLowerCase().startsWith(scheme + ':')) {
        return scheme;
      }
    } catch (e) {
      // Ignore errors
    }
    // Fallback for custom/unknown schemes (offline:, skd:, …)
    const match = uri.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
    return match ? match[1].toLowerCase() : '';
  }

  /**
   * Returns a copy of |uri| with its scheme replaced by |scheme|.
   * Works with both standard URLs and custom/unknown schemes.
   *
   * @param {string} uri
   * @param {string} scheme  The new scheme, without a trailing colon.
   * @return {string}
   */
  static setScheme(uri, scheme) {
    try {
      const url = new URL(uri);
      url.protocol = scheme;
      // Some browsers (e.g. Firefox) silently ignore protocol changes on
      // non-standard schemes. Verify the assignment actually took effect.
      if (url.protocol === scheme + ':') {
        return url.toString();
      }
    } catch (e) {
      // Ignore errors
    }
    // Fallback: simple string replacement for custom/unknown schemes.
    const colonIdx = uri.indexOf(':');
    if (colonIdx === -1) {
      return scheme + ':' + uri;
    }
    return scheme + uri.slice(colonIdx);
  }

  /**
   * Returns the domain (host) of a URL string.
   *
   * @param {string} uri
   * @return {string}
   */
  static getDomain(uri) {
    try {
      const domain = new URL(uri).hostname;
      if (domain) {
        return domain;
      }
    } catch (e) {
      // Ignore errors
    }
    // Fallback for environments that reject unknown schemes (e.g. Chromium
    // 47). The host segment may contain colons (e.g. skd://uuid:token) so
    // we match everything up to the first '/' after '://'.
    const match = uri.match(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/([^/?#]*)/);
    return match ? match[1] : '';
  }

  /**
   * Sets the domain (host) of a URL string.
   *
   * @param {string} uri
   * @param {string} domain
   * @return {string}
   */
  static setDomain(uri, domain) {
    const url = new URL(uri);
    url.hostname = domain;
    return url.toString();
  }

  /**
   * Applies URL query params from a RequestParam function to a URI.
   * Returns the URI unchanged if paramFn is falsy or returns empty string.
   *
   * @param {string} uri
   * @param {(?function():string|undefined)} paramFn
   * @return {string}
   */
  static applyUrlParams(uri, paramFn) {
    const params = paramFn?.();
    if (!params) {
      return uri;
    }
    const urlObj = new URL(uri);
    const pairs = params.replace(/^[?&]/, '').split('&')
        .filter((pair) => pair);
    shaka.util.URL.setRawParams_(urlObj, pairs);
    return urlObj.toString();
  }

  /**
   * Appends query parameters to a URL.
   *
   * @param {string} uri
   * @param {!Map<string, string>} params
   * @return {string}
   */
  static appendParams(uri, params) {
    if (!params.size) {
      return uri;
    }
    const url = new URL(uri);
    const pairs = [];
    for (const [key, value] of params.entries()) {
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(value));
    }
    shaka.util.URL.setRawParams_(url, pairs);
    return url.toString();
  }

  /**
   * Resolves |relative| against a |base| that carries no scheme.
   *
   * The native URL constructor rejects such a base outright, throwing
   * "Invalid base URL".  goog.Uri, which this class replaced, resolved
   * purely at the string level and had no such restriction, so apps that
   * hand us a relative URI -- a thumbnail track added as "thumbs/main.vtt",
   * say -- used to work.  This follows the reference resolution of RFC 3986
   * section 5.2 at the string level, which keeps the result in the same
   * relative form the base arrived in and never invents a scheme or an
   * authority the caller did not supply.
   *
   * @param {string} base
   * @param {string} relative
   * @return {string}
   * @private
   */
  static resolveRelativeBase_(base, relative) {
    // A reference carrying its own scheme or authority does not depend on the
    // base at all.  Returning it untouched is what keeps a protocol-relative
    // reference protocol-relative instead of inheriting an invented scheme.
    if (shaka.util.URL.isAbsolute_(relative) || relative.startsWith('//')) {
      return relative;
    }

    const Url = shaka.util.URL;
    const b = Url.splitNoScheme_(base);
    const r = Url.splitNoScheme_(relative);

    // RFC 3986 5.2.2: an empty reference path keeps the base path, and takes
    // the base query too unless the reference brought one of its own.
    if (r.path == '') {
      const query = r.hasQuery ? r.query : b.query;
      return b.authority + b.path + query + r.fragment;
    }

    // An authority can be followed only by an absolute path, so leading ".."
    // segments are dropped there; without one the path is relative and they
    // are meaningful, so they survive.
    const keepLeadingParents = b.authority == '';
    const path = r.path.startsWith('/') ?
        Url.removeDotSegments_(r.path, keepLeadingParents) :
        Url.removeDotSegments_(
            Url.mergePaths_(b, r.path), keepLeadingParents);

    return b.authority + path + r.query + r.fragment;
  }

  /**
   * Splits a URI that has no scheme into its authority, path, query and
   * fragment.  Each part keeps its delimiter, so concatenating them in order
   * reproduces the input.
   *
   * @param {string} uri
   * @return {{authority: string, path: string, query: string,
   *           hasQuery: boolean, fragment: string}}
   * @private
   */
  static splitNoScheme_(uri) {
    let rest = uri;

    let fragment = '';
    const hash = rest.indexOf('#');
    if (hash >= 0) {
      fragment = rest.substring(hash);
      rest = rest.substring(0, hash);
    }

    let query = '';
    const question = rest.indexOf('?');
    if (question >= 0) {
      query = rest.substring(question);
      rest = rest.substring(0, question);
    }

    let authority = '';
    if (rest.startsWith('//')) {
      const slash = rest.indexOf('/', 2);
      if (slash >= 0) {
        authority = rest.substring(0, slash);
        rest = rest.substring(slash);
      } else {
        authority = rest;
        rest = '';
      }
    }

    return {
      authority,
      path: rest,
      query,
      hasQuery: question >= 0,
      fragment,
    };
  }

  /**
   * Merges a relative reference path onto a base path, per RFC 3986
   * section 5.3: everything after the base's last slash is replaced.
   *
   * @param {{authority: string, path: string, query: string,
   *          hasQuery: boolean, fragment: string}} base
   * @param {string} path
   * @return {string}
   * @private
   */
  static mergePaths_(base, path) {
    if (base.authority != '' && base.path == '') {
      return '/' + path;
    }
    return base.path.substring(0, base.path.lastIndexOf('/') + 1) + path;
  }

  /**
   * Applies the remove_dot_segments algorithm of RFC 3986 section 5.2.4.
   *
   * @param {string} path
   * @param {boolean} keepLeadingParents Whether a ".." that cannot be
   *   resolved stays in the output.  True for a relative path, where ".."
   *   still means something; false where the path is rooted and there is
   *   nothing above it.
   * @return {string}
   * @private
   */
  static removeDotSegments_(path, keepLeadingParents) {
    const rooted = path.startsWith('/');
    const segments = (rooted ? path.substring(1) : path).split('/');
    const output = [];

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const isLast = i == segments.length - 1;

      if (segment == '.' || segment == '..') {
        if (segment == '..') {
          const top = output.length ? output[output.length - 1] : null;
          if (top != null && top != '..') {
            output.pop();
          } else if (keepLeadingParents && !rooted) {
            output.push('..');
          }
        }
        // "." and ".." name a directory, so the result ends in a slash.
        if (isLast) {
          output.push('');
        }
        continue;
      }

      output.push(segment);
    }

    const joined = output.join('/');
    return rooted ? '/' + joined : joined;
  }

  /**
   * Appends raw "key=value" pairs to the query of a URI that has no scheme.
   *
   * Works on the string so that the parameters already present survive
   * byte-for-byte, as they must for signed URLs; see setRawParams_.
   *
   * @param {string} uri
   * @param {string} extraQueryParams Expected format: "a=1&b=2".
   * @return {string}
   * @private
   */
  static appendRawQuery_(uri, extraQueryParams) {
    const extra = extraQueryParams.replace(/^[?&]/, '');
    if (!extra) {
      return uri;
    }
    const parts = shaka.util.URL.splitNoScheme_(uri);
    const search = parts.query.replace(/^\?/, '');
    return parts.authority + parts.path + '?' +
        (search ? (search + '&' + extra) : extra) + parts.fragment;
  }

  /**
   * Returns whether |uri| carries a scheme, and so can be used as a base for
   * the native URL constructor.
   *
   * @param {string} uri
   * @return {boolean}
   * @private
   */
  static isAbsolute_(uri) {
    return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri);
  }

  /**
   * Replaces or appends raw "key=value" pairs in the query string of |url|,
   * keeping the parameters that are already present byte-for-byte intact.
   *
   * Mutating |url.searchParams| instead would re-serialize the whole query
   * string with application/x-www-form-urlencoded rules, percent-encoding
   * characters that are legal in a query (e.g. "~", "=", "/") in parameters
   * we never touched.  CDNs that sign URLs compare their tokens
   * byte-for-byte, so a re-encoded token gets rejected.
   *
   * @param {!URL} url
   * @param {!Array<string>} pairs Raw "key=value" strings, already
   *   percent-encoded as they should appear in the URL.
   * @private
   */
  static setRawParams_(url, pairs) {
    const keyOf = (pair) => pair.split('=')[0];
    const newKeys = new Set(pairs.map(keyOf));
    const query = url.search.replace(/^\?/, '').split('&')
        .filter((pair) => pair && !newKeys.has(keyOf(pair)));
    url.search = query.concat(pairs).join('&');
  }
};
