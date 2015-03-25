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
goog.require('shaka.util.TypedBind');



/**
 * Creates a DashVideoSource.
 * @param {string} mpdUrl The MPD URL.
 * @param {?shaka.player.DashVideoSource.ContentProtectionCallback}
 *     interpretContentProtection A callback to interpret the ContentProtection
 *     elements in the MPD.
 *
 * @struct
 * @constructor
 * @extends {shaka.player.StreamVideoSource}
 * @export
 */
shaka.player.DashVideoSource = function(mpdUrl, interpretContentProtection) {
  shaka.player.StreamVideoSource.call(this, null);

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

  /** @private {?number} */
  this.updateTimer_ = null;
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
  this.interpretContentProtection_ = null;
  shaka.player.StreamVideoSource.prototype.destroy.call(this);
};


/** @override */
shaka.player.DashVideoSource.prototype.attach = function(player, video) {
  var baseClassAttach = shaka.player.StreamVideoSource.prototype.attach;
  var p = baseClassAttach.call(this, player, video);

  if (this.manifestInfo.live) {
    p.then(shaka.util.TypedBind(this,
        function() {
          // Set an event handler that will check if we need to update the
          // manifest based on the video's current time.
          this.eventManager.listen(
              video, 'timeupdate', this.onTimeUpdate_.bind(this));
        }));
  }

  return p;
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

        this.manifestInfo = mpdProcessor.manifestInfo;

        var baseClassLoad = shaka.player.StreamVideoSource.prototype.load;
        var p = baseClassLoad.call(this, preferredLanguage);

        if (this.manifestInfo.live) {
          p.then(shaka.util.TypedBind(this,
              function() {
                // Set a timer to call update(), so we update the manifest at
                // least every @minimumUpdatePeriod seconds, but also set a
                // target update time, so we update the manifest before any
                // Streams exhaust their SegmentIndexes.
                this.setUpdateTimer_(mpd.minUpdatePeriod || 0);
                this.setTargetUpdateTime_();
              }));
        }

        return p;
      })
  );
};


/**
 * Updates the manifest by fetching a new MPD.
 * @private
 */
shaka.player.DashVideoSource.prototype.update_ = function() {
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

        this.updateManifest(mpdProcessor.manifestInfo);

        this.setUpdateTimer_(mpd.minUpdatePeriod || 0);
        this.setTargetUpdateTime_();
      })
  );
};


/**
 * Handles a 'timeupdate' event. Updates the manifest if the video's current
 * time surpasses the target update time.
 * @private
 */
shaka.player.DashVideoSource.prototype.onTimeUpdate_ = function() {
  shaka.asserts.assert(this.manifestInfo && this.manifestInfo.live);
  shaka.asserts.assert(this.video);

  if (!this.targetUpdateTime_) {
    return;
  }

  if (this.video.currentTime < this.targetUpdateTime_) {
    return;
  }

  var secondsSinceLastUpdate = (Date.now() / 1000.0) - this.lastMpdFetchTime_;
  if (secondsSinceLastUpdate <
      shaka.player.DashVideoSource.MIN_UPDATE_INTERVAL_) {
    return;
  }

  this.update_();
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
  this.updateTimer_ = window.setTimeout(this.update_.bind(this), ms);
};


/**
 * Computes a target update time, T, from the current manifest based on each
 * StreamInfo's SegmentIndex. The manifest should be updated when the video's
 * current time surpasses T. T is independent of minimumUpdatePeriod.
 *
 * @private
 */
shaka.player.DashVideoSource.prototype.setTargetUpdateTime_ = function() {
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
        if (!streamInfo.segmentIndex) continue;

        var segmentIndex = streamInfo.segmentIndex;
        var index = Math.max(0, segmentIndex.getNumReferences() - 2);
        var reference = segmentIndex.getReference(index);
        if (reference) {
          max = Math.max(max, reference.startTime);
        }
      }  // for k
    }
  }

  // TODO: Measure latency during MPD fetch.  See also: lib/util/ewma.js
  var networkLatency = 2;

  var t = max - networkLatency;
  this.targetUpdateTime_ = t >= 0 ? t : null;
  shaka.log.debug('targetUpdateTime_', this.targetUpdateTime_);
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

