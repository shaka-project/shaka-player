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
 * @fileoverview Implements a DASH stream.
 */

goog.provide('shaka.dash.DashStream');

goog.require('shaka.asserts');
goog.require('shaka.dash.IDashStream');
goog.require('shaka.dash.ISegmentIndexParser');
goog.require('shaka.dash.IsobmffSegmentIndexParser');
goog.require('shaka.dash.SegmentIndex');
goog.require('shaka.dash.SourceBufferManager');
goog.require('shaka.dash.WebmSegmentIndexParser');
goog.require('shaka.dash.mpd');
goog.require('shaka.log');
goog.require('shaka.timer');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.FakeEventTarget');
goog.require('shaka.util.IBandwidthEstimator');
goog.require('shaka.util.RangeRequest');
goog.require('shaka.util.TypedBind');


/**
 * @event shaka.dash.DashStream.AdaptationEvent
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
 * @event shaka.dash.DashStream.EndedEvent
 * @description Fired when the stream ends.
 * @property {string} type 'ended'
 * @property {boolean} bubbles false
 */



/**
 * Creates a DashStream. A DashStream is an active representation.
 * @param {!shaka.util.FakeEventTarget} parent The parent for event bubbling.
 * @param {!HTMLVideoElement} video The video element.
 * @param {!MediaSource} mediaSource The SourceBuffer's MediaSource parent.
 * @param {!SourceBuffer} sourceBuffer The SourceBuffer. It's assumed that
 *     |sourceBuffer| has the same mime type as |representation|.
 * @param {shaka.util.IBandwidthEstimator} estimator A bandwidth estimator to
 *     attach to all DASH data requests.
 *
 * @fires shaka.dash.DashStream.AdaptationEvent
 * @fires shaka.dash.DashStream.EndedEvent
 * @fires shaka.player.Player.ErrorEvent
 *
 * @struct
 * @constructor
 * @implements {shaka.dash.IDashStream}
 * @extends {shaka.util.FakeEventTarget}
 */
shaka.dash.DashStream =
    function(parent, video, mediaSource, sourceBuffer, estimator) {
  shaka.util.FakeEventTarget.call(this, parent);

  /** @private {!HTMLVideoElement} */
  this.video_ = video;

  /** @private {!SourceBuffer} */
  this.sourceBuffer_ = sourceBuffer;

  /** @private {!shaka.dash.SourceBufferManager} */
  this.sbm_ =
      new shaka.dash.SourceBufferManager(mediaSource, sourceBuffer, estimator);

  /** @private {shaka.util.IBandwidthEstimator} */
  this.estimator_ = estimator;

  /** @private {shaka.dash.mpd.Representation} */
  this.representation_ = null;

  /** @private {shaka.dash.SegmentIndex} */
  this.segmentIndex_ = null;

  /** @private {?function()} */
  this.nextSwitch_ = null;

  /** @private {?number} */
  this.updateTimerId_ = null;

  /** @private {shaka.dash.DashStream.State_} */
  this.state_ = shaka.dash.DashStream.State_.IDLE;

  /** @private {string} */
  this.type_ = '';
};
goog.inherits(shaka.dash.DashStream, shaka.util.FakeEventTarget);


/**
 * @enum
 * @private
 */
