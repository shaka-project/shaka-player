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
  var OfflineUri = shaka.offline.OfflineUri;

  /** @const {string} */
  var dbName = 'shaka-offline-integration-test-db';

  var mockSEFactory = new shaka.test.MockStorageEngineFactory();

  /** @const {number} */
  var dbUpdateRetries = 5;

  /** @type {!shaka.util.EventManager} */
  var eventManager;
  /** @type {!shaka.offline.IStorageEngine} */
  var engine;
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

    shaka.Player.probeSupport().then(function(data) {
      support = data;
    }).catch(fail).then(done);
  });

  beforeEach(function(done) {
    mockSEFactory.overrideCreate(function() {
      /** @type {!shaka.offline.DBEngine} */
      var engine = new shaka.offline.DBEngine(dbName);
      return engine.init().then(function() { return engine; });
    });

    eventManager = new shaka.util.EventManager();
    player = new shaka.Player(video);
    player.addEventListener('error', fail);
    storage = new shaka.offline.Storage(player);

    // Ensure we start with a clean slate.
    return shaka.offline.DBEngine.deleteDatabase(dbName)
        .then(function() {
          // Make sure that the db engine is using the correct version before
          // we start our tests. If we can't get the correct version, we should
          // fail the test.
          engine = new shaka.offline.DBEngine(dbName);
          return engine.init(dbUpdateRetries);
        }).catch(fail).then(done);
  });

  afterEach(function(done) {
    Promise.all([
      eventManager.destroy(),
      storage.destroy(),
      player.destroy(),
      engine.destroy()
    ]).catch(fail).then(done);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  it('stores and plays clear content', function(done) {
    if (!support['offline']) {
      pending('Offline storage not supported');
    }

    var storedContent;
    storage.store('test:sintel')
        .then(function(content) {
          storedContent = content;

          goog.asserts.assert(
              storedContent.offlineUri,
              'Downloaded content should have a valid uri.');

          return player.load(storedContent.offlineUri);
        })
        .then(function() {
          video.play();
          return shaka.test.Util.delay(15);
        })
        .then(function() {
          expect(video.currentTime).toBeGreaterThan(3);
          expect(video.ended).toBe(false);
          return player.unload();
        })
        .then(function() {
          return storage.remove(storedContent.offlineUri);
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

          goog.asserts.assert(
              storedContent.offlineUri,
              'Downloaded content should have a valid uri.');

          /** @type {string} */
          var uri = storedContent.offlineUri;

          /** @type {?number} */
          var id = OfflineUri.uriToManifestId(uri);
          goog.asserts.assert(
              id != null,
              uri + ' should be a valid offline manifest uri.');
          return engine.getManifest(id);
        })
        .then(function(manifestDb) {
          // Did we store a persistent license?
          expect(manifestDb).toBeTruthy();
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
          return shaka.test.Util.delay(15);
        })
        .then(function() {
          // Is it playing?
          expect(video.currentTime).toBeGreaterThan(3);
          expect(video.ended).toBe(false);
          return player.unload();
        })
        .then(function() {
          // Remove the content.
          return storage.remove(storedContent.offlineUri);
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
        .catch(function(error) {
          fail(error);

          // Make sure we clean up the extra DrmEngine even if the Promise
          // chain and test fail.
          if (drmEngine) {
            return drmEngine.destroy();
          }
        })
        .then(done);
  });

  drm_it(
      'stores, plays, and deletes protected content with a temporary license',
      function(done) {
        if (!support['offline']) {
          pending('Offline not supported');
        }

        // Because this does not rely on persistent licenses, it should be
        // testable with PlayReady as well as Widevine.
        if (!support.drm['com.widevine.alpha'] &&
            !support.drm['com.microsoft.playready']) {
          pending('Widevine/PlayReady not supported');
        }

        // Because we do not need a persistent license, we also do not need init
        // data in the manifest.  Using this covers issue #1159, where we used
        // to throw an error inappropriately.
        shaka.test.TestScheme.setupPlayer(player, 'multidrm_no_init_data');

        var storedContent;
        storage.configure({ usePersistentLicense: false });
        storage.store('test:multidrm_no_init_data')
            .then(function(content) {
              storedContent = content;

              goog.asserts.assert(
                  storedContent.offlineUri,
                  'Downloaded content should have a valid uri.');

             /** @type {string} */
              var uri = storedContent.offlineUri;

              /** @type {?number} */
              var id = OfflineUri.uriToManifestId(uri);
              goog.asserts.assert(
                  id != null,
                  uri + ' should be a valid offline manifest uri.');
              return engine.getManifest(id);
            })
            .then(function(manifestDb) {
              // There should not be any licenses stored.
              expect(manifestDb).toBeTruthy();
              expect(manifestDb.sessionIds.length).toEqual(0);

              // Load the stored content.
              return player.load(storedContent.offlineUri);
            })
            .then(function() {
              // Let it play some.
              video.play();
              return waitForTime(3);
            })
            .then(function() {
              // Is it playing?
              expect(video.currentTime).toBeGreaterThan(3);
              expect(video.ended).toBe(false);
              return player.unload();
            })
            .then(function() {
              // Remove the content.
              return storage.remove(storedContent.offlineUri);
            })
            .then(function() {
              /** @type {string} */
              var uri = storedContent.offlineUri;

              /** @type {?number} */
              var id = OfflineUri.uriToManifestId(uri);
              goog.asserts.assert(
                  id != null,
                  uri + ' should be a valid offline manifest uri.');
              return engine.getManifest(id);
            })
            .then(function(manifestDb) {
              expect(manifestDb).toBeFalsy();
            })
            .catch(fail)
            .then(done);
      });

  /**
   * @param {number} time
   * @return {!Promise}
   */
  function waitForTime(time) {
    var p = new shaka.util.PublicPromise();
    var onTimeUpdate = function() {
      if (video.currentTime >= time) {
        p.resolve();
      }
    };

    eventManager.listen(video, 'timeupdate', onTimeUpdate);
    onTimeUpdate();  // In case we're already there.

    var timeout = shaka.test.Util.delay(30).then(function() {
      throw new Error('Timeout waiting for time');
    });
    return Promise.race([p, timeout]);
  }
});
