/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Testing helpers to assist tests for Closed Caption decoders for CEA captions.
 */
shaka.test.CeaUtils = class {
  /**
   * Returns a cue with no underline/italics, and default colors
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} payload
   * @return {!shaka.text.Cue}
   */
  static createDefaultCue(startTime, endTime, payload) {
    const cue = new shaka.text.Cue(startTime, endTime, payload);
    cue.color = shaka.cea.CeaUtils.DEFAULT_TXT_COLOR;
    cue.backgroundColor = shaka.cea.CeaUtils.DEFAULT_BG_COLOR;
    return cue;
  }

  /**
   * Returns a cue with custom underline, italics, color, background color.
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} payload
   * @param {boolean} underline
   * @param {boolean} italics
   * @param {string} textColor
   * @param {string} backgroundColor
   * @param {boolean=} flash Whether the run is CEA-608 Flash-On (FON), mapped
   *   to a static bold style. Optional; defaults to false.
   * @return {!shaka.text.Cue}
   */
  static createStyledCue(startTime, endTime, payload, underline,
      italics, textColor, backgroundColor, flash = false) {
    const cue = new shaka.text.Cue(startTime, endTime, payload);
    if (italics) {
      cue.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
    }
    if (underline) {
      cue.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);
    }
    if (flash) {
      cue.fontWeight = shaka.text.Cue.fontWeight.BOLD;
    }
    cue.color = textColor;
    cue.backgroundColor = backgroundColor;
    return cue;
  }

  /**
   * Returns a cue that corresponds to a linebreak.
   * @param {number} startTime
   * @param {number} endTime
   * @return {!shaka.text.Cue}
   */
  static createLineBreakCue(startTime, endTime) {
    const cue = new shaka.text.Cue(startTime, endTime, /* payload= */ '');
    cue.lineBreak = true;
    return cue;
  }

  /**
   * Create shaka Cue with region updated to a specific value.
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} payload
   * @param {number} serviceNumber
   * @param {number} windowId
   * @param {number} rowCount
   * @param {number} colCount
   * @param {number=} anchorId
   * @return {!shaka.text.Cue}
   */
  static createWindowedCue(startTime, endTime, payload,
      serviceNumber, windowId, rowCount, colCount, anchorId) {
    const cue = new shaka.text.Cue(startTime, endTime, payload);
    const region = cue.region;
    const AnchorId = shaka.cea.Cea708Window.AnchorId;

    region.id = 'svc' + serviceNumber + 'win' + windowId;
    region.height = rowCount;
    region.width = colCount;
    region.heightUnits = shaka.text.CueRegion.units.LINES;
    region.widthUnits = shaka.text.CueRegion.units.LINES;
    region.viewportAnchorUnits = shaka.text.CueRegion.units.LINES;

    if (typeof anchorId === 'number') {
      switch (anchorId) {
        case AnchorId.UPPER_LEFT:
          region.regionAnchorX = 0;
          region.regionAnchorY = 0;
          break;
        case AnchorId.UPPER_CENTER:
          region.regionAnchorX = 50;
          region.regionAnchorY = 0;
          break;
        case AnchorId.UPPER_RIGHT:
          region.regionAnchorX = 100;
          region.regionAnchorY = 0;
          break;
        case AnchorId.MIDDLE_LEFT:
          region.regionAnchorX = 0;
          region.regionAnchorY = 50;
          break;
        case AnchorId.MIDDLE_CENTER:
          region.regionAnchorX = 50;
          region.regionAnchorY = 50;
          break;
        case AnchorId.MIDDLE_RIGHT:
          region.regionAnchorX = 100;
          region.regionAnchorY = 50;
          break;
        case AnchorId.LOWER_LEFT:
          region.regionAnchorX = 0;
          region.regionAnchorY = 100;
          break;
        case AnchorId.LOWER_CENTER:
          region.regionAnchorX = 50;
          region.regionAnchorY = 100;
          break;
        case AnchorId.LOWER_RIGHT:
          region.regionAnchorX = 100;
          region.regionAnchorY = 100;
          break;
      }
    }

    return cue;
  }

  /**
   * Computes odd parity for a 7-bit CEA-608 data byte, returning the byte with
   * the parity bit (bit 7) set so that the total number of set bits is odd.
   * CEA-608-E requires every transmitted byte to carry odd parity; the decoder
   * verifies and then strips this bit. Using this helper keeps raw-byte test
   * fixtures deterministic and spec-correct.
   * @param {number} byte A value whose low 7 bits are the payload.
   * @return {number} The 8-bit value with an odd-parity bit applied.
   */
  static withOddParity(byte) {
    let b = byte & 0x7f;
    let ones = 0;
    for (let i = 0; i < 7; i++) {
      ones += (b >> i) & 0x01;
    }
    // If the payload already has an odd number of ones, parity bit stays 0.
    if ((ones & 0x01) === 0) {
      b |= 0x80;
    }
    return b;
  }

  /**
   * Builds a single 3-byte NTSC "cc triple" as it appears inside a cc_data()
   * SEI payload: a cc-info byte (cc_valid + cc_type) followed by two data
   * bytes. The cc-info byte is 0xfc | ccType with cc_valid set, matching the
   * decoder's framing (CEA-608 field 1/2 -> 0xfc/0xfd, DTVCC data/start ->
   * 0xfe/0xff).
   * @param {number} ccType 0=608 field1, 1=608 field2, 2=DTVCC data,
   *   3=DTVCC start.
   * @param {number} b1 First data byte.
   * @param {number} b2 Second data byte.
   * @param {boolean=} valid Whether cc_valid is set (default true).
   * @return {!Array<number>} The 3-byte triple.
   */
  static ccTriple(ccType, b1, b2, valid = true) {
    // Reserved high bits are conventionally 1 (0xf8); cc_valid is bit 2 (0x04).
    const ccInfo = 0xf8 | (valid ? 0x04 : 0x00) | (ccType & 0x03);
    return [ccInfo, b1 & 0xff, b2 & 0xff];
  }

  /**
   * Builds a deterministic CEA-608 byte-pair frame for the given NTSC field.
   * Optionally applies odd parity to each data byte (off by default so callers
   * can supply already parity-correct control codes verbatim, matching the
   * existing fixtures).
   * @param {number} field 1 for CC1/CC2 (cc_type 0), 2 for CC3/CC4 (cc_type 1).
   * @param {number} b1 First data byte.
   * @param {number} b2 Second data byte.
   * @param {boolean=} applyParity When true, apply odd parity to b1 and b2.
   * @return {!Array<number>} The 3-byte cc triple for this 608 pair.
   */
  static cea608Pair(field, b1, b2, applyParity = false) {
    const ccType = field === 2 ? 1 : 0;
    const d1 = applyParity ? shaka.test.CeaUtils.withOddParity(b1) : b1;
    const d2 = applyParity ? shaka.test.CeaUtils.withOddParity(b2) : b2;
    return shaka.test.CeaUtils.ccTriple(ccType, d1, d2);
  }

  /**
   * Wraps a list of cc triples in a full user-data SEI message (T.35 / ATSC
   * cc_data()) ready to hand to CeaDecoder.extract(). Prepends the ATSC
   * identification bytes, a process_cc_data_flag header carrying the triple
   * count, and the reserved padding byte.
   * @param {!Array<!Array<number>>} triples Cc triples (see ccTriple).
   * @return {!Uint8Array} A complete SEI user-data payload.
   */
  static wrapSei(triples) {
    const initBytes = [
      0xb5, // USA country code.
      0x00, 0x31, // ATSC provider code.
      0x47, 0x41, 0x39, 0x34, // ATSC user identifier ("GA94").
      0x03, // user_data_type_code for cc_data().
    ];
    const count = triples.length & 0x1f;
    // 0xc0 sets the reserved high bit and process_cc_data_flag (0x40).
    const captionData = 0xc0 | count;
    const bytes = [...initBytes, captionData, /* reserved padding= */ 0xff];
    for (const triple of triples) {
      bytes.push(...triple);
    }
    return new Uint8Array(bytes);
  }

  /**
   * Convenience builder: turns a list of CEA-608 byte pairs into a complete
   * SEI payload. Each pair is {field, b1, b2, applyParity?}.
   * @param {!Array<{field: number, b1: number, b2: number,
   *   applyParity: (boolean|undefined)}>} pairs
   * @return {!Uint8Array} A complete SEI user-data payload.
   */
  static buildCea608Sei(pairs) {
    const triples = pairs.map(
        (p) => shaka.test.CeaUtils.cea608Pair(
            p.field, p.b1, p.b2, p.applyParity || false));
    return shaka.test.CeaUtils.wrapSei(triples);
  }

  /**
   * Builds a single CEA-708 DTVCC service block: a service-block header
   * (3-bit service number, 5-bit block size) followed by the service data.
   * Uses the extended-service-block header form when serviceNumber >= 7.
   * @param {number} serviceNumber The DTVCC service number (1-63).
   * @param {!Array<number>} data The service block data bytes.
   * @return {!Array<number>} The header byte(s) followed by data.
   */
  static dtvccServiceBlock(serviceNumber, data) {
    const blockSize = data.length;
    if (serviceNumber >= 7) {
      // Standard header signals "extended" via service number 0b111, then an
      // extended header byte carries the real 6-bit service number.
      const standardHeader = (0x07 << 5) | (blockSize & 0x1f);
      const extendedHeader = serviceNumber & 0x3f;
      return [standardHeader, extendedHeader, ...data];
    }
    const header = ((serviceNumber & 0x07) << 5) | (blockSize & 0x1f);
    return [header, ...data];
  }

  /**
   * Assembles one or more DTVCC service blocks into a DTVCC packet and wraps it
   * in a SEI payload. The packet is prefixed with a packet header whose low 6
   * bits encode packet_size_code per CEA-708-E (so that 2 * size - 1 bytes
   * follow), then the packet bytes are chunked into cc triples: the first
   * triple is flagged as DTVCC_PACKET_START (cc_type 3) and the remainder as
   * DTVCC_PACKET_DATA (cc_type 2).
   * @param {!Array<!Array<number>>} serviceBlocks Blocks from
   *   dtvccServiceBlock().
   * @return {!Uint8Array} A complete SEI user-data payload.
   */
  static buildDtvccSei(serviceBlocks) {
    // Concatenate all service block bytes into the packet body.
    const body = [];
    for (const block of serviceBlocks) {
      body.push(...block);
    }

    // packet_size_code: number of byte pairs in the packet, including the
    // header byte itself. total bytes = 1 (header) + body.length, rounded up
    // to an even count of two-byte words.
    const totalBytes = 1 + body.length;
    const packetSizeCode = Math.ceil(totalBytes / 2) & 0x3f;
    const packetBytes = [packetSizeCode, ...body];
    // Pad to an even length so it chunks cleanly into 2-byte data pairs.
    if (packetBytes.length % 2 !== 0) {
      packetBytes.push(0x00);
    }

    const triples = [];
    for (let i = 0; i < packetBytes.length; i += 2) {
      const isStart = i === 0;
      const ccType = isStart ?
          shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_START :
          shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_DATA;
      triples.push(shaka.test.CeaUtils.ccTriple(
          ccType, packetBytes[i], packetBytes[i + 1]));
    }
    return shaka.test.CeaUtils.wrapSei(triples);
  }
};
