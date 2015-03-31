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
goog.require('shaka.media.ISegmentIndexParser');
goog.require('shaka.media.IStream');
goog.require('shaka.media.IsobmffSegmentIndexParser');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SourceBufferManager');
goog.require('shaka.media.StreamInfo');
goog.require('shaka.media.WebmSegmentIndexParser');
goog.require('shaka.timer');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.RangeRequest');
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
 * Creates a Stream.
 * @param {!shaka.util.FakeEventTarget} parent The parent for event bubbling.
 * @param {!HTMLVideoElement} video The video element.
 * @param {!MediaSource} mediaSource The SourceBuffer's MediaSource parent.
 * @param {!SourceBuffer} sourceBuffer The SourceBuffer. It's assumed that
 *     |sourceBuffer| has the same mime type as |streamInfo_|.
 * @param {shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
 *     attach to all data requests.
 *
 * @fires shaka.media.Stream.AdaptationEvent
 * @fires shaka.media.Stream.EndedEvent
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

  /** @private {shaka.util.IBandwidthEstimator} */
  this.estimator_ = estimator;

  /** @private {shaka.media.StreamInfo} */
  this.streamInfo_ = null;

  /** @private {shaka.media.SegmentIndex} */
  this.segmentIndex_ = null;

  /** @private {?function()} */
  this.nextSwitch_ = null;

  /** @private {?number} */
  this.updateTimerId_ = null;

  /** @private {shaka.media.Stream.State_} */
  this.state_ = shaka.media.Stream.State_.IDLE;

  /** @private {string} */
  this.type_ = '';
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

  // The stream is fetching metadata for the new StreamInfo and is still
  // updating using the old StreamInfo.
  SWITCHING: 2,

  // The stream has stopped updating using the old StreamInfo and is
  // splicing in segments into the source buffer from the new StreamInfo.
  SPLICING: 3,

  // The stream is updating by periodically appending segments into the
  // source buffer.
  UPDATING: 4,

  // The stream has ended.
  ENDED: 5
};


/**
 * The number of seconds of data we try to keep in buffer after initiating
 * playback.  Mpd.minBufferTime, if greater, will override this.
 *
 * @private {number}
 * @const
 */
shaka.media.Stream.BUFFER_SIZE_SECONDS_ = 15.0;


/**
 * The number of seconds of old data we keep in buffer when switching streams
 * to avoid buffering during the switch operation.
 *
 * @private {number}
 * @const
 */
shaka.media.Stream.SWITCH_BUFFER_SIZE_SECONDS_ = 5.0;


/**
 * The duration of a single frame at 20 FPS. We use this value to force the
 * video element to start showing new content after an immediate switch.
 *
 * @private
 * @const {number}
 */
