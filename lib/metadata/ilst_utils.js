/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.metadata.IlstUtils');

goog.require('shaka.metadata.Metadata');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.StringUtils');

/**
 * Utility class for parsing MP4 ILST (iTunes metadata) atoms.
 * @implements {shaka.extern.MetadataParser}
 * @export
 */
shaka.metadata.IlstUtils = class {
  /**
   * @override
   * @export
   */
  parse(data) {
    const frames = [];

    new shaka.util.Mp4Parser()
        .boxes(['moov', 'udta'], shaka.util.Mp4Parser.children)
        .fullBox('meta', shaka.util.Mp4Parser.children)
        .box('ilst', (box) => {
          while (box.reader.hasMoreData()) {
            // We need at least 4 bytes for `size` and 4 bytes for `type`.
            if (box.reader.getLength() - box.reader.getPosition() < 8) {
              break;
            }

            const size = box.reader.readUint32();
            const type = shaka.util.Mp4Parser.typeToString(
                box.reader.readUint32());

            // A valid box must be at least 8 bytes (header only).
            // If size < 8 we already consumed 8 bytes, so break to avoid
            // reading a huge (or negative) number of bytes.
            if (size < 8) {
              break;
            }

            // Clamp payload read to remaining available data so that a
            // truncated segment does not throw a range error.
            const maxPayload =
                box.reader.getLength() - box.reader.getPosition();
            const payloadSize = Math.min(size - 8, maxPayload);

            const payload = box.reader.readBytes(payloadSize, false);

            const frame = (type === '----') ?
                this.parseFreeform_(payload) :
                this.parseStandard_(type, payload);

            if (frame) {
              frames.push(frame);
            }
          }
        })
        .parse(data);

    return frames;
  }

  /**
   * Parses Apple freeform metadata (---- box).
   *
   * @param {!Uint8Array} data
   * @return {?shaka.extern.MetadataFrame}
   * @private
   */
  parseFreeform_(data) {
    const StringUtils = shaka.util.StringUtils;

    let mean = '';
    let name = '';

    /**
     * @type {?{
     *   data: (string|number|ArrayBuffer),
     *   mimeType: ?string,
     *   pictureType: ?number
     * }}
     */
    let value = null;

    new shaka.util.Mp4Parser()
        .fullBox('mean', (box) => {
          const remaining = box.reader.getLength() - box.reader.getPosition();
          mean = StringUtils.fromUTF8(box.reader.readBytes(remaining, false));
        })
        .fullBox('name', (box) => {
          const remaining = box.reader.getLength() - box.reader.getPosition();
          name = StringUtils.fromUTF8(box.reader.readBytes(remaining, false));
        })
        .fullBox('data', (box) => {
          value = this.parseDataBox_(box);
        })
        .parse(data);

    if (!value || !name) {
      return null;
    }

    return {
      key: name,
      data: value.data,
      description: mean ? `Domain: ${mean}` : '',
      mimeType: value.mimeType,
      pictureType: value.pictureType,
    };
  }

  /**
   * Parses standard ILST atoms (non-freeform).
   *
   * @param {string} key
   * @param {!Uint8Array} data
   * @return {?shaka.extern.MetadataFrame}
   * @private
   */
  parseStandard_(key, data) {
    const mappedKey = shaka.metadata.IlstUtils.ILST_TO_ID3_.get(key) || key;

    /** @type {?shaka.extern.MetadataFrame} */
    let frame = null;

    new shaka.util.Mp4Parser()
        .fullBox('data', (box) => {
          const parsed = this.parseDataBox_(box, key);

          frame = {
            key: mappedKey,
            data: parsed.data,
            description: '',
            mimeType: parsed.mimeType,
            pictureType: parsed.pictureType,
          };
        })
        .parse(data);

    return frame;
  }

  /**
   * Parses a MP4 ILST `data` sub-box.
   *
   * The Mp4Parser fullBox handler already consumed version (1 byte) and
   * flags (3 bytes) before invoking this callback, so `box.reader` starts
   * immediately after those 4 bytes.
   *
   * Remaining payload layout:
   * - 4 bytes reserved (always 0x00000000)
   * - remaining bytes = actual value
   *
   * `box.flags` contains the iTunes type indicator:
   * - 1  : UTF-8 text
   * - 13 : JPEG image
   * - 14 : PNG image
   * - 21 : Big-endian signed integer
   *
   * @param {!shaka.extern.ParsedBox} box
   * @param {string=} key  Original ILST four-char code, used for trkn/disk.
   * @return {{
   *   data: (string|number|ArrayBuffer),
   *   mimeType: ?string,
   *   pictureType: ?number
   * }}
   * @private
   */
  parseDataBox_(box, key = '') {
    const StringUtils = shaka.util.StringUtils;
    const BufferUtils = shaka.util.BufferUtils;

    // Skip the 4-byte reserved field.
    box.reader.skip(4);

    const raw = box.reader.readBytes(
        box.reader.getLength() - box.reader.getPosition(),
        false);

    // trkn (track number) and disk (disc number) are encoded as a packed
    // binary struct regardless of the type flag, so handle them first.
    if (key === 'trkn' || key === 'disk') {
      if (raw.length >= 6) {
        const view = BufferUtils.toDataView(raw);
        const index = view.getUint16(2, /* littleEndian= */ false);
        const total = view.getUint16(4, /* littleEndian= */ false);

        return {
          data: total > 0 ? `${index}/${total}` : `${index}`,
          mimeType: null,
          pictureType: null,
        };
      }
    }

    switch (box.flags) {
      case 13:
        return {
          data: BufferUtils.toArrayBuffer(raw),
          mimeType: 'image/jpeg',
          pictureType: 3,
        };
      case 14:
        return {
          data: BufferUtils.toArrayBuffer(raw),
          mimeType: 'image/png',
          pictureType: 3,
        };
      case 21: {
        const view = BufferUtils.toDataView(raw);
        let value = 0;
        switch (raw.length) {
          case 1:
            value = view.getInt8(0);
            break;
          case 2:
            value = view.getInt16(0, /* littleEndian= */ false);
            break;
          case 3:
            // DataView has no getInt24; assemble manually and sign-extend.
            value = (raw[0] << 16) | (raw[1] << 8) | raw[2];
            if (value & 0x800000) {
              value |= ~0xFFFFFF;  // sign-extend to 32 bits
            }
            break;
          case 4:
            value = view.getInt32(0, /* littleEndian= */ false);
            break;
          default:
            // Sizes > 4 bytes are non-standard; accumulate as unsigned.
            // Sign-extension is intentionally omitted here because iTunes
            // never writes multi-word integers in ILST atoms.
            value = 0;
            for (const byte of raw) {
              value = (value << 8) | byte;
            }
        }
        return {
          data: value,
          mimeType: null,
          pictureType: null,
        };
      }
      default:
        // Flag 1 (UTF-8) and any unknown type: treat as text.
        return {
          data: StringUtils.fromUTF8(raw).replace(/\0/g, ''),
          mimeType: null,
          pictureType: null,
        };
    }
  }
};

/**
 * Maps iTunes ILST four-char codes to their ID3v2 equivalents.
 *
 * @const {!Map<string, string>}
 * @private
 */
shaka.metadata.IlstUtils.ILST_TO_ID3_ = new Map()
    .set('©nam', 'TIT2')
    .set('©ART', 'TPE1')
    .set('aART', 'TPE2')
    .set('©alb', 'TALB')
    .set('©gen', 'TCON')
    .set('©day', 'TDRC')
    .set('©wrt', 'TEXT')
    .set('trkn', 'TRCK')
    .set('disk', 'TPOS')
    .set('©cmt', 'COMM')
    .set('covr', 'APIC')
    .set('cprt', 'TCOP')
    .set('©too', 'TENC')
    .set('tmpo', 'TBPM')
    .set('cpil', 'TCMP');

shaka.metadata.Metadata.registerParserByMime(
    'audio/mp4', () => new shaka.metadata.IlstUtils());
