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
      player = new shaka.Player();
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
    async function withStorage(action) {
      /** @type {!shaka.offline.Storage} */
      const storage = new shaka.offline.Storage(player);

      try {
        await action(storage);
      } finally {
        await storage.destroy();
      }
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
      player = new shaka.Player();
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
    quarantinedIt('removes persistent license',
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

      // Work around http://crbug.com/887535 in which load cannot happen right
      // after close.  Experimentally, we seem to need a ~1s delay, so we're
      // using a 3s delay to ensure it doesn't flake.  Without this, we get
      // error 6005 (FAILED_TO_CREATE_SESSION) with system code 70.
      // TODO: Remove when Chrome is fixed
      await shaka.test.Util.delay(3);

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

      // Work around http://crbug.com/887535 in which load cannot happen right
      // after close.  Experimentally, we seem to need a ~1s delay, so we're
      // using a 3s delay to ensure it doesn't flake.  Without this, we get
      // error 6005 (FAILED_TO_CREATE_SESSION) with system code 70.
      // TODO: Remove when Chrome is fixed
      await shaka.test.Util.delay(3);

      // PART 4 - Check that the licenses were removed.
      try {
        await withDrm(player, manifest, (drm) => {
          return Promise.all(manifest.offlineSessionIds.map(async (session) => {
            let notFoundSession = await loadOfflineSession(drm, session);
            // TODO: This is failing.  The session is actually found, possibly
            // due to http://crbug.com/690583, but this is unclear.
            expect(notFoundSession).toBeFalsy();
          }));
        });

        return Promise.reject('Expected drm to throw OFFLINE_SESSION_REMOVED');
      } catch (e) {
        expect(e).toBeTruthy();
        expect(e.code).toBe(shaka.util.Error.Code.OFFLINE_SESSION_REMOVED);
      }
    }));

    // TODO: Still failing in Chrome canary 73 on 2018-12-12.
    // Some combination of these bugs is preventing this test from working:
    //   http://crbug.com/690583
    //   http://crbug.com/887535
    //   http://crbug.com/887635
    //   http://crbug.com/883895
    quarantinedIt('defers removing licenses on error',
        drmCheckAndRun(async function() {
      const TestManifestParser = shaka.test.TestScheme.ManifestParser;
      const getEmeSessions = async () => {
        /** @type {!shaka.offline.StorageMuxer} */
        const muxer = new shaka.offline.StorageMuxer();
        await muxer.init();

        /** @type {!Array.<!Promise>} */
        const promises = [];
        muxer.forEachEmeSessionCell((cell) => promises.push(cell.getAll()));
        const cellByMechanism = await Promise.all(promises);
        await muxer.destroy();
        return cellByMechanism.reduce(shaka.util.Functional.collapseArrays, []);
      };

      const oldSessions = await getEmeSessions();
      expect(oldSessions).toEqual([]);

      // PART 1 - Download and store content that has a persistent license
      //          associated with it.
      const stored = await storage.store(
          'test:sintel-enc', noMetadata, TestManifestParser);
      expect(stored.offlineUri).toBeTruthy();

      /** @type {shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      goog.asserts.assert(uri, 'Stored offline uri should be non-null');
      const manifest = await getStoredManifest(uri);

      // PART 2 - Add an error so the release license message fails.
      storage.getNetworkingEngine().registerRequestFilter((type, request) => {
        if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
          throw new Error('Error should be ignored');
        }
      });

      // PART 3 - Remove the manifest from storage. This should ignore the
      // error with the EME session.  It should also store the session for later
      // removal.
      await storage.remove(uri.toString());

      // PART 4 - Verify the media was deleted but the session still exists.
      const storedContents = await storage.list();
      expect(storedContents).toEqual([]);

      // TODO: Chrome has a bug that prevents loading the session a second time,
      // so we can't check EME for the session.  Instead, check the database.
      // This can be changed when http://crbug.com/887635 is fixed.
      // TODO: Whether checking the database or loading the EME session, this
      // will fail because of another Chrome bug.  Calling remove() causes the
      // session to be removed without waiting for update.  So this entire
      // feature is non-functional on Chrome.  The test can probably be made to
      // pass once https://crbug.com/883895 is fixed, possibly after using a
      // delay to work around http://crbug.com/887535 .
      const sessions = await getEmeSessions();
      expect(sessions.length).toBeGreaterThan(0);

      // PART 5 - Disable the error and remove the EME session.
      storage.getNetworkingEngine().clearAllRequestFilters();
      const didRemoveAll = await storage.removeEmeSessions();
      expect(didRemoveAll).toBe(true);

      // PART 6 - Check that the licenses were removed.
      const endSessions = await getEmeSessions();
      expect(endSessions).toEqual([]);
      try {
        await withDrm(player, manifest, (drm) => {
          return Promise.all(manifest.offlineSessionIds.map(async (session) => {
            const notFoundSession = await loadOfflineSession(drm, session);
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
    const PlayerConfiguration = shaka.util.PlayerConfiguration;

    it('selects the largest SD video with middle quality audio', function() {
      const tracks = [
        variantTrack(0, 360, englishUS, 1 * kbps),
        variantTrack(1, 480, englishUS, 2.0 * kbps),
        variantTrack(2, 480, englishUS, 2.1 * kbps),
        variantTrack(3, 480, englishUS, 2.2 * kbps),
        variantTrack(4, 720, englishUS, 3 * kbps),
        variantTrack(5, 1080, englishUS, 4 * kbps),
      ];

      let selected = PlayerConfiguration.defaultTrackSelect(tracks, englishUS);
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

      let selected = PlayerConfiguration.defaultTrackSelect(tracks, englishUS);
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

        let selected = PlayerConfiguration.defaultTrackSelect(tracks, 'eng-us');
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

        let selected = PlayerConfiguration.defaultTrackSelect(tracks, 'eng');
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

        let selected = PlayerConfiguration.defaultTrackSelect(tracks, 'fr');
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

        let selected = PlayerConfiguration.defaultTrackSelect(tracks, 'fr-uk');
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

        let selected = PlayerConfiguration.defaultTrackSelect(tracks, 'de');
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
      shaka.offline.StorageMuxer.overrideSupport(new Map());

      player = new shaka.Player();
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

  // Test that progress will be reported as we expect when manifests have
  // stream-level bandwidth information and when manifests only have
  // variant-level bandwidth information.
  //
  // Since we build our promise chains to allow each stream to be downloaded
  // in parallel (implementation detail) progress can be non-deterministic
  // as we see different promise resolution orders between browsers (and
  // runs). So to control this, we force resolution order for our network
  // requests in these tests.
  //
  // To allow us to control the network order, our manifests for these tests
  // could not repeat/reuse segments uris.
  describe('reports progress on store', function() {
    const audioSegment1Uri = 'audio-segment-1';
    const audioSegment2Uri = 'audio-segment-2';
    const audioSegment3Uri = 'audio-segment-3';
    const audioSegment4Uri = 'audio-segment-4';

    const videoSegment1Uri = 'video-segment-1';
    const videoSegment2Uri = 'video-segment-2';
    const videoSegment3Uri = 'video-segment-3';
    const videoSegment4Uri = 'video-segment-4';

    /** @type {!shaka.Player} */
    let player;
    /** @type {!shaka.offline.Storage} */
    let storage;

    beforeEach(function() {
      // Use these promises to ensure that the data from networking
      // engine arrives in the correct order.
      const delays = {};
      delays[audioSegment1Uri] = new shaka.util.PublicPromise();
      delays[audioSegment2Uri] = new shaka.util.PublicPromise();
      delays[audioSegment3Uri] = new shaka.util.PublicPromise();
      delays[audioSegment4Uri] = new shaka.util.PublicPromise();
      delays[videoSegment1Uri] = new shaka.util.PublicPromise();
      delays[videoSegment2Uri] = new shaka.util.PublicPromise();
      delays[videoSegment3Uri] = new shaka.util.PublicPromise();
      delays[videoSegment4Uri] = new shaka.util.PublicPromise();

      /** @type {!shaka.test.FakeNetworkingEngine} */
      const netEngine = new shaka.test.FakeNetworkingEngine();

      // Since the promise chains will be built so that each stream can be
      // downloaded in parallel, we can force the network requests to
      // resolve in lock-step (audio seg 0, video seg 0, audio seg 1,
      // video seg 1, ...).
      const setResponseFor = (segment, dependingOn) => {
        netEngine.setResponse(segment, async () => {
          if (dependingOn) {
            await delays[dependingOn];
          }

          // Tell anyone waiting on |segment| that they are clear to execute
          // now.
          delays[segment].resolve();
          return new ArrayBuffer(16);
        });
      };
      setResponseFor(audioSegment1Uri, /* depending on */ null);
      setResponseFor(audioSegment2Uri, /* depending on */ videoSegment1Uri);
      setResponseFor(audioSegment3Uri, /* depending on */ videoSegment2Uri);
      setResponseFor(audioSegment4Uri, /* depending on */ videoSegment3Uri);
      setResponseFor(videoSegment1Uri, /* depending on */ audioSegment1Uri);
      setResponseFor(videoSegment2Uri, /* depending on */ audioSegment2Uri);
      setResponseFor(videoSegment3Uri, /* depending on */ audioSegment3Uri);
      setResponseFor(videoSegment4Uri, /* depending on */ audioSegment4Uri);

      // Use a real Player as Storage will use it to get a networking
      // engine.
      player = new shaka.Player(null, (player) => {
        player.createNetworkingEngine = () => netEngine;
      });

      storage = new shaka.offline.Storage(player);
      // Since we are using specific manifest with only one video and one audio
      // we can return all the tracks.
      storage.configure({
        offline: {
          trackSelectionCallback: (tracks) => { return tracks; },
        },
      });
    });

    afterEach(async function() {
      await storage.destroy();
      await player.destroy();
    });

    it('uses stream bandwidth', checkAndRun(async function() {
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
      const progressSteps = [
        0.057, 0.250, 0.307, 0.500, 0.557, 0.750, 0.807, 1.000,
      ];
      const manifest = makeWithStreamBandwidth();
      await runProgressTest(manifest, progressSteps);
    }));

    it('uses variant bandwidth when stream bandwidth is unavailable',
        checkAndRun(async function() {
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
          const progressSteps = [
            0.241, 0.250, 0.491, 0.500, 0.741, 0.750, 0.991, 1.000,
          ];
          const manifest = makeWithVariantBandwidth();
          await runProgressTest(manifest, progressSteps);
       }));

    /**
     * Download |manifest| and make sure that the reported progress matches
     * |expectedProgressSteps|.
     *
     * @param {shaka.extern.Manifest} manifest
     * @param {!Array.<number>} expectedProgressSteps
     */
    async function runProgressTest(manifest, expectedProgressSteps) {
      /**
       * Create a copy of the array so that we are not modifying the original
       * while we are tracking progress.
       *
       * @type {!Array.<number>}
       */
      const remainingProgress = expectedProgressSteps.slice();

      const progressCallback = (content, progress) => {
        expect(progress).toBeCloseTo(remainingProgress.shift());
      };

      storage.configure({
        offline: {
          progressCallback: progressCallback,
        },
      });

      // Store a manifest with bandwidth only for the variant (no per
      // stream bandwidth). This should result in a less accurate
      // progression of progress values as default values will be used.
      await storage.store(
          'uri-wont-matter',
          noMetadata, () => new shaka.test.FakeManifestParser(manifest));

      // We should have hit all the progress steps.
      expect(remainingProgress.length).toBe(0);
    }

    /**
     * Build a custom manifest for testing progress. Each segment will be
     * unique so that there will only be one request per segment uri (we
     * often reuse segments in our tests).
     *
     * This manifest will have the variant-level bandwidth value and per-stream
     * bandwidth values.
     *
     * @return {shaka.extern.Manifest}
     */
    function makeWithStreamBandwidth() {
      const SegmentReference = shaka.media.SegmentReference;

      const manifest = new shaka.test.ManifestGenerator()
          .setPresentationDuration(20)
          .addPeriod(0)
              .addVariant(0).language(englishUS).bandwidth(13 * kbps)
                  .addVideo(1).size(100, 200).bandwidth(10 * kbps)
                  .addAudio(2).language(englishUS).bandwidth(3 * kbps)
          .build();

      const audio = manifest.periods[0].variants[0].audio;
      goog.asserts.assert(audio, 'Created manifest with audio, where is it?');
      overrideSegmentIndex(audio, [
        new SegmentReference(0, 0, 1, uris(audioSegment1Uri), 0, null),
        new SegmentReference(1, 1, 2, uris(audioSegment2Uri), 0, null),
        new SegmentReference(2, 2, 3, uris(audioSegment3Uri), 0, null),
        new SegmentReference(3, 3, 4, uris(audioSegment4Uri), 0, null),
      ]);

      const video = manifest.periods[0].variants[0].video;
      goog.asserts.assert(video, 'Created manifest with video, where is it?');
      overrideSegmentIndex(video, [
        new SegmentReference(0, 0, 1, uris(videoSegment1Uri), 0, null),
        new SegmentReference(1, 1, 2, uris(videoSegment2Uri), 0, null),
        new SegmentReference(2, 2, 3, uris(videoSegment3Uri), 0, null),
        new SegmentReference(3, 3, 4, uris(videoSegment4Uri), 0, null),
      ]);

      return manifest;
    }

    /**
     * Build a custom manifest for testing progress. Each segment will be
     * unique so that there will only be one request per segment uri (we
     * often reuse segments in our tests).
     *
     * This manifest will only have the variant-level bandwidth value.
     *
     * @return {shaka.extern.Manifest}
     */
    function makeWithVariantBandwidth() {
      // Start with the manifest that had per-stream bandwidths. Then remove
      // the per-stream values.
      const manifest = makeWithStreamBandwidth();
      goog.asserts.assert(
          manifest.periods.length == 1,
          'Expecting manifest to only have one period');
      goog.asserts.assert(
          manifest.periods[0].variants.length == 1,
          'Expecting manifest to only have one variant');

      const variant = manifest.periods[0].variants[0];
      goog.asserts.assert(
          variant.audio,
          'Expecting manifest to have audio stream');
      goog.asserts.assert(
          variant.video,
          'Expecting manigest to have video stream');

      // Remove the per stream bandwidth information.
      variant.audio.bandwidth = undefined;
      variant.video.bandwidth = undefined;

      return manifest;
    }
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
      player = new shaka.Player(null, function(player) {
        player.createNetworkingEngine = () => netEngine;
      });

      storage = new shaka.offline.Storage(player);
    });

    afterEach(async function() {
      await storage.destroy();
      await player.destroy();
    });

    it('stores and lists content', checkAndRun(async function() {
      // Just use any three manifests as we don't care about the manifests
      // right now.
      const manifestUris = [
        manifestWithPerStreamBandwidthUri,
        manifestWithoutPerStreamBandwidthUri,
        manifestWithNonZeroStartUri,
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
        offline: {
          trackSelectionCallback: selectTrack,
        },
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
      const muxer = new shaka.offline.StorageMuxer();

      try {
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
      } finally {
        await muxer.destroy();
      }
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
      const muxer = new shaka.offline.StorageMuxer();

      try {
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
      } finally {
        await muxer.destroy();
      }
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
          storage.configure({
            usePersistentLicense: false,
          });

          let stored = await storage.store(manifestWithPerStreamBandwidthUri);

          /** @type {shaka.offline.OfflineUri} */
          let uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
          expect(uri).toBeTruthy();

          /** @type {!shaka.offline.StorageMuxer} */
          const muxer = new shaka.offline.StorageMuxer();

          try {
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
          } finally {
            await muxer.destroy();
          }
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
      const manifest = makeManifestWithPerStreamBandwidth();

      /**
       * Block storage when it goes to parse the manifest. Since we don't want
       * to change the flow, return a valid manifest once it resolves.
       * @type {shaka.util.PublicPromise}
       */
      const stallStorage = new shaka.util.PublicPromise();
      storage.parseManifest = async () => {
        await stallStorage;
        return manifest;
      };

      // The uri won't matter as we have override |parseManifest|.
      const waitOnStore = storage.store('uri-does-not-matter');

      // Request for storage to be destroyed. Before waiting for it to resolve,
      // resolve the promise that we are using to stall the store operation.
      const waitOnDestroy = storage.destroy();
      stallStorage.resolve();
      await waitOnDestroy;

      // The store request should not resolve, but instead be rejected.
      try {
        await waitOnStore;
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
      const muxer = new shaka.offline.StorageMuxer();

      try {
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
      } finally {
        await muxer.destroy();
      }

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
      storage.configure({
        offline: {
          trackSelectionCallback: selectOneTrack,
        },
      });
      let content = await storage.store(
          manifestWithPerStreamBandwidthUri,
          noMetadata,
          FakeManifestParser);

      /**
       * @type {!Array.<number>}
       */
      let progressSteps = [
        0.111, 0.222, 0.333, 0.444, 0.555, 0.666, 0.777, 0.888, 1.0,
      ];

      let progressCallback = (content, progress) => {
        expect(progress).toBeCloseTo(progressSteps.shift());
      };

      storage.configure({
        offline: {
          progressCallback: progressCallback,
        },
      });

      await storage.remove(content.offlineUri);
      expect(progressSteps).toBeTruthy();
      expect(progressSteps.length).toBe(0);
    }));
  });

  describe('storage without player', function() {
    const TestManifestParser = shaka.test.TestScheme.ManifestParser;
    const manifestUri = 'test:sintel';

    it('stores content', checkAndRun(async function() {
      /** @type {shaka.offline.Storage} */
      const storage = new shaka.offline.Storage();
      try {
        await storage.store(manifestUri, noMetadata, TestManifestParser);
      } finally {
        await storage.destroy();
      }
    }));
  });

  /**
   * @param {number} id
   * @param {number} height
   * @param {string} language
   * @param {number} bandwidth
   * @return {shaka.extern.Track}
   */
  function variantTrack(id, height, language, bandwidth) {
    const videoId = id * 2;
    const audioId = id * 2 + 1;
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
      audioRoles: [],
      videoId: videoId,
      audioId: audioId,
      channelsCount: 2,
      audioBandwidth: bandwidth * 0.33,
      videoBandwidth: bandwidth * 0.67,
      originalVideoId: videoId.toString(),
      originalAudioId: audioId.toString(),
      originalTextId: null,
    };
  }

  /**
   * @param {number} id
   * @param {string} language
   * @return {shaka.extern.Track}
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
      audioRoles: null,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: null,
      originalAudioId: null,
      originalTextId: id.toString(),
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
   * @return {shaka.extern.Manifest}
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
        new SegmentReference(3, 3, 4, uris(segment4Uri), 0, null),
      ];

      overrideSegmentIndex(stream, refs);
    });

    return manifest;
  }

  /**
   * @return {shaka.extern.Manifest}
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
   * @return {shaka.extern.Manifest}
   */
  function makeManifestWithNonZeroStart() {
    const SegmentReference = shaka.media.SegmentReference;

    let manifest = makeManifestWithPerStreamBandwidth();

    getAllStreams(manifest).forEach((stream) => {
      let refs = [
        new SegmentReference(0, 10, 11, uris(segment1Uri), 0, null),
        new SegmentReference(1, 11, 12, uris(segment2Uri), 0, null),
        new SegmentReference(2, 12, 13, uris(segment3Uri), 0, null),
        new SegmentReference(3, 13, 14, uris(segment4Uri), 0, null),
      ];

      overrideSegmentIndex(stream, refs);
    });

    return manifest;
  }

  /**
   * @return {shaka.extern.Manifest}
   */
  function makeManifestWithLiveTimeline() {
    let manifest = makeManifestWithPerStreamBandwidth();
    manifest.presentationTimeline.setDuration(Infinity);
    manifest.presentationTimeline.setStatic(false);
    return manifest;
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @return {!Array.<shaka.extern.Stream>}
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
   * @param {shaka.extern.Stream} stream
   * @param {!Array.<shaka.media.SegmentReference>} segments
   */
  function overrideSegmentIndex(stream, segments) {
    let index = new shaka.media.SegmentIndex(segments);
    stream.findSegmentPosition = (time) => index.find(time);
    stream.getSegmentReference = (time) => index.get(time);
  }

  /** @return {!shaka.test.FakeNetworkingEngine} */
  function makeNetworkEngine() {
    return new shaka.test.FakeNetworkingEngine()
        .setResponseValue(segment1Uri, new ArrayBuffer(16))
        .setResponseValue(segment2Uri, new ArrayBuffer(16))
        .setResponseValue(segment3Uri, new ArrayBuffer(16))
        .setResponseValue(segment4Uri, new ArrayBuffer(16));
  }

  async function eraseStorage() {
    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.erase();
    } finally {
      await muxer.destroy();
    }
  }

  /**
   * @param {!shaka.offline.Storage} storage
   * @param {!shaka.media.DrmEngine} drm
   * @param {shaka.extern.Manifest} manifest
   */
  function overrideDrmAndManifest(storage, drm, manifest) {
    storage.parseManifest = () => Promise.resolve(manifest);
    storage.createDrmEngine = () => Promise.resolve(drm);
  }

  /**
   * @return {shaka.extern.DrmInfo}
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
      videoRobustness: 'OTHER',
    };

    return drmInfo;
  }

  // TODO(vaage): Replace this with |shaka.test.FakeManifestParser|
  /** @implements {shaka.extern.ManifestParser} */
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
   * @return {!Promise.<shaka.extern.Manifest>}
   */
  async function getStoredManifest(uri) {
    /** @type {!shaka.offline.ManifestConverter} */
    const converter = new shaka.offline.ManifestConverter(
        uri.mechanism(), uri.cell());

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const cell = await muxer.getCell(uri.mechanism(), uri.cell());
      const manifests = await cell.getManifests([uri.key()]);
      const manifest = manifests[0];

      goog.asserts.assert(manifest, 'A manifest should have been found');
      return converter.fromManifestDB(manifest);
    } finally {
      await muxer.destroy();
    }
  }

  /**
   * @param {!shaka.Player} player
   * @param {shaka.extern.Manifest} manifest
   * @param {function(!shaka.media.DrmEngine):Promise} action
   * @return {!Promise}
   */
  async function withDrm(player, manifest, action) {
    const net = player.getNetworkingEngine();
    goog.asserts.assert(net, 'Player should have a net engine right now');

    let error = null;

    /** @type {!shaka.media.DrmEngine} */
    const drm = new shaka.media.DrmEngine({
      netEngine: net,
      onError: (e) => { error = error || e; },
      onKeyStatus: () => {},
      onExpirationUpdated: () => {},
      onEvent: () => {},
    });

    try {
      drm.configure(player.getConfiguration().drm);
      const variants = shaka.util.Periods.getAllVariantsFrom(manifest.periods);
      await drm.initForStorage(variants, /* usePersistentLicenses */ true);
      await action(drm);
    } finally {
      await drm.destroy();
    }

    if (error) {
      throw error;
    }
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
