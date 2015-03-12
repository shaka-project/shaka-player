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

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.RangeRequest');
goog.require('shaka.util.TypedBind');



/**
 * Creates and manages a database for storing streams of content.
 * @param {shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
 *   attach to all data requests.
 *
 * @struct
 * @constructor
 */
shaka.util.ContentDatabase = function(estimator) {

  /** @private {IDBDatabase} */
  this.db_ = null;

  /** @private {shaka.util.IBandwidthEstimator} */
  this.estimator_ = estimator;

};


/**
 * The name of the IndexedDb instance.
 *
 * @private {string}
 * @const
 */
shaka.util.ContentDatabase.DB_NAME_ = 'content_database';


/**
 * The current version of the database.
 *
 * @private {number}
 * @const
 */
shaka.util.ContentDatabase.DB_VERSION_ = 1;


/**
 * The name of the group store in the IndexedDb instance.
 *
 * @private {string}
 * @const
 */
shaka.util.ContentDatabase.GROUP_STORE_ = 'group_store';


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
shaka.util.ContentDatabase.TARGET_SEGMENT_SIZE_ = 1 * 1024 * 1024;


/**
 * Opens a database instance. If a new version number is given the
 * onupgradeneeded event will be called. Must be run before any operations can
 * be performed on the database.
 * The database will have the structure:
 * Group Store: {
 *    group_id: number
 *    stream_ids: Array.<number>
 * }
 * Index Store: {
 *    stream_id: number,
 *    mime_type: string,
 *    references: [{shaka.util.ContentDatabase.SegmentInformation}]
 * }
 * Content Store: {
 *    stream_id: number,
 *    segment_id: number,
 *    content: ArrayBuffer
 * }
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.setUpDatabase = function() {
  var p = new shaka.util.PublicPromise();

  var indexedDB = window.indexedDB;
  var request = indexedDB.open(shaka.util.ContentDatabase.DB_NAME_,
                               shaka.util.ContentDatabase.DB_VERSION_);

  request.onupgradeneeded = shaka.util.TypedBind(this,
      /** @param {!Event} e */
      function(e) {
        this.db_ = e.target.result;

        this.createStore_(
            shaka.util.ContentDatabase.GROUP_STORE_, {keyPath: 'group_id'});
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

  request.onerror = function(e) { p.reject(request.error); };
  return p;
};


/**
 * Closes the connection to the database.
 */
shaka.util.ContentDatabase.prototype.closeDatabaseConnection = function() {
  if (this.db_) {
    this.db_.close();
  }
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
 *    segment: ArrayBuffer,
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
 *    start_byte: number,
 *    url: string
 *  }}
 */
shaka.util.ContentDatabase.SegmentInformation;


/**
 * @typedef {{
 *    stream_id: number,
 *    mime_type: string,
 *    codecs: string,
 *    duration: number,
 *    init_segment: ArrayBuffer,
 *    references: !Array.<shaka.util.ContentDatabase.SegmentInformation>
 *  }}
 */
shaka.util.ContentDatabase.StreamIndex;


/**
 * @typedef {{
 *    group_id: number,
 *    stream_ids: !Array.<number>
 *  }}
 */
shaka.util.ContentDatabase.GroupInformation;


/**
 * Inserts a group of stream ids into the database.
 * @param {!Array.<number>} streamIds The IDs of the streams in this group.
 * @return {!Promise.<number>} The unique id assigned to the group.
 */
shaka.util.ContentDatabase.prototype.insertGroup = function(streamIds) {
  return this.getNextId_(this.getGroupStore_()).then(shaka.util.TypedBind(this,
      /** @param {number} groupId */
      function(groupId) {
        var p = new shaka.util.PublicPromise();

        var groupInfo = {
          'group_id': groupId,
          'stream_ids': streamIds
        };
        var request = this.getGroupStore_().put(groupInfo);

        request.onsuccess = function() { p.resolve(groupId); };
        request.onerror = function(e) { p.reject(request.error); };

        return p;
      }));
};


