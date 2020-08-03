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

describe('DataUriPlugin', function() {
  const retryParameters = shaka.net.NetworkingEngine.defaultRetryParameters();

  it('supports MIME types', function(done) {
    testSucceeds('data:text/plain,Hello', 'text/plain', 'Hello', done);
  });

  it('supports URI encoded text', function(done) {
    testSucceeds(
        'data:text/html,%3Ch1%3EHello%2C%20World!%3C%2Fh1%3E',
        'text/html',
        '<h1>Hello, World!</h1>',
        done);
  });

  it('supports base64 encoded text', function(done) {
    testSucceeds(
        'data:;base64,SGVsbG8sIFdvcmxkIQ%3D%3D', '', 'Hello, World!', done);
  });

  it('supports extra colon', function(done) {
    testSucceeds('data:,Hello:', '', 'Hello:', done);
  });

  it('supports extra semi-colon', function(done) {
    testSucceeds('data:,Hello;', '', 'Hello;', done);
  });

  it('supports extra comma', function(done) {
    testSucceeds('data:,Hello,', '', 'Hello,', done);
  });

  it('supports character set metadata', function(done) {
    testSucceeds(
        'data:text/plain;charset=UTF-8,Hello,',
        'text/plain',
        'Hello,',
        done);
  });

  it('supports arbitrary metadata', function(done) {
    testSucceeds(
        'data:text/plain;foo=bar,Hello,',
        'text/plain',
        'Hello,',
        done);
  });

  it('supports arbitrary metadata with base64 encoding', function(done) {
    testSucceeds(
        'data:text/plain;foo=bar;base64,SGVsbG8sIFdvcmxkIQ%3D%3D',
        'text/plain',
        'Hello, World!',
        done);
  });

  it('fails for empty URI', function(done) {
    testFails('', done, shaka.util.Error.Code.MALFORMED_DATA_URI);
  });

  it('fails for non-data URIs', function(done) {
    testFails('http://google.com/', done,
        shaka.util.Error.Code.MALFORMED_DATA_URI);
  });

  it('fails for decoding errors', function(done) {
    testFails('data:Bad%', done, shaka.util.Error.Code.MALFORMED_DATA_URI);
  });

  it('fails if missing comma', function(done) {
    testFails('data:Bad', done, shaka.util.Error.Code.MALFORMED_DATA_URI);
  });

  function testSucceeds(uri, contentType, text, done) {
    // An arbitrary request type.
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    // A dummy progress callback.
    const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};

    let request =
        shaka.net.NetworkingEngine.makeRequest([uri], retryParameters);

    // eslint-disable-next-line new-cap
    shaka.net.DataUriPlugin(uri, request, requestType, progressUpdated).promise
        .then(function(response) {
          expect(response).toBeTruthy();
          expect(response.uri).toBe(uri);
          expect(response.data).toBeTruthy();
          expect(response.headers['content-type']).toBe(contentType);
          let data = shaka.util.StringUtils.fromBytesAutoDetect(response.data);
          expect(data).toBe(text);
        })
        .catch(fail)
        .then(done);
  }

  function testFails(uri, done, code) {
    // An arbitrary request type.
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    // A dummy progress callback.
    const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};

    let request =
        shaka.net.NetworkingEngine.makeRequest([uri], retryParameters);
    // eslint-disable-next-line new-cap
    shaka.net.DataUriPlugin(uri, request, requestType, progressUpdated).promise
        .then(fail)
        .catch(function(error) { expect(error.code).toBe(code); })
        .then(function() {
          done();
        });
  }
});

