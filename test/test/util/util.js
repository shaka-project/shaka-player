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

goog.provide('shaka.test.StatusPromise');
goog.provide('shaka.test.Util');


/**
 * @param {!Promise} p
 * @constructor
 * @struct
 * @extends {Promise}
 * @returns {!shaka.test.StatusPromise}
 */
shaka.test.StatusPromise = function(p) {
  // TODO: investigate using PromiseMock for this when possible.
  p.status = 'pending';
  p.then(function() {
    p.status = 'resolved';
  }, function() {
    p.status = 'rejected';
  });
  return /** @type {!shaka.test.StatusPromise} */(p);
};


/** @type {string} */
shaka.test.StatusPromise.prototype.status;


/**
 * Fakes an event loop. Each tick processes some number of instantaneous
 * operations and advances the simulated clock forward by 1 second. Calls
 * onTick just before each tick if it's specified.
 *
 * @param {number} duration The number of seconds of simulated time.
 * @param {function(number)=} onTick
 */
shaka.test.Util.fakeEventLoop = function(duration, onTick) {
  expect(window.Promise).toBe(PromiseMock);

  // Run this synchronously:
  for (let time = 0; time < duration; ++time) {
    // We shouldn't need more than 6 rounds.
    for (let i = 0; i < 6; ++i) {
      jasmine.clock().tick(0);
      PromiseMock.flush();
    }

    if (onTick) {
      onTick(time);
    }
    jasmine.clock().tick(1000);
    PromiseMock.flush();
  }
};


/**
 * Returns a Promise which is resolved after the given delay.
 *
 * @param {number} seconds The delay in seconds.
 * @param {function(function(), number)=} realSetTimeout
 * @return {!Promise}
 */
shaka.test.Util.delay = function(seconds, realSetTimeout) {
  return new Promise(function(resolve, reject) {
    let timeout = realSetTimeout || setTimeout;
    timeout(function() {
      resolve();
      // Play nicely with PromiseMock by flushing automatically.
      if (window.Promise == PromiseMock) {
        PromiseMock.flush();
      }
    }, seconds * 1000.0);
  });
};


/**
 * Creates a custom matcher object that matches a number that is close to the
 * given value.
 *
 * @param {number} val
 * @return {number}
 */
shaka.test.Util.closeTo = function(val) {
  const E = 0.000001;
  return /** @type {number} */(/** @type {?} */({
    asymmetricMatch: (other) => other >= val - E && other <= val + E,
    jasmineToString: () => '<closeTo: ' + val + '>',
  }));
};


/**
 * @param {!shaka.util.Error} error
 * @return {*}
 */
shaka.test.Util.jasmineError = function(error) {
  // NOTE: Safari will add extra properties to any thrown object, and some of
  // the properties we compute in debug builds are unhelpful and introduce
  // inconsistency in tests.  Therefore we only capture the critical fields
  // below.
  const {severity, category, code, data} = error;
  return jasmine.objectContaining({severity, category, code, data});
};


/**
 * @param {*} actual
 * @param {!shaka.util.Error} expected
 */
shaka.test.Util.expectToEqualError = function(actual, expected) {
  expect(actual).toEqual(shaka.test.Util.jasmineError(expected));
};


/**
 * @param {?} actual
 * @param {!Element} expected
 * @return {!Object} result
 * @private
 */
shaka.test.Util.expectToEqualElementCompare_ = function(actual, expected) {
  let diff = shaka.test.Util.expectToEqualElementRecursive_(actual, expected);
  let result = {};
  result.pass = diff == null;
  if (result.pass) {
    result.message = 'Expected ' + actual.innerHTML + ' not to match ';
    result.message += expected.innerHTML + '.';
  } else {
    result.message = 'Expected ' + actual.innerHTML + ' to match ';
    result.message += expected.innerHTML + '. ' + diff;
  }
  return result;
};


/**
 * @param {?} actual
 * @param {!Node} expected
 * @return {?string} failureReason
 * @private
 */
shaka.test.Util.expectToEqualElementRecursive_ = function(actual, expected) {
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
      let aNode = actual.childNodes[i];
      let eNode = expected.childNodes[i];
      let diff = shaka.test.Util.expectToEqualElementRecursive_(aNode, eNode);
      if (diff) {
        return diff;
      }
    }
  }

  return null;
};


/**
 * Custom comparer for segment references.
 * @param {*} first
 * @param {*} second
 * @return {boolean|undefined}
 */
