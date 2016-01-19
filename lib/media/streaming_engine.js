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

goog.provide('shaka.media.StreamingEngine');

goog.require('shaka.asserts');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.Playhead');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.IDestroyable');



/**
 * Creates a StreamingEngine.
 *
 * The StreamingEngine is responsible for creating SegmentIndexes (in the
 * Manifest), and for downloading segments and passing them to the
 * MediaSourceEngine. It manages audio, video, and text streams simultaneously
 * and provides an interface to switch streams at the Stream level, i.e., it
 * does not handle switching to alternate StreamSets or Periods directly.
 *
 * The StreamingEngine notifies its owner when Streams within a Period can be
 * switched to and when another Period must be buffered, so its owner may
 * switch to new Streams within that Period.
 *
 * The SegmentIndexes behind the Manifest may change at any time and the
 * StreamingEngine does not care about these changes; however, is must be
 * notified of new Periods, so that it can create the associated
 * SegmentIndexes.
 *
 * Before anything else, the owner must call init() with an initial set of
 * Streams, in particular, one Stream for each content type (these Streams
 * should be from the same Period, but the StreamingEngine doesn't actually
 * care). The owner must then call newPeriod() each time a new Period is added
 * to the Manifest and seeked() each time the playhead moves to a new location
 * within the presentation timeline (the owner may forego calling seeked() when
 * the playhead moves to an invalid location).
 *
 * When the StreamingEngine calls onCanSwitch(p), the owner may call switch()
 * with any Stream within Period p; when the StreamingEngine calls
 * onBufferNewPeriod(p), the owner should call switch() with a Stream from
 * Period p for each content type. Note: the StreamingEngine may call
 * onBufferNewPeriod(p) before onCanSwitch(p), if this occurs, the owner must
 * still wait to call switch() until onCanSwitch(p) is called.
 *
 * @param {shaka.media.StreamingEngine.Config} config The initial
 *     configuration.
 * @param {!shaka.media.Playhead} playhead The Playhead. The caller retains
 *     ownership.
 * @param {!shaka.media.MediaSourceEngine} mediaSourceEngine The
 *     MediaSourceEngine. The caller retains ownership.
 * @param {!shaka.net.NetworkingEngine} netEngine
 * @param {shakaExtern.Manifest} manifest
 * @param {function(!shakaExtern.Period)} onCanSwitch Called when Streams
 *     within the given Period can be switched to.
 * @param {function(!shakaExtern.Period)} onBufferNewPeriod Called when
 *     the given Period should begin buffering (for all content types).
 * @param {function(!shaka.util.Error)} onError Called when an error occurs.
 * @param {function()=} opt_onInitialStreamsSetup Optional callback which
 *     is called when the initial set of Streams have been setup. Intended
 *     to be used by tests.
 * @param {function()=} opt_onStartupComplete Optional callback which
 *     is called when startup has completed. Intended to be used by tests.
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.StreamingEngine = function(
    config, playhead, mediaSourceEngine, netEngine, manifest,
    onCanSwitch, onBufferNewPeriod, onError,
    opt_onInitialStreamsSetup, opt_onStartupComplete) {
  /** @private {shaka.media.Playhead} */
  this.playhead_ = playhead;

  /** @private {shaka.media.MediaSourceEngine} */
  this.mediaSourceEngine_ = mediaSourceEngine;

  /** @private {shaka.net.NetworkingEngine} */
  this.netEngine_ = netEngine;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = manifest;

  /** @private {?function(!shakaExtern.Period)} */
  this.onCanSwitch_ = onCanSwitch;

  /** @private {?function(!shakaExtern.Period)} */
  this.onBufferNewPeriod_ = onBufferNewPeriod;

  /** @private {?function(!shaka.util.Error)} */
  this.onError_ = onError;

  /** @private {?function()} */
  this.onInitialStreamsSetup_ = opt_onInitialStreamsSetup || null;

  /** @private {?function()} */
  this.onStartupComplete_ = opt_onStartupComplete || null;

  /** @private {shaka.media.StreamingEngine.Config} */
  this.config_ = config;

  /**
   * Maps a Stream's ID to a boolean value which indicates if the Stream is
   * ready to be used (i.e., if its SegmentIndex has been created).
   *
   * @private {Object.<number, boolean>}
   */
  this.isStreamReady_ = {};

  /**
   * Maps a content type, e.g., 'audio', 'video', or 'text', to a MediaState.
   *
   * @private {Object.<string, !shaka.media.StreamingEngine.MediaState_>}
   */
  this.mediaStates_ = {};

  /**
   * Set to true once one segment from each of the initial set of Streams
   * [i.e., those passed to init()] has been buffered.
   *
   * @private {boolean}
   */
  this.startupComplete_ = false;

  /** @private {boolean} */
  this.destroyed_ = false;
};


