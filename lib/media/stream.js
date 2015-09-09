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

goog.provide('shaka.media.Stream');

goog.require('shaka.asserts');
goog.require('shaka.log');
goog.require('shaka.media.IStream');
goog.require('shaka.media.SourceBufferManager');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.player.Defaults');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.TypedBind');



/**
 * @event shaka.media.Stream.EndedEvent
 * @description Fired when the stream ends.
 * @property {string} type 'ended'
 * @property {boolean} bubbles false
 */



/**
 * Creates a Stream, which presents audio and video streams via an
 * HTMLVideoElement.
 *
 * @param {!shaka.util.FakeEventTarget} parent The parent for event bubbling.
 * @param {!HTMLVideoElement} video
 * @param {!MediaSource} mediaSource The MediaSource, which must be in the
 *     'open' state.
 * @param {string} fullMimeType The SourceBuffer's full MIME type.
 * @param {!shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
 *     attach to all segment requests.
 *
 * @fires shaka.media.IStream.AdaptationEvent
 * @fires shaka.media.Stream.EndedEvent
 * @fires shaka.player.Player.ErrorEvent
 *
 * @throws {QuotaExceededError} if another SourceBuffer is not allowed.
 *
 * @struct
 * @constructor
 * @implements {shaka.media.IStream}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.media.Stream = function(
    parent, video, mediaSource, fullMimeType, estimator) {
  shaka.util.FakeEventTarget.call(this, parent);

  /** @private {!HTMLVideoElement} */
  this.video_ = video;

  /** @private {!shaka.media.SourceBufferManager} */
  this.sbm_ = new shaka.media.SourceBufferManager(
      mediaSource, fullMimeType, estimator);

  /** @private {!shaka.util.IBandwidthEstimator} */
  this.estimator_ = estimator;

  /** @private {shaka.media.StreamInfo} */
  this.streamInfo_ = null;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;

  /** @private {ArrayBuffer} */
  this.initData_ = null;

  /** @private {boolean} */
  this.switched_ = false;

  /** @private {?number} */
  this.updateTimer_ = null;

  /** @private {boolean} */
  this.resyncing_ = false;

  /** @private {?number} */
  this.timestampCorrection_ = null;

  /** @private {boolean} */
  this.started_ = false;

  /** @private {!shaka.util.PublicPromise} */
  this.startedPromise_ = new shaka.util.PublicPromise();

  /** @private {boolean} */
  this.proceeded_ = false;

  /** @private {boolean} */
  this.ended_ = false;

  /** @private {number} */
  this.initialBufferSizeSeconds_ = 0;

  /** @private {number} */
  this.bufferSizeSeconds_ = shaka.player.Defaults.STREAM_BUFFER_SIZE;

  /**
   * Work-around for MSE issues where the stream can get stuck after clearing
   * the buffer or starting mid-stream (as is done for live).  Nudging the
   * playhead seems to get the browser's media pipeline moving again.
   * @private {boolean}
   */
  this.needsNudge_ = false;

  // For debugging purposes:
  if (!COMPILED) {
    /** @private {boolean} */
    this.fetching_ = false;

    /** @private {string} */
    this.mimeType_ = fullMimeType.split(';')[0];
    shaka.asserts.assert(this.mimeType_.length > 0);
  }
};
goog.inherits(shaka.media.Stream, shaka.util.FakeEventTarget);


/**
 * A tiny amount of time, in seconds, used to nudge the video element.  This
 * is used when the buffer has been cleared to get the media pipeline unstuck.
 *
 * @see http://crbug.com/478151
 *
 * @private
 * @const {number}
 */
shaka.media.Stream.NUDGE_ = 0.001;


/**
 * <p>
 * Configures the Stream options.
 * </p>
 *
 * The following configuration options are supported:
 * <ul>
 * <li>
 *   <b>initialStreamBufferSize</b>: number <br>
 *   Sets the amount of content that the Stream must buffer, in seconds, to
 *   complete startup.
 *
 * <li>
 *   <b>streamBufferSize</b>: number <br>
 *   Sets the amount of content that the Stream will buffer ahead of the
 *   playhead, in seconds, after startup. This option overrides
 *   'initialStreamBufferSize' if it is less than 'initialStreamBufferSize'.
 *
 * <li>
 *   <b>segmentRequestTimeout</b>: number <br>
 *   Sets the segment request timeout in seconds.
 * </ul>
 *
 * @example
 *     stream.configure({'streamBufferSize': 20});
 *
 * @param {!Object.<string, *>} config A configuration object, which contains
 *     the configuration options as key-value pairs.  All fields should have
 *     already been validated.
 * @override
 */
