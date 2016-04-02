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

goog.provide('shaka.media.StreamingEngine');

goog.require('goog.asserts');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.Playhead');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.PublicPromise');



/**
 * Creates a StreamingEngine.
 *
 * The StreamingEngine is responsible for setting up the Manifest's Streams
 * (i.e., for calling each Stream's createSegmentIndex() function), for
 * downloading segments, for co-ordinating audio, video, and text buffering,
 * and for handling Period transitions. The StreamingEngine provides an
 * interface to switch between Streams, but it does not choose which Streams to
 * switch to.
 *
 * The StreamingEngine notifies its owner when it needs to buffer a new Period,
 * so its owner can choose which Streams within that Period to initially
 * buffer. Moreover, the StreamingEngine also notifies its owner when any
 * Stream within the current Period may be switched to, so its owner can switch
 * bitrates, resolutions, or languages.
 *
 * The StreamingEngine does not need to be notified about changes to the
 * Manifest's SegmentIndexes; however, it does need to be notified when new
 * Periods are added to the Manifest, so it can set up that Period's Streams.
 *
 * To start the StreamingEngine the owner must first call configure() followed
 * by init(). The StreamingEngine will then call onChooseStreams(p) when it
 * needs to buffer Period p; it will then switch to the Streams returned from
 * that function. The StreamingEngine will call onCanSwitch() when any
 * Stream within the current Period may be switched to.
 *
 * The owner must call seeked() each time the playhead moves to a new location
 * within the presentation timeline; however, the owner may forego calling
 * seeked() when the playhead moves outside the presentation timeline.
 *
 * @param {!shaka.media.Playhead} playhead The Playhead. The caller retains
 *   ownership.
 * @param {!shaka.media.MediaSourceEngine} mediaSourceEngine The
 *   MediaSourceEngine. The caller retains ownership.
 * @param {shaka.net.NetworkingEngine} netEngine
 * @param {shakaExtern.Manifest} manifest
 * @param {function(!shakaExtern.Period): !Object.<string, shakaExtern.Stream>}
 *   onChooseStreams Called when the given Period needs to be buffered. The
 *   StreamingEngine will switch to the Streams returned from this function.
 *   The caller cannot call switch() directly until the StreamingEngine calls
 *   onCanSwitch()
 * @param {function()} onCanSwitch Called when any Stream within the current
 *   Period may be switched to.
 * @param {function(!shaka.util.Error)} onError Called when an error occurs.
 *   If the error is recoverable (see @link{shaka.util.Error}) then the
 *   caller may invoke either StreamingEngine.switch() or
 *   StreamingEngine.seeked() to attempt recovery.
 * @param {function()=} opt_onInitialStreamsSetup Optional callback which
 *   is called when the initial set of Streams have been setup. Intended
 *   to be used by tests.
 * @param {function()=} opt_onStartupComplete Optional callback which
 *   is called when startup has completed. Intended to be used by tests.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.StreamingEngine = function(
    playhead, mediaSourceEngine, netEngine, manifest,
    onChooseStreams, onCanSwitch, onError,
    opt_onInitialStreamsSetup, opt_onStartupComplete) {
  /** @private {shaka.media.Playhead} */
  this.playhead_ = playhead;

  /** @private {shaka.media.MediaSourceEngine} */
  this.mediaSourceEngine_ = mediaSourceEngine;

  /** @private {shaka.net.NetworkingEngine} */
  this.netEngine_ = netEngine;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = manifest;

  /**
   * @private
   *     {?function(!shakaExtern.Period): !Object.<string, shakaExtern.Stream>}
   */
  this.onChooseStreams_ = onChooseStreams;

  /** @private {?function()} */
  this.onCanSwitch_ = onCanSwitch;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = onError;

  /** @private {?function()} */
  this.onInitialStreamsSetup_ = opt_onInitialStreamsSetup || null;

  /** @private {?function()} */
  this.onStartupComplete_ = opt_onStartupComplete || null;

  /** @private {?shakaExtern.StreamingConfiguration} */
  this.config_ = null;

  /** @private {Promise} */
  this.setupPeriodPromise_ = Promise.resolve();

  /**
   * Maps a Period's index to an object that indicates that either
   *   1. the Period has not been set up (undefined)
   *   2. the Period is being set up ([a PublicPromise, false]),
   *   3. the Period is set up (i.e., all Streams within the Period are set up)
   *      and can be switched to ([a PublicPromise, true]).
   *
   * @private {Array.<?{promise: shaka.util.PublicPromise, resolved: boolean}>}
   */
  this.canSwitchPeriod_ = [];

  /**
   * Maps a Stream's ID to an object that indicates that either
   *   1. the Stream has not been set up (undefined)
   *   2. the Stream is being set up ([a Promise instance, false]),
   *   3. the Stream is set up and can be switched to
   *      ([a Promise instance, true]).
   *
   * @private {Object.<number,
   *                   ?{promise: shaka.util.PublicPromise, resolved: boolean}>}
   */
  this.canSwitchStream_ = {};

  /**
   * Maps a content type, e.g., 'audio', 'video', or 'text', to a MediaState.
   *
   * @private {Object.<string, !shaka.media.StreamingEngine.MediaState_>}
   */
  this.mediaStates_ = {};

  /**
   * Set to true once one segment of each content type has been buffered.
   *
   * @private {boolean}
   */
  this.startupComplete_ = false;

  /** @private {boolean} */
  this.destroyed_ = false;
};


/**
 * @typedef {{
 *   type: string,
 *   stream: shakaExtern.Stream,
 *   lastSegmentPeriodIndex: ?number,
 *   lastSegmentReference: shaka.media.SegmentReference,
 *   drift: ?number,
 *   needInitSegment: boolean,
 *   needRebuffering: boolean,
 *   needPeriodIndex: number,
 *   endOfStream: boolean,
 *   performingUpdate: boolean,
 *   updateTimer: ?number,
 *   waitingToClearBuffer: boolean,
 *   clearingBuffer: boolean
 * }}
 *
 * @description
 * Contains the state of a logical stream, i.e., a sequence of segmented data
 * for a particular content type. At any given time there is a Stream object
 * associated with the state of the logical stream.
 *
 * @property {string} type
 *   The stream's content type, e.g., 'audio', 'video', or 'text'.
 * @property {shakaExtern.Stream} stream
 *   The current Stream.
 * @property {?number} lastSegmentPeriodIndex
 *   The index of the Period of the last segment that was appended.
 * @property {shaka.media.SegmentReference} lastSegmentReference
 *   The SegmentReference of the last segment that was appended.
 * @property {?number} drift
 *   The number of seconds that the segments' timestamps are offset from the
 *   SegmentReferences' timestamps. For example, a positive value indicates
 *   that the segments are ahead of the SegmentReferences. Note that the
 *   segments' timestamps are the true values; however, the drift should
 *   never be very large for valid content.
 * @property {boolean} needInitSegment
 *   True indicates that |stream|'s init segment must be inserted before the
 *   next media segment is appended.
 * @property {boolean} needRebuffering
 *   True indicates that startup or re- buffering is required.
 * @property {boolean} endOfStream
 *   True indicates that the end of the buffer has hit the end of the
 *   presentation.
 * @property {number} needPeriodIndex
 *   The index of the Period which needs to be buffered.
 * @property {boolean} performingUpdate
 *   True indicates that an update is in progress.
 * @property {?number} updateTimer
 *   A non-null value indicates that an update is scheduled.
 * @property {boolean} waitingToClearBuffer
 *   True indicates that the buffer must be cleared after the current update
 *   finishes.
 * @property {boolean} clearingBuffer
 *   True indicates that the buffer is being cleared.
 */
