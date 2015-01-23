/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview Defines stream information, which is a manifist agnostic
 * description of a stream.
 */

goog.provide('shaka.media.PeriodInfo');
goog.provide('shaka.media.SegmentMetadataInfo');
goog.provide('shaka.media.StreamInfo');
goog.provide('shaka.media.StreamSetInfo');



/**
 * Creates a StreamInfo.
 *
 * @constructor
 * @struct
 */
shaka.media.StreamInfo = function() {
  /** @type {number} */
  this.uniqueId = shaka.media.StreamInfo.nextUniqueId_++;

  /** @type {?string} */
  this.id = null;

  /** @type {string} */
  this.lang = '';

  /** @type {number} */
  this.minBufferTime = 0;

  /**
   * Bandwidth required, in bits per second, to assure uninterrupted playback,
   * assuming that Mpd.minBufferTime seconds of video are in buffer before
   * playback begins.
   * @type {?number}
   */
  this.bandwidth = null;

  /** @type {?number} */
  this.width = null;

  /** @type {?number} */
  this.height = null;

  /** @type {string} */
  this.mimeType = '';

  /** @type {string} */
  this.codecs = '';

  /** @type {goog.Uri} */
  this.mediaUrl = null;

  /** @type {shaka.media.SegmentMetadataInfo} */
  this.segmentIndexInfo = null;

  /** @type {shaka.media.SegmentMetadataInfo} */
  this.segmentInitializationInfo = null;

  /** @type {shaka.media.SegmentIndex} */
  this.segmentIndex = null;
};


/**
 * The next unique ID to assign to a StreamInfo.
 * @private {number}
 */
shaka.media.StreamInfo.nextUniqueId_ = 0;


/**
 * Gets the StreamInfos's full MIME type, which is a combintation of the
 * StreamInfos's |mimeType| and |codecs| fields.
 *
 * @return {string}
 */
shaka.media.StreamInfo.prototype.getFullMimeType = function() {
  var fullMimeType = this.mimeType || '';
  if (this.codecs) {
    fullMimeType += '; codecs="' + this.codecs + '"';
  }
  return fullMimeType;
};



/**
 * Creates a SegmentMetadataInfo.
 *
 * @constructor
 * @struct
 */
shaka.media.SegmentMetadataInfo = function() {
  /** @type {goog.Uri} */
  this.url = null;

  /** @type {number} */
  this.startByte = 0;

  /** @type {?number} */
  this.endByte = null;
};



/**
 * Creates a StreamSetInfo.
 *
 * @constructor
 * @struct
 */
shaka.media.StreamSetInfo = function() {
  /** @type {string} */
  this.contentType = '';

  /** @type {!Array.<!shaka.media.StreamInfo>} */
  this.streamInfos = [];

  /** @type {!Array.<!shaka.player.DrmSchemeInfo>} */
  this.drmSchemes = [];
};



/**
 * Creates a PeriodInfo.
 *
 * @constructor
 * @struct
 */
shaka.media.PeriodInfo = function() {
  /** @type {number} */
  this.start = 0;

  /** @type {number} */
  this.duration = 0;

  /** @type {!Array.<!shaka.media.StreamSetInfo>} */
  this.streamSetInfos = [];
};