shaka.media.Stream.prototype.configure = function(config) {
  if (config['initialStreamBufferSize'] != null) {
    this.initialBufferSizeSeconds_ = Number(config['initialStreamBufferSize']);
  }

  if (config['streamBufferSize'] != null) {
    this.bufferSizeSeconds_ = Number(config['streamBufferSize']);
  }

  if (config['segmentRequestTimeout'] != null) {
    this.sbm_.setSegmentRequestTimeout(Number(config['segmentRequestTimeout']));
  }
};


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.Stream.prototype.destroy = function() {
  this.cancelUpdateTimer_();

  this.startedPromise_.destroy();
  this.startedPromise_ = null;

  this.streamInfo_ = null;
  this.estimator_ = null;

  this.sbm_.destroy();
  this.sbm_ = null;

  this.video_ = null;

  this.parent = null;
};


/** @override */
shaka.media.Stream.prototype.getStreamInfo = function() {
  return this.streamInfo_;
};


/** @override */
shaka.media.Stream.prototype.getSegmentIndex = function() {
  return this.segmentIndex_;
};


/**
 * <p>
 * Returns a promise that the Stream will resolve after it has buffered
 * 'initialStreamBufferSize' seconds of content
 * (see {@link shaka.media.Stream#configure}).
 * </p>
 *
 * <p>
 * The Stream will not modify its underlying SourceBuffer while it's in the
 * 'waiting' state (see {@link shaka.media.IStream}).
 * </p>
 *
 * <p>
 * The caller should apply the timestamp correction to the Stream's current
 * StreamInfo's SegmentIndex and future StreamInfo's passed to switch() before
 * it resolves |proceed|.
 * </p>
 *
 * @override
 */
shaka.media.Stream.prototype.started = function(proceed) {
  if (!this.proceeded_) {
    proceed.then(
        function() {
          shaka.asserts.assert(this.started_);
          shaka.asserts.assert(!this.proceeded_);
          shaka.asserts.assert(!this.ended_);
          shaka.log.debug(this.logPrefix_(), 'proceeding...');
          this.proceeded_ = true;
          if (!this.updateTimer_) {
            this.setUpdateTimer_(0);
          }
        }.bind(this)).catch(
        function(error) {
          // The caller should never reject |proceed| unless it is destroyed.
          shaka.asserts.assert(error.type == 'destroy');
        });
  }
  return this.startedPromise_;
};


/**
 * <p>
 * Returns true if the stream has ended; otherwise, returns false.
 * </p>
 *
 * <p>
 * The Stream will not modify its underlying SourceBuffer while it's in the
 * 'ended' state.
 * </p>
 *
 * @override
 */
shaka.media.Stream.prototype.hasEnded = function() {
  return this.ended_;
};


/**
 * Starts presenting the specified stream asynchronously. The stream's type
 * must be equivalent to the Stream's underlying SourceBuffer's type.
 * Note: |opt_clearBufferOffset| is relative to the video's playhead.
 *
 * @override
 */
shaka.media.Stream.prototype.switch = function(
    streamInfo, clearBuffer, opt_clearBufferOffset) {
  shaka.asserts.assert(
      streamInfo.mimeType == this.mimeType_,
      'The stream\'s type must match the Stream\'s SourceBuffer\'s type.');

  if (streamInfo == this.streamInfo_) {
    shaka.log.debug(this.logPrefix_(), 'already using stream', streamInfo);
    return;
  }

  var async = [
    streamInfo.segmentIndexSource.create(),
    streamInfo.segmentInitSource.create()
  ];

  Promise.all(async).then(shaka.util.TypedBind(this,
      /** @param {!Array} results */
      function(results) {
        if (!this.video_) {
          // We got destroyed.
          return;
        }

        var previousStreamInfo = this.streamInfo_;

        this.streamInfo_ = streamInfo;
        this.segmentIndex_ = results[0];
        this.initData_ = results[1];
        this.switched_ = true;

        if (this.resyncing_) {
          // resync() was called while creating the SegmentIndex and init data.
          // resync() will set the update timer if needed.
          return;
        }

        if (!previousStreamInfo) {
          // Call onUpdate_() asynchronously so it can more easily assert that
          // it was called at an appopriate time.
          this.setUpdateTimer_(0);
        } else if (clearBuffer) {
          this.resync_(true /* forceClear */, opt_clearBufferOffset);
        } else {
          shaka.asserts.assert((this.updateTimer_ != null) || this.fetching_);
        }
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} error */
      function(error) {
        if (error.type == 'aborted') {
          return;
        }

        if (this.proceeded_) {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        } else {
          this.startedPromise_.reject(error);
        }
      })
  );
};


