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

goog.require('shaka.net.DataUriPlugin');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Uint8ArrayUtils');

describe('DataUriPlugin', function() {
  it('supports MIME types', function(done) {
    testSucceeds('data:text/plain,Hello', 'Hello', done);
  });

  it('supports URL encoded text', function(done) {
    testSucceeds(
        'data:text/html,%3Ch1%3EHello%2C%20World!%3C%2Fh1%3E',
        '<h1>Hello, World!</h1>',
        done);
  });

  it('supports base64 encoded text', function(done) {
    testSucceeds(
        'data:;base64,SGVsbG8sIFdvcmxkIQ%3D%3D', 'Hello, World!', done);
  });

  it('supports extra colin', function(done) {
    testSucceeds('data:,Hello:', 'Hello:', done);
  });

  it('supports extra semi-colin', function(done) {
    testSucceeds('data:,Hello;', 'Hello;', done);
  });

  it('supports extra comma', function(done) {
    testSucceeds('data:,Hello,', 'Hello,', done);
  });

  it('fails for empty URI', function(done) {
    testFails('', done);
  });

  it('fails for non-data URIs', function(done) {
    testFails('http://google.com/', done);
  });

  it('fails for decoding errors', function(done) {
    testFails('data:Bad%', done);
  });

  it('fails if missing comma', function(done) {
    testFails('data:Bad', done);
  });

  function testSucceeds(uri, text, done) {
    shaka.net.DataUriPlugin(uri, {})
        .then(function(response) {
          expect(response).toBeTruthy();
          expect(response.data).toBeTruthy();
          var array = new Uint8Array(response.data);
          var data = shaka.util.Uint8ArrayUtils.toString(array);
          expect(data).toBe(text);
        })
        .catch(fail)
        .then(done);
  }

  function testFails(uri, done) {
    shaka.log.setLevel(shaka.log.Level.NONE);
    shaka.net.DataUriPlugin(uri, {})
        .then(fail)
        .catch(function() { expect(true).toBe(true); })
        .then(function() {
          shaka.log.setLevel(shaka.log.MAX_LOG_LEVEL);
          done();
        });
  }
});