shaka.dash.DashStream.State_ = {
  // The stream has not started yet.
  IDLE: 0,

  // The stream is starting.
  INITIALIZING: 1,

  // The stream is fetching metadata for the new representation and is still
  // updating using the old representation.
  SWITCHING: 2,

  // The stream has stopped updating using the old representation and is
  // splicing in segments into the source buffer from the new representation.
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
shaka.dash.DashStream.BUFFER_SIZE_SECONDS_ = 15.0;


/**
 * The number of seconds of old data we keep in buffer when switching
 * representations to avoid buffering during the switch operation.
 * Mpd.minBufferTime, if greater, will override this.
 *
 * @private {number}
 * @const
 */
shaka.dash.DashStream.SWITCH_BUFFER_SIZE_SECONDS_ = 5.0;


/**
 * The duration of a single frame at 20 FPS. We use this value to force the
 * video element to start showing new content after an immediate switch.
 *
 * @private
 * @const {number}
 */
shaka.dash.DashStream.SINGLE_FRAME_SECONDS_ = 0.05;


/**
 * @override
 * @suppress {checkTypes} to set otherwise non-nullable types to null.
 */
shaka.dash.DashStream.prototype.destroy = function() {
  this.state_ = null;

  this.cancelUpdateTimer_();

  this.nextSwitch_ = null;
  this.segmentIndex_ = null;
  this.representation_ = null;
  this.estimator_ = null;

  this.sbm_.destroy();
  this.sbm_ = null;

  this.sourceBuffer_ = null;
  this.video_ = null;

  this.parent = null;
};


/** @override */
shaka.dash.DashStream.prototype.getRepresentation = function() {
  return this.representation_;
};


/** @override */
shaka.dash.DashStream.prototype.hasEnded = function() {
  return this.state_ == shaka.dash.DashStream.State_.ENDED;
};


/** @override */
shaka.dash.DashStream.prototype.start = function(representation) {
  if (!this.validateRepresentation_(representation)) {
    return;
  }

  shaka.asserts.assert(this.state_ == shaka.dash.DashStream.State_.IDLE);
  if (this.state_ != shaka.dash.DashStream.State_.IDLE) {
    shaka.log.error('Cannot start stream: stream has already been started.');
    return;
  }

  shaka.log.info('Starting stream for', representation);

  this.representation_ = representation;
  this.type_ = representation.mimeType.split('/')[0];
  this.segmentIndex_ = null;
  this.state_ = shaka.dash.DashStream.State_.INITIALIZING;

  // Request all segment metadata in parallel.
  var async = this.requestAllSegmentMetadata_(representation);

  Promise.all(async).then(shaka.util.TypedBind(this,
      /** @param {!Array} results */
      function(results) {
        var segmentIndexData = results[0];
        var initSegmentData = results[1];

        // Create/get SegmentIndex.
        if (representation.segmentBase) {
          shaka.asserts.assert(segmentIndexData);
          this.segmentIndex_ = this.createSegmentIndex_(
              representation, segmentIndexData, initSegmentData);
          if (!this.segmentIndex_) {
            var error = new Error('Failed to create SegmentIndex.');
            error.type = 'dash';
            return Promise.reject(error);
          }
        } else {
          this.segmentIndex_ = /** @type {shaka.dash.SegmentIndex} */ (
              representation.segmentList.userData);
          shaka.asserts.assert(this.segmentIndex_);
        }

        // Set the SourceBuffer's timestamp offset to handle non-zero earliest
        // presentation times.
        var firstReference = this.segmentIndex_.getReference(0);
        if (firstReference && firstReference.startTime >= 1.0) {
          // If the start time is less than one then assume any offset is
          // because the segment index uses DTS (decoding timestamps).
          this.sourceBuffer_.timestampOffset = -firstReference.startTime;
          shaka.log.v1('timestampOffset', -firstReference.startTime);
        }

        var initialBufferTime = representation.minBufferTime;
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
        this.fireAdaptationEvent_(representation);
        this.switchRepresentationOrUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type != 'aborted') {
          this.state_ = shaka.dash.DashStream.State_.IDLE;
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
        }
      })
  );
};


