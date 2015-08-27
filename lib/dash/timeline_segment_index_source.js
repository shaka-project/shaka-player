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

goog.provide('shaka.dash.TimelineSegmentIndexSource');

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
 * SegmentTemplate with a SegmentTimeline.
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
shaka.dash.TimelineSegmentIndexSource = function(
    mpd, period, representation, manifestCreationTime, networkCallback) {
  shaka.asserts.assert(period.start != null);
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.mediaUrlTemplate);
  shaka.asserts.assert(representation.segmentTemplate.timescale > 0);
  shaka.asserts.assert(representation.segmentTemplate.timeline);

  /** @private {!shaka.dash.mpd.Mpd} */
  this.mpd_ = mpd;

  /** @private {!shaka.dash.mpd.Period} */
  this.period_ = period;

  /** @private {!shaka.dash.mpd.Representation} */
  this.representation_ = representation;

  /** @private {number} */
  this.manifestCreationTime_ = manifestCreationTime;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;

  /** @private {shaka.util.FailoverUri.NetworkCallback} */
  this.networkCallback_ = networkCallback;
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.TimelineSegmentIndexSource.prototype.destroy = function() {
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
shaka.dash.TimelineSegmentIndexSource.prototype.create = function() {
  if (this.segmentIndex_) {
    return Promise.resolve(this.segmentIndex_);
  }

  var segmentTemplate = this.representation_.segmentTemplate;
  var timeline = shaka.dash.MpdUtils.createTimeline(
      segmentTemplate.timeline, segmentTemplate.timescale || 1,
      this.period_.duration || 0);

  /** @type {!Array.<!shaka.media.SegmentReference>} */
  var references = [];

  // If the MPD is dynamic then assume that the SegmentTimeline only contains
  // segments that are available or were available. This allows us to ignore
  // @availabilityStartTime.
  //
  // Note that the SegmentTimeline may contain segments that are no longer
  // available because they've moved outside the @timeShiftBufferDepth window.
  // However, these segments will be removed by LiveSegmentIndex.
  for (var i = 0; i < timeline.length; ++i) {
    var startTime = timeline[i].start;
    var endTime = timeline[i].end;

    var scaledStartTime = startTime / segmentTemplate.timescale;
    var scaledEndTime = endTime / segmentTemplate.timescale;

    // Compute the media URL template placeholder replacements. Note
    // that |segmentReplacement| may be zero.
    var segmentReplacement = i + segmentTemplate.startNumber;
    var timeReplacement = startTime;

    // Generate the media URL.
    var mediaUrl = shaka.dash.MpdUtils.createFromTemplate(
        this.networkCallback_, this.representation_, segmentReplacement,
        timeReplacement, 0, null);
    if (!mediaUrl) {
      var error = new Error('Failed to generate media URL.');
      error.type = 'dash';
      return Promise.reject(error);
    }

    // The time points within a SegmentTimeline correspond to the timestamps
    // within the media segments. So, if @presentationTimeOffset is non-zero
    // then we must offset the SegmentReferences' start and end times by PTO so
    // that they are relative to the Period's start.
    var scaledPto = (segmentTemplate.presentationTimeOffset || 0) /
                    segmentTemplate.timescale;
    references.push(
        new shaka.media.SegmentReference(
            scaledStartTime - scaledPto,
            scaledEndTime - scaledPto,
            mediaUrl));
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

