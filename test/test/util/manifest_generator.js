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

  /** @private {shakaExtern.Stream|shakaExtern.Variant|null} */
  this.lastObjectAdded_ = null;

  /** @private {?shakaExtern.Stream} */
  this.lastStreamAdded_ = null;
};


/** @return {shakaExtern.Manifest} */
shaka.test.ManifestGenerator.prototype.build = function() {
  return this.manifest_;
};


/**
 * Sets a specified presentation timeline.
 *
 * @param {!shaka.media.PresentationTimeline} timeline
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.setTimeline = function(timeline) {
  this.manifest_.presentationTimeline = timeline;
  return this;
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
  this.manifest_.periods.push(
      {
        startTime: startTime,
        variants: [],
        textStreams: []
      });
  return this;
};


// Stream Set methods {{{
/**
 * Adds a new variant to the manifest.
 *
 * @param {number} id
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addVariant = function(id) {
  var period = this.currentPeriod_();
  var variant = {
    id: id,
    language: 'und',
    bandwidth: 0,
    primary: false,
    drmInfos: [],
    audio: null,
    video: null,
    allowedByApplication: true,
    allowedByKeySystem: true
  };
  period.variants.push(variant);
  this.lastObjectAdded_ = variant;
  return this;
};


/**
 * Sets the language of the most recent variant or text stream.
 *
 * @param {string} language
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.language = function(language) {
  this.currentStreamOrVariant_().language = language;
  return this;
};


/**
 * Sets that the most recent variant or text stream is primary.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.primary = function() {
  this.currentStreamOrVariant_().primary = true;
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
  var variant = this.currentVariant_();
  variant.drmInfos.push({
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
  drmInfo.initData.push({initData: buffer, initDataType: type, keyId: null});
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
 * Sets video stream of the current variant.
 *
 * @param {number} id
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addVideo = function(id) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var variant = this.currentVariant_();
  var period = this.currentPeriod_();
  var stream;
  // A stream can be a part of multiple variants.
  // If we already have a stream with this id, reuse it instead of
  // adding a new one.
  var variants = period.variants;
  for (var i = 0; i < variants.length; i++) {
    if (variants[i].video && (variants[i].video.id == id)) {
      stream = variants[i].video;
      break;
    }
  }

  if (!stream)
    stream = this.createStream_(id, ContentType.VIDEO, 'und');

  variant.video = stream;
  this.lastStreamAdded_ = stream;
  this.lastObjectAdded_ = stream;

  return this;
};


/**
 * Sets video stream of the current variant.
 *
 * @param {number} id
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addAudio = function(id) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var variant = this.currentVariant_();
  var period = this.currentPeriod_();
  var stream;
  // A stream can be a part of multiple variants.
  // If we already have a stream with this id, reuse it instead of
  // adding a new one.
  var variants = period.variants;
  for (var i = 0; i < variants.length; i++) {
    if (variants[i].audio && (variants[i].audio.id == id)) {
      stream = variants[i].audio;
      break;
    }
  }

  if (!stream)
    stream = this.createStream_(id, ContentType.AUDIO, variant.language);

  variant.audio = stream;
  this.lastStreamAdded_ = stream;
  this.lastObjectAdded_ = stream;

  return this;
};


/**
 * Adds a text stream to the current period.
 *
 * @param {number} id
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.addTextStream = function(id) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var period = this.currentPeriod_();
  var stream = this.createStream_(id, ContentType.TEXT, 'und');
  period.textStreams.push(stream);
  this.lastObjectAdded_ = stream;
  this.lastStreamAdded_ = stream;

  return this;
};


/**
 * Returns true if current period has a stream with a given id.
 *
 * @param {number} id
 * @return {boolean}
 * @private
 */
shaka.test.ManifestGenerator.prototype.isIdUsed_ = function(id) {
  var period = this.currentPeriod_();
  var variants = period.variants;
  var textStreams = period.textStreams;

  for (var i = 0; i < variants.length; i++) {
    if ((variants[i].video && (variants[i].video.id == id)) ||
        (variants[i].audio && (variants[i].audio.id == id))) {
      return true;
    }
  }

  for (var i = 0; i < textStreams.length; i++) {
    if (textStreams[i].id == id) {
      return true;
    }
  }

  return false;
};


