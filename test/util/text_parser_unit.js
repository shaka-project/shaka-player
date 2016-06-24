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

describe('TextParser', function() {
  var textParser;

  beforeAll(function() {
    textParser = shaka.util.TextParser;
  });

  describe('atEnd', function() {
    it('is false at start', function() {
      var parser = new textParser('FOO');
      expect(parser.atEnd()).toBe(false);
    });

    it('is true if no data at start', function() {
      var parser = new textParser('');
      expect(parser.atEnd()).toBe(true);
    });

    it('is false if there is more after read', function() {
      var parser = new textParser('FOO BAR');
      parser.readRegex(/FOO/g);
      expect(parser.atEnd()).toBe(false);
    });

    it('is true at the end', function() {
      var parser = new textParser('FOO');
      parser.readLine();
      expect(parser.atEnd()).toBe(true);
    });
  });

  describe('readLine', function() {
    it('returns null at end', function() {
      var parser = new textParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readLine()).toBe(null);
    });

    it('returns line read', function() {
      var parser = new textParser('A Line\n Another');
      expect(parser.readLine()).toBe('A Line');
    });

    it('reads to end of string', function() {
      var parser = new textParser('A Line');
      expect(parser.readLine()).toBe('A Line');
      expect(parser.atEnd()).toBe(true);
    });

    it('will return empty lines', function() {
      var parser = new textParser('Line\n\nNew Line');
      expect(parser.readLine()).toBe('Line');
      expect(parser.readLine()).toBe('');
      expect(parser.readLine()).toBe('New Line');
    });
  });

  describe('readWord', function() {
    it('returns null at end', function() {
      var parser = new textParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readWord()).toBe(null);
    });

    it('returns word read', function() {
      var parser = new textParser('FOO BAR');
      expect(parser.readWord()).toBe('FOO');
    });

    it('moves position correctly', function() {
      var parser = new textParser('FOO BAR');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.readLine()).toBe(' BAR');
    });

    it('reads to end', function() {
      var parser = new textParser('FOO');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.atEnd()).toBe(true);
    });

    it('reads to end of line', function() {
      var parser = new textParser('FOO\nBAR');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.readRegex(/\nBAR/gm)).toBeTruthy();
    });
  });

  describe('readRegex', function() {
    it('returns null at end', function() {
      var parser = new textParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readRegex(/(?:)/g)).toBe(null);
    });

    it('moves position', function() {
      var parser = new textParser('FOOBAR');
      expect(parser.readRegex(/FOO/g)).toBeTruthy();
      expect(parser.readLine()).toBe('BAR');
    });

    it('will read to end', function() {
      var parser = new textParser('FOO');
      expect(parser.readRegex(/FO+/g)).toBeTruthy();
      expect(parser.atEnd()).toBe(true);
    });

    it('only reads if matches', function() {
      var parser = new textParser('FOO');
      expect(parser.readRegex(/CAT/g)).toBe(null);
      expect(parser.readLine()).toBe('FOO');
    });

    it('only reads if match is at current position', function() {
      var parser = new textParser('AABB');
      expect(parser.readRegex(/B+/g)).toBe(null);
      expect(parser.readLine()).toBe('AABB');
    });

    it('only reads the first match', function() {
      var parser = new textParser('AABBAA');
      expect(parser.readRegex(/A+/g)).toBeTruthy();
      expect(parser.readLine()).toBe('BBAA');
    });

    it('returns results object', function() {
      var parser = new textParser('00:11:22');
      var results = parser.readRegex(/(\d+):(\d+):/g);
      expect(results).toBeTruthy();
      expect(results.length).toBe(3);
      expect(results[0]).toBe('00:11:');
      expect(results[1]).toBe('00');
      expect(results[2]).toBe('11');
    });
  });

  describe('skipWhitespace', function() {
    it('skips blocks of whitespace', function() {
      var parser = new textParser('     CAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/CAT/g)).toBeTruthy();
    });

    it('skips mixed whitespace', function() {
      var parser = new textParser('  \t\t  CAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/CAT/g)).toBeTruthy();
    });

    it('does not skip newlines', function() {
      var parser = new textParser('  \nCAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/\nCAT/gm)).toBeTruthy();
    });

    it('will skip to end of string', function() {
      var parser = new textParser('   ');
      expect(parser.atEnd()).toBe(false);
      parser.skipWhitespace();
      expect(parser.atEnd()).toBe(true);
    });
  });

  describe('parseTime', function() {
    var timeColonFormat = /(?:(\d{2,}):)?(\d{2}):(\d{2})$/g;
    var timeColonFormatMilliseconds = /(?:(\d{2,}):)?(\d{2}):(\d{2}\.\d{2,})/g;
    var timeHMSFormat =
        /(?:([0-9]*\.*[0-9]*)h)?(?:([0-9]*\.*[0-9]*)m)?(?:([0-9.]*\.*[0-9]*)s)?$/g;

    it('parses time in 00:00.00 format', function() {
      var parser = new shaka.util.TextParser('01:02.05');
      expect(parser.parseTime(timeColonFormatMilliseconds))
                          .toBe(62.05);
    });

    it('parses time in 00:00:00.00 format', function() {
      var parser = new shaka.util.TextParser('01:02:03.200');
      expect(parser.parseTime(timeColonFormatMilliseconds))
                          .toBe(3723.2);
    });

    it('parses time in 00:00:00 format', function() {
      var parser = new shaka.util.TextParser('01:02:03');
      expect(parser.parseTime(timeColonFormat))
                          .toBe(3723);
    });

    it('parses time in 00:00 format', function() {
      var parser = new shaka.util.TextParser('01:02');
      expect(parser.parseTime(timeColonFormat))
                          .toBe(62);
    });

    it('parses time in 00:00:0.0000 format', function() {
      var parser = new shaka.util.TextParser('01:02:03.1000');
      expect(parser.parseTime(timeColonFormatMilliseconds))
                          .toBe(3723.1);
    });

    it('parses time in 0h format', function() {
      var parser = new shaka.util.TextParser('1.5h');
      expect(parser.parseTime(timeHMSFormat))
                          .toBe(5400);
    });

    it('parses time in 0.00m format', function() {
      var parser = new shaka.util.TextParser('2.45m');
      expect(parser.parseTime(timeHMSFormat))
                          .toBe(147);
    });

    it('parses time in 0s format', function() {
      var parser = new shaka.util.TextParser('3.81s');
      expect(parser.parseTime(timeHMSFormat))
                            .toBe(3.81);
    });

    it('returns null if no match', function() {
      var parser = new shaka.util.TextParser('123');
      expect(parser.parseTime(timeHMSFormat))
                            .toBe(null);
    });

    it('returns null if minutes > 59', function() {
      var parser = new shaka.util.TextParser('01:70');
      expect(parser.parseTime(timeColonFormat))
                          .toBe(null);
    });

    it('returns null if seconds > 59', function() {
      var parser = new shaka.util.TextParser('01:00:70');
      expect(parser.parseTime(timeColonFormat))
                          .toBe(null);
    });
  });
});
