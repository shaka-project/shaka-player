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
goog.provide('shaka.media.StreamConfig');
goog.provide('shaka.media.StreamInfo');
goog.provide('shaka.media.StreamSetInfo');

goog.require('goog.Uri');
goog.require('shaka.media.ISegmentIndexSource');
goog.require('shaka.media.SegmentInitSource');



/**
 * Creates a StreamInfo.
 *
 * @constructor
 * @struct
 */
shaka.media.StreamInfo = function() {
  /** @type {number} */
  this.uniqueId = shaka.media.StreamInfo.nextUniqueId_++;

  /**
   * The StreamInfo owns the SegmentIndexSource.
   * @type {shaka.media.ISegmentIndexSource}
   */
  this.segmentIndexSource = null;

  /**
   * The StreamInfo owns the SegmentInitSource.
   * @type {shaka.media.SegmentInitSource}
   */
  this.segmentInitSource = null;

  /**
   * An ID specified within the manifest, which is not guaranteed to be unique.
   * @type {?string}
   */
  this.id = null;

  /**
   * An offset, in seconds, to apply to each timestamp within each media
   * segment that's put in buffer.
   * @type {number}
   */
  this.timestampOffset = 0;

  /**
   * The stream's required bandwidth in bits per second.
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

  /** @type {boolean} */
  this.enabled = true;
};


/**
 * The next unique ID to assign to a StreamInfo.
 * @private {number}
 */
shaka.media.StreamInfo.nextUniqueId_ = 0;


/**
 * Destroys this StreamInfo.
 */
shaka.media.StreamInfo.prototype.destroy = function() {
  if (this.segmentIndexSource) {
    this.segmentIndexSource.destroy();
    this.segmentIndexSource = null;
  }

  if (this.segmentInitSource) {
    this.segmentInitSource.destroy();
    this.segmentInitSource = null;
  }
};


/**
 * Gets the StreamInfos's content type, which is the first part of the MIME
 * type.
 *
 * @return {string}
 */
shaka.media.StreamInfo.prototype.getContentType = function() {
  return this.mimeType.split('/')[0];
};


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
 * Creates a StreamSetInfo.
 *
 * @constructor
 * @struct
 */
shaka.media.StreamSetInfo = function() {
  /** @type {number} */
  this.uniqueId = shaka.media.StreamSetInfo.nextUniqueId_++;

  /** @type {?string} */
  this.id = null;

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
 * Destroys this StreamSetInfo.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.StreamSetInfo.prototype.destroy = function() {
  for (var i = 0; i < this.streamInfos.length; ++i) {
    this.streamInfos[i].destroy();
  }
  this.streamInfos = null;
  this.drmSchemes = null;
};


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
  /** @type {?string} */
  this.id = null;

  /** @type {number} */
  this.start = 0;

  /**
   * The period's duration, in seconds.
   * @type {?number}
   */
  this.duration = null;

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
 * Destroys this PeriodInfo.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.PeriodInfo.prototype.destroy = function() {
  for (var i = 0; i < this.streamSetInfos.length; ++i) {
    this.streamSetInfos[i].destroy();
  }
  this.streamSetInfos = null;
};



/**
 * Creates a ManifestInfo.
 *
 * @constructor
 * @struct
 */
shaka.media.ManifestInfo = function() {
  /** @type {boolean} */
  this.live = false;

  /**
   * The interval, in seconds, to poll the media server for an updated
   * manifest, or null if updates are not required.
   * @type {?number}
   */
  this.updatePeriod = null;

  /**
   * The location of the updated manifest, if any.
   * {goog.Uri}
   */
  this.updateUrl = null;

  /** @type {number} */
  this.minBufferTime = 0;

  /** @type {!Array.<!shaka.media.PeriodInfo>} */
  this.periodInfos = [];
};


/**
 * Destroys this ManifestInfo.
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.ManifestInfo.prototype.destroy = function() {
  for (var i = 0; i < this.periodInfos.length; ++i) {
    this.periodInfos[i].destroy();
  }
  this.periodInfos = null;
};



/**
 * Creates a StreamConfig.
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

