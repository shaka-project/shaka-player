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

describe('DBEngine', /** @suppress {accessControls} */ function() {
  /** @const */
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  /** @const {string} */
  var dbName = 'shaka-player-test-db';

  /** @const {number} */
  var dbUpdateRetries = 5;

  /** @type {!shaka.offline.DBEngine} */
  var db;

  beforeEach(function(done) {
    if (shaka.offline.DBEngine.isSupported()) {
      shaka.offline.DBEngine.deleteDatabase(dbName).then(function() {
        db = new shaka.offline.DBEngine(dbName, dbUpdateRetries);
        return db.init();
      }).catch(fail).then(done);
    } else {
      done();
    }
  });

  afterEach(function(done) {
    if (shaka.offline.DBEngine.isSupported()) {
      db.destroy().catch(fail).then(done);
    } else {
      done();
    }
  });

  it('stores and retrieves a manifest', checkAndRun(function(done) {
    /** @type {number} */
    var id = db.reserveManifestId();

    /** @type {shakaExtern.ManifestDB} */
    var original = createManifest(id);

    Promise.resolve()
        .then(function() {
          return db.insertManifest(original);
        })
        .then(function() {
          return db.getManifest(id);
        })
        .then(function(copy) {
          expect(copy).toEqual(original);
        })
        .then(done).catch(fail);
  }));

  it('stores and retrieves many manifest', checkAndRun(function(done) {
    /** @type {!Array<number>} */
    var ids = [
      db.reserveManifestId(),
      db.reserveManifestId(),
      db.reserveManifestId()
    ];

    /** @type {!Array<shakaExtern.ManifestDB>} */
    var originals = ids.map(function(id) {
      return createManifest(id);
    });

    /** @type {!Array<shakaExtern.ManifestDB>} */
    var copies = [];

    Promise.resolve()
        .then(function() {
          return Promise.all(originals.map(function(original) {
            return db.insertManifest(original);
          }));
        })
        .then(function() {
          return db.forEachManifest(function(manifest) {
            copies.push(manifest);
          });
        })
        .then(function() {
          originals.forEach(function(original) {
            expect(copies).toContain(original);
          });
        })
        .then(done).catch(fail);
  }));

  it('stores and remove a manifest', checkAndRun(function(done) {
    /** @type {number} */
    var id = db.reserveManifestId();

    /** @type {shakaExtern.ManifestDB} */
    var original = createManifest(id);

    Promise.resolve()
        .then(function() {
          return db.insertManifest(original);
        })
        .then(function() {
          return db.getManifest(id);
        })
        .then(function(value) {
          expect(value).toEqual(original);
          return db.removeManifests([id], null);
        })
        .then(function() {
          return db.getManifest(id);
        })
        .then(function(copy) {
          expect(copy).toBeFalsy();
        })
        .then(done).catch(fail);
  }));

  it('stores and retrieves a segment', checkAndRun(function(done) {
    /** @type {number} */
    var id = db.reserveSegmentId();

    /** @type {shakaExtern.SegmentDataDB} */
    var original = createSegment(id);

    Promise.resolve()
        .then(function() {
          return db.insertSegment(original);
        })
        .then(function() {
          return db.getSegment(id);
        })
        .then(function(copy) {
          expect(copy).toEqual(original);
        })
        .then(done).catch(fail);
  }));

  it('stores and retrieves many segments', checkAndRun(function(done) {
    /** @type {!Array<number>} */
    var ids = [
      db.reserveSegmentId(),
      db.reserveSegmentId(),
      db.reserveSegmentId()
    ];

    /** @type {!Array<shakaExtern.SegmentDataDB>} */
    var originals = ids.map(function(id) {
      return createSegment(id);
    });

    /** @type {!Array<shakaExtern.SegmentDataDB>} */
    var copies = [];

    Promise.resolve()
        .then(function() {
          return Promise.all(originals.map(function(original) {
            return db.insertSegment(original);
          }));
        })
        .then(function() {
          return db.forEachSegment(function(segment) {
            copies.push(segment);
          });
        })
        .then(function() {
          originals.forEach(function(original) {
            expect(copies).toContain(original);
          });
        })
        .then(done).catch(fail);
  }));

  it('stores and remove a segment', checkAndRun(function(done) {
    /** @type {number} */
    var id = db.reserveSegmentId();

    /** @type {shakaExtern.SegmentDataDB} */
    var original = createSegment(id);

    Promise.resolve()
        .then(function() {
          return db.insertSegment(original);
        })
        .then(function() {
          return db.getSegment(id);
        })
        .then(function(value) {
          expect(value).toEqual(original);
          return db.removeSegments([id], null);
        })
        .then(function() {
          return db.getSegment(id);
        })
        .then(function(copy) {
          expect(copy).toBeFalsy();
        })
        .then(done).catch(fail);
  }));

  // TODO : Remove this test once we drop support for DB Engine Version 1
  it('fills missing variant ids for old manifests', checkAndRun(function(done) {
    /** @type {number} */
    var id = db.reserveManifestId();

    // Create a manifest with two streams. One video and one audio. When db
    // engine recreates the variant ids, it should pair them together into
    // a variant.

    /** @type {shakaExtern.ManifestDB} */
    var originalManifest = createManifest(id);
    originalManifest.periods.push({
      startTime: 0,
      streams: [
        createStream(0, ContentType.AUDIO),
        createStream(1, ContentType.AUDIO),
        createStream(2, ContentType.VIDEO),
        createStream(3, ContentType.VIDEO)
      ]
    });

    // Remove the variant ids field from all streams.
    originalManifest.periods[0].streams.forEach(function(stream) {
      delete stream['variantIds'];
      expect(stream.variantIds).toBe(undefined);
    });

    Promise.resolve()
        .then(function() {
          return db.insertManifest(originalManifest);
        })
        .then(function() {
          return db.getManifest(id);
        })
        .then(function(manifest) {
          expect(manifest.periods.length).toBe(1);

          var streams = manifest.periods[0].streams;
          expect(streams.length).toBe(4);

          // Create a mapping of variants to stream ids.
          var variants = {};
          streams.forEach(function(stream) {
            stream.variantIds.forEach(function(id) {
              variants[id] = variants[id] || [];
              variants[id].push(stream.id);
            });
          });

          shaka.log.info(variants);

          expect(variants[0]).toEqual([0, 2]);
          expect(variants[1]).toEqual([0, 3]);
          expect(variants[2]).toEqual([1, 2]);
          expect(variants[3]).toEqual([1, 3]);
        }).then(done).catch(fail);
  }));


  /**
   * Before running the test, check if DBEngine is supported on this platform.
   * @param {function(function())} test
   * @return {function(function())}
   */
  function checkAndRun(test) {
    return function(done) {
      if (shaka.offline.DBEngine.isSupported()) {
        test(done);
      } else {
        pending('DBEngine is not supported on this platform.');
      }
    };
  }


  /**
   * @param {number} id
   * @return {shakaExtern.ManifestDB}
   */
  function createManifest(id) {
    return {
      appMetadata: null,
      drmInfo: null,
      duration: 90,
      expiration: Infinity,
      key: id,
      originalManifestUri: '',
      periods: [],
      sessionIds: [],
      size: 1024
    };
  }


  /**
   * @param {number} id
   * @param {string} type
   * @return {shakaExtern.StreamDB}
   */
  function createStream(id, type) {
    return {
      id: id,
      primary: false,
      presentationTimeOffset: 0,
      contentType: type,
      mimeType: '',
      codecs: '',
      frameRate: undefined,
      kind: undefined,
      language: '',
      label: null,
      width: null,
      height: null,
      initSegmentUri: null,
      encrypted: false,
      keyId: null,
      segments: [],
      variantIds: []
    };
  }


  /**
   * @param {number} id
   * @return {shakaExtern.SegmentDataDB}
   */
  function createSegment(id) {
    return {
      data: null,
      key: id,
      manifestKey: 0,
      segmentNumber: 0,
      streamNumber: 0
    };
  }
});
