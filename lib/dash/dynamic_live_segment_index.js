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

goog.provide('shaka.dash.DynamicLiveSegmentIndex');

goog.require('shaka.asserts');
goog.require('shaka.dash.LiveSegmentIndex');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.util.ArrayUtils');



/**
 * Creates a SegmentIndex that supports live DASH content by generating
 * SegmentReferences as needed and automatically evicting SegmentReferences
 * that are no longer available.
 *
 * If the SegmentIndex's corresponding stream is not available yet then the
 * SegmentIndex will be inactive: it will not contain any SegmentReferences nor
 * will it generate any new SegmentReferences. An inactive SegmentIndex can be
 * activated by integrating an active SegmentIndex into it.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @param {shaka.util.FailoverUri.NetworkCallback} networkCallback
 * @throws {Error} If the SegmentIndex's corresponding stream is available but
 *     the initial SegmentReferences could not be generated.
 * @constructor
 * @struct
 * @extends {shaka.dash.LiveSegmentIndex}
 */
shaka.dash.DynamicLiveSegmentIndex = function(
    mpd, period, representation, manifestCreationTime, networkCallback) {
  shaka.asserts.assert(mpd.availabilityStartTime != null);
  shaka.asserts.assert(period.start != null);
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.segmentDuration);
  shaka.asserts.assert(representation.segmentTemplate.timescale > 0);

  // Alias.
  var DynamicLiveSegmentIndex = shaka.dash.DynamicLiveSegmentIndex;

  var earliestSegmentNumber = 1;
  var numSegments = 0;
  var pair = DynamicLiveSegmentIndex.computeAvailableSegmentRange_(
      mpd, period, representation, manifestCreationTime);
  if (pair) {
    earliestSegmentNumber = pair.earliest;
    numSegments = pair.current - pair.earliest + 1;
  }

  var references = shaka.dash.MpdUtils.generateSegmentReferences(
      networkCallback, representation, earliestSegmentNumber, numSegments);
  if (references == null) {
    var error = new Error('Failed to generate SegmentReferences.');
    error.type = 'stream';
    throw error;
  }
  shaka.asserts.assert(references.length == 0 ||
                       references[references.length - 1].endTime != null);

  shaka.dash.LiveSegmentIndex.call(
      this, references, mpd, period, manifestCreationTime);

  /** @private {!shaka.dash.mpd.Representation} */
  this.representation_ = representation;

  /**
   * Either the time when the last segment became available, in seconds, or
   * null if this SegmentIndex is inactive.
   *
   * @private {?number}
   */
  this.latestAvailableSegmentEndTime_ =
      this.length() > 0 ?
      mpd.availabilityStartTime + period.start + this.last().endTime :
      null;
  shaka.asserts.assert(this.latestAvailableSegmentEndTime_ <=
                       manifestCreationTime);

  /**
   * Either the time when the last segment became available when the manifest
   * was created, in seconds, or null if this SegmentIndex is inactive.
   *
   * @private {?number}
   */
  this.originalLatestAvailableSegmentEndTime_ =
      this.latestAvailableSegmentEndTime_;

  /**
   * Either the segment number (one-based) of the next new SegmentReference, or
   * null if this SegmentIndex is inactive.
   *
   * @private {?number}
   */
  this.nextSegmentNumber_ = pair ? pair.current + 1 : null;

  /** @private {shaka.util.FailoverUri.NetworkCallback} */
  this.networkCallback_ = networkCallback;
};
goog.inherits(shaka.dash.DynamicLiveSegmentIndex,
              shaka.dash.LiveSegmentIndex);


/**
 * Computes the segment numbers of the earliest segment and the current
 * segment, both relative to the start of |period|. Assumes the MPD is dynamic
 * and the Representation has a SegmentTemplate that specifies a segment
 * duration.
 *
 * The earliest segment is the segment with the smallest start time that is
 * still available from the media server. The current segment is the segment
 * with the largest start time that is available from the media server and that
 * also respects the 'suggestedPresentationDelay' attribute.
 *
 * @param {!shaka.dash.mpd.Mpd} mpd
 * @param {!shaka.dash.mpd.Period} period
 * @param {!shaka.dash.mpd.Representation} representation
 * @param {number} manifestCreationTime The time, in seconds, when the manifest
 *     was created.
 * @return {?{earliest: number, current: number}} Two segment numbers
 *     (both one-based), or null if the stream is not available yet.
 * @private
 */
