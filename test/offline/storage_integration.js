/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @return {boolean} */
function storageSupport() {
  return shaka.offline.Storage.support();
}

/** @return {!Promise.<boolean>} */
async function drmStorageSupport() {
  if (!shaka.offline.Storage.support()) {
    return false;
  }

  const support = await shaka.Player.probeSupport();
  const widevineSupport = support.drm['com.widevine.alpha'];
  return !!(widevineSupport && widevineSupport.persistentState);
}

filterDescribe('Storage', storageSupport, () => {
  const Util = shaka.test.Util;

  const englishUS = 'en-us';
  const frenchCanadian = 'fr-ca';
  const fakeMimeType = 'application/test';

  const manifestWithPerStreamBandwidthUri =
      'fake:manifest-with-per-stream-bandwidth';
  const manifestWithoutPerStreamBandwidthUri =
      'fake:manifest-without-per-stream-bandwidth';
  const manifestWithNonZeroStartUri = 'fake:manifest-with-non-zero-start';
  const manifestWithLiveTimelineUri = 'fake:manifest-with-live-timeline';
  const manifestWithAlternateSegmentsUri = 'fake:manifest-with-alt-segments';
  const manifestWithVideoInitSegmentsUri =
      'fake:manifest-with-video-init-segments';

  const initSegmentUri = 'fake:init-segment';
  const segment1Uri = 'fake:segment-1';
  const segment2Uri = 'fake:segment-2';
  const segment3Uri = 'fake:segment-3';
  const segment4Uri = 'fake:segment-4';

  const alternateInitSegmentUri = 'fake:alt-init-segment';
  const alternateSegment1Uri = 'fake:alt-segment-1';
  const alternateSegment2Uri = 'fake:alt-segment-2';
  const alternateSegment3Uri = 'fake:alt-segment-3';
  const alternateSegment4Uri = 'fake:alt-segment-4';

  const noMetadata = {};

  const kbps = (k) => k * 1000;

  beforeEach(async () => {
    // Make sure we start with a clean slate between each run.
    await eraseStorage();

    shaka.media.ManifestParser.registerParserByMime(
        fakeMimeType, () => new FakeManifestParser());
  });

  afterEach(async () => {
    shaka.media.ManifestParser.unregisterParserByMime(fakeMimeType);
    // Make sure we don't leave anything behind.
    await eraseStorage();
  });

  describe('storage delete all', () => {
    /** @type {!shaka.Player} */
    let player;

    beforeEach(() => {
      // Use a real Player since Storage only uses the configuration and
      // networking engine.  This allows us to use Player.configure in these
      // tests.
      player = new shaka.Player();
    });

    afterEach(async () => {
      await player.destroy();
    });

    it('removes all content from storage', async () => {
      const testSchemeMimeType = 'application/x-test-manifest';
      const manifestUri = 'test:sintel';

      // Store a piece of content.
      await withStorage((storage) => {
        return storage.store(
            manifestUri, noMetadata, testSchemeMimeType).promise;
      });

      // Make sure that the content can be found.
      await withStorage(async (storage) => {
        const content = await storage.list();
        expect(content).toBeTruthy();
        expect(content.length).toBe(1);
      });

      // Ask storage to erase everything.
      await shaka.offline.Storage.deleteAll();

      // Make sure that all content that was previously found is no gone.
      await withStorage(async (storage) => {
        const content = await storage.list();
        expect(content).toBeTruthy();
        expect(content.length).toBe(0);
      });
    });

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

  filterDescribe('persistent license', drmStorageSupport, () => {
    /** @type {!shaka.Player} */
    let player;
    /** @type {!shaka.offline.Storage} */
    let storage;

    beforeEach(() => {
      // Use a real Player since Storage only uses the configuration and
      // networking engine.  This allows us to use Player.configure in these
      // tests.
      player = new shaka.Player();
      storage = new shaka.offline.Storage(player);
    });

    afterEach(async () => {
      await storage.destroy();
      await player.destroy();
    });

    // TODO: Make a test to ensure that setting delayLicenseRequestUntilPlayed
    // to true doesn't break storage, once we have working tests for storing DRM
    // content.
    // See issue #2218.

    // Quarantined due to http://crbug.com/1019298 where a load cannot happen
    // immediately after a remove.  This can sometimes be fixed with a delay,
    // but it is extremely flaky, so these are disabled until the bug is fixed.
    quarantinedIt('removes persistent license', async () => {
      const testSchemeMimeType = 'application/x-test-manifest';

      // PART 1 - Download and store content that has a persistent license
      //          associated with it.
      const stored = await storage.store(
          'test:sintel-enc', noMetadata, testSchemeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');

      /** @type {shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      goog.asserts.assert(uri, 'Stored offline uri should be non-null');

      const manifest = await getStoredManifest(uri);
      expect(manifest.offlineSessionIds).toBeTruthy();
      expect(manifest.offlineSessionIds.length).toBeTruthy();

      // PART 2 - Check that the licences are stored.
      await withDrm(player, manifest, (drm) => {
        return Promise.all(manifest.offlineSessionIds.map(async (session) => {
          const foundSession = await loadOfflineSession(drm, session);
          expect(foundSession).toBeTruthy();
        }));
      });

      // PART 3 - Remove the manifest from storage. This should remove all
      // the sessions.
      await storage.remove(uri.toString());

      // PART 4 - Check that the licenses were removed.
      const p = withDrm(player, manifest, (drm) => {
        return Promise.all(manifest.offlineSessionIds.map(async (session) => {
          const notFoundSession = await loadOfflineSession(drm, session);
          expect(notFoundSession).toBeFalsy();
        }));
      });
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED));
      await expectAsync(p).toBeRejectedWith(expected);
    });

    quarantinedIt('defers removing licenses on error', async () => {
      const testSchemeMimeType = 'application/x-test-manifest';

      // PART 1 - Download and store content that has a persistent license
      //          associated with it.
      const stored = await storage.store(
          'test:sintel-enc', noMetadata, testSchemeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');

      /** @type {shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      goog.asserts.assert(uri, 'Stored offline uri should be non-null');
      const manifest = await getStoredManifest(uri);

      // PART 2 - Add an error so the release license message fails.
      storage.getNetworkingEngine().registerRequestFilter(
          (type, request) => {
            if (type == shaka.net.NetworkingEngine.RequestType.LICENSE) {
              throw new Error('Error should be ignored');
            }
          });

      // PART 3 - Remove the manifest from storage. This should ignore the
      // error with the EME session.  It should also store the session for
      // later removal.
      await storage.remove(uri.toString());

      // PART 4 - Verify the media was deleted but the session still exists.
      const storedContents = await storage.list();
      expect(storedContents).toEqual([]);

      await withDrm(player, manifest, (drm) => {
        return Promise.all(manifest.offlineSessionIds.map(async (session) => {
          const foundSession = await loadOfflineSession(drm, session);
          expect(foundSession).toBeTruthy();
        }));
      });

      // PART 5 - Disable the error and remove the EME session.
      storage.getNetworkingEngine().clearAllRequestFilters();
      const didRemoveAll = await storage.removeEmeSessions();
      expect(didRemoveAll).toBe(true);

      // PART 6 - Check that the licenses were removed.
      const p = withDrm(player, manifest, (drm) => {
        return Promise.all(manifest.offlineSessionIds.map(async (session) => {
          const notFoundSession = await loadOfflineSession(drm, session);
          expect(notFoundSession).toBeFalsy();
        }));
      });
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED));
      await expectAsync(p).toBeRejectedWith(expected);
    });
  });

  describe('default track selection callback', () => {
    const PlayerConfiguration = shaka.util.PlayerConfiguration;

    it('selects the largest SD video with middle quality audio', () => {
      const tracks = [
        variantTrack(0, 360, englishUS, kbps(1.0)),
        variantTrack(1, 480, englishUS, kbps(2.0)),
        variantTrack(2, 480, englishUS, kbps(2.1)),
        variantTrack(3, 480, englishUS, kbps(2.2)),
        variantTrack(4, 720, englishUS, kbps(3.0)),
        variantTrack(5, 1080, englishUS, kbps(4.0)),
      ];

      const selected =
          PlayerConfiguration.defaultTrackSelect(tracks, englishUS, 'SDR');
      expect(selected).toBeTruthy();
      expect(selected.length).toBe(1);
      expect(selected[0]).toBeTruthy();
      expect(selected[0].language).toBe(englishUS);
      expect(selected[0].height).toBe(480);
      expect(selected[0].bandwidth).toBe(kbps(2.1));
    });

    it('selects all text tracks', () => {
      const tracks = [
        textTrack(0, englishUS),
        textTrack(1, frenchCanadian),
      ];

      const selected =
          PlayerConfiguration.defaultTrackSelect(tracks, englishUS, 'SDR');
      expect(selected).toBeTruthy();
      expect(selected.length).toBe(2);
      for (const track of tracks) {
        expect(selected).toContain(track);
      }
    });

    describe('language matching', () => {
      it('finds exact match', () => {
        const tracks = [
          variantTrack(0, 480, 'eng-us', kbps(1)),
          variantTrack(1, 480, 'fr-ca', kbps(1)),
          variantTrack(2, 480, 'eng-ca', kbps(1)),
        ];

        const selected =
            PlayerConfiguration.defaultTrackSelect(tracks, 'eng-us', 'SDR');
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('eng-us');
      });

      it('finds exact match with only base', () => {
        const tracks = [
          variantTrack(0, 480, 'eng-us', kbps(1)),
          variantTrack(1, 480, 'fr-ca', kbps(1)),
          variantTrack(2, 480, 'eng-ca', kbps(1)),
          variantTrack(3, 480, 'eng', kbps(1)),
        ];

        const selected =
            PlayerConfiguration.defaultTrackSelect(tracks, 'eng', 'SDR');
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('eng');
      });

      it('finds base match when exact match is not found', () => {
        const tracks = [
          variantTrack(0, 480, 'eng-us', kbps(1)),
          variantTrack(1, 480, 'fr-ca', kbps(1)),
          variantTrack(2, 480, 'eng-ca', kbps(1)),
        ];

        const selected =
            PlayerConfiguration.defaultTrackSelect(tracks, 'fr', 'SDR');
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('fr-ca');
      });

      it('finds common base when exact match is not found', () => {
        const tracks = [
          variantTrack(0, 480, 'eng-us', kbps(1)),
          variantTrack(1, 480, 'fr-ca', kbps(1)),
          variantTrack(2, 480, 'eng-ca', kbps(1)),
        ];

        const selected =
            PlayerConfiguration.defaultTrackSelect(tracks, 'fr-uk', 'SDR');
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('fr-ca');
      });

      it('finds primary track when no match is found', () => {
        const tracks = [
          variantTrack(0, 480, 'eng-us', kbps(1)),
          variantTrack(1, 480, 'fr-ca', kbps(1)),
          variantTrack(2, 480, 'eng-ca', kbps(1)),
        ];

        tracks[0].primary = true;

        const selected =
            PlayerConfiguration.defaultTrackSelect(tracks, 'de', 'SDR');
        expect(selected).toBeTruthy();
        expect(selected.length).toBe(1);
        expect(selected[0]).toBeTruthy();
        expect(selected[0].language).toBe('eng-us');
      });
    });  // describe('language matching')
  });  // describe('default track selection callback')


  describe('no support', () => {
    const expectedError = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.STORAGE_NOT_SUPPORTED));

    /** @type {!shaka.Player} */
    let player;
    /** @type {!shaka.offline.Storage} */
    let storage;

    // CAUTION: Do not put overrideSupport() or clearSupport() in
    // beforEach/afterEach.  They change what is supported at a static level.
    // When the test is run, a shim will call the support check and the test
    // will be skipped if overrideSupport() has been called already.  A shim of
    // afterEach will call the same check and skip afterEach's body, too, and
    // the clean up will never happen.  So the calls to overrideSupport() and
    // clearSupport() must be in each test using try/finally.

    beforeEach(() => {
      player = new shaka.Player();
      storage = new shaka.offline.Storage(player);
      // NOTE: See above "CAUTION" comment about overrideSupport/clearSupport.
    });

    afterEach(async () => {
      await storage.destroy();
      await player.destroy();
      // NOTE: See above "CAUTION" comment about overrideSupport/clearSupport.
    });

    it('throws error using list', async () => {
      try {
        shaka.offline.StorageMuxer.overrideSupport(new Map());

        await expectAsync(storage.list()).toBeRejectedWith(expectedError);
      } finally {
        shaka.offline.StorageMuxer.clearOverride();
      }
    });

    it('throws error using store', async () => {
      try {
        shaka.offline.StorageMuxer.overrideSupport(new Map());

        const store = storage.store('any-uri', noMetadata, fakeMimeType);
        await expectAsync(store.promise).toBeRejectedWith(expectedError);
      } finally {
        shaka.offline.StorageMuxer.clearOverride();
      }
    });

    it('throws error using remove', async () => {
      try {
        shaka.offline.StorageMuxer.overrideSupport(new Map());

        const remove = storage.remove('any-uri');
        await expectAsync(remove).toBeRejectedWith(expectedError);
      } finally {
        shaka.offline.StorageMuxer.clearOverride();
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
  describe('reports progress on store', () => {
    const audioSegment1Uri = 'fake:audio-segment-1';
    const audioSegment2Uri = 'fake:audio-segment-2';
    const audioSegment3Uri = 'fake:audio-segment-3';
    const audioSegment4Uri = 'fake:audio-segment-4';

    const videoSegment1Uri = 'fake:video-segment-1';
    const videoSegment2Uri = 'fake:video-segment-2';
    const videoSegment3Uri = 'fake:video-segment-3';
    const videoSegment4Uri = 'fake:video-segment-4';

    /** @type {!shaka.offline.Storage} */
    let storage;

    /** @type {!Object.<string, function():!Promise.<ArrayBuffer>>} */
    let fakeResponses = {};

    let compiledShaka;

    beforeAll(async () => {
      compiledShaka =
          await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));

      compiledShaka.net.NetworkingEngine.registerScheme(
          'fake', (uri, req, type, progress) => {
            if (fakeResponses[uri]) {
              const operation = async () => {
                const data = await fakeResponses[uri]();
                return {
                  uri,
                  data,
                  headers: {},
                };
              };
              return shaka.util.AbortableOperation.notAbortable(operation());
            } else {
              return shaka.util.AbortableOperation.failed(
                  new shaka.util.Error(
                      shaka.util.Error.Severity.RECOVERABLE,
                      shaka.util.Error.Category.NETWORK,
                      shaka.util.Error.Code.HTTP_ERROR));
            }
          });
    });

    beforeEach(async () => {
      await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');

      storage = new compiledShaka.offline.Storage();

      // Since we are using specific manifest with only one video and one audio
      // we can return all the tracks.
      storage.configure({
        offline: {
          trackSelectionCallback: (tracks) => { return tracks; },
        },
      });

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

      /**
       * Since the promise chains will be built so that each stream can be
       * downloaded in parallel, we can force the network requests to
       * resolve in lock-step (audio seg 0, video seg 0, audio seg 1,
       * video seg 1, ...).
       *
       * @param {string} segment A URI
       * @param {?string} dependingOn Another URI, or null
       */
      function setResponseFor(segment, dependingOn) {
        fakeResponses[segment] = async () => {
          if (dependingOn) {
            await delays[dependingOn];
          }

          // Tell anyone waiting on |segment| that they are clear to execute
          // now.
          delays[segment].resolve();
          return new ArrayBuffer(16);
        };
      }
      fakeResponses = {};
      setResponseFor(audioSegment1Uri, null);
      setResponseFor(audioSegment2Uri, videoSegment1Uri);
      setResponseFor(audioSegment3Uri, videoSegment2Uri);
      setResponseFor(audioSegment4Uri, videoSegment3Uri);
      setResponseFor(videoSegment1Uri, audioSegment1Uri);
      setResponseFor(videoSegment2Uri, audioSegment2Uri);
      setResponseFor(videoSegment3Uri, audioSegment3Uri);
      setResponseFor(videoSegment4Uri, audioSegment4Uri);
    });

    afterEach(async () => {
      await storage.destroy();
    });

    afterAll(() => {
      compiledShaka.net.NetworkingEngine.unregisterScheme('fake');
    });

    it('uses stream bandwidth', async () => {
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
    });

    it('uses variant bandwidth when stream bandwidth is unavailable',
        async () => {
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
        });

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
      compiledShaka.media.ManifestParser.registerParserByMime(
          fakeMimeType, () => new shaka.test.FakeManifestParser(manifest));

      // Store a manifest with bandwidth only for the variant (no per
      // stream bandwidth). This should result in a less accurate
      // progression of progress values as default values will be used.
      await storage.store('uri-wont-matter', noMetadata, fakeMimeType).promise;

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
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.presentationTimeline.setDuration(20);
        manifest.addVariant(0, (variant) => {
          variant.language = englishUS;
          variant.bandwidth = kbps(13);
          variant.addVideo(1, (stream) => {
            stream.bandwidth = kbps(10);
            stream.size(100, 200);
          });
          variant.addAudio(2, (stream) => {
            stream.language = englishUS;
            stream.bandwidth = kbps(3);
          });
        });
      }, compiledShaka);

      const audio = manifest.variants[0].audio;
      goog.asserts.assert(audio, 'Created manifest with audio, where is it?');
      overrideSegmentIndex(audio, [
        makeReference(audioSegment1Uri, 0, 1, compiledShaka),
        makeReference(audioSegment2Uri, 1, 2, compiledShaka),
        makeReference(audioSegment3Uri, 2, 3, compiledShaka),
        makeReference(audioSegment4Uri, 3, 4, compiledShaka),
      ]);

      const video = manifest.variants[0].video;
      goog.asserts.assert(video, 'Created manifest with video, where is it?');
      overrideSegmentIndex(video, [
        makeReference(videoSegment1Uri, 0, 1, compiledShaka),
        makeReference(videoSegment2Uri, 1, 2, compiledShaka),
        makeReference(videoSegment3Uri, 2, 3, compiledShaka),
        makeReference(videoSegment4Uri, 3, 4, compiledShaka),
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
          manifest.variants.length == 1,
          'Expecting manifest to only have one variant');

      const variant = manifest.variants[0];
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

  describe('basic function', () => {
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
    /** @type {!shaka.util.EventManager} */
    let eventManager;
    /** @type {!HTMLVideoElement} */
    const videoElement = /** @type {!HTMLVideoElement} */(
      document.createElement('video'));

    beforeEach(async () => {
      netEngine = makeNetworkEngine();

      // Use a real Player since Storage only uses the configuration and
      // networking engine.  This allows us to use Player.configure in these
      // tests.
      player = new shaka.Player(null, ((player) => {
        player.createNetworkingEngine = () => netEngine;
      }));
      await player.attach(videoElement);

      storage = new shaka.offline.Storage(player);

      eventManager = new shaka.util.EventManager();
    });

    afterEach(async () => {
      eventManager.release();
      await storage.destroy();
      await player.destroy();
    });

    it('stores and lists content', async () => {
      /** @type {!Array.<string>} */
      const manifestUris = [
        manifestWithPerStreamBandwidthUri,
        manifestWithoutPerStreamBandwidthUri,
        manifestWithNonZeroStartUri,
      ];

      // NOTE: We're working around an apparent compiler bug here, with Closure
      // version v20180402.  "Violation: Using properties of unknown types is
      // not allowed; add an explicit type to the variable.  The property "next"
      // on type "Iterator<?>".
      for (let i = 0; i < manifestUris.length; ++i) {
        const uri = manifestUris[i];
        // eslint-disable-next-line no-await-in-loop
        await storage.store(uri, noMetadata, fakeMimeType).promise;
      }

      const content = await storage.list();
      const originalUris = content.map((c) => c.originalManifestUri);
      expect(originalUris.length).toBe(manifestUris.length);

      // NOTE: We're working around an apparent compiler bug here.  See comment
      // above.
      for (let i = 0; i < manifestUris.length; ++i) {
        const uri = manifestUris[i];
        expect(originalUris).toContain(uri);
      }
    });

    it('snapshots config when store is called', async () => {
      /** @type {!jasmine.Spy} */
      const selectTracksOne =
          jasmine.createSpy('selectTracksOne').and.callFake((tracks) => tracks);
      /** @type {!jasmine.Spy} */
      const selectTracksTwo =
          jasmine.createSpy('selectTracksTwo').and.callFake((tracks) => tracks);
      /** @type {!jasmine.Spy} */
      const selectTracksBad =
          jasmine.createSpy('selectTracksBad').and.callFake((tracks) => []);

      storage.configure('offline.trackSelectionCallback', selectTracksOne);
      const storeOne = storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType);
      storage.configure('offline.trackSelectionCallback', selectTracksTwo);
      const storeTwo = storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType);
      storage.configure('offline.trackSelectionCallback', selectTracksBad);
      await Promise.all([storeOne.promise, storeTwo.promise]);

      expect(selectTracksOne).toHaveBeenCalled();
      expect(selectTracksTwo).toHaveBeenCalled();
      expect(selectTracksBad).not.toHaveBeenCalled();
    });

    it('only stores chosen tracks', async () => {
      // Change storage to only store one track so that it will be easy
      // for us to ensure that only the one track was stored.
      const selectTracks = (tracks) => {
        const selected = tracks.filter((t) => t.language == frenchCanadian);
        expect(selected.length).toBe(1);
        return selected;
      };
      storage.configure({
        offline: {
          trackSelectionCallback: selectTracks,
        },
      });

      const stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');
      expect(stored.tracks.length).toBe(1);
      expect(stored.tracks[0].language).toBe(frenchCanadian);

      // Pull the manifest out of storage so that we can ensure that it only
      // has one variant.
      /** @type {shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.parse(stored.offlineUri);

      /** @type {!shaka.offline.StorageMuxer} */
      const muxer = new shaka.offline.StorageMuxer();

      try {
        await muxer.init();
        const cell = await muxer.getCell(uri.mechanism(), uri.cell());
        const manifests = await cell.getManifests([uri.key()]);
        expect(manifests.length).toBe(1);

        const manifest = manifests[0];
        // There should be 2 streams, an audio and a video stream.
        expect(manifest.streams.length).toBe(2);

        const audio = manifest.streams.filter(
            (s) => s.type == 'audio')[0];
        expect(audio.language).toBe(frenchCanadian);
      } finally {
        await muxer.destroy();
      }
    });

    it('can choose tracks asynchronously', async () => {
      storage.configure({
        offline: {
          trackSelectionCallback: async (tracks) => {
            await Util.delay(0.1);
            const selected = tracks.filter((t) => t.language == frenchCanadian);
            expect(selected.length).toBe(1);
            return selected;
          },
        },
      });

      const stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType).promise;
      expect(stored.tracks.length).toBe(1);
      expect(stored.tracks[0].language).toBe(frenchCanadian);
    });

    it('stores drm info without license', async () => {
      const drmInfo = makeDrmInfo();
      const session1 = 'session-1';
      const session2 = 'session-2';
      const expiration = 1000;

      // TODO(vaage): Is there a way we can set the session ids without needing
      //               to overload an internal call in storage.
      const drm = new shaka.test.FakeDrmEngine();
      drm.setDrmInfo(drmInfo);
      drm.setSessionIds([session1, session2]);
      drm.getExpiration.and.returnValue(expiration);

      overrideDrmAndManifest(
          storage,
          drm,
          makeManifestWithPerStreamBandwidth());

      const stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');

      /** @type {shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      expect(uri).toBeTruthy();

      /** @type {!shaka.offline.StorageMuxer} */
      const muxer = new shaka.offline.StorageMuxer();

      try {
        await muxer.init();
        const cell = await muxer.getCell(uri.mechanism(), uri.cell());
        const manifests = await cell.getManifests([uri.key()]);
        const manifest = manifests[0];
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
    });

    it('can extract DRM info from segments', async () => {
      const pssh1 =
          '00000028' +                          // atom size
          '70737368' +                          // atom type='pssh'
          '00000000' +                          // v0, flags=0
          'edef8ba979d64acea3c827dcd51d21ed' +  // system id (Widevine)
          '00000008' +                          // data size
          '0102030405060708';                   // data
      const psshData1 = shaka.util.Uint8ArrayUtils.fromHex(pssh1);
      const pssh2 =
          '00000028' +                          // atom size
          '70737368' +                          // atom type='pssh'
          '00000000' +                          // v0, flags=0
          'edef8ba979d64acea3c827dcd51d21ed' +  // system id (Widevine)
          '00000008' +                          // data size
          '1337420123456789';                   // data
      const psshData2 = shaka.util.Uint8ArrayUtils.fromHex(pssh2);
      netEngine.setResponseValue(initSegmentUri,
          shaka.util.BufferUtils.toArrayBuffer(psshData1));
      netEngine.setResponseValue(alternateInitSegmentUri,
          shaka.util.BufferUtils.toArrayBuffer(psshData2));

      const drm = new shaka.test.FakeDrmEngine();
      const drmInfo = makeDrmInfo();
      drmInfo.keySystem = 'com.widevine.alpha';
      drm.setDrmInfo(drmInfo);
      overrideDrmAndManifest(
          storage,
          drm,
          makeManifestWithVideoInitSegments());

      const stored = await storage.store(
          manifestWithVideoInitSegmentsUri, noMetadata, fakeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');

      // The manifest chooses the alternate stream, so expect only the alt init
      // segment.
      expect(drm.newInitData).toHaveBeenCalledWith('cenc', psshData2);
    });

    it('can store multiple assets at once', async () => {
      // Block the network so that we won't finish the first store command.
      /** @type {!shaka.util.PublicPromise} */
      const hangingPromise = netEngine.delayNextRequest();
      /** @type {!shaka.extern.IAbortableOperation} */
      const storeOperation = storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType);

      // Critical: This manifest should have different segment URIs than the one
      // above, or else the blocked network request would be shared between the
      // two storage operations.
      const secondStorePromise = storage.store(
          manifestWithAlternateSegmentsUri, noMetadata, fakeMimeType);
      await secondStorePromise.promise;

      // Unblock the original store and wait for it to complete.
      hangingPromise.resolve();
      await storeOperation.promise;
    });

    // Make sure that when we configure storage to NOT store persistent
    // licenses that we don't store the sessions.
    it('stores drm info with no license', async () => {
      const drmInfo = makeDrmInfo();
      const session1 = 'session-1';
      const session2 = 'session-2';

      // TODO(vaage): Is there a way we can set the session ids without
      //              needing to overload an internal call in storage.
      const drm = new shaka.test.FakeDrmEngine();
      drm.setDrmInfo(drmInfo);
      drm.setSessionIds([session1, session2]);

      overrideDrmAndManifest(
          storage,
          drm,
          makeManifestWithPerStreamBandwidth());
      storage.configure('offline.usePersistentLicense', false);

      const stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');

      /** @type {shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      expect(uri).toBeTruthy();

      /** @type {!shaka.offline.StorageMuxer} */
      const muxer = new shaka.offline.StorageMuxer();

      try {
        await muxer.init();
        const cell = await muxer.getCell(uri.mechanism(), uri.cell());
        const manifests = await cell.getManifests([uri.key()]);
        const manifest = manifests[0];
        expect(manifest).toBeTruthy();

        expect(manifest.drmInfo).toEqual(drmInfo);

        // When there is no expiration, the expiration is set to Infinity.
        expect(manifest.expiration).toBe(Infinity);

        expect(manifest.sessionIds).toBeTruthy();
        expect(manifest.sessionIds.length).toBe(0);
      } finally {
        await muxer.destroy();
      }
    });

    /**
     * In some situations, indexedDB.open() can just hang, and call neither the
     * 'success' nor the 'error' callbacks.
     * I'm not sure what causes it, but it seems to happen consistently between
     * reloads when it does so it might be a browser-based issue.
     * In that case, we should time out with an error, instead of also hanging.
     */
    it('throws an error if indexedDB open times out', async () => {
      const oldOpen = window.indexedDB.open;
      window.indexedDB.open = () => {
        // Just return a dummy object.
        return /** @type {!IDBOpenDBRequest} */ ({
          onsuccess: (event) => {},
          onerror: (error) => {},
        });
      };

      /** @type {!shaka.offline.StorageMuxer} */
      const muxer = new shaka.offline.StorageMuxer();
      const expectedError = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.INDEXED_DB_INIT_TIMED_OUT));

      await expectAsync(muxer.init())
          .toBeRejectedWith(expectedError);

      window.indexedDB.open = oldOpen;
    });

    it('throws an error if the content is a live stream', async () => {
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.CANNOT_STORE_LIVE_OFFLINE,
          manifestWithLiveTimelineUri));
      const storeOperation =
          storage.store(manifestWithLiveTimelineUri, noMetadata, fakeMimeType);
      await expectAsync(storeOperation.promise).toBeRejectedWith(expected);
    });

    it('throws an error if destroyed mid-store', async () => {
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

      // The uri won't matter much, as we have overriden |parseManifest|.
      /** @type {!shaka.extern.IAbortableOperation} */
      const waitOnStore = storage.store('any-uri', noMetadata, fakeMimeType);

      // Request for storage to be destroyed. Before waiting for it to resolve,
      // resolve the promise that we are using to stall the store operation.
      const waitOnDestroy = storage.destroy();
      stallStorage.resolve();
      await waitOnDestroy;

      // The store request should not resolve, but instead be rejected.
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.OPERATION_ABORTED));
      await expectAsync(waitOnStore.promise).toBeRejectedWith(expected);
    });

    it('cancels downloads if destroyed mid-store', async () => {
      await networkCancelTest((abortable) => {
        return storage.destroy();
      });
    });

    it('cancels downloads if canceled mid-store', async () => {
      await networkCancelTest((abortable) => {
        return abortable.abort();
      });
    });

    /**
     * @param {function(shaka.extern.IAbortableOperation):!Promise} interruption
     */
    async function networkCancelTest(interruption) {
      const delays = [];
      /** @type {!shaka.util.PublicPromise} */
      const aRequestIsStarted = new shaka.util.PublicPromise();

      // Set delays for the URIs of the manifest.
      const uris = [segment1Uri, segment2Uri, segment3Uri, segment4Uri];
      for (let i = 0; i < uris.length; i++) {
        const promise = new shaka.util.PublicPromise();
        delays.push(promise);

        // The fake networking engine provides a "abortCheck" callback to the
        // response, so that you can check whether or not the network operation
        // has been aborted.
        netEngine.setResponse(uris[i], async (abortCheck) => {
          aRequestIsStarted.resolve();
          await promise;

          expect(abortCheck()).toBe(true);

          return new ArrayBuffer(16);
        });
      }

      /** @type {!shaka.extern.IAbortableOperation} */
      const storeOperation = storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType);
      await aRequestIsStarted;
      const interruptionPromise = interruption(storeOperation);
      for (const promise of delays) {
        promise.resolve();
      }
      await interruptionPromise;

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.OPERATION_ABORTED));
      await expectAsync(storeOperation.promise).toBeRejectedWith(expected);
    }

    it('stops for networking errors', async () => {
      // Force all network requests to fail.
      const error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR);
      netEngine.request.and.callFake(() => {
        return shaka.util.AbortableOperation.failed(error);
      });

      const storeOperation = storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType);
      await expectAsync(storeOperation.promise)
          .toBeRejectedWith(Util.jasmineError(error));
    });

    it('throws an error if removing malformed uri', async () => {
      const badUri = 'this-is-an-invalid-uri';
      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
          badUri));
      await expectAsync(storage.remove(badUri)).toBeRejectedWith(expected);
    });

    it('throws an error if removing missing manifest', async () => {
      // Store a piece of content, but then change the uri slightly so that
      // it won't be found when we try to remove it (with the wrong uri).
      const stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');
      const storedUri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      const missingManifestUri = shaka.offline.OfflineUri.manifest(
          storedUri.mechanism(), storedUri.cell(), storedUri.key() + 1);

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.KEY_NOT_FOUND,
          jasmine.any(String)));
      await expectAsync(storage.remove(missingManifestUri.toString()))
          .toBeRejectedWith(expected);
    });

    it('removes manifest', async () => {
      const stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');
      await storage.remove(stored.offlineUri);
    });

    it('removes manifest with missing segments', async () => {
      const stored = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType).promise;
      goog.asserts.assert(stored.offlineUri != null, 'URI should not be null!');

      /** @type {shaka.offline.OfflineUri} */
      const uri = shaka.offline.OfflineUri.parse(stored.offlineUri);
      expect(uri).toBeTruthy();

      /** @type {!shaka.offline.StorageMuxer} */
      const muxer = new shaka.offline.StorageMuxer();

      try {
        await muxer.init();
        const cell = await muxer.getCell(uri.mechanism(), uri.cell());
        const manifests = await cell.getManifests([uri.key()]);
        const manifest = manifests[0];

        // Get the stream from the manifest. The segment count is based on how
        // we created manifest in the "make*Manifest" functions.
        const stream = manifest.streams[0];
        expect(stream).toBeTruthy();
        expect(stream.segments.length).toBe(4);

        // Remove all the segments so that all segments will be missing.
        // There should be way more than one segment.
        const keys = stream.segments.map((segment) => segment.dataKey);
        expect(keys.length).toBeGreaterThan(0);

        const noop = () => {};
        await cell.removeSegments(keys, noop);
      } finally {
        await muxer.destroy();
      }

      await storage.remove(uri.toString());
    });

    it('tracks progress on remove', async () => {
      const selectOneTrack = (tracks) => {
        const allVariants = tracks.filter((t) => {
          return t.type == 'variant';
        });
        expect(allVariants).toBeTruthy();
        expect(allVariants.length).toBeGreaterThan(0);

        const frenchVariants = allVariants.filter((t) => {
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
      const content = await storage.store(
          manifestWithPerStreamBandwidthUri, noMetadata, fakeMimeType).promise;
      goog.asserts.assert(
          content.offlineUri != null, 'URI should not be null!');

      // We expect 5 progress events because there are 4 unique segments, plus
      // the manifest.
      /** @type {!Array.<number>}*/
      const progressSteps = [
        0.2, 0.4, 0.6, 0.8, 1,
      ];

      const progressCallback = (content, progress) => {
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
    });
  });

  describe('storage without player', () => {
    const testSchemeMimeType = 'application/x-test-manifest';
    const manifestUri = 'test:sintel';

    it('stores content', async () => {
      /** @type {shaka.offline.Storage} */
      const storage = new shaka.offline.Storage();
      try {
        await storage.store(
            manifestUri, noMetadata, testSchemeMimeType).promise;
      } finally {
        await storage.destroy();
      }
    });
  });

  describe('deduplication', () => {
    const testSchemeMimeType = 'application/x-test-manifest';
    const manifestUri = 'test:sintel';

    // Regression test for https://github.com/shaka-project/shaka-player/issues/2781
    it('does not cache failures or cancellations', async () => {
      /** @type {shaka.offline.Storage} */
      const storage = new shaka.offline.Storage();

      try {
        storage.getNetworkingEngine().registerRequestFilter(
            (type, request) => {
              if (type == shaka.net.NetworkingEngine.RequestType.SEGMENT) {
                throw new Error('Break download!');
              }
            });

        const firstOperation = storage.store(
            manifestUri, noMetadata, testSchemeMimeType);
        // We killed the operation with a network failure, so this should be
        // rejected.
        await expectAsync(firstOperation.promise).toBeRejected();

        // Clear the filter that caused the error.
        storage.getNetworkingEngine().clearAllRequestFilters();

        // Now we can try again, and it should be able to succeed, even though
        // some downloads for the same URIs failed in the first attempt.  In
        // #2781, this would fail because the network failure was cached.
        const secondOperation = storage.store(
            manifestUri, noMetadata, testSchemeMimeType);
        await expectAsync(secondOperation.promise).toBeResolved();
      } finally {
        await storage.destroy();
      }
    });
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
      originalLanguage: language,
      label: null,
      kind: null,
      width: height * (16 / 9),
      height: height,
      frameRate: 30,
      pixelAspectRatio: '59:54',
      hdr: null,
      videoLayout: null,
      mimeType: 'video/mp4,audio/mp4',
      audioMimeType: 'audio/mp4',
      videoMimeType: 'video/mp4',
      codecs: 'mp4,mp4',
      audioCodec: 'mp4',
      videoCodec: 'mp4',
      primary: false,
      roles: [],
      audioRoles: [],
      forced: false,
      videoId: videoId,
      audioId: audioId,
      channelsCount: 2,
      audioSamplingRate: 48000,
      spatialAudio: false,
      tilesLayout: null,
      audioBandwidth: bandwidth * 0.33,
      videoBandwidth: bandwidth * 0.67,
      originalVideoId: videoId.toString(),
      originalAudioId: audioId.toString(),
      originalTextId: null,
      originalImageId: null,
      accessibilityPurpose: null,
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
      originalLanguage: language,
      label: null,
      kind: null,
      width: null,
      height: null,
      frameRate: null,
      pixelAspectRatio: null,
      hdr: null,
      videoLayout: null,
      mimeType: 'text/vtt',
      audioMimeType: null,
      videoMimeType: null,
      codecs: 'vtt',
      audioCodec: null,
      videoCodec: null,
      primary: false,
      roles: [],
      audioRoles: null,
      forced: false,
      videoId: null,
      audioId: null,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      tilesLayout: null,
      audioBandwidth: null,
      videoBandwidth: null,
      originalVideoId: null,
      originalAudioId: null,
      originalTextId: id.toString(),
      originalImageId: null,
      accessibilityPurpose: null,
    };
  }

  /** @return {shaka.extern.Manifest} */
  function makeManifestWithVideoInitSegments() {
    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.presentationTimeline.setDuration(20);

      manifest.addVariant(0, (variant) => {
        variant.bandwidth = kbps(13);
        variant.addVideo(1, (stream) => {
          stream.bandwidth = kbps(13);
          stream.size(100, 200);
        });
      });
      manifest.addVariant(2, (variant) => {
        variant.bandwidth = kbps(20);
        variant.addVideo(3, (stream) => {
          stream.bandwidth = kbps(20);
          stream.size(200, 400);
        });
      });
    });

    const stream = manifest.variants[0].video;
    goog.asserts.assert(stream, 'The first stream should exist');
    stream.encrypted = true;
    const init = new shaka.media.InitSegmentReference(
        () => [initSegmentUri], 0, null);
    const refs = [
      makeReference(segment1Uri, 0, 1),
      makeReference(segment2Uri, 1, 2),
      makeReference(segment3Uri, 2, 3),
      makeReference(segment4Uri, 3, 4),
    ];
    for (const ref of refs) {
      ref.initSegmentReference = init;
    }
    overrideSegmentIndex(stream, refs);

    const streamAlt = manifest.variants[1].video;
    goog.asserts.assert(streamAlt, 'The second stream should exist');
    streamAlt.encrypted = true;
    const initAlt = new shaka.media.InitSegmentReference(
        () => [alternateInitSegmentUri], 0, null);
    const refsAlt = [
      makeReference(alternateSegment1Uri, 0, 1),
      makeReference(alternateSegment2Uri, 1, 2),
      makeReference(alternateSegment3Uri, 2, 3),
      makeReference(alternateSegment4Uri, 3, 4),
    ];
    for (const ref of refsAlt) {
      ref.initSegmentReference = initAlt;
    }
    overrideSegmentIndex(streamAlt, refsAlt);

    return manifest;
  }

  /** @return {shaka.extern.Manifest} */
  function makeManifestWithPerStreamBandwidth() {
    const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.presentationTimeline.setDuration(20);

      manifest.addVariant(0, (variant) => {
        variant.language = englishUS;
        variant.bandwidth = kbps(13);
        variant.addVideo(1, (stream) => {
          stream.bandwidth = kbps(10);
          stream.size(100, 200);
        });
        variant.addAudio(2, (stream) => {
          stream.language = englishUS;
          stream.bandwidth = kbps(3);
        });
      });
      manifest.addVariant(3, (variant) => {
        variant.language = frenchCanadian;
        variant.bandwidth = kbps(13);
        variant.addExistingStream(1);
        variant.addAudio(5, (stream) => {
          stream.language = frenchCanadian;
          stream.bandwidth = kbps(3);
        });
      });
    });

    for (const stream of getAllStreams(manifest)) {
      // Make a new copy each time, as the segment index can modify each
      // reference.
      const refs = [
        makeReference(segment1Uri, 0, 1),
        makeReference(segment2Uri, 1, 2),
        makeReference(segment3Uri, 2, 3),
        makeReference(segment4Uri, 3, 4),
      ];

      overrideSegmentIndex(stream, refs);
    }

    return manifest;
  }

  /**
   * @return {shaka.extern.Manifest}
   */
  function makeManifestWithoutPerStreamBandwidth() {
    const manifest = makeManifestWithPerStreamBandwidth();

    // Remove the per stream bandwidth.
    for (const stream of getAllStreams(manifest)) {
      stream.bandwidth = undefined;
    }

    return manifest;
  }

  /**
   * @return {shaka.extern.Manifest}
   */
  function makeManifestWithNonZeroStart() {
    const manifest = makeManifestWithPerStreamBandwidth();

    for (const stream of getAllStreams(manifest)) {
      const refs = [
        makeReference(segment1Uri, 10, 11),
        makeReference(segment2Uri, 11, 12),
        makeReference(segment3Uri, 12, 13),
        makeReference(segment4Uri, 13, 14),
      ];

      overrideSegmentIndex(stream, refs);
    }

    return manifest;
  }

  /**
   * @return {shaka.extern.Manifest}
   */
  function makeManifestWithLiveTimeline() {
    const manifest = makeManifestWithPerStreamBandwidth();
    manifest.presentationTimeline.setDuration(Infinity);
    manifest.presentationTimeline.setStatic(false);
    return manifest;
  }

  /**
   * @return {shaka.extern.Manifest}
   */
  function makeManifestWithAlternateSegments() {
    const manifest = makeManifestWithPerStreamBandwidth();

    for (const stream of getAllStreams(manifest)) {
      const refs = [
        makeReference(alternateSegment1Uri, 10, 11),
        makeReference(alternateSegment2Uri, 11, 12),
        makeReference(alternateSegment3Uri, 12, 13),
        makeReference(alternateSegment4Uri, 13, 14),
      ];

      overrideSegmentIndex(stream, refs);
    }

    return manifest;
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @return {!Array.<shaka.extern.Stream>}
   */
  function getAllStreams(manifest) {
    const streams = [];

    for (const variant of manifest.variants) {
      if (variant.audio) {
        streams.push(variant.audio);
      }
      if (variant.video) {
        streams.push(variant.video);
      }
    }
    for (const stream of manifest.textStreams) {
      streams.push(stream);
    }

    return streams;
  }

  /**
   * @param {shaka.extern.Stream} stream
   * @param {!Array.<shaka.media.SegmentReference>} segments
   */
  function overrideSegmentIndex(stream, segments) {
    const index = new shaka.media.SegmentIndex(segments);
    stream.createSegmentIndex = () => Promise.resolve();
    stream.segmentIndex = index;
  }

  /** @return {!shaka.test.FakeNetworkingEngine} */
  function makeNetworkEngine() {
    return new shaka.test.FakeNetworkingEngine()
        .setResponseValue(segment1Uri, new ArrayBuffer(16))
        .setResponseValue(segment2Uri, new ArrayBuffer(16))
        .setResponseValue(segment3Uri, new ArrayBuffer(16))
        .setResponseValue(segment4Uri, new ArrayBuffer(16))
        .setResponseValue(alternateSegment1Uri, new ArrayBuffer(16))
        .setResponseValue(alternateSegment2Uri, new ArrayBuffer(16))
        .setResponseValue(alternateSegment3Uri, new ArrayBuffer(16))
        .setResponseValue(alternateSegment4Uri, new ArrayBuffer(16));
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
    const drmInfo = {
      keySystem: 'com.example.abc',
      licenseServerUri: 'http://example.com',
      persistentStateRequired: true,
      distinctiveIdentifierRequired: false,
      initData: null,
      keyIds: null,
      sessionType: 'temporary',
      serverCertificate: null,
      serverCertificateUri: '',
      audioRobustness: 'HARDY',
      videoRobustness: 'OTHER',
    };

    return drmInfo;
  }

  // TODO(vaage): Replace this with |shaka.test.FakeManifestParser|
  /** @implements {shaka.extern.ManifestParser} */
  const FakeManifestParser = class {
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
      this.map_[manifestWithAlternateSegmentsUri] =
          makeManifestWithAlternateSegments();
      this.map_[manifestWithVideoInitSegmentsUri] =
          makeManifestWithVideoInitSegments();
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

    /** @override */
    onInitialVariantChosen(variant) {}

    /** @override */
    banLocation(uri) {}
  };

  /**
   * @param {!shaka.media.DrmEngine} drmEngine
   * @param {string} sessionName
   * @return {!Promise.<MediaKeySession>}
   *
   * @suppress {accessControls}
   */
  function loadOfflineSession(drmEngine, sessionName) {
    return drmEngine.loadOfflineSession_(
        sessionName, {initData: null, initDataType: null});
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
      const variants = manifest.variants;
      await drm.initForStorage(variants, /* usePersistentLicenses= */ true);
      await action(drm);
    } finally {
      await drm.destroy();
    }

    if (error) {
      throw error;
    }
  }

  /**
   * Creates a real SegmentReference.  This is distinct from the fake ones used
   * in ManifestParser tests because it can be on the left-hand side of an
   * expect().  You can't expect jasmine.any(Number) to equal
   * jasmine.any(Number).  :-(
   *
   * @param {string} uri
   * @param {number} startTime
   * @param {number} endTime
   * @param {shakaNamespaceType=} compiledShaka
   * @return {shaka.media.SegmentReference}
   */
  function makeReference(uri, startTime, endTime, compiledShaka) {
    /** @type {shakaNamespaceType} */
    const shaka = compiledShaka || window['shaka'];

    return new shaka.media.SegmentReference(
        startTime,
        endTime,
        /* getUris= */ () => [uri],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity);
  }
});
