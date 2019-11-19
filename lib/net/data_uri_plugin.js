/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.net.DataUriPlugin');

goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


/**
 * @summary A networking plugin to handle data URIs.
 * @see https://developer.mozilla.org/en-US/docs/Web/HTTP/data_URIs
 * @export
 */
shaka.net.DataUriPlugin = class {
  /**
   * @param {string} uri
   * @param {shaka.extern.Request} request
   * @param {shaka.net.NetworkingEngine.RequestType} requestType
   * @param {shaka.extern.ProgressUpdated} progressUpdated Called when a
   *   progress event happened.
   * @return {!shaka.extern.IAbortableOperation.<shaka.extern.Response>}
   * @export
   */
  static parse(uri, request, requestType, progressUpdated) {
    try {
      const parsed = shaka.net.DataUriPlugin.parseRaw(uri);

      /** @type {shaka.extern.Response} */
      const response = {
        uri: uri,
        originalUri: uri,
        data: parsed.data,
        headers: {
          'content-type': parsed.contentType,
        },
      };

      return shaka.util.AbortableOperation.completed(response);
    } catch (error) {
      return shaka.util.AbortableOperation.failed(error);
    }
  }

  /**
   * @param {string} uri
   * @return {{data: BufferSource, contentType: string}}
   */
  static parseRaw(uri) {
    // Extract the scheme.
    const parts = uri.split(':');
    if (parts.length < 2 || parts[0] != 'data') {
      shaka.log.error('Bad data URI, failed to parse scheme');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI,
          uri);
    }
    const path = parts.slice(1).join(':');

    // Extract the encoding and MIME type (required but can be empty).
    const infoAndData = path.split(',');
    if (infoAndData.length < 2) {
      shaka.log.error('Bad data URI, failed to extract encoding and MIME type');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.MALFORMED_DATA_URI,
          uri);
    }
    const info = infoAndData[0];
    const dataStr = window.decodeURIComponent(infoAndData.slice(1).join(','));

    // Extract the encoding (optional).
    const typeAndEncoding = info.split(';');
    let encoding = null;
    if (typeAndEncoding.length > 1) {
      encoding = typeAndEncoding[1];
    }

    // Convert the data.
    /** @type {BufferSource} */
    let data;
    if (encoding == 'base64') {
      data = shaka.util.Uint8ArrayUtils.fromBase64(dataStr);
    } else if (encoding) {
      shaka.log.error('Bad data URI, unknown encoding');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.UNKNOWN_DATA_URI_ENCODING,
          uri);
    } else {
      data = shaka.util.StringUtils.toUTF8(dataStr);
    }

    return {data: data, contentType: typeAndEncoding[0]};
  }
};


shaka.net.NetworkingEngine.registerScheme(
    'data', shaka.net.DataUriPlugin.parse);