shaka.media.StreamingEngine.MediaState_;


/**
 * The minimum number seconds that will remain buffered after evicting media.
 *
 * @const {number}
 */
shaka.media.StreamingEngine.prototype.MIN_BUFFER_LENGTH = 2;


/**
 * Gets the StreamingEngine's rebuffering goal.
 *
 * @param {shakaExtern.Manifest} manifest
 * @param {shakaExtern.StreamingConfiguration} config
 * @return {number}
 */
shaka.media.StreamingEngine.getRebufferingGoal = function(manifest, config) {
  return Math.max(manifest.minBufferTime || 0, config.rebufferingGoal);
};


/** @override */
shaka.media.StreamingEngine.prototype.destroy = function() {
  for (var type in this.mediaStates_) {
    this.cancelUpdate_(this.mediaStates_[type]);
  }

  this.playhead_ = null;
  this.mediaSourceEngine_ = null;
  this.netEngine_ = null;
  this.manifest_ = null;
  this.setupPeriodPromise_ = null;
  this.onChooseStreams_ = null;
  this.onCanSwitch_ = null;
  this.onError_ = null;
  this.onInitialStreamsSetup_ = null;
  this.onStartupComplete_ = null;
  this.canSwitchPeriod_ = null;
  this.canSwitchStream_ = null;
  this.mediaStates_ = null;
  this.config_ = null;

  this.destroyed_ = true;

  return Promise.resolve();
};


/**
 * Called by the Player to provide an updated configuration any time it changes.
 * Will be called at least once before init().
 *
 * @param {shakaExtern.StreamingConfiguration} config
 */
shaka.media.StreamingEngine.prototype.configure = function(config) {
  this.config_ = config;

  goog.asserts.assert(this.manifest_, 'manifest_ should not be null');
  var rebufferingGoal = shaka.media.StreamingEngine.getRebufferingGoal(
      this.manifest_, this.config_);
  this.playhead_.setRebufferingGoal(rebufferingGoal);
};


/**
 * Initializes the StreamingEngine.
 *
 * After this function is called the StreamingEngine will call
 * onChooseStreams(p) when it needs to buffer Period p and onCanSwitch() when
 * any Stream within that Period may be switched to.
 *
 * After the StreamingEngine calls onChooseStreams(p) for the first time, it
 * will begin setting up the Streams returned from that function and
 * subsequently switch to them. However, the StreamingEngine will not begin
 * setting up any other Streams until at least one segment from each of the
 * initial set of Streams has been buffered (this reduces startup latency).
 * After the StreamingEngine completes this startup phase it will begin setting
 * up each Period's Streams (while buffering in parrallel).
 *
 * When the StreamingEngine needs to buffer the next Period it will have
 * already set up that Period's Streams. So, when the StreamingEngine calls
 * onChooseStreams(p) after the first time, the StreamingEngine will
 * immediately switch to the Streams returned from that function.
 *
 * @return {!Promise}
 */
shaka.media.StreamingEngine.prototype.init = function() {
  var MapUtils = shaka.util.MapUtils;
  goog.asserts.assert(this.config_,
      'StreamingEngine configure() must be called before init()!');

  // Determine which Period we must buffer.
  var playheadTime = this.playhead_.getTime();
  var needPeriodIndex = this.findPeriodContainingTime_(playheadTime);

  // Get the initial set of Streams.
  var streamsByType =
      this.onChooseStreams_(this.manifest_.periods[needPeriodIndex]);
  if (MapUtils.empty(streamsByType)) {
    shaka.log.error('init: no Streams chosen');
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.STREAMING,
        shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
  }

  // Setup the initial set of Streams and then begin each update cycle. After
  // startup completes onUpdate_() will set up the remaining Periods.
  return this.initStreams_(streamsByType).then(function() {
    shaka.log.debug('init: completed initial Stream setup');

    // Subtlety: onInitialStreamsSetup_() may call switch() or seeked(), so we
    // must schedule an update beforehand so |updateTimer| is set.
    if (this.onInitialStreamsSetup_) {
      shaka.log.v1('init: calling onInitialStreamsSetup_()...');
      this.onInitialStreamsSetup_();
    }
  }.bind(this));
};


/**
 * Gets the current Period the stream is in.  This Period may not be initialized
 * yet if canSwitch(period) has not been called yet.
 * @return {shakaExtern.Period}
 */
shaka.media.StreamingEngine.prototype.getCurrentPeriod = function() {
  var playheadTime = this.playhead_.getTime();
  var needPeriodIndex = this.findPeriodContainingTime_(playheadTime);
  return this.manifest_.periods[needPeriodIndex];
};


/**
 * Gets a map of all the active streams.
 * @return {!Object.<string, shakaExtern.Stream>}
 */
shaka.media.StreamingEngine.prototype.getActiveStreams = function() {
  goog.asserts.assert(this.mediaStates_, 'Must be initialized');
  var MapUtils = shaka.util.MapUtils;
  return MapUtils.map(
      this.mediaStates_, function(state) { return state.stream; });
};


/**
 * Notifies StreamingEngine that a new stream was added to the manifest.  This
 * initializes the given stream.  This returns a Promise that resolves when
 * the stream has been set up.
 *
 * @param {string} type
 * @param {shakaExtern.Stream} stream
 * @return {!Promise}
 */
shaka.media.StreamingEngine.prototype.notifyNewStream = function(type, stream) {
  /** @type {!Object.<string, shakaExtern.Stream>} */
  var streamsByType = {};
  streamsByType[type] = stream;
  return this.initStreams_(streamsByType);
};


/**
 * Switches to the given Stream. |stream| may be from any StreamSet or any
 * Period.
 *
 * @param {string} contentType |stream|'s content type.
 * @param {shakaExtern.Stream} stream
 * @param {boolean=} opt_clearBuffer
 */