/**
 * Creates a new stream.
 *
 * @param {number} id
 * @param {string} type
 * @param {string} language
 * @return {!shakaExtern.Stream}
 * @private
 */
shaka.test.ManifestGenerator.prototype.createStream_ =
    function(id, type, language) {
  goog.asserts.assert(!this.isIdUsed_(id),
                      'Streams should have unique ids!');

  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var defaultMimeType = 'text/plain';
  var defaultCodecs = '';

  if (type == ContentType.AUDIO) {
    defaultMimeType = 'audio/mp4';
    defaultCodecs = 'mp4a.40.2';
  } else if (type == ContentType.VIDEO) {
    defaultMimeType = 'video/mp4';
    defaultCodecs = 'avc1.4d401f';
  } else if (type == ContentType.TEXT) {
    defaultMimeType = 'text/vtt';
  }

  /** @type {shakaExtern.Stream} */
  var stream = {
    id: id,
    createSegmentIndex: jasmine.createSpy('createSegmentIndex'),
    findSegmentPosition: jasmine.createSpy('findSegmentPosition'),
    getSegmentReference: jasmine.createSpy('getSegmentReference'),
    initSegmentReference: null,
    presentationTimeOffset: 0,
    mimeType: defaultMimeType,
    codecs: defaultCodecs,
    frameRate: undefined,
    bandwidth: undefined,
    width: undefined,
    height: undefined,
    kind: undefined,
    encrypted: false,
    keyId: null,
    language: language,
    type: type,
    primary: false,
    trickModeVideo: null,
    containsEmsgBoxes: false
  };
  stream.createSegmentIndex.and.callFake(
      function() { return Promise.resolve(); });
  stream.findSegmentPosition.and.returnValue(null);
  stream.getSegmentReference.and.returnValue(null);

  return stream;
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
 * Sets the init segment of the current stream to null.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.nullInitSegment = function() {
  var stream = this.currentStream_();
  stream.initSegmentReference = null;
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
  this.currentStreamOrVariant_().bandwidth = bandwidth;
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
 * Sets that the current variant is disallowed by the application.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.disallowByApplication = function() {
  var variant = this.currentVariant_();
  variant.allowedByApplication = false;
  return this;
};


/**
 * Sets that the current variant is disallowed by the key system.
 *
 * @return {!shaka.test.ManifestGenerator}
 */
shaka.test.ManifestGenerator.prototype.disallowByKeySystem = function() {
  var variant = this.currentVariant_();
  variant.allowedByKeySystem = false;
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
 * Gets the most recent variant.
 * @return {shakaExtern.Variant}
 * @private
 */
shaka.test.ManifestGenerator.prototype.currentVariant_ = function() {
  var period = this.currentPeriod_();
  goog.asserts.assert(period.variants.length > 0,
                      'Must call addVariant() at least once.');
  return period.variants[period.variants.length - 1];
};


/**
 * Gets the most recent variant or text stream.
 * @return {shakaExtern.Stream|shakaExtern.Variant}
 * @private
 */
shaka.test.ManifestGenerator.prototype.currentStreamOrVariant_ = function() {
  goog.asserts.assert(this.lastObjectAdded_,
                      'Must call addVariant() or addTextStream()' +
                      ' at least once.');
  return this.lastObjectAdded_;
};


/**
 * Gets the most recent DRM info.
 * @return {shakaExtern.DrmInfo}
 * @private
 */
shaka.test.ManifestGenerator.prototype.currentDrmInfo_ = function() {
  var variant = this.currentVariant_();
  goog.asserts.assert(variant.drmInfos.length > 0,
                      'Must call addDrmInfo() at least once.');
  return variant.drmInfos[variant.drmInfos.length - 1];
};


/**
 * Gets the most recent stream.
 * @return {shakaExtern.Stream}
 * @private
 */
shaka.test.ManifestGenerator.prototype.currentStream_ = function() {
  goog.asserts.assert(this.lastStreamAdded_,
                      'Must add at least one stream.');
  return this.lastStreamAdded_;
};
// }}}
