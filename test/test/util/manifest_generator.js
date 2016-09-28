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

goog.provide('shaka.test.ManifestGenerator');



/**
 * A helper class used to generate manifests.  This is done by chaining multiple
 * calls together that build the manifest.  All the methods can appear at any
 * point and will apply to the most recent substructure.  For example, the
 * language() method sets the language of the most recent stream set.
 *
 * @param {*=} opt_shaka
 * @constructor
 * @struct
 */
shaka.test.ManifestGenerator = function(opt_shaka) {
  this.shaka_ = opt_shaka || window.shaka;

  var timeline = new this.shaka_.media.PresentationTimeline(0, 0);
  timeline.setSegmentAvailabilityDuration(Infinity);
  timeline.notifyMaxSegmentDuration(10);

  /** @private {shakaExtern.Manifest} */
  this.manifest_ = {
    presentationTimeline: timeline,
    periods: [],
    offlineSessionIds: [],
    minBufferTime: 0
  };

  /** @private {?shakaExtern.Stream} */
  this.partialStream_ = null;
};


/** @return {shakaExtern.Manifest} */
shaka.test.ManifestGenerator.prototype.build = function() {
  this.finishPartialStream_();
  return this.manifest_;
};


/**
 * Sets the duration of the presentation timeline.
 *
 * @param {number} duration
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.setPresentationDuration = function(
    duration) {
  this.manifest_.presentationTimeline.setDuration(duration);
  return this;
};


/**
 * Converts the presentation timeline into jasmine.any.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.anyTimeline = function() {
  this.manifest_.presentationTimeline =
      jasmine.any(shaka.media.PresentationTimeline);
  return this;
};


/**
 * Sets the minimum buffer time.
 *
 * @param {number} minBufferTime
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.minBufferTime = function(minBufferTime) {
  this.manifest_.minBufferTime = minBufferTime;
  return this;
};


/**
 * Adds a new Period to the manifest.
 *
 * @param {number} startTime
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addPeriod = function(startTime) {
  this.finishPartialStream_();
  this.manifest_.periods.push({startTime: startTime, streamSets: []});
  return this;
};


// Stream Set methods {{{
/**
 * Adds a new stream set to the manifest.
 *
 * @param {string} type
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addStreamSet = function(type) {
  this.finishPartialStream_();
  var period = this.currentPeriod_();
  period.streamSets.push(
      {language: 'und', type: type, primary: false, drmInfos: [], streams: []});
  return this;
};


/**
 * Sets the language of the most recent stream set.
 *
 * @param {string} language
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.language = function(language) {
  var streamSet = this.currentStreamSet_();
  streamSet.language = language;
  streamSet.streams.forEach(function(s) { s.language = language; });
  return this;
};


/**
 * Sets that the current stream set is primary.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.primary = function() {
  var streamSet = this.currentStreamSet_();
  streamSet.primary = true;
  return this;
};
// }}}


// DrmInfo methods {{{
/**
 * Adds a new DrmInfo to the current stream set.
 *
 * @param {string} keySystem
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addDrmInfo = function(keySystem) {
  var streamSet = this.currentStreamSet_();
  streamSet.drmInfos.push({
    keySystem: keySystem,
    licenseServerUri: '',
    distinctiveIdentifierRequired: false,
    persistentStateRequired: false,
    audioRobustness: '',
    videoRobustness: '',
    serverCertificate: null,
    initData: null,
    keyIds: []
  });
  return this;
};


/**
 * Sets the license server URI of the current DRM info.
 *
 * @param {string} uri
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.licenseServerUri = function(uri) {
  var drmInfo = this.currentDrmInfo_();
  drmInfo.licenseServerUri = uri;
  return this;
};


/**
 * Sets that distinctive identifier is required on the current DRM info.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.distinctiveIdentifierRequired =
    function() {
  var drmInfo = this.currentDrmInfo_();
  drmInfo.distinctiveIdentifierRequired = true;
  return this;
};


/**
 * Sets that persistent state is required on the current DRM info.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.persistentStateRequired = function() {
  var drmInfo = this.currentDrmInfo_();
  drmInfo.persistentStateRequired = true;
  return this;
};


/**
 * Sets the audio robustness of the current DRM info.
 *
 * @param {string} robustness
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.audioRobustness = function(robustness) {
  var drmInfo = this.currentDrmInfo_();
  drmInfo.audioRobustness = robustness;
  return this;
};


/**
 * Sets the video robustness of the current DRM info.
 *
 * @param {string} robustness
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.videoRobustness = function(robustness) {
  var drmInfo = this.currentDrmInfo_();
  drmInfo.videoRobustness = robustness;
  return this;
};


/**
 * Adds a new init data to the current DRM info.
 *
 * @param {string} type
 * @param {!Uint8Array} buffer
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addInitData = function(type, buffer) {
  var drmInfo = this.currentDrmInfo_();
  if (!drmInfo.initData)
    drmInfo.initData = [];
  drmInfo.initData.push({initData: buffer, initDataType: type});
  return this;
};


/**
 * Adds a new 'cenc' init data to the current DRM info.
 *
 * @param {string} base64
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addCencInitData = function(base64) {
  var drmInfo = this.currentDrmInfo_();
  if (!drmInfo.initData)
    drmInfo.initData = [];

  var buffer = shaka.util.Uint8ArrayUtils.fromBase64(base64);
  drmInfo.initData.push({initData: buffer, initDataType: 'cenc'});
  return this;
};
// }}}


// Stream methods {{{
/**
 * Adds a new stream to the current stream set.
 *
 * @param {number} id
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addStream = function(id) {
  this.finishPartialStream_();
  var streamSet = this.currentStreamSet_();
  /** @type {shakaExtern.Stream} */
  var stream = {
    id: id,
    createSegmentIndex: jasmine.createSpy('createSegmentIndex'),
    findSegmentPosition: jasmine.createSpy('findSegmentPosition'),
    getSegmentReference: jasmine.createSpy('getSegmentReference'),
    initSegmentReference: null,
    presentationTimeOffset: 0,
    mimeType: 'video/mp4',
    codecs: 'avc1.4d401f',
    frameRate: undefined,
    bandwidth: 100,
    width: undefined,
    height: undefined,
    kind: undefined,
    encrypted: false,
    keyId: null,
    language: streamSet.language,
    allowedByApplication: true,
    allowedByKeySystem: true
  };
  stream.createSegmentIndex.and.callFake(
      function() { return Promise.resolve(); });
  stream.findSegmentPosition.and.returnValue(null);
  stream.getSegmentReference.and.returnValue(null);

  streamSet.streams.push(stream);
  return this;
};


