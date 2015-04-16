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
 * @fileoverview Implements a DASH video source.
 */

goog.provide('shaka.player.DashVideoSource');

goog.require('shaka.dash.MpdProcessor');
goog.require('shaka.dash.MpdRequest');
goog.require('shaka.dash.mpd');
goog.require('shaka.player.DrmSchemeInfo');
goog.require('shaka.player.StreamVideoSource');
goog.require('shaka.util.EWMA');
goog.require('shaka.util.EWMABandwidthEstimator');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.TypedBind');


/**
 * @event shaka.player.DashVideoSource.SeekRangeChanged
 * @description Fired when the seekable range changes.
 * @property {string} type 'seekrangechanged'
 * @property {boolean} bubbles true
 * @property {number} start The earliest time that can be seeked to, in seconds.
 * @property {number} end The latest time that can be seeked to, in seconds.
 * @export
 */



/**
 * Creates a DashVideoSource.
 * @param {string} mpdUrl The MPD URL.
 * @param {?shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection A callback to interpret the ContentProtection
 *     elements in the MPD.
 * @param {shaka.util.IBandwidthEstimator} estimator
 *
 * @fires shaka.player.DashVideoSource.SeekRangeChanged
 *
 * @struct
 * @constructor
 * @extends {shaka.player.StreamVideoSource}
 * @export
 */
shaka.player.DashVideoSource =
    function(mpdUrl, interpretContentProtection, estimator) {
  if (!estimator) {
    // For backward compatibility, provide an instance of the default
    // implementation if none is provided.
    estimator = new shaka.util.EWMABandwidthEstimator();
  }

  shaka.player.StreamVideoSource.call(this, null, estimator);

  /** @private {string} */
  this.mpdUrl_ = mpdUrl;

  /** @private {?shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

  /** @private {?number} */
  this.targetUpdateTime_ = null;

  /**
   * The last time an MPD was fetched, in wall-clock time.
   * @private {?number}
   */
  this.lastMpdFetchTime_ = null;

  /** @private {shaka.util.EWMA} */
  this.latencyEstimator_ = new shaka.util.EWMA(5 /* half-life in samples */);

  /** @private {?number} */
  this.updateTimer_ = null;

  /** @private {number} */
  this.timeShiftBufferDepth_ = 0;

  /** @private {number} */
  this.initialSeekStartTime_ = 0;

  /** @private {number} */
  this.initialSeekEndTime_ = 0;

  /** @private {number} */
  this.seekStartTime_ = 0;

  /** @private {number} */
  this.seekEndTime_ = 0;

  /** @private {boolean} */
  this.streamsStarted_ = false;

  /** @private {?number} */
  this.seekRangeUpdateTimer_ = null;
};
goog.inherits(shaka.player.DashVideoSource, shaka.player.StreamVideoSource);


/**
 * A callback to the application to interpret DASH ContentProtection elements.
 * These elements can contain almost anything and can be highly application-
 * specific, so they cannot (in general) be interpreted by the library.
 *
 * The first parameter is the ContentProtection element.
 * The callback should return a DrmSchemeInfo object if the ContentProtection
 * element is understood by the application, or null otherwise.
 *
 * @typedef {function(!shaka.dash.mpd.ContentProtection):
 *           shaka.player.DrmSchemeInfo}
 * @expose
 */
shaka.player.DashVideoSource.ContentProtectionCallback;


/**
 * The minimum time, in seconds, between MPD fetches.
 * @const {number}
 * @private
 */
shaka.player.DashVideoSource.MIN_UPDATE_INTERVAL_ = 3;


/** @override */
shaka.player.DashVideoSource.prototype.destroy = function() {
  this.cancelUpdateTimer_();
  this.cancelSeekRangeUpdateTimer_();
  this.interpretContentProtection_ = null;
  this.latencyEstimator_ = null;
  shaka.player.StreamVideoSource.prototype.destroy.call(this);
};


/** @override */
shaka.player.DashVideoSource.prototype.load = function(preferredLanguage) {
  this.lastMpdFetchTime_ = Date.now() / 1000.0;
  var mpdRequest = new shaka.dash.MpdRequest(this.mpdUrl_);

  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        mpdProcessor.process(mpd);

        this.timeShiftBufferDepth_ = mpd.timeShiftBufferDepth || 0;
        this.manifestInfo = mpdProcessor.manifestInfo;

        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        var p = baseClassLoad.call(this, preferredLanguage);

        if (this.manifestInfo.live) {
          p.then(shaka.util.TypedBind(this,
              function() {
                this.sampleMpdLatency_();
                // Set a timer to call onUpdate_() so we update the manifest at
                // least every @minimumUpdatePeriod seconds.
                this.setUpdateTimer_(mpd.minUpdatePeriod || 0);
              }));
        }

        return p;
      })
  );
};