/** @override */
shaka.dash.DashStream.prototype.switch = function(representation, immediate) {
  shaka.timer.begin('switch');
  shaka.timer.begin('switch logic');
  if (!this.validateRepresentation_(representation)) {
    // Error has already been dispatched.
    return;
  }

  // Alias.
  var DashStream = shaka.dash.DashStream;

  // We cannot switch representations if the stream has not been started.
  shaka.asserts.assert(this.state_ != DashStream.State_.IDLE);
  if (this.state_ == DashStream.State_.IDLE) {
    shaka.log.error(
        'Cannot switch representation: stream has not been started.');
    return;
  }

  // We cannot switch representations if we are initializing or already
  // switching representations.
  if (this.state_ == DashStream.State_.INITIALIZING ||
      this.state_ == DashStream.State_.SWITCHING ||
      this.state_ == DashStream.State_.SPLICING) {
    shaka.log.info('Waiting to switch representations...');
    this.nextSwitch_ = this.switch.bind(this, representation, immediate);
    return;
  }

  if (representation == this.representation_) {
    shaka.log.info('Ignoring switch.');
    // Nothing to do.  If this was a deferred switch, the update loop is not
    // running.  So kick off an update to be safe.
    this.onUpdate_();
    return;
  }

  shaka.log.info('Switching representations to', representation);

  if (immediate && representation.height &&
      representation.height != this.representation_.height) {
    var check = (function(video) {
      if (video.videoHeight == representation.height) {
        shaka.timer.end('switch');
        shaka.timer.diff('switch', 'switch logic');
      } else {
        window.setTimeout(check, 50);
      }
    }).bind(null, this.video_);
    check();
  }

  this.state_ = DashStream.State_.SWITCHING;

  // Request all segment metadata in parallel.
  var async = this.requestAllSegmentMetadata_(representation);

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
        if (representation.segmentBase) {
          shaka.asserts.assert(segmentIndexData);
          this.segmentIndex_ = this.createSegmentIndex_(
              representation, segmentIndexData, initSegmentData);
          if (!this.segmentIndex_) {
            var error = new Error('Failed to create SegmentIndex.');
            error.type = 'dash';
            return Promise.reject(error);
          }
        } else {
          this.segmentIndex_ = /** @type {shaka.dash.SegmentIndex} */ (
              representation.segmentList.userData);
          shaka.asserts.assert(this.segmentIndex_);
        }

        this.representation_ = representation;
        this.type_ = representation.mimeType.split('/')[0];
        this.state_ = DashStream.State_.SPLICING;

        this.sbm_.reset();

        this.fireAdaptationEvent_(representation);

        // Stop updating and abort |sbm_|'s current operation. This will reject
        // |sbm_|'s current promise.
        this.cancelUpdateTimer_();
        return this.sbm_.abort();
      })
  ).then(shaka.util.TypedBind(this,
      function() {
        var currentTime = this.getCurrentTime_();
        var bufferTime = Math.max(representation.minBufferTime,
                                  DashStream.BUFFER_SIZE_SECONDS_);
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
          this.video_.currentTime -= DashStream.SINGLE_FRAME_SECONDS_;
          if (!previouslyPaused) {
            this.video_.play();
          }
        }
        shaka.timer.end('switch logic');
        this.switchRepresentationOrUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        if (error.type != 'aborted') {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);

          // Try to recover.
          this.state_ = DashStream.State_.UPDATING;
          this.onUpdate_();
        }
      })
  );
};


/**
 * Fires a shaka.dash.DashStream.AdaptationEvent for a given representation.
 *
 * @param {shaka.dash.mpd.Representation} representation
 * @private
 */
shaka.dash.DashStream.prototype.fireAdaptationEvent_ =
    function(representation) {
  var contentType = representation.mimeType.split('/')[0];
  var size = (contentType != 'video') ? null : {
    'width': representation.width,
    'height': representation.height
  };
  var event = shaka.util.FakeEvent.create({
    'type': 'adaptation',
    'bubbles': true,
    'contentType': contentType,
    'size': size,
    'bandwidth': representation.bandwidth
  });
  this.dispatchEvent(event);
};


/**
 * Validates the given |representation|. If |representation| is valid then
 * return true; otherwise, dispatch an error event and return false.
 *
 * @param {shaka.dash.mpd.Representation} representation
 * @return {boolean}
 *
 * @private
 */
shaka.dash.DashStream.prototype.validateRepresentation_ = function(
    representation) {
  var hasSegmentBase = representation.segmentBase &&
                       representation.segmentBase.representationIndex &&
                       representation.segmentBase.representationIndex.range &&
                       representation.segmentBase.mediaUrl;

  var hasSegmentList = representation.segmentList &&
                       representation.segmentList.userData;

  if (!hasSegmentBase && !hasSegmentList) {
    var error = new Error('Missing critical segment information.');
    error.type = 'mpd';

    var event = shaka.util.FakeEvent.createErrorEvent(error);
    this.dispatchEvent(event);

    return false;
  }

  return true;
};


