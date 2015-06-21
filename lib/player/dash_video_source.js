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
goog.require('shaka.media.IAbrManager');
goog.require('shaka.media.SimpleAbrManager');
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
 * @param {shaka.media.IAbrManager} abrManager
 *
 * @fires shaka.player.DashVideoSource.SeekRangeChanged
 *
 * @struct
 * @constructor
 * @extends {shaka.player.StreamVideoSource}
 * @export
 */
shaka.player.DashVideoSource =
    function(mpdUrl, interpretContentProtection, estimator, abrManager) {
  if (!estimator) {
    // For backward compatibility, provide an instance of the default
    // implementation if none is provided.
    estimator = new shaka.util.EWMABandwidthEstimator();
  }
  if (!abrManager) {
    abrManager = new shaka.media.SimpleAbrManager();
  }

  shaka.player.StreamVideoSource.call(this, null, estimator, abrManager);

  /** @private {string} */
  this.mpdUrl_ = mpdUrl;

  /** @private {?shaka.player.DashVideoSource.ContentProtectionCallback} */
  this.interpretContentProtection_ = interpretContentProtection;

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


/** @override */
shaka.player.DashVideoSource.prototype.destroy = function() {
  this.cancelSeekRangeUpdateTimer_();
  this.interpretContentProtection_ = null;
  shaka.player.StreamVideoSource.prototype.destroy.call(this);
};


/** @override */
shaka.player.DashVideoSource.prototype.load = function(preferredLanguage) {
  var mpdRequest = new shaka.dash.MpdRequest(this.mpdUrl_);
  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        this.manifestInfo = mpdProcessor.process(mpd);

        this.timeShiftBufferDepth_ = mpd.timeShiftBufferDepth || 0;

        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        var p = baseClassLoad.call(this, preferredLanguage);

        return p;
      })
  );
};


/** @override */
shaka.player.DashVideoSource.prototype.onStartStreams = function(
    segmentIndexes) {
  var streamLimits = this.computeStreamLimits(segmentIndexes);
  shaka.asserts.assert(streamLimits);

  this.initialSeekStartTime_ = streamLimits.start;
  this.initialSeekEndTime_ = streamLimits.end;

  shaka.log.info(
      'Initial seek range',
      [this.initialSeekStartTime_, this.initialSeekEndTime_]);

  this.seekStartTime_ = this.initialSeekStartTime_;
  this.seekEndTime_ = this.initialSeekEndTime_;

  if (this.manifestInfo.live) {
    this.setSeekRangeUpdateTimer_();
  }
};


/** @override */
shaka.player.DashVideoSource.prototype.onAllStreamsStarted = function(
    segmentIndexes) {
  // Correct the seek range.
  var streamLimits = this.computeStreamLimits(segmentIndexes);
  if (streamLimits) {
    var seekStartShift = this.seekStartTime_ - this.initialSeekStartTime_;
    var seekEndShift = this.seekEndTime_ - this.initialSeekEndTime_;
    this.seekStartTime_ = streamLimits.start + seekStartShift;
    this.seekEndTime_ = streamLimits.end + seekEndShift;
    shaka.log.info(
        'Corrected seek range',
        [this.seekStartTime_, this.seekEndTime_]);
  }

  var baseClassOnAllStreamsStarted =
      shaka.player.StreamVideoSource.prototype.onAllStreamsStarted;
  baseClassOnAllStreamsStarted.call(this, segmentIndexes);

  // Fire a 'seekrangechanged' event, note that this is done after adjusting
  // the video's current time, see StreamVideoSource.onAllStreamsStarted().
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
  if (!this.clampCurrentTime_()) {
    var baseClassOnSeeking = shaka.player.StreamVideoSource.prototype.onSeeking;
    baseClassOnSeeking.call(this);
    return;
  }
};


/** @override */
shaka.player.DashVideoSource.prototype.onUpdateManifest = function(url) {
  var mpdRequest = new shaka.dash.MpdRequest(url.toString());
  return mpdRequest.send().then(shaka.util.TypedBind(this,
      /** @param {!shaka.dash.mpd.Mpd} mpd */
      function(mpd) {
        var mpdProcessor =
            new shaka.dash.MpdProcessor(this.interpretContentProtection_);
        var newManifestInfo = mpdProcessor.process(mpd);
        this.timeShiftBufferDepth_ = mpd.timeShiftBufferDepth || 0;
        return Promise.resolve(newManifestInfo);
      })
  );
};


/**
 * Video play callback.
 *
 * @param {!Event} event
 * @private
 */
shaka.player.DashVideoSource.prototype.onPlay_ = function(event) {
  shaka.log.v1('onPlay_', event);
  this.clampCurrentTime_();
};


/**
 * @return {boolean}
 * @private
 */
shaka.player.DashVideoSource.prototype.clampCurrentTime_ = function() {
  var currentTime = this.video.currentTime;

  // Rounding tolerance.
  var tolerance = 0.01;

  if ((currentTime >= this.seekStartTime_ - tolerance) &&
      (currentTime <= this.seekEndTime_ + tolerance)) {
    return false;
  }

  // If we seek outside the seekable range then clamp the video's current time
  // to the seekable range; this will trigger another 'seeking' event, so don't
  // call StreamVideoSource.onSeeking().
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

  return true;
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
 * Sets the seek range update timer.
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

