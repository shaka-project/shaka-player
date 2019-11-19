/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Iterables', () => {
  const Iterables = shaka.util.Iterables;

  describe('map', () => {
    const map = Iterables.map;

    it('works with no items', () => {
      const input = new Set([]);
      const output = Array.from(map(input, (x) => -x));

      expect(output).toEqual([]);
    });

    it('works with items', () => {
      const input = new Set([1, 2, 3]);
      const output = Array.from(map(input, (x) => -x));

      expect(output).toEqual([-1, -2, -3]);
    });
  });

  describe('every', () => {
    const every = Iterables.every;

    it('works with no items', () => {
      const input = new Set([]);
      expect(every(input, (x) => x >= 0)).toBeTruthy();
    });

    it('works with items', () => {
      const input = new Set([0, 1, 2, 3]);
      expect(every(input, (x) => x >= 0)).toBeTruthy();
      expect(every(input, (x) => x > 0)).toBeFalsy();
    });
  });

  describe('some', () => {
    const some = Iterables.some;

    it('works with no items', () => {
      const input = new Set([]);
      expect(some(input, (x) => x >= 2)).toBeFalsy();
    });

    it('works with items', () => {
      const input = new Set([0, 1, 2, 3]);
      expect(some(input, (x) => x > 2)).toBeTruthy();
      expect(some(input, (x) => x < 0)).toBeFalsy();
    });
  });

  describe('filter', () => {
    const filter = Iterables.filter;

    it('works with no items', () => {
      const input = new Set([]);
      expect(filter(input, (x) => x >= 2)).toEqual([]);
    });

    it('works with items', () => {
      const input = new Set([0, 1, 2, 3]);
      // Everything
      expect(filter(input, (x) => x < 7)).toEqual([0, 1, 2, 3]);
      // Some things
      expect(filter(input, (x) => x < 2)).toEqual([0, 1]);
      // Nothing
      expect(filter(input, (x) => x < 0)).toEqual([]);
    });
  });

  describe('enumerate', () => {
    function enumerate(it) {
      return Array.from(Iterables.enumerate(it));
    }

    it('works with no items', () => {
      expect(enumerate([])).toEqual([]);
    });

    it('works with one item', () => {
      expect(enumerate([999]))
          .toEqual([{i: 0, item: 999, prev: undefined, next: undefined}]);
    });

    it('works with special values', () => {
      expect(enumerate([[]]))
          .toEqual([{i: 0, item: [], prev: undefined, next: undefined}]);
      expect(enumerate([0]))
          .toEqual([{i: 0, item: 0, prev: undefined, next: undefined}]);
      expect(enumerate([null]))
          .toEqual([{i: 0, item: null, prev: undefined, next: undefined}]);
      expect(enumerate([undefined]))
          .toEqual([{i: 0, item: undefined, prev: undefined, next: undefined}]);
    });

    it('works with two items', () => {
      expect(enumerate([888, 999]))
          .toEqual([
            {i: 0, item: 888, prev: undefined, next: 999},
            {i: 1, item: 999, prev: 888, next: undefined},
          ]);
    });

    it('works with three items', () => {
      expect(enumerate([777, 888, 999]))
          .toEqual([
            {i: 0, item: 777, prev: undefined, next: 888},
            {i: 1, item: 888, prev: 777, next: 999},
            {i: 2, item: 999, prev: 888, next: undefined},
          ]);
    });

    it('keeps references', () => {
      const expected = [
        {a: 'x'},
        {b: 'y'},
        {c: 'z'},
      ];
      const actual = enumerate(expected);

      expect(actual[0].item).toBe(expected[0]);
      expect(actual[0].next).toBe(expected[1]);

      expect(actual[1].prev).toBe(expected[0]);
      expect(actual[1].item).toBe(expected[1]);
      expect(actual[1].next).toBe(expected[2]);

      expect(actual[2].prev).toBe(expected[1]);
      expect(actual[2].item).toBe(expected[2]);
    });
  });
});
