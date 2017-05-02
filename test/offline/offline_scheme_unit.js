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
  var OfflineScheme;
  var originalIsStorageEngineSupported;
  var originalCreateStorageEngine;
  var fakeStorageEngine;
  var fakeCreateStorageEngine;
  var request;

  beforeAll(function() {
    OfflineScheme = shaka.offline.OfflineScheme;
    originalIsStorageEngineSupported =
        shaka.offline.OfflineUtils.isStorageEngineSupported;
    originalCreateStorageEngine =
        shaka.offline.OfflineUtils.createStorageEngine;
  });

  afterAll(function() {
    shaka.offline.OfflineUtils.isStorageEngineSupported =
        originalIsStorageEngineSupported;
    shaka.offline.OfflineUtils.createStorageEngine =
        originalCreateStorageEngine;
  });

  beforeEach(function() {
    shaka.offline.OfflineUtils.isStorageEngineSupported = function() {
      return true;
    };

    fakeStorageEngine = jasmine.createSpyObj(
        'DBEngine', ['init', 'destroy', 'get']);

    var commonResolve = Promise.resolve();
    var getResolve = Promise.resolve({data: new ArrayBuffer(0)});
    fakeStorageEngine.init.and.returnValue(commonResolve);
    fakeStorageEngine.destroy.and.returnValue(commonResolve);
    fakeStorageEngine.get.and.returnValue(getResolve);

    fakeCreateStorageEngine = jasmine.createSpy('createStorageEngine');
    fakeCreateStorageEngine.and.returnValue(fakeStorageEngine);
    shaka.offline.OfflineUtils.createStorageEngine = fakeCreateStorageEngine;

    // The whole request is ignored by the OfflineScheme.
    var retry = shaka.net.NetworkingEngine.defaultRetryParameters();
    request = shaka.net.NetworkingEngine.makeRequest([], retry);
  });

  it('will return special content-type header for manifests', function(done) {
    var uri = 'offline:123';
    fakeCreateStorageEngine.and.throwError();
    OfflineScheme(uri, request)
        .then(function(response) {
          expect(response).toBeTruthy();
          expect(response.uri).toBe(uri);
          expect(response.headers['content-type'])
              .toBe('application/x-offline-manifest');
        })
        .catch(fail)
        .then(done);
  });

  it('will query DBEngine for segments', function(done) {
    var uri = 'offline:123/456/789';

    OfflineScheme(uri, request)
        .then(function(response) {
          expect(response).toBeTruthy();
          expect(response.uri).toBe(uri);
          expect(response.data).toBeTruthy();

          expect(fakeCreateStorageEngine).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.init).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.destroy).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.get).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.get).toHaveBeenCalledWith('segment', 789);
        })
        .catch(fail)
        .then(done);
  });

  it('will fail if segment not found', function(done) {
    var uri = 'offline:123/456/789';
    fakeStorageEngine.get.and.returnValue(Promise.resolve(null));

    OfflineScheme(uri, request)
        .then(fail)
        .catch(function(err) {
          shaka.test.Util.expectToEqualError(
              err,
              new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.STORAGE,
                  shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND, 789));

          expect(fakeCreateStorageEngine).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.init).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.destroy).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.get).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.get).toHaveBeenCalledWith('segment', 789);
        })
        .catch(fail)
        .then(done);
  });

  it('will fail for invalid URI', function(done) {
    var uri = 'offline:abc';
    fakeCreateStorageEngine.and.throwError();
    OfflineScheme(uri, request)
        .then(fail)
        .catch(function(err) {
          shaka.test.Util.expectToEqualError(
              err,
              new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.NETWORK,
                  shaka.util.Error.Code.MALFORMED_OFFLINE_URI, uri));
        })
        .then(done);
  });
});
