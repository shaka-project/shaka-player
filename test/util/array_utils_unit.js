/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ArrayUtils', () => {
  const ArrayUtils = shaka.util.ArrayUtils;

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