shaka.media.Stream.SINGLE_FRAME_SECONDS_ = 0.05;


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.media.Stream.prototype.destroy = function() {
  this.state_ = null;

  this.cancelUpdateTimer_();

  this.nextSwitch_ = null;
  this.segmentIndex_ = null;
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
shaka.media.Stream.prototype.hasEnded = function() {
  return this.state_ == shaka.media.Stream.State_.ENDED;
};


/** @override */
shaka.media.Stream.prototype.start = function(streamInfo) {
  shaka.asserts.assert((streamInfo.segmentIndex) ||
                       (streamInfo.segmentIndexInfo && streamInfo.mediaUrl));

  shaka.asserts.assert(this.state_ == shaka.media.Stream.State_.IDLE);
  if (this.state_ != shaka.media.Stream.State_.IDLE) {
    shaka.log.error('Cannot start stream: stream has already been started.');
    return;
  }

  shaka.log.info('Starting stream for', streamInfo);

  this.streamInfo_ = streamInfo;
  this.type_ = streamInfo.mimeType.split('/')[0];
  this.segmentIndex_ = null;
  this.state_ = shaka.media.Stream.State_.INITIALIZING;

  // Request all segment metadata in parallel.
  var async = this.requestAllSegmentMetadata_(streamInfo);

  Promise.all(async).then(shaka.util.TypedBind(this,
      /** @param {!Array} results */
      function(results) {
        var segmentIndexData = results[0];
        var initSegmentData = results[1];

        // Create/get SegmentIndex.
        if (streamInfo.segmentIndexInfo) {
          shaka.asserts.assert(segmentIndexData);
          this.segmentIndex_ = this.createSegmentIndex_(
              streamInfo, segmentIndexData, initSegmentData);
          if (!this.segmentIndex_) {
            var error = new Error('Failed to create SegmentIndex.');
            error.type = 'stream';
            return Promise.reject(error);
          }
        } else {
          this.segmentIndex_ = streamInfo.segmentIndex;
        }

        var initialBufferTime = streamInfo.minBufferTime;
        var segmentRange = this.segmentIndex_.getRangeForInterval(
            this.getCurrentTime_(), initialBufferTime);
        if (!segmentRange) {
          return Promise.reject(new Error('No segments available.'));
        }
        shaka.log.v1('Fetching segment range', this.type_,
                     segmentRange.references);
        return this.sbm_.fetch(segmentRange, initSegmentData);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        this.fireAdaptationEvent_(streamInfo);
        this.switchStreamOrUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type != 'aborted') {
          this.state_ = shaka.media.Stream.State_.IDLE;
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        }
      })
  );
};