/** @override */
shaka.player.DashVideoSource.prototype.onStartStreams = function(
    selectedStreamInfosByType) {

  var streamLimits = this.computeStreamLimits();
  if (!streamLimits) {
    // An error has already been logged.
    return;
  }

  if (this.manifestInfo.live) {
    // The stream start time may be less than the current segment's start time
    // minus @timeShiftBufferDepth since the current segment and the previous
    // segment are always available
    // (see MpdProcessor.computeAvailableSegmentRange_).
    //
    // However, if the segment sizes are variable then segment availability end
    // time is not a continuous function, thus we cannot use the initial stream
    // limits as a rolling window to generate seek ranges. To avoid doing
    // anything complicated, just limit the seek range to @timeShiftBufferDepth
    // seconds.
    //
    // Note, however, that we need to ensure we don't set the seek start time
    // too low, the streams may have just begun broadcasting.
    this.initialSeekStartTime_ =
        Math.max(streamLimits.end - this.timeShiftBufferDepth_,
                 streamLimits.start);
  } else {
    this.initialSeekStartTime_ = streamLimits.start;
  }
  this.initialSeekEndTime_ = streamLimits.end;

  shaka.log.info(
      'Initial seek range',
      [this.initialSeekStartTime_, this.initialSeekEndTime_]);

  this.seekStartTime_ = this.initialSeekStartTime_;
  this.seekEndTime_ = this.initialSeekEndTime_;

  if (this.manifestInfo.live) {
    // Set a target update time so we update the manifest before any Streams
    // exhaust their SegmentIndexes.
    this.setTargetUpdateTime_();
    this.setSeekRangeUpdateTimer_();
  }
};


/** @override */
shaka.player.DashVideoSource.prototype.onStreamsStarted = function() {
  // Correct the seek range.
  var streamLimits = this.computeStreamLimits();
  if (streamLimits) {
    var seekStartShift = this.seekStartTime_ - this.initialSeekStartTime_;
    var seekEndShift = this.seekEndTime_ - this.initialSeekEndTime_;
    this.seekStartTime_ = streamLimits.start + seekStartShift;
    this.seekEndTime_ = streamLimits.end + seekEndShift;
    shaka.log.info(
        'Corrected seek range',
        [this.seekStartTime_, this.seekEndTime_]);
  }

  var baseClassOnStreamsStarted =
      shaka.player.StreamVideoSource.prototype.onStreamsStarted;
  baseClassOnStreamsStarted.call(this);

  // Fire a 'seekrangechanged' event, note that this is done after adjusting
  // the video's current time, see StreamVideoSource.onStreamsStarted().
  this.streamsStarted_ = true;
  this.fireSeekRangeChangedEvent_();

  // Start listening to 'play' events, as we may need to seek back into the
  // seek window after pausing and playing.
  this.eventManager.listen(
      /** @type {!EventTarget} */ (this.video),
      'play',
      this.onPlay_.bind(this));
};


/** @override */
shaka.player.DashVideoSource.prototype.onSeeking = function() {
  shaka.asserts.assert(this.manifestInfo);

  var currentTime = this.video.currentTime;

  // Rounding tolerance.
  var tolerance = 0.01;

  if ((currentTime >= this.seekStartTime_ - tolerance) &&
      (currentTime <= this.seekEndTime_ + tolerance)) {
    var baseClassOnSeeking = shaka.player.StreamVideoSource.prototype.onSeeking;
    baseClassOnSeeking.call(this);
    return;
  }

  // If we seek outside the seekable range then clamp the video's current time
  // to the seekable range; this will trigger another 'seeking' event, so don't
  // resync the streams right away.
  shaka.log.warning(
      'Cannot seek outside of seekable range:',
      'seekable', [this.seekStartTime_, this.seekEndTime_],
      'attempted', this.video.currentTime);

  var targetTime;
  if (currentTime < this.seekStartTime_) {
    // TODO: If we seek close to |seekStartTime_| then the video's current time
    // may be less than |seekStartTime_| in the future if the Streams had to
    // buffer. Somehow account for this.
    targetTime = this.seekStartTime_;
  } else {
    shaka.asserts.assert(currentTime > this.seekEndTime_);
    targetTime = this.seekEndTime_;
  }
  this.video.currentTime = targetTime;
};


/**
 * Video play callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.DashVideoSource.prototype.onPlay_ = function(event) {
  shaka.log.v1('onPlay_', event);
  this.onSeeking();
};


/**
 * Updates the current manifest with a new MPD.
 * @private
 */
