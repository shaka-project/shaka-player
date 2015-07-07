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
 * @fileoverview Implements an ISegmentIndexSource that constructs a
 * SegmentIndex from a SegmentList.
 */

goog.provide('shaka.dash.ListSegmentIndexSource');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.ISegmentIndexSource');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.TypedBind');



/**
 * Creates a ListSegmentIndexSource.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @constructor
 * @struct
 * @implements {shaka.media.ISegmentIndexSource}
 */
shaka.dash.ListSegmentIndexSource = function(mpd, period, representation) {
  // TODO: Support live content. Issue #88
  shaka.asserts.assert(mpd.type != 'dynamic');
  shaka.asserts.assert(representation.segmentList);
  shaka.asserts.assert(representation.segmentList.segmentDuration ||
                       representation.segmentList.segmentUrls.length == 1);
  shaka.asserts.assert(representation.segmentList.timescale > 0);

  /** @private {!shaka.dash.mpd.Mpd} */
  this.mpd_ = mpd;

  /** @private {!shaka.dash.mpd.Period} */
  this.period_ = period;

  /** @private {!shaka.dash.mpd.Representation} */
  this.representation_ = representation;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.ListSegmentIndexSource.prototype.destroy = function() {
  this.mpd_ = null;
  this.period_ = null;
  this.representation_ = null;

  if (this.segmentIndex_) {
    this.segmentIndex_.destroy();
    this.segmentIndex_ = null;
  }
};


/** @override */
shaka.dash.ListSegmentIndexSource.prototype.create = function() {
  if (this.segmentIndex_) {
    return Promise.resolve(this.segmentIndex_);
  }

  var segmentList = this.representation_.segmentList;
  var lastEndTime = 0;

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];

  for (var i = 0; i < segmentList.segmentUrls.length; ++i) {
    var segmentUrl = segmentList.segmentUrls[i];

    // Compute the segment's unscaled start time.
    var startTime;
    if (i == 0) {
      startTime = 0;
    } else {
      startTime = lastEndTime;
    }
    shaka.asserts.assert(startTime >= 0);

    var endTime = null;
    var scaledEndTime = null;

    var scaledStartTime = startTime / segmentList.timescale;

    // If segmentList.segmentDuration is null then there must only be one
    // segment.
    if (segmentList.segmentDuration) {
      endTime = startTime + segmentList.segmentDuration;
      scaledEndTime = endTime / segmentList.timescale;
    } else {
      shaka.asserts.assert(segmentList.segmentUrls.length == 1);
      shaka.asserts.assert(this.period_.duration);
      scaledEndTime = scaledStartTime + this.period_.duration;
      endTime = scaledEndTime * segmentList.timescale;
    }

    lastEndTime = endTime;

    var startByte = 0;
    var endByte = null;
    if (segmentUrl.mediaRange) {
      startByte = segmentUrl.mediaRange.begin;
      endByte = segmentUrl.mediaRange.end;
    }

    references.push(
        new shaka.media.SegmentReference(
            scaledStartTime,
            scaledEndTime,
            startByte,
            endByte,
            new goog.Uri(segmentUrl.mediaUrl)));
  }

  this.segmentIndex_ = new shaka.media.SegmentIndex(references);
  return Promise.resolve(this.segmentIndex_);
};

