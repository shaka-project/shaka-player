/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.metadata.VorbisUtils');

goog.require('shaka.metadata.Metadata');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.DataViewReader');
goog.require('shaka.util.StringUtils');

// cspell:ignore ALBUMARTIST TRACKNUMBER DISCNUMBER

/**
 * Metadata parser for Vorbis Comments (FLAC, OGG, Vorbis, Opus).
 * @implements {shaka.extern.MetadataParser}
 * @export
 */
shaka.metadata.VorbisUtils = class {
  /**
   * @override
   * @export
   */
  parse(data) {
    const isFlac = data.length >= 4 &&
        data[0] == 0x66 && // f
        data[1] == 0x4C && // L
        data[2] == 0x61 && // a
        data[3] == 0x43;   // C

    if (isFlac) {
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
          frames.push(...this.parseVorbisCommentBlock_(block));
        }

        // PICTURE block
        if (blockType == 6) {
          const frame = this.parseFlacPicture_(block);
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

    const isOgg = data.length >= 4 &&
        data[0] == 0x4F && // O
        data[1] == 0x67 && // g
        data[2] == 0x67 && // g
        data[3] == 0x53;   // S

    if (isOgg) {
      const text = shaka.util.StringUtils.fromUTF8(data);

      let index = text.indexOf('OpusTags');
      if (index < 0) {
        index = text.indexOf('vorbis');
      }

      if (index >= 0) {
        return this.parseVorbisCommentBlock_(data.subarray(index + 8));
      }
    }

    return [];
  }

  /**
   * Parse Vorbis comment structure.
   *
   * @param {!Uint8Array} data
   * @return {!Array<!shaka.extern.MetadataFrame>}
   * @private
   */
  parseVorbisCommentBlock_(data) {
    const frames = [];

    try {
      const reader = new shaka.util.DataViewReader(
          data, shaka.util.DataViewReader.Endianness.LITTLE_ENDIAN);

      // vendor_length
      const vendorLength = reader.readUint32();
      reader.skip(vendorLength);

      // user_comment_list_length
      const commentCount = reader.readUint32();

      for (let i = 0; i < commentCount; i++) {
        const len = reader.readUint32();

        const str = shaka.util.StringUtils.fromUTF8(
            reader.readBytes(len, /* clone= */ false));

        const eq = str.indexOf('=');

        if (eq < 0) {
          continue;
        }

        const vorbisKey = str.substring(0, eq).toUpperCase();
        const value = str.substring(eq + 1);

        const key =
            shaka.metadata.VorbisUtils.VORBIS_TO_ID3_MAP_[vorbisKey] ||
            vorbisKey;

        frames.push({
          key,
          data: value,
          description: '',
          mimeType: null,
          pictureType: null,
        });
      }
    } catch (e) {
      // Malformed Vorbis comment block.
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
  parseFlacPicture_(block) {
    const StringUtils = shaka.util.StringUtils;

    try {
      const reader = new shaka.util.DataViewReader(
          block, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

      const pictureType = reader.readUint32();

      const mimeLength = reader.readUint32();
      const mimeType = StringUtils.fromUTF8(
          reader.readBytes(mimeLength, /* clone= */ true));

      const descLength = reader.readUint32();
      const description = StringUtils.fromUTF8(
          reader.readBytes(descLength, /* clone= */ true));

      // width, height, color depth, color count
      reader.skip(16);

      const dataLength = reader.readUint32();

      const imageBytes = reader.readBytes(dataLength, /* clone= */ true);

      return {
        key: 'APIC',
        data: shaka.util.BufferUtils.toArrayBuffer(imageBytes),
        description,
        mimeType,
        pictureType,
      };
    } catch (e) {
      return null;
    }
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

shaka.metadata.Metadata.registerParserByMime(
    'audio/flac', () => new shaka.metadata.VorbisUtils());
shaka.metadata.Metadata.registerParserByMime(
    'audio/ogg', () => new shaka.metadata.VorbisUtils());
shaka.metadata.Metadata.registerParserByMime(
    'audio/vorbis', () => new shaka.metadata.VorbisUtils());
shaka.metadata.Metadata.registerParserByMime(
    'audio/opus', () => new shaka.metadata.VorbisUtils());