/**
 * @typedef {{
 *   rebufferingGoal: number,
 *   bufferingGoal: number,
 *   retryParameters: shakaExtern.RetryParameters
 * }}
 *
 * @description
 * The StreamingEngine's configuration options.
 *
 * @property {number} rebufferingGoal
 *   The minimum number of seconds of content that must be buffered before
 *   playback can begin at startup or can continue after entering a
 *   rebuffering state.
 * @property {number} bufferingGoal
 *   The number of seconds of content that the StreamingEngine will attempt to
 *   keep in buffer at all times (for each content type). This value must be
 *   greater than or equal to the rebuffering goal.
 * @property {shakaExtern.RetryParameters} retryParameters
 *   The retry parameters for segment requests.
 */
shaka.media.StreamingEngine.Config;


/**
 * @typedef {{
 *   type: string,
 *   stream: shakaExtern.Stream,
 *   segmentPosition: ?number,
 *   drift: ?number,
 *   needInitSegment: boolean,
 *   needRebuffering: boolean,
 *   needPeriod: shakaExtern.Period,
 *   done: boolean,
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
 * @property {?number} segmentPosition
 *   Indicates the current segment position, this value increases as segments
 *   are appended, but it may reset upon seeking.
 * @property {?number} drift
 *   The number of seconds that the segments' timestamps are offset from the
 *   SegmentReferences' timestamps. For example, a positive value indicates
 *   that the segments are ahead of the SegmentReferences.
 * @property {boolean} needInitSegment
 *   True indicates that |stream|'s init segment must be inserted before the
 *   next media segment is appended.
 * @property {boolean} needRebuffering
 *   True indicates that startup or re- buffering is required.
 * @property {shakaExtern.Period} needPeriod
 *   Indicates which Period should be buffered.
 * @property {boolean} done
 *   True indicates that the end of the buffer has hit the end of the
 *   presentation.
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


/** @override */
shaka.media.StreamingEngine.prototype.destroy = function() {
  for (var type in this.mediaStates_) {
    this.cancelUpdate_(this.mediaStates_[type]);
  }

  this.playhead_ = null;
  this.mediaSourceEngine_ = null;
  this.netEngine_ = null;
  this.manifest_ = null;
  this.onCanSwitch_ = null;
  this.onBufferNewPeriod_ = null;
  this.isStreamReady_ = null;
  this.mediaStates_ = null;

  this.destroyed_ = true;

  return Promise.resolve();
};


/**
 * Initializes the StreamingEngine with an initial set of Streams.
 *
 * The StreamingEngine will setup the given Streams and then begin processing
 * them right away. Once the StreamingEngine has inserted at least one segment
 * from each Stream, it will begin setting up all other known Streams from all
 * Periods. onCanSwitch_() is called whenever the Streams from a particular
 * Period have all been setup.
 *
 * @param {!Object.<string, !shakaExtern.Stream>} streamsByType A map from
 *     content type to Stream.
 */
