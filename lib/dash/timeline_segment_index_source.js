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
 * SegmentIndex from a SegmentTemplate with a SegmentTimeline.
 */

goog.provide('shaka.dash.TimelineSegmentIndexSource');

goog.require('shaka.asserts');
goog.require('shaka.dash.LiveSegmentIndex');
goog.require('shaka.log');
goog.require('shaka.media.ISegmentIndexSource');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.TypedBind');



/**
 * Creates a TimelineSegmentIndexSource.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @constructor
 * @struct
 * @implements {shaka.media.ISegmentIndexSource}
 */
shaka.dash.TimelineSegmentIndexSource = function(
    mpd, period, representation, manifestCreationTime) {
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
};


/**
 * Any gap/overlap within a SegmentTimeline that is greater than or equal to
 * this value (in seconds) will generate a warning message.
 * @const {number}
 */
shaka.dash.TimelineSegmentIndexSource.GAP_OVERLAP_WARN_THRESHOLD = 1.0 / 32.0;


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.TimelineSegmentIndexSource.prototype.destroy = function() {
  this.mpd_ = null;
  this.period_ = null;
  this.representation_ = null;

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
  var timeline = this.createTimeline_(segmentTemplate);

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
    var mediaUrl = shaka.dash.MpdUtils.fillMediaUrlTemplate(
        this.representation_, segmentReplacement, timeReplacement);
    if (!mediaUrl) {
      var error = new Error('Failed to generate media URL.');
      error.type = 'dash';
      return Promise.reject(error);
    }

    references.push(
        new shaka.media.SegmentReference(
            scaledStartTime,
            scaledEndTime,
            0 /* startByte */,
            null /* endByte */,
            new goog.Uri(mediaUrl)));
  }

  this.segmentIndex_ = this.mpd_.type == 'dynamic' ?
                       new shaka.dash.LiveSegmentIndex(
                           references,
                           this.mpd_,
                           this.period_,
                           this.manifestCreationTime_) :
                       new shaka.media.SegmentIndex(references);

  return Promise.resolve(this.segmentIndex_);
};


/**
 * Expands a SegmentTimeline into a simple array-based timeline.
 *
 * @return {!Array.<{start: number, end: number}>}
 * @private
 */
shaka.dash.TimelineSegmentIndexSource.prototype.createTimeline_ = function(
    segmentTemplate) {
  shaka.asserts.assert(segmentTemplate.timeline);

  var timePoints = segmentTemplate.timeline.timePoints;
  var lastEndTime = 0;

  /** @type {!Array.<{start: number, end: number}>} */
  var timeline = [];

  for (var i = 0; i < timePoints.length; ++i) {
    if (!timePoints[i].duration) {
      shaka.log.warning(
          'SegmentTimeline "S" element does not have a duration:',
          'ignoring the remaining "S" elements.',
          timePoints[i]);
      return timeline;
    }

    var startTime = timePoints[i].startTime != null ?
                    timePoints[i].startTime :
                    lastEndTime;

    var repeat = timePoints[i].repeat || 0;
    for (var j = 0; j <= repeat; ++j) {
      var endTime = startTime + timePoints[i].duration;

      // The end of the last segment may end before the start of the current
      // segment (a gap) or may end after the start of the current segment (an
      // overlap). If there is a gap/overlap then stretch/compress the end of
      // the last segment to the start of the current segment.
      //
      // Note: it is possible to move the start of the current segment to the
      // end of the last segment, but this would complicate the computation of
      // the $Time$ placeholder.
      if ((timeline.length > 0) && (startTime != lastEndTime)) {
        var delta = startTime - lastEndTime;

        if (Math.abs(delta / segmentTemplate.timescale) >=
            shaka.dash.TimelineSegmentIndexSource.GAP_OVERLAP_WARN_THRESHOLD) {
          shaka.log.warning(
              'SegmentTimeline contains a large gap/overlap.',
              'The content may have errors in it.',
              timePoints[i]);
        }

        timeline[timeline.length - 1].end = startTime;
      }

      timeline.push({start: startTime, end: endTime});

      startTime = endTime;
      lastEndTime = endTime;
    }  // for j
  }

  return timeline;
};