shaka.media.StreamingEngine.prototype.switch = function(
    contentType, stream, opt_clearBuffer) {
  // TODO: Change opt_clearBuffer to a number so only part of the buffer is
  // cleared.
  var mediaState = this.mediaStates_[contentType];
  goog.asserts.assert(mediaState, 'switch: expected mediaState to exist');
  if (!mediaState) return;

  // Ensure the Period is ready.
  var periodIndex = this.findPeriodContainingStream_(stream);
  var canSwitchRecord = this.canSwitchPeriod_[periodIndex];
  goog.asserts.assert(
      canSwitchRecord && canSwitchRecord.resolved,
      'switch: expected Period ' + periodIndex + ' to be ready');
  if (!canSwitchRecord || !canSwitchRecord.resolved) return;

  // Sanity check. If the Period is ready then the Stream should be ready too.
  canSwitchRecord = this.canSwitchStream_[stream.id];
  goog.asserts.assert(canSwitchRecord && canSwitchRecord.resolved,
                      'switch: expected Stream ' + stream.id + ' to be ready');
  if (!canSwitchRecord || !canSwitchRecord.resolved) return;

  if (mediaState.stream == stream) {
    var streamTag = shaka.media.StreamingEngine.logPrefix_(mediaState);
    shaka.log.debug('switch: Stream ' + streamTag + ' already active');
    return;
  }

  mediaState.stream = stream;
  mediaState.needInitSegment = true;

  var streamTag = shaka.media.StreamingEngine.logPrefix_(mediaState);
  shaka.log.debug('switch: switching to Stream ' + streamTag);

  if (opt_clearBuffer) {
    // Ignore if we are already clearing the buffer.
    if (!mediaState.waitingToClearBuffer && !mediaState.clearingBuffer) {
      if (mediaState.performingUpdate) {
        // We are performing an update, so we have to wait until it's finished.
        // onUpdate_() will call clearBuffer_() when the update has
        // finished.
        mediaState.waitingToClearBuffer = true;
      } else {
        this.cancelUpdate_(mediaState);
        this.clearBuffer_(mediaState);
      }
    }
  }
};


/**
 * Notifies the StreamingEngine that the playhead has moved to a valid time
 * within the presentation timeline.
 */
shaka.media.StreamingEngine.prototype.seeked = function() {
  for (var type in this.mediaStates_) {
    var mediaState = this.mediaStates_[type];
    var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    if (mediaState.clearingBuffer) {
      // We're already clearing the buffer, so we don't need to clear the
      // buffer again.
      shaka.log.debug(logPrefix, 'seeked: already clearing the buffer');
      continue;
    }

    var playheadTime = this.playhead_.getTime();
    var bufferedAhead = this.mediaSourceEngine_.bufferedAheadOf(
        type, playheadTime, 0.1);
    if (bufferedAhead > 0) {
      // The playhead has moved into a buffered region, so we don't need to
      // clear the buffer.
      shaka.log.debug(logPrefix,
                      'seeked: buffered seek:',
                      'playheadTime=' + playheadTime,
                      'bufferedAhead=' + bufferedAhead);
      mediaState.waitingToClearBuffer = false;
      continue;
    }

    // The playhead has moved into an unbuffered region, so we might have to
    // clear the buffer.

    if (mediaState.waitingToClearBuffer) {
      // The only reason we should be waiting to clear the buffer is if we're
      // performing an update.
      shaka.log.debug(logPrefix, 'seeked: unbuffered seek: already waiting');
      goog.asserts.assert(mediaState.performingUpdate,
                          'expected performingUpdate to be true');
      continue;
    }

    if (mediaState.performingUpdate) {
      // We are performing an update, so we have to wait until it's finished.
      // onUpdate_() will call clearBuffer_() when the update has
      // finished.
      shaka.log.debug(logPrefix, 'seeked: unbuffered seek: currently updating');
      mediaState.waitingToClearBuffer = true;
      continue;
    }

    if (this.mediaSourceEngine_.bufferStart(type) == null) {
      // Nothing buffered.
      shaka.log.debug(logPrefix, 'seeked: unbuffered seek: nothing buffered');
      if (mediaState.updateTimer == null) {
        // Note: an update cycle stops when we buffer to the end of the
        // presentation or Period, or when we raise an error.
        this.scheduleUpdate_(mediaState, 0);
      }
      continue;
    }

    // An update may be scheduled, but we can just cancel it and clear the
    // buffer right away. Note: clearBuffer_() will schedule the next update.
    shaka.log.debug(logPrefix, 'seeked: unbuffered seek: handling right now');
    this.cancelUpdate_(mediaState);
    this.clearBuffer_(mediaState);
  }
};


/**
 * Initializes the given streams and media states if required.  This will
 * schedule updates for the given types.
 *
 * @param {!Object.<string, shakaExtern.Stream>} streamsByType
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.initStreams_ = function(streamsByType) {
  var MapUtils = shaka.util.MapUtils;
  goog.asserts.assert(this.config_,
      'StreamingEngine configure() must be called before init()!');

  // Determine which Period we must buffer.
  var playheadTime = this.playhead_.getTime();
  var needPeriodIndex = this.findPeriodContainingTime_(playheadTime);

  // Init MediaSourceEngine.
  var typeConfig = MapUtils.map(streamsByType, function(stream) {
    return stream.mimeType +
        (stream.codecs ? '; codecs="' + stream.codecs + '"' : '');
  });

  this.mediaSourceEngine_.init(typeConfig);
  this.setDuration_();

  // Setup the initial set of Streams and then begin each update cycle. After
  // startup completes onUpdate_() will set up the remaining Periods.
  var streams = MapUtils.values(streamsByType);
  return this.setupStreams_(streams).then(function() {
    for (var type in streamsByType) {
      var stream = streamsByType[type];
      if (!this.mediaStates_[type]) {
        this.mediaStates_[type] = {
          stream: stream,
          type: type,
          lastSegmentPeriodIndex: null,
          lastSegmentReference: null,
          drift: null,
          needInitSegment: true,
          needRebuffering: false,
          needPeriodIndex: needPeriodIndex,
          endOfStream: false,
          performingUpdate: false,
          updateTimer: null,
          waitingToClearBuffer: false,
          clearingBuffer: false
        };
      }
      this.scheduleUpdate_(this.mediaStates_[type], 0);
    }
  }.bind(this));
};


/**
 * Sets up the given Period if necessary. Calls onError_() if an error
 * occurs.
 *
 * @param {number} periodIndex The Period's index.
 * @return {!Promise} A Promise which is resolved when the given Period is
 *   setup.
 * @private
 */
shaka.media.StreamingEngine.prototype.setupPeriod_ = function(periodIndex) {
  var Functional = shaka.util.Functional;
  var canSwitchRecord = this.canSwitchPeriod_[periodIndex];
  if (canSwitchRecord) {
    shaka.log.debug(
        '(all) Period ' + periodIndex + ' is being or has been set up');
    goog.asserts.assert(canSwitchRecord.promise, 'promise must not be null');
    return canSwitchRecord.promise;
  }

  shaka.log.debug('(all) setting up Period ' + periodIndex);
  canSwitchRecord = {
    promise: new shaka.util.PublicPromise(),
    resolved: false
  };
  this.canSwitchPeriod_[periodIndex] = canSwitchRecord;

  var streams = this.manifest_.periods[periodIndex].streamSets
      .map(function(streamSet) { return streamSet.streams; })
      .reduce(Functional.collapseArrays, []);

  // Serialize Period set up.
  this.setupPeriodPromise_ = this.setupPeriodPromise_.then(function() {
    if (this.destroyed_) return;
    return this.setupStreams_(streams);
  }.bind(this)).then(function() {
    if (this.destroyed_) return;
    this.canSwitchPeriod_[periodIndex].promise.resolve();
    this.canSwitchPeriod_[periodIndex].resolved = true;
    shaka.log.v1('(all) setup Period ' + periodIndex);
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return;
    this.canSwitchPeriod_[periodIndex].promise.reject();
    delete this.canSwitchPeriod_[periodIndex];
    shaka.log.warning('(all) failed to setup Period ' + periodIndex);
    this.onError_(error);
    // Don't stop other Periods from being set up.
  }.bind(this));

  return canSwitchRecord.promise;
};