shaka.media.StreamingEngine.prototype.init = function(streamsByType) {
  // Determine which Period we must buffer.
  var playheadTime = this.playhead_.getTime();
  var needPeriod = this.findPeriodContainingTime_(playheadTime);
  shaka.asserts.assert(needPeriod,
                       'unable to find Period for time ' + playheadTime);
  if (!needPeriod) return;

  /** @type {!Object.<string, string>} */
  var typeConfig = {};

  for (var type in streamsByType) {
    var stream = streamsByType[type];

    typeConfig[type] =
        stream.mimeType +
        (stream.codecs ? '; codecs="' + stream.codecs + '"' : '');
    this.mediaStates_[type] = {
      stream: stream,
      type: type,
      segmentPosition: null,
      drift: null,
      needInitSegment: true,
      needRebuffering: false,
      needPeriod: needPeriod,
      done: false,
      performingUpdate: false,
      updateTimer: null,
      waitingToClearBuffer: false,
      clearingBuffer: false
    };
  }

  this.mediaSourceEngine_.init(typeConfig);
  this.setDuration_();

  // Setup the initial set of Streams and then start updating them. After
  // startup completes onUpdate_() will call newPeriod() for each known Period,
  // which will set up all Streams known at that time.
  // TODO: Use MapUtils.
  var streams = Object.keys(/** @type {!Object} */(streamsByType))
      .map(function(type) { return streamsByType[type]; });
  this.setupStreams_(streams).then(function() {
    shaka.log.debug('Setup initial Streams!');

    for (var type in this.mediaStates_) {
      this.scheduleUpdate_(this.mediaStates_[type], 0);
    }

    if (this.onInitialStreamsSetup_)
      this.onInitialStreamsSetup_();
  }.bind(this)).catch(function(error) {
    this.onError_(error);
  }.bind(this));
};


/**
 * Configures the StreamingEngine.
 *
 * @param {!shaka.media.StreamingEngine.Config} config
 */
shaka.media.StreamingEngine.prototype.configure = function(config) {
  this.config_ = config;
};


/**
 * Notifies the StreamingEngine that a new Period is available. This only has
 * to be called if |period| was created after init() was called.
 *
 * @param {!shakaExtern.Period} period
 */
shaka.media.StreamingEngine.prototype.newPeriod = function(period) {
  if (!this.startupComplete_) {
    // If startup hasn't completed then we will setup the other Streams in
    // the Manifest after it has, so we shouldn't setup |period| here.
    shaka.log.debug('Deferring new Period setup until startup completes.');
    return;
  }

  // Reset the duration to account for the new Period.
  this.setDuration_();

  var streams = period.streamSets
      .map(function(ss) { return ss.streams; })
      .reduce(function(all, part) { return all.concat(part); }, []);

  this.setupStreams_(streams).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1('Calling onCanSwitch_()...');
    this.onCanSwitch_(period);
  }.bind(this)).catch(function(error) {
    this.onError_(error);
  }.bind(this));
};


/**
 * Switches to the given Stream. |stream| may be from any StreamSet or any
 * Period.
 *
 * @param {string} contentType |stream|'s content type.
 * @param {shakaExtern.Stream} stream
 */
