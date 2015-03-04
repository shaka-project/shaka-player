/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview content_database.js unit tests.
 */


goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.ContentDatabase');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.RangeRequest');

describe('ContentDatabase', function() {
  var db, p, testIndex, originalTimeout, originalRangeRequest;

  const url = 'http://example.com';
  const mime = 'video/phony';
  const codecs = 'phony';
  const duration = 100;
  const initSegment = new ArrayBuffer(1024);
  const expectedReferences = [
    { index: 0, start_time: 0, end_time: 2 },
    { index: 1, start_time: 2, end_time: 4 },
    { index: 2, start_time: 4, end_time: null }
  ];

  var customMatchers = {
    toMatchReference: function(util) {
      return {
        compare: function(actual, expected) {
          var result = {};
          result.pass = util.equals(actual.index, expected.index) &&
              util.equals(actual.index, expected.index) &&
              util.equals(actual.start_time, expected.start_time) &&
              util.equals(actual.end_time, expected.end_time) &&
              actual.url.match(/idb\:\/\/.+\/.+/);
          return result;
        }
      };
    }
  };

  beforeAll(function() {
    jasmine.addMatchers(customMatchers);
    // Change the timeout.
    originalTimeout = jasmine.DEFAULT_TIMEOUT_INTERVAL;
    jasmine.DEFAULT_TIMEOUT_INTERVAL = 5000;  // ms

    // Set up mock RangeRequest.
    originalRangeRequest = shaka.util.RangeRequest;
    var mockRangeRequest = function(url, startByte, endByte) {
      return {
        send: function() {
          return Promise.resolve(new ArrayBuffer(768 * 1024));
        }
      };
    };
    shaka.util.RangeRequest = mockRangeRequest;

    var testUrl = new goog.Uri(url);
    var testReferences = [
      new shaka.media.SegmentReference(0, 0, 1, 0, 5, testUrl),
      new shaka.media.SegmentReference(1, 1, 2, 6, 9, testUrl),
      new shaka.media.SegmentReference(2, 2, 3, 10, 15, testUrl),
      new shaka.media.SegmentReference(3, 3, 4, 16, 19, testUrl),
      new shaka.media.SegmentReference(4, 4, null, 20, null, testUrl)];
    testIndex = new shaka.media.SegmentIndex(testReferences);

    // Start each test run with a clean slate.
    (new shaka.util.ContentDatabase(null)).deleteDatabase();
  });

  beforeEach(function() {
    db = new shaka.util.ContentDatabase(null);
    p = db.setUpDatabase();
  });

  afterEach(function() {
    db.closeDatabaseConnection();
  });

  afterAll(function() {
    // Restore the timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    // Restore RangeRequest.
    shaka.util.RangeRequest = originalRangeRequest;
  });

  it('deletes the database', function(done) {
    p.then(function() {
      return db.deleteDatabase();
    }).then(function() {
      var p = new shaka.util.PublicPromise();
      var request = window.indexedDB.open(shaka.util.ContentDatabase.DB_NAME_);
      // onupgradeneeded is only called if the database does not already exist.
      request.onupgradeneeded = function(e) {
        // Cancel the creation of a new database.
        e.target.transaction.abort();
        p.resolve(true);
      };
      request.onsuccess = function() { p.resolve(false); };
      request.onerror = function(e) { p.reject(request.error); };
      return p;
    }).then(function(isDatabaseDeleted) {
      expect(isDatabaseDeleted).toBe(true);
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('stores a stream and retrieves its index', function(done) {
    p.then(function() {
      return db.insertStream(mime, codecs, duration, testIndex, initSegment);
    }).then(function(streamId) {
      return db.retrieveStreamIndex(streamId);
    }).then(function(streamIndex) {
      expect(streamIndex.references[0]).toMatchReference(expectedReferences[0]);
      expect(streamIndex.references[1]).toMatchReference(expectedReferences[1]);
      expect(streamIndex.references[2]).toMatchReference(expectedReferences[2]);
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('stores a stream with a single segment and retrieves its index',
      function(done) {
        var references = [new shaka.media.SegmentReference(
           0, 0, null, 6, null, new goog.Uri(url))];
        var index = new shaka.media.SegmentIndex(references);
        p.then(function() {
          return db.insertStream(mime, codecs, duration, index, initSegment);
        }).then(function(streamId) {
          return db.retrieveStreamIndex(streamId);
        }).then(function(streamIndex) {
          expect(streamIndex.references[0]).toMatchReference(
              { index: 0, start_time: 0, end_time: null });
          expect(streamIndex.codecs).toEqual(codecs);
          expect(streamIndex.mime_type).toEqual(mime);
          expect(streamIndex.duration).toEqual(duration);
          expect(streamIndex.init_segment).toEqual(initSegment);
          done();
        }).catch(function(err) {
          fail(err);
          done();
        });
      });

  it('throws an error when trying to store an invalid stream', function(done) {
    p.then(function() {
      return db.insertStream(mime, codecs, duration, null, initSegment);
    }).then(function() {
      fail();
      done();
    }).catch(function(err) {
      expect(err).not.toBeNull();
      done();
    });
  });

  it('deletes a stream index and throws error on retrieval', function(done) {
    var streamId;
    p.then(function() {
      return db.insertStream(mime, codecs, duration, testIndex, initSegment);
    }).then(function(data) {
      streamId = data;
      return db.deleteStream(streamId);
    }).then(function() {
      return db.retrieveStreamIndex(streamId);
    }).then(function(streamIndex) {
      fail();
      done();
    }).catch(function(err) {
      expect(err.type).toEqual('storage');
      done();
    });
  });

  it('retrieves a segment', function(done) {
    p.then(function() {
      return db.insertStream(mime, codecs, duration, testIndex, initSegment);
    }).then(function(streamId) {
      return db.retrieveSegment(streamId, 0);
    }).then(function(data) {
      expect(data).not.toBeUndefined();
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('throws an error when non-existent segment requested', function(done) {
    p.then(function() {
      return db.retrieveSegment(-1, -1);
    }).then(function(streamIndex) {
      fail();
      done();
    }).catch(function(err) {
      expect(err.type).toEqual('storage');
      done();
    });
  });

  it('retrieves streams initialization segment', function(done) {
    p.then(function() {
      return db.insertStream(mime, codecs, duration, testIndex, initSegment);
    }).then(function(streamId) {
      return db.retrieveInitSegment(streamId);
    }).then(function(data) {
      expect(data).not.toBeUndefined();
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('throws an error when non-existent streams init segment requested',
      function(done) {
        p.then(function() {
          return db.retrieveInitSegment(-1);
        }).then(function(data) {
          fail();
          done();
        }).catch(function(err) {
          expect(err.type).toEqual('storage');
          done();
        });
      });

  it('stores and retrieves a group information', function(done) {
    p.then(function() {
      return db.insertGroup([1, 2, 3]);
    }).then(function(groupId) {
      return db.retrieveGroup(groupId);
    }).then(function(groupInformation) {
      expect(groupInformation.group_id).toEqual(jasmine.any(Number));
      expect(groupInformation.stream_ids).toEqual([1, 2, 3]);
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('deletes group information and throws error on retrieval', function(done) {
    var streamIds = [];
    var groupId;
    p.then(function() {
      return db.insertStream(mime, codecs, duration, testIndex, initSegment);
    }).then(function(streamId) {
      streamIds.push(streamId);
      return db.insertGroup(streamIds);
    }).then(function(resultingGroupId) {
      groupId = resultingGroupId;
      return db.deleteGroup(groupId);
    }).then(function() {
      return db.retrieveGroup(groupId);
    }).then(function(groupInformation) {
      fail();
      done();
    }).catch(function(err) {
      expect(err.type).toEqual('storage');
      done();
    });
  });

  it('deletes streams in group and throws error on retrieval', function(done) {
    var streamIds = [];
    p.then(function() {
      return db.insertStream(mime, codecs, duration, testIndex, initSegment);
    }).then(function(streamId) {
      streamIds.push(streamId);
      return db.insertGroup(streamIds);
    }).then(function(groupId) {
      return db.deleteGroup(groupId);
    }).then(function() {
      return db.retrieveStreamIndex(streamIds[0]);
    }).then(function(streamIndex) {
      fail();
      done();
    }).catch(function(err) {
      expect(err.type).toEqual('storage');
      done();
    });
  });

});

