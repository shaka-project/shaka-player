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

goog.provide('shaka.offline.IStorageEngine');

goog.require('shaka.util.IDestroyable');



/**
 * @interface
 * @extends {shaka.util.IDestroyable}
 */
shaka.offline.IStorageEngine = function() {};


/**
 * Get a single manifest from storage using the key associated
 * to the manifest.
 *
 * @param {number} key
 * @return {!Promise<shakaExtern.ManifestDB>}
 */
shaka.offline.IStorageEngine.prototype.getManifest;


/**
 * Iterate over all the manifests in storage.
 *
 * @param {function(number, shakaExtern.ManifestDB)} each
 * @return {!Promise}
 */
shaka.offline.IStorageEngine.prototype.forEachManifest;


/**
 * Add a manifest to storage.
 *
 * @param {shakaExtern.ManifestDB} value
 * @return {!Promise.<number>}
 */
shaka.offline.IStorageEngine.prototype.addManifest;


/**
 * Update a manifest already in storage.
 *
 * @param {number} key
 * @param {shakaExtern.ManifestDB} value
 * @return {!Promise}
 */
shaka.offline.IStorageEngine.prototype.updateManifest;


/**
 * Remove a manifest from storage using the associated key. If the key is
 * not found, this should be a no-op. When a manifest has been removed
 * or skipped (because not it was not found) |opt_onKeyRemoved| should be
 * called with the key that was removed.
 *
 * @param {!Array<number>} key
 * @param {?function(number)} onKeyRemoved
 * @return {!Promise}
 */
shaka.offline.IStorageEngine.prototype.removeManifests;


/**
 * Get a single segment from storage using the key associated
 * to the segment.
 *
 * @param {number} key
 * @return {!Promise<shakaExtern.SegmentDataDB>}
 */
shaka.offline.IStorageEngine.prototype.getSegment;


/**
 * Iterate over all the segments in storage.
 *
 * @param {function(number, shakaExtern.SegmentDataDB)} each
 * @return {!Promise}
 */
shaka.offline.IStorageEngine.prototype.forEachSegment;


/**
 * Add a segment to storage.
 *
 * @param {shakaExtern.SegmentDataDB} value
 * @return {!Promise.<number>}
 */
shaka.offline.IStorageEngine.prototype.addSegment;


/**
 * Remove a segment from storage using the associated key. If the key is
 * not found, this should be a no-op. When a segment has been removed
 * or skipped (because not it was not found) |opt_onKeyRemoved| should be
 * called with the key that was removed.
 *
 * @param {!Array<number>} key
 * @param {?function(number)} onKeyRemoved
 * @return {!Promise}
 */
shaka.offline.IStorageEngine.prototype.removeSegments;
