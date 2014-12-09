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
 * @fileoverview Stores and manages content streams in a database.
 */

goog.provide('shaka.util.ContentDatabase');

goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.RangeRequest');
goog.require('shaka.util.TypedBind');



/**
 * Creates and manages a database for storing streams of content.
 * @param {!shaka.util.FakeEventTarget} parent The parent for event bubbling.
 * @param {shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
 *   attach to all data requests.
 *
 * @struct
 * @constructor
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.util.ContentDatabase = function(parent, estimator) {
  shaka.util.FakeEventTarget.call(this, parent);

  /** @private {IDBDatabase} */
  this.db_ = null;

  /** @private {shaka.util.IBandwidthEstimator} */
  this.estimator_ = estimator;

};
goog.inherits(shaka.util.ContentDatabase, shaka.util.FakeEventTarget);


/**
 * The name of the IndexedDb instance.
 *
 * @private {string}
 * @const
 */
shaka.util.ContentDatabase.DB_NAME_ = 'content_database';


/**
 * The name of the index store in the IndexedDb instance.
 *
 * @private {string}
 * @const
 */
shaka.util.ContentDatabase.INDEX_STORE_ = 'stream_index_store';


/**
 * The name of the content store in the IndexedDb instance.
 *
 * @private {string}
 * @const
 */
shaka.util.ContentDatabase.CONTENT_STORE_ = 'content_store';


/**
 * The target size of each chunk in bytes of content stored in the database.
 *
 * @private {number}
 * @const
 */
shaka.util.ContentDatabase.TARGET_SEGMENT_SIZE_ = 64 * 1024 * 1024;


/**
 * Opens a database instance. If a new version number is given the
 * onupgradeneeded event will be called.
 * The database will have the structure:
 * Index Store: {
 *    stream_id: number,
 *    mime_type: string,
 *    references: [{shaka.util.ContentDatabase.SegmentInformation}]
 * }
 * Content Store: {
 *    stream_id: number,
 *    segment_id: number,
 *    content: Array.<ArrayBuffer>
 * }
 * @param {number} version The current version of the database instance.
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.setUpDatabase = function(version) {
  var p = new shaka.util.PublicPromise();
  var indexedDB = window.indexedDB;
  var request = indexedDB.open(shaka.util.ContentDatabase.DB_NAME_, version);

  request.onupgradeneeded = shaka.util.TypedBind(this,
      /** @param {!Event} e */
      function(e) {
        this.db_ = e.target.result;

        this.createStore_(
            shaka.util.ContentDatabase.INDEX_STORE_, {keyPath: 'stream_id'});
        var contentStore = this.createStore_(
            shaka.util.ContentDatabase.CONTENT_STORE_, {autoIncrement: 'true'});

        contentStore.createIndex('segment',
                                 ['stream_id', 'segment_id'],
                                 {unique: true});
        contentStore.createIndex('stream',
                                 'stream_id',
                                 {unique: false});
      });

  request.onsuccess = shaka.util.TypedBind(this,
      /** @param {!Event} e */
      function(e) {
        // TODO(natalieharris): Handle Success and errors using events
        this.db_ = e.target.result;
        p.resolve();
      });

  request.onerror = function(e) { p.reject(e); };
  return p;
};


/**
 * Creates an object store in the database. It will replace any previous object
 * store with the same name in this database.
 * @param {string} name The unique name of the object store.
 * @param {Object} options The options for this object store including
 *    keyPath and autoIncrement, other options will be ignored.
 * @return {!IDBObjectStore}
 * @private
 */
shaka.util.ContentDatabase.prototype.createStore_ = function(name, options) {
  if (this.db_.objectStoreNames.contains(name)) {
    this.db_.deleteObjectStore(name);
  }
  return this.db_.createObjectStore(name, options);
};


/**
 * @typedef {{
 *    streamId: number,
 *    segments: !Array.<ArrayBuffer>,
 *    totalSegments: number,
 *    totalSize: number,
 *    segmentId: number,
 *    references: !Array.<shaka.util.ContentDatabase.SegmentInformation>,
 *    firstReference: shaka.media.SegmentReference
 *  }}
 */
shaka.util.ContentDatabase.InsertStreamState;


/**
 * @typedef {{
 *    index: number,
 *    start_time: number,
 *    end_time: number,
 *    url: string
 *  }}
 */
shaka.util.ContentDatabase.SegmentInformation;


/**
 * @typedef {{
 *    stream_id: number,
 *    mime_type: string,
 *    references: !Array.<shaka.util.ContentDatabase.SegmentInformation>
 *  }}
 */
shaka.util.ContentDatabase.StreamIndex;