/**
 * Calls |nextSwitch_| if it's non-null; otherwise, calls onUpdate_().
 * @private
 */
shaka.dash.DashStream.prototype.switchRepresentationOrUpdate_ = function() {
  // Alias.
  var DashStream = shaka.dash.DashStream;

  shaka.asserts.assert(this.state_ == DashStream.State_.INITIALIZING ||
                       this.state_ == DashStream.State_.SPLICING);


  // Note that |state_| must be set to UPDATING before switchRepresentation_()
  // is called.
  this.state_ = DashStream.State_.UPDATING;

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
shaka.dash.DashStream.prototype.resync = function() {
  // Alias.
  var DashStream = shaka.dash.DashStream;

  shaka.asserts.assert(this.state_ != DashStream.State_.IDLE);
  if (this.state_ == DashStream.State_.IDLE) {
    shaka.log.error('Cannot resync stream: stream has not been initialized.');
    return;
  }

  if (this.state_ == DashStream.State_.INITIALIZING ||
      this.state_ == DashStream.State_.SWITCHING ||
      this.state_ == DashStream.State_.SPLICING) {
    // Since the stream is initializing or switching it will be resynchronized
    // after the first call to onUpdate_().
    return;
  }

  // Stop updating and abort |sbm_|'s current operation. This will reject
  // |sbm_|'s current promise.
  this.cancelUpdateTimer_();
  this.sbm_.abort().then(shaka.util.TypedBind(this,
      function() {
        this.state_ = DashStream.State_.UPDATING;
        this.onUpdate_();
      })
  );
};


/** @override */
shaka.dash.DashStream.prototype.setEnabled = function(enabled) {
  // NOP, not supported for audio and video streams.
};


/** @override */
shaka.dash.DashStream.prototype.getEnabled = function() {
  return true;
};


/**
 * Requests all segment metadata for the given representation.
 * @param {!shaka.dash.mpd.Representation} representation
 * @return {!Array.<!Promise.<!ArrayBuffer>|!Promise.<null>>} The first result
 *     contains the segment index data or null. The second result contains the
 *     initialization segment data or null.
 * @private
 */
shaka.dash.DashStream.prototype.requestAllSegmentMetadata_ = function(
    representation) {
  var async;

  if (representation.segmentBase) {
    return [
      this.requestSegmentMetadata_(
          representation.segmentBase.representationIndex),
      this.requestSegmentMetadata_(
          representation.segmentBase.initialization)];
  } else {
    return [
      Promise.resolve(null),
      this.requestSegmentMetadata_(
          representation.segmentList.initialization)];
  }
};


/**
 * Requests either a segment index or an initialization segment.
 * @param {shaka.dash.mpd.RepresentationIndex|
 *         shaka.dash.mpd.Initialization} urlTypeObject
 * @return {!Promise.<!ArrayBuffer>|!Promise.<null>}
 * @private
 */
shaka.dash.DashStream.prototype.requestSegmentMetadata_ = function(
    urlTypeObject) {
  if (!urlTypeObject || !urlTypeObject.url) {
    shaka.log.debug('No metadata to fetch.');
    return Promise.resolve(null);
  }

  var range = urlTypeObject.range;
  if (!range) {
    range = { begin: 0, end: null };
  }

  var urlString = urlTypeObject.url.toString();
  var request = new shaka.util.RangeRequest(urlString, range.begin, range.end);
  request.estimator = this.estimator_;
  return request.send();
};


/**
 * Creates a SegmentIndex. |representation| must contain a SegmentBase.
 * @param {shaka.dash.mpd.Representation} representation
 * @param {!ArrayBuffer} segmentIndexData The segment index data.
 * @param {ArrayBuffer} initSegmentData The initialization segment data.
 * @return {shaka.dash.SegmentIndex}
 * @private
 */
shaka.dash.DashStream.prototype.createSegmentIndex_ = function(
    representation, segmentIndexData, initSegmentData) {
  shaka.asserts.assert(representation.segmentBase);
  shaka.asserts.assert(representation.segmentBase.mediaUrl);

  /** @type {shaka.dash.ISegmentIndexParser} */
  var indexParser = null;

  if (representation.mimeType.indexOf('mp4') >= 0) {
    indexParser = new shaka.dash.IsobmffSegmentIndexParser(
        /** @type {!goog.Uri} */ (representation.segmentBase.mediaUrl));
  } else if (representation.mimeType.indexOf('webm') >= 0) {
    if (!initSegmentData) {
      shaka.log.error('Cannot create segment index: initialization segment ' +
                      'required for WebM.');
      return null;
    }
    indexParser = new shaka.dash.WebmSegmentIndexParser(
        /** @type {!goog.Uri} */ (representation.segmentBase.mediaUrl));
  } else {
    shaka.log.error('Cannot create segment index: unsupported mime type.');
    return null;
  }
  shaka.asserts.assert(indexParser);

  var initSegmentDataView =
      initSegmentData ? new DataView(initSegmentData) : null;
  var segmentIndexDataView = new DataView(segmentIndexData);
  var indexOffset = representation.segmentBase.representationIndex.range.begin;

  var references =
      indexParser.parse(initSegmentDataView, segmentIndexDataView, indexOffset);

  if (!references) {
    shaka.log.error('Cannot create segment index: failed to parse references.');
    return null;
  }

  return new shaka.dash.SegmentIndex(references);
};


/**
 * Update callback.
 * @private
 */
shaka.dash.DashStream.prototype.onUpdate_ = function() {
  // Alias.
  var DashStream = shaka.dash.DashStream;

  shaka.asserts.assert(this.representation_);
  shaka.asserts.assert(this.segmentIndex_);
  shaka.asserts.assert(this.state_ == DashStream.State_.SWITCHING ||
                       this.state_ == DashStream.State_.UPDATING);

  // Avoid stacking timeouts.
  this.cancelUpdateTimer_();

  // Get the SegmentReference index and actual SegmentReference (if one exists)
  // for the next unbuffered time range.
  var currentTime = this.getCurrentTime_();
  var referenceIndex = this.findNextNeededIndex_(currentTime);
  var reference = this.segmentIndex_.getReference(referenceIndex);

  if (!reference) {
    // EOF.
    shaka.log.info('EOF for ' + this.representation_.mimeType + ' stream.');
    this.state_ = DashStream.State_.ENDED;

    // Dispatch a non-bubbling event.  Let the VideoSource handle it.
    var event = shaka.util.FakeEvent.create({ type: 'ended' });
    this.dispatchEvent(event);

    return;
  }

  var bufferingGoal = Math.max(this.representation_.minBufferTime,
                               DashStream.BUFFER_SIZE_SECONDS_);
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
  // single segments so long as we are using an appropriate representation.

  // This operation may be interrupted by switchRepresentation_().
  shaka.log.v1('Fetching segment', this.type_, reference);

  var fetch = this.sbm_.fetch(new shaka.dash.SegmentRange([reference]));
  fetch.then(shaka.util.TypedBind(this,
      function() {
        shaka.log.v1('Added segment', referenceIndex);
        this.onUpdate_();
      })
  ).catch(shaka.util.TypedBind(this,
      /** @param {!Error} error */
      function(error) {
        // The fetch operation may be aborted while switching representations.
        if (error.type != 'aborted') {
          var event = shaka.util.FakeEvent.createErrorEvent(error);
          this.dispatchEvent(event);
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
shaka.dash.DashStream.prototype.findNextNeededIndex_ = function(time) {
  shaka.asserts.assert(this.segmentIndex_);

  var index = this.segmentIndex_.findReferenceIndex(time);
  while (index >= 0 && index < this.segmentIndex_.getNumReferences()) {
    if (!this.sbm_.isBuffered(index)) {
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
shaka.dash.DashStream.prototype.cancelUpdateTimer_ = function() {
  if (this.updateTimerId_) {
    window.clearTimeout(this.updateTimerId_);
    this.updateTimerId_ = null;
  }
};


/**
 * Gets the video's current time, offset by the earliest presentation time.
 * @return {number}
 * @private
 */
shaka.dash.DashStream.prototype.getCurrentTime_ = function() {
  return this.video_.currentTime - this.sourceBuffer_.timestampOffset;
};

