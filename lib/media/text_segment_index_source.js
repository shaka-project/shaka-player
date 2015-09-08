/**
 * @license
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
 */

goog.provide('shaka.media.TextSegmentIndexSource');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.ISegmentIndexSource');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.FailoverUri');



/**
 * Creates an ISegmentIndexSource that constructs a SegmentIndex from a single
 * subtitles URL.
 *
 * @param {!shaka.util.FailoverUri} subtitlesUrl
 * @constructor
 * @struct
 * @implements {shaka.media.ISegmentIndexSource}
 */
shaka.media.TextSegmentIndexSource = function(subtitlesUrl) {
  /** @private {!shaka.util.FailoverUri} */
  this.subtitlesUrl_ = subtitlesUrl;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;
};


/** @override */
shaka.media.TextSegmentIndexSource.prototype.destroy = function() {
  if (this.segmentIndex_) {
    this.segmentIndex_.destroy();
    this.segmentIndex_ = null;
  }
};


/** @override */
shaka.media.TextSegmentIndexSource.prototype.create = function() {
  if (this.segmentIndex_) {
    return Promise.resolve(this.segmentIndex_);
  }

  var reference = new shaka.media.SegmentReference(
      0, null, this.subtitlesUrl_);

  this.segmentIndex_ = new shaka.media.SegmentIndex([reference]);
  return Promise.resolve(this.segmentIndex_);
};

