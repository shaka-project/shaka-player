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

describe('Offline', function() {
  var originalName;
  var dbEngine;
  var storage;
  var player;
  var video;
  var support;

  beforeAll(/** @suppress {accessControls} */ function(done) {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    var supportPromise = shaka.Player.probeSupport()
        .then(function(data) {
          support = data;
        });

    originalName = shaka.offline.DBEngine.DB_NAME_;
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
    dbEngine.init(shaka.offline.OfflineUtils.DB_SCHEME).catch(fail).then(done);
  });

  afterEach(function(done) {
    Promise.all([storage.destroy(), player.destroy(), dbEngine.destroy()])
        .catch(fail)
        .then(done);
  });

  afterAll(/** @suppress {accessControls} */ function() {
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

  it('stores, plays, and deletes protected content', function(done) {
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
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED);
      shaka.test.Util.expectToEqualError(e, expected);
    };

    var storedContent;
    var sessionId;
    var drmEngine;
    storage.store('test:sintel-enc')
        .then(function(content) {
          storedContent = content;
          expect(storedContent.offlineUri).toBe('offline:0');
          return player.load(storedContent.offlineUri);
        })
        .then(function() {
          video.play();
          return shaka.test.Util.delay(5);
        })
        .then(function() { return dbEngine.get('manifest', 0); })
        .then(function(manifestDb) {
          expect(manifestDb.sessionIds.length).toBeGreaterThan(0);
          sessionId = manifestDb.sessionIds[0];

          // Create a DrmEngine so we can try to load the session later.
          var OfflineManifestParser = shaka.offline.OfflineManifestParser;
          var manifest = OfflineManifestParser.reconstructManifest(manifestDb);
          drmEngine = new shaka.media.DrmEngine(
              player.getNetworkingEngine(), onError, function() {});
          drmEngine.configure(player.getConfiguration().drm);
          return drmEngine.init(manifest, true /* isOffline */);
        })
        .then(function() {
          expect(video.currentTime).toBeGreaterThan(3);
          expect(video.ended).toBe(false);
          return player.unload();
        })
        .then(function() { return storage.remove(storedContent); })
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
          expect(session).toBeFalsy();
          return drmEngine.destroy();
        })
        .catch(fail)
        .then(done);
  });
});
