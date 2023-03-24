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
  getOrginalMimeType() {}

  /**
   * Transmux a input data to MP4.
   * @param {BufferSource} data
   * @param {shaka.extern.Stream} stream
   * @param {?shaka.media.SegmentReference} reference The segment reference, or
   *   null for init segments
   * @return {!Promise.<!Uint8Array>}
   */
  transmux(data, stream, reference) {}
};


/**
 * @typedef {function():!shaka.extern.Transmuxer}
 * @exportDoc
 */
shaka.extern.TransmuxerPlugin;
