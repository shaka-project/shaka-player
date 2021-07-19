/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.util.Functional');

goog.require('shaka.Deprecate');


/**
 * @summary A set of functional utility functions.
 */
shaka.util.Functional = class {
  /**
   * Creates a promise chain that calls the given callback for each element in
   * the array in a catch of a promise.
   *
   * e.g.:
   * Promise.reject().catch(callback(array[0])).catch(callback(array[1]));
   *
   * @param {!Array.<ELEM>} array
   * @param {function(ELEM):!Promise.<RESULT>} callback
   * @return {!Promise.<RESULT>}
   * @template ELEM,RESULT
   */
  static createFallbackPromiseChain(array, callback) {
    return array.reduce((promise, elem) => {
      return promise.catch(() => callback(elem));
    }, Promise.reject());
  }


  /**
   * Returns the first array concatenated to the second; used to collapse an
   * array of arrays into a single array.
   *
   * @param {!Array.<T>} all
   * @param {!Array.<T>} part
   * @return {!Array.<T>}
   * @template T
   */
  static collapseArrays(all, part) {
    return all.concat(part);
  }

  /**
   * A no-op function that ignores its arguments.  This is used to suppress
   * unused variable errors.
   * @param {...*} args
   */
  static ignored(...args) {}


  /**
   * A no-op function.  Useful in promise chains.
   */
  static noop() {}


  /**
   * Returns if the given value is not null; useful for filtering out null
   * values.
   *
   * @param {T} value
   * @return {boolean}
   * @template T
   */
  static isNotNull(value) {
    return value != null;
  }

  /**
   * Calls a factory function while allowing it to be a constructor for
   * reverse-compatibility.
   *
   * @param {function():!T} factory
   * @return {!T}
   * @template T
   */
  static callFactory(factory) {
    // See https://stackoverflow.com/q/10428603/1208502
    // eslint-disable-next-line no-restricted-syntax
    const obj = Object.create(factory.prototype || Object.prototype);
    // If this is a constructor, call it with our newly created object to
    // initialize it; if this isn't a constructor, the "this" shouldn't be used
    // since it should be "undefined".
    let ret;
    try {
      ret = factory.call(obj);  // eslint-disable-line no-restricted-syntax

      // If it didn't return anything, assume it is a constructor and return our
      // "this" value instead.
      if (!ret) {
        shaka.Deprecate.deprecateFeature(4,
            'Factories requiring new',
            'Factories should be plain functions');
        ret = obj;
      }
    } catch (e) {
      // This was an ES6 class, so it threw a TypeError because we didn't use
      // "new".  Fall back to actually using "new".
      shaka.Deprecate.deprecateFeature(4,
          'Factories requiring new',
          'Factories should be plain functions');
      const FactoryAsClass = /** @type {function(new: T)} */(factory);
      ret = new FactoryAsClass();
    }
    return ret;
  }
};
