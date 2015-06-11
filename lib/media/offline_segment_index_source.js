/**
 * Copyright 2015 Google Inc.
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
 * @fileoverview Implements a SegmentIndexSource that constructs a SegmentIndex
 * from an existing set of SegmentReferences.
 */

goog.provide('shaka.media.OfflineSegmentIndexSource');

goog.require('goog.Uri');
goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.ISegmentIndexSource');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.ContentDatabase');



/**
 * Creates a OfflineSegmentIndexSource.
 *
 * @param {!Array.<!shaka.util.ContentDatabase.SegmentInformation>} segmentInfos
 * @constructor
 * @struct
 * @implements {shaka.media.ISegmentIndexSource}
 */
shaka.media.OfflineSegmentIndexSource = function(segmentInfos) {
  /** @private {Array.<!shaka.util.ContentDatabase.SegmentInformation>} */
  this.segmentInfos_ = segmentInfos;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.OfflineSegmentIndexSource.prototype.destroy = function() {
  this.segmentInfos_ = null;

  if (this.segmentIndex_) {
    this.segmentIndex_.destroy();
    this.segmentIndex_ = null;
  }
};


/** @override */
shaka.media.OfflineSegmentIndexSource.prototype.create = function() {
  if (this.segmentIndex_) {
    return Promise.resolve(this.segmentIndex_);
  }

  var references = [];

  for (var i = 0; i < this.segmentInfos_.length; ++i) {
    var info = this.segmentInfos_[i];
    references.push(new shaka.media.SegmentReference(
        info['start_time'],
        info['end_time'],
        info['start_byte'],
        null /* endByte */,
        new goog.Uri(info['url'])));
  }

  this.segmentInfos_ = null;
  this.segmentIndex_ = new shaka.media.SegmentIndex(references);
  return Promise.resolve(this.segmentIndex_);
};

