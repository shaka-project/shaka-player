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
 * @fileoverview ajax_request.js unit tests.
 */

goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.util.AjaxRequest');
goog.require('shaka.util.ContentDatabase');

describe('AjaxRequest', function() {
  var originalTimeout, originalRangeRequest;

  const bufferSize = 40 * 1024 * 1024;

  beforeAll(function() {
    // Change the timeout.
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 20000;  // ms

    // Set up mock RangeRequest. The mock RangeRequest is used to insert a
    // stream into the database.
    originalRangeRequest = shaka.util.RangeRequest;
    var mockRangeRequest = function(url, startByte, endByte) {
      return {
        send: function() {
          return Promise.resolve(new ArrayBuffer(bufferSize));
        }
      };
    };
    shaka.util.RangeRequest = mockRangeRequest;
  });

  afterAll(function() {
    // Restore the timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    // Restore RangeRequest.
    shaka.util.RangeRequest = originalRangeRequest;
  });

  it('retrieves a segment from offline storage', function(done) {
    var testUrl = new goog.Uri('http://example.com');
    var testReferences = [
      new shaka.media.SegmentReference(0, 0, null, 0, null, testUrl)];
    var testIndex = new shaka.media.SegmentIndex(testReferences);

    var streamInfo = new shaka.media.StreamInfo();
    streamInfo.mimeType = 'video/phony';
    streamInfo.codecs = 'phony';
    streamInfo.segmentInitializationData = new ArrayBuffer(1024);
    streamInfo.segmentIndex = testIndex;

    var drmSchemeInfo = shaka.player.DrmSchemeInfo.createUnencrypted();

    var db = new shaka.util.ContentDatabase(null);
    db.setUpDatabase().then(function() {
      return db.insertStream_(streamInfo, 100, drmSchemeInfo);
    }).then(function(streamId) {
      db.closeDatabaseConnection();
      var request = new shaka.util.AjaxRequest('idb://' + streamId + '/0');
      return request.sendInternal();
    }).then(function(xhr) {
      expect(xhr.response).toEqual(jasmine.any(ArrayBuffer));
      expect(xhr.response.byteLength).toEqual(bufferSize);
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('parses data URIs with mime type and base64', function(done) {
    checkDataUri('data:text/plain;base64,SGVsbG8sIGRhdGEh',
        'Hello, data!', done);
  });

  it('parses data URIs with no mime type and base64', function(done) {
    checkDataUri('data:base64,SGVsbG8sIGRhdGEh',
        'Hello, data!', done);
  });

  it('parses data URIs with no mime type and no encoding', function(done) {
    checkDataUri('data:Hello%2C%20data!',
        'Hello, data!', done);
  });

  it('parses data URIs with mime type and no encoding', function(done) {
    checkDataUri('data:text/plain;Hello%2C%20data!',
        'Hello, data!', done);
  });

  function checkDataUri(uri, expectedData, done) {
    var ajaxRequest = new shaka.util.AjaxRequest(uri);

    ajaxRequest.sendInternal().then(function(xhr) {
      var response = new Uint8Array(xhr.response);
      // Convert the Uint8Array back to string.
      var data = String.fromCharCode.apply(null, response);
      expect(data).toBe(expectedData);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });
  }
});

