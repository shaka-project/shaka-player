/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.test.Util');
goog.require('shaka.util.MultiMap');

describe('MultiMap', () => {
  /** @type {shaka.util.MultiMap<number>} */
  let map;
  beforeEach(() => {
    map = new shaka.util.MultiMap();
  });

  describe('push', () => {
    it('makes new key-buckets', () => {
      expect(map.size()).toBe(0);
      map.push('a', 1);
      expect(map.size()).toBe(1);
    });

    it('adds objects to existing key-buckets', () => {
      map.push('a', 1);
      expect(map.size()).toBe(1);
      map.push('a', 2);
      expect(map.size()).toBe(1);
    });
  });

  describe('get', () => {
    it('returns values for a key', () => {
      map.push('a', 1);
      map.push('a', 2);
      expect(map.get('a')).toEqual([1, 2]);
    });

    it('returns null for an unused key', () => {
      map.push('a', 1);
      expect(map.get('b')).toBeNull();
    });

    it('returns null for a key with all values removed', () => {
      map.push('a', 1);
      expect(map.get('a')).toEqual([1]);
      map.remove('a', 1);
      expect(map.get('b')).toBeNull();
    });
  });

  describe('getAll', () => {
    it('gets all values among all keys', () => {
      map.push('a', 1);
      map.push('b', 2);
      map.push('c', 3);
      map.push('c', 4);
      expect(map.getAll()).toEqual([1, 2, 3, 4]);
    });
  });

  describe('remove', () => {
    it('removes values that were added', () => {
      map.push('a', 1);
      map.push('a', 2);
      expect(map.get('a')).toEqual([1, 2]);
      map.remove('a', 1);
      expect(map.get('a')).toEqual([2]);
    });
  });

  describe('clear', () => {
    it('removes all values', () => {
      map.push('a', 1);
      map.push('b', 2);
      map.push('c', 3);
      map.push('c', 4);
      map.clear();
      expect(map.size()).toBe(0);
    });
  });

  describe('forEach', () => {
    it('iterates over all values', () => {
      map.push('a', 1);
      map.push('b', 2);
      map.push('c', 3);
      map.push('c', 4);
      const callbackSpy = jasmine.createSpy('callbackSpy');
      map.forEach(shaka.test.Util.spyFunc(callbackSpy));
      expect(callbackSpy).toHaveBeenCalledTimes(3);
      expect(callbackSpy).toHaveBeenCalledWith('a', [1]);
      expect(callbackSpy).toHaveBeenCalledWith('b', [2]);
      expect(callbackSpy).toHaveBeenCalledWith('c', [3, 4]);
    });
  });
});
