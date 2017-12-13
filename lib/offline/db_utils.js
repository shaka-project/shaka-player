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

goog.provide('shaka.offline.DBUtils');


/**
 * @enum {string}
 */
shaka.offline.DBUtils.Mode = {
  READ_ONLY: 'readonly',
  READ_WRITE: 'readwrite'
};


/**
 * The name for the stores that are used in the version 2 of our
 * indexed db storage.
 *
 * @enum {string}
 */
shaka.offline.DBUtils.StoreV2 = {
  MANIFEST: 'manifest-v2',
  SEGMENT: 'segment-v2'
};


/**
 * The name for the stores that are used in the version 1 of our
 * indexed db storage.
 *
 * @enum {string}
 */
shaka.offline.DBUtils.StoreV1 = {
  MANIFEST: 'manifest',
  SEGMENT: 'segment'
};


/**
 * @param {IDBObjectStore} store
 * @param {function(number, Object)} callback
 */
shaka.offline.DBUtils.forEach = function(store, callback) {
  /** @type {IDBRequest}  */
  var request = store.openCursor();

  request.onsuccess = function(event) {
    /** @type {IDBCursor} */
    var cursor = event.target.result;

    if (!cursor) {
      // When we reach the end of the data that the cursor is iterating
      // over, |event.target.result| will be null to signal the end of the
      // iteration.
      // https://developer.mozilla.org/en-US/docs/Web/API/IDBCursor/continue
      return;
    }

    // Save the key and value so that we can still access them even if the
    // database's state changes because of the callback.
    /** @type {number} */
    var key = /** @type {number} */ (cursor.key);
    /** @type {Object} */
    var value = /** @type {Object} */ (cursor.value);

    // Advance the cursor before calling the callback so that it will work
    // even if the database's state changes because of the callback.
    cursor.continue();

    callback(key, value);
  };
};