/**
 * Sets up the given Streams if necessary. Does NOT call onError_() if an
 * error occurs.
 *
 * @param {!Array.<!shakaExtern.Stream>} streams
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.setupStreams_ = function(streams) {
  // Parallelize Stream set up.
  var async = [];

  for (var i = 0; i < streams.length; ++i) {
    var stream = streams[i];
    var canSwitchRecord = this.canSwitchStream_[stream.id];

    if (canSwitchRecord) {
      shaka.log.debug(
          '(all) Stream ' + stream.id + ' is being or has been set up');
      async.push(canSwitchRecord.promise);
    } else {
      shaka.log.v1('(all) setting up Stream ' + stream.id);
      this.canSwitchStream_[stream.id] = {
        promise: new shaka.util.PublicPromise(),
        resolved: false
      };
      async.push(stream.createSegmentIndex());
    }
  }

  return Promise.all(async).then(function() {
    if (this.destroyed_) return;
    for (var i = 0; i < streams.length; ++i) {
      var stream = streams[i];
      var canSwitchRecord = this.canSwitchStream_[stream.id];
      if (!canSwitchRecord.resolved) {
        canSwitchRecord.promise.resolve();
        canSwitchRecord.resolved = true;
        shaka.log.v1('(all) setup Stream ' + stream.id);
      }
    }
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return;
    this.canSwitchStream_[stream.id].promise.reject();
    delete this.canSwitchStream_[stream.id];
    return Promise.reject(error);
  }.bind(this));
};


/**
 * Sets the MediaSource's duration.
 * @private
 */
shaka.media.StreamingEngine.prototype.setDuration_ = function() {
  var duration = this.manifest_.presentationTimeline.getDuration();
  if (duration < Number.POSITIVE_INFINITY) {
    this.mediaSourceEngine_.setDuration(duration);
  } else {
    // Not all platforms support infinite durations, so set a finite duration
    // so we can append segments and so the user agent can seek.
    this.mediaSourceEngine_.setDuration(Math.pow(2, 32));
  }
};


/**
 * Called when |mediaState|'s update timer has expired.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @private
 */
shaka.media.StreamingEngine.prototype.onUpdate_ = function(mediaState) {
  var MapUtils = shaka.util.MapUtils;
  if (this.destroyed_) return;

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // Sanity check.
  goog.asserts.assert(
      !mediaState.performingUpdate && (mediaState.updateTimer != null),
      logPrefix + ' unexpected call to onUpdate_()');
  if (mediaState.performingUpdate || (mediaState.updateTimer == null)) return;

  goog.asserts.assert(
      !mediaState.clearingBuffer,
      logPrefix + ' onUpdate_() should not be called when clearing the buffer');
  if (mediaState.clearingBuffer) return;

  mediaState.updateTimer = null;

  // Handle pending buffer clears.
  if (mediaState.waitingToClearBuffer) {
    // Note: clearBuffer_() will schedule the next update.
    shaka.log.debug(logPrefix, 'skipping update and clearing the buffer');
    this.clearBuffer_(mediaState);
    return;
  }

  // Update the MediaState.
  try {
    var delay = this.update_(mediaState);
    if (delay != null) {
      this.scheduleUpdate_(mediaState, delay);
    }
  } catch (error) {
    this.onError_(error);
    return;
  }

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  var mediaStates = MapUtils.values(this.mediaStates_);

  // Handle startup and re- buffering.
  this.playhead_.setBuffering(
      mediaStates.some(function(ms) { return ms.needRebuffering; }));

  // Check if we've buffered to the end of the Period.
  this.handlePeriodTransition_(mediaState);

  // Check if we've buffered to the end of the presentation.
  if (mediaStates.every(function(ms) { return ms.endOfStream; })) {
    shaka.log.v1(logPrefix, 'calling endOfStream()...');
    this.mediaSourceEngine_.endOfStream();
  }
};


/**
 * Updates the given MediaState.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @return {?number} The number of seconds to wait until updating again or
 *   null if another update does not need to be scheduled.
 * @throws {!shaka.util.Error} if an error occurs.
 * @private
 */
shaka.media.StreamingEngine.prototype.update_ = function(mediaState) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // Compute how far we've buffered ahead of the playhead.
  var playheadTime = this.playhead_.getTime();
  var bufferedAhead = this.mediaSourceEngine_.bufferedAheadOf(
      mediaState.type, playheadTime, 0.1);

  goog.asserts.assert(this.manifest_, 'manifest_ should not be null');
  goog.asserts.assert(this.config_, 'config_ should not be null');
  var rebufferingGoal = shaka.media.StreamingEngine.getRebufferingGoal(
      this.manifest_, this.config_);

  shaka.log.v2(logPrefix,
               'update_:',
               'playheadTime=' + playheadTime,
               'bufferedAhead=' + bufferedAhead);

  // If we've buffered to the buffering goal then schedule an update.
  var bufferingGoal = Math.max(rebufferingGoal, this.config_.bufferingGoal);
  if (bufferedAhead >= bufferingGoal) {
    shaka.log.v2(logPrefix, 'buffering goal met');
    mediaState.needRebuffering = false;
    // Do not try to schedule the next update.  Just poll twice every second.
    // The playback rate can change at any time, so any prediction we make now
    // could be terribly invalid soon.
    return 0.5;
  }

  // Get the next timestamp we need.
  var bufferEnd = this.mediaSourceEngine_.bufferEnd(mediaState.type);
  var timeNeeded = this.getTimeNeeded_(
      mediaState, playheadTime, bufferedAhead, bufferEnd);
  if (timeNeeded == null)
    return null;
  shaka.log.v2(logPrefix, 'timeNeeded=' + timeNeeded);

  var timeline = this.manifest_.presentationTimeline;

  // Check if we've buffered to the end of the presentation.
  if (timeNeeded >= timeline.getDuration()) {
    // We shouldn't rebuffer if the playhead is close to the end of the
    // presentation.
    shaka.log.debug(logPrefix, 'buffered to end of presentation');
    mediaState.needRebuffering = false;
    mediaState.endOfStream = true;
    return null;
  }
  mediaState.endOfStream = false;

  // Handle startup and re- buffering state.
  if ((!this.startupComplete_ && bufferedAhead < rebufferingGoal) ||
      (bufferedAhead <= 1)) {
    shaka.log.v1(logPrefix, 'need startup or re- buffering');
    mediaState.needRebuffering = true;
  } else if (bufferedAhead >= rebufferingGoal) {
    mediaState.needRebuffering = false;
  }

  var currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);

  // Check if we've buffered to the end of the Period. This should be done
  // before checking segment availability because the new Period may become
  // available once it's switched to. Note that we don't use the non-existence
  // of SegmentReferences as an indicator to determine Period boundaries
  // because SegmentIndexes can provide SegmentReferences outside its Period.
  var needPeriodIndex = this.findPeriodContainingTime_(timeNeeded);
  if (needPeriodIndex != currentPeriodIndex) {
    shaka.log.debug(logPrefix,
                    'need Period ' + needPeriodIndex,
                    'playheadTime=' + playheadTime,
                    'timeNeeded=' + timeNeeded,
                    'currentPeriodIndex=' + currentPeriodIndex);
    mediaState.needPeriodIndex = needPeriodIndex;
    return null;
  }

  // Check segment availability.
  var availabilityStart = timeline.getSegmentAvailabilityStart();
  var availabilityEnd = timeline.getSegmentAvailabilityEnd();
  if ((timeNeeded < availabilityStart) || (timeNeeded > availabilityEnd)) {
    // The next segment is not available. In the usual case, this occurs when
    // we've buffered to the live-edge of a live presentation; in the
    // degenerate case, this occurs if the playhead is forced outside the
    // segment availability window; either way try another update in a second.
    shaka.log.v1(logPrefix,
                 'next segment is outside segment availability window:',
                 'playheadTime=' + playheadTime,
                 'timeNeeded=' + timeNeeded,
                 'availabilityStart=' + availabilityStart,
                 'availabilityEnd=' + availabilityEnd);
    return 1;
  }

  var reference = this.getSegmentReference_(
      mediaState, playheadTime, currentPeriodIndex);
  this.fetchAndAppend_(mediaState, playheadTime, currentPeriodIndex, reference);

  return null;
};


