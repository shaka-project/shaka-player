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
 * @fileoverview Implements a media stream.
 */

goog.provide('shaka.media.Stream');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.IStream');
goog.require('shaka.media.SourceBufferManager');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.timer');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.TypedBind');


/**
 * @event shaka.media.Stream.AdaptationEvent
 * @description Fired when video or audio tracks change.
 *     Bubbles up through the Player.
 * @property {string} type 'adaptation'
 * @property {boolean} bubbles true
 * @property {string} contentType 'video' or 'audio'
 * @property {?{width: number, height: number}} size The resolution chosen, if
 *     the stream is a video stream.
 * @property {number} bandwidth The stream's bandwidth requirement in bits per
 *     second.
 * @export
 */

/**
 * @event shaka.media.Stream.EndedEvent
 * @description Fired when the stream ends.
 * @property {string} type 'ended'
 * @property {boolean} bubbles false
 */

/**
 * @event shaka.media.Stream.StartedEvent
 * @description Fired when the stream starts.
 * @property {string} type 'started'
 * @property {boolean} bubbles false
 * @property {number} timestampCorrection The number of seconds to apply to the
 *     SegmentIndex (approximation of the media timeline) to align it to the
 *     media timeline. For example, if this value is 5 then a SegmentReference
 *     that has a start time of 10 would correspond to a segment that actually
 *     starts at 15. In practice the absolute value of this value should be
 *     small, specifically, less than the duration of any one segment in the
 *     stream.
 */



/**
 * Creates a Stream.
 * @param {!shaka.util.FakeEventTarget} parent The parent for event bubbling.
 * @param {!HTMLVideoElement} video The video element.
 * @param {!MediaSource} mediaSource The SourceBuffer's MediaSource parent.
 * @param {!SourceBuffer} sourceBuffer The SourceBuffer. It's assumed that
 *     |sourceBuffer| has the same mime type as |streamInfo_|.
 * @param {!shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
 *     attach to all data requests.
 *
 * @fires shaka.media.Stream.AdaptationEvent
 * @fires shaka.media.Stream.EndedEvent
 * @fires shaka.media.Stream.PleaseBufferEvent
 * @fires shaka.media.Stream.StartedEvent
 * @fires shaka.player.Player.ErrorEvent
 *
 * @struct
 * @constructor
 * @implements {shaka.media.IStream}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.media.Stream =
    function(parent, video, mediaSource, sourceBuffer, estimator) {
  shaka.util.FakeEventTarget.call(this, parent);

  /** @private {!HTMLVideoElement} */
  this.video_ = video;

  /** @private {!SourceBuffer} */
  this.sourceBuffer_ = sourceBuffer;

  /** @private {!shaka.media.SourceBufferManager} */
  this.sbm_ =
      new shaka.media.SourceBufferManager(mediaSource, sourceBuffer, estimator);

  /** @private {!shaka.util.IBandwidthEstimator} */
  this.estimator_ = estimator;

  /** @private {shaka.media.StreamInfo} */
  this.streamInfo_ = null;

  /** @private {number} */
  this.bufferingGoal_ = shaka.media.Stream.BUFFER_SIZE_SECONDS_;

  /** @private {?function()} */
  this.nextSwitch_ = null;

  /** @private {?number} */
  this.updateTimerId_ = null;

  /** @private {shaka.media.Stream.State_} */
  this.state_ = shaka.media.Stream.State_.IDLE;

  /** @private {string} */
  this.type_ = '';

  /**
   * Work-around for MSE issues where the stream can get stuck after clearing
   * the buffer or starting mid-stream (as is done for live).  Nudging the
   * playhead seems to get the browser's media pipeline moving again.
   * @private {boolean}
   */
  this.needsNudge_ = false;
};
goog.inherits(shaka.media.Stream, shaka.util.FakeEventTarget);


/**
 * @enum
 * @private
 */
