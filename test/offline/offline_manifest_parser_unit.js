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
  /** @const */
  var OfflineUri = shaka.offline.OfflineUri;

  /** @const */
  var mockSEFactory = new shaka.test.MockStorageEngineFactory();

  /** @const */
  var playerInterface =
      /** @type {shakaExtern.ManifestParser.PlayerInterface} */ (null);

  /** @type {!shaka.offline.IStorageEngine} */
  var fakeStorageEngine;
  /** @type {!shaka.offline.OfflineManifestParser} */
  var parser;

  beforeEach(function() {
    fakeStorageEngine = new shaka.test.MemoryStorageEngine();
    var getStorageEngine = function() {
      return Promise.resolve(fakeStorageEngine);
    };

    mockSEFactory.overrideIsSupported(true);
    mockSEFactory.overrideCreate(getStorageEngine);

    parser = new shaka.offline.OfflineManifestParser();
  });

  afterEach(function() {
    parser.stop();
    mockSEFactory.resetAll();
  });

  it('will query storage engine for the manifest', function(done) {
    new shaka.test.ManifestDBBuilder(fakeStorageEngine)
        .build().then(function(id) {
          /** @const {string} */
          var uri = OfflineUri.manifestIdToUri(id);
          return parser.start(uri, playerInterface);
        }).catch(fail).then(done);
  });

  it('will fail if manifest not found', function(done) {
    /** @type {number} */
    var id = 101;
    /** @type {string} */
    var uri = OfflineUri.manifestIdToUri(id);

    parser.start(uri, playerInterface)
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
        .then(done);
  });

  it('will fail for invalid URI', function(done) {
    var uri = 'offline:this-is-invalid';
    parser.start(uri, playerInterface)
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
    /** @const {string} */
    var sessionId = 'abc';

    /** @type {number} */
    var id;

    /** @type {number} */
    var expiration = 256;

    beforeEach(function(done) {
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .onManifest(function(manifest) {
            manifest.sessionIds = [sessionId];
          })
          .build().then(function(newId) {
            //  Save the id so that we can use it later to fetch the manifest.
            id = newId;

            /** @const {string} */
            var uri = OfflineUri.manifestIdToUri(id);
            return parser.start(uri, playerInterface);
          }).catch(fail).then(done);
    });

    it('will ignore when data is deleted', function(done) {
      fakeStorageEngine.removeManifests([0], null)
          .then(function() {
            parser.onExpirationUpdated(sessionId, expiration);
          })
          .catch(fail)
          .then(done);
    });

    it('will ignore when updating unknown session', function() {
      parser.onExpirationUpdated('other', expiration);
    });

    it('will update expiration', function(done) {
      parser.onExpirationUpdated(sessionId, expiration);

      shaka.test.Util.delay(0.1).then(function() {
        return fakeStorageEngine.getManifest(id);
      }).then(function(manifest) {
        expect(manifest.expiration).toBe(expiration);
      }).catch(fail).then(done);
    });
  });

  describe('reconstructing manifest', function() {
    /** @const */
    var originalReconstructPeriod =
        shaka.offline.OfflineUtils.reconstructPeriod;

    afterAll(function() {
      shaka.offline.OfflineUtils.reconstructPeriod = originalReconstructPeriod;
    });

    it('converts non-Period members correctly', function(done) {
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .onManifest(function(manifest) {
            manifest.sessionIds = ['abc', '123'];
            manifest.duration = 60;
          })
          .build().then(function(id) {
            /** @const {string} */
            var uri = OfflineUri.manifestIdToUri(id);
            return parser.start(uri, playerInterface);
          }).then(function(manifest) {
            expect(manifest).toBeTruthy();

            expect(manifest.offlineSessionIds.length).toBe(2);
            expect(manifest.offlineSessionIds).toContain('abc');
            expect(manifest.offlineSessionIds).toContain('123');

            var timeline = manifest.presentationTimeline;
            expect(timeline).toBeTruthy();
            expect(timeline.isLive()).toBe(false);
            expect(timeline.getPresentationStartTime()).toBe(null);
            expect(timeline.getDuration()).toBe(60);
          }).catch(fail).then(done);
    });

    it('will accept DrmInfo', function(done) {
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

      var spy = jasmine.createSpy('reconstructPeriod');
      shaka.offline.OfflineUtils.reconstructPeriod =
          shaka.test.Util.spyFunc(spy);

      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .onManifest(function(manifest) {
            manifest.drmInfo = drmInfo;
          })
          .period()
          .build().then(function(id) {
            /** @const {string} */
            var uri = OfflineUri.manifestIdToUri(id);
            return parser.start(uri, playerInterface);
          }).then(function(manifest) {
            expect(manifest).toBeTruthy();

            expect(spy).toHaveBeenCalled();
            expect(spy.calls.argsFor(0)[1]).toEqual([drmInfo]);
          }).catch(fail).then(done);
    });

    it('will call reconstructPeriod for each Period', function(done) {
      var spy = jasmine.createSpy('reconstructPeriod');
      shaka.offline.OfflineUtils.reconstructPeriod =
          shaka.test.Util.spyFunc(spy);

      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .onManifest(function(manifest) {
            manifest.sessionId = ['abc', '123'];
          })
          .period()
          .period()
          .period()
          .build().then(function(id) {
            /** @const {string} */
            var uri = OfflineUri.manifestIdToUri(id);
            return parser.start(uri, playerInterface);
          })
          .then(function(manifest) {
            expect(manifest).toBeTruthy();
            expect(manifest.periods.length).toBe(3);
          })
          .catch(fail)
          .then(done);
    });
  });
});
