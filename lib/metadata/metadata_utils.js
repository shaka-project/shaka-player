/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.metadata.Metadata');

goog.require('shaka.metadata.Id3Utils');
goog.require('shaka.metadata.Id3V1Utils');
goog.require('shaka.metadata.IlstUtils');
goog.require('shaka.metadata.VorbisUtils');


/**
 * @export
 */
shaka.metadata.Metadata = class {
  /**
   * Returns all metadata frames found in the media data for the given MIME
   * type.
   *
   * Depending on the container format, this method delegates parsing to:
   * - ID3 (MP3 / AAC)
   * - Vorbis comments (FLAC / OGG / OPUS)
   * - MP4 ILST atoms (iTunes-style metadata)
   *
   * The result is a unified list of MetadataFrame objects.
   *
   * When multiple frames share the same key, the first occurrence is kept
   * and later duplicates are ignored.
   *
   * @param {!Uint8Array} data
   * @param {string} mimeType
   * @return {!Array<!shaka.extern.MetadataFrame>}
   * @export
   */
  static getMetadataFrames(data, mimeType) {
    const Metadata = shaka.metadata.Metadata;

    const frames = [];

    if (Metadata.MIME_TYPES_WITH_ID3_.includes(mimeType)) {
      frames.push(...shaka.metadata.Id3Utils.getID3Frames(data));
      frames.push(...shaka.metadata.Id3V1Utils.getID3v1Frames(data));
    } else if (Metadata.MIME_TYPES_WITH_VORBIS_COMMENTS_.includes(mimeType)) {
      frames.push(...shaka.metadata.VorbisUtils.getVorbisComments(data));
    } else if (Metadata.MIME_TYPES_WITH_ILST_.includes(mimeType)) {
      frames.push(...shaka.metadata.IlstUtils.parse(data));
    }

    const seen = new Map();
    const result = [];
    for (const f of frames) {
      if (!seen.has(f.key)) {
        seen.set(f.key, true);
        result.push(f);
      }
    }

    return result;
  }

  /**
   * @param {string} mimeType
   * @return {boolean}
   * @export
   */
  static supports(mimeType) {
    return shaka.metadata.Metadata.SUPPORTED_MIME_TYPES_.includes(mimeType);
  }
};

/**
 * MIME types that support ID3 metadata.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.metadata.Metadata.MIME_TYPES_WITH_ID3_ = [
  'audio/mpeg',
  'audio/aac',
];

/**
 * MIME types that support Vorbis comments.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.metadata.Metadata.MIME_TYPES_WITH_VORBIS_COMMENTS_ = [
  'audio/flac',
  'audio/ogg',
  'audio/vorbis',
  'audio/opus',
];

/**
 * MIME types that use MP4 ilst metadata.
 *
 * @const {!Array<string>}
 * @private
 */
shaka.metadata.Metadata.MIME_TYPES_WITH_ILST_ = [
  'audio/mp4',
];

/**
 * @const {!Array<string>}
 * @private
 */
shaka.metadata.Metadata.SUPPORTED_MIME_TYPES_ = [
  ...shaka.metadata.Metadata.MIME_TYPES_WITH_ID3_,
  ...shaka.metadata.Metadata.MIME_TYPES_WITH_VORBIS_COMMENTS_,
  ...shaka.metadata.Metadata.MIME_TYPES_WITH_ILST_,
];
