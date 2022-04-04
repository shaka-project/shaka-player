/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.StatusPromise');
goog.provide('shaka.test.Util');

goog.require('goog.asserts');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.XmlUtils');
goog.requireType('shaka.util.Error');


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
   * @return {number}
   */
  static closeTo(val) {
    const E = 0.000001;
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
  static fetch(uri) {
    return new Promise(((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', uri, /* asynchronous= */ true);
      xhr.responseType = 'arraybuffer';

      xhr.onload = (event) => {
        if (xhr.status >= 200 &&
            xhr.status <= 299 &&
            !!xhr.response) {
          resolve(/** @type {!ArrayBuffer} */(xhr.response));
        } else {
          let message = '';
          if (xhr.response) {
            message = ': ' + shaka.util.StringUtils.fromUTF8(
                /** @type {!ArrayBuffer} */(xhr.response));
          }
          reject(xhr.status + message);
        }
      };

      xhr.onerror = (event) => {
        reject('shaka.test.Util.fetch failed: ' + uri);
      };

      xhr.send(/* body= */ null);
    }));
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

  /**
   * Waits for a particular font to be loaded.  Useful in screenshot tests to
   * make sure we have consistent results with regard to the web fonts we load
   * in the UI.
   *
   * @param {string} name
   * @return {!Promise}
   */
  static async waitForFont(name) {
    await new Promise((resolve, reject) => {
      // https://github.com/zachleat/fontfaceonload
      // eslint-disable-next-line new-cap
      FontFaceOnload(name, {
        success: resolve,
        error: () => {
          reject(new Error('Timeout waiting for font ' + name + ' to load'));
        },
        timeout: 10 * 1000,  // ms
      });
    });

    // Wait one extra tick to make sure the font rendering on the page has been
    // updated.  Without this, we saw some rare test flake in Firefox on Mac.
    await this.shortDelay();
  }

  /**
   * Checks with Karma to see if this browser can take a screenshot.
   *
   * Only WebDriver-connected browsers can take a screenshot, and only Karma
   * knows if the browser is connected via WebDriver.  So this must be checked
   * in Karma via an HTTP request.
   *
   * @return {!Promise.<boolean>}
   */
  static async supportsScreenshots() {
    // We need our own ID for Karma to look up the WebDriver connection.
    // For manually-connected browsers, this ID may not exist.  In those cases,
    // this method is expected to return false.
    const parentUrlParams = window.parent.location.search;

    const buffer = await shaka.test.Util.fetch(
        '/screenshot/isSupported' + parentUrlParams);
    const json = shaka.util.StringUtils.fromUTF8(buffer);
    const ok = /** @type {boolean} */(JSON.parse(json));
    return ok;
  }

  /**
   * Asks Karma to take a screenshot for us via the WebDriver connection and
   * compare it to the "official" screenshot for this test and platform.  Sets
   * an expectation that the new screenshot does not differ from the official
   * screenshot more than a fixed threshold.
   *
   * Only works on browsers connected via WebDriver.  Use supportsScreenshots()
   * to filter screenshot-dependent tests.
   *
   * @param {!HTMLElement} element The HTML element to screenshot.  Must be
   *   within the bounds of the viewport.
   * @param {string} name An identifier for the screenshot.  Use alphanumeric
   *   plus dash and underscore only.
   * @param {number} minSimilarity A minimum similarity score between 0 and 1.
   * @return {!Promise}
   */
  static async checkScreenshot(element, name, minSimilarity=1) {
    // Make sure the DOM is up-to-date and layout has settled before continuing.
    // Without this delay, or with a shorter delay, we sometimes get missing
    // elements in our UITextDisplayer tests on some platforms.
    await this.delay(0.1);

    // We need our own ID for Karma to look up the WebDriver connection.
    // By this point, we should have passed supportsScreenshots(), so the ID
    // should definitely be there.
    const parentUrlParams = window.parent.location.search;
    goog.asserts.assert(parentUrlParams.includes('id='), 'No ID in URL!');

    // Tests run in an iframe.  So we also need the coordinates of that iframe
    // within the page, so that the screenshot can be consistently cropped to
    // the element we care about.
    const iframe = /** @type {HTMLIFrameElement} */(
      window.parent.document.getElementById('context'));
    const iframeRect = iframe.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const x = iframeRect.left + elementRect.left;
    const y = iframeRect.top + elementRect.top;
    const width = elementRect.width;
    const height = elementRect.height;

    // Furthermore, the screenshot may not be at the scale you expect.  Measure
    // the browser window size in JavaScript and communicate that to Karma, too,
    // so it can convert coordinates before cropping.  This value, as opposed to
    // document.body.getBoundingClientRect(), seems to most accurately reflect
    // the size of the screenshot area.
    const bodyWidth = window.parent.innerWidth;
    const bodyHeight = window.parent.innerHeight;

    // In addition to the id param from the top-level window, pass these
    // parameters to the screenshot endpoint in Karma.
    const params = {x, y, width, height, bodyWidth, bodyHeight, name};

    let paramsString = '';
    for (const k in params) {
      paramsString += '&' + k + '=' + params[k];
    }

    const buffer = await shaka.test.Util.fetch(
        '/screenshot/diff' + parentUrlParams + paramsString);
    const json = shaka.util.StringUtils.fromUTF8(buffer);
    const similarity = /** @type {number} */(JSON.parse(json));

    // If the minimum similarity is not met, you can review the new screenshot
    // and the diff image in the screenshots folder.  Look for images that end
    // with "-new" and "-diff".  (NOTE: The diff is a pixel-wise diff for human
    // review, and is not produced with the same structural similarity
    // algorithm used to detect changes in the test.)  If cropping doesn't work
    // right, you can view the full-page screenshot in the image that ends with
    // "-full".
    expect(similarity).withContext(name).not.toBeLessThan(minSimilarity);
  }
};

/**
 * @const
 * @private
 */
shaka.test.Util.customMatchers_ = {
  // Custom matcher for Element objects.
  toEqualElement: (util, customEqualityTesters) => {
    return {
      compare: shaka.test.Util.expectToEqualElementCompare_,
    };
  },
  // Custom matcher for working with spies.
  toHaveBeenCalledOnceMore: (util, customEqualityTesters) => {
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
  toHaveBeenCalledOnceMoreWith: (util, customEqualityTesters) => {
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
        } else if (!util.equals(callArgs, expected, customEqualityTesters)) {
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