/**
 * Gets the next timestamp needed. Returns the playhead's position if the
 * buffer is empty; otherwise, returns the time at which the last segment
 * appended ends.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @param {number} bufferedAhead
 * @param {?number} bufferEnd
 * @return {?number} The next timestamp needed or null if the playhead is is in
 *   an unbuffered region behind the buffer.
 * @throws {!shaka.util.Error} if the buffer is inconsistent with our
 *   expectations.
 * @private
 */
shaka.media.StreamingEngine.prototype.getTimeNeeded_ = function(
    mediaState, playheadTime, bufferedAhead, bufferEnd) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // Get the next timestamp we need. We must use |lastSegmentReference|
  // to determine this and not the actual buffer for two reasons:
  //   1. actual segments end slightly before their advertised end times, so
  //      the next timestamp we need is actually larger than |bufferEnd|; and
  //   2. there may be drift, but we need drift free times when comparing times
  //      against presentation and Period boundaries.

  if (bufferedAhead == 0) {
    // The playhead is in an unbuffered region.
    if (bufferEnd == null) {
      // The buffer is empty.
      if (mediaState.lastSegmentPeriodIndex != null ||
          mediaState.lastSegmentReference) {
        shaka.log.error(logPrefix, 'lastSegmentReference should be null');
        throw new shaka.util.Error(
            shaka.util.Error.Category.STREAMING,
            shaka.util.Error.Code.INCONSISTENT_BUFFER_STATE,
            mediaState.type);
      }
      return playheadTime;
    } else if (bufferEnd > playheadTime) {
      // The user agent seeked backwards but seeked() was not called or has not
      // been called yet (because it's a race). Assume seeked() will be called.
      shaka.log.debug(logPrefix,
                      'playhead in unbuffered region (behind buffer):',
                      'playheadTime=' + playheadTime,
                      'bufferEnd=' + bufferEnd);
      return null;
    } else {
      // We may find ourseleves in this state for three reasons:
      //   1. the playhead is exactly at the end of the buffer;
      //   2. the browser allowed the playhead to proceed past the end of
      //      the buffer (either under normal or accelerated playback rates); or
      //   3. the user agent seeked forwards but seeked() was not called or has
      //      not been called yet (because it's a race).
      // For cases 1 and 2 we'll end up buffering the next segment we want
      // anyways, and for case 3 we'll end up buffering the next segment and
      // then just removing it and buffering it again (note that this case
      // should be rare).
      shaka.log.debug(logPrefix,
                      'playhead in unbuffered region (ahead of buffer):',
                      'playheadTime=' + playheadTime,
                      'bufferEnd=' + bufferEnd);
    }
  }

  // The buffer is non-empty.
  if (mediaState.lastSegmentPeriodIndex == null ||
      mediaState.lastSegmentReference == null) {
    shaka.log.error(logPrefix, 'lastSegmentReference should not be null');
    throw new shaka.util.Error(
        shaka.util.Error.Category.STREAMING,
        shaka.util.Error.Code.INCONSISTENT_BUFFER_STATE,
        mediaState.type);
  }

  return this.manifest_.periods[mediaState.lastSegmentPeriodIndex].startTime +
         mediaState.lastSegmentReference.endTime;
};


/**
 * Gets the SegmentReference of the next segment needed.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @param {number} currentPeriodIndex
 * @return {!shaka.media.SegmentReference} The SegmentReference of the
 *   next segment needed.
 * @throws {!shaka.util.Error} If the next segment does not exist.
 * @private
 */
shaka.media.StreamingEngine.prototype.getSegmentReference_ = function(
    mediaState, playheadTime, currentPeriodIndex) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  var position;
  if (!mediaState.lastSegmentReference) {
    shaka.log.v1(logPrefix, 'next position unknown: nothing buffered');
    position = this.lookupSegmentPosition_(
        mediaState, playheadTime, currentPeriodIndex);
  } else {
    if (currentPeriodIndex == mediaState.lastSegmentPeriodIndex) {
      // Something is buffered from the same Period.
      position = mediaState.lastSegmentReference.position + 1;
      shaka.log.v2(logPrefix, 'using next position:', 'position=' + position);
    } else {
      // Something is buffered from another Period.
      shaka.log.v1(logPrefix, 'next position unknown: another Period buffered');
      goog.asserts.assert(mediaState.lastSegmentPeriodIndex != null,
                          'lastSegmentPeriodIndex should not be null!');
      var lastPeriodStart =
          this.manifest_.periods[mediaState.lastSegmentPeriodIndex].startTime;
      position = this.lookupSegmentPosition_(
          mediaState,
          lastPeriodStart + mediaState.lastSegmentReference.endTime,
          currentPeriodIndex);
    }
  }

  var reference = mediaState.stream.getSegmentReference(position);
  if (!reference) {
    shaka.log.error(logPrefix,
                    'invalid segment index: SegmentReference does not exist:',
                    'currentPeriodIndex=' + currentPeriodIndex,
                    'position=' + position);
    throw new shaka.util.Error(
        shaka.util.Error.Category.STREAMING,
        shaka.util.Error.Code.INVALID_SEGMENT_INDEX,
        mediaState.type,
        currentPeriodIndex,
        position);
  }

  return reference;
};


