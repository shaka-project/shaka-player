/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('XmlUtils', function() {
  // A number that cannot be represented as a Javascript number.
  var HUGE_NUMBER_STRING = new Array(500).join('7');

  var XmlUtils;

  beforeAll(function() {
    XmlUtils = shaka.util.XmlUtils;
  });

  describe('findChild', function() {
    it('finds a child node', function() {
      var xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  <Child></Child>',
        '</Root>'
      ].join('\n');
      var xml = new DOMParser().parseFromString(xmlString, 'application/xml');

      var root = XmlUtils.findChild(xml, 'Root');
      expect(root).toBeTruthy();

      expect(XmlUtils.findChild(root, 'Child')).toBeTruthy();
      expect(XmlUtils.findChild(root, 'DoesNotExist')).toBeNull();
    });

    it('handles duplicate child nodes', function() {
      var xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  <Child></Child>',
        '  <Child></Child>',
        '</Root>'
      ].join('\n');
      var xml = new DOMParser().parseFromString(xmlString, 'application/xml');

      var root = XmlUtils.findChild(xml, 'Root');
      expect(root).toBeTruthy();

      expect(XmlUtils.findChild(root, 'Child')).toBeNull();
    });
  });

  it('findChildren', function() {
    var xmlString = [
      '<?xml version="1.0"?>',
      '<Root>',
      '  <Child></Child>',
      '  <Child></Child>',
      '</Root>'
    ].join('\n');
    var xml = new DOMParser().parseFromString(xmlString, 'application/xml');

    var roots = XmlUtils.findChildren(xml, 'Root');
    expect(roots).toBeTruthy();
    expect(roots.length).toBe(1);

    var children = XmlUtils.findChildren(roots[0], 'Child');
    expect(children.length).toBe(2);

    children = XmlUtils.findChildren(roots[0], 'DoesNotExist');
    expect(children.length).toBe(0);
  });

  describe('getContents', function() {
    it('returns node contents', function() {
      var xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '  foo bar',
        '</Root>'
      ].join('\n');
      var xml = new DOMParser().parseFromString(xmlString, 'application/xml');

      var root = XmlUtils.findChild(xml, 'Root');
      expect(XmlUtils.getContents(root)).toBe('foo bar');
    });

    it('handles empty node contents', function() {
      var xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '</Root>'
      ].join('\n');
      var xml = new DOMParser().parseFromString(xmlString, 'application/xml');

      var root = XmlUtils.findChild(xml, 'Root');
      expect(XmlUtils.getContents(root)).toBe('');
    });

    it('handles null node contents', function() {
      var xmlString = [
        '<?xml version="1.0"?>',
        '<Root>',
        '</Root>'
      ].join('\n');
      var xml = new DOMParser().parseFromString(xmlString, 'application/xml');

      expect(XmlUtils.getContents(xml)).toBeNull();
    });
  });

  describe('parseAttr', function() {
    var xml;

    beforeEach(function() {
      var xmlString = [
        '<?xml version="1.0"?>',
        '<Root a="2-7" b="-5" c="">',
        '</Root>'
      ].join('\n');
      xml = new DOMParser().parseFromString(xmlString, 'application/xml');
    });

    it('delegates to parser function', function() {
      var root = XmlUtils.findChild(xml, 'Root');
      expect(XmlUtils.parseAttr(root, 'a', XmlUtils.parseRange)).toEqual(
          {start: 2, end: 7});
      expect(XmlUtils.parseAttr(root, 'b', XmlUtils.parseInt)).toBe(-5);
      expect(XmlUtils.parseAttr(root, 'c', XmlUtils.parseInt)).toBe(0);
      expect(XmlUtils.parseAttr(root, 'd', XmlUtils.parseInt)).toBeNull();
    });

    it('supports default values', function() {
      var root = XmlUtils.findChild(xml, 'Root');
      expect(XmlUtils.parseAttr(root, 'd', XmlUtils.parseInt, 9)).toBe(9);
    });
  });

  it('parseDate', function() {
    var parseDate = shaka.util.XmlUtils.parseDate;

    expect(parseDate('November 30, 2015')).toBeTruthy();
    expect(parseDate('Apple')).toBeNull();
    expect(parseDate('')).toBeNull();
  });

  it('parseDuration', function() {
    var parseDuration = shaka.util.XmlUtils.parseDuration;

    // No time.
    expect(parseDuration('P')).toBe(0);
    expect(parseDuration('PT')).toBe(0);

    // Years only. 1 year has 365 or 366 days.
    expect(parseDuration('P3Y')).toBeLessThan(3 * (60 * 60 * 24 * 366) + 1);
    expect(parseDuration('P3Y')).toBeGreaterThan(3 * (60 * 60 * 24 * 365) - 1);

    // Months only. 1 month has 28 to 31 days.
    expect(parseDuration('P2M')).toBeLessThan(2 * (60 * 60 * 24 * 31) + 1);
    expect(parseDuration('P2M')).toBeGreaterThan(2 * (60 * 60 * 24 * 28) - 1);

    // Days only.
    expect(parseDuration('P7D')).toBe(604800);

    // Hours only.
    expect(parseDuration('PT1H')).toBe(3600);

    // Minutes only.
    expect(parseDuration('PT1M')).toBe(60);

    // Seconds only (with no fractional part).
    expect(parseDuration('PT1S')).toBe(1);

    // Seconds only (with no whole part).
    expect(parseDuration('PT0.1S')).toBe(0.1);
    expect(parseDuration('PT.1S')).toBe(0.1);

    // Seconds only (with whole part and fractional part).
    expect(parseDuration('PT1.1S')).toBe(1.1);

    // Hours, and minutes.
    expect(parseDuration('PT1H2M')).toBe(3720);

    // Hours, and seconds.
    expect(parseDuration('PT1H2S')).toBe(3602);
    expect(parseDuration('PT1H2.2S')).toBe(3602.2);

    // Minutes, and seconds.
    expect(parseDuration('PT1M2S')).toBe(62);
    expect(parseDuration('PT1M2.2S')).toBe(62.2);

    // Hours, minutes, and seconds.
    expect(parseDuration('PT1H2M3S')).toBe(3723);
    expect(parseDuration('PT1H2M3.3S')).toBe(3723.3);

    // Days, hours, minutes, and seconds.
    expect(parseDuration('P1DT1H2M3S')).toBe(90123);
    expect(parseDuration('P1DT1H2M3.3S')).toBe(90123.3);

    // Months, hours, minutes, and seconds.
    expect(parseDuration('P1M1DT1H2M3S')).toBeLessThan(
        (60 * 60 * 24 * 31) + 90123 + 1);
    expect(parseDuration('P1M1DT1H2M3S')).toBeGreaterThan(
        (60 * 60 * 24 * 28) + 90123 - 1);

    // Years, Months, hours, minutes, and seconds.
    expect(parseDuration('P1Y1M1DT1H2M3S')).toBeLessThan(
        (60 * 60 * 24 * 366) + (60 * 60 * 24 * 31) + 90123 + 1);
    expect(parseDuration('P1Y1M1DT1H2M3S')).toBeGreaterThan(
        (60 * 60 * 24 * 365) + (60 * 60 * 24 * 28) + 90123 - 1);

    expect(parseDuration('PT')).toBe(0);
    expect(parseDuration('P')).toBe(0);

    // Error cases.
    expect(parseDuration('-PT3S')).toBeNull();
    expect(parseDuration('PT-3S')).toBeNull();
    expect(parseDuration('P1Sasdf')).toBeNull();
    expect(parseDuration('1H2M3S')).toBeNull();
    expect(parseDuration('123')).toBeNull();
    expect(parseDuration('abc')).toBeNull();
    expect(parseDuration('')).toBeNull();

    expect(parseDuration('P' + HUGE_NUMBER_STRING + 'Y')).toBeNull();
    expect(parseDuration('P' + HUGE_NUMBER_STRING + 'M')).toBeNull();
    expect(parseDuration('P' + HUGE_NUMBER_STRING + 'D')).toBeNull();
    expect(parseDuration('PT' + HUGE_NUMBER_STRING + 'H')).toBeNull();
    expect(parseDuration('PT' + HUGE_NUMBER_STRING + 'M')).toBeNull();
    expect(parseDuration('PT' + HUGE_NUMBER_STRING + 'S')).toBeNull();
  });

  it('parseRange', function() {
    var parseRange = shaka.util.XmlUtils.parseRange;

    expect(parseRange('0-0')).toEqual({start: 0, end: 0});
    expect(parseRange('1-1')).toEqual({start: 1, end: 1});
    expect(parseRange('1-50')).toEqual({start: 1, end: 50});
    expect(parseRange('50-1')).toEqual({start: 50, end: 1});

    expect(parseRange('-1')).toBeNull();
    expect(parseRange('1-')).toBeNull();
    expect(parseRange('1')).toBeNull();
    expect(parseRange('-')).toBeNull();
    expect(parseRange('')).toBeNull();

    expect(parseRange('abc')).toBeNull();
    expect(parseRange('a-')).toBeNull();
    expect(parseRange('-b')).toBeNull();
    expect(parseRange('a-b')).toBeNull();

    expect(parseRange(HUGE_NUMBER_STRING + '-1')).toBeNull();
    expect(parseRange('1-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseInt', function() {
    var parseInt = shaka.util.XmlUtils.parseInt;

    expect(parseInt('0')).toBe(0);
    expect(parseInt('1')).toBe(1);
    expect(parseInt('191')).toBe(191);

    expect(parseInt('-0')).toBe(0);
    expect(parseInt('-1')).toBe(-1);
    expect(parseInt('-191')).toBe(-191);

    expect(parseInt('abc')).toBeNull();
    expect(parseInt('1abc')).toBeNull();
    expect(parseInt('abc1')).toBeNull();

    expect(parseInt('0.0')).toBe(0);
    expect(parseInt('-0.0')).toBe(0);

    expect(parseInt('0.1')).toBeNull();
    expect(parseInt('1.1')).toBeNull();

    expect(parseInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(parseInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parsePositiveInt', function() {
    var parsePositiveInt = shaka.util.XmlUtils.parsePositiveInt;

    expect(parsePositiveInt('0')).toBeNull();
    expect(parsePositiveInt('1')).toBe(1);
    expect(parsePositiveInt('191')).toBe(191);

    expect(parsePositiveInt('-0')).toBeNull();
    expect(parsePositiveInt('-1')).toBeNull();
    expect(parsePositiveInt('-191')).toBeNull();

    expect(parsePositiveInt('abc')).toBeNull();
    expect(parsePositiveInt('1abc')).toBeNull();
    expect(parsePositiveInt('abc1')).toBeNull();

    expect(parsePositiveInt('0.0')).toBeNull();
    expect(parsePositiveInt('-0.0')).toBeNull();

    expect(parsePositiveInt('0.1')).toBeNull();
    expect(parsePositiveInt('1.1')).toBeNull();

    expect(parsePositiveInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(parsePositiveInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseNonNegativeInt', function() {
    var parseNonNegativeInt = shaka.util.XmlUtils.parseNonNegativeInt;

    expect(parseNonNegativeInt('0')).toBe(0);
    expect(parseNonNegativeInt('1')).toBe(1);
    expect(parseNonNegativeInt('191')).toBe(191);

    expect(parseNonNegativeInt('-0')).toBe(0);
    expect(parseNonNegativeInt('-1')).toBeNull();
    expect(parseNonNegativeInt('-191')).toBeNull();

    expect(parseNonNegativeInt('abc')).toBeNull();
    expect(parseNonNegativeInt('1abc')).toBeNull();
    expect(parseNonNegativeInt('abc1')).toBeNull();

    expect(parseNonNegativeInt('0.0')).toBe(0);
    expect(parseNonNegativeInt('-0.0')).toBe(0);

    expect(parseNonNegativeInt('0.1')).toBeNull();
    expect(parseNonNegativeInt('1.1')).toBeNull();

    expect(parseNonNegativeInt(HUGE_NUMBER_STRING)).toBeNull();
    expect(parseNonNegativeInt('-' + HUGE_NUMBER_STRING)).toBeNull();
  });

  it('parseFloat', function() {
    var parseFloat = shaka.util.XmlUtils.parseFloat;

    expect(parseFloat('0')).toBe(0);
    expect(parseFloat('1')).toBe(1);
    expect(parseFloat('191')).toBe(191);

    expect(parseFloat('-0')).toBe(0);
    expect(parseFloat('-1')).toBe(-1);
    expect(parseFloat('-191')).toBe(-191);

    expect(parseFloat('abc')).toBeNull();
    expect(parseFloat('1abc')).toBeNull();
    expect(parseFloat('abc1')).toBeNull();

    expect(parseFloat('0.0')).toBe(0);
    expect(parseFloat('-0.0')).toBe(0);

    expect(parseFloat('0.1')).toBeCloseTo(0.1);
    expect(parseFloat('1.1')).toBeCloseTo(1.1);

    expect(parseFloat('19.1134')).toBeCloseTo(19.1134);
    expect(parseFloat('4e2')).toBeCloseTo(4e2);
    expect(parseFloat('4e-2')).toBeCloseTo(4e-2);

    expect(parseFloat(HUGE_NUMBER_STRING)).toBe(Infinity);
    expect(parseFloat('-' + HUGE_NUMBER_STRING)).toBe(-Infinity);
  });
});

