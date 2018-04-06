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
  const OfflineUri = shaka.offline.OfflineUri;
  const SegmentReference = shaka.media.SegmentReference;

  const fakeManifestUri = 'my-fake-manifest';

  let mockSEFactory = new shaka.test.MockStorageEngineFactory();

  /** @type {!shaka.offline.IStorageEngine} */
  let fakeStorageEngine;
  /** @type {!shaka.offline.Storage} */
  let storage;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.test.FakeNetworkingEngine} */
  let netEngine;

  beforeEach(function() {
    fakeStorageEngine = new shaka.test.MemoryStorageEngine();

    mockSEFactory.overrideIsSupported(true);
    mockSEFactory.overrideCreate(function() {
      return Promise.resolve(fakeStorageEngine);
    });

    netEngine = new shaka.test.FakeNetworkingEngine();

    // Use a real Player since Storage only uses the configuration and
    // networking engine.  This allows us to use Player.configure in these
    // tests.
    player = new shaka.Player(new shaka.test.FakeVideo(), function(player) {
      player.createNetworkingEngine = function() {
        return netEngine;
      };
    });

    storage = new shaka.offline.Storage(player);
  });

  afterEach(function(done) {
    storage.destroy().catch(fail).then(done);
    mockSEFactory.resetAll();
  });

  it('lists stored manifests', function(done) {
    goog.asserts.assert(
        fakeStorageEngine,
        'Need storage engine for this test.');

    Promise.all([
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .metadata({name: 'manifest 1'})
          .period()
          .build(),
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .metadata({name: 'manifest 2'})
          .period()
          .build()
    ]).then(function() {
      return storage.list();
    }).then(function(storedContent) {
      expect(storedContent).toBeTruthy();
      expect(storedContent.length).toBe(2);

      // Manifest 1
      expect(storedContent[0]).toBeTruthy();
      expect(storedContent[0].appMetadata).toBeTruthy();
      expect(storedContent[0].appMetadata.name).toBe('manifest 1');

      // Manifest 2
      expect(storedContent[1]).toBeTruthy();
      expect(storedContent[1].appMetadata).toBeTruthy();
      expect(storedContent[1].appMetadata.name).toBe('manifest 2');
    }).catch(fail).then(done);
  });

  describe('reports progress on store', function() {
    /** @type {shaka.extern.Manifest} */
    let manifest;

    beforeEach(function() {
      manifest = new shaka.test.ManifestGenerator()
          .setPresentationDuration(20)
          .addPeriod(0)
            .addVariant(0).language('en')
              .addVideo(1).size(100, 200)
              .addAudio(2).language('en')
          .build();

      netEngine.setResponseMap({'fake:0': new ArrayBuffer(16)});

      let segments = [
        new SegmentReference(0, 0, 1, makeUris('fake:0'), 0, null),
        new SegmentReference(1, 1, 2, makeUris('fake:0'), 0, null),
        new SegmentReference(2, 2, 3, makeUris('fake:0'), 0, null),
        new SegmentReference(3, 3, 4, makeUris('fake:0'), 0, null)
      ];

      let audio = manifest.periods[0].variants[0].audio;
      let audioIndex = new shaka.media.SegmentIndex(segments);
      audio.findSegmentPosition = (i) => audioIndex.find(i);
      audio.getSegmentReference = (i) => audioIndex.get(i);

      let video = manifest.periods[0].variants[0].video;
      let videoIndex = new shaka.media.SegmentIndex(segments);
      video.findSegmentPosition = (i) => videoIndex.find(i);
      video.getSegmentReference = (i) => videoIndex.get(i);

      let drmEngine = new shaka.test.FakeDrmEngine();

      storage.loadInternal = () => {
        return Promise.resolve().then(() => {
          return {
            manifest: manifest,
            drmEngine: drmEngine
          };
        });
      };
    });

    it('uses stream bandwidth', function(done) {
      let videoBitRate = 12 * 1024 * 1024;
      let audioBitRate = 12 * 1024 * 1024;

      // Set the bandwidth for each stream - progress should be based off the
      // stream specific bandwidths.
      let variant = manifest.periods[0].variants[0];
      variant.bandwidth = videoBitRate + audioBitRate;
      variant.audio.bandwidth = audioBitRate;
      variant.video.bandwidth = videoBitRate;

      let progress = jasmine.createSpy('onProgress');

      let steps = [
        0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1
      ];

      progress.and.callFake((storedContent, percent) => {
        expect(percent).toBeCloseTo(steps.shift());
      });

      storage.configure({progressCallback: progress});
      storage.store('').then(() => {
        expect(steps).toEqual([]);
      }).catch(fail).then(done);
    });

    it('uses variant bandwidth when stream bandwidth is unavailable',
       function(done) {
         // Even through audio and video are equal, the audio will be assumed
         // to be close to its actual value and will use the default audio.
         let videoBitRate = 8 * 1024 * 1024;
         let audioBitRate = 128 * 1024;

         // Ensure that the bandwidth is only set on the variant and not
         // the streams.
         let variant = manifest.periods[0].variants[0];
         variant.bandwidth = videoBitRate + audioBitRate;
         variant.audio.bandwidth = undefined;
         variant.video.bandwidth = undefined;

         let progress = jasmine.createSpy('onProgress');

         // Because the video will so wildly out-weight the audio, audio won't
         // update the progress that much.
         let steps = [
           0.24, 0.25, 0.49, 0.5, 0.74, 0.75, 0.99, 1
         ];

         progress.and.callFake((storedContent, percent) => {
           expect(percent).toBeCloseTo(steps.shift());
         });

         storage.configure({progressCallback: progress});
         storage.store('').then(() => {
           expect(steps).toEqual([]);
         }).catch(fail).then(done);
       });
  });

  describe('store', function() {
    const originalWarning = shaka.log.warning;

    /** @type {shaka.extern.Manifest} */
    let manifest;
    /** @type {!Array.<shaka.extern.Track>} */
    let tracks;
    /** @type {!shaka.test.FakeDrmEngine} */
    let drmEngine;
    /** @type {!shaka.media.SegmentIndex} */
    let stream1Index;
    /** @type {!shaka.media.SegmentIndex} */
    let stream2Index;

    beforeEach(function() {
      drmEngine = new shaka.test.FakeDrmEngine();
      manifest = new shaka.test.ManifestGenerator()
          .setPresentationDuration(20)
          .addPeriod(0)
            .addVariant(0).language('en').bandwidth(160)
              .addVideo(1).size(100, 200).bandwidth(80)
              .addAudio(2).language('en').bandwidth(80)
          .build();
      // Get the original tracks from the manifest.
      tracks = shaka.util.StreamUtils.getVariantTracks(
          manifest.periods[0],
          null,
          null);

      storage.loadInternal = function() {
        return Promise.resolve().then(function() {
          return {
            manifest: manifest,
            drmEngine: drmEngine
          };
        });
      };

      player.configure({preferredAudioLanguage: 'en'});

      stream1Index = new shaka.media.SegmentIndex([]);
      stream2Index = new shaka.media.SegmentIndex([]);

      let stream1 = manifest.periods[0].variants[0].audio;
      stream1.findSegmentPosition = stream1Index.find.bind(stream1Index);
      stream1.getSegmentReference = stream1Index.get.bind(stream1Index);

      let stream2 = manifest.periods[0].variants[0].video;
      stream2.findSegmentPosition = stream2Index.find.bind(stream2Index);
      stream2.getSegmentReference = stream2Index.get.bind(stream2Index);
    });

    afterEach(function() {
      shaka.log.warning = originalWarning;
    });

    it('stores basic manifests', function(done) {
      let originalUri = 'fake://foobar';
      let appData = {tools: ['Google', 'StackOverflow'], volume: 11};

      let expectedUri = shaka.offline.OfflineUri.manifest(
          'mechanism', 'cell', 0);

      // Once tracks have completely been downloaded, they lose all
      // bandwidth data. Clear bandwidth data from the tracks before
      // checking the results of the stored tracks.
      tracks.forEach(function(track) {
        track.bandwidth = 0;
        track.audioBandwidth = null;
        track.videoBandwidth = null;
      });

      storage.store(originalUri, appData)
          .then(function(data) {
            expect(data).toBeTruthy();
            // Since we are using a memory DB, it will always be the first one.
            expect(data.offlineUri).toBe(expectedUri.toString());
            expect(data.originalManifestUri).toBe(originalUri);
            // Even though there are no segments, it will use the duration from
            // the original manifest.
            expect(data.duration).toBe(20);
            expect(data.size).toEqual(0);
            expect(data.tracks).toEqual(tracks);
            expect(data.appMetadata).toEqual(appData);
          })
          .catch(fail)
          .then(done);
    });

    it('gives warning if storing tracks with the same type', function(done) {
      manifest = new shaka.test.ManifestGenerator()
          .setPresentationDuration(20)
          .addPeriod(0)
            .addVariant(0)
            .addVariant(1)
          .build();

      // Store every stream.
      storage.configure({
        trackSelectionCallback: function(tracks) {
          return tracks;
        }
      });

      let warning = jasmine.createSpy('shaka.log.warning');
      shaka.log.warning = shaka.test.Util.spyFunc(warning);
      storage.store(fakeManifestUri)
          .then(function(data) {
            expect(data).toBeTruthy();
            expect(warning).toHaveBeenCalled();
          })
          .catch(fail)
          .then(done);
    });

    it('only stores the tracks chosen', function(done) {
      let expectedUri = shaka.offline.OfflineUri.manifest(
          'mechanism', 'cell', 0);

      manifest = new shaka.test.ManifestGenerator()
          .setPresentationDuration(20)
          .addPeriod(0)
            .addVariant(0)
              .addVideo(1)
            .addVariant(2)
              .addVideo(3)
          .build();

      /**
       * @param {!Array.<shaka.extern.Track>} tracks
       * @return {!Array.<shaka.extern.Track>}
       */
      let trackSelectionCallback = function(tracks) {
        // Store the first variant.
        return tracks.slice(0, 1);
      };

      storage.configure({trackSelectionCallback: trackSelectionCallback});

      storage.store(fakeManifestUri).then((data) => {
        expect(data).toBeTruthy();
        expect(data.offlineUri).toBe(expectedUri.toString());
        return fakeStorageEngine.getManifest(0);
      }).then((manifestDb) => {
        expect(manifestDb).toBeTruthy();
        expect(manifestDb.periods.length).toBe(1);
        expect(manifestDb.periods[0].streams.length).toBe(1);
      }).catch(fail).then(done);
    });

    it('stores offline sessions', function(done) {
      let expectedUri = shaka.offline.OfflineUri.manifest(
          'mechanism', 'cell', 0);
      let sessions = ['lorem', 'ipsum'];
      drmEngine.setSessionIds(sessions);
      storage.store(fakeManifestUri)
          .then(function(data) {
            expect(data.offlineUri).toBe(expectedUri.toString());
            return fakeStorageEngine.getManifest(0);
          })
          .then(function(manifestDb) {
            expect(manifestDb).toBeTruthy();
            expect(manifestDb.sessionIds).toEqual(sessions);
          })
          .catch(fail)
          .then(done);
    });

    it('stores DRM info', function(done) {
      let expectedUri = shaka.offline.OfflineUri.manifest(
          'mechanism', 'cell', 0);

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
      drmEngine.setDrmInfo(drmInfo);
      drmEngine.setSessionIds(['abcd']);
      storage.store(fakeManifestUri)
          .then(function(data) {
            expect(data.offlineUri).toBe(expectedUri.toString());
            return fakeStorageEngine.getManifest(0);
          })
          .then(function(manifestDb) {
            expect(manifestDb).toBeTruthy();
            expect(manifestDb.drmInfo).toEqual(drmInfo);
          })
          .catch(fail)
          .then(done);
    });

    it('stores expiration', function(done) {
      let expectedUri = shaka.offline.OfflineUri.manifest(
          'mechanism', 'cell', 0);

      drmEngine.setSessionIds(['abcd']);
      drmEngine.getExpiration.and.returnValue(1234);

      storage.store(fakeManifestUri)
          .then(function(data) {
            expect(data.offlineUri).toBe(expectedUri.toString());
            return fakeStorageEngine.getManifest(0);
          })
          .then(function(manifestDb) {
            expect(manifestDb).toBeTruthy();
            expect(manifestDb.expiration).toBe(1234);
          })
          .catch(fail)
          .then(done);
    });

    it('throws an error if another store is in progress', function(done) {
      let p1 = storage.store(fakeManifestUri).catch(fail);
      let p2 = storage.store(fakeManifestUri).then(fail).catch(function(error) {
        let expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.STORE_ALREADY_IN_PROGRESS);
        shaka.test.Util.expectToEqualError(error, expectedError);
      });
      Promise.all([p1, p2]).catch(fail).then(done);
    });

    it('throws an error if the content is a live stream', function(done) {
      manifest.presentationTimeline.setDuration(Infinity);
      manifest.presentationTimeline.setStatic(false);

      storage.store(fakeManifestUri).then(fail).catch(function(error) {
        let expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.CANNOT_STORE_LIVE_OFFLINE,
            fakeManifestUri);
        shaka.test.Util.expectToEqualError(error, expectedError);
      }).then(done);
    });

    it('throws an error if DRM sessions are not ready', function(done) {
      let drmInfo = {
        keySystem: 'com.example.abc',
        licenseServerUri: 'http://example.com',
        persistentStateRequired: true,
        distinctiveIdentifierRequired: false,
        keyIds: null,
        initData: null,
        serverCertificate: null,
        audioRobustness: 'HARDY',
        videoRobustness: 'OTHER'
      };
      drmEngine.setDrmInfo(drmInfo);
      drmEngine.setSessionIds([]);
      storage.store(fakeManifestUri).then(fail).catch(function(error) {
        let expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.NO_INIT_DATA_FOR_OFFLINE,
            fakeManifestUri);
        shaka.test.Util.expectToEqualError(error, expectedError);
      }).then(done);
    });

    it('throws an error if storage is not supported', function(done) {
      let expectedError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.STORAGE_NOT_SUPPORTED);

      mockSEFactory.overrideIsSupported(false);
      mockSEFactory.resetCreate();

      // Recreate Storage object so that the changes to mock will take effect.
      Promise.resolve()
          .then(function() {
            storage = new shaka.offline.Storage(player);
            return storage.store(fakeManifestUri);
          })
          .then(fail)
          .catch(function(error) {
            shaka.test.Util.expectToEqualError(error, expectedError);
          })
          .then(done);
    });

    it('throws an error if destroyed mid-store', function(done) {
      let p1 = storage.store(fakeManifestUri).then(fail).catch(function(error) {
        let expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.OPERATION_ABORTED);
        shaka.test.Util.expectToEqualError(error, expectedError);
      });
      let p2 = storage.destroy();
      Promise.all([p1, p2]).catch(fail).then(done);
    });

    describe('segments', function() {
      it('stores media segments', function(done) {
        // The IDs and their order may change in a refactor.  The constant
        // values here can be updated to match the behavior without changing
        // the rest of the test."

        const id1 = 0;
        const id2 = 1;
        const id3 = 2;
        const id4 = 3;
        const id5 = 4;
        const id6 = 5;

        const fakeDataLength0 = 5;
        const fakeDataLength1 = 7;
        const fakeDataLength2 = 9;
        const fakeDataLength3 = 11;
        const fakeDataLength4 = 13;
        const fakeDataLength5 = 15;

        const totalSize = fakeDataLength0 +
                          fakeDataLength1 +
                          fakeDataLength2 +
                          fakeDataLength3 +
                          fakeDataLength4 +
                          fakeDataLength5;

        netEngine.setResponseMap({
          'fake:0': new ArrayBuffer(fakeDataLength0),
          'fake:1': new ArrayBuffer(fakeDataLength1),
          'fake:2': new ArrayBuffer(fakeDataLength2),
          'fake:3': new ArrayBuffer(fakeDataLength3),
          'fake:4': new ArrayBuffer(fakeDataLength4),
          'fake:5': new ArrayBuffer(fakeDataLength5)
        });

        stream1Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:0'), 0, null),
          new SegmentReference(1, 1, 2, makeUris('fake:1'), 0, null),
          new SegmentReference(2, 2, 3, makeUris('fake:2'), 0, null),
          new SegmentReference(3, 3, 4, makeUris('fake:3'), 0, null),
          new SegmentReference(4, 4, 5, makeUris('fake:4'), 0, null)
        ]);
        stream2Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:5'), 0, null)
        ]);

        /**
         * @param {number} startTime
         * @param {number} endTime
         * @param {number} id
         * @return {shaka.extern.SegmentDB}
         */
        let makeSegment = function(startTime, endTime, id) {
          /** @type {shaka.extern.SegmentDB} */
          let segment = {
            startTime: startTime,
            endTime: endTime,
            dataKey: id
          };

          return segment;
        };

        storage.store(fakeManifestUri)
            .then(function(manifest) {
              expect(manifest).toBeTruthy();
              expect(manifest.size).toBe(totalSize);
              expect(manifest.duration).toBe(20); // Original manifest duration
              expect(netEngine.request.calls.count()).toBe(6);
              return fakeStorageEngine.getManifest(0);
            })
            .then(function(manifest) {
              let stream1 = manifest.periods[0].streams[1];
              expect(stream1.initSegmentKey).toBe(null);
              expect(stream1.segments.length).toBe(5);
              expect(stream1.segments).toContain(makeSegment(0, 1, id2));
              expect(stream1.segments).toContain(makeSegment(1, 2, id3));
              expect(stream1.segments).toContain(makeSegment(2, 3, id4));
              expect(stream1.segments).toContain(makeSegment(3, 4, id5));
              expect(stream1.segments).toContain(makeSegment(4, 5, id6));

              let stream2 = manifest.periods[0].streams[0];
              expect(stream2.initSegmentKey).toBe(null);
              expect(stream2.segments.length).toBe(1);
              expect(stream2.segments).toContain(makeSegment(0, 1, id1));

              return fakeStorageEngine.getSegment(id4);
            })
            .then(function(segment) {
              expect(segment).toBeTruthy();
              expect(segment.data).toBeTruthy();
              expect(segment.data.byteLength).toBe(fakeDataLength2);
            })
            .catch(fail)
            .then(done);
      });

      it('downloads different content types in parallel', function(done) {
        netEngine.setResponseMap({
          'fake:0': new ArrayBuffer(5),
          'fake:1': new ArrayBuffer(7)
        });

        stream1Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:0'), 0, null),
          new SegmentReference(1, 1, 2, makeUris('fake:1'), 0, null),
          new SegmentReference(2, 2, 3, makeUris('fake:1'), 0, null)
        ]);
        stream2Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:1'), 0, null),
          new SegmentReference(1, 1, 2, makeUris('fake:0'), 0, null),
          new SegmentReference(2, 2, 3, makeUris('fake:1'), 0, null)
        ]);

        // Delay the next segment download.  This will stall either audio or
        // video, but the other should continue.
        let req1 = netEngine.delayNextRequest();

        storage.store(fakeManifestUri)
            .then(function(manifest) {
              expect(manifest).toBeTruthy();
            })
            .catch(fail)
            .then(done);

        shaka.test.Util.delay(1).then(function() {
          // Should have downloaded all of the segments from either audio/video
          // and a single (pending) request for the other.
          expect(netEngine.request.calls.count()).toBe(4);
          req1.resolve();
        });
      });

      it('stores init segment', function(done) {
        const segmentSize = 5;
        netEngine.setResponseMap({'fake:0': new ArrayBuffer(segmentSize)});

        let stream = manifest.periods[0].variants[0].audio;
        stream.initSegmentReference =
            new shaka.media.InitSegmentReference(makeUris('fake:0'), 0, null);

        storage.store(fakeManifestUri).then((manifest) => {
          expect(manifest).toBeTruthy();
          expect(manifest.size).toBe(segmentSize);
          expect(manifest.duration).toBe(20); // Original manifest duration
          expect(netEngine.request.calls.count()).toBe(1);
          return fakeStorageEngine.getManifest(0);
        }).then((manifest) => {
          let stream = manifest.periods[0].streams[1];
          expect(stream.contentType).toBe('audio');
          expect(stream.segments.length).toBe(0);
          expect(stream.initSegmentKey).toBe(0);
          return fakeStorageEngine.getSegment(0);
        }).then((segment) => {
          expect(segment).toBeTruthy();
          expect(segment.data).toBeTruthy();
          expect(segment.data.byteLength).toBe(5);
        }).catch(fail).then(done);
      });

      it('with non-0 start time', function(done) {
        netEngine.setResponseMap({'fake:0': new ArrayBuffer(5)});

        let refs = [
          new SegmentReference(0, 10, 11, makeUris('fake:0'), 0, null),
          new SegmentReference(1, 11, 12, makeUris('fake:0'), 0, null),
          new SegmentReference(2, 12, 13, makeUris('fake:0'), 0, null)
        ];
        stream1Index.merge(refs);
        manifest.presentationTimeline.notifySegments(refs, true);

        storage.store(fakeManifestUri)
            .then(function(manifest) {
              expect(manifest).toBeTruthy();
              expect(manifest.size).toBe(15);
              expect(manifest.duration).toBe(20);  // Original manifest duration
              expect(netEngine.request.calls.count()).toBe(3);
              return fakeStorageEngine.getManifest(0);
            })
            .then(function(manifest) {
              let stream = manifest.periods[0].streams[1];
              expect(stream.segments.length).toBe(3);
            })
            .catch(fail)
            .then(done);
      });

      it('stops for networking errors', function(done) {
        netEngine.setResponseMap({'fake:0': new ArrayBuffer(5)});

        stream1Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:0'), 0, null),
          new SegmentReference(1, 1, 2, makeUris('fake:0'), 0, null),
          new SegmentReference(2, 2, 3, makeUris('fake:0'), 0, null)
        ]);

        let delay = netEngine.delayNextRequest();
        let expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.HTTP_ERROR);
        delay.reject(expectedError);
        storage.store(fakeManifestUri)
            .then(fail, function(error) {
              shaka.test.Util.expectToEqualError(error, expectedError);
            })
            .catch(fail)
            .then(done);
      });
    });  // describe('segments')

    describe('default track selection callback', function() {
      /** @type {!Array.<shaka.extern.Track>} */
      let allTextTracks;

      beforeEach(function() {
        manifest = new shaka.test.ManifestGenerator()
            .setPresentationDuration(20)
            .addPeriod(0)
            // Spanish, primary
            // To test language selection fallback to primary
            .addVariant(10).language('es').bandwidth(160).primary()
              .addVideo(100).size(100, 200)
              .addAudio(101).language('es').primary()
            // English variations
            // To test language selection for exact matches
            .addVariant(20).language('en').bandwidth(160)
              .addVideo(200).size(100, 200)
              .addAudio(201).language('en')
            .addVariant(21).language('en-US').bandwidth(160)
              .addVideo(200).size(100, 200)
              .addAudio(202).language('en-US')
            .addVariant(22).language('en-GB').bandwidth(160)
              .addVideo(200).size(100, 200)
              .addAudio(203).language('en-GB')
            // French
            // To test language selection without exact match
            .addVariant(30).language('fr-CA').bandwidth(160)
              .addVideo(300).size(100, 200)
              .addAudio(301).language('fr-CA')
            // Swahili, multiple video resolutions
            // To test video resolution selection
            .addVariant(40).language('sw').bandwidth(160)
              .addAudio(400).language('sw')
              .addVideo(401).size(100, 200)  // small SD video
            .addVariant(41).language('sw').bandwidth(160)
              .addAudio(400).language('sw')
              .addVideo(402).size(1080, 720)  // HD video
            .addVariant(42).language('sw').bandwidth(100)  // low
              .addAudio(403).language('sw').kind('low')
              .addVideo(404).size(720, 480)  // largest SD video
            .addVariant(43).language('sw').bandwidth(200)  // mid
              .addAudio(405).language('sw').kind('mid')
              .addVideo(404).size(720, 480)  // largest SD video
            .addVariant(44).language('sw').bandwidth(300)  // high
              .addAudio(406).language('sw').kind('high')
              .addVideo(404).size(720, 480)  // largest SD video
            // Text streams in various languages
            // To test text selection
            .addTextStream(90).language('es')
            .addTextStream(91).language('en')
            .addTextStream(92).language('ar')
            .addTextStream(93).language('el')
            .addTextStream(94).language('he')
            .addTextStream(95).language('zh')
            .build();

        // Get the original text tracks from the manifest.
        allTextTracks = shaka.util.StreamUtils.getTextTracks(
            manifest.periods[0], null);

        storage.loadInternal = function() {
          return Promise.resolve().then(function() {
            return {
              manifest: manifest,
              drmEngine: /** @type {!shaka.media.DrmEngine} */ (drmEngine)
            };
          });
        };

        // Use the default track selection callback.
        storage.configure({trackSelectionCallback: undefined});
      });

      function getVariants(data) {
        return data.tracks.filter(function(t) {
          return t.type == 'variant';
        });
      }

      function getText(data) {
        return data.tracks.filter(function(t) {
          return t.type == 'text';
        });
      }

      it('stores the largest SD video track, middle audio', function(done) {
        // This language will select variants with multiple video resolutions.
        player.configure({preferredAudioLanguage: 'sw'});
        storage.store(fakeManifestUri).then(function(data) {
          let variantTracks = getVariants(data);
          expect(variantTracks.length).toBe(1);
          expect(variantTracks[0].width).toBe(720);
          expect(variantTracks[0].height).toBe(480);
          expect(variantTracks[0].language).toEqual('sw');
          // Note that kind == 'mid' is not realistic, but we use it here as a
          // convenient way to detect which audio was selected after offline
          // storage removes bandwidth information from the original tracks.
          expect(variantTracks[0].kind).toEqual('mid');
        }).catch(fail).then(done);
      });

      it('stores all text tracks', function(done) {
        storage.store(fakeManifestUri).then(function(data) {
          let textTracks = getText(data);
          expect(textTracks.length).toBe(allTextTracks.length);
          expect(textTracks).toEqual(jasmine.arrayContaining(allTextTracks));
        }).catch(fail).then(done);
      });

      describe('language matching', function() {
        let warning;
        let originalWarning;

        beforeEach(function() {
          originalWarning = shaka.log.warning;
          warning = jasmine.createSpy('shaka.log.warning');

          shaka.log.warning = shaka.test.Util.spyFunc(warning);
        });

        afterEach(function() {
          shaka.log.warning = originalWarning;
        });

        it('stores exact match when found', function(done) {
          setLanguagePreference('en-US');

          return storage.store(fakeManifestUri).then((content) => {
            let variantTracks = getVariants(content);
            expect(variantTracks.length).toBe(1);
            expect(variantTracks[0].language).toEqual('en-US');
          }).catch(fail).then(done);
        });

        it('stores exact match for only base when found', function(done) {
          setLanguagePreference('en');

          return storage.store(fakeManifestUri).then((content) => {
            let variantTracks = getVariants(content);
            expect(variantTracks.length).toBe(1);
            expect(variantTracks[0].language).toEqual('en');
          }).catch(fail).then(done);
        });

        it('stores base match when exact match is not found', function(done) {
          setLanguagePreference('en-AU');

          return storage.store(fakeManifestUri).then((content) => {
            let variantTracks = getVariants(content);
            expect(variantTracks.length).toBe(1);
            expect(variantTracks[0].language).toEqual('en');
          }).catch(fail).then(done);
        });

        it('stores common base when exact match is not found', function(done) {
          setLanguagePreference('fr-FR');

          return storage.store(fakeManifestUri).then((content) => {
            let variantTracks = getVariants(content);
            expect(variantTracks.length).toBe(1);
            expect(variantTracks[0].language).toEqual('fr-CA');
          }).catch(fail).then(done);
        });

        it('stores primary track when no match is found', function(done) {
          setLanguagePreference('zh');

          return storage.store(fakeManifestUri).then((content) => {
            let variantTracks = getVariants(content);
            expect(variantTracks.length).toBe(1);
            expect(variantTracks[0].language).toEqual('es');
          }).catch(fail).then(done);
        });

        it('warn when for no matche and no primary track', function(done) {
          setLanguagePreference('not-a-language');

          // Make every audio stream and variant non-primary.
          manifest.periods[0].variants.forEach((variant) => {
            variant.primary = false;
            if (variant.audio) { variant.audio.primary = false; }
          });

          return storage.store(fakeManifestUri).then((content) => {
            let variantTracks = getVariants(content);
            expect(variantTracks.length).toBe(1);
            expect(warning).toHaveBeenCalled();
          }).catch(fail).then(done);
        });

        function setLanguagePreference(language) {
          player.configure({preferredAudioLanguage: language});
        }
      });  // describe('language matching')
    });  // describe('default track selection callback')

    describe('temporary license', function() {
      /** @type {shaka.extern.DrmInfo} */
      let drmInfo;

      beforeEach(function() {
        drmInfo = {
          keySystem: 'com.example.abc',
          licenseServerUri: 'http://example.com',
          persistentStateRequired: false,
          distinctiveIdentifierRequired: false,
          keyIds: [],
          initData: null,
          serverCertificate: null,
          audioRobustness: 'HARDY',
          videoRobustness: 'OTHER'
        };
        drmEngine.setDrmInfo(drmInfo);
        drmEngine.setSessionIds(['abcd']);
        storage.configure({usePersistentLicense: false});
      });

      it('does not store offline sessions', function(done) {
        let expectedUri = shaka.offline.OfflineUri.manifest(
            'mechanism', 'cell', 0);
        storage.store(fakeManifestUri)
            .then(function(data) {
              expect(data.offlineUri).toBe(expectedUri.toString());
              return fakeStorageEngine.getManifest(0);
            })
            .then(function(manifestDb) {
              expect(manifestDb).toBeTruthy();
              expect(manifestDb.drmInfo).toEqual(drmInfo);
              expect(manifestDb.sessionIds.length).toEqual(0);
            })
            .catch(fail)
            .then(done);
      });
    }); // describe('temporary license')
  });  // describe('store')

  describe('remove', function() {
    it('will delete everything', function(done) {
      goog.asserts.assert(
          fakeStorageEngine,
          'Need storage engine for this test.');
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .period()
              .stream()
                  .segment(0, 2)
                  .segment(2, 4)
                  .segment(4, 6)
                  .segment(6, 8)
          .build()
          .then(function(manifestId) {
            expectDatabaseCount(1, 4);
            return removeManifest(manifestId);
          }).then(function() {
            expectDatabaseCount(0, 0);
          }).catch(fail).then(done);
    });

    it('will delete init segments', function(done) {
      goog.asserts.assert(
          fakeStorageEngine,
          'Need storage engine for this test.');
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .period()
              .stream()
                  .initSegment()
                  .segment(0, 2)
                  .segment(2, 4)
                  .segment(4, 6)
                  .segment(6, 8)
          .build()
          .then(function(manifestId) {
            expectDatabaseCount(1, 5);
            return removeManifest(manifestId);
          }).then(function() {
            expectDatabaseCount(0, 0);
          }).catch(fail).then(done);
    });

    it('will delete multiple streams', function(done) {
      goog.asserts.assert(
          fakeStorageEngine,
          'Need storage engine for this test.');
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .period()
              .stream()
                  .segment(0, 2)
                  .segment(2, 4)
                  .segment(4, 6)
                  .segment(6, 8)
              .stream()
                  .segment(0, 2)
                  .segment(2, 4)
                  .segment(4, 6)
                  .segment(6, 8)
          .build()
          .then(function(manifestId) {
            expectDatabaseCount(1, 8);
            return removeManifest(manifestId);
          }).then(function() {
            expectDatabaseCount(0, 0);
          }).catch(fail).then(done);
    });

    it('will delete multiple periods', function(done) {
      goog.asserts.assert(
          fakeStorageEngine,
          'Need storage engine for this test.');
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .period()
              .stream()
                  .segment(0, 2)
                  .segment(2, 4)
                  .segment(4, 6)
                  .segment(6, 8)
          .period()
              .stream()
                  .segment(0, 2)
                  .segment(2, 4)
                  .segment(4, 6)
                  .segment(6, 8)
          .build()
          .then(function(manifestId) {
            expectDatabaseCount(1, 8);
            return removeManifest(manifestId);
          }).then(function() {
            expectDatabaseCount(0, 0);
          }).catch(fail).then(done);
    });

    it('will delete content with a temporary license', function(done) {
      storage.configure({usePersistentLicense: false});

      goog.asserts.assert(
          fakeStorageEngine,
          'Need storage engine for this test.');
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .period()
              .stream()
                  .segment(0, 2)
                  .segment(2, 4)
                  .segment(4, 6)
                  .segment(6, 8)
          .build()
          .then(function(manifestId) {
            expectDatabaseCount(1, 4);
            return removeManifest(manifestId);
          }).then(function() {
            expectDatabaseCount(0, 0);
          }).catch(fail).then(done);
    });

    it('will not delete other manifest\'s segments', function(done) {
      goog.asserts.assert(
          fakeStorageEngine,
          'Need storage engine for this test.');

      let manifestId1;
      let manifestId2;

      let manifest2;

      Promise.all([
        new shaka.test.ManifestDBBuilder(fakeStorageEngine)
            .period()
                .stream()
                    .segment(0, 2)
                    .segment(2, 4)
                    .segment(4, 6)
                    .segment(6, 8)
            .build(),
        new shaka.test.ManifestDBBuilder(fakeStorageEngine)
            .period()
                .stream()
                    .segment(0, 2)
                    .segment(2, 4)
                    .segment(4, 6)
                    .segment(6, 8)
            .build()
      ]).then(function(manifestsIds) {
        manifestId1 = manifestsIds[0];
        manifestId2 = manifestsIds[1];

        expectDatabaseCount(2, 8);
        return removeManifest(manifestId1);
      }).then(function() {
        expectDatabaseCount(1, 4);
        return fakeStorageEngine.getManifest(manifestId2);
      }).then(function(manifest) {
        manifest2 = manifest;
        return loadSegmentsForStream(manifest2.periods[0].streams[0]);
      }).then(function(segments) {
        // Make sure all the segments for the second manifest are still
        // in storage.
        let stream = manifest2.periods[0].streams[0];
        expect(segments.length).toBe(stream.segments.length);
        segments.forEach(function(segment) {
          expect(segment).toBeTruthy();
        });
      }).catch(fail).then(done);
    });

    it('will not raise error on missing segments', function(done) {
      goog.asserts.assert(
          fakeStorageEngine,
          'Need storage engine for this test.');
      new shaka.test.ManifestDBBuilder(fakeStorageEngine)
          .period()
              .stream()
                  .segment(0, 2)
                  .segment(2, 4)
                  .segment(4, 6)
                  .segment(6, 8)
              .onStream(function(stream) {
                // Change the key for one segment so that it will be missing
                // from storage.
                let segment = stream.segments[0];
                segment.dataKey = 1253;
              })
          .build()
          .then(function(manifestId) {
            expectDatabaseCount(1, 4);
            return removeManifest(manifestId);
          }).then(function() {
            // The segment that was changed above was not deleted.
            expectDatabaseCount(0, 1);
          }).catch(fail).then(done);
    });

    it('throws an error if the URI is malformed', function(done) {
      let bogusUri = 'foo:bar';
      storage.remove(bogusUri).then(fail).catch(function(error) {
        let expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
            'foo:bar');
        shaka.test.Util.expectToEqualError(error, expectedError);
      }).then(done);
    });

    it('raises not found error', function(done) {
      let uri = shaka.offline.OfflineUri.manifest('mechanism', 'cell', 0);

      storage.remove(uri.toString())
          .then(fail)
          .catch(function(e) {
            shaka.test.Util.expectToEqualError(
                e,
                new shaka.util.Error(
                    shaka.util.Error.Severity.CRITICAL,
                    shaka.util.Error.Category.STORAGE,
                    shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
                    uri.toString()));
          })
          .then(done);
    });

    /**
     * @param {number} manifestCount
     * @param {number} segmentCount
     */
    function expectDatabaseCount(manifestCount, segmentCount) {
      let count;

      count = 0;
      fakeStorageEngine.forEachManifest(function(manifest) {
        count++;
      });
      expect(count).toBe(manifestCount);

      count = 0;
      fakeStorageEngine.forEachSegment(function(segment) {
        count++;
      });
      expect(count).toBe(segmentCount);
    }

    /**
     * @param {number} manifestId
     * @return {!Promise}
     */
    function removeManifest(manifestId) {
      /** @type {string} */
      let uri = OfflineUri.manifest('mechanism', 'cell', manifestId).toString();
      return storage.remove(uri);
    }

    /**
     * @param {!shaka.extern.StreamDB} stream
     * @return {!Promise<!Array<shaka.extern.SegmentDataDB>>}
     */
    function loadSegmentsForStream(stream) {
      return Promise.all(stream.segments.map(function(segment) {
        /** @type {number} */
        let id = segment.dataKey;
        return fakeStorageEngine.getSegment(id);
      }));
    }
  });  // describe('remove')

  function makeUris(uri) {
    return function() { return [uri]; };
  }
});
