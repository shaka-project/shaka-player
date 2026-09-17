/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
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
};
