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
 * @param {!shaka.media.Playhead} playhead The Playhead. The caller retains
 *     ownership.
 * @param {!shaka.media.MediaSourceEngine} mediaSourceEngine The
 *     MediaSourceEngine. The caller retains ownership.
 * @param {shaka.net.NetworkingEngine} netEngine
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
    playhead, mediaSourceEngine, netEngine, manifest,
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

  /** @private {?shakaExtern.StreamingConfiguration} */
  this.config_ = null;

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
   * The total number of bytes buffered across all content types.
   *
   * @private {number}
   */
  this.bufferSize_ = 0;

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
 *   type: string,
 *   stream: shakaExtern.Stream,
 *   segmentPosition: ?number,
 *   buffer: !Array.<!shaka.media.StreamingEngine.SegmentReceipt_>,
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
 * @property {!Array.<!shaka.media.StreamingEngine.SegmentReceipt_>} buffer
 *   List of segments in buffer.
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


/**
 * @typedef {{
 *   type: string,
 *   startTime: number,
 *   endTime: number,
 *   byteLength: number
 * }}
 *
 * @property {string} type
 *   The segment's content type.
 * @property {number} startTime
 *   The segment's start time, in seconds, relative to the start of the
 *   presentation.
 * @property {number} endTime
 *   The segment's end time, in seconds, relative to the start of the
 *   presentation.
 * @property {number} byteLength
 *   The segment's size in bytes.
 */
shaka.media.StreamingEngine.SegmentReceipt_;


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
  this.config_ = null;

  this.destroyed_ = true;

  return Promise.resolve();
};


/**
 * Called by the Player to provide an updated configuration any time it changes.
 * Will be called at least once before init().
 *
 * @param {!shakaExtern.StreamingConfiguration} config
 */
shaka.media.StreamingEngine.prototype.configure = function(config) {
  this.config_ = config;
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
  shaka.asserts.assert(this.config_,
      'StreamingEngine configure() must be called before init()!');

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
      buffer: [],
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
  // which will set up all the remaining Streams known at that time.
  // TODO: Use MapUtils.
  var streams = Object.keys(/** @type {!Object} */(streamsByType))
      .map(function(type) { return streamsByType[type]; });
  this.setupStreams_(streams).then(function() {
    shaka.log.debug('(all) finished setting up the initial Streams');

    for (var type in this.mediaStates_) {
      this.scheduleUpdate_(this.mediaStates_[type], 0);
    }

    if (this.onInitialStreamsSetup_)
      this.onInitialStreamsSetup_();
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return;
    this.onError_(error);
  }.bind(this));
};


/**
 * Notifies the StreamingEngine that a new Period is available. This only has
 * to be called if |period| was created after init() was called.
 *
 * @param {!shakaExtern.Period} period
 */