/**
 * Inserts a stream into the database.
 * @param {string} mimeType The stream's mime type.
 * @param {string} codecs The stream's codecs.
 * @param {?number} duration The stream's entire duration.
 * @param {shaka.media.SegmentIndex} segmentIndex The stream's segment index.
 * @param {ArrayBuffer} initSegment The stream's segment of initialization data.
 * @return {!Promise.<number>} The unique id assigned to the stream.
 */
shaka.util.ContentDatabase.prototype.insertStream = function(mimeType,
                                                             codecs,
                                                             duration,
                                                             segmentIndex,
                                                             initSegment) {
  shaka.asserts.assert(segmentIndex);
  shaka.asserts.assert(segmentIndex.getNumReferences() > 0);

  var p = this.getNextId_(this.getIndexStore_());
  // Cast as workaround for closure compiler issue.
  p = /** @type {!Promise.<shaka.util.ContentDatabase.InsertStreamState>} */ (
      p.then(this.insertStreamContent_.bind(this, segmentIndex)));
  p = /** @type {!Promise.<number>} */ (
      p.then(this.insertStreamIndex_.bind(
          this, mimeType, codecs, duration, initSegment)));
  return p;
};


/**
 * Gets the next id to be used in the given store. If no entries currently exist
 * 0 will be returned.
 * @param {!IDBObjectStore} store The store whose next id will be retrieved.
 * @return {!Promise.<number>} The next id or 0.
 * @private
 */
shaka.util.ContentDatabase.prototype.getNextId_ = function(store) {
  var p = new shaka.util.PublicPromise();
  var request = store.openCursor(null, 'prev');
  request.onsuccess = function(e) {
    if (e.target.result) {
      var nextId = e.target.result.key + 1;
      p.resolve(nextId);
    } else {
      p.resolve(0);
    }
  };
  request.onerror = function(e) { p.reject(request.error); };
  return p;
};


/**
 * Inserts a stream index into the stream index store.
 * @param {string} mimeType The stream's mime type.
 * @param {string} codecs The stream's codecs.
 * @param {?number} duration The stream's entire duration.
 * @param {ArrayBuffer} initSegment The stream's segment of initialization data.
 * @param {!shaka.util.ContentDatabase.InsertStreamState} state The stream's
 *    state information.
 * @return {!Promise.<number>} The unique id assigned to the stream.
 * @private
 */
shaka.util.ContentDatabase.prototype.insertStreamIndex_ = function(mimeType,
                                                                   codecs,
                                                                   duration,
                                                                   initSegment,
                                                                   state) {
  var p = new shaka.util.PublicPromise();
  var streamInfo = {
    'stream_id': state.streamId,
    'mime_type': mimeType,
    'codecs': codecs,
    'duration': duration,
    'init_segment': initSegment,
    'references': state.references
  };
  var indexStore = this.getIndexStore_();
  var request = indexStore.put(streamInfo);

  request.onsuccess = function() { p.resolve(state.streamId); };
  request.onerror = function(e) { p.reject(request.error); };

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
  // Initialize promise and stream insertion information to use in loop.
  var segmentPromise = Promise.resolve();
  /** @type {!shaka.util.ContentDatabase.InsertStreamState} */
  var state = {
    streamId: streamId,
    segment: new ArrayBuffer(0),
    segmentId: 0,
    references: [],
    firstReference: null
  };

  for (var i = 0; i < segmentIndex.getNumReferences(); ++i) {
    var reference = segmentIndex.getReference(i);
    var requestSegment = this.requestSegment_.bind(this, reference);
    var appendSegment = this.appendSegment_.bind(this, reference, state);
    // Cast as workaround for closure compiler issue. Complier seems to think
    // this is returning a Promise.<Promise.<ArrayBuffer>>
    segmentPromise = /** @type {!Promise.<!ArrayBuffer>} */(
        segmentPromise.then(requestSegment));
    segmentPromise = segmentPromise.then(appendSegment);
  }
  return segmentPromise.then(function() {
    return Promise.resolve(state);
  });
};


