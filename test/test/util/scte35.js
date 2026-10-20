/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** SCTE-35 fixtures shared by the parser and player tests. */
shaka.test.Scte35 = class {
  /** @return {!Uint8Array} A splice_info_section carrying a splice insert. */
  static section() {
    return shaka.util.Uint8ArrayUtils.fromHex(
        'fc30250001ffffffff00fff01405000004d27feffffffffffefe005265c0' +
        '0001010100001a63a8ea');
  }

  /** @return {string} */
  static base64() {
    return shaka.util.Uint8ArrayUtils.toStandardBase64(
        shaka.test.Scte35.section());
  }

  /** @return {string} */
  static hex() {
    return '0x' + shaka.util.Uint8ArrayUtils.toHex(
        shaka.test.Scte35.section());
  }

  /**
   * @param {string=} xml Contents of the <Event> element.
   * @param {string=} scheme
   * @return {shaka.extern.TimelineRegionInfo}
   */
  static region(xml = '<s:Signal><s:Binary>' + shaka.test.Scte35.base64() +
      '</s:Binary></s:Signal>', scheme = 'urn:scte:scte35:2014:xml+bin') {
    return {
      schemeIdUri: scheme, value: '', id: '1', timescale: 1,
      startTime: 10, endTime: 70,
      eventNode: shaka.util.TXml.parseXmlString('<Event>' + xml + '</Event>'),
      urlParams: undefined,
    };
  }

  /**
   * @param {!Uint8Array=} data
   * @return {shaka.extern.EmsgInfo}
   */
  static emsg(data = shaka.test.Scte35.section()) {
    return {
      schemeIdUri: 'urn:scte:scte35:2013:bin', value: '', id: 1,
      startTime: 10, endTime: 70, timescale: 1,
      presentationTimeDelta: 0, eventDuration: 60, messageData: data,
    };
  }

  /** @return {shaka.extern.Scte35Event} */
  static event() {
    const event = shaka.util.Scte35.fromEmsg(shaka.test.Scte35.emsg());
    goog.asserts.assert(event, 'SCTE-35 scheme should be recognized');
    return event;
  }

  /**
   * @param {number} version
   * @param {number} time Raw emsg time in seconds before timestamp offsets.
   * @return {!Uint8Array}
   */
  static emsgBox(version, time) {
    const scheme = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8('urn:scte:scte35:2013:bin\0\0'));
    const data = shaka.test.Scte35.section();
    const size = 12 + scheme.length + (version == 0 ? 16 : 20) + data.length;
    const box = new Uint8Array(size);
    const view = shaka.util.BufferUtils.toDataView(box);
    view.setUint32(0, size);
    box.set([0x65, 0x6d, 0x73, 0x67, version, 0, 0, 0], 4);
    let position = 12;
    if (version == 0) {
      box.set(scheme, position);
      position += scheme.length;
    }
    view.setUint32(position, 90000);
    position += 4;
    if (version != 0) {
      view.setUint32(position, 0);
      position += 4;
    }
    view.setUint32(position, time * 90000);
    view.setUint32(position + 4, 60 * 90000);
    view.setUint32(position + 8, 1);
    position += 12;
    if (version != 0) {
      box.set(scheme, position);
      position += scheme.length;
    }
    box.set(data, position);
    return box;
  }

  /**
   * Builds a splice_info_section.
   *
   * @param {number} commandType
   * @param {!Array<number>} command The splice_command() bytes.
   * @param {shaka.test.Scte35.TsSectionOptions=} options
   * @return {!Uint8Array}
   */
  static tsSection(commandType, command, options) {
    options = /** @type {shaka.test.Scte35.TsSectionOptions} */ (
      options || {});
    const ptsAdjustment = options.ptsAdjustment || 0;
    const descriptors = options.descriptors || [];
    const high = Math.floor(ptsAdjustment / 0x100000000);
    const low = ptsAdjustment % 0x100000000;
    const bytes = [
      0xfc, 0, 0,
      // protocol_version
      0,
      (options.encrypted ? 0x80 : 0) | high,
      (low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff,
      // cw_index
      0xff,
      // tier (all ones) and splice_command_length
      0xff, 0xf0 | (command.length >> 8), command.length & 0xff,
      commandType,
      ...command,
      descriptors.length >> 8, descriptors.length & 0xff,
      ...descriptors,
      0, 0, 0, 0,
    ];
    const sectionLength = bytes.length - 3;
    // sap_type 3 (not specified)
    bytes[1] = 0x30 | (sectionLength >> 8);
    bytes[2] = sectionLength & 0xff;
    const section = new Uint8Array(bytes);
    const crc = shaka.test.Scte35.crc32_(
        section.subarray(0, section.length - 4));
    shaka.util.BufferUtils.toDataView(section)
        .setUint32(section.length - 4, crc);
    return section;
  }

  /**
   * @param {?number} ptsTime The splice time in 90 kHz units, or null for an
   *   immediate splice.
   * @param {shaka.test.Scte35.TsSectionOptions=} options
   * @return {!Uint8Array}
   */
  static spliceInsert(ptsTime, options) {
    options = /** @type {shaka.test.Scte35.TsSectionOptions} */ (
      options || {});
    const eventId = options.eventId || 1;
    const command = [
      (eventId >>> 24) & 0xff, (eventId >>> 16) & 0xff,
      (eventId >>> 8) & 0xff, eventId & 0xff,
      // splice_event_cancel_indicator 0
      0x7f,
      // out_of_network, program_splice, splice_immediate as needed,
      // event_id_compliance and reserved bits.
      0xc0 | (ptsTime == null ? 0x10 : 0) | 0x0f,
    ];
    if (ptsTime != null) {
      command.push(...shaka.test.Scte35.spliceTime_(ptsTime));
    }
    // unique_program_id, avail_num, avails_expected
    command.push(0, 1, 0, 0);
    return shaka.test.Scte35.tsSection(0x05, command, options);
  }

  /**
   * @param {number} ptsTime
   * @return {!Uint8Array}
   */
  static timeSignal(ptsTime) {
    return shaka.test.Scte35.tsSection(
        0x06, shaka.test.Scte35.spliceTime_(ptsTime));
  }

  /** @return {!Uint8Array} */
  static spliceNull() {
    return shaka.test.Scte35.tsSection(0x00, []);
  }

  /**
   * Returns a copy of an MPEG-2 TS segment whose PMT also lists a SCTE-35 PID
   * (stream_type 0x86), carrying the given sections right after the
   * first PMT.
   *
   * The segment's PMT must fit in one packet with a stuffing adaptation field
   * of at least 5 bytes, as in test/test/assets/video.ts.
   *
   * @param {!BufferSource} segment
   * @param {number} pid
   * @param {!Array<!Uint8Array>} sections Each one starts a TS packet.
   * @return {!Uint8Array}
   */
  static addToTs(segment, pid, sections) {
    const data = shaka.util.BufferUtils.toUint8(segment);
    const packets = [];
    let inserted = false;
    for (let start = 0; start < data.length; start += 188) {
      const packet = data.slice(start, start + 188);
      packets.push(packet);
      const packetPid = ((packet[1] & 0x1f) << 8) | packet[2];
      if (packetPid != 0x20) {
        continue;
      }
      // Shorten the adaptation field by the 5 bytes of the new ES entry, and
      // move the PMT section up.
      goog.asserts.assert(packet[3] & 0x20, 'PMT must have adaptation field');
      const sectionStart = 5 + packet[4] + 1;
      const oldSection = packet.slice(sectionStart);
      const oldLength = 3 + (((oldSection[1] & 0x0f) << 8) | oldSection[2]);
      const pmt = new Uint8Array(oldLength + 5);
      pmt.set(oldSection.subarray(0, oldLength - 4));
      pmt.set([0x86, 0xe0 | (pid >> 8), pid & 0xff, 0xf0, 0x00],
          oldLength - 4);
      const sectionLength = pmt.length - 3;
      pmt[1] = (pmt[1] & 0xf0) | (sectionLength >> 8);
      pmt[2] = sectionLength & 0xff;
      shaka.util.BufferUtils.toDataView(pmt).setUint32(pmt.length - 4,
          shaka.test.Scte35.crc32_(pmt.subarray(0, pmt.length - 4)));
      packet[4] -= 5;
      // Keep the adaptation field flags, stuffing the rest.
      packet.fill(0xff, 6, 5 + packet[4]);
      // pointer_field
      packet[5 + packet[4]] = 0;
      packet.set(pmt, 5 + packet[4] + 1);

      if (inserted) {
        continue;
      }
      inserted = true;
      let continuityCounter = 0;
      for (const section of sections) {
        for (let offset = 0; offset == 0 || offset < section.length;) {
          const scte35 = new Uint8Array(188).fill(0xff);
          const payloadStart = offset == 0;
          scte35.set([
            0x47, (payloadStart ? 0x40 : 0) | (pid >> 8), pid & 0xff,
            0x10 | (continuityCounter++ & 0x0f),
          ]);
          let position = 4;
          if (payloadStart) {
            // pointer_field
            scte35[position++] = 0;
          }
          const chunk = section.subarray(offset, offset + 188 - position);
          scte35.set(chunk, position);
          offset += chunk.length;
          packets.push(scte35);
        }
      }
    }
    return shaka.util.Uint8ArrayUtils.concat(...packets);
  }

  /**
   * @param {number} ptsTime
   * @return {!Array<number>} A splice_time() with time_specified_flag set.
   * @private
   */
  static spliceTime_(ptsTime) {
    const low = ptsTime % 0x100000000;
    return [
      0xfe | Math.floor(ptsTime / 0x100000000),
      (low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff,
    ];
  }

  /**
   * @param {!Uint8Array} data
   * @return {number} The MPEG-2 CRC-32.
   * @private
   */
  static crc32_(data) {
    let crc = 0xffffffff;
    for (const byte of data) {
      crc ^= byte << 24;
      for (let bit = 0; bit < 8; bit++) {
        crc = (crc & 0x80000000) ? (crc << 1) ^ 0x04c11db7 : crc << 1;
      }
    }
    return crc >>> 0;
  }
};


/**
 * @typedef {{
 *   ptsAdjustment: (number|undefined),
 *   encrypted: (boolean|undefined),
 *   descriptors: (!Array<number>|undefined),
 *   eventId: (number|undefined),
 * }}
 *
 * @property {(number|undefined)} ptsAdjustment
 *   In 90 kHz units.  0 by default.
 * @property {(boolean|undefined)} encrypted
 *   Sets encrypted_packet.
 * @property {(!Array<number>|undefined)} descriptors
 *   The splice_descriptor() loop bytes.
 * @property {(number|undefined)} eventId
 *   The splice_event_id of a splice_insert.  1 by default.
 */
shaka.test.Scte35.TsSectionOptions;
