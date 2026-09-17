/*! @license
 * Shaka Player
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Scte35', () => {
  const Scte35 = shaka.util.Scte35;
  const Fixtures = shaka.test.Scte35;

  it('recognizes only supported schemes, including the compatibility alias',
      () => {
        for (const scheme of [
          'urn:scte:scte35:2013:xml', 'urn:scte:scte35:2014:xml+bin',
          'urn:scte:scte35:2013:xml+bin', 'urn:scte:scte35:2013:bin',
        ]) {
          expect(Scte35.isScheme(' ' + scheme + ' ')).toBe(true);
        }
        expect(Scte35.isScheme('urn:example:scte35')).toBe(false);
        expect(Scte35.fromRegion(
            Fixtures.region('', 'urn:example'))).toBeNull();
        const emsg = Fixtures.emsg();
        emsg.schemeIdUri = 'urn:example';
        expect(Scte35.fromEmsg(emsg)).toBeNull();
      });

  it('normalizes XML and binary splice inserts identically', () => {
    const xml = Scte35.fromRegion(Fixtures.region());
    const binary = Scte35.fromEmsg(Fixtures.emsg());
    expect(xml.status).toBe('parsed');
    expect(binary.status).toBe('parsed');
    expect(xml.command).toEqual(binary.command);
    expect(binary.ptsAdjustment).toBe(8589934591);
    expect(binary.command.ptsTime).toBe(8589934590);
    expect(binary.command.breakDuration).toBe(5400000);
    expect(binary.startTime).toBe(10);
    expect(binary.duration).toBe(60);
  });

  it('normalizes XML and binary time signals and segmentation descriptors',
      () => {
        const xml = Scte35.fromRegion(Fixtures.region(Fixtures.signalXml()));
        const binary = Scte35.fromEmsg(Fixtures.emsg(Fixtures.signal()));
        expect(binary.status).toBe('parsed');
        expect(xml.status).toBe('parsed');
        expect(xml.command).toEqual(binary.command);
        expect(xml.segmentationDescriptors).toEqual(
            binary.segmentationDescriptors);
        expect(binary.segmentationDescriptors[0]).toEqual(
            jasmine.objectContaining({
              segmentationEventId: 1, duration: 5400000, typeId: 48,
              upidType: 0, upid: '', segmentNum: 1, segmentsExpected: 1,
            }));
      });

  it('extracts base64 from Signal/Binary with arbitrary namespace prefixes',
      () => {
        const base64 = shaka.util.Uint8ArrayUtils.toStandardBase64(
            Fixtures.insert());
        for (const scheme of [
          'urn:scte:scte35:2014:xml+bin', 'urn:scte:scte35:2013:xml+bin',
        ]) {
          const xml = '<p:Signal><p:Binary>\n' + base64 +
              '\n</p:Binary></p:Signal>';
          const event = Scte35.fromRegion(Fixtures.region(xml, scheme));
          expect(event.status).toBe('parsed');
          expect(event.data).toEqual(Fixtures.insert());
          expect(event.xml).toBeTruthy();
          expect(event.origins[0].schemeIdUri).toBe(scheme);
        }
      });

  it('supports XML carried by emsg', () => {
    const emsg = Fixtures.emsg(shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(Fixtures.insertXml())));
    emsg.schemeIdUri = 'urn:scte:scte35:2013:xml';
    expect(Scte35.fromEmsg(emsg).command).toEqual(
        Scte35.fromRegion(Fixtures.region()).command);
  });

  it('normalizes XML UPID encodings and MPU format identifiers', () => {
    for (const [format, value] of [
      ['text', 'AB'], ['base-64', 'QUI='], ['hexBinary', '41 42'],
    ]) {
      const xml = Fixtures.signalXml().replace('<SegmentationUpid type="0"/>',
          '<SegmentationUpid segmentationUpidType="12" ' +
          'segmentationUpidFormat="' + format + '" ' +
          'formatIdentifier="1094861636">' + value + '</SegmentationUpid>');
      const event = Scte35.fromRegion(Fixtures.region(xml));
      expect(event.status).toBe('parsed');
      expect(event.segmentationDescriptors[0].upidType).toBe(12);
      expect(event.segmentationDescriptors[0].upid).toBe('414243444142');
    }
  });

  it('normalizes multiple XML UPIDs into MID bytes', () => {
    const xml = Fixtures.signalXml().replace('<SegmentationUpid type="0"/>',
        '<SegmentationUpid segmentationUpidType="15" ' +
        'segmentationUpidFormat="text">AB</SegmentationUpid>' +
        '<SegmentationUpid segmentationUpidType="8" ' +
        'segmentationUpidFormat="hexBinary">0102</SegmentationUpid>');
    const event = Scte35.fromRegion(Fixtures.region(xml));
    expect(event.status).toBe('parsed');
    expect(event.segmentationDescriptors[0].upidType).toBe(13);
    expect(event.segmentationDescriptors[0].upid).toBe('0f02414208020102');
  });

  it('preserves cancellation commands', () => {
    const event = parse('fc301600000000000000fff00505000004d2ff0000758a3290');
    expect(event.status).toBe('parsed');
    expect(event.command.cancel).toBe(true);
    expect(event.command.spliceEventId).toBe(1234);
    expect(event.command.ptsTime).toBeNull();
  });

  it('accepts the standard placement opportunity example without subsegments',
      () => {
        // SCTE 35 2023r1, section 14.1. The optional appendix is absent.
        const event = parse(
            'fc3034000000000000fffff00506fe72bd0050001e021c43554549' +
            '4800008e7fcf0001a599b00808000000002ca0a18a3402009ac9d17e');
        expect(event.status).toBe('parsed');
        const descriptor = event.segmentationDescriptors[0];
        expect(descriptor.typeId).toBe(0x34);
        expect(descriptor.duration).toBe(27630000);
        expect(descriptor.webDeliveryAllowed).toBe(false);
        expect(descriptor.subSegmentNum).toBeNull();
        expect(descriptor.upid).toBe('000000002ca0a18a');
      });

  it('supports unspecified command lengths for known commands', () => {
    const event = parse('fc301600000000000000ffffff06fe000dbba00000d0dbc8a4');
    expect(event.status).toBe('parsed');
    expect(event.command.ptsTime).toBe(900000);
  });

  it('retains unsupported and encrypted messages', () => {
    for (const hex of [
      'fc301300000000000000fff002ff010200006f385080',
      'fc301600800000000000fff00506fe000dbba000006e4848f8',
    ]) {
      const event = parse(hex);
      expect(event.status).toBe('unsupported');
      goog.asserts.assert(event.data, 'Data should be retained');
      expect(shaka.util.Uint8ArrayUtils.toHex(event.data)).toBe(hex);
    }
  });

  it('retains malformed messages without throwing', () => {
    const truncated = Fixtures.insert().slice(0, 12);
    const badCrc = Fixtures.insert();
    badCrc[badCrc.length - 1] ^= 1;
    for (const data of [truncated, badCrc]) {
      const event = Scte35.fromEmsg(Fixtures.emsg(data));
      expect(event.status).toBe('invalid');
      expect(shaka.util.BufferUtils.equal(event.data, data)).toBe(true);
    }
    expect(parse('fc301600000000000000fff00406fe000dbba000005e9b877f')
        .status).toBe('invalid');
    const event = Scte35.fromRegion(Fixtures.region(
        '<Signal><Binary>%%% !</Binary></Signal>'));
    expect(event.status).toBe('invalid');
    expect(event.rawData).toBe('%%%!');
    expect(event.xml).toBeTruthy();
  });

  it('does not retain the original segment buffer', () => {
    const data = Fixtures.insert();
    const event = Scte35.fromEmsg(Fixtures.emsg(data));
    data.fill(0);
    expect(event.data).toEqual(Fixtures.insert());
  });

  it('preserves unknown emsg duration',
      () => {
        const emsg = Fixtures.emsg();
        emsg.eventDuration = 0xffffffff;
        expect(Scte35.fromEmsg(emsg).duration).toBeNull();
      });

  /**
   * @param {string} hex
   * @return {?shaka.extern.Scte35Event}
   */
  function parse(hex) {
    return Scte35.fromEmsg(Fixtures.emsg(
        shaka.util.Uint8ArrayUtils.fromHex(hex)));
  }
});
