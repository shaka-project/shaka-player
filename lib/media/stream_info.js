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

goog.provide('shaka.media.ManifestInfo');
goog.provide('shaka.media.PeriodInfo');
goog.provide('shaka.media.SegmentMetadataInfo');
goog.provide('shaka.media.StreamConfig');
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

  /** @type {number} */
  this.minBufferTime = 0;

  /**
   * The number of seconds that each media timestamp is offset from the start
   * of the period. This value is subtracted from the media timestamps to give
   * their corresponding segments the desired presentation time within the
   * period.
   * @type {number}
   */
  this.timestampOffset = 0;

  /**
   * Bandwidth required, in bits per second, to assure uninterrupted playback,
   * assuming that |minBufferTime| seconds of video are in buffer before
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

  /** @type {boolean} */
  this.enabled = true;
};


/**
 * The next unique ID to assign to a StreamInfo.
 * @private {number}
 */
shaka.media.StreamInfo.nextUniqueId_ = 0;


/**
 * Gets the StreamInfos's full MIME type, which is a combination of the
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
  /** @type {number} */
  this.uniqueId = shaka.media.StreamSetInfo.nextUniqueId_++;

  /** @type {string} */
  this.contentType = '';

  /** @type {!Array.<!shaka.media.StreamInfo>} */
  this.streamInfos = [];

  /** @type {!Array.<!shaka.player.DrmSchemeInfo>} */
  this.drmSchemes = [];

  /** @type {string} */
  this.lang = '';

  /** @type {boolean} */
  this.main = false;
};


/**
 * The next unique ID to assign to a StreamSetInfo.
 * @private {number}
 */
shaka.media.StreamSetInfo.nextUniqueId_ = 0;


/**
 * @return {!Array.<shaka.media.StreamConfig>}
 */
shaka.media.StreamSetInfo.prototype.getConfigs = function() {
  var configList = [];
  for (var i = 0; i < this.drmSchemes.length; ++i) {
    var cfg = new shaka.media.StreamConfig();
    cfg.id = this.uniqueId;
    cfg.drmScheme = this.drmSchemes[i];
    cfg.contentType = this.contentType;
    cfg.fullMimeType = this.streamInfos.length ?
                       this.streamInfos[0].getFullMimeType() : '';
    configList.push(cfg);
  }
  return configList;
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


/**
 * @return {!Array.<shaka.media.StreamConfig>}
 */
shaka.media.PeriodInfo.prototype.getConfigs = function() {
  var configList = [];
  for (var i = 0; i < this.streamSetInfos.length; ++i) {
    configList.push.apply(configList, this.streamSetInfos[i].getConfigs());
  }
  return configList;
};



/**
 * Creates a ManifestInfo
 *
 * @constructor
 * @struct
 */
shaka.media.ManifestInfo = function() {
  /** @type {number} */
  this.minBufferTime = 0;

  /** @type {!Array.<!shaka.media.PeriodInfo>} */
  this.periodInfos = [];
};



/**
 * Creates a StreamConfig
 *
 * @constructor
 * @struct
 */
shaka.media.StreamConfig = function() {
  /** @type {number} */
  this.id = 0;

  /** @type {shaka.player.DrmSchemeInfo} */
  this.drmScheme = null;

  /** @type {string} */
  this.contentType = '';

  /** @type {string} */
  this.fullMimeType = '';
};


/**
 * Gets the StreamConfig's basic MIME type, which does not contain codec
 * information.
 *
 * @return {string}
 */
shaka.media.StreamConfig.prototype.getBasicMimeType = function() {
  return this.fullMimeType.split(';')[0];
};