shaka.media.StreamingEngine.prototype.switch = function(contentType, stream) {
  shaka.asserts.assert(this.isStreamReady_[stream.id],
                       'Stream ' + stream.id + ' should be ready');
  if (!this.isStreamReady_[stream.id]) return;

  var mediaState = this.mediaStates_[contentType];
  shaka.asserts.assert(mediaState, 'mediaState should exist');
  if (!mediaState) return;

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  if (mediaState.stream == stream) {
    shaka.log.debug(logPrefix, 'already switched to Stream ' + stream.id);
    return;
  }

  shaka.log.debug(logPrefix, 'switching to Stream ' + stream.id);

  // If we switch to a Stream from a different Period then we must reset the
  // segment position.
  var currentPeriod = this.findPeriodContainingStream_(mediaState.stream);
  var nextPeriod = this.findPeriodContainingStream_(stream);
  if (nextPeriod != currentPeriod) {
    shaka.log.debug(logPrefix, 'switching Periods');
    mediaState.segmentPosition = null;
  }

  mediaState.stream = stream;
  mediaState.needInitSegment = true;

  if (mediaState.updateTimer == null) {
    // Note: the update cycle stops when we've buffered to the end of the
    // presentation or Period.
    shaka.log.debug(logPrefix, 'restarting update cycle!');
    this.scheduleUpdate_(mediaState, 0);
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

    if (!this.isStreamReady_[mediaState.stream.id]) {
      // The Stream hasn't even been setup yet.
      continue;
    }

    if (mediaState.clearingBuffer) {
      // We're already clearing the buffer, so we don't need to clear the
      // buffer again.
      shaka.log.v1(logPrefix, 'already clearing the buffer');
      continue;
    }

    var playheadTime = this.playhead_.getTime();
    var bufferedAhead = this.mediaSourceEngine_.bufferedAheadOf(
        type, playheadTime);
    if (bufferedAhead > 0) {
      // The playhead has moved into a buffered region, so we don't need to
      // clear the buffer.
      shaka.log.v1(logPrefix,
                   'buffered seek:',
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
      shaka.log.v1(logPrefix, 'unbuffered seek, already waiting');
      shaka.asserts.assert(mediaState.performingUpdate,
                           'expected performingUpdate to be true');
      continue;
    }

    if (this.mediaSourceEngine_.bufferStart(type) == null) {
      // Nothing buffered.
      shaka.log.v1(logPrefix, 'unbuffered seek, nothing buffered');
      if (mediaState.updateTimer == null) {
        // Note: the update cycle stops when we've buffered to the end of the
        // presentation or Period.
        this.scheduleUpdate_(mediaState, 0);
      }
      continue;
    }

    if (mediaState.performingUpdate) {
      // We are performing an update, so we have to wait until it's finished.
      // onUpdate_() will call handleUnbufferedSeek_() when the update has
      // finished.
      shaka.log.v1(logPrefix, 'unbuffered seek, currently updating');
      mediaState.waitingToClearBuffer = true;
      continue;
    }

    // An update may be scheduled, bu we can just cancel it and clear the
    // buffer right away.
    shaka.log.v1(logPrefix, 'unbuffered seek, handling right now');
    this.cancelUpdate_(mediaState);
    this.handleUnbufferedSeek_(mediaState);
  }
};


/**
 * Sets up the given Streams.
 *
 * @param {!Array.<!shakaExtern.Stream>} streams
 *
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.setupStreams_ = function(streams) {
  var async = streams.map(function(stream) {
    return this.isStreamReady_[stream.id] ? null : stream.createSegmentIndex();
  }.bind(this));

  return Promise.all(async).then(function() {
    if (this.destroyed_) return;
    for (var i = 0; i < async.length; ++i) {
      if (async[i] == null) continue;
      var stream = streams[i];
      shaka.asserts.assert(
          !this.isStreamReady_[stream.id],
          'Stream ' + stream.id + ' should not be ready yet.');
      shaka.log.v1('Setup Stream ' + stream.id);
      this.isStreamReady_[stream.id] = true;
    }
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
    // TODO: Handle infinite durations (e.g., typical live case).
  }
};


/**
 * Called when |mediaState|'s update timer has gone off or when |mediaState|
 * has completed an update.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @private
 */
shaka.media.StreamingEngine.prototype.onUpdate_ = function(mediaState) {
  if (this.destroyed_) return;

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // Sanity check.
  shaka.asserts.assert(
      mediaState.performingUpdate || (mediaState.updateTimer != null),
      logPrefix + ' unexpected call to onUpdate_()');
  shaka.asserts.assert(
      !mediaState.clearingBuffer,
      logPrefix + ' onUpdate_() should not be called when clearing the buffer');

  mediaState.performingUpdate = false;
  mediaState.updateTimer = null;

  // Handle unbuffered seeks.
  if (mediaState.waitingToClearBuffer) {
    // Note: handleUnbufferedSeek_() will schedule the next update.
    shaka.log.debug(logPrefix, 'skipping update and handling seek instead');
    this.handleUnbufferedSeek_(mediaState);
    return;
  }

  this.update_(mediaState);

  // Check if we need to buffer from a different Period.
  // TODO: Use MapUtils.
  var mediaStates = Object.keys(/** @type {!Object} */(this.mediaStates_))
      .map(function(type) { return this.mediaStates_[type]; }.bind(this));
  var needSamePeriod = mediaStates.every(function(ms) {
    return ms.needPeriod == mediaState.needPeriod;
  });

  if (needSamePeriod) {
    var currentPeriod = this.findPeriodContainingStream_(mediaState.stream);
    if (currentPeriod != mediaState.needPeriod) {
      // We may call onBufferNewPeriod_() before we call onCanSwitch_(); the
      // caller must handle that.
      shaka.log.v1('Calling onBufferNewPeriod_()...');
      this.onBufferNewPeriod_(mediaState.needPeriod);
    }
  }

  // Check if we've buffered to the end of the presentation.
  if (mediaStates.every(function(ms) { return ms.done; })) {
    shaka.log.v1('Calling endOfStream()...');
    this.mediaSourceEngine_.endOfStream();
  }

  // Handle startup and re- buffering.
  this.playhead_.setBuffering(
      mediaStates.some(function(ms) { return ms.needRebuffering; }));
};


/**
 * Updates the given MediaState.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @private
 */
shaka.media.StreamingEngine.prototype.update_ = function(mediaState) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var stream = mediaState.stream;

  // Compute how far we've buffered ahead of the playhead.
  var playheadTime = this.playhead_.getTime();
  var bufferedAhead = this.mediaSourceEngine_.bufferedAheadOf(
      mediaState.type, playheadTime);

  // If we've buffered to the buffering goal then schedule an update.
  var bufferingGoal = Math.max(this.config_.rebufferingGoal,
                               this.config_.bufferingGoal);
  if (bufferedAhead >= bufferingGoal) {
    shaka.log.v2(logPrefix,
                 'buffering goal met:',
                 'playheadTime=' + playheadTime,
                 'bufferedAhead=' + bufferedAhead);
    mediaState.needRebuffering = false;
    // Schedule the next update such that if playback continues we won't be
    // at the buffering goal the next time around.
    this.scheduleUpdate_(mediaState, bufferedAhead - bufferingGoal + 0.1);
    return;
  }

  // Get the next timestamp we need.
  var bufferEnd = this.mediaSourceEngine_.bufferEnd(mediaState.type);
  var timeNeeded = bufferEnd != null ? bufferEnd : playheadTime;

  var timeline = this.manifest_.presentationTimeline;

  // Check if we've buffered to the end of the presentation.
  if (timeNeeded >= timeline.getDuration()) {
    // We shouldn't rebuffer if we're close to the end.
    shaka.log.v2(logPrefix, 'buffered to end of presentation');
    mediaState.needRebuffering = false;
    mediaState.done = true;
    return;
  }
  mediaState.done = false;

  // Handle startup and re- buffering state.
  var rebufferingGoal = Math.max(this.manifest_.minBufferTime || 0,
                                 this.config_.rebufferingGoal);
  if ((!this.startupComplete_ && bufferedAhead < rebufferingGoal) ||
      (bufferedAhead <= 1)) {
    shaka.log.v2(logPrefix, 'need startup or re- buffering');
    mediaState.needRebuffering = true;
  } else if (bufferedAhead >= rebufferingGoal) {
    mediaState.needRebuffering = false;
  }

  // Get the current Period. This will only be null if |stream| is not part
  // of the Manifest, which should never happen.
  var currentPeriod = this.findPeriodContainingStream_(stream);
  shaka.asserts.assert(
      currentPeriod,
      logPrefix + ' Stream ' + stream.id + ' ' +
      'is not contained within the Manifest');
  if (!currentPeriod) return;

  // Check if we need to begin buffering from a different Period. We do this
  // before checking segment availability since the new Period may become
  // available once we actually have to buffer it.
  var needPeriod = this.findPeriodContainingTime_(timeNeeded);
  if (needPeriod && (needPeriod != currentPeriod)) {
    shaka.log.debug(logPrefix,
                    'need Period:',
                    'playheadTime=' + playheadTime,
                    'bufferEnd=' + bufferEnd,
                    'needPeriod.startTime=' + needPeriod.startTime,
                    'currentPeriod.startTime=' + currentPeriod.startTime);
    mediaState.needPeriod = needPeriod;
    return;
  }

  // Check segment availability.
  if (timeNeeded < timeline.getSegmentAvailabilityStart() ||
      timeNeeded > timeline.getSegmentAvailabilityEnd()) {
    // The next segment is not available. In the usual case, this occurs when
    // we've buffered to the live-edge of a live stream, so try another update
    // in a second. In the degenerate case, this may occur if the playhead is
    // outside the segment availability window.
    shaka.log.v1(logPrefix,
                 'next segment is outside segment availability window:',
                 'playheadTime=' + playheadTime,
                 'bufferEnd=' + bufferEnd);
    this.scheduleUpdate_(mediaState, 1);
    return;
  }

  // Find the next segment we need.
  var periodTime = timeNeeded - currentPeriod.startTime - mediaState.drift;
  var position = mediaState.segmentPosition != null ?
                 mediaState.segmentPosition + 1 :
                 stream.findSegmentPosition(periodTime);
  var reference = position != null ?
                  stream.getSegmentReference(position) :
                  null;
  if (!reference) {
    // The next segment is unknown. This should never happen in the usual case
    // because we handle segment availability and Period transitions above, so
    // we should always have a segment. If this does happen then either the
    // manifest is not updating fast enough for live presentations, or the
    // manifest is not complete.
    shaka.log.debug(logPrefix,
                    'next segment does not exist:',
                    'playheadTime=' + playheadTime,
                    'bufferEnd=' + bufferEnd,
                    'currentPeriod.startTime=' + currentPeriod.startTime,
                    'mediaState.drift=' + mediaState.drift,
                    'position=' + position);
    this.scheduleUpdate_(mediaState, 1);
    return;
  }
  shaka.asserts.assert(
      reference.position == position,
      'reference.position=' + reference.position + ' ' +
      'should equal position=' + position);

  shaka.log.v1(logPrefix,
               'fetch and append:',
               'playheadTime=' + playheadTime,
               'bufferEnd=' + bufferEnd,
               'currentPeriod.startTime=' + currentPeriod.startTime,
               'mediaState.drift=' + mediaState.drift,
               'reference.position=' + reference.position,
               'reference.startTime=' + reference.startTime);
  this.fetchAndAppend_(mediaState, reference, currentPeriod.startTime);
};