shaka.media.Stream.State_ = {
  // The stream has not started yet.
  IDLE: 0,

  // The stream is starting.
  INITIALIZING: 1,

  // The stream is fetching metadata for the new StreamInfo and has stopped
  // updating using the old StreamInfo.
  SWITCHING: 2,

  // The stream is updating by periodically appending segments into the
  // source buffer.
  UPDATING: 3,

  // The stream has ended.
  ENDED: 4
};


/**
 * The amount of content we will try to buffer by default, after startup.
 *
 * @private {number}
 * @const
 */
shaka.media.Stream.BUFFER_SIZE_SECONDS_ = 15.0;


/**
 * A tiny amount of time, in seconds, used to nudge the video element.  This
 * is used when the buffer has been cleared to get the media pipeline unstuck.
 * It is also used during an immediate stream switch to force the media
 * pipeline to start showing content from the new stream.  These two uses are
 * similar in that they both force the video element to show new content, but
 * for different reasons.
 *
 * @private
 * @const {number}
 */
shaka.media.Stream.NUDGE_ = 0.001;


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.Stream.prototype.destroy = function() {
  this.state_ = null;

  this.cancelUpdateTimer_();

  this.nextSwitch_ = null;
  this.streamInfo_ = null;
  this.estimator_ = null;

  this.sbm_.destroy();
  this.sbm_ = null;

  this.sourceBuffer_ = null;
  this.video_ = null;

  this.parent = null;
};


/** @override */
shaka.media.Stream.prototype.getStreamInfo = function() {
  return this.streamInfo_;
};


/** @override */
shaka.media.Stream.prototype.hasStarted = function() {
  return this.state_ != shaka.media.Stream.State_.IDLE &&
         this.state_ != shaka.media.Stream.State_.INITIALIZING;
};


/** @override */
shaka.media.Stream.prototype.hasEnded = function() {
  return this.state_ == shaka.media.Stream.State_.ENDED;
};


/** @override */
shaka.media.Stream.prototype.start = function(streamInfo, initialBufferSize) {
  // Alias.
  var Stream = shaka.media.Stream;

  shaka.asserts.assert(this.state_ == Stream.State_.IDLE);
  if (this.state_ != Stream.State_.IDLE) {
    shaka.log.error('Cannot start stream: stream has already been started.');
    return;
  }

  shaka.log.info('Starting stream for', streamInfo);

  this.streamInfo_ = streamInfo;
  this.type_ = streamInfo.mimeType.split('/')[0];
  this.state_ = Stream.State_.INITIALIZING;
  this.bufferingGoal_ = Math.max(this.bufferingGoal_, initialBufferSize);

  var expectedFirstTimestamp;

  var async = [
    streamInfo.getSegmentIndex(),
    streamInfo.getSegmentInitializationData()
  ];

  Promise.all(async).then(shaka.util.TypedBind(this,
      function() {
        shaka.asserts.assert(streamInfo.segmentIndex);

        var segmentRange = streamInfo.segmentIndex.getRangeForInterval(
            this.video_.currentTime, initialBufferSize);
        if (!segmentRange) {
          return Promise.reject(new Error('No segments available.'));
        }
        expectedFirstTimestamp = segmentRange.references[0].startTime;
        shaka.log.v1('Fetching segment range', this.type_, segmentRange);
        return this.sbm_.fetch(segmentRange,
                               streamInfo.segmentInitializationData,
                               [404, 410] /* endEarlyOn */);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        shaka.asserts.assert(expectedFirstTimestamp != null);

        shaka.asserts.assert(this.sourceBuffer_.buffered.length > 0);
        var actualFirstTimestamp = this.sourceBuffer_.buffered.start(0);
        shaka.asserts.assert(actualFirstTimestamp != null);
        var timestampCorrection = actualFirstTimestamp - expectedFirstTimestamp;

        this.state_ = Stream.State_.UPDATING;

        // Dispatch StartedEvent.
        var event = shaka.util.FakeEvent.create({
          type: 'started',
          bubbles: false,
          timestampCorrection: timestampCorrection});
        this.dispatchEvent(event);
        this.fireAdaptationEvent_(streamInfo);

        this.switchStreamOrUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type != 'aborted') {
          this.state_ = Stream.State_.IDLE;
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        }
      })
  );
};