/**
 * Looks up the position of the next segment needed.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} time relative to presentation timeline
 * @param {number} currentPeriodIndex
 * @return {number}
 * @throws {!shaka.util.Error} If the next segment does not exist.
 * @private
 */
shaka.media.StreamingEngine.prototype.lookupSegmentPosition_ = function(
    mediaState, time, currentPeriodIndex) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var currentPeriod = this.manifest_.periods[currentPeriodIndex];

  shaka.log.v1(logPrefix,
               'looking up next position:',
               'time=' + time,
               'currentPeriod.startTime=' + currentPeriod.startTime,
               'mediaState.drift=' + mediaState.drift);

  var lookupTime = time - currentPeriod.startTime - mediaState.drift;
  lookupTime = Math.max(lookupTime, 0);
  var position = mediaState.stream.findSegmentPosition(lookupTime);

  if (position == null) {
    shaka.log.warning(logPrefix,
                      'next segment does not exist:',
                      'lookupTime=' + lookupTime,
                      'time=' + time,
                      'currentPeriod.startTime=' + currentPeriod.startTime,
                      'mediaState.drift=' + mediaState.drift);
    throw new shaka.util.Error(
        shaka.util.Error.Category.STREAMING,
        shaka.util.Error.Code.SEGMENT_DOES_NOT_EXIST,
        mediaState.type,
        currentPeriodIndex,
        time);
  }

  return position;
};


/**
 * Fetches and appends the given segment; sets up the given MediaState's
 * associated SourceBuffer and evicts segments if either are required
 * beforehand. Schedules another update after completing successfully.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @param {number} currentPeriodIndex The index of the current Period.
 * @param {!shaka.media.SegmentReference} reference
 * @private
 */
shaka.media.StreamingEngine.prototype.fetchAndAppend_ = function(
    mediaState, playheadTime, currentPeriodIndex, reference) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var currentPeriod = this.manifest_.periods[currentPeriodIndex];

  shaka.log.v1(logPrefix,
               'fetchAndAppend_:',
               'playheadTime=' + playheadTime,
               'currentPeriod.startTime=' + currentPeriod.startTime,
               'mediaState.drift=' + mediaState.drift,
               'reference.position=' + reference.position,
               'reference.startTime=' + reference.startTime,
               'reference.endTime=' + reference.endTime);

  // Subtlety: The playhead may move while asynchronous update operations are
  // in progress, so we should avoid calling playhead_.getTime() in any
  // callbacks. Furthermore, switch() may be called at any time, so we should
  // also avoid using mediaState.stream or mediaState.needInitSegment in any
  // callbacks too.

  // Compute the append window end.
  var followingPeriod = this.manifest_.periods[currentPeriodIndex + 1];
  var appendWindowEnd = null;
  if (followingPeriod) {
    appendWindowEnd = followingPeriod.startTime;
  } else {
    appendWindowEnd = this.manifest_.presentationTimeline.getDuration();
  }
  goog.asserts.assert(
      (appendWindowEnd == null) || (reference.startTime <= appendWindowEnd),
      logPrefix + ' segment should start before append window end');

  var initSourceBuffer =
      this.initSourceBuffer_(mediaState, currentPeriodIndex, appendWindowEnd);

  mediaState.performingUpdate = true;

  // We may set |needInitSegment| to true in switch(), so set it to false here,
  // since we want it to remain true if switch() is called.
  mediaState.needInitSegment = false;

  shaka.log.v2(logPrefix, 'fetching segment');
  var fetchSegment = this.fetch_(reference);

  Promise.all([initSourceBuffer, fetchSegment]).then(function(results) {
    if (this.destroyed_) return;
    return this.append_(mediaState,
                        playheadTime,
                        currentPeriodIndex,
                        reference,
                        appendWindowEnd,
                        results[1]);
  }.bind(this)).then(function() {
    if (this.destroyed_) return;
    return this.handleDrift_(mediaState,
                             playheadTime,
                             currentPeriodIndex,
                             reference);
  }.bind(this)).then(function() {
    mediaState.performingUpdate = false;

    // Update right away.
    this.scheduleUpdate_(mediaState, 0);

    // Subtlety: handleStartup_() calls onStartupComplete_() which may call
    // switch() or seeked(), so we must schedule an update beforehand so
    // |updateTimer| is set.
    if (!this.destroyed_)
      this.handleStartup_(mediaState);

    shaka.log.v1(logPrefix, 'finished fetch and append');
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return;
    this.onError_(error);
  }.bind(this));
};


/**
 * Sets the given MediaState's associated SourceBuffer's timestamp offset and
 * init segment if either are required. If an error occurs then neither the
 * timestamp offset or init segment are unset, since another call to switch()
 * will end up superseding them.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} currentPeriodIndex
 * @param {?number} appendWindowEnd
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.initSourceBuffer_ = function(
    mediaState, currentPeriodIndex, appendWindowEnd) {
  if (!mediaState.needInitSegment)
    return Promise.resolve();

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var currentPeriod = this.manifest_.periods[currentPeriodIndex];

  // If we need an init segment then the Stream switched, so we've either
  // changed bitrates, Periods, or both. If we've changed Periods then we must
  // set a new timestamp offset and append window end. Note that by setting
  // these values here, we avoid having to co-ordinate ongoing updates, which
  // we would have to do if we instead set them in switch().
  var timestampOffset =
      currentPeriod.startTime - mediaState.stream.presentationTimeOffset;
  shaka.log.v1(logPrefix, 'setting timestamp offset to ' + timestampOffset);
  var setTimestampOffset = this.mediaSourceEngine_.setTimestampOffset(
      mediaState.type, timestampOffset);

  if (appendWindowEnd != null) {
    shaka.log.v1(logPrefix, 'setting append window end to ' + appendWindowEnd);
    var setAppendWindowEnd = this.mediaSourceEngine_.setAppendWindowEnd(
        mediaState.type, appendWindowEnd);
  } else {
    setAppendWindowEnd = Promise.resolve();
  }

  if (!mediaState.stream.initSegmentReference) {
    // The Stream is self initializing.
    return Promise.all([setTimestampOffset, setAppendWindowEnd]);
  }

  shaka.log.v1(logPrefix, 'fetching init segment');
  var fetchInit = this.fetch_(mediaState.stream.initSegmentReference);
  var appendInit = fetchInit.then(function(initSegment) {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending init segment');

    return this.mediaSourceEngine_.appendBuffer(
        mediaState.type, initSegment, null /* startTime */, null /* endTime */);
  }.bind(this));

  return Promise.all([setTimestampOffset, setAppendWindowEnd, appendInit]);
};