shaka.media.StreamingEngine.prototype.newPeriod = function(period) {
  if (!this.startupComplete_) {
    // If startup hasn't completed yet then we will setup the other Streams in
    // the Manifest after it does, so we shouldn't setup |period| here.
    shaka.log.debug('(all)',
                    'deferring setting up new Period until startup completes:',
                    'period.startTime=' + period.startTime);
    return;
  }

  // Reset the duration to account for the new Period.
  this.setDuration_();

  var streams = period.streamSets
      .map(function(ss) { return ss.streams; })
      .reduce(function(all, part) { return all.concat(part); }, []);

  this.setupStreams_(streams).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1('(all) calling onCanSwitch_()...');
    this.onCanSwitch_(period);
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return;
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
    shaka.log.debug(logPrefix, 'Stream ' + stream.id + ' is already active');
    return;
  }

  shaka.log.debug(logPrefix, 'switching to Stream ' + stream.id);

  // If we switch to a Stream from a different Period then we must reset the
  // segment position.
  var currentPeriod = this.findPeriodContainingStream_(mediaState.stream);
  var nextPeriod = this.findPeriodContainingStream_(stream);
  if (nextPeriod != currentPeriod) {
    shaka.log.debug(logPrefix,
                    'switching Periods:',
                    'currentPeriod.startTime=' + currentPeriod.startTime,
                    'nextPeriod.startTime=' + nextPeriod.startTime);
    mediaState.segmentPosition = null;
  }

  mediaState.stream = stream;
  mediaState.needInitSegment = true;

  if (mediaState.updateTimer == null) {
    // Note: the update cycle stops whenever we buffer to the end of the
    // presentation or Period.
    shaka.log.v1(logPrefix, 'restarting update cycle');
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
      shaka.log.debug(
          logPrefix,
          'seeked: Stream ' + mediaState.stream.id + ' is not ready');
      continue;
    }

    if (mediaState.clearingBuffer) {
      // We're already clearing the buffer, so we don't need to clear the
      // buffer again.
      shaka.log.debug(logPrefix, 'seeked: already clearing the buffer');
      continue;
    }

    var playheadTime = this.playhead_.getTime();
    var bufferedAhead = this.mediaSourceEngine_.bufferedAheadOf(
        type, playheadTime);
    if (bufferedAhead > 0) {
      // The playhead has moved into a buffered region, so we don't need to
      // clear the buffer.
      shaka.log.debug(logPrefix,
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
      shaka.log.debug(logPrefix, 'unbuffered seek: already waiting');
      shaka.asserts.assert(mediaState.performingUpdate,
                           'expected performingUpdate to be true');
      continue;
    }

    if (this.mediaSourceEngine_.bufferStart(type) == null) {
      // Nothing buffered.
      shaka.log.debug(logPrefix, 'unbuffered seek: nothing buffered');
      if (mediaState.updateTimer == null) {
        // Note: the update cycle stops whenever we buffer to the end of the
        // presentation or Period.
        shaka.log.v1(logPrefix, 'restarting update cycle');
        this.scheduleUpdate_(mediaState, 0);
      }
      continue;
    }

    if (mediaState.performingUpdate) {
      // We are performing an update, so we have to wait until it's finished.
      // onUpdate_() will call handleUnbufferedSeek_() when the update has
      // finished.
      shaka.log.debug(logPrefix, 'unbuffered seek: currently updating');
      mediaState.waitingToClearBuffer = true;
      continue;
    }

    // An update may be scheduled, but we can just cancel it and clear the
    // buffer right away.
    shaka.log.debug(logPrefix, 'unbuffered seek: handling right now');
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
      shaka.log.v1('(all) setup Stream ' + stream.id);
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
      shaka.log.v1(logPrefix, 'calling onBufferNewPeriod_()...');
      this.onBufferNewPeriod_(mediaState.needPeriod);
    }
  }

  // Check if we've buffered to the end of the presentation.
  if (mediaStates.every(function(ms) { return ms.done; })) {
    shaka.log.v1(logPrefix, 'calling endOfStream()...');
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

  // Compute how far we've buffered ahead of the playhead.
  var playheadTime = this.playhead_.getTime();
  var bufferedAhead = this.mediaSourceEngine_.bufferedAheadOf(
      mediaState.type, playheadTime);

  shaka.log.v2(logPrefix,
               'update_:',
               'playheadTime=' + playheadTime,
               'bufferedAhead=' + bufferedAhead);

  // If we've buffered to the buffering goal then schedule an update.
  var bufferingGoal = Math.max(this.config_.rebufferingGoal,
                               this.config_.bufferingGoal);
  if (bufferedAhead >= bufferingGoal) {
    shaka.log.v2(logPrefix, 'buffering goal met');
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
    shaka.log.debug(logPrefix, 'buffered to end of presentation');
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
    shaka.log.v1(logPrefix, 'need startup or re- buffering');
    mediaState.needRebuffering = true;
  } else if (bufferedAhead >= rebufferingGoal) {
    mediaState.needRebuffering = false;
  }

  // Get the current Period. This will only be null if mediaState.stream is not
  // part of the Manifest, which should never happen.
  var currentPeriod = this.findPeriodContainingStream_(mediaState.stream);
  shaka.asserts.assert(
      currentPeriod,
      logPrefix + ' Stream ' + mediaState.stream.id + ' ' +
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
                    'currentPeriod.startTime=' + currentPeriod.startTime,
                    'needPeriod.startTime=' + needPeriod.startTime);
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
                 mediaState.stream.findSegmentPosition(periodTime);
  var reference = position != null ?
                  mediaState.stream.getSegmentReference(position) :
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
 * Fetches and appends the given segment; sets up the given MediaState's
 * associated SourceBuffer and evicts segments if either are required
 * beforehand. Schedules another update after completing successfully.
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

  // Subtlety: switch() may be called while asynchronous update operations are
  // in progress, so anything that switch() may change, e.g.,
  // mediaState.stream, should not be used in any callbacks without care.

  var initSourceBuffer = this.initSourceBuffer_(mediaState, periodStartTime);
  mediaState.performingUpdate = true;

  // We may set |needInitSegment| to true in switch(), so set it to false here,
  // since we want it to remain true if switch() is called.
  mediaState.needInitSegment = false;

  // We may set |segmentPosition| to false in switch(), so set it to the next
  // position here, since we want it to remain null if switch() is called.
  mediaState.segmentPosition = reference.position;

  shaka.log.v2(logPrefix, 'fetching segment');
  var fetchSegment = this.fetch_(reference);

  Promise.all([initSourceBuffer, fetchSegment]).then(function(results) {
    if (this.destroyed_) return;
    return this.append_(mediaState, reference, periodStartTime, results[1]);
  }.bind(this)).then(function() {
    // Update right away.
    this.scheduleUpdate_(mediaState, 0);

    // Subtlety: handleStartup_() calls onStartupComplete_() which may in turn
    // call seeked(), so we must schedule an update before we call
    // handleStartup_() so |updateTimer| is set.
    this.handleStartup_();

    shaka.log.v1(logPrefix, 'finished fetch and append');
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return;

    mediaState.segmentPosition = null;
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
 * @param {number} periodStartTime
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.initSourceBuffer_ = function(
    mediaState, periodStartTime) {
  if (!mediaState.needInitSegment)
    return Promise.resolve();

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // If we need an init segment then the Stream switched, so we've either
  // changed bitrates, Periods, or both. If we've changed Periods then we
  // must set a new timestamp offset. Note that by setting the timestamp
  // offset here, we avoid having to co-ordinate ongoing updates, which we
  // would have to do if we set the timestamp offset in switch().
  var timestampOffset =
      periodStartTime - mediaState.stream.presentationTimeOffset;
  shaka.log.v1(logPrefix, 'setting timestamp offset to ' + timestampOffset);
  var setTimestampOffset = this.mediaSourceEngine_.setTimestampOffset(
      mediaState.type, timestampOffset);

  if (!mediaState.stream.initSegmentReference) {
    // The Stream is self initializing.
    return setTimestampOffset;
  }

  shaka.log.v1(logPrefix, 'fetching init segment');
  var fetchInit = this.fetch_(mediaState.stream.initSegmentReference);
  var appendInit = fetchInit.then(function(initSegment) {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending init segment');

    return this.mediaSourceEngine_.appendBuffer(mediaState.type, initSegment);
  }.bind(this));

  return Promise.all([setTimestampOffset, appendInit]);
};


/**
 * Appends the given segment, evicts segments if required to append, and
 * computes drift if required.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {!shaka.media.SegmentReference} reference
 * @param {number} periodStartTime
 * @param {!ArrayBuffer} segment
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.append_ = function(
    mediaState, reference, periodStartTime, segment) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // Update the buffer state immediately so we don't create any races between
  // update cycles. After this point we'll either append the segment or
  // encounter an error and revert the buffer state.

  /** @type {shaka.media.StreamingEngine.SegmentReceipt_} */
  var receipt = {
    type: mediaState.type,
    startTime: periodStartTime + reference.startTime,
    endTime: periodStartTime + reference.endTime,
    byteLength: segment.byteLength
  };
  mediaState.buffer.push(receipt);
  this.bufferSize_ += segment.byteLength;

  return this.evict_().then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending media segment');

    return this.mediaSourceEngine_.appendBuffer(mediaState.type, segment);
  }.bind(this)).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appended media segment');

    if (!this.computeDrift_(mediaState, reference, periodStartTime)) {
      return Promise.reject(new shaka.util.Error(
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.STREAMING_BAD_SEGMENT));
    }

    return Promise.resolve();
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return;

    // Restore the buffer state.
    mediaState.buffer.pop();
    this.bufferSize_ -= segment.byteLength;

    return Promise.reject(error);
  }.bind(this));
};


