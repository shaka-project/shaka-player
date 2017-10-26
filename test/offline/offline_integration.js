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

describe('Offline', /** @suppress {accessControls} */ function() {
  var Scheme = shaka.offline.OfflineScheme;

  /** @const */
  var originalName = shaka.offline.DBEngine.DB_NAME_;

  /** @type {!shaka.offline.DBEngine} */
  var dbEngine;
  /** @type {!shaka.offline.Storage} */
  var storage;
  /** @type {!shaka.Player} */
  var player;
  /** @type {!HTMLVideoElement} */
  var video;
  /** @type {shakaExtern.SupportType} */
  var support;

  beforeAll(function(done) {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    var supportPromise = shaka.Player.probeSupport()
        .then(function(data) {
          support = data;
        });

    shaka.offline.DBEngine.DB_NAME_ += '_test';
    // Ensure we start with a clean slate.
    Promise.all([shaka.offline.DBEngine.deleteDatabase(), supportPromise])
        .catch(fail)
        .then(done);
  });

  beforeEach(function(done) {
    player = new shaka.Player(video);
    player.addEventListener('error', fail);
    storage = new shaka.offline.Storage(player);
    dbEngine = new shaka.offline.DBEngine();
    shaka.offline.StorageEngineFactory.initEngine(dbEngine)
        .catch(fail).then(done);
  });

  afterEach(function(done) {
    Promise.all([storage.destroy(), player.destroy(), dbEngine.destroy()])
        .catch(fail)
        .then(done);
  });

  afterAll(function() {
    document.body.removeChild(video);
    shaka.offline.DBEngine.DB_NAME_ = originalName;
  });

  it('stores and plays clear content', function(done) {
    if (!support['offline']) {
      pending('Offline storage not supported');
    }

    var storedContent;
    storage.store('test:sintel')
        .then(function(content) {
          storedContent = content;
          return player.load(storedContent.offlineUri);
        })
        .then(function() {
          video.play();
          return shaka.test.Util.delay(10);
        })
        .then(function() {
          expect(video.currentTime).toBeGreaterThan(3);
          expect(video.ended).toBe(false);
          return player.unload();
        })
        .then(function() {
          return storage.remove(storedContent);
        })
        .catch(fail)
        .then(done);
  });

  drm_it('stores, plays, and deletes protected content', function(done) {
    // TODO: Add a PlayReady version once Edge supports offline.
    if (!support['offline'] ||
        !support.drm['com.widevine.alpha'] ||
        !support.drm['com.widevine.alpha'].persistentState) {
      pending('Persistent licenses not supported');
    }

    shaka.test.TestScheme.setupPlayer(player, 'sintel-enc');
    var onError = function(e) {
      // We should only get a not-found error.
      var expected = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED);
      shaka.test.Util.expectToEqualError(e, expected);
    };

    var storedContent;
    var sessionId;
    /** @type {!shaka.media.DrmEngine} */
    var drmEngine;
    storage.store('test:sintel-enc')
        .then(function(content) {
          storedContent = content;
          expect(storedContent.offlineUri).toBe(Scheme.manifestIdToUri(0));
          return dbEngine.get('manifest', 0);
        })
        .then(function(manifestDb) {
          // Did we store a persistent license?
          expect(manifestDb.sessionIds.length).toBeGreaterThan(0);
          sessionId = manifestDb.sessionIds[0];

          // Create a DrmEngine now so we can use it to try to load the session
          // later, after the content has been deleted.
          var OfflineManifestParser = shaka.offline.OfflineManifestParser;
          var manifest = OfflineManifestParser.reconstructManifest(manifestDb);
          var netEngine = player.getNetworkingEngine();
          goog.asserts.assert(netEngine, 'Must have a NetworkingEngine');
          drmEngine = new shaka.media.DrmEngine({
            netEngine: netEngine,
            onError: onError,
            onKeyStatus: function() {},
            onExpirationUpdated: function() {},
            onEvent: function() {}
          });
          drmEngine.configure(player.getConfiguration().drm);
          return drmEngine.init(manifest, true /* isOffline */);
        })
        .then(function() {
          // Load the stored content.
          return player.load(storedContent.offlineUri);
        })
        .then(function() {
          // Let it play some.
          video.play();
          return shaka.test.Util.delay(10);
        })
        .then(function() {
          // Is it playing?
          expect(video.currentTime).toBeGreaterThan(3);
          expect(video.ended).toBe(false);
          return player.unload();
        })
        .then(function() {
          // Remove the content.
          return storage.remove(storedContent);
        })
        .then(
            /**
             * @suppress {accessControls}
             * @return {!Promise.<MediaKeySession>}
             */
            function() {
              // Should fail, will call |onError| and resolve with null.
              return drmEngine.loadOfflineSession_(sessionId);
            }
        )
        .then(function(session) {
          // We should not have been able to load the session.
          // Removing the content should have deleted the session.
          expect(session).toBeFalsy();
          return drmEngine.destroy();
        })
        .catch(fail)
        .then(done);
  });

  drm_it(
      'stores, plays, and deletes protected content with a temporary license',
      function(done) {
        // Because this does not rely on persistent licenses, it should be
        // testable with PlayReady as well as Widevine.
        if (!support['offline'] ||
            !support.drm['com.widevine.alpha'] ||
            !support.drm['com.microsoft.playready']) {
          pending('Offline or DRM not supported');
        }

        shaka.test.TestScheme.setupPlayer(player, 'sintel-enc');

        var storedContent;
        storage.configure({ usePersistentLicense: false });
        storage.store('test:sintel-enc')
            .then(function(content) {
              storedContent = content;
              expect(storedContent.offlineUri).toBe(Scheme.manifestIdToUri(0));
              return dbEngine.get('manifest', 0);
            })
            .then(function(manifestDb) {
              // There should not be any licenses stored.
              expect(manifestDb.sessionIds.length).toEqual(0);

              // Load the stored content.
              return player.load(storedContent.offlineUri);
            })
            .then(function() {
              // Let it play some.
              video.play();
              return shaka.test.Util.delay(10);
            })
            .then(function() {
              // Is it playing?
              expect(video.currentTime).toBeGreaterThan(3);
              expect(video.ended).toBe(false);
              return player.unload();
            })
            .then(function() {
              // Remove the content.
              return storage.remove(storedContent);
            })
            .then(function() { return dbEngine.get('manifest', 0); })
            .then(function(manifestDb) {
              expect(manifestDb).toBeFalsy();
            })
            .catch(fail)
            .then(done);
      });
});
