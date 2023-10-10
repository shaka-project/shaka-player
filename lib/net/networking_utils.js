/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.net.NetworkingUtils');

goog.require('shaka.net.NetworkingEngine');


/**
 * @summary Networking utility functions.
 */
shaka.net.NetworkingUtils = class {
  /**
   * @param {string} uri
   * @param {!shaka.net.NetworkingEngine} netEngine
   * @param {shaka.extern.RetryParameters} retryParams
   * @return {!Promise.<string>}
   */
  static async getMimeType(uri, netEngine, retryParams) {
    const type = shaka.net.NetworkingEngine.RequestType.MANIFEST;

    const request = shaka.net.NetworkingEngine.makeRequest([uri], retryParams);
    request.method = 'HEAD';

    const response = await netEngine.request(type, request).promise;

    // https://bit.ly/2K9s9kf says this header should always be available,
    // but just to be safe:
    const mimeType = response.headers['content-type'];
    return mimeType ? mimeType.toLowerCase().split(';').shift() : '';
  }
};
