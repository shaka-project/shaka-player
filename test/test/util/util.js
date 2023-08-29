/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @extends {Promise}
 */
shaka.test.StatusPromise = class {
  /**
   * @param {!Promise} p
   * @return {!Object}
   */
  constructor(p) {
    /** @type {string} */
    this.status;

    // TODO: investigate using expectAsync() for this when possible.
    const p2 = /** @type {!shaka.test.StatusPromise} */(p);
    p2.status = 'pending';
    p2.then(() => {
      p2.status = 'resolved';
    }, () => {
      p2.status = 'rejected';
    });
    return p2;
  }
};

shaka.test.Util = class {
  /**
   * Fakes an event loop. Each tick processes some number of instantaneous
   * operations and advances the simulated clock forward by 1 second. Calls
   * onTick just before each tick if it's specified.
   *
   * @param {number} duration The number of seconds of simulated time.
   * @param {function(number)=} onTick
   */
  static async fakeEventLoop(duration, onTick) {
    // Run this synchronously:
    for (let time = 0; time < duration; time++) {
      // We shouldn't need more than 6 rounds.
      for (let i = 0; i < 6; i++) {
        jasmine.clock().tick(0);
        await Promise.resolve();  // eslint-disable-line no-await-in-loop
      }

      if (onTick) {
        await onTick(time);  // eslint-disable-line no-await-in-loop
      }
      jasmine.clock().tick(1000);
      // eslint-disable-next-line no-await-in-loop
      await Promise.resolve();
    }
  }

  /**
   * Returns a Promise which is resolved after the given delay.
   *
   * @param {number} seconds The delay in seconds.
   * @param {function(function(), number)=} realSetTimeout
   * @return {!Promise}
   */
  static delay(seconds, realSetTimeout) {
    return new Promise(((resolve, reject) => {
      const timeout = realSetTimeout || setTimeout;
      timeout(() => {
        resolve();
      }, seconds * 1000.0);
    }));
  }

  /**
   * Returns a Promise which is resolved after a short delay.  This should be
   * used for cases where we need to wait for a setTimeout(0) or a Promise to
   * be handled.
   *
   * @param {function(function(), number)=} realSetTimeout
   * @return {!Promise}
   */
  static shortDelay(realSetTimeout) {
    const delay = 0.01;
    return shaka.test.Util.delay(delay, realSetTimeout);
  }

  /**
   * Creates a custom matcher object that matches a number that is close to the
   * given value.
   *
   * @param {number} val
   * @param {number=} maxDelta
   * @return {number}
   */
  static closeTo(val, maxDelta = 0.000001) {
    const E = /** @type {number} */(maxDelta);
    return /** @type {number} */(/** @type {?} */({
      asymmetricMatch: (other) => other >= val - E && other <= val + E,
      jasmineToString: () => '<closeTo: ' + val + '>',
    }));
  }

  /**
   * @param {!shaka.util.Error} error
   * @return {jasmine.ObjectContainingType}
   */
  static jasmineError(error) {
    // NOTE: Safari will add extra properties to any thrown object, and some of
    // the properties we compute in debug builds are unhelpful and introduce
    // inconsistency in tests.  Therefore we only capture the critical fields
    // below.
    const {severity, category, code, data} = error;
    return jasmine.objectContaining({severity, category, code, data});
  }

  /**
   * @param {*} actual
   * @param {!shaka.util.Error} expected
   */
  static expectToEqualError(actual, expected) {
    expect(actual).toEqual(shaka.test.Util.jasmineError(expected));
  }

  /**
   * @param {?} actual
   * @param {!Element} expected
   * @return {!Object} result
   * @private
   */
  static expectToEqualElementCompare_(actual, expected) {
    const diff =
        shaka.test.Util.expectToEqualElementRecursive_(actual, expected);
    const result = {};
    result.pass = diff == null;
    if (result.pass) {
      result.message = 'Expected ' + actual.innerHTML + ' not to match ';
      result.message += expected.innerHTML + '.';
    } else {
      result.message = 'Expected ' + actual.innerHTML + ' to match ';
      result.message += expected.innerHTML + '. ' + diff;
    }
    return result;
  }

  /**
   * @param {?} actual
   * @param {!Node} expected
   * @return {?string} failureReason
   * @private
   */
  static expectToEqualElementRecursive_(actual, expected) {
    const prospectiveDiff = 'The difference was in ' +
        (actual.outerHTML || actual.textContent) + ' vs ' +
        (expected['outerHTML'] || expected.textContent) + ': ';
    const getAttr = (obj, attr) => {
      if (attr.namespaceURI) {
        return shaka.util.XmlUtils.getAttributeNS(
            obj, attr.namespaceURI, attr.localName);
      } else {
        return obj.getAttribute(attr.localName);
      }
    };

    if (!(actual instanceof Element) && !(expected instanceof Element)) {
      // Compare them as nodes.
      if (actual.textContent != expected.textContent) {
        return prospectiveDiff + 'Nodes are different.';
      }
    } else if (!(actual instanceof Element) || !(expected instanceof Element)) {
      return prospectiveDiff + 'One is element, one isn\'t.';
    } else {
      // Compare them as elements.
      if (actual.tagName != expected.tagName) {
        return prospectiveDiff + 'Different tagName.';
      }

      if (actual.attributes.length != expected.attributes.length) {
        return prospectiveDiff + 'Different attribute list length.';
      }
      for (const attr of Array.from(actual.attributes)) {
        const valueA = getAttr(actual, attr);
        const valueB = getAttr(expected, attr);
        if (valueA != valueB) {
          const name = (attr.prefix ? attr.prefix + ':' : '') + attr.localName;
          return `${prospectiveDiff} Attribute ${name} was different ` +
                 `(${valueA} vs ${valueB})`;
        }
      }

      if (actual.childNodes.length != expected.childNodes.length) {
        return prospectiveDiff + 'Different child node list length.';
      }
      for (let i = 0; i < actual.childNodes.length; i++) {
        const aNode = actual.childNodes[i];
        const eNode = expected.childNodes[i];
        const diff =
            shaka.test.Util.expectToEqualElementRecursive_(aNode, eNode);
        if (diff) {
          return diff;
        }
      }
    }

    return null;
  }

  /**
   * Custom comparer for segment references.
   * @param {*} first
   * @param {*} second
   * @return {boolean|undefined}
   */
  static compareReferences(first, second) {
    const isSegment = first instanceof shaka.media.SegmentReference &&
        second instanceof shaka.media.SegmentReference;
    const isInit = first instanceof shaka.media.InitSegmentReference &&
        second instanceof shaka.media.InitSegmentReference;
    if (isSegment || isInit) {
      const firstRef = /** @type {shaka.media.AnySegmentReference} */(first);
      const secondRef = /** @type {shaka.media.AnySegmentReference} */(second);
      const a = firstRef.getUris();
      const b = secondRef.getUris();
      if (typeof a !== 'object' || typeof b !== 'object' ||
          typeof a.length != 'number' || typeof b.length !== 'number') {
        return false;
      }
      if (a.length != b.length ||
          !a.every((x, i) => { return x == b[i]; })) {
        return false;
      }

      // Make shallow copies of each, without their getUris fields.
      const trimmedFirst = Object.assign({}, /** @type {Object} */(firstRef));
      delete trimmedFirst['getUris'];
      delete trimmedFirst['getUrisInner'];
      const trimmedSecond = Object.assign({}, /** @type {Object} */(secondRef));
      delete trimmedSecond['getUris'];
      delete trimmedSecond['getUrisInner'];

      // Compare those using Jasmine's utility, which will compare the fields of
      // an object and the items of an array.
      const customEqualityTesters = [
        shaka.test.Util.compareReferences,
      ];
      return jasmine.matchersUtil.equals(
          trimmedFirst, trimmedSecond, customEqualityTesters);
    }

    return undefined;
  }

  /**
   * Fetches the resource at the given URI.
   *
   * @param {string} uri
   * @return {!Promise.<!ArrayBuffer>}
   */
  static async fetch(uri) {
    const response = await fetch(uri);
    if (!response.ok) {
      throw new Error('shaka.test.Util.fetch failed: ' + uri);
    }
    return response.arrayBuffer();
  }

  /**
   * Accepts a mock object (i.e. a simple JavaScript object composed of jasmine
   * spies) and makes it strict.  This means that every spy in the given object
   * will be made to throw an exception by default.
   * @param {!Object} obj
   */
  static makeMockObjectStrict(obj) {
    for (const name in obj) {
      obj[name].and.throwError(new Error(name));
    }
  }

  /**
   * @param {!Function} func
   * @return {!jasmine.Spy}
   */
  static funcSpy(func) {
    return /** @type {!jasmine.Spy} */(func);
  }

  /**
   * @param {!jasmine.Spy} spy
   * @return {!Function}
   */
  static spyFunc(spy) {
    return spy;
  }

  /**
   * @param {!jasmine.Spy} spy
   * @param {...*} varArgs
   * @return {*}
   */
  static invokeSpy(spy, ...varArgs) {
    // TODO: There should be a way to alter the externs for jasmine.Spy so that
    // this utility is not needed.
    // Why isn't there something like ICallable in Closure?
    // https://github.com/shaka-project/closure-compiler/issues/946
    // Why isn't it enough that jasmine.Spy extends Function?
    // https://github.com/shaka-project/closure-compiler/issues/1422
    return /** @type {Function} */(spy)(...varArgs);
  }
};

