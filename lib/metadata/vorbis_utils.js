/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.metadata.VorbisUtils');

goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');

// cspell:ignore ALBUMARTIST TRACKNUMBER DISCNUMBER

/**
 * Utilities for parsing Vorbis Comments metadata.
 */
shaka.metadata.VorbisUtils = class {
  /**
   * @param {!Uint8Array} data
   * @return {!Array<!shaka.extern.MetadataFrame>}
   */
  static getVorbisComments(data) {
    const frames = [];

    if (shaka.metadata.VorbisUtils.isFlac_(data)) {
      frames.push(...shaka.metadata.VorbisUtils.parseFlac_(data));
    } else if (shaka.metadata.VorbisUtils.isOgg_(data)) {
      frames.push(...shaka.metadata.VorbisUtils.parseOgg_(data));
    }

    return frames;
  }


  /**
   * @param {Uint8Array} data
   * @return {boolean}
   * @private
   */
  static isFlac_(data) {
    return data.length >= 4 &&
        data[0] == 0x66 && // f
        data[1] == 0x4C && // L
        data[2] == 0x61 && // a
        data[3] == 0x43;   // C
  }


  /**
   * @param {Uint8Array} data
   * @return {boolean}
   * @private
   */
  static isOgg_(data) {
    return data.length >= 4 &&
        data[0] == 0x4F && // O
        data[1] == 0x67 && // g
        data[2] == 0x67 && // g
        data[3] == 0x53;   // S
  }


  /**
   * Parse FLAC metadata blocks.
   *
   * @param {Uint8Array} data
   * @return {!Array<!shaka.extern.MetadataFrame>}
   * @private
   */
  static parseFlac_(data) {
    const frames = [];

    let offset = 4;

    while (offset + 4 <= data.length) {
      const header = data[offset];

      const isLast = !!(header & 0x80);
      const blockType = header & 0x7F;

      const length =
          (data[offset + 1] << 16) |
          (data[offset + 2] << 8) |
          data[offset + 3];

      offset += 4;

      if (offset + length > data.length) {
        break;
      }

      const block = data.subarray(offset, offset + length);

      // VORBIS_COMMENT block
      if (blockType == 4) {
        frames.push(
            ...shaka.metadata.VorbisUtils.parseVorbisCommentBlock_(block));
      }

      // PICTURE block
      if (blockType == 6) {
        const frame = shaka.metadata.VorbisUtils.parseFlacPicture_(block);
        if (frame) {
          frames.push(frame);
        }
      }

      offset += length;

      if (isLast) {
        break;
      }
    }

    return frames;
  }


  /**
   * Parse OGG Vorbis/Opus comments.
   *
   * @param {!Uint8Array} data
   * @return {!Array<!shaka.extern.MetadataFrame>}
   * @private
   */
  static parseOgg_(data) {
    const frames = [];

    const text = shaka.util.StringUtils.fromUTF8(data);

    let index = text.indexOf('OpusTags');
    if (index < 0) {
      index = text.indexOf('vorbis');
    }

    if (index < 0) {
      return frames;
    }

    const slice = data.subarray(index + 8);

    frames.push(
        ...shaka.metadata.VorbisUtils.parseVorbisCommentBlock_(slice));

    return frames;
  }


  /**
   * Parse Vorbis comment structure.
   *
   * @param {!Uint8Array} data
   * @return {!Array<!shaka.extern.MetadataFrame>}
   * @private
   */
  static parseVorbisCommentBlock_(data) {
    const frames = [];

    const view = shaka.util.BufferUtils.toDataView(data);

    let offset = 0;

    const littleEndian = true;

    if (offset + 4 > view.byteLength) {
      return frames;
    }

    // vendor_length
    const vendorLength = view.getUint32(offset, littleEndian);
    offset += 4;

    offset += vendorLength;

    if (offset + 4 > view.byteLength) {
      return frames;
    }

    // user_comment_list_length
    const commentCount = view.getUint32(offset, littleEndian);
    offset += 4;

    for (let i = 0; i < commentCount; i++) {
      if (offset + 4 > view.byteLength) {
        break;
      }

      const len = view.getUint32(offset, littleEndian);
      offset += 4;

      if (offset + len > view.byteLength) {
        break;
      }

      const str = shaka.util.StringUtils.fromUTF8(
          data.subarray(offset, offset + len));

      offset += len;

      const eq = str.indexOf('=');

      if (eq < 0) {
        continue;
      }

      const vorbisKey = str.substring(0, eq).toUpperCase();
      const value = str.substring(eq + 1);

      const key =
          shaka.metadata.VorbisUtils.VORBIS_TO_ID3_MAP_[vorbisKey] || vorbisKey;
      frames.push({
        key,
        data: value,
        description: '',
        mimeType: null,
        pictureType: null,
      });
    }

    return frames;
  }


  /**
   * Parse a FLAC PICTURE metadata block (type 6) and return it as an
   * APIC-equivalent MetadataFrame so that callers can treat album art from
   * FLAC files the same way they treat ID3v2 APIC frames.
   *
   * FLAC PICTURE block layout (all fields big-endian):
   *   [0-3]                   picture type     (uint32 BE)
   *   [4-7]                   MIME length      (uint32 BE)
   *   [8 … 8+mimeLen-1]       MIME type string (UTF-8)
   *   [8+mimeLen … +3]        description length (uint32 BE)
   *   […+descLen-1]           description string (UTF-8)
   *   [… + 4]                 width            (uint32 BE) – ignored
   *   [… + 4]                 height           (uint32 BE) – ignored
   *   [… + 4]                 color depth      (uint32 BE) – ignored
   *   [… + 4]                 color count      (uint32 BE) – ignored
   *   [… + 4]                 data length      (uint32 BE)
   *   [… + dataLen]           raw image bytes
   *
   * @param {!Uint8Array} block  Raw bytes of the PICTURE metadata block body
   *     (i.e. the 4-byte block header has already been stripped).
   * @return {?shaka.extern.MetadataFrame}
   * @private
   */
  static parseFlacPicture_(block) {
    const StringUtils = shaka.util.StringUtils;
    const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

    const view = shaka.util.BufferUtils.toDataView(block);

    // All integers in a FLAC PICTURE block are big-endian.
    const bigEndian = false;

    let offset = 0;

    if (offset + 4 > view.byteLength) {
      return null;
    }
    const pictureType = view.getUint32(offset, bigEndian);
    offset += 4;

    if (offset + 4 > view.byteLength) {
      return null;
    }
    const mimeLength = view.getUint32(offset, bigEndian);
    offset += 4;

    if (offset + mimeLength > view.byteLength) {
      return null;
    }
    const mimeType = StringUtils.fromUTF8(
        block.subarray(offset, offset + mimeLength));
    offset += mimeLength;

    if (offset + 4 > view.byteLength) {
      return null;
    }
    const descLength = view.getUint32(offset, bigEndian);
    offset += 4;

    if (offset + descLength > view.byteLength) {
      return null;
    }
    const description = StringUtils.fromUTF8(
        block.subarray(offset, offset + descLength));
    offset += descLength;

    // Skip width (4), height (4), color depth (4), color count (4) = 16 bytes.
    offset += 16;

    if (offset + 4 > view.byteLength) {
      return null;
    }
    const dataLength = view.getUint32(offset, bigEndian);
    offset += 4;

    if (offset + dataLength > view.byteLength) {
      return null;
    }

    // Slice out the raw image bytes into an owned ArrayBuffer so the caller
    // never holds a reference into the original large buffer.
    const imageBytes =
        Uint8ArrayUtils.concat(block.subarray(offset, offset + dataLength));

    return {
      key: 'APIC',
      data: shaka.util.BufferUtils.toArrayBuffer(imageBytes),
      description,
      mimeType,
      pictureType,
    };
  }
};

/**
 * @const {!Object<string, string>}
 * @private
 */
shaka.metadata.VorbisUtils.VORBIS_TO_ID3_MAP_ = {
  'TITLE': 'TIT2',
  'ARTIST': 'TPE1',
  'ALBUM': 'TALB',
  'ALBUMARTIST': 'TPE2',
  'TRACKNUMBER': 'TRCK',
  'DISCNUMBER': 'TPOS',
  'DATE': 'TDRC',
  'GENRE': 'TCON',
  'COMMENT': 'COMM',
  'DESCRIPTION': 'TIT3',
  'COPYRIGHT': 'TCOP',
  'COMPOSER': 'TCOM',
  'LYRICS': 'USLT',
  'ISRC': 'TSRC',
};
