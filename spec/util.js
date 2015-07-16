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
 * @fileoverview Utility functions for unit tests.
 */

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.player.IVideoSource');
goog.require('shaka.util.EventManager');
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


/**
 * Called to interpret ContentProtection elements from an MPD.
 * @param {!shaka.dash.mpd.ContentProtection} contentProtection
 * @return {shaka.player.DrmSchemeInfo} or null if the element is not supported.
 */
function interpretContentProtection(contentProtection) {
  var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  // This is the only scheme used in integration tests at the moment.
  if (contentProtection.schemeIdUri == 'com.youtube.clearkey') {
    var license;
    for (var i = 0; i < contentProtection.children.length; ++i) {
      var child = contentProtection.children[i];
      if (child.nodeName == 'ytdrm:License') {
        license = child;
        break;
      }
    }
    if (!license) {
      return null;
    }
    var keyid = Uint8ArrayUtils.fromHex(license.getAttribute('keyid'));
    var key = Uint8ArrayUtils.fromHex(license.getAttribute('key'));
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
        'org.w3.clearkey', licenseServerUrl, false, initData, null);
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


/**
 * Checks that the given references have the correct times and byte ranges.
 *
 * @param {!Array.<!shaka.media.SegmentReference>} references
 * @param {string} expectedUrl
 * @param {!Array.<number>} expectedStartTimes
 * @param {!Array.<number>} expectedStartBytes
 */
function checkReferences(
    references,
    expectedUrl,
    expectedStartTimes,
    expectedStartBytes) {
  console.assert(expectedStartTimes.length == expectedStartBytes.length);
  expect(references.length).toBe(expectedStartTimes.length);
  for (var i = 0; i < expectedStartTimes.length; i++) {
    var reference = references[i];
    var expectedStartTime = expectedStartTimes[i];
    var expectedStartByte = expectedStartBytes[i];

    expect(reference).toBeTruthy();
    expect(reference.url).toBeTruthy();
    expect(reference.url.toString()).toBe(expectedUrl);

    expect(reference.startTime.toFixed(3)).toBe(expectedStartTime.toFixed(3));
    expect(reference.startByte).toBe(expectedStartByte);

    // The final end time and final end byte are dependent on the specific
    // content, so for simplicity just omit checking them.
    var isLast = (i == expectedStartTimes.length - 1);
    if (!isLast) {
      var expectedEndTime = expectedStartTimes[i + 1];
      var expectedEndByte = expectedStartBytes[i + 1] - 1;
      expect(reference.endTime.toFixed(3)).toBe(expectedEndTime.toFixed(3));
      expect(reference.endByte).toBe(expectedEndByte);
    }
  }
}


/**
 * Checks the given reference; expects its |startByte| and |endByte| fields to
 * be 0 and null respectively.
 *
 * @param {!shaka.media.SegmentReference} reference
 * @param {string} url
 * @param {number} startTime
 * @param {number} endTime
 */
function checkReference(reference, url, startTime, endTime) {
  expect(reference).toBeTruthy();
  expect(reference.url).toBeTruthy();
  expect(reference.url.toString()).toBe(url);
  expect(reference.startByte).toBe(0);
  expect(reference.endByte).toBeNull();
  expect(reference.startTime).toBe(startTime);
  expect(reference.endTime).toBe(endTime);
}


/**
 * Waits for a video time to increase.
 * @param {!HTMLMediaElement} video The playing video.
 * @param {!shaka.util.EventManager} eventManager
 * @return {!Promise} resolved when the video's currentTime changes.
 */
function waitForMovement(video, eventManager) {
  var promise = new shaka.util.PublicPromise;
  var originalTime = video.currentTime;
  eventManager.listen(video, 'timeupdate', function() {
    if (video.currentTime != originalTime) {
      eventManager.unlisten(video, 'timeupdate');
      promise.resolve();
    }
  });
  return promise;
}


/**
 * @param {!HTMLMediaElement} video The playing video.
 * @param {!shaka.util.EventManager} eventManager
 * @param {number} targetTime in seconds
 * @param {number} timeout in seconds
 * @return {!Promise} resolved when the video's currentTime >= |targetTime|.
 */
function waitForTargetTime(video, eventManager, targetTime, timeout) {
  var promise = new shaka.util.PublicPromise;
  var stack = (new Error('stacktrace')).stack.split('\n').slice(1).join('\n');

  var timeoutId = window.setTimeout(function() {
    // This expectation will fail, but will provide specific values to
    // Jasmine to help us debug timeout issues.
    expect(video.currentTime).toBeGreaterThan(targetTime);
    eventManager.unlisten(video, 'timeupdate');
    // Reject the promise, but replace the error's stack with the original
    // call stack.  This timeout handler's stack is not helpful.
    var error = new Error('Timeout waiting for video time ' + targetTime);
    error.stack = stack;
    promise.reject(error);
  }, timeout * 1000);

  eventManager.listen(video, 'timeupdate', function() {
    if (video.currentTime > targetTime) {
      // This expectation will pass, but will keep Jasmine from complaining
      // about tests which have no expectations.  In practice, some tests
      // only need to demonstrate that they have reached a certain target.
      expect(video.currentTime).toBeGreaterThan(targetTime);
      eventManager.unlisten(video, 'timeupdate');
      window.clearTimeout(timeoutId);
      promise.resolve();
    }
  });
  return promise;
}


/**
 * @param {!SourceBuffer} sourceBuffer
 * @param {number} targetTime in seconds
 * @param {number} timeout in seconds
 * @return {!Promise} resolved when |sourceBuffer| has buffered at least
 *     |targetTime| seconds of data.
 */
function waitUntilBuffered(sourceBuffer, targetTime, timeout) {
  var promise = new shaka.util.PublicPromise;
  var stack = (new Error('stacktrace')).stack.split('\n').slice(1).join('\n');

  var pollIntervalId;

  var timeoutId = window.setTimeout(function() {
    var buffered = sourceBuffer.buffered;
    expect(buffered.length).toBe(1);
    var secondsBuffered = buffered.end(0) - buffered.start(0);
    // This expectation will fail, but will provide specific values to
    // Jasmine to help us debug timeout issues.
    expect(secondsBuffered).toBeGreaterThan(targetTime);
    window.clearInterval(pollIntervalId);
    // Reject the promise, but replace the error's stack with the original
    // call stack.  This timeout handler's stack is not helpful.
    var error = new Error('Timeout waiting for buffered ' + targetTime);
    error.stack = stack;
    promise.reject(error);
  }, timeout * 1000);

  pollIntervalId = window.setInterval(function() {
    var buffered = sourceBuffer.buffered;
    expect(buffered.length).toBe(1);
    var secondsBuffered = buffered.end(0) - buffered.start(0);
    if (secondsBuffered > targetTime) {
      // This expectation will pass, but will keep Jasmine from complaining
      // about tests which have no expectations.  In practice, some tests
      // only need to demonstrate that they have reached a certain target.
      expect(secondsBuffered).toBeGreaterThan(targetTime);
      window.clearTimeout(timeoutId);
      window.clearInterval(pollIntervalId);
      promise.resolve();
    }
  }, 1000);
  return promise;
}


/**
 * Creates a new DashVideoSource out of the manifest.
 * @param {string} manifest
 * @return {!shaka.player.DashVideoSource}
 */
function newSource(manifest) {
  var estimator = new shaka.util.EWMABandwidthEstimator();
  // FIXME: We should enable caching because the tests do not use bitrate
  // adaptation, but Chrome's xhr.send() produces net::ERR_<unknown> for some
  // range requests when caching is enabled, so disable caching for now as it
  // breaks many of the integration tests.
  estimator.supportsCaching = function() { return false; };
  return new shaka.player.DashVideoSource(manifest,
                                          interpretContentProtection,
                                          estimator);
}


/**
 * @param {!Event} event
 */
function convertErrorToTestFailure(event) {
  // Treat all player errors as test failures.
  var error = event.detail;
  fail(error);
}
