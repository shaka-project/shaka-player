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
  var originalSupportsStorageEngine;
  var originalCreateStorageEngine;
  var SegmentReference;
  var fakeStorageEngine;
  var storage;
  var player;
  var netEngine;

  beforeAll(function() {
    SegmentReference = shaka.media.SegmentReference;
    originalSupportsStorageEngine =
        shaka.offline.OfflineUtils.supportsStorageEngine;
    originalCreateStorageEngine =
        shaka.offline.OfflineUtils.createStorageEngine;
  });

  afterAll(function() {
    shaka.offline.OfflineUtils.supportsStorageEngine =
        originalSupportsStorageEngine;
    shaka.offline.OfflineUtils.createStorageEngine =
        originalCreateStorageEngine;
  });

  beforeEach(function(done) {
    shaka.offline.OfflineUtils.supportsStorageEngine = function() {
      return true;
    };

    fakeStorageEngine = new shaka.test.MemoryDBEngine();

    shaka.offline.OfflineUtils.createStorageEngine = function() {
      return fakeStorageEngine;
    };

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

    fakeStorageEngine.init(shaka.offline.OfflineUtils.DB_SCHEME)
        .catch(fail)
        .then(done);
  });

  afterEach(function(done) {
    storage.destroy().catch(fail).then(done);
  });

  it('lists stored manifests', function(done) {
    var ContentType = shaka.util.ManifestParserUtils.ContentType;
    var manifestDb1 = {
      key: 0,
      originalManifestUri: 'fake:foobar',
      duration: 1337,
      size: 65536,
      periods: [{
        streams: [
          {
            id: 0,
            contentType: ContentType.VIDEO,
            kind: undefined,
            language: '',
            width: 1920,
            height: 1080,
            frameRate: 24,
            mimeType: 'video/mp4',
            codecs: 'avc1.4d401f',
            primary: false,
            segments: []
          },
          {
            id: 1,
            contentType: ContentType.AUDIO,
            kind: undefined,
            language: 'en',
            width: null,
            height: null,
            frameRate: undefined,
            mimeType: 'audio/mp4',
            codecs: 'vorbis',
            primary: true,
            segments: []
          }
        ]
      }],
      appMetadata: {
        foo: 'bar',
        drm: 'yes',
        theAnswerToEverything: 42
      }
    };
    var manifestDb2 = {
      key: 1,
      originalManifestUri: 'fake:another',
      duration: 4181,
      size: 6765,
      periods: [{streams: []}],
      appMetadata: {
        something: 'else'
      }
    };
    var manifestDbs = [manifestDb1, manifestDb2];
    var expectedTracks = [
      {
        id: 0,
        active: false,
        type: 'variant',
        bandwidth: 0,
        language: 'en',
        kind: null,
        width: 1920,
        height: 1080,
        frameRate: 24,
        mimeType: 'video/mp4',
        primary: true,
        codecs: 'avc1.4d401f, vorbis'
      }
    ];
    Promise
        .all([
          fakeStorageEngine.insert('manifest', manifestDb1),
          fakeStorageEngine.insert('manifest', manifestDb2)
        ])
        .then(function() {
          return storage.list();
        })
        .then(function(data) {
          expect(data).toBeTruthy();
          expect(data.length).toBe(2);
          for (var i = 0; i < 2; i++) {
            expect(data[i].offlineUri).toBe('offline:' + manifestDbs[i].key);
            expect(data[i].originalManifestUri)
                .toBe(manifestDbs[i].originalManifestUri);
            expect(data[i].duration).toBe(manifestDbs[i].duration);
            expect(data[i].size).toBe(manifestDbs[i].size);
            expect(data[i].appMetadata).toEqual(manifestDbs[i].appMetadata);
          }
          expect(data[0].tracks).toEqual(expectedTracks);
          expect(data[1].tracks).toEqual([]);
        })
        .catch(fail)
        .then(done);
  });

  describe('store', function() {
    var originalWarning;
    var manifest;
    var tracks;
    var drmEngine;
    var stream1Index;
    var stream2Index;

    beforeAll(function() {
      originalWarning = shaka.log.warning;
    });

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
      var getVariantTracks = shaka.util.StreamUtils.getVariantTracks;
      tracks = getVariantTracks(manifest.periods[0], null, null);
      // The expected tracks we get back from the stored version of the content
      // will have 0 for bandwidth, so adjust the tracks list to match.
      tracks.forEach(function(t) { t.bandwidth = 0; });

      storage.loadInternal = function() {
        return Promise.resolve({
          manifest: manifest,
          drmEngine: drmEngine
        });
      };

      player.configure({preferredAudioLanguage: 'en'});

      stream1Index = new shaka.media.SegmentIndex([]);
      stream2Index = new shaka.media.SegmentIndex([]);

      var stream1 = manifest.periods[0].variants[0].audio;
      stream1.findSegmentPosition = stream1Index.find.bind(stream1Index);
      stream1.getSegmentReference = stream1Index.get.bind(stream1Index);

      var stream2 = manifest.periods[0].variants[0].video;
      stream2.findSegmentPosition = stream2Index.find.bind(stream2Index);
      stream2.getSegmentReference = stream2Index.get.bind(stream2Index);
    });

    afterEach(function() {
      shaka.log.warning = originalWarning;
    });

    it('stores basic manifests', function(done) {
      var originalUri = 'fake://foobar';
      var appData = {tools: ['Google', 'StackOverflow'], volume: 11};
      storage.store(originalUri, appData)
          .then(function(data) {
            expect(data).toBeTruthy();
            // Since we are using a memory DB, it will always be the first one.
            expect(data.offlineUri).toBe('offline:0');
            expect(data.originalManifestUri).toBe(originalUri);
            expect(data.duration).toBe(0);  // There are no segments.
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

      var warning = jasmine.createSpy('shaka.log.warning');
      shaka.log.warning = warning;
      storage.store('')
          .then(function(data) {
            expect(data).toBeTruthy();
            expect(warning).toHaveBeenCalled();
          })
          .catch(fail)
          .then(done);
    });

    it('only stores the tracks chosen', function(done) {
      manifest = new shaka.test.ManifestGenerator()
          .setPresentationDuration(20)
          .addPeriod(0)
            .addVariant(0)
              .addVideo(1)
            .addVariant(2)
              .addVideo(3)
          .build();

      // Store the first variant.
      storage.configure({
        trackSelectionCallback: function(tracks) {
          return tracks.slice(0, 1);
        }
      });

      storage.store('')
          .then(function(data) {
            expect(data.offlineUri).toBe('offline:0');
            return fakeStorageEngine.get('manifest', 0);
          })
          .then(function(manifestDb) {
            expect(manifestDb).toBeTruthy();
            expect(manifestDb.periods.length).toBe(1);
            expect(manifestDb.periods[0].streams.length).toBe(1);
          })
          .catch(fail)
          .then(done);
    });

    it('stores offline sessions', function(done) {
      var sessions = ['lorem', 'ipsum'];
      drmEngine.setSessionIds(sessions);
      storage.store('')
          .then(function(data) {
            expect(data.offlineUri).toBe('offline:0');
            return fakeStorageEngine.get('manifest', 0);
          })
          .then(function(manifestDb) {
            expect(manifestDb).toBeTruthy();
            expect(manifestDb.sessionIds).toEqual(sessions);
          })
          .catch(fail)
          .then(done);
    });

    it('stores DRM info', function(done) {
      var drmInfo = {
        keySystem: 'com.example.abc',
        licenseServerUri: 'http://example.com',
        persistentStateRequire: true,
        audioRobustness: 'HARDY'
      };
      drmEngine.setDrmInfo(drmInfo);
      drmEngine.setSessionIds(['abcd']);
      storage.store('')
          .then(function(data) {
            expect(data.offlineUri).toBe('offline:0');
            return fakeStorageEngine.get('manifest', 0);
          })
          .then(function(manifestDb) {
            expect(manifestDb).toBeTruthy();
            expect(manifestDb.drmInfo).toEqual(drmInfo);
          })
          .catch(fail)
          .then(done);
    });

    it('stores expiration', function(done) {
      drmEngine.setSessionIds(['abcd']);
      drmEngine.getExpiration.and.returnValue(1234);

      storage.store('')
          .then(function(data) {
            expect(data.offlineUri).toBe('offline:0');
            return fakeStorageEngine.get('manifest', 0);
          })
          .then(function(manifestDb) {
            expect(manifestDb).toBeTruthy();
            expect(manifestDb.expiration).toBe(1234);
          })
          .catch(fail)
          .then(done);
    });

    it('throws an error if another store is in progress', function(done) {
      var p1 = storage.store('', {}).catch(fail);
      var p2 = storage.store('', {}).then(fail).catch(function(error) {
        var expectedError = new shaka.util.Error(
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

      storage.store('', {}).then(fail).catch(function(error) {
        var expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.CANNOT_STORE_LIVE_OFFLINE,
            '');
        shaka.test.Util.expectToEqualError(error, expectedError);
      }).then(done);
    });

    it('throws an error if DRM sessions are not ready', function(done) {
      var drmInfo = {
        keySystem: 'com.example.abc',
        licenseServerUri: 'http://example.com',
        persistentStateRequire: true,
        audioRobustness: 'HARDY'
      };
      drmEngine.setDrmInfo(drmInfo);
      drmEngine.setSessionIds([]);
      storage.store('', {}).then(fail).catch(function(error) {
        var expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.NO_INIT_DATA_FOR_OFFLINE,
            '');
        shaka.test.Util.expectToEqualError(error, expectedError);
      }).then(done);
    });

    it('throws an error if storage is not supported', function(done) {
      fakeStorageEngine = null;
      // Recreate Storage object so null fakeStorageEngine takes effect.
      storage = new shaka.offline.Storage(player);
      storage.store('', {}).then(fail).catch(function(error) {
        var expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.STORAGE_NOT_SUPPORTED);
        shaka.test.Util.expectToEqualError(error, expectedError);
      }).then(done);
    });

    it('throws an error if destroyed mid-store', function(done) {
      var p1 = storage.store('', {}).then(fail).catch(function(error) {
        var expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.OPERATION_ABORTED);
        shaka.test.Util.expectToEqualError(error, expectedError);
      });
      var p2 = storage.destroy();
      Promise.all([p1, p2]).catch(fail).then(done);
    });

    describe('reports progress', function() {
      it('when byte ranges given', function(done) {
        netEngine.setResponseMap({
          'fake:0': new ArrayBuffer(54),
          'fake:1': new ArrayBuffer(13),
          'fake:2': new ArrayBuffer(66),
          'fake:3': new ArrayBuffer(17)
        });

        stream1Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:0'), 0, 53),
          new SegmentReference(1, 1, 2, makeUris('fake:1'), 31, 43),
          new SegmentReference(2, 2, 3, makeUris('fake:2'), 291, 356),
          new SegmentReference(3, 3, 4, makeUris('fake:3'), 11, 27)
        ]);

        var originalUri = 'fake:123';
        var progress = jasmine.createSpy('onProgress');
        progress.and.callFake(function(storedContent, percent) {
          expect(storedContent).toEqual({
            offlineUri: 'offline:0',
            originalManifestUri: originalUri,
            duration: 4,
            size: 150,
            expiration: Infinity,
            tracks: tracks,
            appMetadata: undefined
          });

          switch (progress.calls.count()) {
            case 1:
              expect(percent).toBeCloseTo(54 / 150);
              break;
            case 2:
              expect(percent).toBeCloseTo(67 / 150);
              break;
            case 3:
              expect(percent).toBeCloseTo(133 / 150);
              break;
            default:
              expect(percent).toBeCloseTo(1);
              break;
          }
        });

        storage.configure({progressCallback: progress});
        storage.store(originalUri)
            .then(function() {
              expect(progress.calls.count()).toBe(4);
            })
            .catch(fail)
            .then(done);
      });

      it('approximates when byte range not given', function(done) {
        netEngine.setResponseMap({
          'fake:0': new ArrayBuffer(54),
          'fake:1': new ArrayBuffer(13),
          'fake:2': new ArrayBuffer(66),
          'fake:3': new ArrayBuffer(17)
        });

        stream1Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:0'), 0, 53),
          // Estimate: 10
          new SegmentReference(1, 1, 2, makeUris('fake:1'), 0, null),
          // Estimate: 20
          new SegmentReference(2, 2, 4, makeUris('fake:2'), 0, null),
          new SegmentReference(3, 4, 5, makeUris('fake:3'), 11, 27)
        ]);

        var originalUri = 'fake:123';
        var progress = jasmine.createSpy('onProgress');
        progress.and.callFake(function(storedContent, percent) {
          expect(storedContent).toEqual({
            offlineUri: 'offline:0',
            originalManifestUri: originalUri,
            duration: 5,
            size: jasmine.any(Number),
            expiration: Infinity,
            tracks: tracks,
            appMetadata: undefined
          });

          switch (progress.calls.count()) {
            case 1:
              expect(percent).toBeCloseTo(54 / 101);
              expect(storedContent.size).toBe(71);
              break;
            case 2:
              expect(percent).toBeCloseTo(64 / 101);
              expect(storedContent.size).toBe(84);
              break;
            case 3:
              expect(percent).toBeCloseTo(84 / 101);
              expect(storedContent.size).toBe(150);
              break;
            default:
              expect(percent).toBeCloseTo(1);
              expect(storedContent.size).toBe(150);
              break;
          }
        });

        storage.configure({progressCallback: progress});
        storage.store(originalUri)
            .then(function() {
              expect(progress.calls.count()).toBe(4);
            })
            .catch(fail)
            .then(done);
      });
    });  // describe('reports progress')

    describe('segments', function() {
      it('stores media segments', function(done) {
        netEngine.setResponseMap({
          'fake:0': new ArrayBuffer(5),
          'fake:1': new ArrayBuffer(7)
        });

        stream1Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:0'), 0, null),
          new SegmentReference(1, 1, 2, makeUris('fake:0'), 0, null),
          new SegmentReference(2, 2, 3, makeUris('fake:1'), 0, null),
          new SegmentReference(3, 3, 4, makeUris('fake:0'), 0, null),
          new SegmentReference(4, 4, 5, makeUris('fake:1'), 0, null)
        ]);
        stream2Index.merge([
          new SegmentReference(0, 0, 1, makeUris('fake:0'), 0, null)
        ]);

        storage.store('')
            .then(function(manifest) {
              expect(manifest).toBeTruthy();
              expect(manifest.size).toBe(34);
              expect(manifest.duration).toBe(5);
              expect(netEngine.request.calls.count()).toBe(6);
              return fakeStorageEngine.get('manifest', 0);
            })
            .then(function(manifest) {
              var stream1 = manifest.periods[0].streams[0];
              expect(stream1.initSegmentUri).toBe(null);
              expect(stream1.segments.length).toBe(5);
              expect(stream1.segments[0])
                  .toEqual({startTime: 0, endTime: 1, uri: 'offline:0/2/0'});
              expect(stream1.segments[3])
                  .toEqual({startTime: 3, endTime: 4, uri: 'offline:0/2/3'});

              var stream2 = manifest.periods[0].streams[1];
              expect(stream2.initSegmentUri).toBe(null);
              expect(stream2.segments.length).toBe(1);
              expect(stream2.segments[0])
                  .toEqual({startTime: 0, endTime: 1, uri: 'offline:0/1/5'});
              return fakeStorageEngine.get('segment', 3);
            })
            .then(function(segment) {
              expect(segment).toBeTruthy();
              expect(segment.data).toBeTruthy();
              expect(segment.data.byteLength).toBe(5);
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
        var req1 = netEngine.delayNextRequest();

        storage.store('')
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
        netEngine.setResponseMap({'fake:0': new ArrayBuffer(5)});

        var stream = manifest.periods[0].variants[0].audio;
        stream.initSegmentReference =
            new shaka.media.InitSegmentReference(makeUris('fake:0'), 0, null);

        storage.store('')
            .then(function(manifest) {
              expect(manifest).toBeTruthy();
              expect(manifest.size).toBe(5);
              expect(manifest.duration).toBe(0);
              expect(netEngine.request.calls.count()).toBe(1);
              return fakeStorageEngine.get('manifest', 0);
            })
            .then(function(manifest) {
              var stream = manifest.periods[0].streams[0];
              expect(stream.segments.length).toBe(0);
              expect(stream.initSegmentUri).toBe('offline:0/2/0');
              return fakeStorageEngine.get('segment', 0);
            })
            .then(function(segment) {
              expect(segment).toBeTruthy();
              expect(segment.data).toBeTruthy();
              expect(segment.data.byteLength).toBe(5);
            })
            .catch(fail)
            .then(done);
      });

      it('with non-0 start time', function(done) {
        netEngine.setResponseMap({'fake:0': new ArrayBuffer(5)});

        var refs = [
          new SegmentReference(0, 10, 11, makeUris('fake:0'), 0, null),
          new SegmentReference(1, 11, 12, makeUris('fake:0'), 0, null),
          new SegmentReference(2, 12, 13, makeUris('fake:0'), 0, null)
        ];
        stream1Index.merge(refs);
        manifest.presentationTimeline.notifySegments(0, refs);

        storage.store('')
            .then(function(manifest) {
              expect(manifest).toBeTruthy();
              expect(manifest.size).toBe(15);
              expect(manifest.duration).toBe(13);
              expect(netEngine.request.calls.count()).toBe(3);
              return fakeStorageEngine.get('manifest', 0);
            })
            .then(function(manifest) {
              var stream = manifest.periods[0].streams[0];
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

        var delay = netEngine.delayNextRequest();
        var expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.HTTP_ERROR);
        delay.reject(expectedError);
        storage.store('')
            .then(fail, function(error) {
              shaka.test.Util.expectToEqualError(error, expectedError);
            })
            .catch(fail)
            .then(done);
      });
    });  // describe('segments')

    describe('default track selection callback', function() {
      var allTextTracks;

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
          return Promise.resolve({
            manifest: manifest,
            drmEngine: drmEngine
          });
        };

        // Use the default track selection callback.
        storage.configure({ trackSelectionCallback: undefined });
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

      it('stores the best audio language match', function(done) {
        /**
         * @param {string} preferredLanguage
         * @param {string} expectedLanguage
         * @return {!Promise}
         */
        function testAudioMatch(preferredLanguage, expectedLanguage) {
          player.configure({preferredAudioLanguage: preferredLanguage});
          return storage.store('').then(function(data) {
            var variantTracks = getVariants(data);
            expect(variantTracks.length).toBe(1);
            expect(variantTracks[0].language).toEqual(expectedLanguage);
          });
        }

        var warning = jasmine.createSpy('shaka.log.warning');
        shaka.log.warning = warning;

        // An exact match is available for en-US, en-GB, and en.
        // Test all three to show that we are not just choosing the first loose
        // match, but rather always choosing the best available match.
        testAudioMatch('en-US', 'en-US').then(function() {
          return testAudioMatch('en-GB', 'en-GB');
        }).then(function() {
          return testAudioMatch('en', 'en');
        }).then(function() {
          // The best match for en-AU is a matching base language, en.
          return testAudioMatch('en-AU', 'en');
        }).then(function() {
          // The best match for fr-FR is another related sub-language, fr-CA.
          return testAudioMatch('fr-FR', 'fr-CA');
        }).then(function() {
          // When there is no related match at all, we choose the primary, es.
          return testAudioMatch('zh', 'es');
        }).then(function() {
          // Set the primary flags to false.
          manifest.periods[0].variants.forEach(function(variant) {
            variant.primary = false;
            if (variant.audio)
              variant.audio.primary = false;
          });
          // When there is no related match at all, and no primary, we issue a
          // warning, and we only store one track.
          warning.calls.reset();
          return storage.store('');
        }).then(function(data) {
          var variantTracks = getVariants(data);
          expect(variantTracks.length).toBe(1);
          expect(warning).toHaveBeenCalled();
        }).catch(fail).then(done);
      });

      it('stores the largest SD video track, middle audio', function(done) {
        // This language will select variants with multiple video resolutions.
        player.configure({preferredAudioLanguage: 'sw'});
        storage.store('').then(function(data) {
          var variantTracks = getVariants(data);
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
        storage.store('').then(function(data) {
          var textTracks = getText(data);
          expect(textTracks.length).toBe(allTextTracks.length);
          expect(textTracks).toEqual(jasmine.arrayContaining(allTextTracks));
        }).catch(fail).then(done);
      });
    });  // describe('default track selection callback')
  });  // describe('store')

  describe('remove', function() {
    var segmentId;

    beforeEach(function() {
      segmentId = 0;
    });

    it('will delete everything', function(done) {
      var manifestId = 0;
      createAndInsertSegments(manifestId, 5)
          .then(function(refs) {
            var manifest = createManifest(manifestId);
            manifest.periods[0].streams.push({segments: refs});
            return fakeStorageEngine.insert('manifest', manifest);
          })
          .then(function() {
            expectDatabaseCount(1, 5);
            return removeManifest(manifestId);
          })
          .then(function() { expectDatabaseCount(0, 0); })
          .catch(fail)
          .then(done);
    });

    it('will delete init segments', function(done) {
      var manifestId = 1;
      Promise
          .all([
            createAndInsertSegments(manifestId, 5),
            createAndInsertSegments(manifestId, 1)
          ])
          .then(function(data) {
            var manifest = createManifest(manifestId);
            manifest.periods[0].streams.push(
                {initSegmentUri: data[1][0].uri, segments: data[0]});
            return fakeStorageEngine.insert('manifest', manifest);
          })
          .then(function() {
            expectDatabaseCount(1, 6);
            return removeManifest(manifestId);
          })
          .then(function() { expectDatabaseCount(0, 0); })
          .catch(fail)
          .then(done);
    });

    it('will delete multiple streams', function(done) {
      var manifestId = 1;
      Promise
          .all([
            createAndInsertSegments(manifestId, 5),
            createAndInsertSegments(manifestId, 3)
          ])
          .then(function(data) {
            var manifest = createManifest(manifestId);
            manifest.periods[0].streams.push({segments: data[0]});
            manifest.periods[0].streams.push({segments: data[1]});
            return fakeStorageEngine.insert('manifest', manifest);
          })
          .then(function() {
            expectDatabaseCount(1, 8);
            return removeManifest(manifestId);
          })
          .then(function() { expectDatabaseCount(0, 0); })
          .catch(fail)
          .then(done);
    });

    it('will delete multiple periods', function(done) {
      var manifestId = 1;
      Promise
          .all([
            createAndInsertSegments(manifestId, 5),
            createAndInsertSegments(manifestId, 3)
          ])
          .then(function(data) {
            var manifest = createManifest(manifestId);
            manifest.periods = [
              {streams: [{segments: data[0]}]},
              {streams: [{segments: data[1]}]}
            ];
            return fakeStorageEngine.insert('manifest', manifest);
          })
          .then(function() {
            expectDatabaseCount(1, 8);
            return removeManifest(manifestId);
          })
          .then(function() { expectDatabaseCount(0, 0); })
          .catch(fail)
          .then(done);
    });

    it('will not delete other manifest\'s segments', function(done) {
      var manifestId1 = 1;
      var manifestId2 = 2;
      Promise
          .all([
            createAndInsertSegments(manifestId1, 5),
            createAndInsertSegments(manifestId2, 3)
          ])
          .then(function(data) {
            var manifest1 = createManifest(manifestId1);
            manifest1.periods[0].streams.push({segments: data[0]});
            var manifest2 = createManifest(manifestId2);
            manifest2.periods[0].streams.push({segments: data[1]});
            return Promise.all([
              fakeStorageEngine.insert('manifest', manifest1),
              fakeStorageEngine.insert('manifest', manifest2)
            ]);
          })
          .then(function() {
            expectDatabaseCount(2, 8);
            return removeManifest(manifestId1);
          })
          .then(function() {
            expectDatabaseCount(1, 3);
            return fakeStorageEngine.get('segment', segmentId - 1);
          })
          .then(function(segment) { expect(segment).toBeTruthy(); })
          .catch(fail)
          .then(done);
    });

    it('will not raise error on missing segments', function(done) {
      var manifestId = 1;
      createAndInsertSegments(manifestId, 5)
          .then(function(data) {
            var manifest = createManifest(manifestId);
            data[0].uri = 'offline:0/0/1253';
            manifest.periods[0].streams.push({segments: data});
            return fakeStorageEngine.insert('manifest', manifest);
          })
          .then(function() {
            expectDatabaseCount(1, 5);
            return removeManifest(manifestId);
          })
          .then(function() {
            // The segment that was changed above was not deleted.
            expectDatabaseCount(0, 1);
          })
          .catch(fail)
          .then(done);
    });

    it('throws an error if the content is not found', function(done) {
      removeManifest(0).then(fail).catch(function(error) {
        var expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
            'offline:0');
        shaka.test.Util.expectToEqualError(error, expectedError);
      }).then(done);
    });

    it('throws an error if the URI is malformed', function(done) {
      var bogusContent = {offlineUri: 'foo:bar'};
      storage.remove(bogusContent).then(fail).catch(function(error) {
        var expectedError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.STORAGE,
            shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
            'foo:bar');
        shaka.test.Util.expectToEqualError(error, expectedError);
      }).then(done);
    });

    it('raises not found error', function(done) {
      removeManifest(0)
          .then(fail)
          .catch(function(e) {
            shaka.test.Util.expectToEqualError(
                e,
                new shaka.util.Error(
                    shaka.util.Error.Severity.CRITICAL,
                    shaka.util.Error.Category.STORAGE,
                    shaka.util.Error.Code.REQUESTED_ITEM_NOT_FOUND,
                    'offline:0'));
          })
          .then(done);
    });

    /**
     * @param {number} manifestCount
     * @param {number} segmentCount
     */
    function expectDatabaseCount(manifestCount, segmentCount) {
      var manifests = fakeStorageEngine.getAllData('manifest');
      expect(Object.keys(manifests).length).toBe(manifestCount);
      var segments = fakeStorageEngine.getAllData('segment');
      expect(Object.keys(segments).length).toBe(segmentCount);
    }

    /**
     * @param {number} manifestId
     * @return {!Promise}
     */
    function removeManifest(manifestId) {
      return storage.remove({offlineUri: 'offline:' + manifestId});
    }

    function createManifest(manifestId) {
      return {
        key: manifestId,
        periods: [{streams: []}],
        sessionIds: [],
        duration: 10
      };
    }

    /**
     * @param {number} manifestId
     * @param {number} count
     * @return {!Promise.<!Array.<shakaExtern.SegmentDB>>}
     */
    function createAndInsertSegments(manifestId, count) {
      var ret = new Array(count);
      for (var i = 0; i < count; i++) {
        ret[i] = {key: segmentId++};
      }
      return Promise.all(ret.map(function(segment) {
        return fakeStorageEngine.insert('segment', segment);
      })).then(function() {
        return ret.map(function(segment, i) {
          return {
            uri: 'offline:' + manifestId + '/0/' + segment.key,
            startTime: i,
            endTime: (i + 1)
          };
        });
      });
    }
  });  // describe('remove')

  function makeUris(uri) {
    return function() { return [uri]; };
  }
});