/**
 * Inserts a stream into the database.
 * @param {!shaka.media.SegmentIndex} segmentIndex The index of
 *   segments in this stream.
 * @param {string} mimeType The mime type of this stream.
 * @return {!Promise.<number>} The unique id assigned to the stream.
 */
shaka.util.ContentDatabase.prototype.insertStream = function(segmentIndex,
                                                             mimeType) {
  shaka.asserts.assert(segmentIndex.getNumReferences() > 0);
  var p = this.getNextStreamId_();
  // Cast as workaround for closure compiler issue.
  p = /** @type {!Promise.<shaka.util.ContentDatabase.InsertStreamState>} */ (
      p.then(this.insertStreamContent_.bind(this, segmentIndex)));
  p = /** @type {!Promise.<number>} */ (
      p.then(this.insertStreamIndex_.bind(this, mimeType)));
  return p;
};


/**
 * Gets the next stream id to be used in the current database. If no streams
 * currently exist 0 will be returned as the first stream id.
 * @return {!Promise.<number>}
 * @private
 */
shaka.util.ContentDatabase.prototype.getNextStreamId_ = function() {
  var p = new shaka.util.PublicPromise();
  var request = this.getIndexStore_().openCursor(null, 'prev');
  request.onsuccess = function(e) {
    if (e.target.result) {
      var nextId = e.target.result.key + 1;
      p.resolve(nextId);
    } else {
      p.resolve(0);
    }
  };
  request.onerror = function(e) { p.reject(e); };
  return p;
};


/**
 * Inserts a stream index into the stream index store.
 * @param {string} mimeType The mime type of this stream.
 * @param {!shaka.util.ContentDatabase.InsertStreamState} state
 *    References to each segment in this stream.
 * @return {!Promise.<number>} The unique id assigned to the stream.
 * @private
 */
shaka.util.ContentDatabase.prototype.insertStreamIndex_ = function(mimeType,
                                                                   state) {
  var p = new shaka.util.PublicPromise();
  var streamInfo = {
    'stream_id': state.streamId,
    'mime_type': mimeType,
    'references': state.references
  };
  var indexStore = this.getIndexStore_();
  var request = indexStore.put(streamInfo);

  request.onsuccess = function() { p.resolve(state.streamId); };
  request.onerror = function(e) { p.reject(e); };

  return p;
};


/**
 * Inserts stream content into the stream content store.
 * @param {!shaka.media.SegmentIndex} segmentIndex The index of
 *   segments in this stream.
 * @param {number} streamId The unique id of the stream inserted.
 * @return {!Promise.<shaka.util.ContentDatabase.InsertStreamState>}
 * @private
 */
shaka.util.ContentDatabase.prototype.insertStreamContent_ = function(
    segmentIndex, streamId) {
  var p = new shaka.util.PublicPromise();
  var contentStore = this.getContentStore_();

  // Initialize promise and stream insertion information to use in loop.
  var segmentPromise = Promise.resolve();
  /** @type {!shaka.util.ContentDatabase.InsertStreamState} */
  var state = {
    streamId: streamId,
    segments: [],
    totalSegments: 0,
    totalSize: 0,
    segmentId: 0,
    references: [],
    firstReference: null
  };

  for (var i = 0; i < segmentIndex.getNumReferences(); ++i) {
    var reference = segmentIndex.getReference(i);
    var requestSegment = this.requestSegment_.bind(this, reference);
    var appendSegment = this.appendSegment_.bind(
        this, reference, state, contentStore);
    // Cast as workaround for closure compiler issue. Complier seems to think
    // this is returning a Promise.<Promise.<ArrayBuffer>>
    segmentPromise = /** @type {!Promise.<!ArrayBuffer>} */(
        segmentPromise.then(requestSegment));
    segmentPromise = segmentPromise.then(appendSegment);
  }

  contentStore.transaction.oncomplete = function() {
    if (state.totalSegments == segmentIndex.getNumReferences()) {
      p.resolve(state);
    }
  };
  return p;
};


/**
 * Appends |segment| to |segments| and adds |segments| array to the database
 * if over target segment size or is the last segment.
 * @param {shaka.media.SegmentReference} ref The SegmentReference describing the
 *   current segment.
 * @param {shaka.util.ContentDatabase.InsertStreamState} state The state of the
 *   current stream being inserted.
 * @param {IDBObjectStore} store The store to insert the content into.
 * @param {!ArrayBuffer} segment The current segment of the stream.
 * @return {!Promise}
 * @private
 */