shaka.test.Util.compareReferences = function(first, second) {
  let isSegment = first instanceof shaka.media.SegmentReference &&
      second instanceof shaka.media.SegmentReference;
  let isInit = first instanceof shaka.media.InitSegmentReference &&
      second instanceof shaka.media.InitSegmentReference;
  if (isSegment || isInit) {
    let a = first.getUris();
    let b = second.getUris();
    if (typeof a !== 'object' || typeof b !== 'object' ||
        typeof a.length != 'number' || typeof b.length !== 'number') {
      return false;
    }
    if (a.length != b.length ||
        !a.every(function(x, i) { return x == b[i]; })) {
      return false;
    }
  }
  if (isSegment) {
    return first.position == second.position &&
        first.startTime == second.startTime &&
        first.endTime == second.endTime &&
        first.startByte == second.startByte &&
        first.endByte == second.endByte;
  }
  if (isInit) {
    return first.startByte == second.startByte &&
        first.endByte == second.endByte;
  }
};


/**
 * Fetches the resource at the given URI.
 *
 * @param {string} uri
 * @return {!Promise.<!ArrayBuffer>}
 */
shaka.test.Util.fetch = function(uri) {
  return new Promise(function(resolve, reject) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', uri, true /* asynchronous */);
    xhr.responseType = 'arraybuffer';

    xhr.onload = function(event) {
      if (xhr.status >= 200 &&
          xhr.status <= 299 &&
          !!xhr.response) {
        resolve(/** @type {!ArrayBuffer} */(xhr.response));
      } else {
        reject(xhr.status);
      }
    };

    xhr.onerror = function(event) {
      reject('shaka.test.Util.fetch failed: ' + uri);
    };

    xhr.send(null /* body */);
  });
};


/**
 * Accepts a mock object (i.e. a simple JavaScript object composed of jasmine
 * spies) and makes it strict.  This means that every spy in the given object
 * will be made to throw an exception by default.
 * @param {!Object} obj
 */
shaka.test.Util.makeMockObjectStrict = function(obj) {
  for (let name in obj) {
    obj[name].and.throwError(new Error(name));
  }
};


/**
 * @param {!jasmine.Spy} spy
 * @return {!Function}
 */
shaka.test.Util.spyFunc = function(spy) {
  return spy;
};


/**
 * @param {!jasmine.Spy} spy
 * @param {...*} varArgs
 * @return {*}
 */
shaka.test.Util.invokeSpy = function(spy, varArgs) {
  return spy.apply(null, Array.prototype.slice.call(arguments, 1));
};


/**
 * @param {boolean} loadUncompiled
 * @return {*}
 */
shaka.test.Util.loadShaka = async function(loadUncompiled) {
  /** @type {!shaka.util.PublicPromise} */
  const loaded = new shaka.util.PublicPromise();
  let compiledShaka;
  if (loadUncompiled) {
    // For debugging purposes, use the uncompiled library.
    compiledShaka = shaka;
    loaded.resolve();
  } else {
    // Load the compiled library as a module.
    // All tests in this suite will use the compiled library.
    require(['/base/dist/shaka-player.ui.js'], (shakaModule) => {
      compiledShaka = shakaModule;
      compiledShaka.net.NetworkingEngine.registerScheme(
          'test', shaka.test.TestScheme);
      compiledShaka.media.ManifestParser.registerParserByMime(
          'application/x-test-manifest',
          shaka.test.TestScheme.ManifestParser);

      loaded.resolve();
    }, (error) => {
      loaded.reject('Failed to load compiled player.');
      shaka.log.error('Error loading compiled player.', error);
    });
  }

  await loaded;
  return compiledShaka;
};


/**
 * @param {!Element} cssLink
 */
shaka.test.Util.setupCSS = async function(cssLink) {
  const head = document.head;
  cssLink.type = 'text/css';
  cssLink.rel = 'stylesheet/less';
  cssLink.href ='/base/ui/controls.less';
  head.appendChild(cssLink);

  // LESS script has been added at the beginning of the test pass
  // (in test/test/boot.js). This tells it that we've added a new
  // stylesheet, so LESS can process it.
  less.registerStylesheetsImmediately();
  await less.refresh(/* reload */ true,
    /* modifyVars*/ false, /* clearFileCache */ false);
};

/**
 * Thoroughly clean up after UI-related tests.
 *
 * The UI tests can create lots of DOM elements (including videos) that are
 * easy to lose track of.  This is a universal cleanup system to avoid leaving
 * anything behind.
 */
shaka.test.Util.cleanupUI = async function() {
  // If we don't clean up the UI, these tests could pollute the environment
  // for other tests that run later, causing failures in unrelated tests.
  // This is causing particular issues on Tizen.
  const containers =
      document.querySelectorAll('[data-shaka-player-container]');

  const destroys = [];
  for (let container of containers) {
    const ui = /** @type {shaka.ui.Overlay} */(container['ui']);

    // Destroying the UI destroys the controls and player inside.
    destroys.push(ui.destroy());
  }
  await Promise.all(destroys);

  // Now remove all the containers from the DOM.
  for (let container of containers) {
    container.parentElement.removeChild(container);
  }
};

