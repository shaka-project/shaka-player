/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Utility function for unit tests.
 */

goog.require('shaka.asserts');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');


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
 * Creates a new Jasmine matcher object for comparing two range object. A range
 * object is an object of type {{ start: number, end: number }}.
 *
 * @param {Object} util
 * @param {Object} customEqualityTesters
 *
 * @return {Object} A Jasmine matcher object.
 */
customMatchers.toMatchRange = function(util, customEqualityTesters) {
  var matcher = {};

  matcher.compare = function(actual, opt_expected) {
    var expected = opt_expected || { begin: 0, end: 0 };

    var result = {};

    if ((actual == null && expected != null) ||
        (actual != null && expected == null) ||
        (actual.begin != expected.begin) || (actual.end != expected.end)) {
      result.pass = false;
      return result;
    }

    result.pass = true;
    return result;
  };

  return matcher;
};


/**
 * Adds fake event handling support to a Jasmine FakeXMLHttpRequest object.
 *
 * @param {FakeXMLHttpRequest} xhr The FakeXMLHttpRequest object.
 */
function mockXMLHttpRequestEventHandling(xhr) {
  // Jasmine's FakeXMLHttpRequest class uses the attribute "response" as a
  // method to set the fake response.  Our library uses it (correctly) to get
  // the response itself.  We "fix" Jasmine's overloaded abuse of this by
  // renaming this method to "fakeResponse" and adding a shim to handle
  // the "response" field.
  //
  // Since Jasmine ignores the setting of "response", we will map it to
  // "responseText" here, and map it back again in the "onload" spy below.
  //
  // Note that in a real request, with "responseType" set to "arraybuffer",
  // "responseText" throws DOMException.  So our library does the right thing,
  // and Jasmine's fake is deficient.
  if (!xhr.fakeResponse) {
    var originalResponseMethod = xhr.response;
    console.assert(originalResponseMethod && originalResponseMethod.bind);
    xhr.response = null;
    xhr.fakeResponse = function(fields) {
      if (fields.hasOwnProperty('response')) {
        fields['responseText'] = fields['response'];
      }
      return originalResponseMethod.call(xhr, fields);
    };
  }

  // Mock out onload().
  var onload = xhr.onload;
  spyOn(xhr, 'onload').and.callFake(function() {
    var fakeXMLHttpProgressEvent = {
      'target': xhr
    };
    // After each load, overwrite "response" with "responseText".
    xhr.response = xhr.responseText;
    onload(fakeXMLHttpProgressEvent);
  });

  // Mock out onerror().
  var onerror = xhr.onerror;
  spyOn(xhr, 'onerror').and.callFake(function() {
    var fakeXMLHttpProgressEvent = {
      'target': xhr
    };
    onerror(fakeXMLHttpProgressEvent);
  });
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


/**
 * Called to interpret ContentProtection elements from an MPD.
 * @param {?shaka.player.DrmSchemeInfo.LicensePostProcessor} postProcessor
 * @param {!shaka.dash.mpd.ContentProtection} contentProtection
 * @return {shaka.player.DrmSchemeInfo} or null if the element is not supported.
 */
function interpretContentProtection(postProcessor, contentProtection) {
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  // This is the only scheme used in integration tests at the moment.
  if (contentProtection.schemeIdUri == 'com.youtube.clearkey') {
    var child = contentProtection.children[0];
    var keyid = Uint8ArrayUtils.fromHex(child.getAttribute('keyid'));
    var key = Uint8ArrayUtils.fromHex(child.getAttribute('key'));
    var keyObj = {
      kty: 'oct',
      alg: 'A128KW',
      kid: Uint8ArrayUtils.toBase64(keyid, false),
      k: Uint8ArrayUtils.toBase64(key, false)
    };
    var jwkSet = {keys: [keyObj]};
    var license = JSON.stringify(jwkSet);
    var initData = {
      initData: keyid,
      initDataType: 'webm'
    };
    var licenseServerUrl = 'data:application/json;base64,' +
        shaka.util.StringUtils.toBase64(license);
    return new shaka.player.DrmSchemeInfo(
        'org.w3.clearkey', false, licenseServerUrl, false, initData,
        postProcessor);
  }

  return null;
}


/**
 * Checks that the given Range objects match.
 * @param {shaka.dash.mpd.Range} actual
 * @param {shaka.dash.mpd.Range} expected
 */
function checkRange(actual, expected) {
  if (expected) {
    expect(actual).toBeTruthy();
    expect(actual.begin).toBe(expected.begin);
    expect(actual.end).toBe(expected.end);
  } else {
    expect(actual).toBeNull();
  }
}


/**
 * Checks that the given "URL type objects" match.
 * @param {shaka.dash.mpd.RepresentationIndex|
 *         shaka.dash.mpd.Initialization} actual
 * @param {shaka.dash.mpd.RepresentationIndex|
 *         shaka.dash.mpd.Initialization} expected
 */
function checkUrlTypeObject(actual, expected) {
  if (expected) {
    if (expected.url) {
      expect(actual.url).toBeTruthy();
      expect(actual.url.toString()).toBe(expected.url.toString());
    } else {
      expect(actual.url).toBeNull();
    }

    if (expected.range) {
      expect(actual.range).toBeTruthy();
      expect(actual.range.begin).toBe(expected.range.begin);
      expect(actual.range.end).toBe(expected.range.end);
    } else {
      expect(actual.range).toBeNull();
    }
  } else {
    expect(actual).toBeNull();
  }
}