/**
 * Appends the given segment, evicts segments if required to append, and
 * computes drift if required.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @param {number} currentPeriodIndex
 * @param {!shaka.media.SegmentReference} reference
 * @param {?number} appendWindowEnd
 * @param {!ArrayBuffer} segment
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.append_ = function(
    mediaState, playheadTime, currentPeriodIndex, reference,
    appendWindowEnd, segment) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  return this.evict_(mediaState, playheadTime).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending media segment');

    return this.mediaSourceEngine_.appendBuffer(
        mediaState.type, segment, reference.startTime, reference.endTime);
  }.bind(this)).then(function() {
    if (this.destroyed_) return;
    shaka.log.v2(logPrefix, 'appended media segment');

    mediaState.lastSegmentPeriodIndex = currentPeriodIndex;
    mediaState.lastSegmentReference = reference;

    return Promise.resolve();
  }.bind(this));
};


/**
 * Evicts media to meet the max buffer behind limit.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.evict_ = function(
    mediaState, playheadTime) {
  var MapUtils = shaka.util.MapUtils;
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  shaka.log.v2(logPrefix, 'checking buffer length');

  // Get the earliest start time.
  goog.asserts.assert(this.mediaStates_, 'Must be initialized');
  var mediaStates = MapUtils.values(this.mediaStates_);
  var times = mediaStates.map(function(state) {
    return this.mediaSourceEngine_.bufferStart(state.type);
  }.bind(this)).filter(shaka.util.Functional.isNotNull);

  if (times.length == 0) {
    shaka.log.v2(logPrefix,
                 'buffer behind okay because nothing buffered:',
                 'playheadTime=' + playheadTime,
                 'bufferBehind=' + this.config_.bufferBehind);
    return Promise.resolve();
  }

  var startTime = Math.min.apply(Math, times);

  goog.asserts.assert(startTime != Number.POSITIVE_INFINITY,
                      'startTime should not be infinity');
  var bufferedBehind = playheadTime - startTime;

  var overflow = bufferedBehind - this.config_.bufferBehind;
  if (overflow <= 0) {
    shaka.log.v2(logPrefix,
                 'buffer behind okay:',
                 'playheadTime=' + playheadTime,
                 'bufferedBehind=' + bufferedBehind,
                 'bufferBehind=' + this.config_.bufferBehind,
                 'underflow=' + (-overflow));
    return Promise.resolve();
  }

  shaka.log.v1(logPrefix,
               'buffer behind too large:',
               'playheadTime=' + playheadTime,
               'bufferedBehind=' + bufferedBehind,
               'bufferBehind=' + this.config_.bufferBehind,
               'overflow=' + overflow);

  var async = mediaStates.map(function(state) {
    return this.mediaSourceEngine_.remove(
        state.type, startTime, startTime + overflow);
  }.bind(this));

  return Promise.all(async).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'evicted ' + overflow + ' seconds');
  }.bind(this));
};


/**
 * Handles drift.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @param {number} currentPeriodIndex
 * @param {!shaka.media.SegmentReference} reference
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.handleDrift_ = function(
    mediaState, playheadTime, currentPeriodIndex, reference) {
  if (mediaState.drift != null)
    return Promise.resolve();

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var currentPeriod = this.manifest_.periods[currentPeriodIndex];

  var bufferStart = this.mediaSourceEngine_.bufferStart(mediaState.type);
  if (bufferStart == null) {
    // The segment did not contain any actual media content.
    shaka.log.error(logPrefix, 'bad segment');
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.STREAMING,
        shaka.util.Error.Code.BAD_SEGMENT,
        mediaState.type));
  }

  mediaState.drift =
      bufferStart - reference.startTime - currentPeriod.startTime;
  shaka.log.debug(logPrefix, 'drift=', mediaState.drift);

  // If there is positive drift or large negative drift then the playhead
  // may not be within the segment we just appended.
  var bufferedAhead = this.mediaSourceEngine_.bufferedAheadOf(
      mediaState.type, playheadTime);
  if (bufferedAhead == 0) {
    // Clear the buffer and try again.
    shaka.log.debug(logPrefix,
                    'playhead outside first segment:',
                    'bufferStart=' + bufferStart);
    mediaState.waitingToClearBuffer = true;
  }

  return Promise.resolve();
};


/**
 * Sets up all known Periods when startup completes; otherwise, does nothing.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState The last
 *   MediaState updated.
 * @private
 */
shaka.media.StreamingEngine.prototype.handleStartup_ = function(mediaState) {
  var Functional = shaka.util.Functional;
  var MapUtils = shaka.util.MapUtils;
  if (this.startupComplete_)
    return;

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  var mediaStates = MapUtils.values(this.mediaStates_);
  this.startupComplete_ = mediaStates.every(function(ms) {
    // Startup completes once we have buffered at least one segment from each
    // MediaState, have handled positive or large negative drift, and are not
    // clearing the buffer. Hence, the following three cases:
    //   1. if |drift| is null then we never appended anything;
    //   2. if |drift| is non-null but we're clearing the buffer then either
    //      there was positive or large negative drift, or the user agent
    //      seeked; and
    //   3. if |drift| is non-null and we're not clearing the buffer but the
    //      buffer is empty then there was positive or large negative
    //      drift but we never recovered.
    return ms.drift != null &&
           !ms.waitingToClearBuffer &&
           !ms.clearingBuffer &&
           ms.lastSegmentReference;
  });

  if (!this.startupComplete_)
    return;

  shaka.log.debug(logPrefix, 'startup complete');

  var currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);
  goog.asserts.assert(
      mediaStates.every(function(ms) {
        return ms.needPeriodIndex == currentPeriodIndex;
      }),
      logPrefix + ' expected all MediaStates to need same Period');

  // Setup the current Period if necessary, which is likely since the current
  // Period is probably the initial one.
  if (!this.canSwitchPeriod_[currentPeriodIndex]) {
    this.setupPeriod_(currentPeriodIndex).then(function() {
      shaka.log.v1(logPrefix, 'calling onCanSwitch_()...');
      this.onCanSwitch_();
    }.bind(this)).catch(Functional.noop);
  }

  // Now setup all known Periods.
  for (var i = 0; i < this.manifest_.periods.length; ++i) {
    this.setupPeriod_(i).catch(Functional.noop);
  }

  if (this.onStartupComplete_) {
    shaka.log.v1(logPrefix, 'calling onStartupComplete_()...');
    this.onStartupComplete_();
  }
};


/**
 * Calls onChooseStreams_() when necessary.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState The last
 *   MediaState updated.
 * @private
 */
