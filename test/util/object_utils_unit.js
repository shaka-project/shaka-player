/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ObjectUtils', () => {
  const ObjectUtils = shaka.util.ObjectUtils;

  describe('cloneObject', () => {
    const cloneObject = ObjectUtils.cloneObject;

    it('clones values and plain objects', () => {
      expect(cloneObject(2)).toBe(2);
      expect(cloneObject('foo')).toBe('foo');
      expect(cloneObject(false)).toBe(false);

      let o = {foo: 'bar', count: 123};
      let copy = cloneObject(o);
      expect(copy).not.toBe(o);
      expect(copy).toEqual(o);

      o = [1, 2, undefined, 4, 5];
      copy = cloneObject(o);
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
          adipisecing: [1, 2, 3],
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
      const copy = cloneObject(o);
      expect(copy).not.toBe(o);
      expect(copy).toEqual(o);
    });

    it('clones Arrays with non-default length', () => {
      const a = [1, 2, 3];
      a.length = 10;
      const copy = cloneObject(a);
      expect(copy).toEqual(a);
      expect(copy.length).toBe(10);
    });

    it('ignores cyclic objects', () => {
      const o = {foo: 'bar'};
      o['baz'] = o;
      expect(cloneObject(o)).toEqual({foo: 'bar', baz: null});
    });

    it('ignores non-simple Object objects', () => {
      let o = {foo: 1, baz: /foo/g};
      expect(cloneObject(o)).toEqual({foo: 1, baz: null});

      o = {foo: 2, baz: new Date(123)};
      expect(cloneObject(o)).toEqual({foo: 2, baz: null});

      o = {foo: 3, baz: document.createElement('div')};
      expect(cloneObject(o)).toEqual({foo: 3, baz: null});
    });
  });
});
