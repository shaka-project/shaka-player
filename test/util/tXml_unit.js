/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('tXml', () => {
  // A number that cannot be represented as a Javascript number.
  const HUGE_NUMBER_STRING = new Array(500).join('7');

  const TXml = shaka.util.TXml;

  beforeAll(() => {
    TXml.setKnownNameSpace('urn:scte:scte35:2014:xml+bin', 'scte35');
  });

  describe('findChild', () => {
    it('finds a child node', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  <Child></Child>',
        '</Root>',
      ].join('\n');
      const root = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(root, 'parseFromString should succeed');

      expect(TXml.findChild(root, 'Child')).toBeTruthy();
      expect(TXml.findChild(root, 'DoesNotExist')).toBeNull();
    });

    it('handles duplicate child nodes', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  <Child></Child>',
        '  <Child></Child>',
        '</Root>',
      ].join('\n');
      const root = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(root, 'parseFromString should succeed');

      expect(TXml.findChild(root, 'Child')).toBeNull();
    });
  });

  it('findChildren', () => {
    const xmlString = [
      '<?xml version="1.0"?>',
      '<Root>',
      '  <Child></Child>',
      '  <Child></Child>',
      '</Root>',
    ].join('\n');
    const root = TXml.parseXmlString(xmlString, 'Root');
    goog.asserts.assert(root, 'parseFromString should succeed');

    expect(root).toBeTruthy();

    let children = TXml.findChildren(root, 'Child');
    expect(children.length).toBe(2);

    children = TXml.findChildren(root, 'DoesNotExist');
    expect(children.length).toBe(0);
  });

  describe('getContents', () => {
    it('returns node contents', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  foo bar',
        '</Root>',
      ].join('\n');
      const root = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(root, 'parseFromString should succeed');

      expect(TXml.getContents(root)).toBe('foo bar');
    });

    it('handles empty node contents', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '</Root>',
      ].join('\n');
      const root = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(root, 'parseFromString should succeed');

      expect(TXml.getContents(root)).toBeNull();
    });

    it('handles null node contents', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '</Root>',
      ].join('\n');
      const xml = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(xml, 'parseFromString should succeed');

      expect(TXml.getContents(xml)).toBeNull();
    });

    it('handles CDATA sections', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '<![CDATA[<Foo> Bar]]>',
        '</Root>',
      ].join('\n');
      const root = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(root, 'parseFromString should succeed');

      expect(TXml.getContents(root)).toBe('<Foo> Bar');
    });

    it('unescapes html codes', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  &amp;&gt;&lt;',
        '</Root>',
      ].join('\n');
      const root = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(root, 'parseFromString should succeed');

      expect(TXml.getContents(root)).toBe('&><');
    });
  });

  describe('getTextContents', () => {
    it('unescapes html codes', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  &amp;&gt;&lt;',
        '</Root>',
      ].join('\n');
      const root = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(root, 'parseFromString should succeed');

      expect(TXml.getTextContents(root)).toBe('\n  &><\n');
    });
  });

  describe('parseAttr', () => {
    /** @type {!shaka.extern.xml.Node} */
    let xml;

    beforeEach(() => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root a="2-7" b="-5" c="">',
        '</Root>',
      ].join('\n');
      xml = /** @type {!shaka.extern.xml.Node} */ (
        TXml.parseXmlString(xmlString, 'Root'));
    });

    it('delegates to parser function', () => {
      const root = xml;
      expect(TXml.parseAttr(root, 'a', TXml.parseRange)).toEqual(
          {start: 2, end: 7});
      expect(TXml.parseAttr(root, 'b', TXml.parseInt)).toBe(-5);
      expect(TXml.parseAttr(root, 'c', TXml.parseInt)).toBe(0);
      expect(TXml.parseAttr(root, 'd', TXml.parseInt)).toBeNull();
    });

    it('supports default values', () => {
      const root = xml;
      goog.asserts.assert(root, 'findChild should find element');
      expect(TXml.parseAttr(root, 'd', TXml.parseInt, 9)).toBe(9);
    });
  });

  describe('parseXmlString', () => {
    it('parses a simple XML document', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  <Child></Child>',
        '</Root>',
      ].join('\n');
      const root = TXml.parseXmlString(xmlString, 'Root');
      goog.asserts.assert(root, 'parseFromString should succeed');

      expect(root.tagName).toBe('Root');
    });

    it('returns null on an empty XML document', () => {
      const xmlString = '';
      const doc = TXml.parseXmlString(xmlString, 'Root');
      expect(doc).toBeNull();
    });

    it('returns null on root element mismatch', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  <Child></Child>',
        '</Root>',
      ].join('\n');
      const doc = TXml.parseXmlString(xmlString, 'Document');
      expect(doc).toBeNull();
    });
  });

  it('parseDate', () => {
    // Should be parsed as UTC independent of local timezone.
    expect(TXml.parseDate('2015-11-30T12:46:33')).toBe(1448887593);
    // Should be parsed using the given timezone, not the local timezone.
    expect(TXml.parseDate('2015-11-30T12:46:33+06:00')).toBe(1448865993);

    expect(TXml.parseDate('November 30, 2015')).toBeTruthy();
    expect(TXml.parseDate('Apple')).toBeNull();
    expect(TXml.parseDate('')).toBeNull();
  });

  it('parseDuration', () => {
    // No time.
    expect(TXml.parseDuration('P')).toBe(0);
    expect(TXml.parseDuration('PT')).toBe(0);

    // Years only. 1 year has 365 or 366 days.
    expect(TXml.parseDuration('P3Y')).toBeLessThan(
        3 * (60 * 60 * 24 * 366) + 1);
    expect(TXml.parseDuration('P3Y')).toBeGreaterThan(
        3 * (60 * 60 * 24 * 365) - 1);

    // Months only. 1 month has 28 to 31 days.
    expect(TXml.parseDuration('P2M')).toBeLessThan(
        2 * (60 * 60 * 24 * 31) + 1);
    expect(TXml.parseDuration('P2M')).toBeGreaterThan(
        2 * (60 * 60 * 24 * 28) - 1);

    // Days only.
    expect(TXml.parseDuration('P7D')).toBe(604800);

    // Hours only.
    expect(TXml.parseDuration('PT1H')).toBe(3600);

    // Minutes only.
    expect(TXml.parseDuration('PT1M')).toBe(60);

    // Seconds only (with no fractional part).
    expect(TXml.parseDuration('PT1S')).toBe(1);

    // Seconds only (with no whole part).
    expect(TXml.parseDuration('PT0.1S')).toBe(0.1);
    expect(TXml.parseDuration('PT.1S')).toBe(0.1);

    // Seconds only (with whole part and fractional part).
    expect(TXml.parseDuration('PT1.1S')).toBe(1.1);

    // Hours, and minutes.
    expect(TXml.parseDuration('PT1H2M')).toBe(3720);

    // Hours, and seconds.
    expect(TXml.parseDuration('PT1H2S')).toBe(3602);
    expect(TXml.parseDuration('PT1H2.2S')).toBe(3602.2);

    // Minutes, and seconds.
    expect(TXml.parseDuration('PT1M2S')).toBe(62);
    expect(TXml.parseDuration('PT1M2.2S')).toBe(62.2);

    // Hours, minutes, and seconds.
    expect(TXml.parseDuration('PT1H2M3S')).toBe(3723);
    expect(TXml.parseDuration('PT1H2M3.3S')).toBe(3723.3);

    // Days, hours, minutes, and seconds.
    expect(TXml.parseDuration('P1DT1H2M3S')).toBe(90123);
    expect(TXml.parseDuration('P1DT1H2M3.3S')).toBe(90123.3);

    // Months, hours, minutes, and seconds.
    expect(TXml.parseDuration('P1M1DT1H2M3S')).toBeLessThan(
        (60 * 60 * 24 * 31) + 90123 + 1);
    expect(TXml.parseDuration('P1M1DT1H2M3S')).toBeGreaterThan(
        (60 * 60 * 24 * 28) + 90123 - 1);

    // Years, Months, hours, minutes, and seconds.
    expect(TXml.parseDuration('P1Y1M1DT1H2M3S')).toBeLessThan(
        (60 * 60 * 24 * 366) + (60 * 60 * 24 * 31) + 90123 + 1);
    expect(TXml.parseDuration('P1Y1M1DT1H2M3S')).toBeGreaterThan(
        (60 * 60 * 24 * 365) + (60 * 60 * 24 * 28) + 90123 - 1);

    // Supports case insensitive
    expect(TXml.parseDuration('p1y1m1dt1h2m3s')).toBeLessThan(
        (60 * 60 * 24 * 366) + (60 * 60 * 24 * 31) + 90123 + 1);
    expect(TXml.parseDuration('p1y1m1dt1h2m3s')).toBeGreaterThan(
        (60 * 60 * 24 * 365) + (60 * 60 * 24 * 28) + 90123 - 1);

    expect(TXml.parseDuration('PT')).toBe(0);
    expect(TXml.parseDuration('P')).toBe(0);

    // Error cases.
    expect(TXml.parseDuration('-PT3S')).toBeNull();
    expect(TXml.parseDuration('PT-3S')).toBeNull();
    // cspell: disable-next-line
    expect(TXml.parseDuration('P1Sasdf')).toBeNull();
    expect(TXml.parseDuration('1H2M3S')).toBeNull();
    expect(TXml.parseDuration('123')).toBeNull();
    expect(TXml.parseDuration('abc')).toBeNull();
    expect(TXml.parseDuration('')).toBeNull();

    expect(TXml.parseDuration('P' + HUGE_NUMBER_STRING + 'Y')).toBeNull();
    expect(TXml.parseDuration('P' + HUGE_NUMBER_STRING + 'M')).toBeNull();
    expect(TXml.parseDuration('P' + HUGE_NUMBER_STRING + 'D')).toBeNull();
    expect(TXml.parseDuration('PT' + HUGE_NUMBER_STRING + 'H')).toBeNull();
    expect(TXml.parseDuration('PT' + HUGE_NUMBER_STRING + 'M')).toBeNull();
    expect(TXml.parseDuration('PT' + HUGE_NUMBER_STRING + 'S')).toBeNull();
  });

  it('parseRange', () => {
    expect(TXml.parseRange('0-0')).toEqual({start: 0, end: 0});
    expect(TXml.parseRange('1-1')).toEqual({start: 1, end: 1});
    expect(TXml.parseRange('1-50')).toEqual({start: 1, end: 50});
    expect(TXml.parseRange('50-1')).toEqual({start: 50, end: 1});

    expect(TXml.parseRange('-1')).toBeNull();
    expect(TXml.parseRange('1-')).toBeNull();
    expect(TXml.parseRange('1')).toBeNull();
    expect(TXml.parseRange('-')).toBeNull();
    expect(TXml.parseRange('')).toBeNull();

    expect(TXml.parseRange('abc')).toBeNull();
    expect(TXml.parseRange('a-')).toBeNull();
    expect(TXml.parseRange('-b')).toBeNull();
    expect(TXml.parseRange('a-b')).toBeNull();

    expect(TXml.parseRange(HUGE_NUMBER_STRING + '-1')).toBeNull();
    expect(TXml.parseRange('1-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseInt', () => {
    expect(TXml.parseInt('0')).toBe(0);
    expect(TXml.parseInt('1')).toBe(1);
    expect(TXml.parseInt('191')).toBe(191);

    expect(TXml.parseInt('-0')).toBe(0);
    expect(TXml.parseInt('-1')).toBe(-1);
    expect(TXml.parseInt('-191')).toBe(-191);

    expect(TXml.parseInt('abc')).toBeNull();
    expect(TXml.parseInt('1abc')).toBeNull();
    expect(TXml.parseInt('abc1')).toBeNull();

    expect(TXml.parseInt('0.0')).toBe(0);
    expect(TXml.parseInt('-0.0')).toBe(0);

    expect(TXml.parseInt('0.1')).toBeNull();
    expect(TXml.parseInt('1.1')).toBeNull();

    expect(TXml.parseInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(TXml.parseInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parsePositiveInt', () => {
    expect(TXml.parsePositiveInt('0')).toBeNull();
    expect(TXml.parsePositiveInt('1')).toBe(1);
    expect(TXml.parsePositiveInt('191')).toBe(191);

    expect(TXml.parsePositiveInt('-0')).toBeNull();
    expect(TXml.parsePositiveInt('-1')).toBeNull();
    expect(TXml.parsePositiveInt('-191')).toBeNull();

    expect(TXml.parsePositiveInt('abc')).toBeNull();
    expect(TXml.parsePositiveInt('1abc')).toBeNull();
    expect(TXml.parsePositiveInt('abc1')).toBeNull();

    expect(TXml.parsePositiveInt('0.0')).toBeNull();
    expect(TXml.parsePositiveInt('-0.0')).toBeNull();

    expect(TXml.parsePositiveInt('0.1')).toBeNull();
    expect(TXml.parsePositiveInt('1.1')).toBeNull();

    expect(TXml.parsePositiveInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(TXml.parsePositiveInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseNonNegativeInt', () => {
    expect(TXml.parseNonNegativeInt('0')).toBe(0);
    expect(TXml.parseNonNegativeInt('1')).toBe(1);
    expect(TXml.parseNonNegativeInt('191')).toBe(191);

    expect(TXml.parseNonNegativeInt('-0')).toBe(0);
    expect(TXml.parseNonNegativeInt('-1')).toBeNull();
    expect(TXml.parseNonNegativeInt('-191')).toBeNull();

    expect(TXml.parseNonNegativeInt('abc')).toBeNull();
    expect(TXml.parseNonNegativeInt('1abc')).toBeNull();
    expect(TXml.parseNonNegativeInt('abc1')).toBeNull();

    expect(TXml.parseNonNegativeInt('0.0')).toBe(0);
    expect(TXml.parseNonNegativeInt('-0.0')).toBe(0);

    expect(TXml.parseNonNegativeInt('0.1')).toBeNull();
    expect(TXml.parseNonNegativeInt('1.1')).toBeNull();

    expect(TXml.parseNonNegativeInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(TXml.parseNonNegativeInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseFloat', () => {
    expect(TXml.parseFloat('0')).toBe(0);
    expect(TXml.parseFloat('1')).toBe(1);
    expect(TXml.parseFloat('191')).toBe(191);

    expect(TXml.parseFloat('-0')).toBe(0);
    expect(TXml.parseFloat('-1')).toBe(-1);
    expect(TXml.parseFloat('-191')).toBe(-191);

    expect(TXml.parseFloat('abc')).toBeNull();
    expect(TXml.parseFloat('1abc')).toBeNull();
    expect(TXml.parseFloat('abc1')).toBeNull();

    expect(TXml.parseFloat('0.0')).toBe(0);
    expect(TXml.parseFloat('-0.0')).toBe(0);

    expect(TXml.parseFloat('0.1')).toBeCloseTo(0.1);
    expect(TXml.parseFloat('1.1')).toBeCloseTo(1.1);

    expect(TXml.parseFloat('19.1134')).toBeCloseTo(19.1134);
    expect(TXml.parseFloat('4e2')).toBeCloseTo(4e2);
    expect(TXml.parseFloat('4e-2')).toBeCloseTo(4e-2);

    expect(TXml.parseFloat(HUGE_NUMBER_STRING)).toBe(Infinity);
    expect(TXml.parseFloat('-' + HUGE_NUMBER_STRING)).toBe(-Infinity);
  });

  it('parseXpath', () => {
    expect(TXml.parseXpath('/MPD'))
        .toEqual([{name: 'MPD', id: null, position: null,
          t: null, n: null, attribute: null}]);
    expect(TXml.parseXpath('/MPD/@type'))
        .toEqual([{name: 'MPD', id: null, position: null,
          t: null, n: null, attribute: 'type'}]);

    const timelinePath = '/' + [
      'MPD',
      'Period[@id=\'6469\']',
      'AdaptationSet[@id=\'7\']',
      'SegmentTemplate',
      'SegmentTimeline',
      'S[2]',
    ].join('/');
    expect(TXml.parseXpath(timelinePath)).toEqual([
      {name: 'MPD', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'Period', id: '6469', position: null,
        t: null, n: null, attribute: null},
      {name: 'AdaptationSet', id: '7', position: null,
        t: null, n: null, attribute: null},
      {name: 'SegmentTemplate', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'SegmentTimeline', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'S', id: null, position: 1,
        t: null, n: null, attribute: null},
    ]);
    const timelinePath2 = '/' + [
      'MPD',
      'Period[@id=\'6469\']',
      'AdaptationSet[@id=\'7\']',
      'SegmentTemplate',
      'SegmentTimeline',
      'S[@t=&#39;12345678&#39;]',
    ].join('/');
    expect(TXml.parseXpath(timelinePath2)).toEqual([
      {name: 'MPD', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'Period', id: '6469', position: null,
        t: null, n: null, attribute: null},
      {name: 'AdaptationSet', id: '7', position: null,
        t: null, n: null, attribute: null},
      {name: 'SegmentTemplate', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'SegmentTimeline', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'S', id: null, position: null,
        t: 12345678, n: null, attribute: null},
    ]);
    const timelinePath3 = '/' + [
      'MPD',
      'Period[@id=\'6469\']',
      'AdaptationSet[1]',
      'SegmentTemplate',
      'SegmentTimeline',
      'S[@t=&#39;12345678&#39;]',
    ].join('/');
    expect(TXml.parseXpath(timelinePath3)).toEqual([
      {name: 'MPD', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'Period', id: '6469', position: null,
        t: null, n: null, attribute: null},
      {name: 'AdaptationSet', id: null, position: 0,
        t: null, n: null, attribute: null},
      {name: 'SegmentTemplate', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'SegmentTimeline', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'S', id: null, position: null,
        t: 12345678, n: null, attribute: null},
    ]);

    const timelinePath4 = '/' + [
      'MPD',
      'Period[@id=\'6469\']',
      'AdaptationSet[1]',
      'SegmentTemplate',
      'SegmentTimeline',
      'S[@n=&#39;42&#39;]',
    ].join('/');
    expect(TXml.parseXpath(timelinePath4)).toEqual([
      {name: 'MPD', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'Period', id: '6469', position: null,
        t: null, n: null, attribute: null},
      {name: 'AdaptationSet', id: null, position: 0,
        t: null, n: null, attribute: null},
      {name: 'SegmentTemplate', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'SegmentTimeline', id: null, position: null,
        t: null, n: null, attribute: null},
      {name: 'S', id: null, position: null,
        t: null, n: 42, attribute: null},
    ]);
  });

  it('txmlNodeToDomElement', () => {
    const node = {
      tagName: 'Event',
      parent: null,
      attributes: {
        'presentationTime': '0',
      },
      children: [
        {
          tagName: 'scte35:Signal',
          parent: null,
          attributes: {},
          children: [],
        },
      ],
    };
    node.children[0].parent = node;

    const element = TXml.txmlNodeToDomElement(node);
    expect(element.tagName).toBe('Event');
    expect(element.getAttribute('presentationTime')).toBe('0');
    const signal = element.firstElementChild;
    expect(signal.tagName).toBe('scte35:Signal');
  });

  it('cloneNode', () => {
    expect(TXml.cloneNode(null)).toBe(null);
    const root = {
      tagName: 'Parent',
      attributes: {},
      children: [],
      parent: null,
    };
    const node = {
      tagName: 'Test',
      attributes: {
        'attr1': 'val1',
        'attr2': 'val2',
      },
      children: ['string_child'],
      parent: root,
    };
    const child = {
      tagName: 'child',
      attributes: {},
      children: [],
      parent: node,
    };
    root.children.push(node);
    node.children.push(child);

    const clone = TXml.cloneNode(node);
    expect(clone).not.toBe(node);
    expect(clone.tagName).toBe(node.tagName);
    expect(clone.attributes).not.toBe(node.attributes);
    expect(clone.attributes).toEqual(node.attributes);
    expect(clone.parent).toBe(null);
    expect(clone.children[0]).toBe('string_child');
    expect(clone.children[1]).not.toBe(child);
    expect(clone.children[1].tagName).toBe(child.tagName);
    expect(clone.children[1].parent).toBe(clone);
  });
});
