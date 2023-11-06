/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.net.NetworkingUtils');

goog.require('goog.Uri');
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
    const extension = shaka.net.NetworkingUtils.getExtension_(uri);
    let mimeType =
        shaka.net.NetworkingUtils.EXTENSIONS_TO_MIME_TYPES_[extension];
    if (mimeType) {
      return mimeType;
    }
    const type = shaka.net.NetworkingEngine.RequestType.MANIFEST;

    const request = shaka.net.NetworkingEngine.makeRequest([uri], retryParams);
    request.method = 'HEAD';

    const response = await netEngine.request(type, request).promise;

    // https://bit.ly/2K9s9kf says this header should always be available,
    // but just to be safe:
    mimeType = response.headers['content-type'];
    return mimeType ? mimeType.toLowerCase().split(';').shift() : '';
  }


  /**
   * @param {string} uri
   * @return {string}
   * @private
   */
  static getExtension_(uri) {
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
};

/**
 * @const {!Object.<string, string>}
 * @private
 */
shaka.net.NetworkingUtils.EXTENSIONS_TO_MIME_TYPES_ = {
  'mp4': 'video/mp4',
  'm4v': 'video/mp4',
  'm4a': 'audio/mp4',
  'webm': 'video/webm',
  'weba': 'audio/webm',
  'mkv': 'video/webm', // Chromium browsers supports it.
  'ts': 'video/mp2t',
  'ogv': 'video/ogg',
  'ogg': 'audio/ogg',
  'mpg': 'video/mpeg',
  'mpeg': 'video/mpeg',
  'm3u8': 'application/x-mpegurl',
  'mpd': 'application/dash+xml',
  'ism': 'application/vnd.ms-sstr+xml',
  'mp3': 'audio/mpeg',
  'aac': 'audio/aac',
  'flac': 'audio/flac',
  'wav': 'audio/wav',
  'sbv': 'text/x-subviewer',
  'srt': 'text/srt',
  'vtt': 'text/vtt',
  'webvtt': 'text/vtt',
  'ttml': 'application/ttml+xml',
  'lrc': 'application/x-subtitle-lrc',
  'ssa': 'text/x-ssa',
  'ass': 'text/x-ssa',
};
