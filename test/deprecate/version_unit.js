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

describe('Version', function() {
  const Version = shaka.deprecate.Version;

  describe('parse', function() {
    it('can parse full tag', function() {
      const versionString = 'v2.4.3-tag-and-other-words';
      const version = Version.parse(versionString);

      expect(version.major()).toBe(2);
      expect(version.minor()).toBe(4);
    });
  });

  describe('toString', function() {
    it('converts version to string', function() {
      const version = new Version(2, 4);
      expect(version.toString()).toBe('v2.4');
    });
  });

  describe('compareTo', function() {
    it('handles equals', function() {
      const version = new Version(2, 4);
      expect(version.compareTo(version)).toBe(0);
    });

    it('handles less-than with minor', function() {
      const smaller = new Version(2, 2);
      const larger = new Version(2, 4);
      expect(smaller.compareTo(larger)).toBeLessThan(0);
    });

    it('handles less-than with major', function() {
      const smaller = new Version(2, 2);
      const larger = new Version(3, 1);
      expect(smaller.compareTo(larger)).toBeLessThan(0);
    });

    it('handles greater-than with minor', function() {
      const smaller = new Version(2, 2);
      const larger = new Version(2, 4);
      expect(larger.compareTo(smaller)).toBeGreaterThan(0);
    });

    it('handles greater-than with major', function() {
      const smaller = new Version(2, 2);
      const larger = new Version(3, 1);
      expect(larger.compareTo(smaller)).toBeGreaterThan(0);
    });
  });
});
