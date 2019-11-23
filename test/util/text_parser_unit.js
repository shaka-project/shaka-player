/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TextParser', () => {
  const TextParser = shaka.util.TextParser;

  describe('atEnd', () => {
    it('is false at start', () => {
      const parser = new TextParser('FOO');
      expect(parser.atEnd()).toBe(false);
    });

    it('is true if no data at start', () => {
      const parser = new TextParser('');
      expect(parser.atEnd()).toBe(true);
    });

    it('is false if there is more after read', () => {
      const parser = new TextParser('FOO BAR');
      parser.readRegex(/FOO/g);
      expect(parser.atEnd()).toBe(false);
    });

    it('is true at the end', () => {
      const parser = new TextParser('FOO');
      parser.readLine();
      expect(parser.atEnd()).toBe(true);
    });
  });

  describe('readLine', () => {
    it('returns null at end', () => {
      const parser = new TextParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readLine()).toBe(null);
    });

    it('returns line read', () => {
      const parser = new TextParser('A Line\n Another');
      expect(parser.readLine()).toBe('A Line');
    });

    it('reads to end of string', () => {
      const parser = new TextParser('A Line');
      expect(parser.readLine()).toBe('A Line');
      expect(parser.atEnd()).toBe(true);
    });

    it('will return empty lines', () => {
      const parser = new TextParser('Line\n\nNew Line');
      expect(parser.readLine()).toBe('Line');
      expect(parser.readLine()).toBe('');
      expect(parser.readLine()).toBe('New Line');
    });
  });

  describe('readWord', () => {
    it('returns null at end', () => {
      const parser = new TextParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readWord()).toBe(null);
    });

    it('returns word read', () => {
      const parser = new TextParser('FOO BAR');
      expect(parser.readWord()).toBe('FOO');
    });

    it('moves position correctly', () => {
      const parser = new TextParser('FOO BAR');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.readLine()).toBe(' BAR');
    });

    it('reads to end', () => {
      const parser = new TextParser('FOO');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.atEnd()).toBe(true);
    });

    it('reads to end of line', () => {
      const parser = new TextParser('FOO\nBAR');
      expect(parser.readWord()).toBe('FOO');
      expect(parser.readRegex(/\nBAR/gm)).toBeTruthy();
    });
  });

  describe('readRegex', () => {
    it('returns null at end', () => {
      const parser = new TextParser('');
      expect(parser.atEnd()).toBe(true);
      expect(parser.readRegex(/(?:)/g)).toBe(null);
    });

    it('moves position', () => {
      const parser = new TextParser('FOOBAR');
      expect(parser.readRegex(/FOO/g)).toBeTruthy();
      expect(parser.readLine()).toBe('BAR');
    });

    it('will read to end', () => {
      const parser = new TextParser('FOO');
      expect(parser.readRegex(/FO+/g)).toBeTruthy();
      expect(parser.atEnd()).toBe(true);
    });

    it('only reads if matches', () => {
      const parser = new TextParser('FOO');
      expect(parser.readRegex(/CAT/g)).toBe(null);
      expect(parser.readLine()).toBe('FOO');
    });

    it('only reads if match is at current position', () => {
      const parser = new TextParser('AABB');
      expect(parser.readRegex(/B+/g)).toBe(null);
      expect(parser.readLine()).toBe('AABB');
    });

    it('only reads the first match', () => {
      const parser = new TextParser('AABBAA');
      expect(parser.readRegex(/A+/g)).toBeTruthy();
      expect(parser.readLine()).toBe('BBAA');
    });

    it('returns results object', () => {
      const parser = new TextParser('00:11:22');
      const results = parser.readRegex(/(\d+):(\d+):/g);
      expect(results).toBeTruthy();
      expect(results.length).toBe(3);
      expect(results[0]).toBe('00:11:');
      expect(results[1]).toBe('00');
      expect(results[2]).toBe('11');
    });
  });

  describe('skipWhitespace', () => {
    it('skips blocks of whitespace', () => {
      const parser = new TextParser('     CAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/CAT/g)).toBeTruthy();
    });

    it('skips mixed whitespace', () => {
      const parser = new TextParser('  \t\t  CAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/CAT/g)).toBeTruthy();
    });

    it('does not skip newlines', () => {
      const parser = new TextParser('  \nCAT');
      parser.skipWhitespace();
      expect(parser.readRegex(/\nCAT/gm)).toBeTruthy();
    });

    it('will skip to end of string', () => {
      const parser = new TextParser('   ');
      expect(parser.atEnd()).toBe(false);
      parser.skipWhitespace();
      expect(parser.atEnd()).toBe(true);
    });
  });
});
