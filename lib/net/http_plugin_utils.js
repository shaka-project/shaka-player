/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.net.HttpPluginUtils');

goog.require('shaka.log');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.requireType('shaka.net.NetworkingEngine');


/**
 * @summary A set of http networking utility functions.
 * @exportDoc
 */
shaka.net.HttpPluginUtils = class {
  /**
   * @param {!Object.<string,string>} headers
   * @param {BufferSource} data
   * @param {number} status
   * @param {string} uri
   * @param {string} responseURL
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @return {!shaka.extern.Response}
   */
  static makeResponse(headers, data, status, uri, responseURL, requestType) {
    if (status >= 200 && status <= 299 && status != 202) {
      // Most 2xx HTTP codes are success cases.
      /** @type {shaka.extern.Response} */
      const response = {
        uri: responseURL || uri,
        originalUri: uri,
        data: data,
        headers: headers,
        fromCache: !!headers['x-shaka-from-cache'],
      };
      return response;
    } else {
      let responseText = null;
      try {
        responseText = shaka.util.StringUtils.fromBytesAutoDetect(data);
      } catch (exception) {}
      shaka.log.debug('HTTP error text:', responseText);

      const severity = status == 401 || status == 403 ?
          shaka.util.Error.Severity.CRITICAL :
          shaka.util.Error.Severity.RECOVERABLE;

      throw new shaka.util.Error(
          severity,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS,
          uri,
          status,
          responseText,
          headers,
          requestType);
    }
  }
};
