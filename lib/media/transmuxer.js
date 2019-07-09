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
goog.require('shaka.util.Error');
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
  this.muxTransmuxer_ = new muxjs.mp4.Transmuxer({
    'keepOriginalTimestamps': true,
  });

  /** @private {shaka.util.PublicPromise} */
  this.transmuxPromise_ = null;

  /** @private {!Array.<!Uint8Array>} */
  this.transmuxedData_ = [];

  /** @private {!Array.<muxjs.mp4.ClosedCaption>} */
  this.captions_ = [];

  /** @private {boolean} */
  this.isTransmuxing_ = false;

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
 * @param {string} mimeType
 * @param {string=} contentType
 * @return {boolean}
 */
shaka.media.Transmuxer.isSupported = function(mimeType, contentType) {
  if (!window.muxjs || !shaka.media.Transmuxer.isTsContainer(mimeType)) {
    return false;
  }
  let convertTsCodecs = shaka.media.Transmuxer.convertTsCodecs;
  if (contentType) {
    return MediaSource.isTypeSupported(convertTsCodecs(contentType, mimeType));
  }
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return MediaSource.isTypeSupported(
             convertTsCodecs(ContentType.AUDIO, mimeType)) ||
      MediaSource.isTypeSupported(convertTsCodecs(ContentType.VIDEO, mimeType));
};


/**
 * Check if the mimetype contains 'mp2t'.
 * @param {string} mimeType
 * @return {boolean}
 */
shaka.media.Transmuxer.isTsContainer = function(mimeType) {
  return mimeType.toLowerCase().split(';')[0].split('/')[1] == 'mp2t';
};


/**
 * For transport stream, convert its codecs to MP4 codecs.
 * @param {string} contentType
 * @param {string} tsMimeType
 * @return {string}
 */
shaka.media.Transmuxer.convertTsCodecs = function(contentType, tsMimeType) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  let mp4MimeType = tsMimeType.replace(/mp2t/i, 'mp4');
  if (contentType == ContentType.AUDIO) {
    mp4MimeType = mp4MimeType.replace('video', 'audio');
  }

  // Handle legacy AVC1 codec strings (pre-RFC 6381).
  // Look for "avc1.<profile>.<level>", where profile is:
  //   66 (baseline => 0x42)
  //   77 (main => 0x4d)
  //   100 (high => 0x64)
  // Reference: https://bit.ly/2K9JI3x
  let match = /avc1\.(66|77|100)\.(\d+)/.exec(mp4MimeType);
  if (match) {
    let newCodecString = 'avc1.';

    let profile = match[1];
    if (profile == '66') {
      newCodecString += '4200';
    } else if (profile == '77') {
      newCodecString += '4d00';
    } else {
      goog.asserts.assert(profile == '100',
                          'Legacy avc1 parsing code out of sync with regex!');
      newCodecString += '6400';
    }

    // Convert the level to hex and append to the codec string.
    let level = Number(match[2]);
    goog.asserts.assert(level < 256,
                        'Invalid legacy avc1 level number!');
    newCodecString += (level >> 4).toString(16);
    newCodecString += (level & 0xf).toString(16);

    mp4MimeType = mp4MimeType.replace(match[0], newCodecString);
  }

  return mp4MimeType;
};


/**
 * Transmux from Transport stream to MP4, using the mux.js library.
 * @param {!ArrayBuffer} data
 * @return {!Promise.<{data: !Uint8Array,
 *                     captions: !Array.<!muxjs.mp4.ClosedCaption>}>}
 */
shaka.media.Transmuxer.prototype.transmux = function(data) {
  goog.asserts.assert(!this.isTransmuxing_,
      'No transmuxing should be in progress.');
  this.isTransmuxing_ = true;
  this.transmuxPromise_ = new shaka.util.PublicPromise();
  this.transmuxedData_ = [];
  this.captions_ = [];

  let dataArray = new Uint8Array(data);
  this.muxTransmuxer_.push(dataArray);
  this.muxTransmuxer_.flush();

  // Workaround for https://bit.ly/Shaka1449 mux.js not
  // emitting 'data' and 'done' events.
  // mux.js code is synchronous, so if onTransmuxDone_ has
  // not been called by now, it's not going to be.
  // Treat it as a transmuxing failure and reject the promise.
  if (this.isTransmuxing_) {
    this.transmuxPromise_.reject(new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.TRANSMUXING_FAILED));
  }
  return this.transmuxPromise_;
};


/**
 * Handles the 'data' event of the transmuxer.
 * Extracts the cues from the transmuxed segment, and adds them to an array.
 * Stores the transmuxed data in another array, to pass it back to
 * MediaSourceEngine, and append to the source buffer.
 *
 * @param {muxjs.mp4.Transmuxer.Segment} segment
 * @private
 */
shaka.media.Transmuxer.prototype.onTransmuxed_ = function(segment) {
  this.captions_ = segment.captions;
  let segmentWithInit = new Uint8Array(segment.data.byteLength +
      segment.initSegment.byteLength);
  segmentWithInit.set(segment.initSegment, 0);
  segmentWithInit.set(segment.data, segment.initSegment.byteLength);
  this.transmuxedData_.push(segmentWithInit);
};


/**
 * Handles the 'done' event of the transmuxer.
 * Resolves the transmux Promise, and returns the transmuxed data.
 * @private
 */
shaka.media.Transmuxer.prototype.onTransmuxDone_ = function() {
  let output = {
    data: shaka.util.Uint8ArrayUtils.concat.apply(null, this.transmuxedData_),
    captions: this.captions_,
  };

  this.transmuxPromise_.resolve(output);
  this.isTransmuxing_ = false;
};
