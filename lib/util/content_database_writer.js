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

goog.provide('shaka.util.ContentDatabaseWriter');

goog.require('shaka.asserts');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.player.Defaults');
goog.require('shaka.player.DrmInfo');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.ContentDatabase');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.TypedBind');


/**
 * @event shaka.util.ContentDatabaseWriter.ProgressEvent
 * @description Fired to indicate progess while downloading and storing streams.
 * @property {string} type 'progress'
 * @property {number} detail Percentage of group references already stored.
 * @property {boolean} bubbles True
 */



/**
 * Creates a new ContentDatabaseWriter.
 *
 * @param {shaka.util.IBandwidthEstimator} estimator
 * @param {shaka.util.FakeEventTarget} parent
 *
 * @fires shaka.util.ContentDatabaseWriter.ProgressEvent
 *
 * @constructor
 * @struct
 * @extends {shaka.util.ContentDatabase}
 */
shaka.util.ContentDatabaseWriter = function(estimator, parent) {
  shaka.util.ContentDatabase.call(this, 'readwrite', parent);

  /** @private {shaka.util.IBandwidthEstimator} */
  this.estimator_ = estimator;

  /** @private {number} */
  this.segmentRequestTimeout_ = shaka.player.Defaults.SEGMENT_REQUEST_TIMEOUT;
};
goog.inherits(shaka.util.ContentDatabaseWriter, shaka.util.ContentDatabase);


/**
 * The target size of each chunk in bytes of content stored in the database.
 *
 * @private {number}
 * @const
 */
shaka.util.ContentDatabaseWriter.TARGET_SEGMENT_SIZE_ = 1 * 1024 * 1024;


/**
 * @typedef {{
 *    streamId: number,
 *    segment: ArrayBuffer,
 *    segmentId: number,
 *    references: !Array.<shaka.util.ContentDatabase.SegmentInformation>,
 *    firstReference: shaka.media.SegmentReference,
 *    totalReferences: number,
 *    referencesInserted: number
 *  }}
 */
shaka.util.ContentDatabaseWriter.InsertStreamState;


/**
 * Sets the segment request timeout in seconds.
 *
 * @param {number} timeout
 */
shaka.util.ContentDatabaseWriter.prototype.setSegmentRequestTimeout =
    function(timeout) {
  shaka.asserts.assert(!isNaN(timeout));
  this.segmentRequestTimeout_ = timeout;
};


/**
 * Inserts a group of streams into the database.
 * @param {!Array.<!shaka.media.StreamInfo>} streamInfos The streams to insert
 *    as a group.
 * @param {!Array.<string>} sessionIds The IDs of the MediaKeySessions for
 *    this group.
 * @param {?number} duration The max stream's entire duration in the group.
 * @param {shaka.player.DrmInfo} drmInfo The group's DrmInfo.
 * @return {!Promise.<number>} The unique id assigned to the group.
 */
shaka.util.ContentDatabaseWriter.prototype.insertGroup = function(
    streamInfos, sessionIds, duration, drmInfo) {
  /** @type {!Array.<!shaka.media.SegmentIndex>} */
  var segmentIndexes = [];

  /** @type {!Array.<ArrayBuffer>} */
  var initDatas = [];

  var totalReferences = 0;
  var referencesInserted = 0;
  var streamIds = [];

  // Create SegmentIndexes.
  var async1 = streamInfos.map(
      function(streamInfo) {
        return streamInfo.segmentIndexSource.create();
      });
  var promise1 = Promise.all(async1);

  // Create initialization datas.
  var async2 = streamInfos.map(
      function(streamInfo) {
        return streamInfo.segmentInitSource.create();
      });
  var promise2 = Promise.all(async2);

  var p = Promise.all([promise1, promise2]).then(
      /** @param {!Array} results */
      function(results) {
        segmentIndexes = results[0];
        initDatas = results[1];
        totalReferences = segmentIndexes.reduce(
            function(sum, index) {
              return sum + index.length();
            }, 0);
      });

  // Insert each stream into the database.
  for (var i = 0; i < streamInfos.length; ++i) {
    p = p.then(
        function(index) {
          return this.insertStream_(streamInfos[index],
                                    segmentIndexes[index],
                                    initDatas[index],
                                    totalReferences,
                                    referencesInserted);
        }.bind(this, i));

    p = p.then(
        function(index, streamId) {
          referencesInserted += segmentIndexes[index].length();
          streamIds.push(streamId);
        }.bind(this, i));
  }

  return p.then(shaka.util.TypedBind(this,
      function() {
        return this.getNextId_(this.getGroupStore());
      })
  ).then(shaka.util.TypedBind(this,
      /** @param {number} groupId */
      function(groupId) {
        var groupPromise = new shaka.util.PublicPromise();

        sessionIds = shaka.util.ArrayUtils.removeDuplicates(sessionIds);
        var groupInfo = {
          'group_id': groupId,
          'stream_ids': streamIds,
          'session_ids': sessionIds,
          'duration': duration,
          'key_system': drmInfo.keySystem,
          'license_server': drmInfo.licenseServerUrl,
          'with_credentials': drmInfo.withCredentials,
          'distinctive_identifier': drmInfo.distinctiveIdentifierRequired,
          'audio_robustness': drmInfo.audioRobustness,
          'video_robustness': drmInfo.videoRobustness
        };
        var request = this.getGroupStore().put(groupInfo);

        request.onsuccess = function() { groupPromise.resolve(groupId); };
        request.onerror = function(e) { groupPromise.reject(request.error); };

        return groupPromise;
      }));
};