/**
 * Appends |segment| to |segments| and adds |segments| array to the database
 * if over target segment size or is the last segment.
 * @param {shaka.media.SegmentReference} ref The SegmentReference describing the
 *   current segment.
 * @param {shaka.util.ContentDatabase.InsertStreamState} state The state of the
 *   current stream being inserted.
 * @param {!ArrayBuffer} segment The current segment of the stream.
 * @return {!Promise}
 * @private
 */
shaka.util.ContentDatabase.prototype.appendSegment_ = function(ref,
                                                               state,
                                                               segment) {
  var p = new shaka.util.PublicPromise();

  if (state.segment.byteLength == 0) {
    state.firstReference = ref;
  }
  state.segment = this.concatArrayBuffers_(state.segment, segment);
  var size = state.segment.byteLength;
  if (size >= shaka.util.ContentDatabase.TARGET_SEGMENT_SIZE_ ||
      ref.endTime == null) {
    var data = {
      'stream_id': state.streamId,
      'segment_id': state.segmentId,
      'content': state.segment
    };
    var request = this.getContentStore_().put(data);
    var segRef = {
      'index': state.segmentId,
      'start_time': state.firstReference.startTime,
      'start_byte' : state.firstReference.startByte,
      'end_time': ref.endTime,
      'url': 'idb://' + state.streamId + '/' + state.segmentId
    };
    state.references.push(segRef);
    state.segmentId++;
    state.segment = new ArrayBuffer(0);

    request.onerror = function(e) { p.reject(request.error); };
    request.onsuccess = function() { p.resolve(); };
  } else {
    p.resolve();
  }
  return p;
};


/**
 * Concatenates two ArrayBuffer's.
 * @param {ArrayBuffer} bufferOne The first ArrayBuffer.
 * @param {ArrayBuffer} bufferTwo The second ArrayBuffer.
 * @return {!ArrayBuffer}
 * @private
 */
