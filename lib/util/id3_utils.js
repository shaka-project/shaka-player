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
   * @param {Uint8Array} data
   * @return {shaka.extern.MetadataRawFrame}
   * @private
   */
  static getFrameData_(data) {
    /*
     * Frame ID       $xx xx xx xx (four characters)
     * Size           $xx xx xx xx
     * Flags          $xx xx
     */
    const type = String.fromCharCode(data[0], data[1], data[2], data[3]);
    const size = shaka.util.Id3Utils.readSize_(data, 4);

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
       * [1 - X]   = {MIME Type}\0
       * [X+1]     = {Picture Type}
       * [X+2 - Y] = {Description}\0
       * [Y - ?]   = {Picture Data or Picture URL}
       */
      if (frame.size < 2) {
        return null;
      }
      if (frame.data[0] !== shaka.util.Id3Utils.UTF8_encoding) {
        shaka.log.warning('Ignore frame with unrecognized character ' +
            'encoding');
        return null;
      }

      const mimeTypeEndIndex = frame.data.subarray(1).indexOf(0);
      if (mimeTypeEndIndex === -1) {
        return null;
      }
      const mimeType = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 1, mimeTypeEndIndex));
      const pictureType = frame.data[2 + mimeTypeEndIndex];
      const descriptionEndIndex = frame.data.subarray(3 + mimeTypeEndIndex)
          .indexOf(0);
      if (descriptionEndIndex === -1) {
        return null;
      }
      const description = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 3 + mimeTypeEndIndex,
              descriptionEndIndex));
      let data;
      if (mimeType === '-->') {
        data = StringUtils.fromUTF8(
            BufferUtils.toUint8(
                frame.data, 4 + mimeTypeEndIndex + descriptionEndIndex));
      } else {
        data = BufferUtils.toArrayBuffer(
            frame.data.subarray(4 + mimeTypeEndIndex + descriptionEndIndex));
      }
      metadataFrame.mimeType = mimeType;
      metadataFrame.pictureType = pictureType;
      metadataFrame.description = description;
      metadataFrame.data = data;
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
      if (frame.data[0] !== shaka.util.Id3Utils.UTF8_encoding) {
        shaka.log.warning('Ignore frame with unrecognized character ' +
            'encoding');
        return null;
      }
      const descriptionEndIndex = frame.data.subarray(1).indexOf(0);

      if (descriptionEndIndex === -1) {
        return null;
      }
      const description = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 1, descriptionEndIndex));
      const data = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 2 + descriptionEndIndex))
          .replace(/\0*$/, '');

      metadataFrame.description = description;
      metadataFrame.data = data;
      return metadataFrame;
    } else if (frame.type === 'WXXX') {
      /*
       * Format:
       * [0]   = {Text Encoding}
       * [1-?] = {Description}\0{URL}
       */
      if (frame.size < 2) {
        return null;
      }
      if (frame.data[0] !== shaka.util.Id3Utils.UTF8_encoding) {
        shaka.log.warning('Ignore frame with unrecognized character ' +
            'encoding');
        return null;
      }
      const descriptionEndIndex = frame.data.subarray(1).indexOf(0);

      if (descriptionEndIndex === -1) {
        return null;
      }
      const description = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 1, descriptionEndIndex));
      const data = StringUtils.fromUTF8(
          BufferUtils.toUint8(frame.data, 2 + descriptionEndIndex))
          .replace(/\0*$/, '');

      metadataFrame.description = description;
      metadataFrame.data = data;
      return metadataFrame;
    } else if (frame.type === 'PRIV') {
      /*
       * Format: <text string>\0<binary data>
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
    } else if (frame.type[0] === 'T') {
      /*
       * Format:
       * [0]   = {Text Encoding}
       * [1-?] = {Value}
       */
      if (frame.size < 2) {
        return null;
      }
      if (frame.data[0] !== shaka.util.Id3Utils.UTF8_encoding) {
        shaka.log.warning('Ignore frame with unrecognized character ' +
            'encoding');
        return null;
      }
      const text = StringUtils.fromUTF8(frame.data.subarray(1))
          .replace(/\0*$/, '');
      metadataFrame.data = text;
      return metadataFrame;
    } else if (frame.type[0] === 'W') {
      /*
       * Format:
       * [0-?] = {URL}
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
        const frameData = Id3Utils.getFrameData_(id3Data.subarray(offset));
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
};

/**
 * UTF8 encoding byte
 * @const {number}
 */
shaka.util.Id3Utils.UTF8_encoding = 0x03;
