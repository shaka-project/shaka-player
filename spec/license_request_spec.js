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
 * @fileoverview license_request.js unit tests.
 */

goog.require('shaka.util.LicenseRequest');

describe('LicenseRequest', function() {
  const SERVER_URL = 'http://localhost/test_drm_url';
  const REQUEST_BODY = 'test_request_body';
  const FAKE_RESPONSE = new Uint8Array(['0', '1', '2', '3']);

  beforeEach(function() {
    jasmine.addMatchers(customMatchers);
    jasmine.clock().install();
    jasmine.Ajax.install();
  });

  afterEach(function() {
    jasmine.Ajax.uninstall();
    jasmine.clock().uninstall();
  });

  it('sends a request and receives a response', function(done) {
    var LicenseRequest = shaka.util.LicenseRequest;
    var license_request = new LicenseRequest(SERVER_URL, REQUEST_BODY);

    license_request.send().then(function(response) {
      expect(response).toMatchUint8Array(FAKE_RESPONSE);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });

    var xhr = jasmine.Ajax.requests.mostRecent();
    mockXMLHttpRequestEventHandling(xhr);

    expect(xhr.url).toBe(SERVER_URL);
    expect(xhr.responseType).toBe('arraybuffer');
    expect(xhr.method).toMatch(new RegExp('post', 'i'));

    xhr.respondWith({
      'status': 200,
      'contentType': 'arraybuffer',
      'response': FAKE_RESPONSE.buffer
    });
  });

  it('retries on error', function(done) {
    var LicenseRequest = shaka.util.LicenseRequest;
    var license_request = new LicenseRequest(SERVER_URL, REQUEST_BODY);

    license_request.send().then(function(response) {
      expect(response).toMatchUint8Array(FAKE_RESPONSE);
      done();
    }).catch(function(error) {
      fail(error);
      done();
    });

    // Make the first request fail.
    var xhr = jasmine.Ajax.requests.mostRecent();
    mockXMLHttpRequestEventHandling(xhr);

    expect(xhr.url).toBe(SERVER_URL);
    expect(xhr.responseType).toBe('arraybuffer');
    expect(xhr.method).toMatch(new RegExp('post', 'i'));

    xhr.respondWith({'status': 500});

    jasmine.clock().tick(license_request.lastDelayMs_);

    // Make the second request succeed.
    xhr = jasmine.Ajax.requests.mostRecent();
    mockXMLHttpRequestEventHandling(xhr);

    // Ensure it is a new request.
    expect(xhr.status).toBe(null);

    expect(xhr.url).toBe(SERVER_URL);
    expect(xhr.responseType).toBe('arraybuffer');
    expect(xhr.method).toMatch(new RegExp('post', 'i'));

    xhr.respondWith({
      'status': 200,
      'contentType': 'arraybuffer',
      'response': FAKE_RESPONSE.buffer
    });
  });

  it('retries repeatedly on error', function(done) {
    var LicenseRequest = shaka.util.LicenseRequest;
    var license_request = new LicenseRequest(SERVER_URL, REQUEST_BODY);

    license_request.send().then(function(response) {
      fail(new Error('Should not receive a response.'));
      done();
    }).catch(function(error) {
      expect(error.status).toBe(500);
      done();
    });

    for (var i = 0; i < license_request.parameters.maxAttempts; ++i) {
      var xhr = jasmine.Ajax.requests.mostRecent();
      mockXMLHttpRequestEventHandling(xhr);

      // Ensure it is a new request.
      expect(xhr.status).toBe(null);

      expect(xhr.url).toBe(SERVER_URL);
      expect(xhr.responseType).toBe('arraybuffer');
      expect(xhr.method).toMatch(new RegExp('post', 'i'));

      xhr.respondWith({'status': 500});
      jasmine.clock().tick(license_request.lastDelayMs_);
    }
  });
});