shaka.player.DashVideoSource.prototype.onUpdate_ = function() {
  shaka.asserts.assert(this.manifestInfo && this.manifestInfo.live);

  this.cancelUpdateTimer_();

  var currentTime = Date.now() / 1000.0;

  var secondsSinceLastUpdate = currentTime - this.lastMpdFetchTime_;
  shaka.log.debug(
      'Requesting new MPD... last MPD was retrieved',
      secondsSinceLastUpdate,
      'seconds ago.');

  this.lastMpdFetchTime_ = currentTime;
  var mpdRequest = new shaka.dash.MpdRequest(this.mpdUrl_);

  mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        mpdProcessor.process(mpd);

        this.timeShiftBufferDepth_ = mpd.timeShiftBufferDepth || 0;
        this.updateManifest(mpdProcessor.manifestInfo);
        this.evictSegmentReferences_();
        this.sampleMpdLatency_();

        this.setUpdateTimer_(mpd.minUpdatePeriod || 0);
        this.setTargetUpdateTime_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);

        // In case the application wants to ignore errors, schedule a retry.
        this.setUpdateTimer_(0);
        this.setTargetUpdateTime_();
      })
  );
};


/**
 * Evicts any SegmentReferences that are not seekable.
 * @private
 */
shaka.player.DashVideoSource.prototype.evictSegmentReferences_ = function() {
  for (var i = 0; i < this.manifestInfo.periodInfos.length; ++i) {
    var periodInfo = this.manifestInfo.periodInfos[i];
    for (var j = 0; j < periodInfo.streamSetInfos.length; ++j) {
      var streamSetInfo = periodInfo.streamSetInfos[j];
      for (var k = 0; k < streamSetInfo.streamInfos.length; ++k) {
        var streamInfo = streamSetInfo.streamInfos[k];
        if (!streamInfo.segmentIndex) continue;
        var before = streamInfo.segmentIndex.length();
        streamInfo.segmentIndex.evict(this.seekStartTime_);
        var after = streamInfo.segmentIndex.length();
        shaka.log.info('Evicted', before - after, 'reference(s).');
      }
    }
  }
};


/**
 * Sets the update timer.
 * @param {number} minUpdatePeriod
 * @private
 */
shaka.player.DashVideoSource.prototype.setUpdateTimer_ = function(
    minUpdatePeriod) {
  shaka.asserts.assert(this.manifestInfo && this.manifestInfo.live);
  shaka.asserts.assert(this.updateTimer_ == null);

  var updateInterval =
      Math.max(minUpdatePeriod,
               shaka.player.DashVideoSource.MIN_UPDATE_INTERVAL_);
  shaka.log.debug('updateInterval', updateInterval);

  var ms = 1000 * updateInterval;
  this.updateTimer_ = window.setTimeout(this.onUpdate_.bind(this), ms);
};


/**
 * Computes a target update time, T, from the current manifest based on each
 * StreamInfo's SegmentIndex. The manifest should be updated when the seek end
 * time surpasses T. T is independent of minimumUpdatePeriod.
 * @private
 */
shaka.player.DashVideoSource.prototype.setTargetUpdateTime_ = function() {
  shaka.asserts.assert(this.manifestInfo && this.manifestInfo.live);

  // Keep track of the the largest start time of the second last segment. We
  // want to update the manifest before the video's current time reaches the
  // last segment.
  var max = 0;

  for (var i = 0; i < this.manifestInfo.periodInfos.length; ++i) {
    var periodInfo = this.manifestInfo.periodInfos[i];
    for (var j = 0; j < periodInfo.streamSetInfos.length; ++j) {
      var streamSetInfo = periodInfo.streamSetInfos[j];
      for (var k = 0; k < streamSetInfo.streamInfos.length; ++k) {
        var streamInfo = streamSetInfo.streamInfos[k];

        var segmentIndex = streamInfo.segmentIndex;
        if (!segmentIndex || segmentIndex.length() == 0) continue;

        var index = Math.max(0, segmentIndex.length() - 2);
        var reference = segmentIndex.get(index);
        max = Math.max(max, reference.startTime);
      }  // for k
    }
  }

  this.targetUpdateTime_ = max - this.latencyEstimator_.getEstimate() - 1;
  shaka.log.debug('targetUpdateTime_', this.targetUpdateTime_);
};


/**
 * Updates the seek range, and updates the current manifest if the seek end
 * time surpasses the target update time.
 * @param {number} startWallTime
 * @private
 */
