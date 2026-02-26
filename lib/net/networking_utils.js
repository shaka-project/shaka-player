/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.net.NetworkingUtils');

goog.require('goog.Uri');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');


/**
 * @summary Networking utility functions.
 */
shaka.net.NetworkingUtils = class {
  /**
   * @param {string} uri
   * @param {!shaka.net.NetworkingEngine} netEngine
   * @param {shaka.extern.RetryParameters} retryParams
   * @return {!Promise<string>}
   */
  static async getMimeType(uri, netEngine, retryParams) {
    let mimeType = shaka.net.NetworkingUtils.getMimeTypeFromUri(uri);
    if (mimeType) {
      return mimeType;
    }
    const type = shaka.net.NetworkingEngine.RequestType.MANIFEST;

    const request = shaka.net.NetworkingEngine.makeRequest([uri], retryParams);

    try {
      request.method = 'HEAD';
      const response = await netEngine.request(type, request).promise;
      mimeType = response.headers['content-type'];
    } catch (error) {
      if (error &&
        (error.code == shaka.util.Error.Code.HTTP_ERROR ||
          error.code == shaka.util.Error.Code.BAD_HTTP_STATUS)) {
        request.method = 'GET';
        const response = await netEngine.request(type, request).promise;
        mimeType = response.headers['content-type'];
      }
    }

    // https://bit.ly/2K9s9kf says this header should always be available,
    // but just to be safe:
    return mimeType ? mimeType.toLowerCase().split(';').shift() : '';
  }

  /**
   * @param {string} uri
   * @return {string}
   */
  static getMimeTypeFromUri(uri) {
    const extension = shaka.net.NetworkingUtils.getExtension(uri);
    const mimeType =
        shaka.net.NetworkingUtils.EXTENSIONS_TO_MIME_TYPES_.get(extension);
    return mimeType ?? '';
  }

  /**
   * @param {string} uri
   * @return {string}
   */
  static getExtension(uri) {
    const uriObj = new goog.Uri(uri);
    const uriPieces = uriObj.getPath().split('/');
    const uriFilename = uriPieces.pop();
    const filenamePieces = uriFilename.split('.');

    // Only one piece means there is no extension.
    if (filenamePieces.length == 1) {
      return '';
    }

    return filenamePieces.pop().toLowerCase();
  }

  /**
   * Create a request message for a segment. Providing |start| and |end|
   * will set the byte range. A non-zero start must be provided for |end| to
   * be used.
   *
   * @param {!Array<string>} uris
   * @param {?number} start
   * @param {?number} end
   * @param {shaka.extern.RetryParameters} retryParameters
   * @param {?function(BufferSource):!Promise=} streamDataCallback
   * @return {shaka.extern.Request}
   */
  static createSegmentRequest(uris, start, end, retryParameters,
      streamDataCallback) {
    const request = shaka.net.NetworkingEngine.makeRequest(
        uris, retryParameters, streamDataCallback);

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

/**
 * @const {!Map<string, string>}
 * @private
 */
shaka.net.NetworkingUtils.EXTENSIONS_TO_MIME_TYPES_ = new Map()
    .set('mp4', 'video/mp4')
    .set('m4v', 'video/mp4')
    .set('m4a', 'audio/mp4')
    .set('webm', 'video/webm')
    .set('weba', 'audio/webm')
    .set('mkv', 'video/webm') // Chromium browsers supports it.
    .set('ts', 'video/mp2t')
    .set('ogv', 'video/ogg')
    .set('ogg', 'audio/ogg')
    .set('mpg', 'video/mpeg')
    .set('mpeg', 'video/mpeg')
    .set('mov', 'video/quicktime')
    .set('m3u8', 'application/x-mpegurl')
    .set('mpd', 'application/dash+xml')
    .set('mp3', 'audio/mpeg')
    .set('aac', 'audio/aac')
    .set('flac', 'audio/flac')
    .set('wav', 'audio/wav')
    .set('srt', 'text/srt')
    .set('vtt', 'text/vtt')
    .set('webvtt', 'text/vtt')
    .set('ttml', 'application/ttml+xml')
    .set('jpeg', 'image/jpeg')
    .set('jpg', 'image/jpeg')
    .set('png', 'image/png')
    .set('svg', 'image/svg+xml')
    .set('webp', 'image/webp')
    .set('avif', 'image/avif')
    .set('html', 'text/html')
    .set('htm', 'text/html');
