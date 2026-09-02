/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Iterables', () => {
  const Iterables = shaka.util.Iterables;

  describe('map', () => {
    it('works with no items', () => {
      const input = new Set([]);
      const output = Array.from(Iterables.map(input, (x) => -x));

      expect(output).toEqual([]);
    });

    it('works with items', () => {
      const input = new Set([1, 2, 3]);
      const output = Array.from(Iterables.map(input, (x) => -x));

      expect(output).toEqual([-1, -2, -3]);
    });
  });

  describe('every', () => {
    it('works with no items', () => {
      const input = new Set([]);
      expect(Iterables.every(input, (x) => x >= 0)).toBeTruthy();
    });

    it('works with items', () => {
      const input = new Set([0, 1, 2, 3]);
      expect(Iterables.every(input, (x) => x >= 0)).toBeTruthy();
      expect(Iterables.every(input, (x) => x > 0)).toBeFalsy();
    });
  });

  describe('some', () => {
    it('works with no items', () => {
      const input = new Set([]);
      expect(Iterables.some(input, (x) => x >= 2)).toBeFalsy();
    });

    it('works with items', () => {
      const input = new Set([0, 1, 2, 3]);
      expect(Iterables.some(input, (x) => x > 2)).toBeTruthy();
      expect(Iterables.some(input, (x) => x < 0)).toBeFalsy();
    });
  });

  describe('filter', () => {
    it('works with no items', () => {
      const input = new Set([]);
      expect(Iterables.filter(input, (x) => x >= 2)).toEqual([]);
    });

    it('works with items', () => {
      const input = new Set([0, 1, 2, 3]);
      // Everything
      expect(Iterables.filter(input, (x) => x < 7)).toEqual([0, 1, 2, 3]);
      // Some things
      expect(Iterables.filter(input, (x) => x < 2)).toEqual([0, 1]);
      // Nothing
      expect(Iterables.filter(input, (x) => x < 0)).toEqual([]);
    });
  });
});