shaka.util.ContentDatabase.prototype.appendSegment_ = function(ref,
                                                               state,
                                                               store,
                                                               segment) {
  if (state.segments.length == 0) {
    state.firstReference = ref;
  }
  state.segments.push(segment);
  state.totalSize += segment.byteLength;
  state.totalSegments++;
  if (state.totalSize >= shaka.util.ContentDatabase.TARGET_SEGMENT_SIZE_ ||
      ref.endTime == null) {
    var data = {
      'stream_id': state.streamId,
      'segment_id': state.segmentId,
      'content': state.segments
    };
    var request = store.put(data);
    var segRef = {
      'index': state.segmentId,
      'start_time': state.firstReference.startTime,
      'end_time': ref.endTime,
      'url': 'idb://' + state.streamId + '/' + state.segmentId
    };
    state.references.push(segRef);
    state.segmentId++;
    state.segments = [];
    state.totalSize = 0;
  }
  return Promise.resolve();
};


/**
 * Requests the segment specified by |reference|.
 * @param {shaka.media.SegmentReference} reference
 * @return {!Promise.<!ArrayBuffer>}
 * @private
 */
shaka.util.ContentDatabase.prototype.requestSegment_ = function(reference) {
  var requestSegment = new shaka.util.RangeRequest(
      reference.url.toString(),
      reference.startByte,
      reference.endByte);
  requestSegment.estimator = this.estimator_;
  return requestSegment.send();
};


/**
 * Retrieves the segment with |segmentId| from the stream with |streamId| in
 * the database.
 * @param {string} streamId The unique id of the stream to retrieve.
 * @param {number} segmentId The id of the segment to retrieve.
 * @return {!Promise.<!Array.<ArrayBuffer>>}
 */
shaka.util.ContentDatabase.prototype.retrieveSegment = function(streamId,
                                                                segmentId) {
  var p = new shaka.util.PublicPromise();

  var contentStore = this.getContentStore_();
  var request = contentStore.index('segment').get([streamId, segmentId]);

  request.onerror = function(e) { p.reject(e); };

  request.onsuccess = function() { p.resolve(request.result); };

  return p;
};


/**
 * Retrieves the index for a stream from the database.
 * @param {string} streamId The unique id of the stream.
 * @return {!Promise.<shaka.util.ContentDatabase.StreamIndex>}
 */
shaka.util.ContentDatabase.prototype.retrieveStreamIndex = function(streamId) {
  var p = new shaka.util.PublicPromise();

  var indexStore = this.getIndexStore_();
  var request = indexStore.get(streamId);

  request.onerror = function(e) { p.reject(e); };

  request.onsuccess = function() { p.resolve(request.result); };

  return p;
};


/**
 * Deletes a stream from the database.
 * @param {string} streamId The unique id of the stream to delete.
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.deleteStream = function(streamId) {
  var p = new shaka.util.PublicPromise();
  var indexStore = this.getIndexStore_();
  var request = indexStore.delete(streamId);
  request.onerror = function(e) { p.reject(e); };

  var store = this.getContentStore_();
  store.index('stream').openKeyCursor(IDBKeyRange.only(streamId)).onsuccess =
      function(event) {
    /** @type {!IDBCursor} */
    var cursor = event.target.result;
    if (cursor) {
      store.delete(cursor.primaryKey);
      cursor.continue();
    }
  };
  store.transaction.oncomplete = function(e) { p.resolve(); };
  return p;
};


/**
 * Deletes the current database.
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.deleteDatabase = function() {
  var p = new shaka.util.PublicPromise();
  this.db_.close();
  var deleteRequest = window.indexedDB.deleteDatabase(
      shaka.util.ContentDatabase.DB_NAME_);

  deleteRequest.onsuccess = function(e) {
    shaka.asserts.assert(e.newVersion == null);
    p.resolve();
  };
  deleteRequest.onerror = function(e) { p.reject(e); };
  return p;
};


/**
 * Opens a read and write enabled reference to the content store.
 * @return {!IDBObjectStore} A read and write enabled reference to the
 *     content store.
 * @private
 */
shaka.util.ContentDatabase.prototype.getContentStore_ = function() {
  var trans_content = this.db_.transaction(
      [shaka.util.ContentDatabase.CONTENT_STORE_], 'readwrite');
  return trans_content.objectStore(shaka.util.ContentDatabase.CONTENT_STORE_);
};


/**
 * Opens a read and write enabled reference to the index store.
 * @return {!IDBObjectStore} A read and write enabled reference to the
 *     index store.
 * @private
 */
shaka.util.ContentDatabase.prototype.getIndexStore_ = function() {
  var trans = this.db_.transaction(
      [shaka.util.ContentDatabase.INDEX_STORE_], 'readwrite');
  return trans.objectStore(shaka.util.ContentDatabase.INDEX_STORE_);
};
