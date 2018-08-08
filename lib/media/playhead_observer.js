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

goog.provide('shaka.media.MediaSourcePlayheadObserver');
goog.provide('shaka.media.PlayheadObserver');
goog.provide('shaka.media.VideoPlayheadObserver');

goog.require('goog.asserts');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ObjectUtils');
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
 * @param {number} minBufferTime
 * @param {shaka.extern.StreamingConfiguration} config
 * @param {function(boolean)} onBuffering Called and passed true when stopped
 *   for buffering; called and passed false when proceeding after buffering.
 *   If passed true, the callback should not set the video's playback rate.
 * @param {function(!Event)} onEvent Called when an event is raised to be sent
 *   to the application.
 * @param {function()} onChangePeriod Called when the playhead moves to a
 *   different Period.
 * @param {!shaka.media.PlayheadObserver.Implementation} impl Some functions
 *   need to be implemented differently depending on if we are using media
 *   media source or "video.src=".
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.PlayheadObserver = function(
    video, minBufferTime, config, onBuffering, onEvent, onChangePeriod, impl) {
  /** @private {HTMLMediaElement} */
  this.video_ = video;

  /** @private {number} */
  this.minBufferTime_ = minBufferTime;

  /** @private {?shaka.extern.StreamingConfiguration} */
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

  /** @private {?shaka.media.PlayheadObserver.Implementation} */
  this.impl_ = impl;

  /** @private {!shaka.util.Destroyer} */
  this.destroyer_ = new shaka.util.Destroyer(() => {
    let p = Promise.all([
      this.eventManager_ ? this.eventManager_.destroy() : null,
      this.impl_ ? this.impl_.destroy() : null,
    ]);

    this.eventManager_ = null;
    this.cancelWatchdogTimer_();

    // Break all the links to other objects.
    this.video_ = null;
    this.config_ = null;
    this.onBuffering_ = null;
    this.onEvent_ = null;
    this.onChangePeriod_ = null;
    this.timelineRegions_ = [];
    this.impl_ = null;

    return p;
  });

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
 * @enum {number}
 * @private
 */
shaka.media.PlayheadObserver.RegionLocation_ = {
  FUTURE_REGION: 1,
  INSIDE: 2,
  PAST_REGION: 3,
};


/**
 * @extends {shaka.util.IDestroyable}
 * @interface
 */
shaka.media.PlayheadObserver.Implementation = class {
  /**
   * Get the period for the given time.
   *
   * @param {number} time
   * @return {number}
   */
  getPeriodIndex(time) {}

  /**
   * Check if we have buffered to the end of the content given the current end
   * of the buffered range.
   *
   * @param {number} bufferedEnd
   * @return {boolean}
   */
  isBufferedToEnd(bufferedEnd) {}
};


/**
 * @typedef {{
 *   info: shaka.extern.TimelineRegionInfo,
 *   status: shaka.media.PlayheadObserver.RegionLocation_
 * }}
 *
 * @property {shaka.extern.TimelineRegionInfo} info
 *   The info for this timeline region.
 * @property {shaka.media.PlayheadObserver.RegionLocation_} status
 *   This tracks where the region is relative to the playhead.  This tracks
 *   whether we are before or after the region so we can raise events if we pass
 *   it.
 */
shaka.media.PlayheadObserver.TimelineRegion;


/** @override */
shaka.media.PlayheadObserver.prototype.destroy = function() {
  return this.destroyer_.destroy();
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
 * @param {shaka.extern.TimelineRegionInfo} regionInfo
 */
shaka.media.PlayheadObserver.prototype.addTimelineRegion = function(
    regionInfo) {
  // Check there isn't an existing event with the same scheme ID and time range.
  // This ensures that the manifest parser doesn't need to also track which
  // events have already been added.
  let hasExistingRegion = this.timelineRegions_.some(function(existing) {
    return existing.info.schemeIdUri == regionInfo.schemeIdUri &&
        existing.info.startTime == regionInfo.startTime &&
        existing.info.endTime == regionInfo.endTime;
  });
  if (hasExistingRegion) return;

  let region = {
    info: regionInfo,
    status: shaka.media.PlayheadObserver.RegionLocation_.FUTURE_REGION,
  };
  this.timelineRegions_.push(region);

  let cloneTimelineInfo_ = shaka.media.PlayheadObserver.cloneTimelineInfo_;
  let event = new shaka.util.FakeEvent(
      'timelineregionadded', {detail: cloneTimelineInfo_(regionInfo)});
  this.onEvent_(event);

  // Pretend this is a seek so it will ignore if it should be PAST_REGION but
  // still fire an event if it should be INSIDE.
  this.updateTimelineRegion_(/* isSeek */ true, region);
};


/**
 * Clones the given TimelineRegionInfo so the app can modify it without
 * modifying our internal objects.
 * @param {shaka.extern.TimelineRegionInfo} source
 * @return {shaka.extern.TimelineRegionInfo}
 * @private
 */
shaka.media.PlayheadObserver.cloneTimelineInfo_ = function(source) {
  // cloneObject will ignore non-simple objects like the DOM element.
  let copy = shaka.util.ObjectUtils.cloneObject(source);
  copy.eventElement = source.eventElement;
  return copy;
};


/**
 * Updates the status of a timeline region and fires any enter/exit events.
 * @param {boolean} isSeek
 * @param {shaka.media.PlayheadObserver.TimelineRegion} region
 * @private
 */
shaka.media.PlayheadObserver.prototype.updateTimelineRegion_ = function(
    isSeek, region) {
  let RegionLocation = shaka.media.PlayheadObserver.RegionLocation_;
  let cloneTimelineInfo_ = shaka.media.PlayheadObserver.cloneTimelineInfo_;

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
  let newStatus = region.info.startTime > this.video_.currentTime ?
      RegionLocation.FUTURE_REGION :
      (region.info.endTime < this.video_.currentTime ?
           RegionLocation.PAST_REGION :
           RegionLocation.INSIDE);
  const wasInside = region.status == RegionLocation.INSIDE;
  const isInside = newStatus == RegionLocation.INSIDE;

  if (newStatus != region.status) {
    let passedRegion = !wasInside && !isInside;
    if (!(isSeek && passedRegion)) {
      if (!wasInside) {
        this.onEvent_(new shaka.util.FakeEvent(
            'timelineregionenter',
            {'detail': cloneTimelineInfo_(region.info)}));
      }
      if (!isInside) {
        this.onEvent_(new shaka.util.FakeEvent(
            'timelineregionexit', {'detail': cloneTimelineInfo_(region.info)}));
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
  goog.asserts.assert(
      this.config_,
      'Cannot update time when playhead observer has been destroyed');

  this.watchdogTimer_ = null;
  this.startWatchdogTimer_();

  let newPeriod = this.impl_.getPeriodIndex(this.video_.currentTime);

  if (newPeriod != this.curPeriodIndex_) {
    // Ignore seek to start time; the first 'trackschanged' event is handled
    // during player.load().
    if (this.curPeriodIndex_ != -1) {
      this.onChangePeriod_();
    }
    this.curPeriodIndex_ = newPeriod;
  }

  // This uses an intersection of buffered ranges for both audio and video, so
  // it's an accurate way to determine if we are buffering or not.
  let bufferedAhead = shaka.media.TimeRangesUtils.bufferedAheadOf(
      this.video_.buffered, this.video_.currentTime);
  let bufferEnd = shaka.media.TimeRangesUtils.bufferEnd(this.video_.buffered);
  let bufferedToEnd = this.impl_.isBufferedToEnd(bufferEnd || 0);

  if (!this.buffering_) {
    // If there are no buffered ranges but the playhead is at the end of
    // the video then we shouldn't enter a buffering state.
    const threshold = shaka.media.PlayheadObserver.UNDERFLOW_THRESHOLD_;
    if (!bufferedToEnd && bufferedAhead < threshold) {
      this.setBuffering_(true);
    }
  } else {
    let rebufferingGoal = Math.max(
        this.minBufferTime_,
        this.config_.rebufferingGoal);
    if (bufferedToEnd || bufferedAhead >= rebufferingGoal) {
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


/**
 * @implements {shaka.media.PlayheadObserver.Implementation}
 */
shaka.media.VideoPlayheadObserver = class {
  /**
   * @param {!HTMLMediaElement} video
   */
  constructor(video) {
    /** @private {HTMLMediaElement} */
    this.video_ = video;
  }

  /** @override */
  destroy() {
    this.video_ = null;
    return Promise.resolve();
  }

  /** @override */
  getPeriodIndex(time) {
    // There is really just one period, so always return the first period
    // index.
    return 0;
  }

  /** @override */
  isBufferedToEnd(bufferEnd) {
    // video.ended is only true when the playhead reaches the end. With src=, we
    // don't get to fetch and append, so we can (at best) compare buffered range
    // end to duration and fall back to video.ended, since the duration might
    // not be precise.

    return bufferEnd >= this.video_.duration || this.video_.ended;
  }
};


/**
 * @implements {shaka.media.PlayheadObserver.Implementation}
 */
shaka.media.MediaSourcePlayheadObserver = class {
  /**
   * @param {!HTMLMediaElement} video
   * @param {!shaka.media.MediaSourceEngine} mediaSourceEngine
   * @param {shaka.extern.Manifest} manifest
   */
  constructor(video, mediaSourceEngine, manifest) {
    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {shaka.media.MediaSourceEngine} */
    this.mediaSourceEngine_ = mediaSourceEngine;

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = manifest;
  }

  /** @override */
  destroy() {
    this.video_ = null;
    this.mediaSourceEngine_= null;
    this.manifest_ = null;

    return Promise.resolve();
  }

  /** @override */
  getPeriodIndex(time) {
    goog.asserts.assert(
        this.manifest_,
        'Cannot call getPeriodIndex after calling destroy');

    return shaka.util.StreamUtils.findPeriodContainingTime(
        this.manifest_, time);
  }

  /** @override */
  isBufferedToEnd(bufferEnd) {
    goog.asserts.assert(
        this.manifest_,
        'Cannot call atEnd after calling destroy');

    let timeline = this.manifest_.presentationTimeline;

    let liveEdge = timeline.getSegmentAvailabilityEnd();
    let bufferedToLiveEdge = timeline.isLive() && bufferEnd >= liveEdge;
    let noMoreSegments = this.mediaSourceEngine_.ended();

    return bufferedToLiveEdge || noMoreSegments || this.video_.ended;
  }
};