/**
 * Resynchronizes the Stream's current position to the video's playhead.
 * This must be called when the user seeks.
 *
 * @override
 */
shaka.media.Stream.prototype.resync = function() {
  shaka.log.debug(this.logPrefix_(), 'resync');
  return this.resync_(false /* forceClear */);
};


/**
 * @param {boolean} forceClear
 * @param {number=} opt_clearBufferOffset if |forceClear| and
 *     |opt_clearBufferOffset| are truthy, clear the stream buffer from the
 *     given offset (relative to the video's current time) to the end of the
 *     stream.
 * @private
 */
shaka.media.Stream.prototype.resync_ = function(
    forceClear, opt_clearBufferOffset) {
  if (!this.streamInfo_ || this.resyncing_) {
    return;
  }

  // We should either be between updates, fetching a segment, or waiting to
  // proceed after startup.
  shaka.asserts.assert(
      (this.updateTimer_ != null) ||
      this.fetching_ ||
      (this.started_ && !this.proceeded_),
      'Unexpected call to resync_().');

  shaka.asserts.assert(!opt_clearBufferOffset || opt_clearBufferOffset > 0);

  this.resyncing_ = true;
  this.cancelUpdateTimer_();

  this.sbm_.abort().then(shaka.util.TypedBind(this,
      function() {
        shaka.log.v1(this.logPrefix_(), 'abort done.');
        shaka.asserts.assert((this.updateTimer_ == null) && this.resyncing_);
        shaka.asserts.assert(!this.fetching_);

        // Clear the source buffer if we are seeking outside of the currently
        // buffered range.  This seems to make the browser's eviction policy
        // saner and fixes "dead-zone" issues such as #15 and #26.  If seeking
        // within the buffered range, we avoid clearing so that we don't
        // re-download content.
        var currentTime = this.video_.currentTime;
        if (forceClear ||
            !this.sbm_.isBuffered(currentTime) ||
            !this.sbm_.isInserted(currentTime)) {
          shaka.log.debug(this.logPrefix_(), 'clear required.');

          if (opt_clearBufferOffset) {
            return this.sbm_.clearAfter(
                this.video_.currentTime + opt_clearBufferOffset);
          } else {
            shaka.log.debug(this.logPrefix_(), 'nudge needed!');
            this.needsNudge_ = true;
            return this.sbm_.clear();
          }
        } else {
          shaka.log.debug(this.logPrefix_(), 'no clear required.');
          return Promise.resolve();
        }
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        shaka.asserts.assert((this.updateTimer_ == null) && this.resyncing_);
        shaka.asserts.assert(!this.fetching_);
        this.resyncing_ = false;
        this.setUpdateTimer_(0);
      })
  ).catch(shaka.util.TypedBind(this,
      function(error) {
        shaka.asserts.assert(error.type != 'aborted');
        this.resyncing_ = false;

        if (this.proceeded_) {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        } else {
          this.startedPromise_.reject(error);
        }
      })
  );
};


/**
 * Does nothing since audio and video streams are always enabled.
 *
 * @override
 */
shaka.media.Stream.prototype.setEnabled = function(enabled) {};


/**
 * Always returns true since audio and video streams are always enabled.
 *
 * @override
 */
shaka.media.Stream.prototype.getEnabled = function() {
  return true;
};


/** @override */
shaka.media.Stream.prototype.getBufferingGoal = function() {
  // TODO: Consider a different buffering goal when re-buffering.
  return this.started_ ?
         this.bufferSizeSeconds_ :
         Math.min(this.initialBufferSizeSeconds_, this.bufferSizeSeconds_);
};


/**
 * Update callback.
 *
 * @private
 */