/** @override */
shaka.media.Stream.prototype.switch = function(streamInfo, immediate) {
  shaka.timer.begin('switch');
  shaka.timer.begin('switch logic');

  // Alias.
  var Stream = shaka.media.Stream;

  // We cannot switch streams if the stream has not been started.
  shaka.asserts.assert(this.state_ != Stream.State_.IDLE);
  if (this.state_ == Stream.State_.IDLE) {
    shaka.log.error('Cannot switch stream: stream has not been started.');
    return;
  }

  // We cannot switch streams if we are initializing or already switching
  // streams.
  if (this.state_ == Stream.State_.INITIALIZING ||
      this.state_ == Stream.State_.SWITCHING) {
    shaka.log.info('Waiting to switch streams...');
    this.nextSwitch_ = this.switch.bind(this, streamInfo, immediate);
    return;
  }

  if (streamInfo == this.streamInfo_) {
    shaka.log.info('Ignoring switch.');
    // Nothing to do.  If this was a deferred switch, the update loop is not
    // running.  So kick off an update to be safe.
    this.onUpdate_();
    return;
  }

  shaka.log.info('Switching streams to', streamInfo);

  if (!COMPILED) {
    if (streamInfo.height && streamInfo.height != this.streamInfo_.height) {
      var check = (function(video) {
        if (video.videoHeight == streamInfo.height) {
          shaka.timer.end('switch');
          shaka.timer.diff('switch', 'switch logic', 'switch fetch');
        } else {
          window.setTimeout(check, 50);
        }
      }).bind(null, this.video_);
      check();
    }
  }

  this.state_ = Stream.State_.SWITCHING;

  this.cancelUpdateTimer_();
  var async = [
    streamInfo.getSegmentIndex(),
    streamInfo.getSegmentInitializationData(),
    this.sbm_.abort()
  ];

  // If it's an immediate switch, pause the video until the switch is complete.
  var previouslyPaused = this.video_.paused;
  if (immediate) {
    this.video_.pause();
  }

  Promise.all(async).then(shaka.util.TypedBind(this,
      function() {
        shaka.asserts.assert(streamInfo.segmentIndex);

        // Decide when the switch should take place in the video timeline.
        var switchTime;
        if (immediate) {
          switchTime = this.video_.currentTime;
        } else {
          var availableBitsPerSecond = this.estimator_.getBandwidth();
          var requiredBitsPerSecond = streamInfo.bandwidth;
          var estimatedFetchBits = this.bufferingGoal_ * requiredBitsPerSecond;
          var estimatedFetchLatency =
              estimatedFetchBits / availableBitsPerSecond;
          var bufferedAhead =
              this.sbm_.bufferedAheadOf(this.video_.currentTime);
          shaka.asserts.assert(estimatedFetchLatency < bufferedAhead,
              'Not enough data buffered to switch smoothly!');
          switchTime = this.video_.currentTime +
              Math.min(estimatedFetchLatency, bufferedAhead - 1);
        }

        // Update members.
        this.streamInfo_ = streamInfo;
        this.type_ = streamInfo.mimeType.split('/')[0];
        this.sbm_.reset();

        // Fetch new segments to meet the buffering requirement.
        var segmentRange = streamInfo.segmentIndex.getRangeForInterval(
            switchTime, this.bufferingGoal_);
        if (!segmentRange) {
          return Promise.reject(new Error('No segments available.'));
        }
        shaka.log.v1('Fetching segment range', this.type_,
                     segmentRange.references);
        shaka.timer.end('switch logic');
        shaka.timer.begin('switch fetch');
        return this.sbm_.fetch(segmentRange,
                               streamInfo.segmentInitializationData,
                               [404, 410] /* endEarlyOn */);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        shaka.timer.end('switch fetch');
        if (immediate) {
          // Force the video to start presenting the new segment(s).
          this.video_.currentTime -= Stream.NUDGE_;
          if (!previouslyPaused) {
            this.video_.play();
          }
        }

        this.fireAdaptationEvent_(streamInfo);

        this.state_ = Stream.State_.UPDATING;
        this.switchStreamOrUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type != 'aborted') {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);

          // Try to recover.
          this.state_ = Stream.State_.UPDATING;
          this.onUpdate_();
        }
      })
  );
};


