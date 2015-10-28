/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('shaka.asserts');
goog.require('shaka.util.PublicPromise');


var customMatchers = {};


/**
 * Creates a new Jasmine matcher object for comparing two Uint8Array objects.
 *
 * @param {Object} util
 * @param {Object} customEqualityTesters
 *
 * @return {Object} A Jasmine matcher object.
 */
customMatchers.toMatchUint8Array = function(util, customEqualityTesters) {
  var matcher = {};

  matcher.compare = function(actual, opt_expected) {
    var expected = opt_expected || new Uint8Array();

    var result = {};

    if (actual.length != expected.length) {
      result.pass = false;
      return result;
    }

    for (var i = 0; i < expected.length; i++) {
      if (actual[i] == expected[i])
        continue;
      result.pass = false;
      return result;
    }

    result.pass = true;
    return result;
  };

  return matcher;
};


/**
 * Jasmine-ajax doesn't send events as arguments when it calls event handlers.
 * This binds very simple event stand-ins to all event handlers.
 *
 * @param {FakeXMLHttpRequest} xhr The FakeXMLHttpRequest object.
 */
function mockXMLHttpRequestEventHandling(xhr) {
  var fakeEvent = { 'target': xhr };

  var events = ['onload', 'onerror', 'onreadystatechange'];
  for (var i = 0; i < events.length; ++i) {
    if (xhr[events[i]]) {
      xhr[events[i]] = xhr[events[i]].bind(xhr, fakeEvent);
    }
  }
}


/**
 * Returns a Promise which is resolved after the given delay.
 *
 * @param {number} seconds The delay in seconds.
 * @return {!Promise}
 */
function delay(seconds) {
  var p = new shaka.util.PublicPromise;
  setTimeout(p.resolve, seconds * 1000.0);
  return p;
}


/**
 * Replace shaka.asserts and console.assert with a version which hooks into
 * jasmine.  This converts all failed assertions into failed tests.
 */
var assertsToFailures = {
  uninstall: function() {
    shaka.asserts = assertsToFailures.originalShakaAsserts_;
    console.assert = assertsToFailures.originalConsoleAssert_;
  },

  install: function() {
    assertsToFailures.originalShakaAsserts_ = shaka.asserts;
    assertsToFailures.originalConsoleAssert_ = console.assert;

    var realAssert = console.assert.bind(console);

    var jasmineAssert = function(condition, opt_message) {
      realAssert(condition, opt_message);
      if (!condition) {
        var message = opt_message || 'Assertion failed.';
        try {
          throw new Error(message);
        } catch (exception) {
          fail(message);
        }
      }
    };

    shaka.asserts = {
      assert: function(condition, opt_message) {
        jasmineAssert(condition, opt_message);
      },
      notImplemented: function() {
        jasmineAssert(false, 'Not implemented.');
      },
      unreachable: function() {
        jasmineAssert(false, 'Unreachable reached.');
      }
    };

    console.assert = jasmineAssert;
  }
};


// Make sure assertions are converted into failures for all tests.
beforeEach(assertsToFailures.install);
afterEach(assertsToFailures.uninstall);