shaka.player.DashVideoSource.prototype.onSeekRangeUpdate_ = function(
    startWallTime) {
  shaka.asserts.assert(this.manifestInfo && this.manifestInfo.live);
  shaka.asserts.assert(this.seekEndTime_);

  this.cancelSeekRangeUpdateTimer_();

  var seekWindow = this.seekEndTime_ - this.seekStartTime_;
  shaka.asserts.assert(seekWindow >= 0);

  var offset = (Date.now() - startWallTime) / 1000;

  if (seekWindow + offset >= this.timeShiftBufferDepth_) {
    // If the streams have just begun broadcasting or the initial MPD did not
    // contain a full segment history then the initial seek window may be
    // smaller than @timeShiftBufferDepth seconds. So only move the seek start
    // time if the seek window is at least @timeShiftBufferDepth seconds long.
    this.seekStartTime_ += offset;
  }

  if (this.streamsStarted_) {
    // If the streams have not started then the video's current time will be
    // behind the seek end time after the streams have started due to
    // buffering. This causes a poor UX since it makes it appear that the video
    // has started behind the live-edge (e.g., the UI might say -00:03). So
    // only move the seek end time after the streams have started, so that the
    // video appears to have started at the live-edge.
    this.seekEndTime_ += offset;
  } else {
    // Although unlikely, the seek start time can overtake the seek end time if
    // the streams are taking a (really) long time to start. If this occurs
    // then just start moving the seek end time.
    if (this.seekEndTime_ - this.seekStartTime_ <= 1) {
      shaka.log.warning('The seek start time has overtaken the seek end time!');
      this.seekEndTime_ = this.seekStartTime_ + 1;
    }
  }

  // Sanity check.
  seekWindow = this.seekEndTime_ - this.seekStartTime_;
  shaka.asserts.assert(seekWindow >= 0);

  // If the seek end time surpasses the target update time then update the
  // current manifest.  This is for robustness.  If the manifest update period
  // is large, we might run out of indexed segments if we don't do this.
  if (this.targetUpdateTime_ != null &&
      (this.seekEndTime_ >= this.targetUpdateTime_)) {
    var secondsSinceLastUpdate = (Date.now() / 1000.0) - this.lastMpdFetchTime_;
    // If we're not waiting for an update but we've hit our target update time,
    // we must be fetching an MPD.  Don't fetch another one.
    var waitingForUpdate = this.updateTimer_ != null;
    var DashVideoSource = shaka.player.DashVideoSource;
    if (waitingForUpdate &&
        (secondsSinceLastUpdate >= DashVideoSource.MIN_UPDATE_INTERVAL_)) {
      this.onUpdate_();
    }
  }

  if (this.streamsStarted_) {
    this.fireSeekRangeChangedEvent_();
  }

  this.setSeekRangeUpdateTimer_();
};


/**
 * Fires a 'seekrangechanged' event.
 * @private
 */
shaka.player.DashVideoSource.prototype.fireSeekRangeChangedEvent_ = function() {
  shaka.asserts.assert(this.seekEndTime_);
  shaka.asserts.assert(this.streamsStarted_);

  var event = shaka.util.FakeEvent.create({
    'type': 'seekrangechanged',
    'bubbles': true,
    'start': this.seekStartTime_,
    'end': this.seekEndTime_
  });

  this.dispatchEvent(event);
};


/**
 * @private
 */
shaka.player.DashVideoSource.prototype.setSeekRangeUpdateTimer_ = function() {
  shaka.asserts.assert(this.manifestInfo && this.manifestInfo.live);
  shaka.asserts.assert(this.seekEndTime_);
  shaka.asserts.assert(this.seekRangeUpdateTimer_ == null);

  var callback = this.onSeekRangeUpdate_.bind(this, Date.now());
  this.seekRangeUpdateTimer_ = window.setTimeout(callback, 1000);
};


/**
 * Cancels the update timer, if any.
 * @private
 */
shaka.player.DashVideoSource.prototype.cancelUpdateTimer_ = function() {
  if (this.updateTimer_) {
    window.clearTimeout(this.updateTimer_);
    this.updateTimer_ = null;
  }
};


/**
 * Cancels the seek range update timer, if any.
 * @private
 */
shaka.player.DashVideoSource.prototype.cancelSeekRangeUpdateTimer_ =
    function() {
  if (this.seekRangeUpdateTimer_) {
    window.clearTimeout(this.seekRangeUpdateTimer_);
    this.seekRangeUpdateTimer_ = null;
  }
};


/**
 * Measure the latency introduced by fetching, processing, and loading an MPD.
 * Should be called after a manifest is loaded or updated.  Assumes that
 * |lastMpdFetchTime_| is always set when an MPD request begins.
 * @private
 */
shaka.player.DashVideoSource.prototype.sampleMpdLatency_ = function() {
  var currentTime = Date.now() / 1000.0;
  var latencySample = currentTime - this.lastMpdFetchTime_;
  this.latencyEstimator_.sample(1 /* weight */, latencySample);
};