/**
 * @const
 * @private
 */
shaka.test.Util.customMatchers_ = {
  // Custom matcher for Element objects.
  toEqualElement: (util) => {
    return {
      compare: shaka.test.Util.expectToEqualElementCompare_,
    };
  },
  // Custom matcher for working with spies.
  toHaveBeenCalledOnceMore: (util) => {
    return {
      compare: (actual, expected) => {
        const callCount = actual.calls.count();

        const result = {};

        if (callCount != 1) {
          result.pass = false;
          result.message = 'Expected to be called once, not ' + callCount;
        } else {
          result.pass = true;
        }

        actual.calls.reset();

        return result;
      },
    };
  },
  toHaveBeenCalledOnceMoreWith: (util) => {
    return {
      compare: (actual, expected) => {
        const callCount = actual.calls.count();
        const callArgs = callCount > 0 ?
                         actual.calls.mostRecent().args :
                         [];

        const result = {};

        if (callCount != 1) {
          result.pass = false;
          result.message = 'Expected to be called once, not ' + callCount;
        } else if (!util.equals(callArgs, expected)) {
          result.pass = false;
          result.message =
              'Expected to be called with ' + expected + ' not ' + callArgs;
        } else {
          result.pass = true;
        }

        actual.calls.reset();

        return result;
      },
    };
  },
};

beforeEach(() => {
  jasmine.addCustomEqualityTester(shaka.test.Util.compareReferences);
  jasmine.addMatchers(shaka.test.Util.customMatchers_);
});
