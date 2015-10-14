/**
 * @license
 * Copyright 2015 Google Inc.
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


goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.player.DrmInfo');
goog.require('shaka.util.ContentDatabase');
goog.require('shaka.util.ContentDatabaseReader');
goog.require('shaka.util.ContentDatabaseWriter');
goog.require('shaka.util.PublicPromise');

describe('ContentDatabase', function() {
  var fakeIndexSource, fakeInitSource;
  var reader, writer, p, testIndex, testReferences, streamInfo;
  var originalTimeout, originalFailoverUri, originalName;

  const url = 'http://example.com';
  const mime = 'video/phony';
  const codecs = 'phony';
  const duration = 100;
  const testInitData = new ArrayBuffer(1024);
  const keySystem = 'test.widevine.com';
  const licenseServerUrl = 'www.licenseServer.com';
  const expectedReferences = [
    { start_time: 0, end_time: 2 },
    { start_time: 2, end_time: 4 },
    { start_time: 4, end_time: null }
  ];
  const drmInfo = shaka.player.DrmInfo.createFromConfig({
    'keySystem': keySystem,
    'licenseServerUrl': licenseServerUrl
  });

  var customMatchers = {
    toMatchReference: function(util) {
      return {
        compare: function(actual, expected) {
          var result = {};
          result.pass =
              util.equals(actual.start_time, expected.start_time) &&
              util.equals(actual.end_time, expected.end_time) &&
              actual.url.toString().match(/idb\:\/\/.+\/.+/);
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

    // Set up mock FailoverUri.
    originalFailoverUri = shaka.util.FailoverUri;
    var mockFailoverUri = function(callback, url, startByte, endByte) {
      return {
        fetch: function() {
          return Promise.resolve(new ArrayBuffer(768 * 1024));
        }
      };
    };
    shaka.util.FailoverUri = mockFailoverUri;

    testReferences = [
      new shaka.media.SegmentReference(0, 1, createFailover(url, 0, 5)),
      new shaka.media.SegmentReference(1, 2, createFailover(url, 6, 9)),
      new shaka.media.SegmentReference(2, 3, createFailover(url, 10, 15)),
      new shaka.media.SegmentReference(3, 4, createFailover(url, 16, 19)),
      new shaka.media.SegmentReference(4, null, createFailover(url, 20, null))
    ];
    testIndex = new shaka.media.SegmentIndex(testReferences);

    // Use a database name which will not affect the test app.
    originalName = shaka.util.ContentDatabase.DB_NAME;
    shaka.util.ContentDatabase.DB_NAME += '_test';
    // Start each test run with a clean slate.
    (new shaka.util.ContentDatabase('readwrite', null)).deleteDatabase();

    fakeIndexSource = {
      destroy: function() {},
      create: function() { return Promise.resolve(testIndex); }
    };

    fakeInitSource = {
      destroy: function() {},
      create: function() { return Promise.resolve(testInitData); }
    };
  });

  beforeEach(function() {
    reader = new shaka.util.ContentDatabaseReader();
    writer = new shaka.util.ContentDatabaseWriter(null, null);
    p = reader.setUpDatabase().then(
        function() {
          return writer.setUpDatabase();
        });

    streamInfo = new shaka.media.StreamInfo();
    streamInfo.mimeType = mime;
    streamInfo.codecs = codecs;
    streamInfo.segmentIndexSource = fakeIndexSource;
    streamInfo.segmentInitSource = fakeInitSource;
  });

  afterEach(function() {
    reader.closeDatabaseConnection();
    writer.closeDatabaseConnection();
  });

  afterAll(function() {
    // Restore the timeout.
    jasmine.DEFAULT_TIMEOUT_INTERVAL = originalTimeout;

    // Restore FailoverUri.
    shaka.util.FailoverUri = originalFailoverUri;

    // Restore DB name.
    shaka.util.ContentDatabase.DB_NAME = originalName;
  });

  it('deletes the database', function(done) {
    p.then(function() {
      reader.closeDatabaseConnection();
      return writer.deleteDatabase();
    }).then(function() {
      var p = new shaka.util.PublicPromise();
      var request = window.indexedDB.open(shaka.util.ContentDatabase.DB_NAME);
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
      return writer.insertStream_(
          streamInfo, testIndex, testInitData, testReferences.length, 0);
    }).then(function(streamId) {
      return reader.retrieveStreamIndex(streamId);
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
        var references = [
          new shaka.media.SegmentReference(0, null, createFailover(url, 6))
        ];
        var index = new shaka.media.SegmentIndex(references);
        streamInfo.segmentIndexSource = {
          create: function() { return Promise.resolve(index); }
        };
        p.then(function() {
          return writer.insertStream_(streamInfo, index, testInitData, 1, 0);
        }).then(function(streamId) {
          return reader.retrieveStreamIndex(streamId);
        }).then(function(streamIndex) {
          expect(streamIndex.references[0]).toMatchReference(
              { start_time: 0, end_time: null });
          expect(streamIndex.codecs).toEqual(codecs);
          expect(streamIndex.mime_type).toEqual(mime);
          expect(streamIndex.init_segment).toEqual(testInitData);
          done();
        }).catch(function(err) {
          fail(err);
          done();
        });
      });

  // Bug #157:
  it('stores a stream with an explicit end time', function(done) {
    var references = [
      new shaka.media.SegmentReference(0, 100, createFailover(url))
    ];
    var index = new shaka.media.SegmentIndex(references);
    streamInfo.segmentIndexSource = {
      create: function() { return Promise.resolve(index); }
    };
    p.then(function() {
      return writer.insertStream_(streamInfo, index, testInitData, 1, 0);
    }).then(function(streamId) {
      return reader.retrieveStreamIndex(streamId);
    }).then(function(streamIndex) {
      expect(streamIndex.references.length).toEqual(1);
      expect(streamIndex.references[0]).toMatchReference(
          { start_time: 0, end_time: 100 });
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('throws an error when trying to store an invalid stream', function(done) {
    p.then(function() {
      return writer.insertStream_(null, null, null, 0, 0);
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
      return writer.insertStream_(
          streamInfo, testIndex, testInitData, testReferences.length, 0);
    }).then(function(data) {
      streamId = data;
      return writer.deleteStream_(streamId);
    }).then(function() {
      return reader.retrieveStreamIndex(streamId);
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
      return writer.insertStream_(
          streamInfo, testIndex, testInitData, testReferences.length, 0);
    }).then(function(streamId) {
      return reader.retrieveSegment(streamId, 0);
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
      return reader.retrieveSegment(-1, -1);
    }).then(function(streamIndex) {
      fail();
      done();
    }).catch(function(err) {
      expect(err.type).toEqual('storage');
      done();
    });
  });

  it('stores and retrieves a group information', function(done) {
    p.then(function() {
      return writer.insertGroup(
          [streamInfo], ['ABCD', 'EFG'], duration, drmInfo);
    }).then(function(groupId) {
      return reader.retrieveGroup(groupId);
    }).then(function(groupInformation) {
      expect(groupInformation.group_id).toEqual(jasmine.any(Number));
      expect(groupInformation.stream_ids.length).toEqual(1);
      expect(groupInformation.session_ids).toEqual(['ABCD', 'EFG']);
      expect(groupInformation.duration).toEqual(duration);
      expect(groupInformation.key_system).toEqual(keySystem);
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('retrieves a list of the stored group IDs', function(done) {
    var initalGroupIdsLength = 0;
    p.then(function() {
      return reader.retrieveGroupIds();
    }).then(function(groupIds) {
      initalGroupIdsLength = groupIds.length;
      return writer.insertGroup([streamInfo], ['HIJK'], duration, drmInfo);
    }).then(function() {
      return reader.retrieveGroupIds();
    }).then(function(groupIds) {
      expect(groupIds.length - initalGroupIdsLength).toBe(1);
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

  it('deletes group information and throws error on retrieval', function(done) {
    var groupId;
    p.then(function() {
      return writer.insertGroup([streamInfo], [], duration, drmInfo);
    }).then(function(resultingGroupId) {
      groupId = resultingGroupId;
      return writer.deleteGroup(groupId);
    }).then(function() {
      return reader.retrieveGroup(groupId);
    }).then(function(groupInformation) {
      fail();
      done();
    }).catch(function(err) {
      expect(err.type).toEqual('storage');
      done();
    });
  });

  it('deletes streams in group and throws error on retrieval', function(done) {
    var streamIds, groupId;
    p.then(function() {
      return writer.insertGroup([streamInfo], [], duration, drmInfo);
    }).then(function(id) {
      groupId = id;
      return reader.retrieveGroup(groupId);
    }).then(function(data) {
      streamIds = data['stream_ids'];
      return writer.deleteGroup(groupId);
    }).then(function() {
      return reader.retrieveStreamIndex(streamIds[0]);
    }).then(function(streamIndex) {
      fail();
      done();
    }).catch(function(err) {
      expect(err.type).toEqual('storage');
      done();
    });
  });

  it('converts old format of data to new format', function(done) {
    var streamId, groupId;
    p.then(function() {
      return writer.insertGroup([streamInfo], [], duration, drmInfo);
    }).then(function(currentGroupId) {
      groupId = currentGroupId;
      return reader.retrieveGroup(currentGroupId);
    }).then(function(groupInfo) {
      var p = shaka.util.PublicPromise();
      delete groupInfo.duration;
      delete groupInfo.key_system;
      streamId = groupInfo.stream_ids[0];
      var groupStore = writer.getGroupStore();
      var request = groupStore.put(groupInfo);
      request.onsuccess = function() { p.resolve(); };
      request.onerror = function(e) { p.reject(request.error); };
      return p;
    }).then(function() {
      return reader.retrieveStreamIndex(streamId);
    }).then(function(streamIndex) {
      var p = shaka.util.PublicPromise();
      streamIndex.duration = 25;
      streamIndex.key_system = 'test.key.system';
      var indexStore = writer.getIndexStore();
      var request = indexStore.put(streamIndex);
      request.onsuccess = function() { p.resolve(); };
      request.onerror = function(e) { p.reject(request.error); };
      return p;
    }).then(function() {
      return reader.retrieveGroup(groupId);
    }).then(function(groupInfo) {
      expect(groupInfo.duration).toEqual(25);
      expect(groupInfo.key_system).toEqual('test.key.system');
      done();
    }).catch(function(err) {
      fail(err);
      done();
    });
  });

});