/**
 * Fetches and appends the given segment. Appends |mediaState|'s Stream's init
 * segment if needed; sets the timestamp offset if needed; updates
 * |mediaState|'s |needInitSegment| and |segmentPosition| fields; and schedules
 * another update after completing.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {!shaka.media.SegmentReference} reference
 * @param {number} periodStartTime
 *
 * @private
 */
shaka.media.StreamingEngine.prototype.fetchAndAppend_ = function(
    mediaState, reference, periodStartTime) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var stream = mediaState.stream;

  mediaState.performingUpdate = true;

  // Append init segment if needed.
  var appendInit;
  if (mediaState.needInitSegment && stream.initSegmentReference) {
    var fetchInit = this.fetch_(stream.initSegmentReference);
    appendInit = fetchInit.then(function(initSegment) {
      if (this.destroyed_) return;
      shaka.log.v2(logPrefix, 'appending init segment');
      return this.mediaSourceEngine_.appendBuffer(mediaState.type, initSegment);
    }.bind(this));
  } else {
    appendInit = Promise.resolve();
  }

  // We may set |needInitSegment| to true in switch(), so set it to false here,
  // since we want it to remain true if switch is called.
  mediaState.needInitSegment = false;

  // We may set |segmentPosition| to false in switch(), so set it to the next
  // position here, since we want it to remain null if switch is called.
  mediaState.segmentPosition = reference.position;

  // Set the timestamp offset immediately after appending the init segment.
  // TODO: Find a simple way to do this when switch() is called instead of
  // here.
  var timestampOffset = periodStartTime - stream.presentationTimeOffset;
  var p = appendInit.then(function() {
    if (this.destroyed_) return;
    shaka.log.v2(logPrefix, 'setting timestamp offset:', timestampOffset);
    return this.mediaSourceEngine_.setTimestampOffset(
        mediaState.type, timestampOffset);
  }.bind(this));

  var fetchSegment = this.fetch_(reference);
  Promise.all([fetchSegment, p]).then(function(results) {
    if (this.destroyed_) return;

    shaka.log.v1(logPrefix, 'appending media segment');

    // Append actual segment.
    var segment = results[0];
    shaka.asserts.assert(segment, logPrefix + ' segment should not be null');

    return this.mediaSourceEngine_.appendBuffer(mediaState.type, segment);
  }.bind(this)).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appended media segment');

    // Compute drift if needed.
    if (mediaState.drift == null) {
      var bufferStart = this.mediaSourceEngine_.bufferStart(mediaState.type);
      if (bufferStart != null) {
        mediaState.drift = bufferStart - reference.startTime - periodStartTime;
        shaka.log.debug(logPrefix, 'drift=', mediaState.drift);
      } else {
        return Promise.reject(new shaka.util.Error(
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.BAD_SEGMENT));
      }
      // We clear the segment position after the first segment is inserted
      // because the drift may be large enough such that the playhead may be
      // outside the segment we just inserted, we'll recompute the segment
      // position in the next update.
      mediaState.segmentPosition = null;
    }

    // Update right away.
    this.scheduleUpdate_(mediaState, 0);

    // Subtlety: handleStartup_() calls onStartupComplete_() which may call
    // seeked() so we must schedule an update beforehand so |updateTimer| is in
    // the right state.
    this.handleStartup_();
  }.bind(this)).catch(function(error) {
    this.onError_(error);
  }.bind(this));
};


