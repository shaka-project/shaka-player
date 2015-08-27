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

goog.provide('shaka.dash.ListSegmentIndexSource');

goog.require('shaka.asserts');
goog.require('shaka.dash.LiveSegmentIndex');
goog.require('shaka.features');
goog.require('shaka.log');
goog.require('shaka.media.ISegmentIndexSource');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.TypedBind');



/**
 * Creates an ISegmentIndexSource that constructs a SegmentIndex from a
 * SegmentList.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @constructor
 * @struct
 * @implements {shaka.media.ISegmentIndexSource}
 */
shaka.dash.ListSegmentIndexSource = function(
    mpd, period, representation, manifestCreationTime, networkCallback) {
  shaka.asserts.assert(representation.segmentList);

  // Alias
  var timeline = representation.segmentList.timeline;

  shaka.asserts.assert(representation.segmentList.segmentDuration ||
                       representation.segmentList.segmentUrls.length == 1 ||
                       (timeline != null && timeline.timePoints.length > 0));
  shaka.asserts.assert(representation.segmentList.timescale > 0);

  /** @private {!shaka.dash.mpd.Mpd} */
  this.mpd_ = mpd;

  /** @private {!shaka.dash.mpd.Period} */
  this.period_ = period;

  /** @private {!shaka.dash.mpd.Representation} */
  this.representation_ = representation;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;

  /** @private {number} */
  this.manifestCreationTime_ = manifestCreationTime;

  /** @private {shaka.util.FailoverUri.NetworkCallback} */
  this.networkCallback_ = networkCallback;
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.ListSegmentIndexSource.prototype.destroy = function() {
  this.mpd_ = null;
  this.period_ = null;
  this.representation_ = null;
  this.networkCallback_ = null;

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

  /** @type {!Array.<{start: number, end: number}>} */
  var timeline = [];
  if (segmentList.timeline) {
    timeline = shaka.dash.MpdUtils.createTimeline(
        segmentList.timeline, segmentList.timescale || 1,
        this.period_.duration || 0);
  }

  // Calculate an initial start time.
  var lastEndTime = 0;
  if (segmentList.segmentDuration && segmentList.startNumber) {
    lastEndTime = segmentList.segmentDuration * segmentList.startNumber;
  } else if (timeline.length > 0) {
    // Align the SegmentReferences to the Period's start
    // (see shaka.dash.TimelineSegmentIndexSource.create).
    lastEndTime = timeline[0].start - (segmentList.presentationTimeOffset || 0);
  }

  var max = segmentList.segmentUrls.length;
  if (timeline.length > 0 &&
      timeline.length != segmentList.segmentUrls.length) {
    max = Math.min(timeline.length, segmentList.segmentUrls.length);
    shaka.log.warning(
        'The length of the segment timeline and segment',
        'urls does not match, truncating', segmentList.segmentUrls.length,
        'to', max);
  }

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];

  for (var i = 0; i < max; ++i) {
    var segmentUrl = segmentList.segmentUrls[i];

    var startTime = lastEndTime;
    shaka.asserts.assert(startTime >= 0);
    var scaledStartTime = startTime / segmentList.timescale;

    var endTime = null;
    var scaledEndTime = null;

    if (segmentList.segmentDuration) {
      endTime = startTime + segmentList.segmentDuration;
      scaledEndTime = endTime / segmentList.timescale;
    } else if (timeline.length > 0) {
      // Ignore the timepoint start since they are continuous.
      endTime = timeline[i].end - (segmentList.presentationTimeOffset || 0);
      scaledEndTime = endTime / segmentList.timescale;
    } else {
      // If segmentList.segmentDuration and timeline are null then there must
      // only be one segment.
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
            new shaka.util.FailoverUri(
                this.networkCallback_, segmentUrl.mediaUrl,
                startByte, endByte)));
  }

  if (shaka.features.Live && this.mpd_.type == 'dynamic') {
    this.segmentIndex_ = new shaka.dash.LiveSegmentIndex(
        references,
        this.mpd_,
        this.period_,
        this.manifestCreationTime_);
  } else {
    shaka.asserts.assert(this.mpd_.type == 'static');
    this.segmentIndex_ = new shaka.media.SegmentIndex(references);
  }
  return Promise.resolve(this.segmentIndex_);
};

