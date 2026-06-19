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
    return new URL(relative, base).toString();
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
      for (const relative of relativeUris) {
        const url = new URL(relative, base);

        if (extraQueryParams) {
          // extraQueryParams expected format: "a=1&b=2"
          const params = new URLSearchParams(extraQueryParams);
          for (const [key, value] of params.entries()) {
            url.searchParams.append(key, value);
          }
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
    if (!paramFn) {
      return uri;
    }
    const params = paramFn();
    if (!params) {
      return uri;
    }
    const urlObj = new URL(uri);
    new URLSearchParams(params).forEach((value, key) => {
      urlObj.searchParams.set(key, value);
    });
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

    for (const [key, value] of params.entries()) {
      url.searchParams.set(key, value);
    }

    return url.toString();
  }
};