/**
 * Sets up all known Periods if startup just completed.
 * @private
 */
shaka.media.StreamingEngine.prototype.handleStartup_ = function() {
  if (this.startupComplete_)
    return;

  // TODO: Use MapUtils.
  var mediaStates = Object.keys(/** @type {!Object} */(this.mediaStates_))
      .map(function(type) { return this.mediaStates_[type]; }.bind(this));
  this.startupComplete_ = mediaStates.every(function(ms) {
    return ms.drift != null;
  });

  if (!this.startupComplete_)
    return;

  shaka.log.debug('Startup complete!');

  // Setup all known Periods.
  for (var i = 0; i < this.manifest_.periods.length; ++i) {
    this.newPeriod(this.manifest_.periods[i]);
  }

  if (this.onStartupComplete_)
    this.onStartupComplete_();
};


/**
 * @param {number} time The time, in seconds, relative to the start of the
 *     presentation.
 * @return {?shakaExtern.Period} the Period which starts after |time|, or
 *     null if no such Period exists.
 * @private
 */
shaka.media.StreamingEngine.prototype.findPeriodContainingTime_ = function(
    time) {
  for (var i = this.manifest_.periods.length - 1; i >= 0; --i) {
    var period = this.manifest_.periods[i];
    if (time >= period.startTime)
      return period;
  }
  return null;
};