/**
 * Wait for the video playhead to move forward by some meaningful delta.
 * If this happens before |timeout| seconds pass, the Promise is resolved.
 * Otherwise, the Promise is rejected.
 *
 * @param {shaka.util.EventManager} eventManager
 * @param {!HTMLMediaElement} target
 * @param {number} timeout in seconds, after which the Promise fails
 * @return {!Promise}
 */
shaka.test.Util.waitForMovementOrFailOnTimeout =
    (eventManager, target, timeout) => {
  // TODO: Refactor all the wait utils into a class that avoids repeated args
  const timeGoal = target.currentTime + 1;
  let goalMet = false;
  const startTime = Date.now();
  console.assert(!target.ended, 'Video should not be ended!');
  shaka.log.info('Waiting for movement from', target.currentTime,
                 'to', timeGoal);

  return new Promise((resolve, reject) => {
    eventManager.listen(target, 'timeupdate', () => {
      if (target.currentTime >= timeGoal || target.ended) {
        goalMet = true;
        const endTime = Date.now();
        const seconds = ((endTime - startTime) / 1000).toFixed(2);
        shaka.log.info('Movement goal met after ' + seconds + ' seconds');

        eventManager.unlisten(target, 'timeupdate');
        resolve();
      }
    });

    shaka.test.Util.delay(timeout).then(() => {
      // This check is only necessary to supress the error log.  It's fine to
      // unlisten twice or to reject after resolve.  Neither of those actions
      // matter.  But the error log can be confusing during debugging if we
      // have already met the movement goal.
      if (!goalMet) {
        const buffered = [];
        for (let i = 0; i < target.buffered.length; ++i) {
          buffered.push({
            start: target.buffered.start(i),
            end: target.buffered.end(i),
          });
        }

        shaka.log.error('Timeout waiting for playback.',
                        'current time', target.currentTime,
                        'ready state', target.readyState,
                        'playback rate', target.playbackRate,
                        'paused', target.paused,
                        'buffered', buffered);

        eventManager.unlisten(target, 'timeupdate');
        reject(new Error('Timeout while waiting for playback!'));
      }
    });
  });
};

/**
 * @param {shaka.util.EventManager} eventManager
 * @param {!HTMLMediaElement} target
 * @param {number} playheadTime The time to wait for.
 * @param {number} timeout in seconds, after which the Promise fails
 * @return {!Promise}
 */
shaka.test.Util.waitUntilPlayheadReaches =
    (eventManager, target, playheadTime, timeout) => {
  let goalMet = false;

  // TODO: Refactor all the wait utils into a class that avoids repeated args
  return new Promise(function(resolve, reject) {
    eventManager.listen(target, 'timeupdate', function() {
      if (target.currentTime >= playheadTime) {
        goalMet = true;
        eventManager.unlisten(target, 'timeupdate');
        resolve();
      }
    });

    shaka.test.Util.delay(timeout).then(function() {
      if (!goalMet) {
        const buffered = [];
        for (let i = 0; i < target.buffered.length; ++i) {
          buffered.push({
            start: target.buffered.start(i),
            end: target.buffered.end(i),
          });
        }

        shaka.log.error('Timeout waiting for target time', playheadTime,
                        'current time', target.currentTime,
                        'ready state', target.readyState,
                        'playback rate', target.playbackRate,
                        'paused', target.paused,
                        'buffered', buffered);

        eventManager.unlisten(target, 'timeupdate');
        reject(new Error('Timeout waiting for time ' + playheadTime));
      }
    });
  });
};

/**
 * Wait for the video to end or for |timeout| seconds to pass, whichever
 * occurs first.  The Promise is resolved when either of these happens.
 *
 * @param {shaka.util.EventManager} eventManager
 * @param {!HTMLMediaElement} target
 * @param {number} timeout in seconds, after which the Promise succeeds
 * @return {!Promise}
 */
shaka.test.Util.waitForEndOrTimeout = (eventManager, target, timeout) => {
  // TODO: Refactor all the wait utils into a class that avoids repeated args
  return new Promise((resolve, reject) => {
    const callback = () => {
      eventManager.unlisten(target, 'ended');
      resolve();
    };

    // Whichever happens first resolves the Promise.
    eventManager.listen(target, 'ended', callback);
    shaka.test.Util.delay(timeout).then(callback);
  });
};

/**
 * @const
 * @private
 */
shaka.test.Util.customMatchers_ = {
  // Custom matcher for Element objects.
  toEqualElement: (util, customEqualityTesters) =>{
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


beforeEach(function() {
  jasmine.addCustomEqualityTester(shaka.test.Util.compareReferences);
  jasmine.addMatchers(shaka.test.Util.customMatchers_);
});