shaka.util.ContentDatabase.prototype.concatArrayBuffers_ =
    function(bufferOne, bufferTwo) {
  var view = new Uint8Array(bufferOne.byteLength + bufferTwo.byteLength);
  view.set(new Uint8Array(bufferOne), 0);
  view.set(new Uint8Array(bufferTwo), bufferOne.byteLength);
  return view.buffer;
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
 * @param {number} streamId The unique id of the stream to retrieve.
 * @param {number} segmentId The id of the segment to retrieve.
 * @return {!Promise.<ArrayBuffer>}
 */
shaka.util.ContentDatabase.prototype.retrieveSegment = function(streamId,
                                                                segmentId) {
  return this.retrieveInternal_(
      this.getContentStore_().index('segment'), [streamId, segmentId]).then(
      function(data) {
        return Promise.resolve(data.content);
      });
};


/**
 * Retrieves the index for a stream from the database.
 * @param {number} streamId The unique id of the stream.
 * @return {!Promise.<shaka.util.ContentDatabase.StreamIndex>}
 */
shaka.util.ContentDatabase.prototype.retrieveStreamIndex = function(streamId) {
  return this.retrieveInternal_(this.getIndexStore_(), streamId);
};


/**
 * Retrieves the initialization segment for the given stream.
 * @param {number} streamId The unique id of the stream.
 * @return {!Promise.<ArrayBuffer>}
 */
shaka.util.ContentDatabase.prototype.retrieveInitSegment = function(streamId) {
  return this.retrieveStreamIndex(streamId).then(
      /** @param {shaka.util.ContentDatabase.StreamIndex} result */
      function(result) {
        return Promise.resolve(result.init_segment);
      });
};


/**
 * Retrieves the group for a stream from the database.
 * @param {number} groupId The unique id of the group.
 * @return {!Promise.<shaka.util.ContentDatabase.GroupInformation>} The unique
 *    Ids of the streams the group.
 */
shaka.util.ContentDatabase.prototype.retrieveGroup = function(groupId) {
  return this.retrieveInternal_(this.getGroupStore_(), groupId);
};


/**
 * Retrieves an item from a store in the database.
 * @param {!IDBObjectStore|!IDBIndex} store The store to request an item from.
 * @param {number|!Array} id The unique id(s) of item in the store.
 * @return {!Promise}
 * @private
 */
shaka.util.ContentDatabase.prototype.retrieveInternal_ = function(store, id) {
  var p = new shaka.util.PublicPromise();

  var request = store.get(id);

  request.onerror = function(e) { p.reject(request.error); };
  request.onsuccess = function() {
    if (request.result) {
      p.resolve(request.result);
    } else {
      var error = new Error('Item not found.');
      error.type = 'storage';
      p.reject(error);
    }
  };

  return p;
};


/**
 * Deletes a stream from the database.
 * @param {number} streamId The unique id of the stream to delete.
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.deleteStream = function(streamId) {
  var p = new shaka.util.PublicPromise();
  var indexStore = this.getIndexStore_();
  var request = indexStore.delete(streamId);
  request.onerror = function(e) { p.reject(request.error); };

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
 * Deletes a group of streams from the database.
 * @param {number} groupId The unique id of the group to delete.
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.deleteGroup = function(groupId) {
  return this.retrieveGroup(groupId).then(shaka.util.TypedBind(this,
      /** @param {shaka.util.ContentDatabase.GroupInformation} result */
      function(result) {
        var async = [];
        for (var id in result.stream_ids) {
          async.push(this.deleteStream(result.stream_ids[id]));
        }
        var groupStore = this.getGroupStore_();
        async.push(groupStore.delete(groupId));
        return Promise.all(async);
      }));
};


/**
 * Deletes the current database. All connections to the database must be closed
 * before it can be deleted.
 * @return {!Promise}
 */
shaka.util.ContentDatabase.prototype.deleteDatabase = function() {
  var p = new shaka.util.PublicPromise();
  this.closeDatabaseConnection();
  var deleteRequest = window.indexedDB.deleteDatabase(
      shaka.util.ContentDatabase.DB_NAME_);

  deleteRequest.onsuccess = function(e) {
    shaka.asserts.assert(e.newVersion == null);
    p.resolve();
  };
  deleteRequest.onerror = function(e) { p.reject(deleteRequest.error); };
  return p;
};


/**
 * Opens a read and write enabled reference to the content store.
 * @return {!IDBObjectStore} A read and write enabled reference to the
 *     content store.
 * @private
 */
shaka.util.ContentDatabase.prototype.getContentStore_ = function() {
  return this.getStore_(shaka.util.ContentDatabase.CONTENT_STORE_);
};


/**
 * Opens a read and write enabled reference to the index store.
 * @return {!IDBObjectStore} A read and write enabled reference to the
 *     index store.
 * @private
 */
shaka.util.ContentDatabase.prototype.getIndexStore_ = function() {
  return this.getStore_(shaka.util.ContentDatabase.INDEX_STORE_);
};


/**
 * Opens a read and write enabled reference to the group store.
 * @return {!IDBObjectStore} A read and write enabled reference to the
 *     group store.
 * @private
 */
shaka.util.ContentDatabase.prototype.getGroupStore_ = function() {
  return this.getStore_(shaka.util.ContentDatabase.GROUP_STORE_);
};


/**
 * Opens a read and write enabled reference to a store.
 * @param {string} storeName The name of a store in the database.
 * @return {!IDBObjectStore} A read and write enabled reference to a store.
 * @private
 */
shaka.util.ContentDatabase.prototype.getStore_ = function(storeName) {
  var trans = this.db_.transaction([storeName], 'readwrite');
  return trans.objectStore(storeName);
};
