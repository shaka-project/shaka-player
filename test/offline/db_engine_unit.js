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

describe('DBEngine', function() {
  /** @const {string} */
  var dbName = 'shaka-player-test-db';

  /** @const {number} */
  var dbUpdateRetries = 5;

  /** @type {!shaka.offline.DBEngine} */
  var db;

  beforeEach(function(done) {
    if (shaka.offline.DBEngine.isSupported()) {
      shaka.offline.DBEngine.deleteDatabase(dbName).then(function() {
        db = new shaka.offline.DBEngine(dbName);
        return db.init(dbUpdateRetries);
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
    /** @type {shakaExtern.ManifestDB} */
    var original = shaka.test.OfflineUtils.createManifest('original manifest');

    Promise.resolve()
        .then(function() {
          return db.addManifest(original);
        })
        .then(function(id) {
          return db.getManifest(id);
        })
        .then(function(copy) {
          expect(copy).toEqual(original);
        })
        .then(done).catch(fail);
  }));

  it('stores and retrieves many manifest', checkAndRun(function(done) {
    /** @type {!Array<shakaExtern.ManifestDB>} */
    var originals = [
      shaka.test.OfflineUtils.createManifest('original manifest 1'),
      shaka.test.OfflineUtils.createManifest('original manifest 2'),
      shaka.test.OfflineUtils.createManifest('original manifest 3'),
      shaka.test.OfflineUtils.createManifest('original manifest 4')
    ];

    /** @type {!Array<shakaExtern.ManifestDB>} */
    var copies = [];

    Promise.resolve()
        .then(function() {
          return Promise.all(originals.map(function(original) {
            return db.addManifest(original);
          }));
        })
        .then(function() {
          return db.forEachManifest(function(id, manifest) {
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

  it('stores and removes a manifest', checkAndRun(function(done) {
    /** @type {shakaExtern.ManifestDB} */
    var original = shaka.test.OfflineUtils.createManifest('original manifest');

    /** @type {number} */
    var id;

    Promise.resolve()
        .then(function() {
          return db.addManifest(original);
        })
        .then(function(newId) {
          id = newId;
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
    /** @type {shakaExtern.SegmentDataDB} */
    var original = shaka.test.OfflineUtils.createSegmentData([0, 1, 2]);

    Promise.resolve()
        .then(function() {
          return db.addSegment(original);
        })
        .then(function(id) {
          return db.getSegment(id);
        })
        .then(function(copy) {
          shaka.test.OfflineUtils.expectSegmentToEqual(copy, original);
        })
        .then(done).catch(fail);
  }));

  it('stores and retrieves many segments', checkAndRun(function(done) {
    /** @type {!Array<shakaExtern.SegmentDataDB>} */
    var originals = [
      shaka.test.OfflineUtils.createSegmentData([0]),
      shaka.test.OfflineUtils.createSegmentData([1, 2]),
      shaka.test.OfflineUtils.createSegmentData([3, 4, 5]),
      shaka.test.OfflineUtils.createSegmentData([6, 7, 8, 9])
    ];

    /** @type {!Array<shakaExtern.SegmentDataDB>} */
    var copies = [];

    Promise.resolve()
        .then(function() {
          return Promise.all(originals.map(function(original) {
            return db.addSegment(original);
          }));
        })
        .then(function() {
          return db.forEachSegment(function(id, segment) {
            copies.push(segment);
          });
        })
        .then(function() {
          originals.forEach(function(original) {
            shaka.test.OfflineUtils.expectSegmentsToContain(copies, original);
          });
        })
        .then(done).catch(fail);
  }));

  it('stores and removes a segment', checkAndRun(function(done) {
    /** @type {shakaExtern.SegmentDataDB} */
    var original = shaka.test.OfflineUtils.createSegmentData([0, 1, 2]);

    /** @type {number} */
    var id;

    Promise.resolve()
        .then(function() {
          return db.addSegment(original);
        })
        .then(function(newId) {
          id = newId;
          return db.getSegment(id);
        })
        .then(function(value) {
          shaka.test.OfflineUtils.expectSegmentToEqual(value, original);
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
});
