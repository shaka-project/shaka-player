/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ArrayUtils', () => {
  const ArrayUtils = shaka.util.ArrayUtils;

  describe('partition', () => {
    it('splits into matching and non-matching', () => {
      const [evens, odds] =
        ArrayUtils.partition([1, 2, 3, 4, 5], (x) => x % 2 === 0);
      expect(evens).toEqual([2, 4]);
      expect(odds).toEqual([1, 3, 5]);
    });

    it('returns empty arrays when nothing matches', () => {
      const [yes, no] = ArrayUtils.partition([1, 3, 5], (x) => x % 2 === 0);
      expect(yes).toEqual([]);
      expect(no).toEqual([1, 3, 5]);
    });

    it('returns empty arrays when everything matches', () => {
      const [yes, no] = ArrayUtils.partition([2, 4, 6], (x) => x % 2 === 0);
      expect(yes).toEqual([2, 4, 6]);
      expect(no).toEqual([]);
    });

    it('handles an empty array', () => {
      const [yes, no] = ArrayUtils.partition([], () => true);
      expect(yes).toEqual([]);
      expect(no).toEqual([]);
    });

    it('works with objects', () => {
      const a = {trick: true};
      const b = {trick: false};
      const c = {trick: true};
      const [trick, normal] = ArrayUtils.partition([a, b, c], (x) => x.trick);
      expect(trick).toEqual([a, c]);
      expect(normal).toEqual([b]);
    });
  });

  describe('hasSameElements', () => {
    it('determines same elements', () => {
      expectEqual([], []);
      expectEqual([1, 2, 3], [1, 2, 3]);
      expectEqual([1, 2, 3], [3, 2, 1]);
      expectEqual([1, 1, 2], [1, 2, 1]);
      expectEqual([1, 2, 2, 1], [1, 2, 1, 2]);
      expectEqual([1, NaN, NaN], [NaN, NaN, 1]);

      expectNotEqual([1], [2]);
      expectNotEqual([1, 2], [1]);
      expectNotEqual([1, 1, 2], [1, 2]);
      expectNotEqual([1, 2], [1, 1, 2]);
      expectNotEqual([1, 2], [1, 2, 3]);
      expectNotEqual([1, 2, 3, 1], [1, 2, 1, 2]);
    });

    it('handles different types', () => {
      expectEqual(['1', 2], [2, '1']);
      const a = {};
      expectEqual([a], [a]);
      expectEqual([1, a], [a, 1]);

      expectNotEqual(['f'], [NaN]);
      expectNotEqual([{}], [{}]);
      expectNotEqual([1], [{}]);
      expectNotEqual([1], ['1']);
    });

    it('allows custom comparer', () => {
      const comp = (a, b) => a.i == b.i;
      expectEqual([{i: 1}], [{i: 1}], comp);
      expectEqual([{i: 1}, {i: 2}], [{i: 2}, {i: 1}], comp);
      expectEqual([{i: 1}, {i: 1}], [{i: 1}, {i: 1}], comp);
      expectEqual([{i: 1, x: 1}], [{i: 1, x: 2}], comp);

      expectNotEqual([{i: 1}], [{i: 1}, {i: 1}], comp);
      expectNotEqual([{i: 1}], [{i: 2}], comp);
    });

    function expectEqual(a, b, comp = undefined) {
      expect(ArrayUtils.hasSameElements(a, b, comp)).toBe(true);
    }

    function expectNotEqual(a, b, comp = undefined) {
      expect(ArrayUtils.hasSameElements(a, b, comp)).toBe(false);
    }
  });
});
