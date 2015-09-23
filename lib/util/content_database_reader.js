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

goog.provide('shaka.util.ContentDatabaseReader');

goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.ContentDatabase');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.TypedBind');



/**
 * Creates a new ContentDatabaseReader.
 *
 * @constructor
 * @struct
 * @extends {shaka.util.ContentDatabase}
 */
shaka.util.ContentDatabaseReader = function() {
  shaka.util.ContentDatabase.call(this, 'readonly', null);
};
goog.inherits(shaka.util.ContentDatabaseReader, shaka.util.ContentDatabase);


/**
 * Retrieves an array of all stored group IDs.
 * @return {!Promise.<!Array.<number>>} The unique IDs of all of the
 *    stored groups.
 */
shaka.util.ContentDatabaseReader.prototype.retrieveGroupIds = function() {
  var p = new shaka.util.PublicPromise();
  var groupIds = [];
  var request = this.getGroupStore().openCursor();

  request.onerror = function(e) { p.reject(request.error); };
  request.onsuccess = function(e) {
    var cursor = e.target.result;
    if (cursor) {
      groupIds.push(cursor.key);
      cursor.continue();
    } else {
      p.resolve(groupIds);
    }
  };

  return p;
};


/**
 * Retrieves the group for a stream from the database.
 * @param {number} groupId The unique id of the group.
 * @return {!Promise.<shaka.util.ContentDatabase.GroupInformation>} The unique
 *    ids of the streams the group.
 */
shaka.util.ContentDatabaseReader.prototype.retrieveGroup = function(groupId) {
  var p = this.retrieveItem(this.getGroupStore(), groupId);
  return p.then(shaka.util.TypedBind(this,
      /** @param {shaka.util.ContentDatabase.GroupInformation} groupInfo */
      function(groupInfo) {
        groupInfo['session_ids'] =
            shaka.util.ArrayUtils.removeDuplicates(groupInfo['session_ids']);

        if (!groupInfo.hasOwnProperty('duration') &&
            !groupInfo.hasOwnProperty('key_system')) {
          return this.retrieveStreamIndex(groupInfo['stream_ids'][0]).then(
              function(index) {
                groupInfo['duration'] = index['duration'];
                groupInfo['key_system'] = index['key_system'];
                groupInfo['license_server'] = index['license_server'];
                groupInfo['with_credentials'] = index['with_credentials'];
                groupInfo['distinctive_identifier'] =
                    index['distinctive_identifier'];
                groupInfo['audio_robustness'] = index['audio_robustness'];
                groupInfo['video_robustness'] = index['video_robustness'];
                return Promise.resolve(groupInfo);
              });
        } else {
          return Promise.resolve(groupInfo);
        }
      }));
};


/**
 * Retrieves the index for a stream from the database.
 * @param {number} streamId The unique id of the stream.
 * @return {!Promise.<shaka.util.ContentDatabase.StreamIndex>}
 */
shaka.util.ContentDatabaseReader.prototype.retrieveStreamIndex = function(
    streamId) {
  return this.retrieveItem(this.getIndexStore(), streamId);
};


/**
 * Retrieves the segment with |segmentId| from the stream with |streamId| in
 * the database.
 * @param {number} streamId The unique id of the stream to retrieve.
 * @param {number} segmentId The id of the segment to retrieve.
 * @return {!Promise.<ArrayBuffer>}
 */
shaka.util.ContentDatabaseReader.prototype.retrieveSegment = function(
    streamId, segmentId) {
  var p = this.retrieveItem(
      this.getContentStore().index('segment'), [streamId, segmentId]);
  return p.then(function(data) { return Promise.resolve(data.content); });
};

