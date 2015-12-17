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

goog.require('shaka.net.HttpPlugin');
goog.require('shaka.net.NetworkingEngine');

describe('HttpPlugin', function() {
  beforeAll(function() {
    jasmine.Ajax.install();
    jasmine.clock().install();

    jasmine.Ajax.stubRequest('https://foo.bar/').andReturn({
      'response': new ArrayBuffer(10),
      'status': 200,
      'responseHeaders': { 'FOO': 'BAR' }
    });
    jasmine.Ajax.stubRequest('https://foo.bar/204').andReturn({
      'response': new ArrayBuffer(10),
      'status': 204,
      'responseHeaders': { 'FOO': 'BAR' }
    });
    jasmine.Ajax.stubRequest('https://foo.bar/404').andReturn({
      'response': new ArrayBuffer(0),
      'status': 404
    });
    jasmine.Ajax.stubRequest('https://foo.bar/timeout').andTimeout();
    jasmine.Ajax.stubRequest('https://foo.bar/error').andError();
  });

  afterAll(function() {
    jasmine.Ajax.uninstall();
    jasmine.clock().uninstall();
  });

  it('sets the correct fields', function(done) {
    var request = {
      uris: ['https://foo.bar/'],
      allowCrossSiteCredentials: true,
      method: 'POST',
      headers: {'FOO': 'BAR'}
    };
    shaka.net.HttpPlugin(request.uris[0], request)
        .then(function() {
          var actual = jasmine.Ajax.requests.mostRecent();
          expect(actual).toBeTruthy();
          expect(actual.url).toBe(request.uris[0]);
          expect(actual.method).toBe(request.method);
          expect(actual.withCredentials).toBe(true);
          expect(actual.requestHeaders['FOO']).toBe('BAR');
        })
        .catch(fail)
        .then(done);
  });

  it('succeeds with 204 status', function(done) {
    testSucceeds('https://foo.bar/204', done);
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

  function testSucceeds(uri, done) {
    var request = {uris: [uri]};
    shaka.net.HttpPlugin(uri, request)
        .catch(fail)
        .then(function(response) {
          expect(jasmine.Ajax.requests.mostRecent().url).toBe(uri);
          expect(response).toBeTruthy();
          expect(response.data).toBeTruthy();
          expect(response.data.byteLength).toBe(10);
          expect(response.headers).toBeTruthy();
          expect(response.headers['FOO']).toBe('BAR');
        })
        .then(done);
  }

  function testFails(uri, done) {
    var request = {uris: [uri]};
    shaka.net.HttpPlugin(uri, request)
        .then(fail)
        .catch(function() {
          expect(jasmine.Ajax.requests.mostRecent().url).toBe(uri);
        })
        .then(done);
  }
});

