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

describe('OfflineScheme', function() {
  /** @const */
  var OfflineScheme = shaka.offline.OfflineScheme;

  describe('Parsing', function() {
    it('creates uri from manifest id', function() {
      /** @type {number} */
      var id = 123;
      /** @type {string} */
      var uri = OfflineScheme.manifestIdToUri(id);

      expect(uri).toBe('offline:manifest/123');
    });

    it('creates uri from segment id', function() {
      /** @type {number} */
      var id = 123;
      /** @type {string} */
      var uri = OfflineScheme.segmentIdToUri(id);

      expect(uri).toBe('offline:segment/123');
    });

    it('creates null id from non-manifest uri', function() {
      /** @type {string} */
      var uri = 'invalid-uri';
      /** @type {?number} */
      var id = OfflineScheme.uriToManifestId(uri);

      expect(id).toBeNull();
    });

    it('creates id from manifest uri', function() {
      /** @type {string} */
      var uri = 'offline:manifest/123';
      /** @type {?number} */
      var id = OfflineScheme.uriToManifestId(uri);

      expect(id).toBe(123);
    });

    it('creates id from legacy manifest uri', function() {
      /** @type {string} */
      var uri = 'offline:123';
      /** @type {?number} */
      var id = OfflineScheme.uriToManifestId(uri);

      expect(id).toBe(123);
    });

    it('creates null id from non-segment uri', function() {
      /** @type {string} */
      var uri = 'invalid-uri';
      /** @type {?number} */
      var id = OfflineScheme.uriToSegmentId(uri);

      expect(id).toBeNull();
    });

    it('creates id from segment uri', function() {
      /** @type {string} */
      var uri = 'offline:segment/123';
      /** @type {?number} */
      var id = OfflineScheme.uriToSegmentId(uri);

      expect(id).toBe(123);
    });

    it('creates id from legacy segment uri', function() {
      /** @type {string} */
      var uri = 'offline:1/2/3';
      /** @type {?number} */
      var id = OfflineScheme.uriToSegmentId(uri);

      expect(id).toBe(3);
    });
  });

  describe('Get data from storage', function() {
    var mockSEFactory = new shaka.test.MockStorageEngineFactory();

    /** @type {!shaka.offline.IStorageEngine} */
    var fakeStorageEngine;
    /** @type {shakaExtern.Request} */
    var request;

    beforeEach(function() {
      fakeStorageEngine = new shaka.test.MemoryStorageEngine();

      mockSEFactory.overrideIsSupported(true);
      mockSEFactory.overrideCreate(function() {
        return Promise.resolve(fakeStorageEngine);
      });

      // The whole request is ignored by the OfflineScheme.
      var retry = shaka.net.NetworkingEngine.defaultRetryParameters();
      request = shaka.net.NetworkingEngine.makeRequest([], retry);
    });

    afterEach(function() {
      mockSEFactory.resetAll();
    });

    it('will return special content-type header for manifests', function(done) {
      /** @const {number} */
      var id = 789;
      /** @const {string} */
      var uri = shaka.offline.OfflineScheme.manifestIdToUri(id);

      Promise.resolve()
          .then(function() {
            return fakeStorageEngine.insertManifest({
              key: id,
              originalManifestUri: '',
              duration: 0,
              size: 0,
              expiration: 0,
              periods: [],
              sessionIds: [],
              drmInfo: null,
              appMetadata: {}
            });
          })
          .then(function() {
            return OfflineScheme(uri, request);
          })
          .then(function(response) {
            expect(response).toBeTruthy();
            expect(response.uri).toBe(uri);
            expect(response.headers['content-type'])
                .toBe('application/x-offline-manifest');
          })
          .catch(fail)
          .then(done);
    });

    it('will get segment data from storage engine', function(done) {
      /** @const {number} */
      var id = 789;
      /** @const {string} */
      var uri = shaka.offline.OfflineScheme.segmentIdToUri(id);

      /** @const {!Uint8Array} */
      var originalData = new Uint8Array([0, 1, 2, 3]);

      Promise.resolve()
          .then(function() {
            return fakeStorageEngine.insertSegment({
              key: id,
              data: originalData.buffer
            });
          })
          .then(function() {
            return OfflineScheme(uri, request);
          })
          .then(function(response) {
            expect(response).toBeTruthy();
            expect(response.uri).toBe(uri);
            expect(response.data).toBeTruthy();

            /** @const {!Uint8Array} */
            var responseData = new Uint8Array(response.data);
            expect(responseData).toEqual(originalData);
          })
          .catch(fail)
          .then(done);
    });

    it('will fail if segment not found', function(done) {
      /** @const {number} */
      var id = 789;
      /** @const {string} */
      var uri = shaka.offline.OfflineScheme.segmentIdToUri(id);

      OfflineScheme(uri, request)
          .then(fail)
          .catch(function(err) {
            shaka.test.Util.expectToEqualError(
                err,
                new shaka.util.Error(
                    shaka.util.Error.Severity.CRITICAL,
                    shaka.util.Error.Category.STORAGE,
                    shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
                    id));
          })
          .catch(fail)
          .then(done);
    });

    it('will fail for invalid URI', function(done) {
      /** @type {string} */
      var uri = 'offline:this-is-invalid';

      OfflineScheme(uri, request)
          .then(fail)
          .catch(function(err) {
            shaka.test.Util.expectToEqualError(
                err,
                new shaka.util.Error(
                    shaka.util.Error.Severity.CRITICAL,
                    shaka.util.Error.Category.NETWORK,
                    shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
                    uri));
          })
          .then(done);
    });
  });
});
