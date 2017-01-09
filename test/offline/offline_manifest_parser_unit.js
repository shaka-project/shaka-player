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

describe('OfflineManifestParser', function() {
  var originalDbEngineCtor;
  var fakeDbEngineCtor;
  var parser;
  var dbEngine;

  beforeAll(function() {
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

    parser = new shaka.offline.OfflineManifestParser();
  });

  afterEach(function() {
    parser.stop();
  });

  it('will query DBEngine for the manifest', function(done) {
    var uri = 'offline:123';
    dbEngine.get.and.returnValue(Promise.resolve({
      key: 0,
      originalManifestUri: '',
      duration: 60,
      size: 100,
      periods: [],
      sessionIds: [],
      drmInfo: null,
      appMetadata: null
    }));

    parser.start(uri, null, null, null)
        .then(function(manifest) {
          expect(manifest).toBeTruthy();

          expect(fakeDbEngineCtor).toHaveBeenCalledTimes(1);
          expect(dbEngine.init).toHaveBeenCalledTimes(1);
          expect(dbEngine.destroy).toHaveBeenCalledTimes(1);
          expect(dbEngine.get).toHaveBeenCalledTimes(1);
          expect(dbEngine.get).toHaveBeenCalledWith('manifest', 123);
        })
        .catch(fail)
        .then(done);
  });

  it('will fail if manifest not found', function(done) {
    var uri = 'offline:123';
    dbEngine.get.and.returnValue(Promise.resolve(null));

    parser.start(uri, null, null, null)
        .then(fail)
        .catch(function(err) {
          shaka.test.Util.expectToEqualError(
              err,
              new shaka.util.Error(
                  shaka.util.Error.Category.STORAGE,
                  shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND, 123));

          expect(fakeDbEngineCtor).toHaveBeenCalledTimes(1);
          expect(dbEngine.init).toHaveBeenCalledTimes(1);
          expect(dbEngine.destroy).toHaveBeenCalledTimes(1);
          expect(dbEngine.get).toHaveBeenCalledTimes(1);
          expect(dbEngine.get).toHaveBeenCalledWith('manifest', 123);
        })
        .then(done);
  });

  it('still calls destroy on error', function(done) {
    var uri = 'offline:123';
    dbEngine.get.and.returnValue(Promise.reject());

    parser.start(uri, null, null, null)
        .then(fail)
        .catch(function(err) {
          expect(fakeDbEngineCtor).toHaveBeenCalledTimes(1);
          expect(dbEngine.init).toHaveBeenCalledTimes(1);
          expect(dbEngine.destroy).toHaveBeenCalledTimes(1);
        })
        .then(done);
  });

  it('will fail for invalid URI', function(done) {
    var uri = 'offline:abc';
    parser.start(uri, null, null, null)
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

  describe('reconstructing manifest', function() {
    var originalReconstructPeriod;

    beforeAll(function() {
      originalReconstructPeriod = shaka.offline.OfflineUtils.reconstructPeriod;
    });

    afterAll(function() {
      shaka.offline.OfflineUtils.reconstructPeriod = originalReconstructPeriod;
    });

    it('converts non-Period members correctly', function(done) {
      var uri = 'offline:123';
      var data = {
        key: 123,
        originalManifestUri: 'https://example.com/manifest',
        duration: 60,
        size: 100,
        periods: [],
        sessionIds: ['abc', '123'],
        drmInfo: null,
        appMetadata: null
      };
      dbEngine.get.and.returnValue(Promise.resolve(data));

      parser.start(uri, null, null, null)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            expect(manifest.minBufferTime).toEqual(jasmine.any(Number));
            expect(manifest.offlineSessionIds).toEqual(data.sessionIds);
            expect(manifest.periods).toEqual([]);

            var timeline = manifest.presentationTimeline;
            expect(timeline).toBeTruthy();
            expect(timeline.isLive()).toBe(false);
            expect(timeline.getPresentationStartTime()).toBe(null);
            expect(timeline.getDuration()).toBe(data.duration);
          })
          .catch(fail)
          .then(done);
    });

    it('will accept DrmInfo', function(done) {
      var uri = 'offline:123';
      var drmInfo = {
        keySystem: 'com.example.drm',
        licenseServerUri: 'https://example.com/drm',
        distinctiveIdentifierRequired: false,
        persistentStateRequired: true,
        audioRobustness: 'weak',
        videoRobustness: 'awesome',
        serverCertificate: null,
        initData: [{initData: new Uint8Array([1]), initDataType: 'foo'}],
        keyIds: ['key1', 'key2']
      };
      var period = {};
      var data = {
        key: 123,
        originalManifestUri: 'https://example.com/manifest',
        duration: 60,
        size: 100,
        periods: [period],
        sessionIds: ['abc', '123'],
        drmInfo: drmInfo,
        appMetadata: null
      };
      dbEngine.get.and.returnValue(Promise.resolve(data));

      var spy = jasmine.createSpy('reconstructPeriod');
      shaka.offline.OfflineUtils.reconstructPeriod = spy;

      parser.start(uri, null, null, null)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();

            expect(spy).toHaveBeenCalled();
            expect(spy.calls.argsFor(0)[1]).toEqual([drmInfo]);
          })
          .catch(fail)
          .then(done);
    });

    it('will call reconstructPeriod for each Period', function(done) {
      var uri = 'offline:123';
      var data = {
        key: 123,
        originalManifestUri: 'https://example.com/manifest',
        duration: 60,
        size: 100,
        periods: [{id: 1}, {id: 2}, {id: 3}],
        sessionIds: ['abc', '123'],
        drmInfo: null,
        appMetadata: null
      };
      dbEngine.get.and.returnValue(Promise.resolve(data));

      var spy = jasmine.createSpy('reconstructPeriod');
      shaka.offline.OfflineUtils.reconstructPeriod = spy;

      parser.start(uri, null, null, null)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();

            expect(spy).toHaveBeenCalledTimes(3);
            for (var i = 0; i < data.periods.length; i++) {
              expect(spy.calls.argsFor(i)[0]).toBe(data.periods[i]);
              expect(spy.calls.argsFor(i)[1]).toEqual([]);  // drmInfos
            }
          })
          .catch(fail)
          .then(done);
    });
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
