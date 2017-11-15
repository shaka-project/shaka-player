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

goog.provide('shaka.test.MemoryStorageEngine');



/**
 * An in-memory implementation of IStorageEngine.  This is used to test the
 * behavior of Storage using a fake StorageEngine.
 *
 * @struct
 * @constructor
 * @implements {shaka.offline.IStorageEngine}
 */
shaka.test.MemoryStorageEngine = function() {
  /** @private {!Object<number, shakaExtern.ManifestDB>} */
  this.manifests_ = {};
  /** @private {!Object<number, shakaExtern.SegmentDataDB>} */
  this.segments_ = {};

  /** @private {number} */
  this.nextManifestId_ = 0;
  /** @private {number} */
  this.nextSegmentId_ = 0;
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.destroy = function() {
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.getManifest = function(key) {
  var manifest = this.manifests_[key];
  return Promise.resolve(manifest);
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.forEachManifest = function(each) {
  shaka.util.MapUtils.forEach(this.manifests_, function(key, value) {
    return each(value);
  });
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.insertManifest =
    function(manifest) {
  this.manifests_[manifest.key] = manifest;
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.removeManifests =
    function(keys, opt_onRemoveKey) {
  var noop = function(key) { };

  shaka.test.MemoryStorageEngine.removeKeys_(
      this.manifests_, keys, opt_onRemoveKey || noop);

  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.reserveManifestId = function() {
  return this.nextManifestId_++;
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.getSegment = function(key) {
  var segment = this.segments_[key];
  return Promise.resolve(segment);
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.forEachSegment = function(each) {
  shaka.util.MapUtils.forEach(this.segments_, function(key, value) {
    return each(value);
  });
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.insertSegment = function(segment) {
  this.segments_[segment.key] = segment;
  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.removeSegments =
    function(keys, opt_onRemoveKey) {
  var noop = function(key) { };

  shaka.test.MemoryStorageEngine.removeKeys_(
      this.segments_, keys, opt_onRemoveKey || noop);

  return Promise.resolve();
};


/** @override */
shaka.test.MemoryStorageEngine.prototype.reserveSegmentId = function() {
  return this.nextSegmentId_++;
};


/**
 * @param {!Object<number, T>} group
 * @param {!Array<number>} keys
 * @param {function(number)} onRemove
 * @template T
 * @private
 */
shaka.test.MemoryStorageEngine.removeKeys_ = function(group, keys, onRemove) {
  keys.forEach(function(key) {
    delete group[key];
    onRemove(key);
  });
};
