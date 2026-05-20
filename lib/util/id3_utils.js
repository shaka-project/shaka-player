/*! @license
 * Shaka Player
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Id3Utils');

goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');


/**
 * @summary A set of Id3Utils utility functions.
 * @export
 */
shaka.util.Id3Utils = class {
  /**
   * @param {Uint8Array} data
   * @param {number} offset
   * @return {boolean}
   * @private
   */
  static isHeader_(data, offset) {
    /*
     * http://id3.org/id3v2.3.0
     * [0]     = 'I'
     * [1]     = 'D'
     * [2]     = '3'
     * [3,4]   = {Version}
     * [5]     = {Flags}
     * [6-9]   = {ID3 Size}
     *
     * An ID3v2 tag can be detected with the following pattern:
     *  $49 44 33 yy yy xx zz zz zz zz
     * Where yy is less than $FF, xx is the 'flags' byte and zz is less than $80
     */
    if (offset + 10 <= data.length) {
      // look for 'ID3' identifier
      if (data[offset] === 0x49 &&
          data[offset + 1] === 0x44 &&
          data[offset + 2] === 0x33) {
        // check version is within range
        if (data[offset + 3] < 0xff && data[offset + 4] < 0xff) {
          // check size is within range
          if (data[offset + 6] < 0x80 &&
              data[offset + 7] < 0x80 &&
              data[offset + 8] < 0x80 &&
              data[offset + 9] < 0x80) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * @param {Uint8Array} data
   * @param {number} offset
   * @return {boolean}
   * @private
   */
  static isFooter_(data, offset) {
    /*
     * The footer is a copy of the header, but with a different identifier
     */
    if (offset + 10 <= data.length) {
      // look for '3DI' identifier
      if (data[offset] === 0x33 &&
          data[offset + 1] === 0x44 &&
          data[offset + 2] === 0x49) {
        // check version is within range
        if (data[offset + 3] < 0xff && data[offset + 4] < 0xff) {
          // check size is within range
          if (data[offset + 6] < 0x80 &&
              data[offset + 7] < 0x80 &&
              data[offset + 8] < 0x80 &&
              data[offset + 9] < 0x80) {
            return true;
          }
        }
      }
    }

    return false;
  }

  /**
   * @param {Uint8Array} data
   * @param {number} offset
   * @return {number}
   * @private
   */
  static readSize_(data, offset) {
    let size = 0;
    size = (data[offset] & 0x7f) << 21;
    size |= (data[offset + 1] & 0x7f) << 14;
    size |= (data[offset + 2] & 0x7f) << 7;
    size |= data[offset + 3] & 0x7f;
    return size;
  }

  /**
   * Reads a 32-bit big-endian integer from `data` at `offset`.
   * Used for ID3v2.3 frame sizes, which are plain big-endian (not syncsafe).
   *
   * @param {Uint8Array} data
   * @param {number} offset
   * @return {number}
   * @private
   */
  static readSizeBE_(data, offset) {
    let size = 0;
    size = data[offset] << 24;
    size |= data[offset + 1] << 16;
    size |= data[offset + 2] << 8;
    size |= data[offset + 3];
    return size >>> 0;
  }

  /**
   * Decodes a string from raw bytes using the given ID3 encoding indicator.
   *
   * ID3v2 encoding values:
   *   0x00 = ISO-8859-1 (Latin-1)
   *   0x01 = UTF-16 with BOM (FF FE = LE, FE FF = BE)
   *   0x02 = UTF-16BE without BOM
   *   0x03 = UTF-8
   *
   * @param {!Uint8Array} data
   * @param {number} encoding
   * @return {string}
   * @private
   */
  static decodeString_(data, encoding) {
    const StringUtils = shaka.util.StringUtils;
    switch (encoding) {
      case shaka.util.Id3Utils.LATIN1_encoding:
        return Array.from(data).map((b) => String.fromCharCode(b)).join('');
      case shaka.util.Id3Utils.UTF16BOM_encoding:
        return StringUtils.fromBytesAutoDetect(data);
      case shaka.util.Id3Utils.UTF16BE_encoding:
        return StringUtils.fromUTF16(data, /* littleEndian= */ false);
      case shaka.util.Id3Utils.UTF8_encoding:
      default:
        return StringUtils.fromUTF8(data);
    }
  }

  /**
   * Returns the byte width of the null terminator for a given encoding.
   * UTF-16 encodings use a two-byte null; all others use a single byte.
   *
   * @param {number} encoding
   * @return {number}
   * @private
   */
  static nullTermSize_(encoding) {
    return (encoding === shaka.util.Id3Utils.UTF16BOM_encoding ||
            encoding === shaka.util.Id3Utils.UTF16BE_encoding) ? 2 : 1;
  }

  /**
   * Finds the byte index of the null terminator in `data` starting from
   * `offset`, respecting the terminator width for the given encoding.
   *
   * For UTF-16 encodings the search steps in two-byte increments so it never
   * straddles a surrogate pair or misidentifies a code-unit as a terminator.
   *
   * @param {Uint8Array} data
   * @param {number} encoding
   * @param {number=} offset
   * @return {number}  Byte index of the null terminator, or -1 if not found.
   * @private
   */
  static findNull_(data, encoding, offset = 0) {
    if (encoding === shaka.util.Id3Utils.UTF16BOM_encoding ||
        encoding === shaka.util.Id3Utils.UTF16BE_encoding) {
      for (let i = offset; i + 1 < data.length; i += 2) {
        if (data[i] === 0 && data[i + 1] === 0) {
          return i;
        }
      }
      return -1;
    }
    return data.indexOf(0, offset);
  }

  /**
   * @param {Uint8Array} data
   * @param {number} version  ID3v2 major version (3 = v2.3, 4 = v2.4)
   * @return {shaka.extern.MetadataRawFrame}
   * @private
   */
  static getFrameData_(data, version) {
    /*
     * Frame ID       $xx xx xx xx (four characters)
     * Size           $xx xx xx xx
     * Flags          $xx xx
     */
    const type = String.fromCharCode(data[0], data[1], data[2], data[3]);
    const size = version >= 4 ? shaka.util.Id3Utils.readSize_(data, 4) :
        shaka.util.Id3Utils.readSizeBE_(data, 4);

    // skip frame id, size, and flags
    const offset = 10;

    return {
      type,
      size,
      data: data.subarray(offset, offset + size),
    };
  }

  /**
   * @param {shaka.extern.MetadataRawFrame} frame
   * @return {?shaka.extern.MetadataFrame}
   * @private
   */
  static decodeFrame_(frame) {
    const Id3Utils = shaka.util.Id3Utils;
    const BufferUtils = shaka.util.BufferUtils;
    const StringUtils = shaka.util.StringUtils;

    const metadataFrame = {
      key: frame.type,
      description: '',
      data: '',
      mimeType: null,
      pictureType: null,
    };

    if (frame.type === 'APIC') {
      /*
       * Format:
       * [0]       = {Text Encoding}
       * [1 - X]   = {MIME Type}\0 (always Latin-1, single-byte null)
       * [X+1]     = {Picture Type}
       * [X+2 - Y] = {Description}\0 (encoded per encoding byte)
       * [Y+n - ?] = {Picture Data or URL} (n = nullTermSize_(encoding))
       */
      if (frame.size < 2) {
        return null;
      }
      const encoding = frame.data[0];

      // MIME type is always Latin-1, terminated by a single null byte.
      const mimeTypeEndIndex = frame.data.subarray(1).indexOf(0);
      if (mimeTypeEndIndex === -1) {
        return null;
      }
      const mimeType = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 1, mimeTypeEndIndex));

      const pictureType = frame.data[2 + mimeTypeEndIndex];

      // Description is encoding-aware and null-terminated.
      const descStart = 3 + mimeTypeEndIndex;
      const descEnd = Id3Utils.findNull_(frame.data, encoding, descStart);
      if (descEnd === -1) {
        return null;
      }
      const description = Id3Utils.decodeString_(
          frame.data.subarray(descStart, descEnd), encoding);

      const nullSize = Id3Utils.nullTermSize_(encoding);
      const picStart = descEnd + nullSize;

      let data;
      if (mimeType === '-->') {
        data = StringUtils.fromUTF8(frame.data.subarray(picStart));
      } else {
        data = BufferUtils.toArrayBuffer(frame.data.subarray(picStart));
      }

      metadataFrame.mimeType = mimeType;
      metadataFrame.pictureType = pictureType;
      metadataFrame.description = description;
      metadataFrame.data = data;
      return metadataFrame;
    } else if (frame.type === 'COMM') {
      /*
       * Format:
       * [0]     = {Text Encoding}
       * [1-3]   = {Language} (ISO 639-2, always Latin-1)
       * [4-?]   = {Short content description}\0 (encoding-aware null)
       * [?-end] = {The actual text}
       */
      if (frame.size < 5) {
        return null;
      }
      const encoding = frame.data[0];
      const language = StringUtils.fromUTF8(frame.data.subarray(1, 4))
          .replace(/\0/g, '');

      const descStart = 4;
      const descEnd = Id3Utils.findNull_(frame.data, encoding, descStart);
      if (descEnd === -1) {
        return null;
      }
      const description = Id3Utils.decodeString_(
          frame.data.subarray(descStart, descEnd), encoding);

      const nullSize = Id3Utils.nullTermSize_(encoding);
      const text = Id3Utils.decodeString_(
          frame.data.subarray(descEnd + nullSize), encoding)
          .replace(/\0*$/, '');

      // Expose the language in `description` when there is no content
      // descriptor, since it is the most useful piece of context for the
      // consumer.
      metadataFrame.description = description || language;
      metadataFrame.data = text;
      return metadataFrame;
    } else if (frame.type === 'TXXX') {
      /*
       * Format:
       * [0]   = {Text Encoding}
       * [1-?] = {Description}\0{Value}
       */
      if (frame.size < 2) {
        return null;
      }
      const encoding = frame.data[0];
      const descEnd = Id3Utils.findNull_(frame.data, encoding, 1);
      if (descEnd === -1) {
        return null;
      }
      const description = Id3Utils.decodeString_(
          frame.data.subarray(1, descEnd), encoding);

      const nullSize = Id3Utils.nullTermSize_(encoding);
      // Strip any leading BOM (\ufeff) that some taggers prepend to the value
      // field even though the encoding is already declared in byte [0].
      const data = Id3Utils.decodeString_(
          frame.data.subarray(descEnd + nullSize), encoding)
          .replace(/^\ufeff/, '')
          .replace(/\0*$/, '');

      metadataFrame.description = description;
      metadataFrame.data = data;
      return metadataFrame;
    } else if (frame.type === 'WXXX') {
      /*
       * Format:
       * [0]   = {Text Encoding}
       * [1-?] = {Description}\0{URL}
       *
       * The URL itself is always Latin-1 per spec (§4.3.2).
       */
      if (frame.size < 2) {
        return null;
      }
      const encoding = frame.data[0];
      const descEnd = Id3Utils.findNull_(frame.data, encoding, 1);
      if (descEnd === -1) {
        return null;
      }
      const description = Id3Utils.decodeString_(
          frame.data.subarray(1, descEnd), encoding);

      const nullSize = Id3Utils.nullTermSize_(encoding);
      // URLs are always Latin-1 regardless of the encoding byte.
      const data = StringUtils.fromUTF8(
          frame.data.subarray(descEnd + nullSize))
          .replace(/\0*$/, '');

      metadataFrame.description = description;
      metadataFrame.data = data;
      return metadataFrame;
    } else if (frame.type === 'PRIV') {
      /*
       * Format: <owner identifier (Latin-1)>\0<binary data>
       */
      if (frame.size < 2) {
        return null;
      }
      const textEndIndex = frame.data.indexOf(0);
      if (textEndIndex === -1) {
        return null;
      }
      const text = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 0, textEndIndex));
      metadataFrame.description = text;
      if (text == 'com.apple.streaming.transportStreamTimestamp') {
        const data = frame.data.subarray(text.length + 1);
        // timestamp is 33 bit expressed as a big-endian eight-octet number,
        // with the upper 31 bits set to zero.
        const pts33Bit = data[3] & 0x1;
        let timestamp =
          (data[4] << 23) + (data[5] << 15) + (data[6] << 7) + data[7];
        timestamp /= 45;

        if (pts33Bit) {
          timestamp += 47721858.84;
        } // 2^32 / 90

        metadataFrame.data = timestamp;
      } else {
        const data = BufferUtils.toArrayBuffer(
            frame.data.subarray(text.length + 1));
        metadataFrame.data = data;
      }
      return metadataFrame;
    } else if (frame.type === 'UFID') {
      /*
       * Format: <owner identifier (Latin-1)>\0<binary identifier>
       */
      const ownerEnd = frame.data.indexOf(0);
      if (ownerEnd === -1) {
        return null;
      }
      const owner = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 0, ownerEnd));
      metadataFrame.description = owner;
      metadataFrame.data = BufferUtils.toArrayBuffer(
          frame.data.subarray(ownerEnd + 1));
      return metadataFrame;
    } else if (frame.type[0] === 'T') {
      /*
       * Format:
       * [0]   = {Text Encoding}
       * [1-?] = {Value}  (ID3v2.4: multiple values separated by \0)
       */
      if (frame.size < 2) {
        return null;
      }
      const encoding = frame.data[0];
      const rawText = Id3Utils.decodeString_(frame.data.subarray(1), encoding);

      // ID3v2.4 §4.2: multiple values are separated by a null character.
      // Strip trailing nulls, then split and clean each segment.
      // BOM characters (\ufeff) can appear at the start of individual segments
      // when each UTF-16 value carries its own BOM — strip them per segment.
      const text = rawText
          .replace(/\0+$/, '')
          .split('\0')
          .map((v) => v.replace(/^\ufeff/, ''))
          .filter((v) => v.length > 0)
          .join(' / ');

      metadataFrame.data = text;
      return metadataFrame;
    } else if (frame.type[0] === 'W') {
      /*
       * Format:
       * [0-?] = {URL}  (always Latin-1, no encoding byte for plain W* frames)
       */
      const url = StringUtils.fromUTF8(frame.data)
          .replace(/\0*$/, '');
      metadataFrame.data = url;
      return metadataFrame;
    } else if (frame.data) {
      shaka.log.warning('Unrecognized ID3 frame type:', frame.type);
      metadataFrame.data = BufferUtils.toArrayBuffer(frame.data);
      return metadataFrame;
    }

    return null;
  }

  /**
   * Returns an array of ID3 frames found in all the ID3 tags in the id3Data
   * @param {Uint8Array} id3Data - The ID3 data containing one or more ID3 tags
   * @return {!Array<shaka.extern.MetadataFrame>}
   * @export
   */
  static getID3Frames(id3Data) {
    const Id3Utils = shaka.util.Id3Utils;
    let offset = 0;
    const frames = [];
    while (Id3Utils.isHeader_(id3Data, offset)) {
      // The tag-level size is always syncsafe across all v2.x versions.
      const version = id3Data[offset + 3];
      const size = Id3Utils.readSize_(id3Data, offset + 6);

      if ((id3Data[offset + 5] >> 6) & 1) {
        // skip extended header
        offset += 10;
      }
      // skip past ID3 header
      offset += 10;

      const end = offset + size;
      // loop through frames in the ID3 tag
      while (offset + 10 < end) {
        // A null byte signals the start of padding — stop parsing frames.
        if (id3Data[offset] === 0) {
          break;
        }

        const frameData =
            Id3Utils.getFrameData_(id3Data.subarray(offset), version);
        const frame = Id3Utils.decodeFrame_(frameData);
        if (frame) {
          frames.push(frame);
        }

        // skip frame header and frame data
        offset += frameData.size + 10;
      }

      if (Id3Utils.isFooter_(id3Data, offset)) {
        offset += 10;
      }
    }
    return frames;
  }

  /**
   * Returns any adjacent ID3 tags found in data starting at offset, as one
   * block of data
   * @param {Uint8Array} id3Data - The ID3 data containing one or more ID3 tags
   * @param {number=} offset - The offset at which to start searching
   * @return {!Uint8Array}
   * @export
   */
  static getID3Data(id3Data, offset = 0) {
    const Id3Utils = shaka.util.Id3Utils;
    const front = offset;
    let length = 0;

    while (Id3Utils.isHeader_(id3Data, offset)) {
      if ((id3Data[offset + 5] >> 6) & 1) {
        // skip extended header
        length += 10;
      }
      // skip past ID3 header
      length += 10;

      const size = Id3Utils.readSize_(id3Data, offset + 6);
      length += size;

      if (Id3Utils.isFooter_(id3Data, offset + 10)) {
        // ID3 footer is 10 bytes
        length += 10;
      }
      offset += length;
    }

    if (length > 0) {
      return id3Data.subarray(front, front + length);
    }
    return new Uint8Array([]);
  }

  /**
   * Returns metadata frames found in ID3v1 tags.
   *
   * @param {Uint8Array} data
   * @return {!Array<!shaka.extern.MetadataFrame>}
   */
  static getID3v1Frames(data) {
    const frames = [];
    const v1Offset = data.length - 128;

    if (v1Offset < 0 ||
        data[v1Offset] !== 0x54 ||
        data[v1Offset + 1] !== 0x41 ||
        data[v1Offset + 2] !== 0x47) {
      return frames;
    }

    const read = (start, length) => {
      return shaka.util.StringUtils.fromUTF8(
          data.subarray(v1Offset + start, v1Offset + start + length),
      ).replace(/\0/g, '').trim();
    };

    const push = (key, value) => {
      if (!value) {
        return;
      }
      frames.push({
        key,
        description: '',
        data: value,
        mimeType: null,
        pictureType: null,
      });
    };

    push('TIT2', read(3, 30));
    push('TPE1', read(33, 30));
    push('TALB', read(63, 30));
    push('TYER', read(93, 4));

    let comment = '';
    let track = null;

    if (data[v1Offset + 125] === 0) {
      comment = read(97, 28);
      track = data[v1Offset + 126];
    } else {
      comment = read(97, 30);
    }

    push('COMM', comment);

    if (track !== null) {
      push('TRCK', String(track));
    }

    push('TCON', String(data[v1Offset + 127]));

    return frames;
  }
};

/**
 * ISO-8859-1 / Latin-1 encoding byte.
 * @const {number}
 */
shaka.util.Id3Utils.LATIN1_encoding = 0x00;

/**
 * UTF-16 with BOM encoding byte.
 * @const {number}
 */
shaka.util.Id3Utils.UTF16BOM_encoding = 0x01;

/**
 * UTF-16BE without BOM encoding byte.
 * @const {number}
 */
shaka.util.Id3Utils.UTF16BE_encoding = 0x02;

/**
 * UTF-8 encoding byte.
 * @const {number}
 */
shaka.util.Id3Utils.UTF8_encoding = 0x03;