/**
 * Fires a shaka.media.Stream.AdaptationEvent for the given StreamInfo.
 *
 * @param {shaka.media.StreamInfo} streamInfo
 * @private
 */
shaka.media.Stream.prototype.fireAdaptationEvent_ = function(streamInfo) {
  var contentType = streamInfo.mimeType.split('/')[0];
  var size = (contentType != 'video') ? null : {
    'width': streamInfo.width,
    'height': streamInfo.height
  };
  var event = shaka.util.FakeEvent.create({
    'type': 'adaptation',
    'bubbles': true,
    'contentType': contentType,
    'size': size,
    'bandwidth': streamInfo.bandwidth
  });
  this.dispatchEvent(event);
};


/**
 * Calls |nextSwitch_| if it's non-null; otherwise, calls onUpdate_().
 * @private
 */
shaka.media.Stream.prototype.switchStreamOrUpdate_ = function() {
  if (this.nextSwitch_) {
    shaka.log.info('Processing deferred switch...');
    var f = this.nextSwitch_;
    this.nextSwitch_ = null;
    f();
  } else {
    this.onUpdate_();
  }
};


/** @override */
shaka.media.Stream.prototype.resync = function() {
  // Alias.
  var Stream = shaka.media.Stream;

  shaka.asserts.assert(this.state_ != Stream.State_.IDLE);
  if (this.state_ == Stream.State_.IDLE) {
    shaka.log.error('Cannot resync stream: stream has not been initialized.');
    return;
  }

  if (this.state_ == Stream.State_.INITIALIZING ||
      this.state_ == Stream.State_.SWITCHING) {
    // Since the stream is initializing or switching it will be resynchronized
    // after the first call to onUpdate_().
    return;
  }

  // Stop updating and abort |sbm_|'s current operation. This will reject
  // |sbm_|'s current promise.
  this.cancelUpdateTimer_();
  this.sbm_.abort().then(shaka.util.TypedBind(this,
      function() {
        // Clear the source buffer if we are seeking outside of the currently
        // buffered range.  This seems to make the browser's eviction policy
        // saner and fixes "dead-zone" issues such as #15 and #26.  If seeking
        // within the buffered range, we avoid clearing so that we don't
        // re-download content.
        var time = this.video_.currentTime;
        shaka.asserts.assert(this.streamInfo_.segmentIndex);

        var index = this.streamInfo_.segmentIndex.find(time);
        if (index < 0) {
          // There are no segments. This can occur if every SegmentReference in
          // the SegmentIndex got evicted.
          this.handleEof_();
          return Promise.resolve();
        }

        var reference = this.streamInfo_.segmentIndex.get(index);
        if (!this.sbm_.isBuffered(time) || !this.sbm_.isInserted(reference)) {
          this.needsNudge_ = true;
          return this.sbm_.clear();
        }

        return Promise.resolve();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        // If we were in the ENDED state before resynchronizing then we must
        // call onUpdate_(). If we transitioned into the ENDED state while
        // resynchronizing then onUpdate_() will just call handleEof_() again.
        this.state_ = Stream.State_.UPDATING;
        this.onUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      function(error) {
        // clear() may have been aborted by another call to resync().
        if (error.type != 'aborted') {
          // Dispatch the event to the application.
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        }
      })
  );
};


/** @override */
shaka.media.Stream.prototype.setEnabled = function(enabled) {
  // NOP, not supported for audio and video streams.
};


/** @override */
shaka.media.Stream.prototype.getEnabled = function() {
  return true;
};


/**
 * Update callback.
 * @private
 */
shaka.media.Stream.prototype.onUpdate_ = function() {
  // Alias.
  var Stream = shaka.media.Stream;

  shaka.asserts.assert(this.streamInfo_);
  shaka.asserts.assert(this.streamInfo_.segmentIndex);
  shaka.asserts.assert(this.state_ == Stream.State_.UPDATING);

  // Avoid stacking timeouts.
  this.cancelUpdateTimer_();

  var currentTime = this.video_.currentTime;
  var bufferedAhead = this.sbm_.bufferedAheadOf(currentTime);
  if (bufferedAhead >= this.bufferingGoal_) {
    // We don't need to make a request right now, so check again in a second.
    this.updateTimerId_ = window.setTimeout(this.onUpdate_.bind(this), 1000);
    return;
  }

  // Get the SegmentReference for the next unbuffered time range.
  var index = this.findNextNeededIndex_(currentTime);
  if (index < 0 || index >= this.streamInfo_.segmentIndex.length()) {
    this.handleEof_();
    return;
  }
  var reference = this.streamInfo_.segmentIndex.get(index);

  // Fetch and append the next segment.  Only fetch a single segment, because
  // fetching multiple segments could cause a buffering event when utilization
  // of available bandwidth is high.  If we are behind our buffering goal by
  // more than one segment, we should still be able to catch up by requesting
  // single segments.

  // This operation may be interrupted by switch().
  shaka.log.v1('Fetching segment', this.type_, reference);

  var fetch = this.sbm_.fetch(new shaka.media.SegmentRange([reference]),
                              null /* initSegment */, [] /* endEarlyOn */);
  fetch.then(shaka.util.TypedBind(this,
      function() {
        shaka.log.v1('Added segment', reference.id);
        if (this.needsNudge_ && this.sbm_.isBuffered(this.video_.currentTime)) {
          this.needsNudge_ = false;
          this.video_.currentTime += Stream.NUDGE_;
        }
        this.onUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type == 'aborted') {
          // fetch() may have been be aborted by switch() or resync().
        } else {
          // Dispatch the event to the application.
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);

          var recoverableErrors = [0, 404, 410];
          if (error.type == 'net' &&
              recoverableErrors.indexOf(error.xhr.status) != -1) {
            // Depending on application policy, this could be recoverable,
            // so set a timer on the supposition that the app might not end
            // playback.
            this.updateTimerId_ =
                window.setTimeout(this.onUpdate_.bind(this), 5000);
          }
        }
      })
  );
};


