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
  var originalDbEngineCtor;
  var fakeDbEngineCtor;
  var dbEngine;
  var request;

  beforeAll(function() {
    OfflineScheme = shaka.offline.OfflineScheme;
    originalDbEngineCtor = shaka.offline.DBEngine;
  });

  afterAll(function() {
    shaka.offline.DBEngine = originalDbEngineCtor;
  });

  beforeEach(function() {
    dbEngine = createFakeDbEngine();
    fakeDbEngineCtor = jasmine.createSpy('DBEngine');
    fakeDbEngineCtor.and.returnValue(dbEngine);
    shaka.offline.DBEngine = fakeDbEngineCtor;

    // The whole request is ignored by the OfflineScheme.
    var retry = shaka.net.NetworkingEngine.defaultRetryParameters();
    request = shaka.net.NetworkingEngine.makeRequest([], retry);
  });

  it('will return special content-type header for manifests', function(done) {
    var uri = 'offline:123';
    fakeDbEngineCtor.and.throwError();
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

          expect(fakeDbEngineCtor).toHaveBeenCalledTimes(1);
          expect(dbEngine.init).toHaveBeenCalledTimes(1);
          expect(dbEngine.destroy).toHaveBeenCalledTimes(1);
          expect(dbEngine.get).toHaveBeenCalledTimes(1);
          expect(dbEngine.get).toHaveBeenCalledWith('segment', 789);
        })
        .catch(fail)
        .then(done);
  });

  it('will fail if segment not found', function(done) {
    var uri = 'offline:123/456/789';
    dbEngine.get.and.returnValue(Promise.resolve(null));

    OfflineScheme(uri, request)
        .then(fail)
        .catch(function(err) {
          shaka.test.Util.expectToEqualError(
              err,
              new shaka.util.Error(
                  shaka.util.Error.Category.STORAGE,
                  shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND, 789));

          expect(fakeDbEngineCtor).toHaveBeenCalledTimes(1);
          expect(dbEngine.init).toHaveBeenCalledTimes(1);
          expect(dbEngine.destroy).toHaveBeenCalledTimes(1);
          expect(dbEngine.get).toHaveBeenCalledTimes(1);
          expect(dbEngine.get).toHaveBeenCalledWith('segment', 789);
        })
        .catch(fail)
        .then(done);
  });

  it('will fail for invalid URI', function(done) {
    var uri = 'offline:abc';
    fakeDbEngineCtor.and.throwError();
    OfflineScheme(uri, request)
        .then(fail)
        .catch(function(err) {
          shaka.test.Util.expectToEqualError(
              err,
              new shaka.util.Error(
                  shaka.util.Error.Category.NETWORK,
                  shaka.util.Error.Code.MALFORMED_OFFLINE_URI, uri));
        })
        .then(done);
  });

  function createFakeDbEngine() {
    var resolve = Promise.resolve.bind(Promise);

    var fake = jasmine.createSpyObj('DBEngine', ['init', 'destroy', 'get']);
    fake.init.and.callFake(resolve);
    fake.destroy.and.callFake(resolve);
    fake.get.and.callFake(function() {
      return Promise.resolve({data: new ArrayBuffer(0)});
    });
    return fake;
  }
});
