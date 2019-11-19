/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Networking');


/**
 * A collection of shared utilities that bridge the gap between our networking
 * code and the other parts of our code base. This is to allow
 * |shaka.net.NetworkingEngine| to remain general.
 *
 * @final
 */
shaka.util.Networking = class {
  /**
   * Create a request message for a segment. Providing |start| and |end|
   * will set the byte range. A non-zero start must be provided for |end| to
   * be used.
   *
   * @param {!Array.<string>} uris
   * @param {?number} start
   * @param {?number} end
   * @param {shaka.extern.RetryParameters} retryParameters
   * @return {shaka.extern.Request}
   */
  static createSegmentRequest(uris, start, end, retryParameters) {
    const request = shaka.net.NetworkingEngine.makeRequest(
        uris, retryParameters);

    if (start == 0 && end == null) {
      // This is a request for the entire segment.  The Range header is not
      // required.  Note that some web servers don't accept Range headers, so
      // don't set one if it's not strictly required.
    } else {
      if (end) {
        request.headers['Range'] = 'bytes=' + start + '-' + end;
      } else {
        request.headers['Range'] = 'bytes=' + start + '-';
      }
    }

    return request;
  }
};
