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
  const TextParser = shaka.util.TextParser;

  describe('atEnd', function() {
    it('is false at start', function() {
      let parser = new TextParser('FOO');
      expect(parser.atEnd()).toBe(false);
    });

    it('is true if no data at start', function() {
      let parser = new TextParser('');
      expect(parser.atEnd()).toBe(true);
    });

    it('is false if there is more after read', function() {
      let parser = new TextParser('FOO BAR');
      parser.readRegex(/FOO/g);
      expect(parser.atEnd()).toBe(false);
    });

    it('is true at the end', function() {
      let parser = new TextParser('FOO');
      parser.readLine();
      expect(parser.atEnd()).toBe(true);
    });
  });

  describe('readLine', function() {
    it('returns null at end', function() {
      let parser = new TextParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readLine()).toBe(null);
    });

    it('returns line read', function() {
      let parser = new TextParser('A Line\n Another');
      expect(parser.readLine()).toBe('A Line');
    });

    it('reads to end of string', function() {
      let parser = new TextParser('A Line');
      expect(parser.readLine()).toBe('A Line');
      expect(parser.atEnd()).toBe(true);
    });

    it('will return empty lines', function() {
      let parser = new TextParser('Line\n\nNew Line');
      expect(parser.readLine()).toBe('Line');
      expect(parser.readLine()).toBe('');
      expect(parser.readLine()).toBe('New Line');
    });
  });

  describe('readWord', function() {
    it('returns null at end', function() {
      let parser = new TextParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readWord()).toBe(null);
    });

    it('returns word read', function() {
      let parser = new TextParser('FOO BAR');
      expect(parser.readWord()).toBe('FOO');
    });

    it('moves position correctly', function() {
      let parser = new TextParser('FOO BAR');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.readLine()).toBe(' BAR');
    });

    it('reads to end', function() {
      let parser = new TextParser('FOO');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.atEnd()).toBe(true);
    });

    it('reads to end of line', function() {
      let parser = new TextParser('FOO\nBAR');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.readRegex(/\nBAR/gm)).toBeTruthy();
    });
  });

  describe('readRegex', function() {
    it('returns null at end', function() {
      let parser = new TextParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readRegex(/(?:)/g)).toBe(null);
    });

    it('moves position', function() {
      let parser = new TextParser('FOOBAR');
      expect(parser.readRegex(/FOO/g)).toBeTruthy();
      expect(parser.readLine()).toBe('BAR');
    });

    it('will read to end', function() {
      let parser = new TextParser('FOO');
      expect(parser.readRegex(/FO+/g)).toBeTruthy();
      expect(parser.atEnd()).toBe(true);
    });

    it('only reads if matches', function() {
      let parser = new TextParser('FOO');
      expect(parser.readRegex(/CAT/g)).toBe(null);
      expect(parser.readLine()).toBe('FOO');
    });

    it('only reads if match is at current position', function() {
      let parser = new TextParser('AABB');
      expect(parser.readRegex(/B+/g)).toBe(null);
      expect(parser.readLine()).toBe('AABB');
    });

    it('only reads the first match', function() {
      let parser = new TextParser('AABBAA');
      expect(parser.readRegex(/A+/g)).toBeTruthy();
      expect(parser.readLine()).toBe('BBAA');
    });

    it('returns results object', function() {
      let parser = new TextParser('00:11:22');
      let results = parser.readRegex(/(\d+):(\d+):/g);
      expect(results).toBeTruthy();
      expect(results.length).toBe(3);
      expect(results[0]).toBe('00:11:');
      expect(results[1]).toBe('00');
      expect(results[2]).toBe('11');
    });
  });

  describe('skipWhitespace', function() {
    it('skips blocks of whitespace', function() {
      let parser = new TextParser('     CAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/CAT/g)).toBeTruthy();
    });

    it('skips mixed whitespace', function() {
      let parser = new TextParser('  \t\t  CAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/CAT/g)).toBeTruthy();
    });

    it('does not skip newlines', function() {
      let parser = new TextParser('  \nCAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/\nCAT/gm)).toBeTruthy();
    });

    it('will skip to end of string', function() {
      let parser = new TextParser('   ');
      expect(parser.atEnd()).toBe(false);
      parser.skipWhitespace();
      expect(parser.atEnd()).toBe(true);
    });
  });
});
