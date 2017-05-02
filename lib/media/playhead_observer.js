/**
 * @license
 * Copyright 2016 Google Inc.
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

goog.provide('shaka.media.PlayheadObserver');

goog.require('goog.asserts');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.StreamUtils');



/**
 * This observes the current playhead position to raise events.  This will only
 * observe the playhead, {@link shaka.media.Playhead} will modify it. This will:
 * <ul>
 *   <li>Track buffering state and call |onBuffering|.</li>
 *   <li>Track current Period and call |onChangePeriod|.</li>
 *   <li>Track timeline regions and raise respective events.</li>
 * </ul>
 *
 * @param {HTMLMediaElement} video
 * @param {shakaExtern.Manifest} manifest
 * @param {shakaExtern.StreamingConfiguration} config
 * @param {function(boolean)} onBuffering Called and passed true when stopped
 *   for buffering; called and passed false when proceeding after buffering.
 *   If passed true, the callback should not set the video's playback rate.
 * @param {function(!Event)} onEvent Called when an event is raised to be sent
 *   to the application.
 * @param {function()} onChangePeriod Called when the playhead moves to a
 *   different Period.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.PlayheadObserver = function(
    video, manifest, config, onBuffering, onEvent, onChangePeriod) {
  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = manifest;

  /** @private {?shakaExtern.StreamingConfiguration} */
  this.config_ = config;

  /** @private {?function(boolean)} */
  this.onBuffering_ = onBuffering;

  /** @private {?function(!Event)} */
  this.onEvent_ = onEvent;

  /** @private {?function()} */
  this.onChangePeriod_ = onChangePeriod;

  /** @private {!Array.<shaka.media.PlayheadObserver.TimelineRegion>} */
  this.timelineRegions_ = [];

  /** @private {shaka.util.EventManager} */
  this.eventManager_ = new shaka.util.EventManager();

  /** @private {boolean} */
  this.buffering_ = false;

  /** @private {number} */
  this.curPeriodIndex_ = -1;

  /** @private {?number} */
  this.watchdogTimer_ = null;


  this.startWatchdogTimer_();
};


/**
 * The threshold for underflow, in seconds.  If there is less than this amount
 * of data buffered, we will consider the player to be out of data.
 *
 * @private {number}
 * @const
 */
shaka.media.PlayheadObserver.UNDERFLOW_THRESHOLD_ = 0.5;


/**
 * A fudge factor used when comparing buffered ranges to the duration to
 * determine if we have buffered all available content.
 *
 * @private {number}
 * @const
 */
shaka.media.PlayheadObserver.FUDGE_FACTOR_ = 0.1;


/**
 * @enum {number}
 * @private
 */
shaka.media.PlayheadObserver.RegionLocation_ = {
  FUTURE_REGION: 1,
  INSIDE: 2,
  PAST_REGION: 3
};


/**
 * @typedef {{
 *   info: shakaExtern.TimelineRegionInfo,
 *   status: shaka.media.PlayheadObserver.RegionLocation_
 * }}
 *
 * @property {shakaExtern.TimelineRegionInfo} info
 *   The info for this timeline region.
 * @property {shaka.media.PlayheadObserver.RegionLocation_} status
 *   This tracks where the region is relative to the playhead. This tracks
 *   whether we are before or after the region so we can raise events if we pass
 *   it.
 */
shaka.media.PlayheadObserver.TimelineRegion;


/** @override */
shaka.media.PlayheadObserver.prototype.destroy = function() {
  var p = this.eventManager_ ? this.eventManager_.destroy() : Promise.resolve();

  this.eventManager_ = null;
  this.cancelWatchdogTimer_();

  this.video_ = null;
  this.manifest_ = null;
  this.config_ = null;
  this.onBuffering_ = null;
  this.onEvent_ = null;
  this.onChangePeriod_ = null;
  this.timelineRegions_ = [];

  return p;
};


/** Called when a seek completes. */
shaka.media.PlayheadObserver.prototype.seeked = function() {
  this.timelineRegions_.forEach(
      this.updateTimelineRegion_.bind(this, /* isSeek */ true));
};


/**
 * Adds a new timeline region.  Events will be raised whenever the playhead
 * enters or exits the given region.  This method will raise a
 * 'timelineregionadded' event.
 * @param {shakaExtern.TimelineRegionInfo} regionInfo
 */
shaka.media.PlayheadObserver.prototype.addTimelineRegion = function(
    regionInfo) {
  // Check there isn't an existing event with the same scheme ID and time range.
  // This ensures that the manifest parser doesn't need to also track which
  // events have already been added.
  var hasExistingRegion = this.timelineRegions_.some(function(existing) {
    return existing.info.schemeIdUri == regionInfo.schemeIdUri &&
        existing.info.startTime == regionInfo.startTime &&
        existing.info.endTime == regionInfo.endTime;
  });
  if (hasExistingRegion) return;

  var region = {
    info: regionInfo,
    status: shaka.media.PlayheadObserver.RegionLocation_.FUTURE_REGION
  };
  this.timelineRegions_.push(region);

  var cloneObject = shaka.util.ConfigUtils.cloneObject;
  var event = new shaka.util.FakeEvent(
      'timelineregionadded', {detail: cloneObject(regionInfo)});
  this.onEvent_(event);

  // Pretend this is a seek so it will ignore if it should be PAST_REGION but
  // still fire an event if it should be INSIDE.
  this.updateTimelineRegion_(/* isSeek */ true, region);
};


