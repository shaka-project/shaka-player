/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:dictionaries lorem-ipsum

describe('ObjectUtils', () => {
  const ObjectUtils = shaka.util.ObjectUtils;

  describe('cloneObject', () => {
    it('clones values and plain objects', () => {
      expect(ObjectUtils.cloneObject(2)).toBe(2);
      expect(ObjectUtils.cloneObject('foo')).toBe('foo');
      expect(ObjectUtils.cloneObject(false)).toBe(false);

      let o = {foo: 'bar', count: 123};
      let copy = ObjectUtils.cloneObject(o);
      expect(copy).not.toBe(o);
      expect(copy).toEqual(o);

      o = [1, 2, undefined, 4, 5];
      copy = ObjectUtils.cloneObject(o);
      expect(copy).not.toBe(o);
      expect(copy).toEqual(o);
    });

    it('clones nested objects', () => {
      const o = {
        foo: 'bar',
        lorem: 'ipsum',
        dolor: {
          sit: 123,
          amet: ',',
          consectetur: {},
          adipiscing: [1, 2, 3],
          elit: [
            1, null,
            {
              sed: null,
              do_: undefined,
              eiusmod: [],
            },
          ],
        },
        player: {
          other: 123,
        },
      };
      const copy = ObjectUtils.cloneObject(o);
      expect(copy).not.toBe(o);
      expect(copy).toEqual(o);
    });

    it('clones Arrays with non-default length', () => {
      const a = [1, 2, 3];
      a.length = 10;
      const copy = ObjectUtils.cloneObject(a);
      expect(copy).toEqual(a);
      expect(copy.length).toBe(10);
    });

    it('ignores cyclic objects', () => {
      const o = {foo: 'bar'};
      o['baz'] = o;
      expect(ObjectUtils.cloneObject(o)).toEqual({foo: 'bar', baz: null});
    });

    it('ignores non-simple Object objects', () => {
      let o = {foo: 1, baz: /foo/g};
      expect(ObjectUtils.cloneObject(o)).toEqual({foo: 1, baz: null});

      o = {foo: 2, baz: new Date(123)};
      expect(ObjectUtils.cloneObject(o)).toEqual({foo: 2, baz: null});

      o = {foo: 3, baz: document.createElement('div')};
      expect(ObjectUtils.cloneObject(o)).toEqual({foo: 3, baz: null});
    });
  });
});
