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

  /** @private {shakaExtern.ManifestDB} */
  this.manifest_ = shaka.test.ManifestDBBuilder.emptyManifest_();

  /** @private {?shakaExtern.PeriodDB} */
  this.currentPeriod_ = null;
  /** @private {?shakaExtern.StreamDB} */
  this.currentStream_ = null;
  /** @private {number} */
  this.nextStreamId_ = 0;

  /** @private {!Promise} */
  this.deferredActions_ = Promise.resolve();
};


/**
 * Mark the end of building the manifest and return the id it was stored under.
 * @return {!Promise<number>}
 */
shaka.test.ManifestDBBuilder.prototype.build = function() {
  /** @type {shakaExtern.ManifestDB} */
  let manifest = this.manifest_;

  /** @type {!shaka.offline.IStorageEngine} */
  let storageEngine = this.storageEngine_;

  return this.deferredActions_.then(function() {
    // TODO (vaage) : Calculate the duration and size of the manifest before
    //                writing the manifest to storage.
    return storageEngine.addManifest(manifest);
  });
};


/**
 * @param {function(shakaExtern.ManifestDB)} callback
 * @return {!shaka.test.ManifestDBBuilder}
 */
shaka.test.ManifestDBBuilder.prototype.onManifest = function(callback) {
  callback(this.manifest_);
  return this;
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
  let period = {
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
  let id = this.nextStreamId_++;

  /** @type {shakaExtern.StreamDB} */
  let stream = {
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
    initSegmentKey: null,
    encrypted: false,
    keyId: null,
    segments: [],
    variantIds: []
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
  goog.asserts.assert(
      this.currentStream_,
      'Must have current stream when using onStream.');

  /** @type {shakaExtern.StreamDB} */
  let stream = this.currentStream_;

  // Need to defer this function as the segments would not have been
  // added to it yet.
  this.deferredActions_ = this.deferredActions_.then(function() {
    func(stream);
  });

  return this;
};


/**
 * Add a new init segment to the current stream. This should only be called
 * after a call to |stream|. There should only be one call to |initSegment|
 * per call to |stream|.
 * @return {!shaka.test.ManifestDBBuilder}
 */
shaka.test.ManifestDBBuilder.prototype.initSegment = function() {
  goog.asserts.assert(
      this.currentStream_,
      'Must have a currewnt stream to add a segment.');

  /** @type {!shaka.offline.IStorageEngine} */
  let storageEngine = this.storageEngine_;

  /** @type {shakaExtern.SegmentDataDB} */
  let segmentData = shaka.test.ManifestDBBuilder.emptySegment_();

  /** @type {shakaExtern.StreamDB} */
  let currentStream = this.currentStream_;

  this.deferredActions_ = this.deferredActions_.then(function() {
    return storageEngine.addSegment(segmentData);
  }).then(function(id) {
    currentStream.initSegmentKey = id;
  });

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
  goog.asserts.assert(
      this.currentStream_,
      'Must have a current stream to add a segment.');
  goog.asserts.assert(
      start < end,
      'Start should always be less than end');

  /** @type {!shaka.offline.IStorageEngine} */
  let storageEngine = this.storageEngine_;

  /** @type {shakaExtern.SegmentDataDB} */
  let segmentData = shaka.test.ManifestDBBuilder.emptySegment_();

  /** @type {shakaExtern.StreamDB} */
  let currentStream = this.currentStream_;

  this.deferredActions_ = this.deferredActions_.then(function() {
    return storageEngine.addSegment(segmentData);
  }).then(function(id) {
    /** @type {shakaExtern.SegmentDB} */
    let segment = {
      dataKey: id,
      startTime: start,
      endTime: end
    };

    currentStream.segments.push(segment);
  });

  return this;
};


/**
 * Create an empty manifest as the starting point for all manifests.
 * @return {shakaExtern.ManifestDB}
 * @private
 */
shaka.test.ManifestDBBuilder.emptyManifest_ = function() {
  /** @type {shakaExtern.ManifestDB} */
  let manifest = {
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


/**
 * Create an empty segment that can be inserted into storage. The data in this
 * segment is meaningless.
 * @return {shakaExtern.SegmentDataDB}
 * @private
 */
shaka.test.ManifestDBBuilder.emptySegment_ = function() {
  /** @type {shakaExtern.SegmentDataDB} */
  let segment = {
    data: new ArrayBuffer(0)
  };

  return segment;
};