/**
 * @param {!shakaExtern.Stream} stream
 * @return {?shakaExtern.Period} the Period which contains |stream|, or null
 *     if no Period contains |stream|.
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
        return period;
    }
  }
  return null;
};


/**
 * Fetches the given segment.
 *
 * @param {(!shaka.media.InitSegmentReference|!shaka.media.SegmentReference)}
 *     reference
 *
 * @return {!Promise.<!ArrayBuffer>}
 * @private
 */
shaka.media.StreamingEngine.prototype.fetch_ = function(reference) {
  var requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  var request = shaka.net.NetworkingEngine.makeRequest(
      reference.uris, this.config_.retryParameters);

  // Set Range header if needed.
  if ((reference.startByte != 0) || (reference.endByte != null)) {
    request.headers['Range'] =
        'bytes=' + reference.startByte + '-' + (reference.endByte || '');
  }


  shaka.log.v1('Fetching:', reference);
  var p = this.netEngine_.request(requestType, request);
  return p.then(function(response) {
    return response.data;
  });
};


/**
 * Handles an unbuffered seek by clearing the buffer and then scheduling an
 * update.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @private
 */
shaka.media.StreamingEngine.prototype.handleUnbufferedSeek_ = function(
    mediaState) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var stream = mediaState.stream;

  shaka.asserts.assert(
      !mediaState.performingUpdate && (mediaState.updateTimer == null),
      logPrefix + ' unexpected call to handleUnbufferedSeek_()');

  mediaState.segmentPosition = null;
  mediaState.waitingToClearBuffer = false;
  mediaState.clearingBuffer = true;

  shaka.log.v1(logPrefix, 'clearing buffer');

  this.mediaSourceEngine_.clear(mediaState.type).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'cleared buffer');
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
  shaka.log.v1(logPrefix, 'updating in ' + delay + ' seconds');
  shaka.asserts.assert(mediaState.updateTimer == null,
                       logPrefix + ' an update is already scheduled');
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
 *     "(audio:5)" or "(video:hd)".
 * @private
 */
shaka.media.StreamingEngine.logPrefix_ = function(mediaState) {
  return '(' + mediaState.type + ':' + mediaState.stream.id + ')';
};

