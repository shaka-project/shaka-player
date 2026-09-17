/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** SCTE-35 sections with valid MPEG CRCs and their equivalent XML. */
shaka.test.Scte35 = class {
  /** @return {!Uint8Array} */
  static insert() {
    return shaka.util.Uint8ArrayUtils.fromHex(
        'fc30250001ffffffff00fff01405000004d27feffffffffffefe005265c0' +
        '0001010100001a63a8ea');
  }

  /** @return {!Uint8Array} */
  static signal() {
    return shaka.util.Uint8ArrayUtils.fromHex(
        'fc302c00000000000000fff00506fe000dbba0001602144355454900000001' +
        '7fff00005265c00000300101a3d61725');
  }

  /** @return {string} */
  static insertXml() {
    return '<s:SpliceInfoSection ptsAdjustment="8589934591">' +
        '<s:SpliceInsert spliceEventId="1234" outOfNetworkIndicator="true" ' +
        'uniqueProgramId="1" availNum="1" availsExpected="1">' +
        '<s:Program><s:SpliceTime ptsTime="8589934590"/></s:Program>' +
        '<s:BreakDuration autoReturn="true" duration="5400000"/>' +
        '</s:SpliceInsert></s:SpliceInfoSection>';
  }

  /** @return {string} */
  static signalXml() {
    return '<SpliceInfoSection ptsAdjustment="0">' +
        '<TimeSignal><SpliceTime ptsTime="900000"/></TimeSignal>' +
        '<SegmentationDescriptor segmentationEventId="1" ' +
        'segmentationDuration="5400000" segmentationTypeId="48" ' +
        'segmentNum="1" segmentsExpected="1">' +
        '<SegmentationUpid type="0"/>' +
        '</SegmentationDescriptor></SpliceInfoSection>';
  }

  /**
   * @param {string=} xml
   * @param {string=} scheme
   * @return {shaka.extern.TimelineRegionInfo}
   */
  static region(xml = shaka.test.Scte35.insertXml(),
      scheme = 'urn:scte:scte35:2013:xml') {
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
  static emsg(data = shaka.test.Scte35.insert()) {
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
    const data = shaka.test.Scte35.insert();
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