/**
 * Evicts a segment if required to append a new segment. Assumes that the
 * buffer state already accounts for the new segment.
 *
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.evict_ = function() {
  shaka.log.v2('(all) checking byte limit');

  // Evict the earliest buffered segment if appending a new segment would put
  // us over the byte limit; however, forego this if the earliest buffered
  // segment is the only segment or the playhead is within it. We only evict
  // one segment at a time, but we'll keep calling this function recursively
  // until we can append a new segment or encounter an error.
  var overflow = this.bufferSize_ - this.config_.byteLimit;
  if (overflow <= 0)
    return Promise.resolve();

  shaka.log.v1('(all)',
               'over byte limit:',
               'bufferSize_=' + this.bufferSize_,
               'byteLimit=' + this.config_.byteLimit,
               'overflow=' + overflow);


  // Find the first buffered segment across types that we can evict.
  var playheadTime = this.playhead_.getTime();
  var first;

  for (var type in this.mediaStates_) {
    if (this.mediaStates_[type].buffer.length <= 1) {
      shaka.log.v2('(all) cannot evict ' + type + ' seg.: too few segments');
      continue;
    }

    var receipt = this.mediaStates_[type].buffer[0];

    if (playheadTime >= receipt.startTime &&
        playheadTime < receipt.endTime) {
      shaka.log.v2('(all) cannot evict ' + type + ' seg.: playhead in segment');
      continue;
    }

    // Break ties by taking the larger (bytes) segment.
    if (!first ||
        (receipt.startTime < first.startTime) ||
        (receipt.startTime == first.startTime &&
         receipt.byteLength > first.byteLength)) {
      first = receipt;
    }
  }

  if (!first) {
    shaka.log.warning('(all) cannot evict any segments');
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.STREAMING_CANNOT_SATISFY_BYTE_LIMIT));
  }

  shaka.log.v1('(all)',
               'evicting ' + first.type + ' segment:',
               'startTime=' + first.startTime,
               'endTime=' + first.endTime);

  // Update the buffer state immediately so we don't create any races between
  // update cycles. After this point we'll either evict the segment or
  // encounter an error and revert the buffer state.
  this.mediaStates_[first.type].buffer.shift();
  this.bufferSize_ -= first.byteLength;

  var evict = this.mediaSourceEngine_.remove(
      first.type, first.startTime, first.endTime);
  return evict.then(function() {
    if (this.destroyed_) return;
    shaka.log.v1('(all) evicted ' + first.type + ' segment');

    // Call evict_() recursively.
    return this.evict_();
  }.bind(this)).catch(function(error) {
    // Restore the buffer state. Note that since MediaSourceEngine queues
    // remove(), we can push |first| back into the buffer without worrying
    // about ordering.
    this.mediaStates_[first.type].buffer.splice(0, 0, first);
    this.bufferSize_ += first.byteLength;
    return Promise.reject(error);
  }.bind(this));
};


/**
 * Computes drift if needed.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {shaka.media.SegmentReference} reference
 * @param {number} periodStartTime
 * @return {boolean} True if drift was computed or did not need to be computed;
 *     otherwise, return false if drift could not be computed.
 * @private
 */
