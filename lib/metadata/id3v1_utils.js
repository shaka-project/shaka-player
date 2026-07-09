/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.metadata.Id3V1Utils');

goog.require('shaka.metadata.Metadata');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.StringUtils');


/**
 * @summary Metadata parser for ID3v1 tags.
 * @implements {shaka.extern.MetadataParser}
 * @export
 */
shaka.metadata.Id3V1Utils = class {
  /**
   * @override
   * @export
   */
  parse(data) {
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

for (const mimeType of shaka.util.MimeUtils.RAW_FORMATS) {
  shaka.metadata.Metadata.registerParserByMime(
      mimeType, () => new shaka.metadata.Id3V1Utils());
}
