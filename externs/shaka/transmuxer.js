/*! @license
 * Shaka Player
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Transmuxer.
 *
 * @externs
 */


/**
 * An interface for transmuxer plugins.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.Transmuxer = class {
  /**
   * Destroy
   */
  destroy() {}

  /**
   * Check if the mime type and the content type is supported.
   * @param {string} mimeType
   * @param {string=} contentType
   * @return {boolean}
   */
  isSupported(mimeType, contentType) {}

  /**
   * For any stream, convert its codecs to MP4 codecs.
   * @param {string} contentType
   * @param {string} mimeType
   * @return {string}
   */
  convertCodecs(contentType, mimeType) {}

  /**
   * Returns the original mimetype of the transmuxer.
   * @return {string}
   */
  getOriginalMimeType() {}

  /**
   * Transmux a input data to MP4.
   * @param {BufferSource} data
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference The segment reference, or
   *   null for init segments
   * @param {number} duration
   * @param {string} contentType
   * @return {!Promise<(!Uint8Array|!shaka.extern.TransmuxerOutput)>} If you
   * only want to return the result, use Uint8Array, if you want to separate
   * the initialization segment and the data segment, you have to use
   * shaka.extern.TransmuxerOutput
   */
  transmux(data, stream, reference, duration, contentType) {}
};


/**
 * @typedef {{
 *   data: !Uint8Array,
 *   init: ?Uint8Array
 * }}
 *
 * @property {!Uint8Array} data
 *   Segment data.
 * @property {?Uint8Array} init
 *   Init segment data.
 * @exportDoc
 */
shaka.extern.TransmuxerOutput;


/**
 * @typedef {function():!shaka.extern.Transmuxer}
 * @exportDoc
 */
shaka.extern.TransmuxerPlugin;
