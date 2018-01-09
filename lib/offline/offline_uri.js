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

goog.provide('shaka.offline.OfflineUri');


/**
 * @param {!number} id
 * @return {!string}
 */
shaka.offline.OfflineUri.manifestIdToUri = function(id) {
  return 'offline:manifest/' + id;
};


/**
 * @param {!string} uri
 * @return {?number}
 */
shaka.offline.OfflineUri.uriToManifestId = function(uri) {
  var parts = /^offline:manifest\/([0-9]+)$/.exec(uri);

  /** @type {?number} */
  var id = parts ? Number(parts[1]) : null;

  return id;
};


/**
 * @param {number} id
 * @return {!string}
 */
shaka.offline.OfflineUri.segmentIdToUri = function(id) {
  return 'offline:segment/' + id;
};


/**
 * @param {!string} uri
 * @return {?number}
 */
shaka.offline.OfflineUri.uriToSegmentId = function(uri) {
  var parts = /^offline:segment\/([0-9]+)$/.exec(uri);

  /** @type {?number} */
  var id = parts ? Number(parts[1]) : null;

  return id;
};
