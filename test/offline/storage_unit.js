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

describe('Storage', function() {
  const englishUS = 'en-us';
  const frenchCanadian= 'fr-ca';

  const manifestWithPerStreamBandwidthUri =
      'fake:manifest-with-per-stream-bandwidth';
  const manifestWithoutPerStreamBandwidthUri =
      'fake:manifest-without-per-stream-bandwidth';
  const manifestWithNonZeroStartUri = 'fake:manifest-with-non-zero-start';
  const manifestWithLiveTimelineUri = 'fake:manifest-with-live-timeline';

  const segment1Uri = 'fake:segment-1';
  const segment2Uri = 'fake:segment-2';
  const segment3Uri = 'fake:segment-3';
  const segment4Uri = 'fake:segment-4';

  const noMetadata = {};

  const kbps = 1000;

  beforeEach(async () => {
    // Make sure we start with a clean slate between each run.
    await eraseStorage();
  });

  afterEach(async () => {
    // Make sure we don't leave anything behind.
    await eraseStorage();
  });

  describe('storage delete all', function() {
    /** @type {!shaka.Player} */
    let player;

    beforeEach(function() {
      // Use a real Player since Storage only uses the configuration and
      // networking engine.  This allows us to use Player.configure in these
      // tests.
      player = new shaka.Player(new shaka.test.FakeVideo());
    });

    afterEach(async function() {
      await player.destroy();
    });

    it('removes all content from storage', checkAndRun(async function() {
      const TestManifestParser = shaka.test.TestScheme.ManifestParser;
      const manifestUri = 'test:sintel';

      // Store a piece of content.
      await withStorage((storage) => {
        return storage.store(manifestUri, noMetadata, TestManifestParser);
      });

      // Make sure that the content can be found.
      await withStorage(async (storage) => {
        let content = await storage.list();
        expect(content).toBeTruthy();
        expect(content.length).toBe(1);
      });

      // Ask storage to erase everything.
      await shaka.offline.Storage.deleteAll();

      // Make sure that all content that was previously found is no gone.
      await withStorage(async (storage) => {
        let content = await storage.list();
        expect(content).toBeTruthy();
        expect(content.length).toBe(0);
      });
    }));

    /**
     * @param {function(!shaka.offline.Storage)|
     *         function(!shaka.offline.Storage):!Promise} action
     * @return {!Promise}
     */
    function withStorage(action) {
      let storage = new shaka.offline.Storage(player);
      return shaka.util.IDestroyable.with([storage], () => {
        return action(storage);
      });
    }
  });

  describe('persistent license', function() {
    /** @type {!shaka.Player} */
    let player;
    /** @type {!shaka.offline.Storage} */
    let storage;

    beforeEach(function() {
      // Use a real Player since Storage only uses the configuration and
      // networking engine.  This allows us to use Player.configure in these
      // tests.
      player = new shaka.Player(new shaka.test.FakeVideo());
      storage = new shaka.offline.Storage(player);
    });

    afterEach(async function() {
      await storage.destroy();
      await player.destroy();
    });

    // TODO: Still failing in Chrome canary 73 on 2018-12-12.
    // Some combination of these bugs is preventing this test from working:
    //   http://crbug.com/690583
    //   http://crbug.com/887535
    //   http://crbug.com/887635
    //   http://crbug.com/883895
    quarantined_it('removes persistent license',
        drmCheckAndRun(async function() {
      const TestManifestParser = shaka.test.TestScheme.ManifestParser;

      // PART 1 - Download and store content that has a persistent license
      //          associated with it.
      let stored = await storage.store(
          'test:sintel-enc', noMetadata, TestManifestParser);
      expect(stored.offlineUri).toBeTruthy();

      /** @type {shaka.offline.OfflineUri} */
      let uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      goog.asserts.assert(uri, 'Stored offline uri should be non-null');

      let manifest = await getStoredManifest(uri);
      expect(manifest.offlineSessionIds).toBeTruthy();
      expect(manifest.offlineSessionIds.length).toBeTruthy();

      // PART 2 - Check that the licences are stored.
      await withDrm(player, manifest, (drm) => {
        return Promise.all(manifest.offlineSessionIds.map(async (session) => {
          let foundSession = await loadOfflineSession(drm, session);
          expect(foundSession).toBeTruthy();
        }));
      });

      // PART 3 - Remove the manifest from storage. This should remove all the
      // sessions.
      await storage.remove(uri.toString());

      // PART 4 - Check that the licenses were removed.
      try {
        await withDrm(player, manifest, (drm) => {
          return Promise.all(manifest.offlineSessionIds.map(async (session) => {
            let notFoundSession = await loadOfflineSession(drm, session);
            expect(notFoundSession).toBeFalsy();
          }));
        });

        return Promise.reject('Expected drm to throw OFFLINE_SESSION_REMOVED');
      } catch (e) {
        expect(e).toBeTruthy();
        expect(e.code).toBe(shaka.util.Error.Code.OFFLINE_SESSION_REMOVED);
      }
    }));
  });

  describe('default track selection callback', function() {
    const select = shaka.offline.Storage.defaultTrackSelect;

    it('selects the largest SD video with middle quality audio', function() {
      const tracks = [
        variantTrack(0, 360, englishUS, 1 * kbps),
        variantTrack(1, 480, englishUS, 2.0 * kbps),
        variantTrack(2, 480, englishUS, 2.1 * kbps),
        variantTrack(3, 480, englishUS, 2.2 * kbps),
        variantTrack(4, 720, englishUS, 3 * kbps),
        variantTrack(5, 1080, englishUS, 4 * kbps),
      ];

      let selected = select(englishUS, tracks);
      expect(selected).toBeTruthy();
      expect(selected.length).toBe(1);
      expect(selected[0]).toBeTruthy();
      expect(selected[0].language).toBe(englishUS);
      expect(selected[0].height).toBe(480);
      expect(selected[0].bandwidth).toBe(2.1 * kbps);
    });

    it('selects all text tracks', function() {
      const tracks = [
        textTrack(0, englishUS),
        textTrack(1, frenchCanadian),
      ];

      let selected = select(englishUS, tracks);
      expect(selected).toBeTruthy();
      expect(selected.length).toBe(2);
      tracks.forEach((track) => {
        expect(selected).toContain(track);
      });
    });

    describe('language matching', function() {
      it('finds exact match', function() {
        const tracks = [
          variantTrack(0, 480, 'eng-us', 1 * kbps),
          variantTrack(1, 480, 'fr-ca', 1 * kbps),
          variantTrack(2, 480, 'eng-ca', 1 * kbps),
        ];

        let selected = select('eng-us', tracks);
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('eng-us');
      });

      it('finds exact match with only base', function() {
        const tracks = [
          variantTrack(0, 480, 'eng-us', 1 * kbps),
          variantTrack(1, 480, 'fr-ca', 1 * kbps),
          variantTrack(2, 480, 'eng-ca', 1 * kbps),
          variantTrack(3, 480, 'eng', 1 * kbps),
        ];

        let selected = select('eng', tracks);
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('eng');
      });

      it('finds base match when exact match is not found', function() {
        const tracks = [
          variantTrack(0, 480, 'eng-us', 1 * kbps),
          variantTrack(1, 480, 'fr-ca', 1 * kbps),
          variantTrack(2, 480, 'eng-ca', 1 * kbps),
        ];

        let selected = select('fr', tracks);
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('fr-ca');
      });

      it('finds common base when exact match is not found', function() {
        const tracks = [
          variantTrack(0, 480, 'eng-us', 1 * kbps),
          variantTrack(1, 480, 'fr-ca', 1 * kbps),
          variantTrack(2, 480, 'eng-ca', 1 * kbps),
        ];

        let selected = select('fr-uk', tracks);
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('fr-ca');
      });

      it('finds primary track when no match is found', function() {
        const tracks = [
          variantTrack(0, 480, 'eng-us', 1 * kbps),
          variantTrack(1, 480, 'fr-ca', 1 * kbps),
          variantTrack(2, 480, 'eng-ca', 1 * kbps),
        ];

        tracks[0].primary = true;

        let selected = select('de', tracks);
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('eng-us');
      });
    });  // describe('language matching')
  });  // describe('default track selection callback')

  describe('no support', function() {
    /** @type {!shaka.Player} */
    let player;
    /** @type {!shaka.offline.Storage} */
    let storage;

    beforeEach(function() {
      shaka.offline.StorageMuxer.overrideSupport({});

      player = new shaka.Player(new shaka.test.FakeVideo());
      storage = new shaka.offline.Storage(player);
    });

    afterEach(async function() {
      await storage.destroy();
      await player.destroy();

      shaka.offline.StorageMuxer.clearOverride();
    });

    it('throws error using list', async function() {
      try {
        await storage.list();
        fail();
      } catch (e) {
        expect(e.code).toBe(shaka.util.Error.Code.STORAGE_NOT_SUPPORTED);
      }
    });

    it('throws error using store', async function() {
      try {
        await storage.store('the-uri-wont-matter');
        fail();
      } catch (e) {
        expect(e.code).toBe(shaka.util.Error.Code.STORAGE_NOT_SUPPORTED);
      }
    });

    it('throws error using remove', async function() {
      try {
        await storage.remove('the-uri-wont-matter');
        fail();
      } catch (e) {
        expect(e.code).toBe(shaka.util.Error.Code.STORAGE_NOT_SUPPORTED);
      }
    });
  });

  describe('basic function', function() {
    /**
     * Keep a reference to the networking engine so that we can interrupt
     * networking calls.
     *
     * @type {!shaka.test.FakeNetworkingEngine}
     */
    let netEngine;
    /** @type {!shaka.Player} */
    let player;
    /** @type {!shaka.offline.Storage} */
    let storage;

    beforeEach(function() {
      netEngine = makeNetworkEngine();

      // Use a real Player since Storage only uses the configuration and
      // networking engine.  This allows us to use Player.configure in these
      // tests.
      player = new shaka.Player(new shaka.test.FakeVideo(), function(player) {
        player.createNetworkingEngine = () => netEngine;
      });

      storage = new shaka.offline.Storage(player);
    });

    afterEach(async function() {
      await storage.destroy();
      await player.destroy();
    });

    describe('reports progress on store', function() {
      it('uses stream bandwidth', checkAndRun(async function() {
        // Change storage to only store one track so that it will be easy
        // for use to ensure that only the one track was stored.
        let selectTrack = (tracks) => {
          let selected = tracks.filter((t) => t.language == frenchCanadian);
          expect(selected.length).toBe(1);
          return selected;
        };

        /**
         * These numbers are the overall progress based on the segment sizes
         * per stream. We assume a specific download order for the content
         * based on the order of the streams and segments.
         *
         * Since the audio stream has smaller segments, its contribution to
         * the overall progress is much smaller than the video stream segments.
         *
         * @type {!Array.<number>}
         */
        let progressSteps = [
          0.19, 0.25, 0.44, 0.5, 0.69, 0.75, 0.94, 1.0
        ];

        let progressCallback = (content, progress) => {
          expect(progress).toBeCloseTo(progressSteps.shift());
        };

        storage.configure({
          trackSelectionCallback: selectTrack,
          progressCallback: progressCallback
        });

        // Store a manifest with per stream bandwidth. This should result with
        // a more accurate progression of progress values.
        await storage.store(
            manifestWithPerStreamBandwidthUri, noMetadata, FakeManifestParser);
        expect(progressSteps.length).toBe(0);
      }));

      it('uses variant bandwidth when stream bandwidth is unavailable',
          checkAndRun(async function() {
            // Change storage to only store one track so that it will be easy
            // for use to ensure that only the one track was stored.
            let selectTrack = (tracks) => {
              let selected = tracks.filter((t) => t.language == frenchCanadian);
              expect(selected.length).toBe(1);
              return selected;
            };

            /**
             * These numbers are the overall progress based on the segment sizes
             * per stream. We assume a specific download order for the content
             * based on the order of the streams and segments.
             *
             * Since we do not have per-stream bandwidth, the amount each
             * influences the overall progress is based on the stream type,
             * storage's default bandwidth assumptions, and the variant's
             * bandwidth.
             *
             * In this example we see a larger difference between the audio and
             * video contributions to progress.
             *
             * @type {!Array.<number>}
             */
            let progressSteps = [
              0.01, 0.25, 0.26, 0.5, 0.51, 0.75, 0.76, 1.0
            ];

            let progressCallback = (content, progress) => {
              expect(progress).toBeCloseTo(progressSteps.shift());
            };

            storage.configure({
              trackSelectionCallback: selectTrack,
              progressCallback: progressCallback
            });

            // Store a manifest with bandwidth only for the variant (no per
            // stream bandwidth). This should result in a less accurate
            // progression of progress values as default values will be used.
            await storage.store(
                manifestWithoutPerStreamBandwidthUri,
                noMetadata,
                FakeManifestParser);
            expect(progressSteps.length).toBe(0);
         }));
    });

    it('stores and lists content', checkAndRun(async function() {
      // Just use any three manifests as we don't care about the manifests
      // right now.
      const manifestUris = [
        manifestWithPerStreamBandwidthUri,
        manifestWithoutPerStreamBandwidthUri,
        manifestWithNonZeroStartUri
      ];

      // TODO(vaage): This can be changed to use Array.map once storage is
      //              allowed to do multiple store command on the same instance.
      await storage.store(manifestUris[0], noMetadata, FakeManifestParser);
      await storage.store(manifestUris[1], noMetadata, FakeManifestParser);
      await storage.store(manifestUris[2], noMetadata, FakeManifestParser);

      let content = await storage.list();
      expect(content).toBeTruthy();

      let originalUris = content.map((c) => c.originalManifestUri);
      expect(originalUris).toBeTruthy();
      expect(originalUris.length).toBe(3);

      originalUris.forEach((uri) => {
        expect(originalUris).toContain(uri);
      });
    }));

    it('only stores chosen tracks', checkAndRun(async function() {
      // Change storage to only store one track so that it will be easy
      // for use to ensure that only the one track was stored.
      let selectTrack = (tracks) => {
        let selected = tracks.filter((t) => t.language == frenchCanadian);
        expect(selected.length).toBe(1);
        return selected;
      };
      storage.configure({
        trackSelectionCallback: selectTrack
      });

      // Stored content should reflect the tracks in the first period, so we
      // should only find track there.
      let stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, FakeManifestParser);
      expect(stored).toBeTruthy();
      expect(stored.tracks).toBeTruthy();
      expect(stored.tracks.length).toBe(1);
      expect(stored.tracks[0].language).toBe(frenchCanadian);

      // Pull the manifest out of storage so that we can ensure that it only
      // has one variant.
      /** @type {shaka.offline.OfflineUri} */
      let uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      expect(uri).toBeTruthy();

      /** @type {!shaka.offline.StorageMuxer} */
      let muxer = new shaka.offline.StorageMuxer();
      await shaka.util.IDestroyable.with([muxer], async () => {
        await muxer.init();
        let cell = await muxer.getCell(uri.mechanism(), uri.cell());
        let manifests = await cell.getManifests([uri.key()]);
        expect(manifests).toBeTruthy();
        expect(manifests.length).toBe(1);

        let manifest = manifests[0];
        expect(manifest).toBeTruthy();
        expect(manifest.periods).toBeTruthy();
        expect(manifest.periods.length).toBe(1);

        let period = manifest.periods[0];
        expect(period).toBeTruthy();
        expect(period.streams).toBeTruthy();
        // There should be 2 streams, an audio and a video stream.
        expect(period.streams.length).toBe(2);

        let audio = period.streams.filter((s) => s.contentType == 'audio')[0];
        expect(audio).toBeTruthy();
        expect(audio.language).toBe(frenchCanadian);
      });
    }));

    it('stores drm info without license', checkAndRun(async function() {
      const drmInfo = makeDrmInfo();
      const session1 = 'session-1';
      const session2 = 'session-2';
      const expiration = 1000;

      // TODO(vaage): Is there a way we can set the session ids without needing
      //               to overload an internal call in storage.
      let drm = new shaka.test.FakeDrmEngine();
      drm.setDrmInfo(drmInfo);
      drm.setSessionIds([session1, session2]);
      drm.getExpiration.and.returnValue(expiration);

      overrideDrmAndManifest(
          storage,
          drm,
          makeManifestWithPerStreamBandwidth());

      let stored = await storage.store(manifestWithPerStreamBandwidthUri);

      /** @type {shaka.offline.OfflineUri} */
      let uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      expect(uri).toBeTruthy();

      /** @type {!shaka.offline.StorageMuxer} */
      let muxer = new shaka.offline.StorageMuxer();
      await shaka.util.IDestroyable.with([muxer], async () => {
        await muxer.init();
        let cell = await muxer.getCell(uri.mechanism(), uri.cell());
        let manifests = await cell.getManifests([uri.key()]);
        let manifest = manifests[0];
        expect(manifest).toBeTruthy();

        expect(manifest.drmInfo).toEqual(drmInfo);

        expect(manifest.expiration).toBe(expiration);

        expect(manifest.sessionIds).toBeTruthy();
        expect(manifest.sessionIds.length).toBe(2);
        expect(manifest.sessionIds).toContain(session1);
        expect(manifest.sessionIds).toContain(session2);
      });
    }));

    // Make sure that when we configure storage to NOT store persistent
    // licenses that we don't store the sessions.
    it('stores drm info with no license',
        checkAndRun(async function() {
          const drmInfo = makeDrmInfo();
          const session1 = 'session-1';
          const session2 = 'session-2';

          // TODO(vaage): Is there a way we can set the session ids without
          //              needing to overload an internal call in storage.
          let drm = new shaka.test.FakeDrmEngine();
          drm.setDrmInfo(drmInfo);
          drm.setSessionIds([session1, session2]);

          overrideDrmAndManifest(
              storage,
              drm,
              makeManifestWithPerStreamBandwidth());
          storage.configure({usePersistentLicense: false});

          let stored = await storage.store(manifestWithPerStreamBandwidthUri);

          /** @type {shaka.offline.OfflineUri} */
          let uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
          expect(uri).toBeTruthy();

          /** @type {!shaka.offline.StorageMuxer} */
          let muxer = new shaka.offline.StorageMuxer();
          await shaka.util.IDestroyable.with([muxer], async () => {
            await muxer.init();
            let cell = await muxer.getCell(uri.mechanism(), uri.cell());
            let manifests = await cell.getManifests([uri.key()]);
            let manifest = manifests[0];
            expect(manifest).toBeTruthy();

            expect(manifest.drmInfo).toEqual(drmInfo);

            // When there is no expiration, the expiration is set to Infinity.
            expect(manifest.expiration).toBe(Infinity);

            expect(manifest.sessionIds).toBeTruthy();
            expect(manifest.sessionIds.length).toBe(0);
          });
        }));

    // TODO(vaage): Remove the need to limit the number of store commands. With
    //              all the changes, it should be very easy to do now.
    it('throws an error if another store is in progress',
        checkAndRun(async function() {
          // Block the network so that we won't finish the first store command.
          /** @type {!shaka.util.PublicPromise} */
          let hangingPromise = netEngine.delayNextRequest();
          /** @type {!Promise} */
          let storePromise = storage.store(
              manifestWithPerStreamBandwidthUri,
              noMetadata,
              FakeManifestParser);

          try {
            await storage.store(
                manifestWithoutPerStreamBandwidthUri,
                noMetadata,
                FakeManifestParser);
            fail();
          } catch (e) {
            const Code = shaka.util.Error.Code;
            expect(e.code).toBe(Code.STORE_ALREADY_IN_PROGRESS);
          }

          // Unblock the original store and wait for it to complete.
          hangingPromise.resolve();
          await storePromise;
        }));

    it('throws an error if the content is a live stream',
        checkAndRun(async function() {
          try {
            await storage.store(
                manifestWithLiveTimelineUri,
                noMetadata,
                FakeManifestParser);
          } catch (e) {
            const Code = shaka.util.Error.Code;
            expect(e.code).toBe(Code.CANNOT_STORE_LIVE_OFFLINE);
          }
        }));

    it('throws an error if DRM sessions are not ready',
        checkAndRun(async function() {
          const drmInfo = makeDrmInfo();
          const noSessions = [];

          // TODO(vaage): Is there a way we can set the session ids without
          //              needing to overload an internal call in storage.
          let drm = new shaka.test.FakeDrmEngine();
          drm.setDrmInfo(drmInfo);
          drm.setSessionIds(noSessions);

          overrideDrmAndManifest(
              storage,
              drm,
              makeManifestWithPerStreamBandwidth());

          try {
            await storage.store(manifestWithPerStreamBandwidthUri);
            fail();
          } catch (e) {
            expect(e.code).toBe(shaka.util.Error.Code.NO_INIT_DATA_FOR_OFFLINE);
          }
        }));

    it('throws an error if destroyed mid-store', checkAndRun(async function() {
      // Block the network so that we won't finish the store command.
      netEngine.delayNextRequest();
      let storePromise = storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, FakeManifestParser);

      // Destroy storage. This should cause the store command to reject the
      // promise.
      await storage.destroy();

      try {
        await storePromise;
        fail();
      } catch (e) {
        expect(e.code).toBe(shaka.util.Error.Code.OPERATION_ABORTED);
      }
    }));

    it('stops for networking errors', checkAndRun(async function() {
      // Force all network requests to fail.
      netEngine.request.and.callFake(() => {
        return shaka.util.AbortableOperation.failed(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.HTTP_ERROR
        ));
      });

      try {
        await storage.store(
            manifestWithPerStreamBandwidthUri,
            noMetadata,
            FakeManifestParser);
        fail();
      } catch (e) {
        expect(e.code).toBe(shaka.util.Error.Code.HTTP_ERROR);
      }
    }));

    it('throws an error if removing malformed uri',
        checkAndRun(async function() {
          const badUri = 'this-is-an-invalid-uri';
          try {
            await storage.remove(badUri);
            fail();
          } catch (e) {
            expect(e.code).toBe(shaka.util.Error.Code.MALFORMED_OFFLINE_URI);
          }
        }));

    it('throws an error if removing missing manifest',
        checkAndRun(async function() {
          // Store a piece of content, but then change the uri slightly so that
          // it won't be found when we try to remove it (with the wrong uri).
          let stored = await storage.store(
              manifestWithPerStreamBandwidthUri,
              noMetadata,
              FakeManifestParser);
          let storedUri = shaka.offline.OfflineUri.parse(stored.offlineUri);
          let missingManifestUri = shaka.offline.OfflineUri.manifest(
              storedUri.mechanism(), storedUri.cell(), storedUri.key() + 1);

          try {
            await storage.remove(missingManifestUri.toString());
            fail();
          } catch (e) {
            expect(e.code).toBe(shaka.util.Error.Code.KEY_NOT_FOUND);
          }
        }));

    it('removes manifest', checkAndRun(async function() {
      let stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, FakeManifestParser);

      await storage.remove(stored.offlineUri);
    }));

    it('removes manifest with missing segments', checkAndRun(async function() {
      let stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, FakeManifestParser);

      /** @type {shaka.offline.OfflineUri} */
      let uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      expect(uri).toBeTruthy();

      /** @type {!shaka.offline.StorageMuxer} */
      let muxer = new shaka.offline.StorageMuxer();
      await shaka.util.IDestroyable.with([muxer], async () => {
        await muxer.init();
        let cell = await muxer.getCell(uri.mechanism(), uri.cell());
        let manifests = await cell.getManifests([uri.key()]);
        let manifest = manifests[0];

        // Get the stream from the manifest. The segment count is based on how
        // we created manifest in the "make*Manifest" functions.
        let stream = manifest.periods[0].streams[0];
        expect(stream).toBeTruthy();
        expect(stream.segments.length).toBe(4);

        // Remove all the segments so that all segments will be missing.
        // There should be way more than one segment.
        let keys = stream.segments.map((segment) => segment.dataKey);
        expect(keys.length).toBeGreaterThan(0);

        const noop = () => {};
        await cell.removeSegments(keys, noop);
      });

      await storage.remove(uri.toString());
    }));

    it('tracks progress on remove', checkAndRun(async function() {
      let selectOneTrack = (tracks) => {
        let allVariants = tracks.filter((t) => {
          return t.type == 'variant';
        });
        expect(allVariants).toBeTruthy();
        expect(allVariants.length).toBeGreaterThan(0);

        let frenchVariants = allVariants.filter((t) => {
          return t.language == frenchCanadian;
        });
        expect(frenchVariants).toBeTruthy();
        expect(frenchVariants.length).toBe(1);

        return frenchVariants;
      };

      // Store a manifest with one track. We are using only one track so that it
      // will be easier to understand the progress values.
      storage.configure({trackSelectionCallback: selectOneTrack});
      let content = await storage.store(
          manifestWithPerStreamBandwidthUri,
          noMetadata,
          FakeManifestParser);

      /**
       * @type {!Array.<number>}
       */
      let progressSteps = [
        0.111, 0.222, 0.333, 0.444, 0.555, 0.666, 0.777, 0.888, 1.0
      ];

      let progressCallback = (content, progress) => {
        expect(progress).toBeCloseTo(progressSteps.shift());
      };

      storage.configure({
        progressCallback: progressCallback
      });

      await storage.remove(content.offlineUri);
      expect(progressSteps).toBeTruthy();
      expect(progressSteps.length).toBe(0);
    }));
  });

  /**
   * @param {number} id
   * @param {number} height
   * @param {string} language
   * @param {number} bandwidth
   * @return {shakaExtern.Track}
   */
  function variantTrack(id, height, language, bandwidth) {
    return {
      id: id,
      active: false,
      type: 'variant',
      bandwidth: bandwidth,
      language: language,
      label: null,
      kind: null,
      width: height * (16 / 9),
      height: height,
      frameRate: 30,
      mimeType: 'video/mp4,audio/mp4',
      codecs: 'mp4,mp4',
      audioCodec: 'mp4',
      videoCodec: 'mp4',
      primary: false,
      roles: [],
      videoId: id * 2,
      audioId: id * 2 + 1,
      channelsCount: 2,
      audioBandwidth: bandwidth * 0.33,
      videoBandwidth: bandwidth * 0.67
    };
  }

  /**
   * @param {number} id
   * @param {string} language
   * @return {shakaExtern.Track}
   */
  function textTrack(id, language) {
    return {
      id: id,
      active: false,
      type: 'text',
      bandwidth: 1000,
      language: language,
      label: null,
      kind: null,
      width: null,
      height: null,
      frameRate: null,
      mimeType: 'text/vtt',
      codecs: 'vtt',
      audioCodec: null,
      videoCodec: null,
      primary: false,
      roles: [],
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioBandwidth: null,
      videoBandwidth: null
    };
  }

  /**
   * @param {string} uri
   * @return {function():!Array.<string>}
   */
  function uris(uri) {
    return () => [uri];
  }

  /**
   * @return {shakaExtern.Manifest}
   */
  function makeManifestWithPerStreamBandwidth() {
    const SegmentReference = shaka.media.SegmentReference;

    let manifest = new shaka.test.ManifestGenerator()
        .setPresentationDuration(20)
        .addPeriod(0)
            .addVariant(0).language(englishUS).bandwidth(13 * kbps)
                .addVideo(1).size(100, 200).bandwidth(10 * kbps)
                .addAudio(2).language(englishUS).bandwidth(3 * kbps)
            .addVariant(3).language(frenchCanadian).bandwidth(13 * kbps)
                .addVideo(4).size(100, 200).bandwidth(10 * kbps)
                .addAudio(5).language(frenchCanadian).bandwidth(3 * kbps)
        .build();

    getAllStreams(manifest).forEach((stream) => {
      // Make a new copy each time as the segment index can modify
      // each reference.
      let refs = [
        new SegmentReference(0, 0, 1, uris(segment1Uri), 0, null),
        new SegmentReference(1, 1, 2, uris(segment2Uri), 0, null),
        new SegmentReference(2, 2, 3, uris(segment3Uri), 0, null),
        new SegmentReference(3, 3, 4, uris(segment4Uri), 0, null)
      ];

      overrideSegmentIndex(stream, refs);
    });

    return manifest;
  }

  /**
   * @return {shakaExtern.Manifest}
   */
  function makeManifestWithoutPerStreamBandwidth() {
    let manifest = makeManifestWithPerStreamBandwidth();

    // Remove the per stream bandwidth.
    getAllStreams(manifest).forEach((stream) => {
      stream.bandwidth = undefined;
    });

    return manifest;
  }

  /**
   * @return {shakaExtern.Manifest}
   */
  function makeManifestWithNonZeroStart() {
    const SegmentReference = shaka.media.SegmentReference;

    let manifest = makeManifestWithPerStreamBandwidth();

    getAllStreams(manifest).forEach((stream) => {
      let refs = [
        new SegmentReference(0, 10, 11, uris(segment1Uri), 0, null),
        new SegmentReference(1, 11, 12, uris(segment2Uri), 0, null),
        new SegmentReference(2, 12, 13, uris(segment3Uri), 0, null),
        new SegmentReference(3, 13, 14, uris(segment4Uri), 0, null)
      ];

      overrideSegmentIndex(stream, refs);
    });

    return manifest;
  }

  /**
   * @return {shakaExtern.Manifest}
   */
  function makeManifestWithLiveTimeline() {
    let manifest = makeManifestWithPerStreamBandwidth();
    manifest.presentationTimeline.setDuration(Infinity);
    manifest.presentationTimeline.setStatic(false);
    return manifest;
  }

  /**
   * @param {shakaExtern.Manifest} manifest
   * @return {!Array.<shakaExtern.Stream>}
   */
  function getAllStreams(manifest) {
    let streams = [];

    manifest.periods.forEach((period) => {
      period.variants.forEach((variant) => {
        if (variant.audio) { streams.push(variant.audio); }
        if (variant.video) { streams.push(variant.video); }
      });
      period.textStreams.forEach((stream) => {
        streams.push(stream);
      });
    });

    return streams;
  }

  /**
   * @param {shakaExtern.Stream} stream
   * @param {!Array.<shaka.media.SegmentReference>} segments
   */
  function overrideSegmentIndex(stream, segments) {
    let index = new shaka.media.SegmentIndex(segments);
    stream.findSegmentPosition = (time) => index.find(time);
    stream.getSegmentReference = (time) => index.get(time);
  }

  /** @return {!shaka.test.FakeNetworkingEngine} */
  function makeNetworkEngine() {
    let map = {};
    map[segment1Uri] = new ArrayBuffer(16);
    map[segment2Uri] = new ArrayBuffer(16);
    map[segment3Uri] = new ArrayBuffer(16);
    map[segment4Uri] = new ArrayBuffer(16);

    let net = new shaka.test.FakeNetworkingEngine();
    net.setResponseMap(map);
    return net;
  }

  function eraseStorage() {
    let muxer = new shaka.offline.StorageMuxer();
    return shaka.util.IDestroyable.with([muxer], async () => {
      await muxer.erase();
    });
  }

  /**
   * @param {!shaka.offline.Storage} storage
   * @param {!shaka.media.DrmEngine} drm
   * @param {shakaExtern.Manifest} manifest
   */
  function overrideDrmAndManifest(storage, drm, manifest) {
    /**
     * @type {{
     *  drmEngine: !shaka.media.DrmEngine,
     *  manifest: shakaExtern.Manifest
     *  }}
     */
    let ret = {
      drmEngine: drm,
      manifest: manifest
    };

    storage.loadInternal = () => Promise.resolve(ret);
  }

  /**
   * @return {shakaExtern.DrmInfo}
   */
  function makeDrmInfo() {
    let drmInfo = {
      keySystem: 'com.example.abc',
      licenseServerUri: 'http://example.com',
      persistentStateRequired: true,
      distinctiveIdentifierRequired: false,
      initData: null,
      keyIds: null,
      serverCertificate: null,
      audioRobustness: 'HARDY',
      videoRobustness: 'OTHER'
    };

    return drmInfo;
  }

  /** @implements {shakaExtern.ManifestParser} */
  let FakeManifestParser = class {
    constructor() {
      this.map_ = {};
      this.map_[manifestWithPerStreamBandwidthUri] =
          makeManifestWithPerStreamBandwidth();
      this.map_[manifestWithoutPerStreamBandwidthUri] =
          makeManifestWithoutPerStreamBandwidth();
      this.map_[manifestWithNonZeroStartUri] =
          makeManifestWithNonZeroStart();
      this.map_[manifestWithLiveTimelineUri] =
          makeManifestWithLiveTimeline();
    }

    /** @override */
    configure(params) {}

    /** @override */
    start(uri, player) {
      return Promise.resolve(this.map_[uri]);
    }

    /** @override */
    stop() {
      return Promise.resolve();
    }

    /** @override */
    update() {}

    /** @override */
    onExpirationUpdated(session, number) {}
  };

  /**
   * @param {!shaka.media.DrmEngine} drmEngine
   * @param {string} sessionName
   * @return {!Promise.<MediaKeySession>}
   *
   * @suppress {accessControls}
   */
  function loadOfflineSession(drmEngine, sessionName) {
    return drmEngine.loadOfflineSession_(sessionName);
  }

  /**
   * @param {!shaka.offline.OfflineUri} uri
   * @return {!Promise.<shakaExtern.Manifest>}
   */
  async function getStoredManifest(uri) {
    /** @type {!shaka.offline.StorageMuxer} */
    let muxer = new shaka.offline.StorageMuxer();
    let manifestDB = await shaka.util.IDestroyable.with([muxer], async () => {
      await muxer.init();
      let cell = await muxer.getCell(uri.mechanism(), uri.cell());
      let manifests = await cell.getManifests([uri.key()]);
      let manifest = manifests[0];

      return manifest;
    });

    goog.asserts.assert(manifestDB, 'A manifest should have been found');

    let converter = new shaka.offline.ManifestConverter(
        uri.mechanism(), uri.cell());

    return converter.fromManifestDB(manifestDB);
  }

  /**
   * @param {!shaka.Player} player
   * @param {shakaExtern.Manifest} manifest
   * @param {function(!shaka.media.DrmEngine):Promise} action
   * @return {!Promise}
   */
  function withDrm(player, manifest, action) {
    const offlineLicense = true;

    let net = player.getNetworkingEngine();
    goog.asserts.assert(net, 'Player should have a net engine right now');

    let error = null;

    let drm = new shaka.media.DrmEngine({
      netEngine: net,
      onError: (e) => { error = error || e; },
      onKeyStatus: () => {},
      onExpirationUpdated: () => {},
      onEvent: () => {}
    });

    return shaka.util.IDestroyable.with([drm], async () => {
      drm.configure(player.getConfiguration().drm);
      await drm.init(manifest, offlineLicense);

      return action(drm);
    }).then((result) => {
      if (error) {
        throw error;
      }

      return result;
    });
  }

  /**
   * Before running the test, check if storage is supported on this
   * platform.
   *
   * @param {function():!Promise} test
   * @return {function():!Promise}
   */
  function checkAndRun(test) {
    return async () => {
      let hasSupport = shaka.offline.Storage.support();
      if (hasSupport) {
        await test();
      } else {
        pending('Storage is not supported on this platform.');
      }
    };
  }

  /**
   * Before running the test, check if licensing and storage is supported on
   * this platform.
   *
   * @param {function():!Promise} test
   * @return {function():!Promise}
   */
  function drmCheckAndRun(test) {
    return async () => {
      let support = await shaka.Player.probeSupport();

      let widevineSupport = support.drm['com.widevine.alpha'];
      let storageSupport = shaka.offline.Storage.support();

      if (!widevineSupport) {
        pending('Widevine is not supported on this platform');
        return;
      }

      if (!widevineSupport.persistentState) {
        pending('Widevine persistent state is not supported on this platform');
        return;
      }

      if (!storageSupport) {
        pending('Storage is not supported on this platform.');
        return;
      }

      return test();
    };
  }
});