/**
 * Adds a new partial stream.  It will ignore any fields that are not given.
 * The generated manifest will contain a jasmine.objectContaining object created
 * in finishPartialStream_.
 *
 * @param {number=} opt_id
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addPartialStream = function(opt_id) {
  this.finishPartialStream_();
  this.partialStream_ = /** @type {shakaExtern.Stream} */ ({
    id: opt_id || jasmine.any(Number)
  });
  return this;
};


/**
 * Converts the segment functions of the current stream into jasmine.any.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.anySegmentFunctions = function() {
  var stream = this.currentStream_();
  stream.createSegmentIndex = jasmine.any(Function);
  stream.findSegmentPosition = jasmine.any(Function);
  stream.getSegmentReference = jasmine.any(Function);
  return this;
};


/**
 * Converts the init segment of the current stream into jasmine.any.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.anyInitSegment = function() {
  var stream = this.currentStream_();
  stream.initSegmentReference =
      /** @type {shaka.media.InitSegmentReference} */ (
          jasmine.any(shaka.media.InitSegmentReference));
  return this;
};


/**
 * Sets the current stream to use segment template to create segments.
 *
 * @param {string} template An sprintf template that will take the segment
 *   index and give a URI.
 * @param {number} segmentDuration
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.useSegmentTemplate = function(
    template, segmentDuration) {
  var stream = this.currentStream_();
  var totalDuration = this.manifest_.presentationTimeline.getDuration();
  var segmentCount = totalDuration / segmentDuration;
  stream.createSegmentIndex = function() { return Promise.resolve(); };
  stream.findSegmentPosition = function(time) {
    return Math.floor(time / segmentDuration);
  };
  stream.getSegmentReference = (function(index) {
    if (index < 0 || index >= segmentCount)
      return null;
    var getUris = function() { return [sprintf(template, index)]; };
    var start = index * segmentDuration;
    var end = Math.min(totalDuration, (index + 1) * segmentDuration);
    return new this.shaka_.media.SegmentReference(
        index, start, end, getUris, 0, null);
  }.bind(this));
  return this;
};


/**
 * Sets the current stream to use the given text stream.  It will serve a
 * single media segment at the given URI for the entire Period.
 *
 * @param {string} uri
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.textStream = function(uri) {
  var stream = this.currentStream_();
  var duration = this.manifest_.presentationTimeline.getDuration();
  var getUris = function() { return [uri]; };

  stream.createSegmentIndex = function() { return Promise.resolve(); };
  stream.findSegmentPosition = function(time) {
    return (time >= 0 && time < duration ? 1 : null);
  };
  stream.getSegmentReference = (function(position) {
    if (position != 1) return null;
    var startTime = 0;
    return new this.shaka_.media.SegmentReference(
        position, startTime, duration, getUris, 0, null);
  }.bind(this));

  return this;
};


/**
 * Sets the init segment of the current stream.
 *
 * @param {!Array.<string>} uris
 * @param {number} startByte
 * @param {?number} endByte
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.initSegmentReference = function(
    uris, startByte, endByte) {
  var stream = this.currentStream_();
  var getUris = function() { return uris; };
  stream.initSegmentReference =
      new this.shaka_.media.InitSegmentReference(getUris, startByte, endByte);
  return this;
};


/**
 * Sets the presentation time offset of the current stream.
 *
 * @param {number} pto
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.presentationTimeOffset = function(pto) {
  var stream = this.currentStream_();
  stream.presentationTimeOffset = pto;
  return this;
};


/**
 * Sets the MIME type of the current stream.
 *
 * @param {string} mime
 * @param {string=} opt_codecs
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.mime = function(mime, opt_codecs) {
  var stream = this.currentStream_();
  stream.mimeType = mime;
  stream.codecs = opt_codecs || '';
  return this;
};


/**
 * Sets the bandwidth of the current stream.
 *
 * @param {number} bandwidth
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.bandwidth = function(bandwidth) {
  var stream = this.currentStream_();
  stream.bandwidth = bandwidth;
  return this;
};


/**
 * Sets the width and height of the current stream.
 *
 * @param {number} width
 * @param {number} height
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.size = function(width, height) {
  var stream = this.currentStream_();
  stream.width = width;
  stream.height = height;
  return this;
};


/**
 * Sets the kind of the current stream.
 *
 * @param {string} kind
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.kind = function(kind) {
  var stream = this.currentStream_();
  stream.kind = kind;
  return this;
};


/**
 * Sets the encrypted flag of the current stream.
 *
 * @param {boolean} encrypted
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.encrypted = function(encrypted) {
  var stream = this.currentStream_();
  stream.encrypted = encrypted;
  return this;
};


/**
 * Sets the framerate of the current stream.
 *
 * @param {number} frameRate
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.frameRate = function(frameRate) {
  var stream = this.currentStream_();
  stream.frameRate = frameRate;
  return this;
};


/**
 * Sets the key ID of the current stream.
 *
 * @param {string} keyId
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.keyId = function(keyId) {
  var stream = this.currentStream_();
  stream.keyId = keyId;
  return this;
};


/**
 * Sets that the current stream is disallowed by the application.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.disallowByApplication = function() {
  var stream = this.currentStream_();
  stream.allowedByApplication = false;
  return this;
};


/**
 * Sets that the current stream is disallowed by the key system.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.disallowByKeySystem = function() {
  var stream = this.currentStream_();
  stream.allowedByKeySystem = false;
  return this;
};
// }}}


// Private methods {{{
/**
 * Gets the most recent period.
 * @return {shakaExtern.Period}
 * @private
 */
