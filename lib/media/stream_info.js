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

goog.require('shaka.media.ISegmentIndexParser');
goog.require('shaka.media.IsobmffSegmentIndexParser');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.WebmSegmentIndexParser');
goog.require('shaka.util.RangeRequest');



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
   * An offset, in seconds, to apply to each timestamp within each media
   * segment that's put in buffer.
   * @type {number}
   */
  this.timestampOffset = 0;

  /**
   * Indicates the stream's current segment's start time, i.e., its live-edge.
   * This value is non-null if the stream is both live and available;
   * otherwise, this value is null.
   * @type {?number}
   */
  this.currentSegmentStartTime = null;

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

  /** @type {boolean} */
  this.enabled = true;

  /**
   * The stream's SegmentIndex metadata.
   * @see {shaka.media.StreamInfo.isAvailable}
   * @type {shaka.media.SegmentMetadataInfo}
   */
  this.segmentIndexInfo = null;

  /**
   * The stream's segment initialization metadata.
   * @type {shaka.media.SegmentMetadataInfo}
   */
  this.segmentInitializationInfo = null;

  /**
   * The stream's SegmentIndex.
   * @see {shaka.media.StreamInfo.isAvailable}
   * @type {shaka.media.SegmentIndex}
   */
  this.segmentIndex = null;

  /** @type {ArrayBuffer} */
  this.segmentInitializationData = null;

  /** @private {ArrayBuffer} */
  this.segmentIndexData_ = null;
};


/**
 * The next unique ID to assign to a StreamInfo.
 * @private {number}
 */
shaka.media.StreamInfo.nextUniqueId_ = 0;


/**
 * Returns true if the stream is available; otherwise, returns false.
 * @return {boolean}
 */
shaka.media.StreamInfo.prototype.isAvailable = function() {
  return (this.mimeType.split('/')[0] == 'text') ||
         (this.segmentIndexInfo != null) ||
         (this.segmentIndex != null && this.segmentIndex.length() > 0);
};


/**
 * Gets the stream's segment initialization data (i.e., initialization
 * segment). Sets |segmentInitializationData| on success.
 * |segmentInitializationData| is memoized so calling this function more than
 * once does not result in additional fetches.
 *
 * If the stream is self initializing then the returned promise will resolve
 * but |segmentInitializationData| will still remain null.
 *
 * @return {!Promise}
 */
shaka.media.StreamInfo.prototype.getSegmentInitializationData = function() {
  return this.segmentInitializationInfo ?
         this.fetchSegmentInitialization_() :
         Promise.resolve();
};


/**
 * Gets the stream's SegmentIndex. Sets |segmentIndex| on success, and sets
 * |segmentInitializationData| on success if the stream is WebM based.
 * |segmentIndex| and |segmentInitializationData| are memoized so calling this
 * function more than once does not result in additional fetches.
 *
 * @return {!Promise}
 */
shaka.media.StreamInfo.prototype.getSegmentIndex = function() {
  if (!this.segmentIndexInfo || this.segmentIndex) {
    return Promise.resolve();
  }

  if (!this.mediaUrl) {
    var error = new Error('Cannot create segment index without a media URL.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  var mp4 = this.mimeType.indexOf('mp4') >= 0;
  var webm = this.mimeType.indexOf('webm') >= 0;
  shaka.asserts.assert(!(mp4 && webm));

  if (!mp4 && !webm) {
    var error = new Error(
        'Cannot create segment index with an unsupported MIME type.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  if (webm &&
      !this.segmentInitializationData &&
      !this.segmentInitializationInfo) {
    var error = new Error(
        'Cannot create segment index for WebM content without an ' +
        'initialization segment.');
    error.type = 'stream';
    return Promise.reject(error);
  }

  var p = this.fetchSegmentIndex_();

  if (webm) {
    p = p.then(this.fetchSegmentInitialization_.bind(this));
  }

  p = p.then(shaka.util.TypedBind(this,
      function() {
        shaka.asserts.assert(this.segmentIndexData_);
        shaka.asserts.assert(!webm || this.segmentInitializationData);

        /** @type {shaka.media.ISegmentIndexParser} */
        var indexParser = null;

        if (mp4) {
          indexParser = new shaka.media.IsobmffSegmentIndexParser(
              /** @type {!goog.Uri} */ (this.mediaUrl));
        } else {
          indexParser = new shaka.media.WebmSegmentIndexParser(
              /** @type {!goog.Uri} */ (this.mediaUrl));
        }

        shaka.asserts.assert(indexParser);

        var segmentInitializationDataView =
            this.segmentInitializationData ?
            new DataView(this.segmentInitializationData) :
            null;
        var segmentIndexDataView = new DataView(this.segmentIndexData_);
        var indexOffset = this.segmentIndexInfo.startByte;

        var references = indexParser.parse(
            segmentInitializationDataView, segmentIndexDataView, indexOffset);

        if (!references) {
          var error = new Error('Cannot parse segment references.');
          error.type = 'stream';
          return Promise.reject(error);
        }

        this.segmentIndex = new shaka.media.SegmentIndex(references);
        return Promise.resolve();
      }));

  return p;
};


/**
 * @return {!Promise}
 * @private
 */
shaka.media.StreamInfo.prototype.fetchSegmentIndex_ = function() {
  if (this.segmentIndexData_) {
    return Promise.resolve();
  }

  shaka.asserts.assert(this.segmentIndexInfo);

  return this.segmentIndexInfo.fetch().then(shaka.util.TypedBind(this,
      /** @param {!ArrayBuffer} data */
      function(data) {
        this.segmentIndexData_ = data;
        return Promise.resolve();
      })
  );
};


/**
 * @return {!Promise}
 * @private
 */
shaka.media.StreamInfo.prototype.fetchSegmentInitialization_ = function() {
  if (this.segmentInitializationData) {
    return Promise.resolve();
  }

  shaka.asserts.assert(this.segmentInitializationInfo);

  return this.segmentInitializationInfo.fetch().then(shaka.util.TypedBind(this,
      /** @param {!ArrayBuffer} data */
      function(data) {
        this.segmentInitializationData = data;
        return Promise.resolve();
      })
  );
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
 * Fetches the segment metadata.
 * @return {!Promise.<!ArrayBuffer>}
 */
shaka.media.SegmentMetadataInfo.prototype.fetch = function() {
  shaka.asserts.assert(this.url);

  var request = new shaka.util.RangeRequest(
      this.url.toString(), this.startByte, this.endByte);
  return request.send();
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
 * Creates a ManifestInfo
 *
 * @constructor
 * @struct
 */
shaka.media.ManifestInfo = function() {
  /** @type {boolean} */
  this.live = false;

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