/** @override */
shaka.media.Stream.prototype.switch = function(streamInfo, immediate) {
  shaka.asserts.assert((streamInfo.segmentIndex) ||
                       (streamInfo.segmentIndexInfo && streamInfo.mediaUrl));

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
      this.state_ == Stream.State_.SWITCHING ||
      this.state_ == Stream.State_.SPLICING) {
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

  if (immediate && streamInfo.height &&
      streamInfo.height != this.streamInfo_.height) {
    var check = (function(video) {
      if (video.videoHeight == streamInfo.height) {
        shaka.timer.end('switch');
        shaka.timer.diff('switch', 'switch logic');
      } else {
        window.setTimeout(check, 50);
      }
    }).bind(null, this.video_);
    check();
  }

  this.state_ = Stream.State_.SWITCHING;

  // Request all segment metadata in parallel.
  var async = this.requestAllSegmentMetadata_(streamInfo);

  // If it's an immediate switch, pause the video and cancel updates until the
  // switch is complete.
  var previouslyPaused = this.video_.paused;
  if (immediate) {
    this.video_.pause();
    this.cancelUpdateTimer_();
    async.push(this.sbm_.abort());
  }

  // Save intermediate results so that we do not have to nest promises.
  var initSegmentData;

  Promise.all(async).then(shaka.util.TypedBind(this,
      /** @param {!Array} results */
      function(results) {
        var segmentIndexData = results[0];
        initSegmentData = results[1];

        // Create/get SegmentIndex.
        if (streamInfo.segmentIndexInfo) {
          shaka.asserts.assert(segmentIndexData);
          this.segmentIndex_ = this.createSegmentIndex_(
              streamInfo, segmentIndexData, initSegmentData);
          if (!this.segmentIndex_) {
            var error = new Error('Failed to create SegmentIndex.');
            error.type = 'stream';
            return Promise.reject(error);
          }
        } else {
          this.segmentIndex_ = streamInfo.segmentIndex;
        }

        this.streamInfo_ = streamInfo;
        this.type_ = streamInfo.mimeType.split('/')[0];
        this.state_ = Stream.State_.SPLICING;

        this.sbm_.reset();

        // Stop updating and abort |sbm_|'s current operation. This will reject
        // |sbm_|'s current promise.
        this.cancelUpdateTimer_();
        return this.sbm_.abort();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        var currentTime = this.getCurrentTime_();
        var bufferTime = Math.max(streamInfo.minBufferTime,
                                  Stream.BUFFER_SIZE_SECONDS_);
        // Fetch new segments to meet the buffering requirement and replace
        // what's currently in buffer.
        var segmentRange = this.segmentIndex_.getRangeForInterval(
            this.getCurrentTime_(),
            bufferTime);
        if (!segmentRange) {
          return Promise.reject(new Error('No segments available.'));
        }
        shaka.log.v1('Fetching segment range', this.type_,
                     segmentRange.references);
        return this.sbm_.fetch(segmentRange, initSegmentData);
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        if (immediate) {
          // Force the video to start presenting the new segment(s).
          this.video_.currentTime -= Stream.SINGLE_FRAME_SECONDS_;
          if (!previouslyPaused) {
            this.video_.play();
          }
        }
        shaka.timer.end('switch logic');
        this.fireAdaptationEvent_(streamInfo);
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
  // Alias.
  var Stream = shaka.media.Stream;

  shaka.asserts.assert(this.state_ == Stream.State_.INITIALIZING ||
                       this.state_ == Stream.State_.SPLICING);


  // Note that |state_| must be set to UPDATING before switchStream_()
  // is called.
  this.state_ = Stream.State_.UPDATING;

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
      this.state_ == Stream.State_.SWITCHING ||
      this.state_ == Stream.State_.SPLICING) {
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
        var index = this.segmentIndex_.findReferenceIndex(time);
        if (!this.sbm_.isBuffered(time) || !this.sbm_.isInserted(index)) {
          return this.sbm_.clear();
        }
        return Promise.resolve();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        this.state_ = Stream.State_.UPDATING;
        this.onUpdate_();
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
 * Requests all segment metadata for the given StreamInfo.
 * @param {!shaka.media.StreamInfo} streamInfo
 * @return {!Array.<!Promise.<!ArrayBuffer>|!Promise.<null>>} The first result
 *     contains the segment index data or null. The second result contains the
 *     initialization segment data or null.
 * @private
 */
shaka.media.Stream.prototype.requestAllSegmentMetadata_ = function(
    streamInfo) {
  return [
    this.requestSegmentMetadata_(streamInfo.segmentIndexInfo),
    this.requestSegmentMetadata_(streamInfo.segmentInitializationInfo)
  ];
};


/**
 * Requests segment metadata, e.g., a segment index or an initialization
 * segment.
 * @param {shaka.media.SegmentMetadataInfo} info
 * @return {!Promise.<!ArrayBuffer>|!Promise.<null>}
 * @private
 */
shaka.media.Stream.prototype.requestSegmentMetadata_ = function(info) {
  if (!info || !info.url) {
    shaka.log.debug('No metadata to fetch.');
    return Promise.resolve(null);
  }

  var request = new shaka.util.RangeRequest(
      info.url.toString(), info.startByte, info.endByte);
  request.estimator = this.estimator_;
  return request.send();
};


/**
 * Creates a SegmentIndex.
 * @param {shaka.media.StreamInfo} streamInfo
 * @param {!ArrayBuffer} segmentIndexData The segment index data.
 * @param {ArrayBuffer} initSegmentData The initialization segment data.
 * @return {shaka.media.SegmentIndex}
 * @private
 */
shaka.media.Stream.prototype.createSegmentIndex_ = function(
    streamInfo, segmentIndexData, initSegmentData) {
  shaka.asserts.assert(streamInfo.segmentIndexInfo);
  shaka.asserts.assert(streamInfo.mediaUrl);

  /** @type {shaka.media.ISegmentIndexParser} */
  var indexParser = null;

  if (streamInfo.mimeType.indexOf('mp4') >= 0) {
    indexParser = new shaka.media.IsobmffSegmentIndexParser(
        /** @type {!goog.Uri} */ (streamInfo.mediaUrl));
  } else if (streamInfo.mimeType.indexOf('webm') >= 0) {
    if (!initSegmentData) {
      shaka.log.error('Cannot create segment index: initialization segment ' +
                      'required for WebM.');
      return null;
    }
    indexParser = new shaka.media.WebmSegmentIndexParser(
        /** @type {!goog.Uri} */ (streamInfo.mediaUrl));
  } else {
    shaka.log.error('Cannot create segment index: unsupported mime type.');
    return null;
  }
  shaka.asserts.assert(indexParser);

  var initSegmentDataView =
      initSegmentData ? new DataView(initSegmentData) : null;
  var segmentIndexDataView = new DataView(segmentIndexData);
  var indexOffset = streamInfo.segmentIndexInfo.startByte;

  var references =
      indexParser.parse(initSegmentDataView, segmentIndexDataView, indexOffset);

  if (!references) {
    shaka.log.error('Cannot create segment index: failed to parse references.');
    return null;
  }

  return new shaka.media.SegmentIndex(references);
};


/**
 * Update callback.
 * @private
 */
shaka.media.Stream.prototype.onUpdate_ = function() {
  // Alias.
  var Stream = shaka.media.Stream;

  shaka.asserts.assert(this.streamInfo_);
  shaka.asserts.assert(this.segmentIndex_);
  shaka.asserts.assert(this.state_ == Stream.State_.SWITCHING ||
                       this.state_ == Stream.State_.UPDATING);

  // Avoid stacking timeouts.
  this.cancelUpdateTimer_();

  // Get the SegmentReference index and actual SegmentReference (if one exists)
  // for the next unbuffered time range.
  var currentTime = this.getCurrentTime_();
  var referenceIndex = this.findNextNeededIndex_(currentTime);
  var reference = this.segmentIndex_.getReference(referenceIndex);

  if (!reference) {
    // EOF.
    shaka.log.info('EOF for ' + this.streamInfo_.mimeType + ' stream.');
    this.state_ = Stream.State_.ENDED;

    // Dispatch a non-bubbling event.  Let the VideoSource handle it.
    var event = shaka.util.FakeEvent.create({ type: 'ended' });
    this.dispatchEvent(event);
    return;
  }

  var bufferingGoal = Math.max(this.streamInfo_.minBufferTime,
                               Stream.BUFFER_SIZE_SECONDS_);
  var bufferedAhead = reference.startTime - currentTime;
  if (bufferedAhead >= bufferingGoal) {
    // We don't need to make a request right now, so check again in a second.
    this.updateTimerId_ = window.setTimeout(this.onUpdate_.bind(this), 1000);
    return;
  }

  // Fetch and append the next segment.  Only fetch a single segment, because
  // fetching multiple segments could cause a buffering event when utilization
  // of available bandwidth is high.  If we are behind our buffering goal by
  // more than one segment, we should still be able to catch up by requesting
  // single segments.

  // This operation may be interrupted by switchStream_().
  shaka.log.v1('Fetching segment', this.type_, reference);

  var fetch = this.sbm_.fetch(new shaka.media.SegmentRange([reference]));
  fetch.then(shaka.util.TypedBind(this,
      function() {
        shaka.log.v1('Added segment', referenceIndex);
        this.onUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        // The fetch operation may be aborted while switching streams.
        if (error.type != 'aborted') {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);

          if (error.type == 'net' && error.xhr.status == 0) {
            // Hope to recover soon...
            this.updateTimerId_ =
                window.setTimeout(this.onUpdate_.bind(this), 5000);
          }
        }
      })
  );
};


/**
 * Returns the index of the SegmentReference corresponding to the first
 * unbuffered segment starting at |time|.
 *
 * @param {number} time
 * @return {number}
 *
 * @private
 */
shaka.media.Stream.prototype.findNextNeededIndex_ = function(time) {
  shaka.asserts.assert(this.segmentIndex_);

  var index = this.segmentIndex_.findReferenceIndex(time);
  while (index >= 0 && index < this.segmentIndex_.getNumReferences()) {
    if (!this.sbm_.isInserted(index)) {
      break;
    }
    index++;
  }

  return index;
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


/**
 * Gets the video's current time.
 * @return {number}
 * @private
 */
shaka.media.Stream.prototype.getCurrentTime_ = function() {
  return this.video_.currentTime;
};

