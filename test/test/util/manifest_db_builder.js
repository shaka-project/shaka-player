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

goog.provide('shaka.test.ManifestDBBuilder');



/**
 * Initialize a builder that will build a new ManifestDB object and save it
 * and all segments to the given |shaka.offline.IStorageEngine|. Each
 * builder is only good for building a single manifest.
 *
 * @param {!shaka.offline.IStorageEngine} storageEngine
 * @constructor
 */
shaka.test.ManifestDBBuilder = function(storageEngine) {
  /** @private {!shaka.offline.IStorageEngine} */
  this.storageEngine_ = storageEngine;

  /** @type {number} */
  var manifestId = this.storageEngine_.reserveId('manifest');
  /** @private {shakaExtern.ManifestDB} */
  this.manifest_ = shaka.test.ManifestDBBuilder.emptyManifest_(manifestId);

  /** @private {?shakaExtern.PeriodDB} */
  this.currentPeriod_ = null;
  /** @private {?shakaExtern.StreamDB} */
  this.currentStream_ = null;
  /** @private {number} */
  this.nextStreamId_ = 0;

  /** @private {Array<!Promise>} */
  this.storageActions_ = [];
};


/**
 * Mark the end of building the manifest and return it for use.
 * @return {!Promise<shakaExtern.ManifestDB>}
 */
shaka.test.ManifestDBBuilder.prototype.build = function() {
  /** @type {shakaExtern.ManifestDB} */
  var manifest = this.manifest_;

  /** @type {!shaka.offline.IStorageEngine} */
  var storageEngine = this.storageEngine_;

  shaka.log.info(this.storageActions_.length, ' actions');

  return Promise.all(this.storageActions_)
      .then(function() {
        // TODO (vaage) : Calculate the duration and size of the manifest before
        //                writing the manifest to storage.
        return storageEngine.insert('manifest', manifest);
      })
      .then(function() {
        return manifest;
      });
};


/**
 * Add meta data to the manifest.
 * @param {!Object} data
 * @return {!shaka.test.ManifestDBBuilder}
 */
shaka.test.ManifestDBBuilder.prototype.metadata = function(data) {
  this.manifest_.appMetadata = data;
  return this;
};


/**
 * Add a new period to the manifest.
 * @return {!shaka.test.ManifestDBBuilder}
 */
shaka.test.ManifestDBBuilder.prototype.period = function() {
  /** @type {shakaExtern.PeriodDB} */
  var period = {
    startTime: 0,
    streams: []
  };

  this.currentPeriod_ = period;
  this.manifest_.periods.push(period);

  return this;
};


/**
 * Add a new stream to the current period. This should only be called after
 * a call to |period|.
 * @return {!shaka.test.ManifestDBBuilder}
 */
shaka.test.ManifestDBBuilder.prototype.stream = function() {
  /** @type {number} */
  var id = this.nextStreamId_++;

  /** @type {shakaExtern.StreamDB} */
  var stream = {
    id: id,
    primary: false,
    presentationTimeOffset: 0,
    contentType: 'video',
    mimeType: 'video/avc',
    codecs: '',
    frameRate: 24,
    kind: undefined,
    language: '',
    label: '',
    width: 1920,
    height: 1080,
    initSegmentUri: null,
    encrypted: false,
    keyId: null,
    segments: [],
    variantIds: null
  };

  this.currentStream_ = stream;
  this.currentPeriod_.streams.push(stream);

  return this;
};


/**
 * Access and edit the current stream.
 * @param {function(shakaExtern.StreamDB)} func
 * @return {!shaka.test.ManifestDBBuilder}
 */
shaka.test.ManifestDBBuilder.prototype.onStream = function(func) {
  /** @type {?shakaExtern.StreamDB} */
  var stream = this.currentStream_;
  goog.asserts.assert(stream, 'Must have current stream when using onStream.');
  shaka.log.info(stream);
  func(stream);
  return this;
};


/**
 * Add a new init segment to the current stream. This should only be called
 * after a call to |stream|. There should only be one call to |initSegment|
 * per call to |stream|.
 * @return {!shaka.test.ManifestDBBuilder}
 */
shaka.test.ManifestDBBuilder.prototype.initSegment = function() {
  /** @const */
  var Scheme = shaka.offline.OfflineScheme;

  /** @type {!shaka.offline.IStorageEngine} */
  var storageEngine = this.storageEngine_;

  /** @type {number} */
  var id = storageEngine.reserveId('segment');
  /** @type {string} */
  var uri = Scheme.segmentToUri(
      this.manifest_.key, this.currentStream_.id, id);

  this.currentStream_.initSegmentUri = uri;

  this.storageActions_.push(
      storageEngine.insert('segment', {key: id}));

  return this;
};


/**
 * Add a new segment to the current stream. This should only be called
 * after a call to |stream|.
 * @param {number} start
 * @param {number} end
 * @return {!shaka.test.ManifestDBBuilder}
 */
shaka.test.ManifestDBBuilder.prototype.segment = function(start, end) {
  goog.asserts.assert(start < end, 'Start should always be less than end');

  /** @const */
  var Scheme = shaka.offline.OfflineScheme;

  /** @type {!shaka.offline.IStorageEngine} */
  var storageEngine = this.storageEngine_;

  /** @type {number} */
  var id = storageEngine.reserveId('segment');
  /** @type {string} */
  var uri = Scheme.segmentToUri(
      this.manifest_.key, this.currentStream_.id, id);

  /** @type {shakaExtern.SegmentDB} */
  var segment = {
    uri: uri,
    startTime: start,
    endTime: end
  };

  this.currentStream_.segments.push(segment);

  this.storageActions_.push(
      storageEngine.insert('segment', {key: id}));

  return this;
};


/**
 * Create an empty manifest as the starting point for all manifests.
 * @param {number} id
 * @return {shakaExtern.ManifestDB}
 * @private
 */
shaka.test.ManifestDBBuilder.emptyManifest_ = function(id) {
  /** @type {shakaExtern.ManifestDB} */
  var manifest = {
    key: id,
    originalManifestUri: '',
    duration: 10,  // TODO(vaage) : calculate this from the segments
    size: 10,
    expiration: Infinity,
    periods: [],
    sessionIds: [],
    drmInfo: null,
    appMetadata: {}
  };

  return manifest;
};
