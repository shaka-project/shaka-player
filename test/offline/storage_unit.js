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
  var SegmentReference;
  var fakeDbEngine;
  var storage;
  var player;
  var netEngine;

  beforeEach(function(done) {
    SegmentReference = shaka.media.SegmentReference;
    fakeDbEngine = new shaka.test.MemoryDBEngine();
    netEngine = new shaka.test.FakeNetworkingEngine();

    // Use a real Player since Storage only uses the configuration and
    // networking engine.  This allows us to use Player.configure in these
    // tests.
    player = new shaka.Player(createMockVideo(), function(player) {
      player.createNetworkingEngine = function() {
        return netEngine;
      };
    });

    storage = new shaka.offline.Storage(player);
    storage.setDbEngine(fakeDbEngine);

    fakeDbEngine.init(shaka.offline.OfflineUtils.DB_SCHEME)
        .catch(fail)
        .then(done);
  });

  afterEach(function(done) {
    storage.destroy().catch(fail).then(done);
  });

  it('lists stored manifests', function(done) {
    var manifestDb1 = {
      key: 0,
      originalManifestUri: 'fake:foobar',
      duration: 1337,
      size: 65536,
      periods: [{
        streams: [
          {
            id: 0,
            contentType: 'video',
            kind: undefined,
            language: '',
            width: 1920,
            height: 1080,
            frameRate: 24,
            codecs: 'avc1.4d401f'
          },
          {
            id: 1,
            contentType: 'audio',
            kind: undefined,
            language: 'en',
            width: null,
            height: null,
            frameRate: undefined,
            codecs: 'vorbis'
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
        type: 'video',
        bandwidth: 0,
        language: '',
        kind: null,
        width: 1920,
        height: 1080,
        frameRate: 24,
        codecs: 'avc1.4d401f'
      },
      {
        id: 1,
        active: false,
        type: 'audio',
        bandwidth: 0,
        language: 'en',
        kind: null,
        width: null,
        height: null,
        frameRate: undefined,
        codecs: 'vorbis'
      }
    ];
    Promise
        .all([
          fakeDbEngine.insert('manifest', manifestDb1),
          fakeDbEngine.insert('manifest', manifestDb2)
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
            .addStreamSet('video')
              .addStream(0).size(100, 200).bandwidth(80)
            .addStreamSet('audio')
              .language('en')
              .addStream(1).bandwidth(80)
          .build();
      // Get the original tracks from the manifest.
      var getTracks = shaka.util.StreamUtils.getTracks;
      tracks = getTracks(manifest.periods[0], {});
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

      var stream1 = manifest.periods[0].streamSets[0].streams[0];
      stream1.findSegmentPosition = stream1Index.find.bind(stream1Index);
      stream1.getSegmentReference = stream1Index.get.bind(stream1Index);

      var stream2 = manifest.periods[0].streamSets[1].streams[0];
      stream2.findSegmentPosition = stream2Index.find.bind(stream2Index);
      stream2.getSegmentReference = stream2Index.get.bind(stream2Index);
    });

    afterAll(function() {
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
            .addStreamSet('audio')
              .language('en')
              .addStream(0).bandwidth(80)
            .addStreamSet('audio')
              .language('en')
              .addStream(1).bandwidth(160)
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

    it('stores offline sessions', function(done) {
      var sessions = ['lorem', 'ipsum'];
      drmEngine.setSessionIds(sessions);
      storage.store('')
          .then(function(data) {
            expect(data.offlineUri).toBe('offline:0');
            return fakeDbEngine.get('manifest', 0);
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
            return fakeDbEngine.get('manifest', 0);
          })
          .then(function(manifestDb) {
            expect(manifestDb).toBeTruthy();
            expect(manifestDb.drmInfo).toEqual(drmInfo);
          })
          .catch(fail)
          .then(done);
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
    });

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
              return fakeDbEngine.get('manifest', 0);
            })
            .then(function(manifest) {
              var stream1 = manifest.periods[0].streams[0];
              expect(stream1.initSegmentUri).toBe(null);
              expect(stream1.segments.length).toBe(5);
              expect(stream1.segments[0])
                  .toEqual({startTime: 0, endTime: 1, uri: 'offline:0/0/0'});
              expect(stream1.segments[3])
                  .toEqual({startTime: 3, endTime: 4, uri: 'offline:0/0/3'});

              var stream2 = manifest.periods[0].streams[1];
              expect(stream2.initSegmentUri).toBe(null);
              expect(stream2.segments.length).toBe(1);
              expect(stream2.segments[0])
                  .toEqual({startTime: 0, endTime: 1, uri: 'offline:0/1/5'});
              return fakeDbEngine.get('segment', 3);
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

        var stream = manifest.periods[0].streamSets[0].streams[0];
        stream.initSegmentReference =
            new shaka.media.InitSegmentReference(makeUris('fake:0'), 0, null);

        storage.store('')
            .then(function(manifest) {
              expect(manifest).toBeTruthy();
              expect(manifest.size).toBe(5);
              expect(manifest.duration).toBe(0);
              expect(netEngine.request.calls.count()).toBe(1);
              return fakeDbEngine.get('manifest', 0);
            })
            .then(function(manifest) {
              var stream = manifest.periods[0].streams[0];
              expect(stream.segments.length).toBe(0);
              expect(stream.initSegmentUri).toBe('offline:0/0/0');
              return fakeDbEngine.get('segment', 0);
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
              expect(manifest.duration).toBe(3);
              expect(netEngine.request.calls.count()).toBe(3);
              return fakeDbEngine.get('manifest', 0);
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
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.HTTP_ERROR);
        delay.reject(expectedError);
        storage.store('')
            .then(fail, function(err) {
              shaka.test.Util.expectToEqualError(err, expectedError);
            })
            .catch(fail)
            .then(done);
      });
    });
  });

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
            return fakeDbEngine.insert('manifest', manifest);
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
            return fakeDbEngine.insert('manifest', manifest);
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
            return fakeDbEngine.insert('manifest', manifest);
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
            return fakeDbEngine.insert('manifest', manifest);
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
              fakeDbEngine.insert('manifest', manifest1),
              fakeDbEngine.insert('manifest', manifest2)
            ]);
          })
          .then(function() {
            expectDatabaseCount(2, 8);
            return removeManifest(manifestId1);
          })
          .then(function() {
            expectDatabaseCount(1, 3);
            return fakeDbEngine.get('segment', segmentId - 1);
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
            return fakeDbEngine.insert('manifest', manifest);
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

    it('raises not found error', function(done) {
      removeManifest(0)
          .then(fail)
          .catch(function(e) {
            shaka.test.Util.expectToEqualError(
                e,
                new shaka.util.Error(
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
      var manifests = fakeDbEngine.getAllData('manifest');
      expect(Object.keys(manifests).length).toBe(manifestCount);
      var segments = fakeDbEngine.getAllData('segment');
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
      return Promise
          .all(ret.map(function(segment) {
            return fakeDbEngine.insert('segment', segment);
          }))
          .then(function() {
            return ret.map(function(segment, i) {
              return {
                uri: 'offline:' + manifestId + '/0/' + segment.key,
                startTime: i,
                endTime: (i + 1)
              };
            });
          });
    }
  });

  function makeUris(uri) {
    return function() { return [uri]; };
  }
});
