/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.URL');

goog.require('goog.Uri');


shaka.util.URL = class {
  /**
   * Resolves a relative URL against a base URL.
   *
   * @param {string} base
   * @param {string} relative
   * @return {string}
   */
  static resolve(base, relative) {
    const baseUri = new goog.Uri(base);
    const relativeUri = new goog.Uri(relative);
    return baseUri.resolve(relativeUri).toString();
  }

  /**
   * Resolves an array of relative URIs to the given base URIs. This will result
   * in M*N number of URIs.
   *
   * Note: This method is slow in SmartTVs and Consoles. It should only be
   * called when necessary.
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

    if (baseUris.length == 1 && relativeUris.length == 1) {
      const baseUri = new goog.Uri(baseUris[0]);
      const relativeUri = new goog.Uri(relativeUris[0]);
      const resolvedUri = baseUri.resolve(relativeUri);
      if (extraQueryParams) {
        resolvedUri.setQueryData(extraQueryParams);
      }
      return [resolvedUri.toString()];
    }

    const relativeAsGoog = relativeUris.map((uri) => new goog.Uri(uri));

    // For each base URI, this code resolves it with every relative URI.
    // The result is a single array containing all the resolved URIs.
    const resolvedUris = [];
    for (const baseStr of baseUris) {
      const base = new goog.Uri(baseStr);
      for (const relative of relativeAsGoog) {
        const resolvedUri = base.resolve(relative);
        if (extraQueryParams) {
          resolvedUri.setQueryData(extraQueryParams);
        }
        resolvedUris.push(resolvedUri.toString());
      }
    }

    return resolvedUris;
  }

  /**
   * Returns the domain (host) of a URL string.
   *
   * @param {string} uriString
   * @return {string}
   */
  static getDomain(uriString) {
    const uri = new goog.Uri(uriString);
    return uri.getDomain();
  }

  /**
   * Sets the domain (host) of a URL string.
   *
   * @param {string} uriString
   * @param {string} domain
   * @return {string}
   */
  static setDomain(uriString, domain) {
    const uri = new goog.Uri(uriString);
    uri.setDomain(domain);
    return uri.toString();
  }

  /**
   * Appends query parameters to a URL.
   *
   * @param {string} uri
   * @param {!Map<string, string>} params
   * @return {string}
   */
  static appendParams(uri, params) {
    const uriObj = new goog.Uri(uri);
    const queryData = uriObj.getQueryData();

    for (const [key, value] of params.entries()) {
      queryData.set(key, value);
    }

    uriObj.setQueryData(queryData);
    return uriObj.toString();
  }
};
