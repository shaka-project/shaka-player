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

describe('DBUpgradeFromVersion1', function() {
  /** @const */
  var DBUtils = shaka.offline.DBUtils;

  it('upgrade common v1 content with v1 uris', checkAndRun(function(done) {
    /** @const {!Array.<number>} */
    var data0 = [0];
    /** @const {!Array.<number>} */
    var data1 = [1];
    /** @const {!Array.<number>} */
    var data2 = [2];
    /** @const {!Array.<number>} */
    var data3 = [3];
    /** @const {!Array.<number>} */
    var data4 = [4];
    /** @const {!Array.<number>} */
    var data5 = [5];
    /** @const {!Array.<number>} */
    var data6 = [6];
    /** @const {!Array.<number>} */
    var data7 = [7];
    /** @const {!Array.<number>} */
    var data8 = [8];
    /** @const {!Array.<number>} */
    var data9 = [9];
    /** @const {!Array.<number>} */
    var data10 = [10];
    /** @const {!Array.<number>} */
    var data11 = [11];
    /** @const {!Array.<number>} */
    var data12 = [12];

    // This is what an old manifest would look like. Most of the values here
    // are made-up and have no meaning.
    /** @type {shakaExtern.ManifestDBV1} */
    var oldManifest = {
      key: 0,
      originalManifestUri: 'original-manifest-uri',
      duration: 256,
      size: 1024,
      expiration: 32,
      periods: [
        makeOldPeriod(0, [
          // Use the first stream to test that init segments are getting
          // updated correctly
          makeOldStream(0, 'audio', 'audio/mp4', 'mp4', 'offline:0/0/12', [
            makeOldSegment(0, 1, 'offline:0/0/0'),
            makeOldSegment(1, 2, 'offline:0/0/1'),
            makeOldSegment(2, 3, 'offline:0/0/2')
          ]),
          makeOldStream(1, 'audio', 'audio/mp4', 'mp4', null, [
            makeOldSegment(0, 1, 'offline:0/1/3'),
            makeOldSegment(1, 2, 'offline:0/1/4'),
            makeOldSegment(2, 3, 'offline:0/1/5')
          ]),
          makeOldStream(2, 'video', 'video/mp4', 'mp4', null, [
            makeOldSegment(0, 1, 'offline:0/2/6'),
            makeOldSegment(1, 2, 'offline:0/2/7'),
            makeOldSegment(2, 3, 'offline:0/2/8')
          ]),
          makeOldStream(3, 'video', 'video/mp4', 'mp4', null, [
            makeOldSegment(0, 1, 'offline:0/3/9'),
            makeOldSegment(1, 2, 'offline:0/3/10'),
            makeOldSegment(2, 3, 'offline:0/3/11')
          ])
        ])
      ],
      sessionIds: ['session-1', 'session-2'],
      drmInfo: null,
      appMetadata: {
        name: 'The Awesome Adventures of Aaron\'s Articulate Aardvark'
      }
    };

    /** @type {!Array} */
    var oldSegmentData = [
      // Stream 0
      makeOldSegmentData(0, data0, 0, 0, 0),
      makeOldSegmentData(1, data1, 0, 0, 1),
      makeOldSegmentData(2, data2, 0, 0, 2),
      // Stream 1
      makeOldSegmentData(3, data3, 0, 1, 0),
      makeOldSegmentData(4, data4, 0, 1, 1),
      makeOldSegmentData(5, data5, 0, 1, 2),
      // Stream 2
      makeOldSegmentData(6, data6, 0, 2, 0),
      makeOldSegmentData(7, data7, 0, 2, 1),
      makeOldSegmentData(8, data8, 0, 2, 2),
      // Stream 3
      makeOldSegmentData(9, data9, 0, 3, 0),
      makeOldSegmentData(10, data10, 0, 3, 1),
      makeOldSegmentData(11, data11, 0, 3, 2),
      // Stream 0 init data
      makeOldSegmentData(12, data12, 0, 0, 0)
    ];

    /** @type {shakaExtern.ManifestDB} */
    var newManifest = {
      originalManifestUri: 'original-manifest-uri',
      duration: 256,
      size: 1024,
      expiration: 32,
      periods: [
        makeNewPeriod(0, [
          makeNewStream(0, 'audio', 'audio/mp4', 'mp4', 12, [
            makeNewSegment(0, 1, 0),
            makeNewSegment(1, 2, 1),
            makeNewSegment(2, 3, 2)
          ], [0, 1]),
          makeNewStream(1, 'audio', 'audio/mp4', 'mp4', null, [
            makeNewSegment(0, 1, 3),
            makeNewSegment(1, 2, 4),
            makeNewSegment(2, 3, 5)
          ], [2, 3]),
          makeNewStream(2, 'video', 'video/mp4', 'mp4', null, [
            makeNewSegment(0, 1, 6),
            makeNewSegment(1, 2, 7),
            makeNewSegment(2, 3, 8)
          ], [0, 2]),
          makeNewStream(3, 'video', 'video/mp4', 'mp4', null, [
            makeNewSegment(0, 1, 9),
            makeNewSegment(1, 2, 10),
            makeNewSegment(2, 3, 11)
          ], [1, 3])
        ])
      ],
      sessionIds: ['session-1', 'session-2'],
      drmInfo: null,
      appMetadata: {
        name: 'The Awesome Adventures of Aaron\'s Articulate Aardvark'
      }
    };

    /** @type {!Array.<shakaExtern.SegmentDataDB>} */
    var newSegmentData = [
      // Stream 0 data
      shaka.test.OfflineUtils.createSegmentData(data0),
      shaka.test.OfflineUtils.createSegmentData(data1),
      shaka.test.OfflineUtils.createSegmentData(data2),
      // Stream 1 data
      shaka.test.OfflineUtils.createSegmentData(data3),
      shaka.test.OfflineUtils.createSegmentData(data4),
      shaka.test.OfflineUtils.createSegmentData(data5),
      // Stream 2 data
      shaka.test.OfflineUtils.createSegmentData(data6),
      shaka.test.OfflineUtils.createSegmentData(data7),
      shaka.test.OfflineUtils.createSegmentData(data8),
      // Stream 3 data
      shaka.test.OfflineUtils.createSegmentData(data9),
      shaka.test.OfflineUtils.createSegmentData(data10),
      shaka.test.OfflineUtils.createSegmentData(data11),
      // Stream 0 init data
      shaka.test.OfflineUtils.createSegmentData(data12)
    ];

    runUpgradeTest(oldManifest, oldSegmentData, newManifest, newSegmentData)
        .catch(fail).then(done);
  }));


  it('upgrade common v1 content with v2 uris', checkAndRun(function(done) {
    /** @const {!Array.<number>} */
    var data0 = [0];
    /** @const {!Array.<number>} */
    var data1 = [1];
    /** @const {!Array.<number>} */
    var data2 = [2];
    /** @const {!Array.<number>} */
    var data3 = [3];
    /** @const {!Array.<number>} */
    var data4 = [4];
    /** @const {!Array.<number>} */
    var data5 = [5];
    /** @const {!Array.<number>} */
    var data6 = [6];
    /** @const {!Array.<number>} */
    var data7 = [7];
    /** @const {!Array.<number>} */
    var data8 = [8];
    /** @const {!Array.<number>} */
    var data9 = [9];
    /** @const {!Array.<number>} */
    var data10 = [10];
    /** @const {!Array.<number>} */
    var data11 = [11];
    /** @const {!Array.<number>} */
    var data12 = [12];

    // This is what an old manifest would look like. Most of the values here
    // are made-up and have no meaning.
    /** @type {shakaExtern.ManifestDBV1} */
    var oldManifest = {
      key: 0,
      originalManifestUri: 'original-manifest-uri',
      duration: 256,
      size: 1024,
      expiration: 32,
      periods: [
        makeOldPeriod(0, [
          // Use the first stream to test that init segments are getting
          // updated correctly
          makeOldStream(0, 'audio', 'audio/mp4', 'mp4', 'offline:0/0/12', [
            makeOldSegment(0, 1, 'offline:segment/0'),
            makeOldSegment(1, 2, 'offline:segment/1'),
            makeOldSegment(2, 3, 'offline:segment/2')
          ]),
          makeOldStream(1, 'audio', 'audio/mp4', 'mp4', null, [
            makeOldSegment(0, 1, 'offline:segment/3'),
            makeOldSegment(1, 2, 'offline:segment/4'),
            makeOldSegment(2, 3, 'offline:0/1/5')
          ]),
          makeOldStream(2, 'video', 'video/mp4', 'mp4', null, [
            makeOldSegment(0, 1, 'offline:segment/6'),
            makeOldSegment(1, 2, 'offline:segment/7'),
            makeOldSegment(2, 3, 'offline:segment/8')
          ]),
          makeOldStream(3, 'video', 'video/mp4', 'mp4', null, [
            makeOldSegment(0, 1, 'offline:segment/9'),
            makeOldSegment(1, 2, 'offline:segment/10'),
            makeOldSegment(2, 3, 'offline:segment/11')
          ])
        ])
      ],
      sessionIds: ['session-1', 'session-2'],
      drmInfo: null,
      appMetadata: {
        name: 'The Awesome Adventures of Aaron\'s Articulate Aardvark'
      }
    };

    /** @type {!Array} */
    var oldSegmentData = [
      // Stream 0
      makeOldSegmentData(0, data0, 0, 0, 0),
      makeOldSegmentData(1, data1, 0, 0, 1),
      makeOldSegmentData(2, data2, 0, 0, 2),
      // Stream 1
      makeOldSegmentData(3, data3, 0, 1, 0),
      makeOldSegmentData(4, data4, 0, 1, 1),
      makeOldSegmentData(5, data5, 0, 1, 2),
      // Stream 2
      makeOldSegmentData(6, data6, 0, 2, 0),
      makeOldSegmentData(7, data7, 0, 2, 1),
      makeOldSegmentData(8, data8, 0, 2, 2),
      // Stream 3
      makeOldSegmentData(9, data9, 0, 3, 0),
      makeOldSegmentData(10, data10, 0, 3, 1),
      makeOldSegmentData(11, data11, 0, 3, 2),
      // Stream 0 init data
      makeOldSegmentData(12, data12, 0, 0, 0)
    ];

    /** @type {shakaExtern.ManifestDB} */
    var newManifest = {
      originalManifestUri: 'original-manifest-uri',
      duration: 256,
      size: 1024,
      expiration: 32,
      periods: [
        makeNewPeriod(0, [
          makeNewStream(0, 'audio', 'audio/mp4', 'mp4', 12, [
            makeNewSegment(0, 1, 0),
            makeNewSegment(1, 2, 1),
            makeNewSegment(2, 3, 2)
          ], [0, 1]),
          makeNewStream(1, 'audio', 'audio/mp4', 'mp4', null, [
            makeNewSegment(0, 1, 3),
            makeNewSegment(1, 2, 4),
            makeNewSegment(2, 3, 5)
          ], [2, 3]),
          makeNewStream(2, 'video', 'video/mp4', 'mp4', null, [
            makeNewSegment(0, 1, 6),
            makeNewSegment(1, 2, 7),
            makeNewSegment(2, 3, 8)
          ], [0, 2]),
          makeNewStream(3, 'video', 'video/mp4', 'mp4', null, [
            makeNewSegment(0, 1, 9),
            makeNewSegment(1, 2, 10),
            makeNewSegment(2, 3, 11)
          ], [1, 3])
        ])
      ],
      sessionIds: ['session-1', 'session-2'],
      drmInfo: null,
      appMetadata: {
        name: 'The Awesome Adventures of Aaron\'s Articulate Aardvark'
      }
    };

    /** @type {!Array.<shakaExtern.SegmentDataDB>} */
    var newSegmentData = [
      // Stream 0 data
      shaka.test.OfflineUtils.createSegmentData(data0),
      shaka.test.OfflineUtils.createSegmentData(data1),
      shaka.test.OfflineUtils.createSegmentData(data2),
      // Stream 1 data
      shaka.test.OfflineUtils.createSegmentData(data3),
      shaka.test.OfflineUtils.createSegmentData(data4),
      shaka.test.OfflineUtils.createSegmentData(data5),
      // Stream 2 data
      shaka.test.OfflineUtils.createSegmentData(data6),
      shaka.test.OfflineUtils.createSegmentData(data7),
      shaka.test.OfflineUtils.createSegmentData(data8),
      // Stream 3 data
      shaka.test.OfflineUtils.createSegmentData(data9),
      shaka.test.OfflineUtils.createSegmentData(data10),
      shaka.test.OfflineUtils.createSegmentData(data11),
      // Stream 0 init data
      shaka.test.OfflineUtils.createSegmentData(data12)
    ];

    runUpgradeTest(oldManifest, oldSegmentData, newManifest, newSegmentData)
        .catch(fail).then(done);
  }));


  /**
   * @param {shakaExtern.ManifestDBV1} oldManifest
   * @param {!Array.<shakaExtern.SegmentDataDBV1>} oldSegmentData
   * @param {shakaExtern.ManifestDB} expectedNewManifest
   * @param {!Array.<shakaExtern.SegmentDataDB>} expectedNewSegmentData
   * @return {!Promise}
   */
  function runUpgradeTest(oldManifest,
                          oldSegmentData,
                          expectedNewManifest,
                          expectedNewSegmentData) {

    var dbName = 'shaka-upgrade-test-database';

    var deleteOldInstance = function() {
      var promise = new shaka.util.PublicPromise();

      var deleteRequest = window.indexedDB.deleteDatabase(dbName);
      deleteRequest.onerror = function(event) { promise.reject(); };
      deleteRequest.onsuccess = function(event) { promise.resolve(); };

      return promise;
    };

    return deleteOldInstance()
        .then(function() {
          var upgrade = function(version, db, transaction) {
            db.createObjectStore(DBUtils.StoreV1.MANIFEST, {keyPath: 'key'});
            db.createObjectStore(DBUtils.StoreV1.SEGMENT, {keyPath: 'key'});
          };

          return shaka.offline.DBUtils.open(dbName, 1, upgrade);
        })
        .then(function(db) {
          return Promise.resolve()
              .then(function() {
                return transaction(
                    db,
                    DBUtils.StoreV1.MANIFEST,
                    DBUtils.Mode.READ_WRITE,
                    function(store) {
                      store.put(oldManifest);
                    });
              })
              .then(function() {
                return transaction(
                    db,
                    DBUtils.StoreV1.SEGMENT,
                    DBUtils.Mode.READ_WRITE,
                    function(store) {
                      oldSegmentData.forEach(function(segment) {
                        store.put(segment);
                      });
                    });
              })
              .then(function() {
                db.close();
              });
        })
        .then(function() {
          var upgrade = function(version, db, transaction) {
            var upgrader = new shaka.offline.DBUpgradeFromVersion1();
            upgrader.upgrade(db, transaction);
          };

          return shaka.offline.DBUtils.open(dbName, 2, upgrade);
        })
        .then(function(db) {
          /** @const */
          var noop = function() {};

          /** @type {!Array} */
          var manifests = [];
          /** @type {!Array} */
          var segments = [];

          return Promise.resolve()
              .then(function() {
                return transaction(
                    db,
                    DBUtils.StoreV2.MANIFEST,
                    DBUtils.Mode.READ_ONLY,
                    function(store) {
                      DBUtils.forEach(
                          store,
                          function(key, value, next) {
                            manifests.push(value);
                            next();
                          },
                          noop);
                    });
              })
              .then(function() {
                return transaction(
                    db,
                    DBUtils.StoreV2.SEGMENT,
                    DBUtils.Mode.READ_ONLY,
                    function(store) {
                      DBUtils.forEach(
                          store,
                          function(key, value, next) {
                            segments.push(value);
                            next();
                          },
                          noop);
                    });
              })
              .then(function() {
                // We only stored one manifest
                expect(manifests.length).toBe(1);
                expect(manifests[0]).toEqual(expectedNewManifest);

                expect(segments.length).toBe(expectedNewSegmentData.length);
                expectedNewSegmentData.forEach(function(newSegment) {
                  shaka.test.OfflineUtils.expectSegmentsToContain(
                      segments,
                      newSegment);
                });
              })
              .then(function() {
                // Make sure to close the database when we are done or else any
                // following test that tries to delete this database will hang
                // when trying to delete it.
                db.close();
              });
        });
  }


  /**
   * @param {number} startTime
   * @param {!Array} streams
   * @return {!Object}
   */
  function makeOldPeriod(startTime, streams) {
    return {
      startTime: startTime,
      streams: streams
    };
  }


  /**
   * @param {number} id
   * @param {string} type
   * @param {string} mimeType
   * @param {string} codec
   * @param {?string} initSegment
   * @param {!Array} segments
   * @return {!Object}
   */
  function makeOldStream(id, type, mimeType, codec, initSegment, segments) {
    return {
      id: id,
      primary: false,
      presentationTimeOffset: 0,
      contentType: type,
      mimeType: mimeType,
      codecs: codec,
      frameRate: undefined,
      kind: undefined,
      language: 'fr',
      label: null,
      width: null,
      height: null,
      initSegmentUri: initSegment,
      encrypted: false,
      keyId: null,
      segments: segments,
      variantIds: null
    };
  }


  /**
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} uri
   * @return {!Object}
   */
  function makeOldSegment(startTime, endTime, uri) {
    return {
      startTime: startTime,
      endTime: endTime,
      uri: uri
    };
  }


  /**
   * @param {number} key
   * @param {!Array.<number>} data
   * @param {number} manifest
   * @param {number} stream
   * @param {number} segment
   * @return {!Object}
   */
  function makeOldSegmentData(key, data, manifest, stream, segment) {
    /** @type {!Uint8Array} */
    var view = new Uint8Array(data);

    return {
      key: key,
      data: view.buffer,
      manifestKey: manifest,
      streamNumber: stream,
      segmentNumber: segment
    };
  }


  /**
   * @param {number} startTime
   * @param {!Array.<shakaExtern.StreamDB>} streams
   * @return {shakaExtern.PeriodDB}
   */
  function makeNewPeriod(startTime, streams) {
    return {
      startTime: startTime,
      streams: streams
    };
  }


  /**
   * @param {number} id
   * @param {string} type
   * @param {string} mimeType
   * @param {string} codec
   * @param {?number} initSegment
   * @param {!Array.<shakaExtern.SegmentDB>} segments
   * @param {!Array.<number>} variantIds
   * @return {shakaExtern.StreamDB}
   */
  function makeNewStream(id,
                         type,
                         mimeType,
                         codec,
                         initSegment,
                         segments,
                         variantIds) {
    return {
      id: id,
      primary: false,
      presentationTimeOffset: 0,
      contentType: type,
      mimeType: mimeType,
      codecs: codec,
      frameRate: undefined,
      kind: undefined,
      language: 'fr',
      label: null,
      width: null,
      height: null,
      initSegmentKey: initSegment,
      encrypted: false,
      keyId: null,
      segments: segments,
      variantIds: variantIds
    };
  }


  /**
   * @param {number} startTime
   * @param {number} endTime
   * @param {number} dataKey
   * @return {shakaExtern.SegmentDB}
   */
  function makeNewSegment(startTime, endTime, dataKey) {
    return {
      startTime: startTime,
      endTime: endTime,
      dataKey: dataKey
    };
  }


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
   * @param {IDBObjectStore} store
   * @return {!Array}
   */
  function getAll(store) {
    /** @const */
    var noop = function() {};

    /** @type {!Array} */
    var all = [];

    shaka.offline.DBUtils.forEach(
        store,
        function(key, value, next) {
          all.push(value);
          next();
        },
        noop);

    return all;
  }


  /**
   * @param {IDBDatabase} db
   * @param {string} store
   * @param {string} mode
   * @param {function(IDBObjectStore)} action
   * @return {!Promise}
   */
  function transaction(db, store, mode, action) {
    var promise = new shaka.util.PublicPromise();

    var t = db.transaction([store], mode);
    t.onerror = function(event) {
      promise.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STORAGE,
          shaka.util.Error.Code.INDEXED_DB_ERROR,
          'Failed to execute transaction'));
    };
    t.oncomplete = function(event) {
      promise.resolve();
    };

    var objectStore = t.objectStore(store);
    action(objectStore);

    return promise;
  }
});
