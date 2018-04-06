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
  const dbName = 'shaka-offline-integration-test-db';
  const dbUpdateRetries = 5;

  let mockSEFactory = new shaka.test.MockStorageEngineFactory();

  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {!shaka.offline.IStorageEngine} */
  let engine;
  /** @type {!shaka.offline.Storage} */
  let storage;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.extern.SupportType} */
  let support;

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
      let engine = new shaka.offline.DBEngine(dbName);
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

    let storedContent;
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
    let onError = function(e) {
      // We should only get a not-found error.
      let expected = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED);
      shaka.test.Util.expectToEqualError(e, expected);
    };

    /** {@type {shaka.extern.StoredContent} */
    let storedContent;
    /** {@type {shaka.offline.OfflineUri} */
    let offlineUri;

    let sessionId;
    /** @type {!shaka.media.DrmEngine} */
    let drmEngine;
    storage.store('test:sintel-enc')
        .then(function(content) {
          storedContent = content;

          let contentUri = storedContent.offlineUri;
          goog.asserts.assert(
              contentUri,
              'Stored content should have an offline uri.');

          offlineUri = shaka.offline.OfflineUri.parse(contentUri);
          goog.asserts.assert(
              offlineUri,
              contentUri + ' should be a valid offline manifest uri.');
          goog.asserts.assert(
              offlineUri.isManifest(),
              contentUri + ' should be a valid offline manifest uri.');

          return engine.getManifest(offlineUri.key());
        })
        .then(function(manifestDB) {
          // Did we store a persistent license?
          expect(manifestDB).toBeTruthy();
          expect(manifestDB.sessionIds.length).toBeGreaterThan(0);
          sessionId = manifestDB.sessionIds[0];

          goog.asserts.assert(
              offlineUri,
              'Offline uri should not be null here');
          let converter = new shaka.offline.ManifestConverter(
              offlineUri.mechanism(), offlineUri.cell());
          let manifest = converter.fromManifestDB(manifestDB);
          let netEngine = player.getNetworkingEngine();
          goog.asserts.assert(netEngine, 'Must have a NetworkingEngine');

          // Create a DrmEngine now so we can use it to try to load the session
          // later, after the content has been deleted.
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

        let storedContent;
        storage.configure({usePersistentLicense: false});
        storage.store('test:multidrm_no_init_data')
            .then(function(content) {
              storedContent = content;

              let contentUri = storedContent.offlineUri;
              goog.asserts.assert(
                  contentUri,
                  'Stored content should have an offline uri.');

              let offlineUri = shaka.offline.OfflineUri.parse(contentUri);
              goog.asserts.assert(
                  offlineUri,
                  contentUri + ' should be a valid offline manifest uri.');
              goog.asserts.assert(
                  offlineUri.isManifest(),
                  contentUri + ' should be a valid offline manifest uri.');

              return engine.getManifest(offlineUri.key());
            })
            .then(function(manifestDB) {
              // There should not be any licenses stored.
              expect(manifestDB).toBeTruthy();
              expect(manifestDB.sessionIds.length).toEqual(0);

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
              let contentUri = storedContent.offlineUri;
              goog.asserts.assert(
                  contentUri,
                  'Stored content should have an offline uri.');

              let offlineUri = shaka.offline.OfflineUri.parse(contentUri);
              goog.asserts.assert(
                  offlineUri,
                  contentUri + ' should be a valid offline manifest uri.');
              goog.asserts.assert(
                  offlineUri.isManifest(),
                  contentUri + ' should be a valid offline manifest uri.');

              return engine.getManifest(offlineUri.key());
            })
            .then(function(manifestDB) {
              expect(manifestDB).toBeFalsy();
            })
            .catch(fail)
            .then(done);
      });

  /**
   * @param {number} time
   * @return {!Promise}
   */
  function waitForTime(time) {
    let p = new shaka.util.PublicPromise();
    let onTimeUpdate = function() {
      if (video.currentTime >= time) {
        p.resolve();
      }
    };

    eventManager.listen(video, 'timeupdate', onTimeUpdate);
    onTimeUpdate();  // In case we're already there.

    let timeout = shaka.test.Util.delay(30).then(function() {
      throw new Error('Timeout waiting for time');
    });
    return Promise.race([p, timeout]);
  }
});