shaka.media.StreamingEngine.prototype.computeDrift_ = function(
    mediaState, reference, periodStartTime) {
  if (mediaState.drift != null)
    return true;

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  var bufferStart = this.mediaSourceEngine_.bufferStart(mediaState.type);
  if (bufferStart == null) {
    shaka.log.v1(logPrefix, 'bufferStart should not be null: bad segment?');
    return false;
  }

  mediaState.drift = bufferStart - reference.startTime - periodStartTime;
  shaka.log.debug(logPrefix, 'drift=', mediaState.drift);

  // We clear the segment position after the first segment is inserted
  // because the drift may be large enough such that the playhead may be
  // outside the segment we just inserted, we'll recompute the segment
  // position in the next update.
  mediaState.segmentPosition = null;

  return true;
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

  shaka.log.debug('(all) startup complete');

  // Setup all known Periods.
  for (var i = 0; i < this.manifest_.periods.length; ++i) {
    this.newPeriod(this.manifest_.periods[i]);
  }

  if (this.onStartupComplete_) {
    shaka.log.v1('(all) calling onStartupComplete_()...');
    this.onStartupComplete_();
  }
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


  shaka.log.v2('fetching: reference=' + reference);
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

  shaka.asserts.assert(
      !mediaState.performingUpdate && (mediaState.updateTimer == null),
      logPrefix + ' unexpected call to handleUnbufferedSeek_()');

  mediaState.segmentPosition = null;
  mediaState.waitingToClearBuffer = false;
  mediaState.clearingBuffer = true;

  shaka.log.debug(logPrefix, 'clearing buffer');

  this.mediaSourceEngine_.clear(mediaState.type).then(function() {
    if (this.destroyed_) return;
    shaka.log.debug(logPrefix, 'cleared buffer');
    this.bufferSize_ = 0;
    mediaState.buffer = [];
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
                       logPrefix + ' an update should not be scheduled');
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