shaka.media.StreamingEngine.prototype.handlePeriodTransition_ = function(
    mediaState) {
  var Functional = shaka.util.Functional;
  var MapUtils = shaka.util.MapUtils;
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  var currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);
  if (mediaState.needPeriodIndex == currentPeriodIndex)
    return;

  var needPeriodIndex = mediaState.needPeriodIndex;

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  var mediaStates = MapUtils.values(this.mediaStates_);

  // Only call onChooseStreams_() when all MediaStates need the same Period.
  var needSamePeriod = mediaStates.every(function(ms) {
    return ms.needPeriodIndex == needPeriodIndex;
  });
  if (!needSamePeriod) {
    shaka.log.debug(
        logPrefix, 'not all MediaStates need Period ' + needPeriodIndex);
    return;
  }

  // Only call onChooseStreams_() once per Period transition.
  var allAreIdle = mediaStates.every(shaka.media.StreamingEngine.isIdle_);
  if (!allAreIdle) {
    shaka.log.debug(
        logPrefix,
        'all MediaStates need Period ' + needPeriodIndex + ', ' +
        'but not all MediaStates are idle');
    return;
  }

  shaka.log.debug(logPrefix, 'all need Period ' + needPeriodIndex);

  // Ensure the Period which we need to buffer is setup and then call
  // onChooseStreams_().
  this.setupPeriod_(needPeriodIndex).then(function() {
    if (this.destroyed_) return;

    var needPeriod = this.manifest_.periods[needPeriodIndex];

    shaka.log.v1(logPrefix, 'calling onChooseStreams_()...');
    var streamsByType = this.onChooseStreams_(needPeriod);

    // Vet |streamsByType| before switching.
    for (var type in this.mediaStates_) {
      if (streamsByType[type]) continue;

      shaka.log.error(logPrefix,
                      'invalid Streams chosen: missing ' + type + ' Stream');
      this.onError_(new shaka.util.Error(
          shaka.util.Error.Category.STREAMING,
          shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
      return;
    }

    for (var type in streamsByType) {
      if (this.mediaStates_[type]) continue;

      shaka.log.error(logPrefix,
                      'invalid Streams chosen: unusable ' + type + ' Stream');
      this.onError_(new shaka.util.Error(
          shaka.util.Error.Category.STREAMING,
          shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
      return;
    }

    for (var type in this.mediaStates_) {
      var stream = streamsByType[type];
      this.switch(type, stream);

      var mediaState = this.mediaStates_[type];
      if (shaka.media.StreamingEngine.isIdle_(mediaState)) {
        this.scheduleUpdate_(mediaState, 0);
      } else {
        // TODO: Write unit tests to cover this case.
        shaka.log.debug(logPrefix,
                        'seeked() was called while waiting for setupPeriod_()');
      }
    }

    // We've already set up the Period so call onCanSwitch_() right now.
    shaka.log.v1(logPrefix, 'calling onCanSwitch_()...');
    this.onCanSwitch_();
  }.bind(this)).catch(Functional.noop);
};


/**
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @return {boolean} True if the given MediaState is idle; otherwise, return
 *   false.
 * @private
 */
shaka.media.StreamingEngine.isIdle_ = function(mediaState) {
  return !mediaState.performingUpdate &&
         (mediaState.updateTimer == null) &&
         !mediaState.waitingToClearBuffer &&
         !mediaState.clearingBuffer;
};


/**
 * @param {number} time The time, in seconds, relative to the start of the
 *   presentation.
 * @return {number} The index of the Period which starts after |time|
 * @private
 */
shaka.media.StreamingEngine.prototype.findPeriodContainingTime_ = function(
    time) {
  for (var i = this.manifest_.periods.length - 1; i > 0; --i) {
    var period = this.manifest_.periods[i];
    if (time >= period.startTime)
      return i;
  }
  return 0;
};


/**
 * @param {!shakaExtern.Stream} stream
 * @return {number} The index of the Period which contains |stream|, or -1 if
 *   no Period contains |stream|.
 * @private
 */
shaka.media.StreamingEngine.prototype.findPeriodContainingStream_ = function(
    stream) {
  for (var i = 0; i < this.manifest_.periods.length; ++i) {
    var period = this.manifest_.periods[i];
    for (var j = 0; j < period.streamSets.length; ++j) {
      var streamSet = period.streamSets[j];
      var index = streamSet.streams.indexOf(stream);
      if (index >= 0)
        return i;
    }
  }
  return -1;
};


/**
 * Fetches the given segment.
 *
 * @param {(!shaka.media.InitSegmentReference|!shaka.media.SegmentReference)}
 *   reference
 *
 * @return {!Promise.<!ArrayBuffer>}
 * @private
 */
shaka.media.StreamingEngine.prototype.fetch_ = function(reference) {
  var requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  var request = shaka.net.NetworkingEngine.makeRequest(
      reference.uris, this.config_.retryParameters);

  // Set Range header. Note that some web servers don't accept Range headers,
  // so don't set one if it's not strictly required.
  if ((reference.startByte != 0) || (reference.endByte != null)) {
    var range = 'bytes=' + reference.startByte + '-';
    if (reference.endByte != null) range += reference.endByte;
    request.headers['Range'] = range;
  }

  shaka.log.v2('fetching: reference=' + reference);
  var p = this.netEngine_.request(requestType, request);
  return p.then(function(response) {
    return response.data;
  });
};


/**
 * Clears the buffer and schedules another update.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @private
 */
shaka.media.StreamingEngine.prototype.clearBuffer_ = function(
    mediaState) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  goog.asserts.assert(
      !mediaState.performingUpdate && (mediaState.updateTimer == null),
      logPrefix + ' unexpected call to clearBuffer_()');

  mediaState.waitingToClearBuffer = false;
  mediaState.clearingBuffer = true;

  shaka.log.debug(logPrefix, 'clearing buffer');
  this.mediaSourceEngine_.clear(mediaState.type).then(function() {
    if (this.destroyed_) return;
    shaka.log.debug(logPrefix, 'cleared buffer');
    mediaState.lastSegmentPeriodIndex = null;
    mediaState.lastSegmentReference = null;
    mediaState.clearingBuffer = false;
    this.scheduleUpdate_(mediaState, 0);
  }.bind(this));
};


/**
 * Schedules |mediaState|'s next update.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} delay The delay in seconds.
 * @private
 */
shaka.media.StreamingEngine.prototype.scheduleUpdate_ = function(
    mediaState, delay) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  shaka.log.v2(logPrefix, 'updating in ' + delay + ' seconds');
  goog.asserts.assert(mediaState.updateTimer == null,
                      logPrefix + ' did not expect update to be scheduled');
  mediaState.updateTimer = window.setTimeout(
      this.onUpdate_.bind(this, mediaState), delay * 1000);
};


/**
 * Cancels |mediaState|'s next update if one exists.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @private
 */
shaka.media.StreamingEngine.prototype.cancelUpdate_ = function(mediaState) {
  if (mediaState.updateTimer != null) {
    window.clearTimeout(mediaState.updateTimer);
    mediaState.updateTimer = null;
  }
};


/**
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @return {string} A log prefix of the form ($CONTENT_TYPE:$STREAM_ID), e.g.,
 *   "(audio:5)" or "(video:hd)".
 * @private
 */
shaka.media.StreamingEngine.logPrefix_ = function(mediaState) {
  return '(' + mediaState.type + ':' + mediaState.stream.id + ')';
};

