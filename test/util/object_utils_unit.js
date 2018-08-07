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

describe('ObjectUtils', function() {
  const ObjectUtils = shaka.util.ObjectUtils;

  describe('cloneObject', function() {
    const cloneObject = ObjectUtils.cloneObject;

    it('clones values and plain objects', function() {
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

    it('clones nested objects', function() {
      let o = {
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
      let copy = cloneObject(o);
      expect(copy).not.toBe(o);
      expect(copy).toEqual(o);
    });

    it('clones Arrays with non-default length', function() {
      let a = [1, 2, 3];
      a.length = 10;
      let copy = cloneObject(a);
      expect(copy).toEqual(a);
      expect(copy.length).toEqual(10);
    });

    it('ignores cyclic objects', function() {
      let o = {foo: 'bar'};
      o['baz'] = o;
      expect(cloneObject(o)).toEqual({foo: 'bar', baz: null});
    });

    it('ignores non-simple Object objects', function() {
      let o = {foo: 1, baz: /foo/g};
      expect(cloneObject(o)).toEqual({foo: 1, baz: null});

      o = {foo: 2, baz: new Date(123)};
      expect(cloneObject(o)).toEqual({foo: 2, baz: null});

      o = {foo: 3, baz: document.createElement('div')};
      expect(cloneObject(o)).toEqual({foo: 3, baz: null});
    });
  });
});