shaka.test.ManifestGenerator.prototype.currentPeriod_ = function() {
  goog.asserts.assert(this.manifest_.periods.length > 0,
                      'Must call addPeriod() at least once.');
  return this.manifest_.periods[this.manifest_.periods.length - 1];
};


/**
 * Gets the most recent stream set.
 * @return {shakaExtern.StreamSet}
 * @private
 */
shaka.test.ManifestGenerator.prototype.currentStreamSet_ = function() {
  var period = this.currentPeriod_();
  goog.asserts.assert(period.streamSets.length > 0,
                      'Must call addStreamSet() at least once.');
  return period.streamSets[period.streamSets.length - 1];
};


/**
 * Gets the most recent DRM info.
 * @return {shakaExtern.DrmInfo}
 * @private
 */
shaka.test.ManifestGenerator.prototype.currentDrmInfo_ = function() {
  var streamSet = this.currentStreamSet_();
  goog.asserts.assert(streamSet.drmInfos.length > 0,
                      'Must call addDrmInfo() at least once.');
  return streamSet.drmInfos[streamSet.drmInfos.length - 1];
};


/**
 * Gets the most recent stream.
 * @return {shakaExtern.Stream}
 * @private
 */
shaka.test.ManifestGenerator.prototype.currentStream_ = function() {
  if (this.partialStream_)
    return this.partialStream_;

  var streamSet = this.currentStreamSet_();
  goog.asserts.assert(streamSet.streams.length > 0,
                      'Must call addStream() at least once.');
  return streamSet.streams[streamSet.streams.length - 1];
};


/**
 * If there is a partial stream, add it to the manifest.
 *
 * @private
 */
shaka.test.ManifestGenerator.prototype.finishPartialStream_ = function() {
  if (this.partialStream_) {
    this.currentStreamSet_().streams.push(/** @type {shakaExtern.Stream} */ (
        jasmine.objectContaining(this.partialStream_)));
    this.partialStream_ = null;
  }
};
// }}}
