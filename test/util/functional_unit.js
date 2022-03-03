/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.util.Functional');

describe('Functional', () => {
  const Functional = shaka.util.Functional;

  function supportsEs6Classes() {
    // The callFactory tests should only be run on platforms that support ES6
    // classes.  We need to use classes directly to ensure that callFactory is
    // working correctly.
    try {
      eval('class Foo {}');
      return true;
    } catch (e) {  // eslint-disable-line no-restricted-syntax
      return false;
    }
  }

  filterDescribe('callFactory', supportsEs6Classes, () => {
    // All of the following factories/functions/classes create objects with a
    // field called "val" with a value of 1.  This is a type def to satisfy the
    // compiler.
    /** @typedef {{val: number}} */
    let DummyObjType;

    // Wait to create these in beforeAll().  That way, the calls will not happen
    // on platforms that don't support ES6.  The filter doesn't remove the body
    // of the "describe" block, only the bodies of before/after and it.
    /** @type {function():DummyObjType} */
    let FactoryFunction;
    /** @type {function():DummyObjType} */
    let FactoryArrowFunction;
    /** @type {function():DummyObjType} */
    let Es5ConstructorFunction;
    /** @type {function():DummyObjType} */
    let Es6Class;

    beforeAll(() => {
      // Normally, our tests are transpiled by Babel to allow them to run on all
      // browsers.  However, that would convert all of these into plain
      // functions, which would defeat the purpose.  Therefore, we're using eval
      // to make sure these get defined in exactly this way.  Furthermore, to
      // make sure these are returned to names that are in scope of this test
      // suite in strict mode (used by Babel), each eval must use an assignment
      // syntax to a dummy variable, then return it.
      FactoryFunction = /** @type {function():DummyObjType} */(eval(
          'const f = function() { return { val: 1 }; }; f;'));
      FactoryArrowFunction = /** @type {function():DummyObjType} */(eval(
          'const f = () => { return { val: 1 }; }; f;'));
      Es5ConstructorFunction = /** @type {function():DummyObjType} */(eval(
          'const f = function() { this.val = 1; }; f;'));
      Es6Class = /** @type {function():DummyObjType} */(eval(
          'const f = class { constructor() { this.val = 1; } }; f;'));
    });

    it('supports true factory functions', () => {
      const obj = Functional.callFactory(FactoryFunction);
      expect(obj.val).toBe(1);
    });

    it('supports true factory arrow functions', () => {
      const obj = Functional.callFactory(FactoryArrowFunction);
      expect(obj.val).toBe(1);
    });

    it('supports ES5 constructor functions', () => {
      const obj = Functional.callFactory(Es5ConstructorFunction);
      expect(obj.val).toBe(1);
    });

    // Regression test for https://github.com/shaka-project/shaka-player/issues/2958
    it('supports ES6 classes', () => {
      const obj = Functional.callFactory(Es6Class);
      expect(obj.val).toBe(1);
    });
  });
});
