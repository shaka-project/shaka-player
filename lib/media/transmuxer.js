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

goog.provide('shaka.media.Transmuxer');

goog.require('goog.asserts');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Uint8ArrayUtils');



/**
 * Transmuxer provides all operations for transmuxing from Transport
 * Stream to MP4.
 *
 * @struct
 * @constructor
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.Transmuxer = function() {
  /** @private {muxjs.mp4.Transmuxer} */
  this.muxTransmuxer_ = new muxjs.mp4.Transmuxer();

  /** @private {shaka.util.PublicPromise} */
  this.transmuxPromise_ = null;

  /** @private {!Array} */
  this.transmuxedData_ = [];

  /** @private {boolean} */
  this.isTransmuxing_ = false;

  /** @private {boolean} */
  this.baseDecodeTimeSet_ = false;

  this.muxTransmuxer_.on('data', this.onTransmuxed_.bind(this));

  this.muxTransmuxer_.on('done', this.onTransmuxDone_.bind(this));
};


/**
 * @override
 */
shaka.media.Transmuxer.prototype.destroy = function() {
  this.muxTransmuxer_.dispose();
  this.muxTransmuxer_ = null;
  return Promise.resolve();
};


/**
 * Check if the content type is Transport Stream, and if muxjs is loaded.
 * @param {string} contentType
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.media.Transmuxer.isSupported = function(contentType, mimeType) {
  return window.muxjs && shaka.media.Transmuxer.isTsContainer(mimeType) &&
      MediaSource.isTypeSupported(
          shaka.media.Transmuxer.convertTsCodecs(contentType, mimeType));
};


/**
 * Check if the mimetype contains 'mp2t'.
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.media.Transmuxer.isTsContainer = function(mimeType) {
  return mimeType.split(';')[0].split('/')[1] == 'mp2t';
};


/**
 * For transport stream, convert its codecs to MP4 codecs.
 * @param {string} contentType
 * @param {string} tsMimeType
 * @return {string}
 */
shaka.media.Transmuxer.convertTsCodecs = function(contentType, tsMimeType) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var mp4MimeType = tsMimeType.replace('mp2t', 'mp4');
  if (contentType == ContentType.AUDIO) {
    mp4MimeType = mp4MimeType.replace('video', 'audio');
  }
  return mp4MimeType;
};


/**
 * Transmux from Transport stream to MP4, using mux.js library.
 * @param {!ArrayBuffer} data
 * @param {?number} startTime
 * @return {!Promise.<!Uint8Array>}
 */
shaka.media.Transmuxer.prototype.transmux = function(data, startTime) {
  goog.asserts.assert(!this.isTransmuxing_,
      'No transmuxing should be in progress.');
  this.isTransmuxing_ = true;
  this.transmuxPromise_ = new shaka.util.PublicPromise();
  this.transmuxedData_ = [];

  // TODO: remove this once videojs/mux.js#168 is solved
  if (startTime != null && !this.baseDecodeTimeSet_) {
    var timescale = shaka.media.Transmuxer.TS_TIMESCALE_;
    this.muxTransmuxer_.setBaseMediaDecodeTime(startTime * timescale);
    this.baseDecodeTimeSet_ = true;
  }

  var dataArray = new Uint8Array(data);
  this.muxTransmuxer_.push(dataArray);
  this.muxTransmuxer_.flush();
  return this.transmuxPromise_;
};


/**
 * Handling the 'data' event of transmuxer.
 * Store the transmuxed data in an array, to pass it back to
 * MediaSourceEngine, and append to source buffer.
 *
 * @param {muxjs.mp4.Transmuxer.Segment} segment
 * @private
 */
shaka.media.Transmuxer.prototype.onTransmuxed_ = function(segment) {
  var segmentWithInit = new Uint8Array(segment.data.byteLength +
      segment.initSegment.byteLength);
  segmentWithInit.set(segment.initSegment, 0);
  segmentWithInit.set(segment.data, segment.initSegment.byteLength);
  this.transmuxedData_.push(segmentWithInit);
};


/**
 * Handling the 'done' event of transmuxer.
 * Resolving the transmux promises, and returning the transmuxed data.
 * @private
 */
shaka.media.Transmuxer.prototype.onTransmuxDone_ = function() {
  var output =
      shaka.util.Uint8ArrayUtils.concat.apply(null, this.transmuxedData_);
  this.transmuxPromise_.resolve(output);
  this.isTransmuxing_ = false;
};


/**
 * @const {number}
 * @private
 */
shaka.media.Transmuxer.TS_TIMESCALE_ = 90000;
