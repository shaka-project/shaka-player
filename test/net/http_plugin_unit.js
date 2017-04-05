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

describe('HttpPlugin', function() {
  var retryParameters;

  beforeAll(function() {
    jasmine.Ajax.install();
    jasmine.clock().install();

    jasmine.Ajax.stubRequest('https://foo.bar/').andReturn({
      'response': new ArrayBuffer(10),
      'status': 200,
      'responseHeaders': { 'FOO': 'BAR' }
    });
    jasmine.Ajax.stubRequest('https://foo.bar/202').andReturn({
      'response': new ArrayBuffer(0),
      'status': 202
    });
    jasmine.Ajax.stubRequest('https://foo.bar/204').andReturn({
      'response': new ArrayBuffer(10),
      'status': 204,
      'responseHeaders': { 'FOO': 'BAR' }
    });
    jasmine.Ajax.stubRequest('https://foo.bar/302').andReturn({
      'response': new ArrayBuffer(10),
      'status': 200,
      'responseHeaders': { 'FOO': 'BAR' },
      'responseURL': 'https://foo.bar/after/302'
    });
    jasmine.Ajax.stubRequest('https://foo.bar/401').andReturn({
      'response': new ArrayBuffer(0),
      'status': 401
    });
    jasmine.Ajax.stubRequest('https://foo.bar/403').andReturn({
      'response': new ArrayBuffer(0),
      'status': 403
    });
    jasmine.Ajax.stubRequest('https://foo.bar/404').andReturn({
      'response': new ArrayBuffer(0),
      'status': 404
    });
    jasmine.Ajax.stubRequest('https://foo.bar/cache').andReturn({
      'response': new ArrayBuffer(0),
      'status': 200,
      'responseHeaders': { 'X-Shaka-From-Cache': 'true' }
    });
    jasmine.Ajax.stubRequest('https://foo.bar/timeout').andTimeout();
    jasmine.Ajax.stubRequest('https://foo.bar/error').andError();

    retryParameters = shaka.net.NetworkingEngine.defaultRetryParameters();
  });

  afterAll(function() {
    jasmine.Ajax.uninstall();
    jasmine.clock().uninstall();
  });

  it('sets the correct fields', function(done) {
    var request = shaka.net.NetworkingEngine.makeRequest(
        ['https://foo.bar/'], retryParameters);
    request.allowCrossSiteCredentials = true;
    request.method = 'POST';
    request.headers['BAZ'] = '123';

    shaka.net.HttpPlugin(request.uris[0], request)
        .then(function() {
          var actual = jasmine.Ajax.requests.mostRecent();
          expect(actual).toBeTruthy();
          expect(actual.url).toBe(request.uris[0]);
          expect(actual.method).toBe(request.method);
          expect(actual.withCredentials).toBe(true);
          expect(actual.requestHeaders['BAZ']).toBe('123');
        })
        .catch(fail)
        .then(done);
  });

  it('fails with 202 status', function(done) {
    testFails('https://foo.bar/202', done);
  });

  it('succeeds with 204 status', function(done) {
    testSucceeds('https://foo.bar/204', done);
  });

  it('gets redirect URLs with 302 status', function(done) {
    testSucceeds('https://foo.bar/302', done,
                 'https://foo.bar/after/302');
  });

  it('fails with CRITICAL for 401 status', function(done) {
    testFails('https://foo.bar/401', done, shaka.util.Error.Severity.CRITICAL);
  });

  it('fails with CRITICAL for 403 status', function(done) {
    testFails('https://foo.bar/403', done, shaka.util.Error.Severity.CRITICAL);
  });

  it('fails if non-2xx status', function(done) {
    testFails('https://foo.bar/404', done);
  });

  it('fails on timeout', function(done) {
    testFails('https://foo.bar/timeout', done);
  });

  it('fails on error', function(done) {
    testFails('https://foo.bar/error', done);
  });

  it('detects cache headers', function(done) {
    var request = shaka.net.NetworkingEngine.makeRequest(
        ['https://foo.bar/cache'], retryParameters);
    shaka.net.HttpPlugin(request.uris[0], request)
        .catch(fail)
        .then(function(response) {
          expect(response).toBeTruthy();
          expect(response.fromCache).toBe(true);
        })
        .then(done);
  });

  /**
   * @param {string} uri
   * @param {function()} done
   * @param {string=} opt_overrideUri
   */
  function testSucceeds(uri, done, opt_overrideUri) {
    var request = shaka.net.NetworkingEngine.makeRequest(
        [uri], retryParameters);
    shaka.net.HttpPlugin(uri, request)
        .catch(fail)
        .then(function(response) {
          expect(jasmine.Ajax.requests.mostRecent().url).toBe(uri);
          expect(response).toBeTruthy();
          expect(response.uri).toBe(opt_overrideUri || uri);
          expect(response.data).toBeTruthy();
          expect(response.data.byteLength).toBe(10);
          expect(response.fromCache).toBe(false);
          expect(response.headers).toBeTruthy();
          // Returned header names are in lowercase.
          expect(response.headers['foo']).toBe('BAR');
        })
        .then(done);
  }

  /**
   * @param {string} uri
   * @param {function()} done
   * @param {shaka.util.Error.Severity=} opt_severity
   */
  function testFails(uri, done, opt_severity) {
    var request = shaka.net.NetworkingEngine.makeRequest(
        [uri], retryParameters);
    shaka.net.HttpPlugin(uri, request)
        .then(fail)
        .catch(function(error) {
          expect(error).toBeTruthy();
          expect(error.severity)
              .toBe(opt_severity || shaka.util.Error.Severity.RECOVERABLE);
          expect(error.category).toBe(shaka.util.Error.Category.NETWORK);

          expect(jasmine.Ajax.requests.mostRecent().url).toBe(uri);
        })
        .then(done);
  }
});

