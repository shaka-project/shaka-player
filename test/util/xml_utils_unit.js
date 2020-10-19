/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('goog.asserts');
goog.require('shaka.util.XmlUtils');


describe('XmlUtils', () => {
  // A number that cannot be represented as a Javascript number.
  const HUGE_NUMBER_STRING = new Array(500).join('7');

  const XmlUtils = shaka.util.XmlUtils;

  describe('findChild', () => {
    it('finds a child node', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  <Child></Child>',
        '</Root>',
      ].join('\n');
      const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
      goog.asserts.assert(xml, 'parseFromString should succeed');

      const root = XmlUtils.findChild(xml, 'Root');
      goog.asserts.assert(root, 'findChild should find element');

      expect(XmlUtils.findChild(root, 'Child')).toBeTruthy();
      expect(XmlUtils.findChild(root, 'DoesNotExist')).toBeNull();
    });

    it('handles duplicate child nodes', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  <Child></Child>',
        '  <Child></Child>',
        '</Root>',
      ].join('\n');
      const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
      goog.asserts.assert(xml, 'parseFromString should succeed');

      const root = XmlUtils.findChild(xml, 'Root');
      goog.asserts.assert(root, 'findChild should find element');

      expect(XmlUtils.findChild(root, 'Child')).toBeNull();
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
    const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
    goog.asserts.assert(xml, 'parseFromString should succeed');

    const roots = XmlUtils.findChildren(xml, 'Root');
    expect(roots).toBeTruthy();
    expect(roots.length).toBe(1);

    let children = XmlUtils.findChildren(roots[0], 'Child');
    expect(children.length).toBe(2);

    children = XmlUtils.findChildren(roots[0], 'DoesNotExist');
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
      const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
      goog.asserts.assert(xml, 'parseFromString should succeed');

      const root = XmlUtils.findChild(xml, 'Root');
      goog.asserts.assert(root, 'findChild should find element');
      expect(XmlUtils.getContents(root)).toBe('foo bar');
    });

    it('handles empty node contents', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '</Root>',
      ].join('\n');
      const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
      goog.asserts.assert(xml, 'parseFromString should succeed');

      const root = XmlUtils.findChild(xml, 'Root');
      goog.asserts.assert(root, 'findChild should find element');
      expect(XmlUtils.getContents(root)).toBe('');
    });

    it('handles null node contents', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '</Root>',
      ].join('\n');
      const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
      goog.asserts.assert(xml, 'parseFromString should succeed');

      expect(XmlUtils.getContents(xml)).toBeNull();
    });

    it('handles CDATA sections', () => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '<![CDATA[<Foo> Bar]]>',
        '</Root>',
      ].join('\n');
      const xml = new DOMParser().parseFromString(xmlString, 'application/xml');
      goog.asserts.assert(xml, 'parseFromString should succeed');

      const root = XmlUtils.findChild(xml, 'Root');
      goog.asserts.assert(root, 'findChild should find element');
      expect(XmlUtils.getContents(root)).toBe('<Foo> Bar');
    });
  });

  describe('parseAttr', () => {
    /** @type {!Document} */
    let xml;

    beforeEach(() => {
      const xmlString = [
        '<?xml version="1.0"?>',
        '<Root a="2-7" b="-5" c="">',
        '</Root>',
      ].join('\n');
      xml = /** @type {!Document} */ (
        new DOMParser().parseFromString(xmlString, 'application/xml'));
    });

    it('delegates to parser function', () => {
      const root = XmlUtils.findChild(xml, 'Root');
      goog.asserts.assert(root, 'findChild should find element');
      expect(XmlUtils.parseAttr(root, 'a', XmlUtils.parseRange)).toEqual(
          {start: 2, end: 7});
      expect(XmlUtils.parseAttr(root, 'b', XmlUtils.parseInt)).toBe(-5);
      expect(XmlUtils.parseAttr(root, 'c', XmlUtils.parseInt)).toBe(0);
      expect(XmlUtils.parseAttr(root, 'd', XmlUtils.parseInt)).toBeNull();
    });

    it('supports default values', () => {
      const root = XmlUtils.findChild(xml, 'Root');
      goog.asserts.assert(root, 'findChild should find element');
      expect(XmlUtils.parseAttr(root, 'd', XmlUtils.parseInt, 9)).toBe(9);
    });
  });

  it('parseDate', () => {
    // Should be parsed as UTC independent of local timezone.
    expect(XmlUtils.parseDate('2015-11-30T12:46:33')).toBe(1448887593);
    // Should be parsed using the given timezone, not the local timezone.
    expect(XmlUtils.parseDate('2015-11-30T12:46:33+06:00')).toBe(1448865993);

    expect(XmlUtils.parseDate('November 30, 2015')).toBeTruthy();
    expect(XmlUtils.parseDate('Apple')).toBeNull();
    expect(XmlUtils.parseDate('')).toBeNull();
  });

  it('parseDuration', () => {
    // No time.
    expect(XmlUtils.parseDuration('P')).toBe(0);
    expect(XmlUtils.parseDuration('PT')).toBe(0);

    // Years only. 1 year has 365 or 366 days.
    expect(XmlUtils.parseDuration('P3Y')).toBeLessThan(
        3 * (60 * 60 * 24 * 366) + 1);
    expect(XmlUtils.parseDuration('P3Y')).toBeGreaterThan(
        3 * (60 * 60 * 24 * 365) - 1);

    // Months only. 1 month has 28 to 31 days.
    expect(XmlUtils.parseDuration('P2M')).toBeLessThan(
        2 * (60 * 60 * 24 * 31) + 1);
    expect(XmlUtils.parseDuration('P2M')).toBeGreaterThan(
        2 * (60 * 60 * 24 * 28) - 1);

    // Days only.
    expect(XmlUtils.parseDuration('P7D')).toBe(604800);

    // Hours only.
    expect(XmlUtils.parseDuration('PT1H')).toBe(3600);

    // Minutes only.
    expect(XmlUtils.parseDuration('PT1M')).toBe(60);

    // Seconds only (with no fractional part).
    expect(XmlUtils.parseDuration('PT1S')).toBe(1);

    // Seconds only (with no whole part).
    expect(XmlUtils.parseDuration('PT0.1S')).toBe(0.1);
    expect(XmlUtils.parseDuration('PT.1S')).toBe(0.1);

    // Seconds only (with whole part and fractional part).
    expect(XmlUtils.parseDuration('PT1.1S')).toBe(1.1);

    // Hours, and minutes.
    expect(XmlUtils.parseDuration('PT1H2M')).toBe(3720);

    // Hours, and seconds.
    expect(XmlUtils.parseDuration('PT1H2S')).toBe(3602);
    expect(XmlUtils.parseDuration('PT1H2.2S')).toBe(3602.2);

    // Minutes, and seconds.
    expect(XmlUtils.parseDuration('PT1M2S')).toBe(62);
    expect(XmlUtils.parseDuration('PT1M2.2S')).toBe(62.2);

    // Hours, minutes, and seconds.
    expect(XmlUtils.parseDuration('PT1H2M3S')).toBe(3723);
    expect(XmlUtils.parseDuration('PT1H2M3.3S')).toBe(3723.3);

    // Days, hours, minutes, and seconds.
    expect(XmlUtils.parseDuration('P1DT1H2M3S')).toBe(90123);
    expect(XmlUtils.parseDuration('P1DT1H2M3.3S')).toBe(90123.3);

    // Months, hours, minutes, and seconds.
    expect(XmlUtils.parseDuration('P1M1DT1H2M3S')).toBeLessThan(
        (60 * 60 * 24 * 31) + 90123 + 1);
    expect(XmlUtils.parseDuration('P1M1DT1H2M3S')).toBeGreaterThan(
        (60 * 60 * 24 * 28) + 90123 - 1);

    // Years, Months, hours, minutes, and seconds.
    expect(XmlUtils.parseDuration('P1Y1M1DT1H2M3S')).toBeLessThan(
        (60 * 60 * 24 * 366) + (60 * 60 * 24 * 31) + 90123 + 1);
    expect(XmlUtils.parseDuration('P1Y1M1DT1H2M3S')).toBeGreaterThan(
        (60 * 60 * 24 * 365) + (60 * 60 * 24 * 28) + 90123 - 1);

    expect(XmlUtils.parseDuration('PT')).toBe(0);
    expect(XmlUtils.parseDuration('P')).toBe(0);

    // Error cases.
    expect(XmlUtils.parseDuration('-PT3S')).toBeNull();
    expect(XmlUtils.parseDuration('PT-3S')).toBeNull();
    expect(XmlUtils.parseDuration('P1Sasdf')).toBeNull();
    expect(XmlUtils.parseDuration('1H2M3S')).toBeNull();
    expect(XmlUtils.parseDuration('123')).toBeNull();
    expect(XmlUtils.parseDuration('abc')).toBeNull();
    expect(XmlUtils.parseDuration('')).toBeNull();

    expect(XmlUtils.parseDuration('P' + HUGE_NUMBER_STRING + 'Y')).toBeNull();
    expect(XmlUtils.parseDuration('P' + HUGE_NUMBER_STRING + 'M')).toBeNull();
    expect(XmlUtils.parseDuration('P' + HUGE_NUMBER_STRING + 'D')).toBeNull();
    expect(XmlUtils.parseDuration('PT' + HUGE_NUMBER_STRING + 'H')).toBeNull();
    expect(XmlUtils.parseDuration('PT' + HUGE_NUMBER_STRING + 'M')).toBeNull();
    expect(XmlUtils.parseDuration('PT' + HUGE_NUMBER_STRING + 'S')).toBeNull();
  });

  it('parseRange', () => {
    expect(XmlUtils.parseRange('0-0')).toEqual({start: 0, end: 0});
    expect(XmlUtils.parseRange('1-1')).toEqual({start: 1, end: 1});
    expect(XmlUtils.parseRange('1-50')).toEqual({start: 1, end: 50});
    expect(XmlUtils.parseRange('50-1')).toEqual({start: 50, end: 1});

    expect(XmlUtils.parseRange('-1')).toBeNull();
    expect(XmlUtils.parseRange('1-')).toBeNull();
    expect(XmlUtils.parseRange('1')).toBeNull();
    expect(XmlUtils.parseRange('-')).toBeNull();
    expect(XmlUtils.parseRange('')).toBeNull();

    expect(XmlUtils.parseRange('abc')).toBeNull();
    expect(XmlUtils.parseRange('a-')).toBeNull();
    expect(XmlUtils.parseRange('-b')).toBeNull();
    expect(XmlUtils.parseRange('a-b')).toBeNull();

    expect(XmlUtils.parseRange(HUGE_NUMBER_STRING + '-1')).toBeNull();
    expect(XmlUtils.parseRange('1-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseInt', () => {
    expect(XmlUtils.parseInt('0')).toBe(0);
    expect(XmlUtils.parseInt('1')).toBe(1);
    expect(XmlUtils.parseInt('191')).toBe(191);

    expect(XmlUtils.parseInt('-0')).toBe(0);
    expect(XmlUtils.parseInt('-1')).toBe(-1);
    expect(XmlUtils.parseInt('-191')).toBe(-191);

    expect(XmlUtils.parseInt('abc')).toBeNull();
    expect(XmlUtils.parseInt('1abc')).toBeNull();
    expect(XmlUtils.parseInt('abc1')).toBeNull();

    expect(XmlUtils.parseInt('0.0')).toBe(0);
    expect(XmlUtils.parseInt('-0.0')).toBe(0);

    expect(XmlUtils.parseInt('0.1')).toBeNull();
    expect(XmlUtils.parseInt('1.1')).toBeNull();

    expect(XmlUtils.parseInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(XmlUtils.parseInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parsePositiveInt', () => {
    expect(XmlUtils.parsePositiveInt('0')).toBeNull();
    expect(XmlUtils.parsePositiveInt('1')).toBe(1);
    expect(XmlUtils.parsePositiveInt('191')).toBe(191);

    expect(XmlUtils.parsePositiveInt('-0')).toBeNull();
    expect(XmlUtils.parsePositiveInt('-1')).toBeNull();
    expect(XmlUtils.parsePositiveInt('-191')).toBeNull();

    expect(XmlUtils.parsePositiveInt('abc')).toBeNull();
    expect(XmlUtils.parsePositiveInt('1abc')).toBeNull();
    expect(XmlUtils.parsePositiveInt('abc1')).toBeNull();

    expect(XmlUtils.parsePositiveInt('0.0')).toBeNull();
    expect(XmlUtils.parsePositiveInt('-0.0')).toBeNull();

    expect(XmlUtils.parsePositiveInt('0.1')).toBeNull();
    expect(XmlUtils.parsePositiveInt('1.1')).toBeNull();

    expect(XmlUtils.parsePositiveInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(XmlUtils.parsePositiveInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseNonNegativeInt', () => {
    expect(XmlUtils.parseNonNegativeInt('0')).toBe(0);
    expect(XmlUtils.parseNonNegativeInt('1')).toBe(1);
    expect(XmlUtils.parseNonNegativeInt('191')).toBe(191);

    expect(XmlUtils.parseNonNegativeInt('-0')).toBe(0);
    expect(XmlUtils.parseNonNegativeInt('-1')).toBeNull();
    expect(XmlUtils.parseNonNegativeInt('-191')).toBeNull();

    expect(XmlUtils.parseNonNegativeInt('abc')).toBeNull();
    expect(XmlUtils.parseNonNegativeInt('1abc')).toBeNull();
    expect(XmlUtils.parseNonNegativeInt('abc1')).toBeNull();

    expect(XmlUtils.parseNonNegativeInt('0.0')).toBe(0);
    expect(XmlUtils.parseNonNegativeInt('-0.0')).toBe(0);

    expect(XmlUtils.parseNonNegativeInt('0.1')).toBeNull();
    expect(XmlUtils.parseNonNegativeInt('1.1')).toBeNull();

    expect(XmlUtils.parseNonNegativeInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(XmlUtils.parseNonNegativeInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseFloat', () => {
    expect(XmlUtils.parseFloat('0')).toBe(0);
    expect(XmlUtils.parseFloat('1')).toBe(1);
    expect(XmlUtils.parseFloat('191')).toBe(191);

    expect(XmlUtils.parseFloat('-0')).toBe(0);
    expect(XmlUtils.parseFloat('-1')).toBe(-1);
    expect(XmlUtils.parseFloat('-191')).toBe(-191);

    expect(XmlUtils.parseFloat('abc')).toBeNull();
    expect(XmlUtils.parseFloat('1abc')).toBeNull();
    expect(XmlUtils.parseFloat('abc1')).toBeNull();

    expect(XmlUtils.parseFloat('0.0')).toBe(0);
    expect(XmlUtils.parseFloat('-0.0')).toBe(0);

    expect(XmlUtils.parseFloat('0.1')).toBeCloseTo(0.1);
    expect(XmlUtils.parseFloat('1.1')).toBeCloseTo(1.1);

    expect(XmlUtils.parseFloat('19.1134')).toBeCloseTo(19.1134);
    expect(XmlUtils.parseFloat('4e2')).toBeCloseTo(4e2);
    expect(XmlUtils.parseFloat('4e-2')).toBeCloseTo(4e-2);

    expect(XmlUtils.parseFloat(HUGE_NUMBER_STRING)).toBe(Infinity);
    expect(XmlUtils.parseFloat('-' + HUGE_NUMBER_STRING)).toBe(-Infinity);
  });
});