/**
 * Updates the status of a timeline region and fires any enter/exit events.
 * @param {boolean} isSeek
 * @param {shaka.media.PlayheadObserver.TimelineRegion} region
 * @private
 */
shaka.media.PlayheadObserver.prototype.updateTimelineRegion_ = function(
    isSeek, region) {
  var RegionLocation = shaka.media.PlayheadObserver.RegionLocation_;
  var cloneObject = shaka.util.ConfigUtils.cloneObject;

  // The events are fired when the playhead enters a region.  We fire both
  // events when passing over a region and not seeking since the playhead was
  // in the region but left before we saw it.  We don't fire both when seeking
  // since the playhead was never in the region.
  //
  // |--------------------------------------|
  // | From \ To |  FUTURE | INSIDE | PAST  |
  // |   FUTURE  |         |  enter | both* |
  // |   INSIDE  |   exit  |        | exit  |
  // |    PAST   |   both* |  enter |       |
  // |--------------------------------------|
  // * Only when not seeking.
  var newStatus = region.info.startTime > this.video_.currentTime ?
      RegionLocation.FUTURE_REGION :
      (region.info.endTime < this.video_.currentTime ?
           RegionLocation.PAST_REGION :
           RegionLocation.INSIDE);
  var wasInside = region.status == RegionLocation.INSIDE;
  var isInside = newStatus == RegionLocation.INSIDE;

  if (newStatus != region.status) {
    var passedRegion = !wasInside && !isInside;
    if (!(isSeek && passedRegion)) {
      if (!wasInside) {
        this.onEvent_(new shaka.util.FakeEvent(
            'timelineregionenter', {'detail': cloneObject(region.info)}));
      }
      if (!isInside) {
        this.onEvent_(new shaka.util.FakeEvent(
            'timelineregionexit', {'detail': cloneObject(region.info)}));
      }
    }
    region.status = newStatus;
  }
};


/**
 * Starts the watchdog timer.
 * @private
 */
shaka.media.PlayheadObserver.prototype.startWatchdogTimer_ = function() {
  this.cancelWatchdogTimer_();
  this.watchdogTimer_ =
      window.setTimeout(this.onWatchdogTimer_.bind(this), 250);
};


/**
 * Cancels the watchdog timer, if any.
 * @private
 */
shaka.media.PlayheadObserver.prototype.cancelWatchdogTimer_ = function() {
  if (this.watchdogTimer_) {
    window.clearTimeout(this.watchdogTimer_);
    this.watchdogTimer_ = null;
  }
};


/**
 * Called on a recurring timer to detect buffering events and Period changes.
 * @private
 */
shaka.media.PlayheadObserver.prototype.onWatchdogTimer_ = function() {
  this.watchdogTimer_ = null;
  this.startWatchdogTimer_();

  goog.asserts.assert(this.manifest_ && this.config_, 'Must not be destroyed');
  var newPeriod = shaka.util.StreamUtils.findPeriodContainingTime(
      this.manifest_, this.video_.currentTime);
  if (newPeriod != this.curPeriodIndex_) {
    this.onChangePeriod_();
    this.curPeriodIndex_ = newPeriod;
  }

  // This uses an intersection of buffered ranges for both audio and video, so
  // it's an accurate way to determine if we are buffering or not.
  var bufferedAhead = shaka.media.TimeRangesUtils.bufferedAheadOf(
      this.video_.buffered, this.video_.currentTime);
  var bufferEnd = shaka.media.TimeRangesUtils.bufferEnd(this.video_.buffered);

  var fudgeFactor = shaka.media.PlayheadObserver.FUDGE_FACTOR_;
  var threshold = shaka.media.PlayheadObserver.UNDERFLOW_THRESHOLD_;

  var timeline = this.manifest_.presentationTimeline;
  var duration = timeline.getSegmentAvailabilityEnd() - fudgeFactor;

  var atEnd = (bufferEnd >= duration) || (this.video_.ended);
  if (!this.buffering_) {
    // If there are no buffered ranges but the playhead is at the end of
    // the video then we shouldn't enter a buffering state.
    if (!atEnd && bufferedAhead < threshold) {
      this.setBuffering_(true);
    }
  } else {
    var rebufferingGoal = shaka.util.StreamUtils.getRebufferingGoal(
        this.manifest_, this.config_, 1 /* scaleFactor */);
    if (atEnd || bufferedAhead >= rebufferingGoal) {
      this.setBuffering_(false);
    }
  }

  this.timelineRegions_.forEach(
      this.updateTimelineRegion_.bind(this, /* isSeek */ false));
};


/**
 * Stops the playhead for buffering, or resumes the playhead after buffering.
 *
 * @param {boolean} buffering True to stop the playhead; false to allow it to
 *   continue.
 * @private
 */
shaka.media.PlayheadObserver.prototype.setBuffering_ = function(buffering) {
  if (buffering != this.buffering_) {
    this.buffering_ = buffering;
    this.onBuffering_(buffering);
  }
};
