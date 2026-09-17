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

  it('places a DASH region on the timeline and decodes its Binary', () => {
    const event = Scte35.fromRegion(Fixtures.region());
    expect(event).toEqual(jasmine.objectContaining({
      schemeIdUri: 'urn:scte:scte35:2014:xml+bin',
      startTime: 10,
      endTime: 70,
      id: '1',
      source: 'dash',
      kind: '',
      node: null,
    }));
    expect(event.data).toEqual(Fixtures.section());
  });

  it('extracts Binary regardless of namespace prefix or nesting', () => {
    const base64 = Fixtures.base64();
    for (const xml of [
      '<Signal><Binary>' + base64 + '</Binary></Signal>',
      '<scte35:Signal><scte35:Binary>' + base64 +
          '</scte35:Binary></scte35:Signal>',
      '<Binary>' + base64 + '</Binary>',
      '<a:Signal><a:Wrapper><a:Binary>' + base64 +
          '</a:Binary></a:Wrapper></a:Signal>',
    ]) {
      const event = Scte35.fromRegion(Fixtures.region(xml));
      expect(event.data).toEqual(Fixtures.section());
      expect(event.node).toBeNull();
    }
  });

  it('keeps XML-only messages as a node, without binary data', () => {
    const xml = '<SpliceInfoSection ptsAdjustment="0"><TimeSignal>' +
        '<SpliceTime ptsTime="900000"/></TimeSignal></SpliceInfoSection>';
    const event = Scte35.fromRegion(
        Fixtures.region(xml, 'urn:scte:scte35:2013:xml'));
    expect(event.data).toBeNull();
    expect(event.node.tagName).toBe('Event');
  });

  it('falls back to the node when Binary is not valid base64', () => {
    for (const text of ['', 'not base64!', 'YWJ']) {
      const event = Scte35.fromRegion(
          Fixtures.region('<Signal><Binary>' + text + '</Binary></Signal>'));
      expect(event.data).toBeNull();
      expect(event.node).not.toBeNull();
    }
  });

  it('passes binary emsg payloads through untouched', () => {
    const event = Scte35.fromEmsg(Fixtures.emsg());
    expect(event).toEqual(jasmine.objectContaining({
      schemeIdUri: 'urn:scte:scte35:2013:bin',
      startTime: 10,
      endTime: 70,
      id: '1',
      source: 'emsg',
      kind: '',
      node: null,
    }));
    expect(event.data).toEqual(Fixtures.section());
  });

  it('decodes Binary from an XML emsg payload', () => {
    const emsg = Fixtures.emsg(shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(
            '<Signal><Binary>' + Fixtures.base64() +
            '</Binary></Signal>')));
    emsg.schemeIdUri = 'urn:scte:scte35:2014:xml+bin';
    const event = Scte35.fromEmsg(emsg);
    expect(event.data).toEqual(Fixtures.section());
  });

  it('treats an unknown emsg duration as a point in time', () => {
    const emsg = Fixtures.emsg();
    emsg.eventDuration = 0xffffffff;
    expect(Scte35.fromEmsg(emsg).endTime).toBe(10);
  });

  it('survives a malformed emsg payload without throwing', () => {
    const emsg = Fixtures.emsg(new Uint8Array([0x3c, 0x21, 0x00]));
    emsg.schemeIdUri = 'urn:scte:scte35:2014:xml+bin';
    const event = Scte35.fromEmsg(emsg);
    expect(event).not.toBeNull();
    expect(event.data).toBeNull();
  });

  it('decodes hexadecimal HLS payloads and rejects malformed ones', () => {
    expect(Scte35.fromHex(Fixtures.hex())).toEqual(Fixtures.section());
    expect(Scte35.fromHex('0XAB')).toEqual(new Uint8Array([0xab]));
    for (const text of [null, '', '0x', 'abab', '0xabc', '0xzz']) {
      expect(Scte35.fromHex(text)).toBeNull();
    }
  });
});