/**
 * Returns the index of the SegmentReference corresponding to the first
 * unbuffered segment starting at |time|. -1 is returned if there are no
 * segments.
 *
 * @param {number} time
 * @return {number}
 *
 * @private
 */
shaka.media.Stream.prototype.findNextNeededIndex_ = function(time) {
  shaka.asserts.assert(this.streamInfo_);
  shaka.asserts.assert(this.streamInfo_.segmentIndex);

  var index = this.streamInfo_.segmentIndex.find(time);
  while ((index >= 0) && (index < this.streamInfo_.segmentIndex.length())) {
    var reference = this.streamInfo_.segmentIndex.get(index);
    if (!this.sbm_.isInserted(reference)) {
      break;
    }
    index++;
  }

  return index;
};


/**
 * Sets |state_| to ENDED and dispatches an 'ended' event if |state_| is not
 * already ENDED.
 *
 * @private
 */
shaka.media.Stream.prototype.handleEof_ = function() {
  // Alias
  var Stream = shaka.media.Stream;

  if (this.state_ == Stream.State_.ENDED) {
    return;
  }

  shaka.log.debug('Stream', this.streamInfo_.mimeType, 'reached EOF.');
  this.state_ = Stream.State_.ENDED;

  // Dispatch a non-bubbling event.  Let the VideoSource handle it.
  var event = shaka.util.FakeEvent.create({ type: 'ended' });
  this.dispatchEvent(event);
};


/**
 * Cancels the update timer if it is running.
 * @private
 */
shaka.media.Stream.prototype.cancelUpdateTimer_ = function() {
  if (this.updateTimerId_) {
    window.clearTimeout(this.updateTimerId_);
    this.updateTimerId_ = null;
  }
};

