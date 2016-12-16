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
  var originalIsStorageEngineSupported;
  var originalCreateStorageEngine;
  var fakeStorageEngine;
  var fakeCreateStorageEngine;
  var parser;

  beforeAll(function() {
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
        'DBEngine', ['init', 'destroy', 'get', 'insert']);

    var commonResolve = Promise.resolve();
    var getResolve = Promise.resolve({data: new ArrayBuffer(0)});
    fakeStorageEngine.init.and.returnValue(commonResolve);
    fakeStorageEngine.destroy.and.returnValue(commonResolve);
    fakeStorageEngine.get.and.returnValue(getResolve);
    fakeStorageEngine.insert.and.returnValue(commonResolve);

    fakeCreateStorageEngine = jasmine.createSpy('createStorageEngine');
    fakeCreateStorageEngine.and.returnValue(fakeStorageEngine);
    shaka.offline.OfflineUtils.createStorageEngine = fakeCreateStorageEngine;

    parser = new shaka.offline.OfflineManifestParser();
  });

  afterEach(function() {
    parser.stop();
  });

  it('will query DBEngine for the manifest', function(done) {
    var uri = 'offline:123';
    fakeStorageEngine.get.and.returnValue(Promise.resolve({
      key: 0,
      originalManifestUri: '',
      duration: 60,
      size: 100,
      periods: [],
      sessionIds: [],
      drmInfo: null,
      appMetadata: null
    }));

    parser.start(uri, /* playerInterface */ null)
        .then(function(manifest) {
          expect(manifest).toBeTruthy();

          expect(fakeCreateStorageEngine).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.init).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.destroy).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.get).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.get).toHaveBeenCalledWith('manifest', 123);
        })
        .catch(fail)
        .then(done);
  });

  it('will fail if manifest not found', function(done) {
    var uri = 'offline:123';
    fakeStorageEngine.get.and.returnValue(Promise.resolve(null));

    parser.start(uri, /* playerInterface */ null)
        .then(fail)
        .catch(function(err) {
          shaka.test.Util.expectToEqualError(
              err,
              new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.STORAGE,
                  shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND, 123));

          expect(fakeCreateStorageEngine).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.init).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.destroy).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.get).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.get).toHaveBeenCalledWith('manifest', 123);
        })
        .then(done);
  });

  it('still calls destroy on error', function(done) {
    var uri = 'offline:123';
    fakeStorageEngine.get.and.returnValue(Promise.reject());

    parser.start(uri, /* playerInterface */ null)
        .then(fail)
        .catch(function(err) {
          expect(fakeCreateStorageEngine).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.init).toHaveBeenCalledTimes(1);
          expect(fakeStorageEngine.destroy).toHaveBeenCalledTimes(1);
        })
        .then(done);
  });

  it('will fail for invalid URI', function(done) {
    var uri = 'offline:abc';
    parser.start(uri, /* playerInterface */ null)
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

  describe('update expiration', function() {
    var sessionId;

    beforeEach(function(done) {
      sessionId = 'abc';

      var uri = 'offline:123';
      fakeStorageEngine.get.and.returnValue(Promise.resolve({
        key: 0,
        originalManifestUri: '',
        duration: 60,
        size: 100,
        expiration: Infinity,
        periods: [],
        sessionIds: [sessionId],
        drmInfo: null,
        appMetadata: null
      }));

      parser.start(uri, /* playerInterface */ null)
          .then(function(manifest) {
            expect(manifest).toBeTruthy();

            expect(fakeCreateStorageEngine).toHaveBeenCalledTimes(1);
            fakeStorageEngine.destroy.calls.reset();
            fakeStorageEngine.get.calls.reset();
            fakeStorageEngine.init.calls.reset();
            fakeStorageEngine.insert.calls.reset();
          })
          .catch(fail)
          .then(done);
    });

    it('will ignore when data is deleted', function(done) {
      fakeStorageEngine.get.and.returnValue(Promise.resolve(undefined));
      parser.onExpirationUpdated(sessionId, 123);

      shaka.test.Util.delay(0.1).then(function() {
        expect(fakeStorageEngine.get).toHaveBeenCalled();
        expect(fakeStorageEngine.destroy).toHaveBeenCalled();
        expect(fakeStorageEngine.insert).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('will ignore when updating unknown session', function(done) {
      parser.onExpirationUpdated('other', 123);

      shaka.test.Util.delay(0.1).then(function() {
        expect(fakeStorageEngine.get).toHaveBeenCalled();
        expect(fakeStorageEngine.destroy).toHaveBeenCalled();
        expect(fakeStorageEngine.insert).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('will update expiration', function(done) {
      parser.onExpirationUpdated(sessionId, 123);

      shaka.test.Util.delay(0.1).then(function() {
        expect(fakeStorageEngine.get).toHaveBeenCalled();
        expect(fakeStorageEngine.destroy).toHaveBeenCalled();
        expect(fakeStorageEngine.insert).toHaveBeenCalled();

        var stored = fakeStorageEngine.insert.calls.argsFor(0)[1];
        expect(stored.key).toBe(0);
        expect(stored.expiration).toBe(123);
      }).catch(fail).then(done);
    });
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
      fakeStorageEngine.get.and.returnValue(Promise.resolve(data));

      parser.start(uri, /* playerInterface */ null)
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
      fakeStorageEngine.get.and.returnValue(Promise.resolve(data));

      var spy = jasmine.createSpy('reconstructPeriod');
      shaka.offline.OfflineUtils.reconstructPeriod = spy;

      parser.start(uri, /* playerInterface */ null)
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
      fakeStorageEngine.get.and.returnValue(Promise.resolve(data));

      var spy = jasmine.createSpy('reconstructPeriod');
      shaka.offline.OfflineUtils.reconstructPeriod = spy;

      parser.start(uri, /* playerInterface */ null)
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
});