/**
 * Deletes a group of streams from the database.
 * @param {number} groupId The unique id of the group to delete.
 * @return {!Promise}
 */
shaka.util.ContentDatabaseWriter.prototype.deleteGroup = function(groupId) {
  var p = this.retrieveItem(this.getGroupStore(), groupId);
  return p.then(shaka.util.TypedBind(this,
      /** @param {shaka.util.ContentDatabase.GroupInformation} groupInfo */
      function(groupInfo) {
        var async = [];
        for (var id in groupInfo['stream_ids']) {
          async.push(this.deleteStream_(groupInfo['stream_ids'][id]));
        }
        var groupStore = this.getGroupStore();
        async.push(groupStore.delete(groupId));
        return Promise.all(async);
      }));
};


/**
 * Inserts a stream into the database.
 * @param {!shaka.media.StreamInfo} streamInfo
 * @param {!shaka.media.SegmentIndex} segmentIndex
 * @param {ArrayBuffer} initData
 * @param {number} totalReferences Number of references in this streams group.
 * @param {number} referencesInserted Number of references already inserted.
 * @return {!Promise.<number>} The unique id assigned to the stream.
 * @private
 */
shaka.util.ContentDatabaseWriter.prototype.insertStream_ = function(
    streamInfo, segmentIndex, initData, totalReferences, referencesInserted) {
  var async = [
    this.getNextId_(this.getIndexStore()),
    this.getNextId_(this.getContentStore().index('stream'))
  ];

  var p = Promise.all(async).then(shaka.util.TypedBind(this, function(results) {
    /** @type {!shaka.util.ContentDatabaseWriter.InsertStreamState} */
    var state = {
      streamId: Math.max(results[0], results[1]),
      segment: new ArrayBuffer(0),
      segmentId: 0,
      references: [],
      firstReference: null,
      totalReferences: totalReferences,
      referencesInserted: referencesInserted
    };
    return state;
  }));
  p = p.then(this.insertStreamContent_.bind(this, segmentIndex));
  p = p.then(this.insertStreamIndex_.bind(this, streamInfo, initData));
  return p;
};


/**
 * Gets the next id to be used in the given store. If no entries currently exist
 * 0 will be returned.
 * @param {!IDBObjectStore|!IDBIndex} store The store or store's index whose
 *    next id will be retrieved.
 * @return {!Promise.<number>} The next id or 0.
 * @private
 */