shaka.dash.DynamicLiveSegmentIndex.computeAvailableSegmentRange_ =
    function(mpd, period, representation, manifestCreationTime) {
  shaka.asserts.assert(period.start != null);
  shaka.asserts.assert(representation.segmentTemplate);
  shaka.asserts.assert(representation.segmentTemplate.segmentDuration);
  shaka.asserts.assert(representation.segmentTemplate.timescale > 0);

  if (mpd.availabilityStartTime > manifestCreationTime) {
    shaka.log.warning('The stream is not available yet!', period);
    return null;
  }

  var suggestedPresentationDelay = mpd.suggestedPresentationDelay || 0;
  var timeShiftBufferDepth = mpd.timeShiftBufferDepth || 0;

  // The following diagram shows the relationship between the values we use to
  // compute the current segment number; descriptions of each value are given
  // within the code. The diagram depicts the media presentation timeline. 0
  // corresponds to availabilityStartTime + period.start in wall-clock time,
  // and currentPresentationTime corresponds to |manifestCreationTime_| in
  // wall-clock time.
  //
  // Legend:
  // CPT: currentPresentationTime
  // EAT: earliestAvailableSegmentStartTime
  // LAT: latestAvailableSegmentStartTime
  // BAT: bestAvailableSegmentStartTime
  // SD:  scaledSegmentDuration.
  // SPD: suggestedPresentationDelay
  // TSB: timeShiftBufferDepth
  //
  // Time:
  //   <---|-----------------+--------+-----------------+----------|--------->
  //       0                EAT      BAT               LAT        CPT
  //                                                      |---SD---|
  //                                      |-----SPD-----|
  //                      |---SD---|---SD---|<--------TSB--------->|
  // Segments:
  //   <---1--------2--------3--------4--------5--------6--------7--------8-->
  //       |---SD---|---SD---| ...

  var segmentTemplate = representation.segmentTemplate;

  var scaledSegmentDuration =
      segmentTemplate.segmentDuration / segmentTemplate.timescale;

  // The current presentation time, which is the amount of time since the start
  // of the Period.
  var currentPresentationTime =
      manifestCreationTime - (mpd.availabilityStartTime + period.start);
  if (currentPresentationTime < 0) {
    shaka.log.warning('The Period is not available yet!', period);
    return null;
  }

  // Compute the segment start time of the earliest available segment, i.e.,
  // the segment that starts furthest from the present but is still available).
  // The MPD spec. indicates that
  //
  // SegmentAvailabilityStartTime =
  //   MpdAvailabilityStartTime + PeriodStart + SegmentStart + SegmentDuration
  //
  // SegmentAvailabilityEndTime =
  //   SegmentAvailabilityStartTime + SegmentDuration + TimeShiftBufferDepth
  //
  // So let SegmentAvailabilityEndTime equal the current time and compute
  // SegmentStart, which yields the start time that a segment would need to
  // have to have an availability end time equal to the current time.
  //
  // TODO: Take into account @availabilityTimeOffset.
  var earliestAvailableTimestamp = currentPresentationTime -
                                   (2 * scaledSegmentDuration) -
                                   timeShiftBufferDepth;
  if (earliestAvailableTimestamp < 0) {
    earliestAvailableTimestamp = 0;
  }

  // Now round up to the nearest segment boundary, since the segment
  // corresponding to |earliestAvailableTimestamp| is not available.
  var earliestAvailableSegmentStartTime =
      Math.ceil(earliestAvailableTimestamp / scaledSegmentDuration) *
      scaledSegmentDuration;

  // Compute the segment start time of the latest available segment, i.e., the
  // segment that starts closest to the present but is available.
  //
  // Using the above formulas, let SegmentAvailabilityStartTime equal the
  // current time and compute SegmentStart, which yields the start time that
  // a segment would need to have to have an availability start time
  // equal to the current time.
  var latestAvailableTimestamp = currentPresentationTime -
                                 scaledSegmentDuration;
  if (latestAvailableTimestamp < 0) {
    shaka.log.warning('The first segment is not available yet!', period);
    return null;
  }

  // Now round down to the nearest segment boundary, since the segment
  // corresponding to |latestAvailableTimestamp| may not yet be available.
  var latestAvailableSegmentStartTime =
      Math.floor(latestAvailableTimestamp / scaledSegmentDuration) *
      scaledSegmentDuration;

  // Now compute the start time of the "best" available segment by offsetting
  // by @suggestedPresentationDelay.
  var bestAvailableTimestamp = latestAvailableSegmentStartTime -
                               suggestedPresentationDelay;
  if (bestAvailableTimestamp < 0) {
    shaka.log.warning('The first segment may not be available yet.');
    bestAvailableTimestamp = 0;
    // Don't return; taking into account @suggestedPresentationDelay is only a
    // reccomendation. The first segment /might/ be available.
  }

  var bestAvailableSegmentStartTime =
      Math.floor(bestAvailableTimestamp / scaledSegmentDuration) *
      scaledSegmentDuration;

  // Now take the larger of |bestAvailableSegmentStartTime| and
  // |earliestAvailableSegmentStartTime|.
  var currentSegmentStartTime;
  if (bestAvailableSegmentStartTime >= earliestAvailableSegmentStartTime) {
    currentSegmentStartTime = bestAvailableSegmentStartTime;
    shaka.log.v1('The best available segment is still available!');
  } else {
    // @suggestedPresentationDelay is large compared to @timeShiftBufferDepth,
    // so we can't start as far back as we'd like.
    currentSegmentStartTime = earliestAvailableSegmentStartTime;
    shaka.log.v1('The best available segment is no longer available.');
  }

  var earliestSegmentNumber =
      (earliestAvailableSegmentStartTime / scaledSegmentDuration) + 1;
  shaka.asserts.assert(
      earliestSegmentNumber == Math.round(earliestSegmentNumber),
      'earliestSegmentNumber should be an integer.');

  var currentSegmentNumber =
      (currentSegmentStartTime / scaledSegmentDuration) + 1;
  shaka.asserts.assert(
      currentSegmentNumber == Math.round(currentSegmentNumber),
      'currentSegmentNumber should be an integer.');

  shaka.log.v1('earliestSegmentNumber', earliestSegmentNumber);
  shaka.log.v1('currentSegmentNumber', currentSegmentNumber);

  return { earliest: earliestSegmentNumber, current: currentSegmentNumber };
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.DynamicLiveSegmentIndex.prototype.destroy = function() {
  this.representation_ = null;
  this.networkCallback_ = null;
  shaka.dash.LiveSegmentIndex.prototype.destroy.call(this);
};


/** @override */
shaka.dash.DynamicLiveSegmentIndex.prototype.find = function(time) {
  var wallTime = shaka.util.Clock.now() / 1000.0;
  this.generateSegmentReferences_(wallTime);
  return this.findInternal(time, wallTime);
};


/**
 * Integrates |segmentIndex| into this SegmentIndex, but only if this
 * SegmentIndex is inactive and |segmentIndex| is an active
 * DynamicLiveSegmentIndex.
 *
 * @override
 */
shaka.dash.DynamicLiveSegmentIndex.prototype.integrate = function(
    segmentIndex) {
  if (this.latestAvailableSegmentEndTime_ != null) {
    // There's no need to integrate |segmentIndex| since we are already
    // generating SegmentReferences.
    shaka.log.debug('Ignoring SegmentIndex integration.', this);
    return false;
  }

  if (!(segmentIndex instanceof shaka.dash.DynamicLiveSegmentIndex)) {
    // The SegmentIndex's corresponding Representation changed, or we were
    // called with an incorrect SegmentIndex, either way, don't do anything.
    shaka.log.warning('Cannot integrate SegmentIndex:',
                      'Only a DynamicLiveSegmentIndex can be integrated into',
                      'another DynamicLiveSegmentIndex.',
                      this);
    return false;
  }

  var other = /** @type {!shaka.dash.DynamicLiveSegmentIndex} */ (segmentIndex);
  if (other.latestAvailableSegmentEndTime_ == null) {
    // The stream still isn't available.
    return false;
  }

  this.latestAvailableSegmentEndTime_ =
      other.latestAvailableSegmentEndTime_;
  this.originalLatestAvailableSegmentEndTime_ =
      other.originalLatestAvailableSegmentEndTime_;
  this.nextSegmentNumber_ = other.nextSegmentNumber_;
  this.manifestCreationTime = other.manifestCreationTime;
  this.duration = other.duration;

  this.merge(segmentIndex);
  this.generateSegmentReferences_(shaka.util.Clock.now() / 1000.0);
  this.initializeSeekWindow();

  return true;
};


/** @override */
shaka.dash.DynamicLiveSegmentIndex.prototype.correct = function(
    timestampCorrection) {
  var delta = shaka.dash.LiveSegmentIndex.prototype.correct.call(
      this, timestampCorrection);

  if (this.latestAvailableSegmentEndTime_ != null) {
    shaka.asserts.assert(
        this.originalLatestAvailableSegmentEndTime_ != null);
    this.latestAvailableSegmentEndTime_ += delta;
    this.originalLatestAvailableSegmentEndTime_ += delta;
  }

  return delta;
};


/** @override */
shaka.dash.DynamicLiveSegmentIndex.prototype.getSeekRange = function() {
  var wallTime = shaka.util.Clock.now() / 1000.0;
  this.generateSegmentReferences_(wallTime);
  return this.getSeekRangeInternal(wallTime);
};


/**
 * @param {number} wallTime The current wall-clock time in seconds.
 * @private
 */
shaka.dash.DynamicLiveSegmentIndex.prototype.generateSegmentReferences_ =
    function(wallTime) {
  if (this.latestAvailableSegmentEndTime_ == null ||
      this.originalLatestAvailableSegmentEndTime_ == null ||
      this.nextSegmentNumber_ == null) {
    return;
  }

  var manifestAge = wallTime - this.manifestCreationTime;

  // Compute the number of seconds that have elapsed between the time when the
  // last segment was generated and the current wall-clock time.
  var elapsed = (this.originalLatestAvailableSegmentEndTime_ + manifestAge) -
                this.latestAvailableSegmentEndTime_;
  shaka.asserts.assert(elapsed >= 0);

  // Determine the number of new SegmentReferences to generate.
  var segmentTemplate = this.representation_.segmentTemplate;
  var scaledSegmentDuration =
      (segmentTemplate.segmentDuration / segmentTemplate.timescale);
  var numNewSegments = Math.floor(elapsed / scaledSegmentDuration);

  if (numNewSegments == 0) {
    return;
  }

  // Generate and correct the new SegmentReferences.
  var newReferences = shaka.dash.MpdUtils.generateSegmentReferences(
      this.networkCallback_, this.representation_,
      this.nextSegmentNumber_, numNewSegments);

  // |newReferences| should never be null since generateSegmentReferences()
  // should have been called at least once successfully with |representation_|.
  shaka.asserts.assert(newReferences);
  newReferences =
      /** @type {!Array.<!shaka.media.SegmentReference>} */ (newReferences);

  Array.prototype.push.apply(
      this.references,
      shaka.media.SegmentReference.shift(
          newReferences, this.timestampCorrection));
  this.assertCorrectReferences();

  this.latestAvailableSegmentEndTime_ +=
      numNewSegments * scaledSegmentDuration;
  this.nextSegmentNumber_ += numNewSegments;

  shaka.log.debug('Generated', numNewSegments, 'SegmentReference(s).');
};

