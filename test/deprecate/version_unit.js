/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Version', () => {
  const Version = shaka.deprecate.Version;

  describe('parse', () => {
    it('can parse full tag', () => {
      const versionString = 'v2.4.3-tag-and-other-words';
      const version = Version.parse(versionString);

      expect(version.major()).toBe(2);
      expect(version.minor()).toBe(4);
    });
  });

  describe('toString', () => {
    it('converts version to string', () => {
      const version = new Version(2, 4);
      expect(version.toString()).toBe('v2.4');
    });
  });

  describe('compareTo', () => {
    it('handles equals', () => {
      const version = new Version(2, 4);
      expect(version.compareTo(version)).toBe(0);
    });

    it('handles less-than with minor', () => {
      const smaller = new Version(2, 2);
      const larger = new Version(2, 4);
      expect(smaller.compareTo(larger)).toBeLessThan(0);
    });

    it('handles less-than with major', () => {
      const smaller = new Version(2, 2);
      const larger = new Version(3, 1);
      expect(smaller.compareTo(larger)).toBeLessThan(0);
    });

    it('handles greater-than with minor', () => {
      const smaller = new Version(2, 2);
      const larger = new Version(2, 4);
      expect(larger.compareTo(smaller)).toBeGreaterThan(0);
    });

    it('handles greater-than with major', () => {
      const smaller = new Version(2, 2);
      const larger = new Version(3, 1);
      expect(larger.compareTo(smaller)).toBeGreaterThan(0);
    });
  });
});