shaka.util.ContentDatabaseWriter.prototype.getNextId_ = function(store) {
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
 * @param {!shaka.media.StreamInfo} streamInfo
 * @param {ArrayBuffer} initData
 * @param {!shaka.util.ContentDatabaseWriter.InsertStreamState} state
 *     The stream's state information.
 * @return {!Promise.<number>} The unique id assigned to the stream.
 * @private
 */
shaka.util.ContentDatabaseWriter.prototype.insertStreamIndex_ = function(
    streamInfo, initData, state) {
  var p = new shaka.util.PublicPromise();
  var streamIndex = {
    'stream_id': state.streamId,
    'mime_type': streamInfo.mimeType,
    'codecs': streamInfo.codecs,
    'init_segment': initData,
    'references': state.references
  };
  var indexStore = this.getIndexStore();
  var request = indexStore.put(streamIndex);

  request.onsuccess = function() { p.resolve(state.streamId); };
  request.onerror = function(e) { p.reject(request.error); };

  return p;
};


/**
 * Inserts stream content into the stream content store.
 * @param {!shaka.media.SegmentIndex} segmentIndex
 * @param {!shaka.util.ContentDatabaseWriter.InsertStreamState} state The
 *     stream's state information.
 * @return {!Promise.<shaka.util.ContentDatabaseWriter.InsertStreamState>}
 * @private
 */
shaka.util.ContentDatabaseWriter.prototype.insertStreamContent_ = function(
    segmentIndex, state) {
  // Initialize promise and stream insertion information to use in loop.
  var segmentPromise = Promise.resolve();

  for (var i = 0; i < segmentIndex.length(); ++i) {
    var reference = segmentIndex.get(i);
    var isLast = (i == segmentIndex.length() - 1);
    var requestSegment = this.requestSegment_.bind(this, reference);
    var appendSegment = this.appendSegment_.bind(this, reference, state,
                                                 isLast);
    segmentPromise = segmentPromise.then(requestSegment);
    segmentPromise = segmentPromise.then(appendSegment);
  }
  return segmentPromise.then(
      function() {
        return Promise.resolve(state);
      }
  ).catch(shaka.util.TypedBind(this,
      /** {Error} e */
      function(e) {
        this.deleteStream_(state.streamId);
        return Promise.reject(e);
      }));
};


/**
 * Appends |segment| to |segments| and adds |segments| array to the database
 * if over target segment size or is the last segment.
 * @param {shaka.media.SegmentReference} ref The SegmentReference describing the
 *   current segment.
 * @param {shaka.util.ContentDatabaseWriter.InsertStreamState} state The state
 *     of the current stream being inserted.
 * @param {boolean} isLast True for the last segment in a stream.
 * @param {!ArrayBuffer} segment The current segment of the stream.
 * @return {!Promise}
 * @private
 */
shaka.util.ContentDatabaseWriter.prototype.appendSegment_ = function(
    ref, state, isLast, segment) {
  var p = new shaka.util.PublicPromise();

  if (state.segment.byteLength == 0) {
    state.firstReference = ref;
  }
  state.segment = this.concatArrayBuffers_(state.segment, segment);
  state.referencesInserted++;
  var percent = (state.referencesInserted / state.totalReferences) * 100;
  var event = shaka.util.FakeEvent.create(
      { type: 'progress',
        detail: percent,
        bubbles: true });
  var size = state.segment.byteLength;
  if (size >= shaka.util.ContentDatabaseWriter.TARGET_SEGMENT_SIZE_ || isLast) {
    var data = {
      'stream_id': state.streamId,
      'segment_id': state.segmentId,
      'content': state.segment
    };
    var request = this.getContentStore().put(data);
    var segRef = {
      'start_time': state.firstReference.startTime,
      'start_byte' : state.firstReference.url.startByte,
      'end_time': ref.endTime,
      'url': 'idb://' + state.streamId + '/' + state.segmentId
    };
    state.references.push(segRef);
    state.segmentId++;
    state.segment = new ArrayBuffer(0);

    request.onerror = function(e) { p.reject(request.error); };
    request.onsuccess = shaka.util.TypedBind(this, function() {
      this.dispatchEvent(event);
      p.resolve();
    });
  } else {
    this.dispatchEvent(event);
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
shaka.util.ContentDatabaseWriter.prototype.concatArrayBuffers_ =
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
shaka.util.ContentDatabaseWriter.prototype.requestSegment_ = function(
    reference) {
  var params = new shaka.util.AjaxRequest.Parameters();
  params.requestTimeoutMs = this.segmentRequestTimeout_ * 1000;
  return /** @type {!Promise.<!ArrayBuffer>} */ (
      reference.url.fetch(params, this.estimator_));
};


/**
 * Deletes a stream from the database.
 * @param {number} streamId The unique id of the stream to delete.
 * @return {!Promise}
 * @private
 */
shaka.util.ContentDatabaseWriter.prototype.deleteStream_ = function(streamId) {
  var p = new shaka.util.PublicPromise();
  var indexStore = this.getIndexStore();
  var request = indexStore.delete(streamId);
  request.onerror = function(e) { p.reject(request.error); };

  var store = this.getContentStore();
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