shaka.media.Stream.prototype.onUpdate_ = function() {
  shaka.log.v2(this.logPrefix_(), 'onUpdate_');

  shaka.asserts.assert(this.streamInfo_);
  shaka.asserts.assert(this.segmentIndex_);
  shaka.asserts.assert((this.updateTimer_ != null) && !this.resyncing_);
  shaka.asserts.assert(!this.fetching_);

  if (this.started_ && !this.proceeded_) {
    shaka.log.v1(this.logPrefix_(), 'waiting to proceed...');
    this.updateTimer_ = null;
    return;
  }

  // We should only have one buffered range at any given time, so the next
  // segment we need is after the last one we inserted. However, non-ideal
  // content and/or browser eviction policy may induce multiple buffered
  // ranges in some cases.
  if (this.proceeded_ &&
      !this.ended_ &&
      this.sbm_.detectMultipleBufferedRanges()) {
    // Try to recover by clearing the buffer.
    this.resync_(true /* clearBuffer */);
    return;
  }

  this.updateTimer_ = null;

  // Retain local copies since switch() may be called while fetching.
  var streamInfo = /** @type {!shaka.media.StreamInfo} */ (this.streamInfo_);
  var segmentIndex =
      /** @type {!shaka.media.SegmentIndex} */ (this.segmentIndex_);

  var currentTime = this.video_.currentTime;

  // During startup the playhead's position will not align with the initial
  // buffered range's start if there exists a timestamp correction because we
  // do not apply the timestamp correction to the SegmentIndexes until after
  // stream startup. So, we must call bufferedAheadOf() with an offset to
  // ensure we compute the correct size of the initial buffered range.
  var bufferStart = this.started_ ?
                    currentTime :
                    currentTime + (this.timestampCorrection_ || 0);
  if (this.sbm_.bufferedAheadOf(bufferStart) >= this.getBufferingGoal()) {
    shaka.log.v1(this.logPrefix_(), 'buffering goal reached.');
    this.startIfNeeded_();
    // TODO: trigger onUpdate_ when playback rate changes (assuming changed
    // through Player.setPlaybackRate).
    var rate = Math.abs(this.video_.playbackRate) || 1;
    this.setUpdateTimer_(1000 / rate);
    return;
  }

  var reference = this.getNext_(currentTime, segmentIndex);
  if (!reference) {
    shaka.log.v1(
        this.logPrefix_(), 'new segment is not needed or is not available.');

    // We haven't hit our buffering goal yet, but there's nothing left to
    // buffer.
    this.startIfNeeded_();

    if (this.proceeded_ && !this.ended_) {
      shaka.asserts.assert(this.started_);
      shaka.log.debug(this.logPrefix_(), 'stream has ended.');
      this.ended_ = true;
      this.fireEndedEvent_();
    }

    // Check again in a second: the SegmentIndex might be generating
    // SegmentReferences or there might be a manifest update.
    this.setUpdateTimer_(1000);
    return;
  }

  // Fetch and append the next segment. We only fetch a single segment at a
  // time because fetching multiple segments can cause buffering when bandwidth
  // is limited. If we are behind our buffering goal by more than one segment,
  // we should still be able to catch up by requesting single segments.
  if (!COMPILED) {
    this.fetching_ = true;
  }

  if (this.initData_) {
    shaka.log.v1(this.logPrefix_(), 'appending initialization data...');
  }
  shaka.log.v1(this.logPrefix_(), 'fetching segment', reference);
  var fetch = this.sbm_.fetch(
      reference, streamInfo.timestampOffset, this.initData_);

  this.initData_ = null;
  if (this.switched_) {
    this.switched_ = false;
    this.fireAdaptationEvent_(streamInfo);
  }
  this.ended_ = false;

  fetch.then(shaka.util.TypedBind(this,
      /** @param {?number} timestampCorrection */
      function(timestampCorrection) {
        shaka.log.v1(this.logPrefix_(), 'fetch done.');
        shaka.asserts.assert((this.updateTimer_ == null) && !this.resyncing_);
        shaka.asserts.assert(this.fetching_);

        if (!COMPILED) {
          this.fetching_ = false;
        }

        if (this.timestampCorrection_ == null) {
          shaka.asserts.assert(!this.started_);
          shaka.asserts.assert(timestampCorrection != null);
          this.timestampCorrection_ = timestampCorrection;
        }

        if (this.needsNudge_ && this.sbm_.bufferedAheadOf(currentTime) > 0) {
          shaka.log.debug(this.logPrefix_(), 'applying nudge...');
          this.needsNudge_ = false;
          this.video_.currentTime += shaka.media.Stream.NUDGE_;
        }

        this.setUpdateTimer_(0);
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {*} error */
      function(error) {
        if (!COMPILED) {
          this.fetching_ = false;
        }

        if (error.type == 'aborted') {
          // We were aborted from either destroy() or resync().
          shaka.log.v1(this.logPrefix_(), 'fetch aborted.');
          shaka.asserts.assert(!this.sbm_ || this.resyncing_);
          return;
        }

        var recoverableErrors = [0, 404, 410];
        if (error.type == 'net' &&
            recoverableErrors.indexOf(error.xhr.status) != -1 &&
            this.streamInfo_ /* not yet destroyed */) {
          shaka.log.info(
              this.logPrefix_(), 'retrying segment request in 5 seconds...');
          // Depending on application policy, this could be recoverable,
          // so set a timer on the supposition that the app might not end
          // playback.
          this.setUpdateTimer_(5000);
        }

        // We should not reject |startedPromise_| here since we may still be
        // able to complete startup.
        var event = shaka.util.FakeEvent.createErrorEvent(error);
        this.dispatchEvent(event);
      })
  );
};


/**
 * Finds the next segment that starts at or after |currentTime| from
 * |segmentIndex| that has not been inserted.
 *
 * @param {number} currentTime The time in seconds.
 * @param {!shaka.media.SegmentIndex} segmentIndex
 * @return {shaka.media.SegmentReference}
 * @private
 */
shaka.media.Stream.prototype.getNext_ = function(
    currentTime, segmentIndex) {
  var last = this.sbm_.getLastInserted();
  if (last != null) {
    return last.endTime != null ? segmentIndex.find(last.endTime) : null;
  } else {
    // Return the last SegmentReference if no segments have been inserted so
    // that we will always compute a timestamp correction and resolve started().
    return segmentIndex.find(currentTime) ||
           (segmentIndex.length() ? segmentIndex.last() : null);
  }
};


/**
 * Corrects the SBM and resolves |startedPromise_| if needed.
 *
 * @private
 */
shaka.media.Stream.prototype.startIfNeeded_ = function() {
  if (this.started_ || (this.timestampCorrection_ == null)) {
    // We've already started or we haven't started yet.
    return;
  }
  shaka.asserts.assert(!this.proceeded_);
  shaka.asserts.assert(!this.ended_);

  shaka.log.info(this.logPrefix_(), 'stream has started.');
  this.started_ = true;
  this.sbm_.correct(this.timestampCorrection_);
  this.startedPromise_.resolve(this.timestampCorrection_);
};


/**
 * Fires an AdaptationEvent for the given StreamInfo.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @private
 */
shaka.media.Stream.prototype.fireAdaptationEvent_ = function(streamInfo) {
  var event = shaka.media.Stream.createAdaptationEvent_(streamInfo);
  this.dispatchEvent(event);
};


/**
 * Fires an EndedEvent
 *
 * @private
 */
shaka.media.Stream.prototype.fireEndedEvent_ = function() {
  shaka.asserts.assert(this.ended_);
  var event = shaka.util.FakeEvent.create({ type: 'ended' });
  this.dispatchEvent(event);
};


/**
 * Sets the update timer.
 *
 * @param {number} ms The timeout in milliseconds.
 * @private
 */
shaka.media.Stream.prototype.setUpdateTimer_ = function(ms) {
  shaka.asserts.assert(this.updateTimer_ == null);
  this.updateTimer_ = window.setTimeout(this.onUpdate_.bind(this), ms);
};


/**
 * Cancels the update timer if it is running.
 *
 * @private
 */
shaka.media.Stream.prototype.cancelUpdateTimer_ = function() {
  if (this.updateTimer_ != null) {
    window.clearTimeout(this.updateTimer_);
    this.updateTimer_ = null;
  }
};


if (!COMPILED) {
  /**
   * Returns a string with the form 'Stream MIME_TYPE:' for logging purposes.
   *
   * @return {string}
   * @private
   */
  shaka.media.Stream.prototype.logPrefix_ = function() {
    return 'Stream ' + this.mimeType_ + ':';
  };
}


/**
 * Creates an event object for an AdaptationEvent using the given StreamInfo.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {!Event}
 * @private
 */
shaka.media.Stream.createAdaptationEvent_ = function(streamInfo) {
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
  return event;
};

