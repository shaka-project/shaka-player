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

describe('Iterables', function() {
  const Iterables = shaka.util.Iterables;

  describe('map', function() {
    const map = Iterables.map;

    it('works with no items', function() {
      const input = new Set([]);
      const output = Array.from(map(input, (x) => -x));

      expect(output).toEqual([]);
    });

    it('works with items', function() {
      const input = new Set([1, 2, 3]);
      const output = Array.from(map(input, (x) => -x));

      expect(output).toEqual([-1, -2, -3]);
    });
  });

  describe('every', function() {
    const every = Iterables.every;

    it('works with no items', function() {
      const input = new Set([]);
      expect(every(input, (x) => x >= 0)).toBeTruthy();
    });

    it('works with items', function() {
      const input = new Set([0, 1, 2, 3]);
      expect(every(input, (x) => x >= 0)).toBeTruthy();
      expect(every(input, (x) => x > 0)).toBeFalsy();
    });
  });

  describe('some', function() {
    const some = Iterables.some;

    it('works with no items', function() {
      const input = new Set([]);
      expect(some(input, (x) => x >= 2)).toBeFalsy();
    });

    it('works with items', function() {
      const input = new Set([0, 1, 2, 3]);
      expect(some(input, (x) => x > 2)).toBeTruthy();
      expect(some(input, (x) => x < 0)).toBeFalsy();
    });
  });

  describe('filter', function() {
    const filter = Iterables.filter;

    it('works with no items', function() {
      const input = new Set([]);
      expect(filter(input, (x) => x >= 2)).toEqual([]);
    });

    it('works with items', function() {
      const input = new Set([0, 1, 2, 3]);
      // Everything
      expect(filter(input, (x) => x < 7)).toEqual([0, 1, 2, 3]);
      // Some things
      expect(filter(input, (x) => x < 2)).toEqual([0, 1]);
      // Nothing
      expect(filter(input, (x) => x < 0)).toEqual([]);
    });
  });
});
