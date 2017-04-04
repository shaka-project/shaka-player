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
goog.require('shaka.log');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.Playhead');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StreamUtils');



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
 * @param {shakaExtern.Manifest} manifest
 * @param {shaka.media.StreamingEngine.PlayerInterface} playerInterface
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.StreamingEngine = function(manifest, playerInterface) {
  /** @private {?shaka.media.StreamingEngine.PlayerInterface} */
  this.playerInterface_ = playerInterface;

  /** @private {?shakaExtern.Manifest} */
  this.manifest_ = manifest;

  /** @private {?shakaExtern.StreamingConfiguration} */
  this.config_ = null;

  /** @private {number} */
  this.bufferingGoalScale_ = 1;

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
   * @private {Object.<shaka.util.ManifestParserUtils.ContentType,
                       !shaka.media.StreamingEngine.MediaState_>}
   */
  this.mediaStates_ = {};

  /**
   * Set to true once one segment of each content type has been buffered.
   *
   * @private {boolean}
   */
  this.startupComplete_ = false;

  /**
   * Set to true on fatal error.  Interrupts fetchAndAppend_().
   *
   * @private {boolean}
   */
  this.fatalError_ = false;

  /** @private {boolean} */
  this.destroyed_ = false;
};


/**
 * @typedef {{
 *   playhead: !shaka.media.Playhead,
 *   mediaSourceEngine: !shaka.media.MediaSourceEngine,
 *   netEngine: shaka.net.NetworkingEngine,
 *   onChooseStreams: function(!shakaExtern.Period):
 *                        !Object.<shaka.util.ManifestParserUtils.ContentType,
 *                                 shakaExtern.Stream>,
 *   onCanSwitch: function(),
 *   onError: function(!shaka.util.Error),
 *   onEvent: function(!Event),
 *   onManifestUpdate: function(),
 *   onSegmentAppended: function(),
 *   onInitialStreamsSetup: (function()|undefined),
 *   onStartupComplete: (function()|undefined)}
 * }}
 *
 * @property {!shaka.media.Playhead} playhead
 *   The Playhead. The caller retains ownership.
 * @property {!shaka.media.MediaSourceEngine} mediaSourceEngine
 *   The MediaSourceEngine. The caller retains ownership.
 * @property {shaka.net.NetworkingEngine} netEngine
 *   The NetworkingEngine instance to use. The caller retains ownership.
 * @property {function(!shakaExtern.Period):
 *                !Object.<shaka.util.ManifestParserUtils.ContentType,
 *                         shakaExtern.Stream>} onChooseStreams
 *   Called when the given Period needs to be buffered. The
 *   StreamingEngine will switch to the Streams returned from this function.
 *   The caller cannot call switch() directly until the StreamingEngine calls
 *   onCanSwitch()
 * @property {function()} onCanSwitch
 *   Called when any Stream within the current Period may be switched to.
 * @property {function(!shaka.util.Error)} onError
 *   Called when an error occurs. If the error is recoverable (see
 *   @link{shaka.util.Error}) then the caller may invoke either
 *   StreamingEngine.switch() or StreamingEngine.seeked() to attempt recovery.
 * @property {function(!Event)} onEvent
 *   Called when an event occurs that should be sent to the app.
 * @property {function()} onManifestUpdate
 *   Called when an embedded 'emsg' box should trigger a manifest update.
 * @property {function()} onSegmentAppended
 *   Called after a segment is successfully appended to a MediaSource.
 * @property {(function()|undefined)} onInitialStreamsSetup
 *   Optional callback which is called when the initial set of Streams have been
 *   setup. Intended to be used by tests.
 * @property {(function()|undefined)} onStartupComplete
 *   Optional callback which is called when startup has completed. Intended to
 *   be used by tests.
 */
shaka.media.StreamingEngine.PlayerInterface;


/**
 * @typedef {{
 *   type: shaka.util.ManifestParserUtils.ContentType,
 *   stream: shakaExtern.Stream,
 *   lastStream: ?shakaExtern.Stream,
 *   lastSegmentReference: shaka.media.SegmentReference,
 *   restoreStreamAfterTrickPlay: ?shakaExtern.Stream,
 *   needInitSegment: boolean,
 *   needPeriodIndex: number,
 *   endOfStream: boolean,
 *   performingUpdate: boolean,
 *   updateTimer: ?number,
 *   waitingToClearBuffer: boolean,
 *   waitingToFlushBuffer: boolean,
 *   clearingBuffer: boolean,
 *   recovering: boolean,
 *   hasError: boolean,
 *   resumeAt: number
 * }}
 *
 * @description
 * Contains the state of a logical stream, i.e., a sequence of segmented data
 * for a particular content type. At any given time there is a Stream object
 * associated with the state of the logical stream.
 *
 * @property {shaka.util.ManifestParserUtils.ContentType} type
 *   The stream's content type, e.g., 'audio', 'video', or 'text'.
 * @property {shakaExtern.Stream} stream
 *   The current Stream.
 * @property {?shakaExtern.Stream} lastStream
 *   The Stream of the last segment that was appended.
 * @property {shaka.media.SegmentReference} lastSegmentReference
 *   The SegmentReference of the last segment that was appended.
 * @property {?shakaExtern.Stream} restoreStreamAfterTrickPlay
 *   The Stream to restore after trick play mode is turned off.
 * @property {boolean} needInitSegment
 *   True indicates that |stream|'s init segment must be inserted before the
 *   next media segment is appended.
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
 * @property {boolean} waitingToFlushBuffer
 *   True indicates that the buffer must be flushed after it is cleared.
 * @property {boolean} clearingBuffer
 *   True indicates that the buffer is being cleared.
 * @property {boolean} recovering
 *   True indicates that the last segment was not appended because it could not
 *   fit in the buffer.
 * @property {boolean} hasError
 *   True indicates that the stream has encountered an error and has stopped
 *   updates.
 * @property {number} resumeAt
 *   An override for the time to start performing updates at.  If the playhead
 *   is behind this time, update_() will still start fetching segments from
 *   this time.  If the playhead is ahead of the time, this field is ignored.
 */
shaka.media.StreamingEngine.MediaState_;


/**
 * The minimum number seconds that will remain buffered after evicting media.
 *
 * @const {number}
 */
shaka.media.StreamingEngine.prototype.MIN_BUFFER_LENGTH = 2;


/** @override */
shaka.media.StreamingEngine.prototype.destroy = function() {
  for (var type in this.mediaStates_) {
    this.cancelUpdate_(this.mediaStates_[type]);
  }

  this.playerInterface_ = null;
  this.manifest_ = null;
  this.setupPeriodPromise_ = null;
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
  var playheadTime = this.playerInterface_.playhead.getTime();
  var needPeriodIndex = this.findPeriodContainingTime_(playheadTime);

  // Get the initial set of Streams.
  var streamsByType = this.playerInterface_.onChooseStreams(
      this.manifest_.periods[needPeriodIndex]);
  if (MapUtils.empty(streamsByType)) {
    shaka.log.error('init: no Streams chosen');
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STREAMING,
        shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
  }

  // Setup the initial set of Streams and then begin each update cycle. After
  // startup completes onUpdate_() will set up the remaining Periods.
  return this.initStreams_(streamsByType).then(function() {
    shaka.log.debug('init: completed initial Stream setup');

    // Subtlety: onInitialStreamsSetup() may call switch() or seeked(), so we
    // must schedule an update beforehand so |updateTimer| is set.
    if (this.playerInterface_ && this.playerInterface_.onInitialStreamsSetup) {
      shaka.log.v1('init: calling onInitialStreamsSetup()...');
      this.playerInterface_.onInitialStreamsSetup();
    }
  }.bind(this));
};


/**
 * Gets the current Period the stream is in.  This Period may not be initialized
 * yet if canSwitch(period) has not been called yet.
 * @return {shakaExtern.Period}
 */
shaka.media.StreamingEngine.prototype.getCurrentPeriod = function() {
  var playheadTime = this.playerInterface_.playhead.getTime();
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
      this.mediaStates_, function(state) {
        // Don't tell the caller about trick play streams.  If we're in trick
        // play, return the stream we will go back to after we exit trick play.
        return state.restoreStreamAfterTrickPlay || state.stream;
      });
};


/**
 * Notifies StreamingEngine that a new text stream was added to the manifest.
 * This initializes the given stream.  This returns a Promise that resolves when
 * the stream has been set up.
 *
 * @param {shakaExtern.Stream} stream
 * @return {!Promise}
 */
shaka.media.StreamingEngine.prototype.notifyNewTextStream = function(stream) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  // Create empty object first and initialize the fields through
  // [] to allow field names to be expressions.
  /** @type {!Object.<string, shakaExtern.Stream>} */
  var streamsByType = {};
  streamsByType[ContentType.TEXT] = stream;
  return this.initStreams_(streamsByType);
};


/**
 * Set trick play on or off.
 * If trick play is on, related trick play streams will be used when possible.
 * @param {boolean} on
 */
shaka.media.StreamingEngine.prototype.setTrickPlay = function(on) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  var mediaState = this.mediaStates_[ContentType.VIDEO];
  if (!mediaState) return;

  var stream = mediaState.stream;
  if (!stream) return;

  shaka.log.debug('setTrickPlay', on);
  if (on) {
    var trickModeVideo = stream.trickModeVideo;
    if (!trickModeVideo) return;  // Can't engage trick play.

    var normalVideo = mediaState.restoreStreamAfterTrickPlay;
    if (normalVideo) return;  // Already in trick play.

    shaka.log.debug('Engaging trick mode stream', trickModeVideo);
    this.switch(ContentType.VIDEO, trickModeVideo, false);
    mediaState.restoreStreamAfterTrickPlay = stream;
  } else {
    var normalVideo = mediaState.restoreStreamAfterTrickPlay;
    if (!normalVideo) return;

    shaka.log.debug('Restoring non-trick-mode stream', normalVideo);
    mediaState.restoreStreamAfterTrickPlay = null;
    this.switch(ContentType.VIDEO, normalVideo, true);
  }
};


/**
 * Switches to the given Stream. |stream| may be from any Variant or any
 * Period.
 *
 * @param {shaka.util.ManifestParserUtils.ContentType} contentType
 *  |stream|'s content type.
 * @param {shakaExtern.Stream} stream
 * @param {boolean} clearBuffer
 */
shaka.media.StreamingEngine.prototype.switch = function(
    contentType, stream, clearBuffer) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var mediaState = this.mediaStates_[contentType];
  if (!mediaState && contentType == ContentType.TEXT &&
      this.config_.ignoreTextStreamFailures) {
    this.notifyNewTextStream(stream);
    return;
  }
  goog.asserts.assert(mediaState, 'switch: expected mediaState to exist');
  if (!mediaState) return;

  if (mediaState.restoreStreamAfterTrickPlay) {
    shaka.log.debug('switch during trick play mode', stream);

    // Already in trick play mode, so stick with trick mode tracks if possible.
    if (stream.trickModeVideo) {
      // Use the trick mode stream, but revert to the new selection later.
      mediaState.restoreStreamAfterTrickPlay = stream;
      stream = stream.trickModeVideo;
      shaka.log.debug('switch found trick play stream', stream);
    } else {
      // No special trick mode video for this stream!
      mediaState.restoreStreamAfterTrickPlay = null;
      shaka.log.debug('switch found no special trick play stream');
    }
  }

  if (contentType == ContentType.TEXT) {
    // Mime types are allowed to change for text streams.
    // Reinitialize the text parser.
    var fullMimeType = shaka.util.StreamUtils.getFullMimeType(
        stream.mimeType, stream.codecs);
    this.playerInterface_.mediaSourceEngine.reinitText(fullMimeType);
  }

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

  if (clearBuffer) {
    if (mediaState.clearingBuffer) {
      // We are already going to clear the buffer, but make sure it is also
      // flushed.
      mediaState.waitingToFlushBuffer = true;
    } else if (mediaState.performingUpdate) {
      // We are performing an update, so we have to wait until it's finished.
      // onUpdate_() will call clearBuffer_() when the update has
      // finished.
      mediaState.waitingToClearBuffer = true;
      mediaState.waitingToFlushBuffer = true;
    } else {
      // Cancel the update timer, if any.
      this.cancelUpdate_(mediaState);
      // Clear right away.
      this.clearBuffer_(mediaState, /* flush */ true);
    }
  }
};


/**
 * Notifies the StreamingEngine that the playhead has moved to a valid time
 * within the presentation timeline.
 */
shaka.media.StreamingEngine.prototype.seeked = function() {
  goog.asserts.assert(this.mediaStates_, 'Must not be destroyed');

  var playheadTime = this.playerInterface_.playhead.getTime();
  var isAllBuffered = Object.keys(this.mediaStates_).every(function(type) {
    return this.playerInterface_.mediaSourceEngine.isBuffered(
        type, playheadTime);
  }.bind(this));

  // Only treat as a buffered seek if every media state has a buffer.  For
  // example, if we have buffered text but not video, we should still clear
  // every buffer so all media states need the same Period.
  if (isAllBuffered) {
    shaka.log.debug(
        '(all): seeked: buffered seek: playheadTime=' + playheadTime);
    return;
  }

  // This was an unbuffered seek (for at least one stream), clear all buffers.
  // Don't clear only some of the buffers because we can become stalled since
  // the media states are waiting for different Periods.
  for (var type in this.mediaStates_) {
    var mediaState = this.mediaStates_[type];
    var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    if (mediaState.clearingBuffer) {
      // We're already clearing the buffer, so we don't need to clear the
      // buffer again.
      shaka.log.debug(logPrefix, 'seeked: already clearing the buffer');
      continue;
    }

    if (mediaState.waitingToClearBuffer) {
      // May not be performing an update, but an update will still happen.
      // See: https://github.com/google/shaka-player/issues/334
      shaka.log.debug(logPrefix, 'seeked: unbuffered seek: already waiting');
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

    if (this.playerInterface_.mediaSourceEngine.bufferStart(type) == null) {
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
    this.clearBuffer_(mediaState, /* flush */ false);
  }
};


/**
 * Initializes the given streams and media states if required.  This will
 * schedule updates for the given types.
 *
 * @param {!Object.<shaka.util.ManifestParserUtils.ContentType,
                    shakaExtern.Stream>} streamsByType
 * @param {number=} opt_resumeAt
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.initStreams_ = function(
    streamsByType, opt_resumeAt) {
  var MapUtils = shaka.util.MapUtils;
  goog.asserts.assert(this.config_,
      'StreamingEngine configure() must be called before init()!');

  // Determine which Period we must buffer.
  var playheadTime = this.playerInterface_.playhead.getTime();
  var needPeriodIndex = this.findPeriodContainingTime_(playheadTime);

  // Init MediaSourceEngine.
  var typeConfig = MapUtils.map(streamsByType, function(stream) {
    return shaka.util.StreamUtils.getFullMimeType(
        stream.mimeType, stream.codecs);
  });

  this.playerInterface_.mediaSourceEngine.init(typeConfig);
  this.setDuration_();

  // Setup the initial set of Streams and then begin each update cycle. After
  // startup completes onUpdate_() will set up the remaining Periods.
  var streams = MapUtils.values(streamsByType);
  return this.setupStreams_(streams).then(function() {
    if (this.destroyed_) return;

    for (var type in streamsByType) {
      var stream = streamsByType[type];
      if (!this.mediaStates_[type]) {
        this.mediaStates_[type] = {
          stream: stream,
          type: type,
          lastStream: null,
          lastSegmentReference: null,
          restoreStreamAfterTrickPlay: null,
          needInitSegment: true,
          needPeriodIndex: needPeriodIndex,
          endOfStream: false,
          performingUpdate: false,
          updateTimer: null,
          waitingToClearBuffer: false,
          waitingToFlushBuffer: false,
          clearingBuffer: false,
          recovering: false,
          hasError: false,
          resumeAt: opt_resumeAt || 0
        };
        this.scheduleUpdate_(this.mediaStates_[type], 0);
      }
    }
  }.bind(this));
};


/**
 * Sets up the given Period if necessary. Calls onError() if an error
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

  var streams = this.manifest_.periods[periodIndex].variants
      .map(function(variant) {
        var result = [];
        if (variant.audio)
          result.push(variant.audio);
        if (variant.video)
          result.push(variant.video);
        if (variant.video && variant.video.trickModeVideo)
          result.push(variant.video.trickModeVideo);
        return result;
      })
      .reduce(Functional.collapseArrays, [])
      .filter(Functional.isNotDuplicate);

  // Add text streams
  streams.push.apply(streams, this.manifest_.periods[periodIndex].textStreams);

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
    this.playerInterface_.onError(error);
    // Don't stop other Periods from being set up.
  }.bind(this));

  return canSwitchRecord.promise;
};


/**
 * Sets up the given Streams if necessary. Does NOT call onError() if an
 * error occurs.
 *
 * @param {!Array.<!shakaExtern.Stream>} streams
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.setupStreams_ = function(streams) {
  // Make sure that all the streams have unique ids.
  // (Duplicate ids will cause the player to hang).
  var uniqueStreamIds = streams.map(function(s) { return s.id; })
                               .filter(shaka.util.Functional.isNotDuplicate);

  goog.asserts.assert(uniqueStreamIds.length == streams.length,
                      'streams should have unique ids');
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
  if (duration < Infinity) {
    this.playerInterface_.mediaSourceEngine.setDuration(duration);
  } else {
    // Not all platforms support infinite durations, so set a finite duration
    // so we can append segments and so the user agent can seek.
    this.playerInterface_.mediaSourceEngine.setDuration(Math.pow(2, 32));
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
    this.clearBuffer_(mediaState, mediaState.waitingToFlushBuffer);
    return;
  }

  // Update the MediaState.
  try {
    var delay = this.update_(mediaState);
    if (delay != null) {
      this.scheduleUpdate_(mediaState, delay);
      mediaState.hasError = false;
    }
  } catch (error) {
    this.playerInterface_.onError(error);
    return;
  }

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');

  var mediaStates = MapUtils.values(this.mediaStates_);

  // Check if we've buffered to the end of the Period.
  this.handlePeriodTransition_(mediaState);

  // Check if we've buffered to the end of the presentation.
  if (mediaStates.every(function(ms) { return ms.endOfStream; })) {
    shaka.log.v1(logPrefix, 'calling endOfStream()...');
    this.playerInterface_.mediaSourceEngine.endOfStream();
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
  var playheadTime = this.playerInterface_.playhead.getTime();

  // Get the next timestamp we need.
  var timeNeeded = this.getTimeNeeded_(mediaState, playheadTime);
  shaka.log.v2(logPrefix, 'timeNeeded=' + timeNeeded);
  mediaState.resumeAt = 0;

  var currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);
  var needPeriodIndex = this.findPeriodContainingTime_(timeNeeded);

  // Get the amount of content we have buffered, accounting for drift.  This
  // is only used to determine if we have meet the buffering goal.  This should
  // be the same way that PlayheadObserver uses.
  var bufferedAhead = this.playerInterface_.mediaSourceEngine.bufferedAheadOf(
      mediaState.type, playheadTime);

  shaka.log.v2(logPrefix,
               'update_:',
               'playheadTime=' + playheadTime,
               'bufferedAhead=' + bufferedAhead);

  var bufferingGoal = this.getBufferingGoal_();

  // Check if we've buffered to the end of the presentation.
  if (timeNeeded >= this.manifest_.presentationTimeline.getDuration()) {
    // We shouldn't rebuffer if the playhead is close to the end of the
    // presentation.
    shaka.log.debug(logPrefix, 'buffered to end of presentation');
    mediaState.endOfStream = true;
    return null;
  }
  mediaState.endOfStream = false;

  // Check if we've buffered to the end of the Period. This should be done
  // before checking segment availability because the new Period may become
  // available once it's switched to. Note that we don't use the non-existence
  // of SegmentReferences as an indicator to determine Period boundaries
  // because SegmentIndexes can provide SegmentReferences outside its Period.
  mediaState.needPeriodIndex = needPeriodIndex;
  if (needPeriodIndex != currentPeriodIndex) {
    shaka.log.debug(logPrefix,
                    'need Period ' + needPeriodIndex,
                    'playheadTime=' + playheadTime,
                    'timeNeeded=' + timeNeeded,
                    'currentPeriodIndex=' + currentPeriodIndex);
    return null;
  }

  // If we've buffered to the buffering goal then schedule an update.
  if (bufferedAhead >= bufferingGoal) {
    shaka.log.v2(logPrefix, 'buffering goal met');

    // Do not try to predict the next update.  Just poll twice every second.
    // The playback rate can change at any time, so any prediction we make now
    // could be terribly invalid soon.
    return 0.5;
  }

  var bufferEnd =
      this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);
  var reference = this.getSegmentReferenceNeeded_(
      mediaState, playheadTime, bufferEnd, currentPeriodIndex);
  if (!reference) {
    // The segment could not be found, does not exist, or is not available.  In
    // any case just try again... if the manifest is incomplete or is not being
    // updated then we'll idle forever; otherwise, we'll end up getting a
    // SegmentReference eventually.
    return 1;
  }

  this.fetchAndAppend_(mediaState, playheadTime, currentPeriodIndex, reference);
  return null;
};


/**
 * Computes buffering goal.
 *
 * @return {number}
 * @private
 */
shaka.media.StreamingEngine.prototype.getBufferingGoal_ = function() {
  goog.asserts.assert(this.manifest_, 'manifest_ should not be null');
  goog.asserts.assert(this.config_, 'config_ should not be null');

  var rebufferingGoal = shaka.util.StreamUtils.getRebufferingGoal(
      this.manifest_, this.config_, this.bufferingGoalScale_);

  return Math.max(
      rebufferingGoal,
      this.bufferingGoalScale_ * this.config_.bufferingGoal);
};


/**
 * Gets the next timestamp needed. Returns the playhead's position if the
 * buffer is empty; otherwise, returns the time at which the last segment
 * appended ends.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @return {number} The next timestamp needed.
 * @throws {!shaka.util.Error} if the buffer is inconsistent with our
 *   expectations.
 * @private
 */
shaka.media.StreamingEngine.prototype.getTimeNeeded_ = function(
    mediaState, playheadTime) {
  // Get the next timestamp we need. We must use |lastSegmentReference|
  // to determine this and not the actual buffer for two reasons:
  //   1. actual segments end slightly before their advertised end times, so
  //      the next timestamp we need is actually larger than |bufferEnd|; and
  //   2. there may be drift (the timestamps in the segments are ahead/behind
  //      of the timestamps in the manifest), but we need drift free times when
  //      comparing times against presentation and Period boundaries.
  if (!mediaState.lastStream || !mediaState.lastSegmentReference) {
    return Math.max(playheadTime, mediaState.resumeAt);
  }

  var lastPeriodIndex =
      this.findPeriodContainingStream_(mediaState.lastStream);
  var lastPeriod = this.manifest_.periods[lastPeriodIndex];
  return lastPeriod.startTime + mediaState.lastSegmentReference.endTime;
};


/**
 * Gets the SegmentReference of the next segment needed.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @param {?number} bufferEnd
 * @param {number} currentPeriodIndex
 * @return {shaka.media.SegmentReference} The SegmentReference of the
 *   next segment needed, or null if a segment could not be found, does not
 *   exist, or is not available.
 * @private
 */
shaka.media.StreamingEngine.prototype.getSegmentReferenceNeeded_ = function(
    mediaState, playheadTime, bufferEnd, currentPeriodIndex) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  if (mediaState.lastSegmentReference &&
      mediaState.stream == mediaState.lastStream) {
    // Something is buffered from the same Stream.
    var position = mediaState.lastSegmentReference.position + 1;
    shaka.log.v2(logPrefix, 'next position known:', 'position=' + position);

    return this.getSegmentReferenceIfAvailable_(
        mediaState, currentPeriodIndex, position);
  }

  var position;

  if (mediaState.lastSegmentReference) {
    // Something is buffered from another Stream.
    goog.asserts.assert(mediaState.lastStream, 'lastStream should not be null');
    shaka.log.v1(logPrefix, 'next position unknown: another Stream buffered');
    var lastPeriodIndex =
        this.findPeriodContainingStream_(mediaState.lastStream);
    var lastPeriod = this.manifest_.periods[lastPeriodIndex];
    position = this.lookupSegmentPosition_(
        mediaState,
        lastPeriod.startTime + mediaState.lastSegmentReference.endTime,
        currentPeriodIndex);
  } else {
    // Either nothing is buffered, or we have cleared part of the buffer.  If
    // we still have some buffered, use that time to find the segment, otherwise
    // start at the playhead time.
    goog.asserts.assert(!mediaState.lastStream, 'lastStream should be null');
    shaka.log.v1(logPrefix, 'next position unknown: nothing buffered');
    position = this.lookupSegmentPosition_(
        mediaState, bufferEnd || playheadTime, currentPeriodIndex);
  }

  if (position == null)
    return null;

  var reference = null;
  if (bufferEnd == null) {
    // If there's positive drift then we need to get the previous segment;
    // however, we don't actually know how much drift there is, so we must
    // unconditionally get the previous segment. If it turns out that there's
    // non-positive drift then we'll just end up buffering beind the playhead a
    // little more than we needed.
    var optimalPosition = Math.max(0, position - 1);
    reference = this.getSegmentReferenceIfAvailable_(
        mediaState, currentPeriodIndex, optimalPosition);
  }
  return reference ||
      this.getSegmentReferenceIfAvailable_(
          mediaState, currentPeriodIndex, position);
};


/**
 * Looks up the position of the segment containing the given timestamp.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} presentationTime The timestamp needed, relative to the
 *   start of the presentation.
 * @param {number} currentPeriodIndex
 * @return {?number} A segment position, or null if a segment was not be found.
 * @private
 */
shaka.media.StreamingEngine.prototype.lookupSegmentPosition_ = function(
    mediaState, presentationTime, currentPeriodIndex) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var currentPeriod = this.manifest_.periods[currentPeriodIndex];

  shaka.log.debug(logPrefix,
                  'looking up segment:',
                  'presentationTime=' + presentationTime,
                  'currentPeriod.startTime=' + currentPeriod.startTime);

  var lookupTime = Math.max(0, presentationTime - currentPeriod.startTime);
  var position = mediaState.stream.findSegmentPosition(lookupTime);

  if (position == null) {
    shaka.log.warning(logPrefix,
                      'cannot find segment:',
                      'currentPeriod.startTime=' + currentPeriod.startTime,
                      'lookupTime=' + lookupTime);
  }

  return position;
};


/**
 * Gets the SegmentReference at the given position if it's available.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} currentPeriodIndex
 * @param {number} position
 * @return {shaka.media.SegmentReference}
 *
 * @private
 */
shaka.media.StreamingEngine.prototype.getSegmentReferenceIfAvailable_ =
    function(mediaState, currentPeriodIndex, position) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  var currentPeriod = this.manifest_.periods[currentPeriodIndex];

  var reference = mediaState.stream.getSegmentReference(position);
  if (!reference) {
    shaka.log.v1(logPrefix,
                 'segment does not exist:',
                 'currentPeriod.startTime=' + currentPeriod.startTime,
                 'position=' + position);
    return null;
  }

  var timeline = this.manifest_.presentationTimeline;
  var availabilityStart = timeline.getSegmentAvailabilityStart();
  var availabilityEnd = timeline.getSegmentAvailabilityEnd();

  if ((currentPeriod.startTime + reference.endTime < availabilityStart) ||
      (currentPeriod.startTime + reference.startTime > availabilityEnd)) {
    shaka.log.v2(logPrefix,
                 'segment is not available:',
                 'currentPeriod.startTime=' + currentPeriod.startTime,
                 'reference.startTime=' + reference.startTime,
                 'reference.endTime=' + reference.endTime,
                 'availabilityStart=' + availabilityStart,
                 'availabilityEnd=' + availabilityEnd);
    return null;
  }

  return reference;
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
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var currentPeriod = this.manifest_.periods[currentPeriodIndex];

  shaka.log.v1(logPrefix,
               'fetchAndAppend_:',
               'playheadTime=' + playheadTime,
               'currentPeriod.startTime=' + currentPeriod.startTime,
               'reference.position=' + reference.position,
               'reference.startTime=' + reference.startTime,
               'reference.endTime=' + reference.endTime);

  // Subtlety: The playhead may move while asynchronous update operations are
  // in progress, so we should avoid calling playhead.getTime() in any
  // callbacks. Furthermore, switch() may be called at any time, so we should
  // also avoid using mediaState.stream or mediaState.needInitSegment in any
  // callbacks too.
  var stream = mediaState.stream;

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
    if (this.destroyed_ || this.fatalError_) return;
    return this.append_(mediaState,
                        playheadTime,
                        currentPeriod,
                        stream,
                        reference,
                        results[1]);
  }.bind(this)).then(function() {
    if (this.destroyed_ || this.fatalError_) return;

    mediaState.performingUpdate = false;
    mediaState.recovering = false;

    if (!mediaState.waitingToClearBuffer)
      this.playerInterface_.onSegmentAppended();

    // Update right away.
    this.scheduleUpdate_(mediaState, 0);

    // Subtlety: handleStartup_() calls onStartupComplete() which may call
    // switch() or seeked(), so we must schedule an update beforehand so
    // |updateTimer| is set.
    this.handleStartup_(mediaState, stream);

    shaka.log.v1(logPrefix, 'finished fetch and append');
  }.bind(this)).catch(function(error) {
    if (this.destroyed_ || this.fatalError_) return;
    goog.asserts.assert(error instanceof shaka.util.Error,
                        'Should only receive a Shaka error');

    mediaState.performingUpdate = false;

    if (error.code == shaka.util.Error.Code.BAD_HTTP_STATUS ||
        error.code == shaka.util.Error.Code.HTTP_ERROR ||
        error.code == shaka.util.Error.Code.TIMEOUT) {
      this.handleNetworkError_(mediaState, error);
    } else if (error.code == shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR) {
      this.handleQuotaExceeded_(mediaState, error);
    } else {
      shaka.log.error(logPrefix, 'failed fetch and append: code=' + error.code);
      if (mediaState.type == ContentType.TEXT &&
          this.config_.ignoreTextStreamFailures) {
        shaka.log.warning(logPrefix,
            'Text stream failed to parse. Proceeding without it.');
        delete this.mediaStates_[ContentType.TEXT];
      } else {
        mediaState.hasError = true;
        error.severity = shaka.util.Error.Severity.CRITICAL;
        this.playerInterface_.onError(error);
      }
    }
  }.bind(this));
};


/**
 * Handles a network error.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {!shaka.util.Error} error
 * @private
 */
shaka.media.StreamingEngine.prototype.handleNetworkError_ = function(
    mediaState, error) {
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  if (mediaState.type == ContentType.TEXT &&
      this.config_.ignoreTextStreamFailures &&
      error.code == shaka.util.Error.Code.BAD_HTTP_STATUS) {
    shaka.log.warning(logPrefix,
        'Text stream failed to download. Proceeding without it.');
    delete this.mediaStates_[ContentType.TEXT];
  } else {
    error.severity = shaka.util.Error.Severity.RECOVERABLE;
    this.playerInterface_.onError(error);

    shaka.log.warning(logPrefix, 'Network error. Retrying...');
    this.scheduleUpdate_(mediaState, 4);
  }
};


/**
 * Handles a QUOTA_EXCEEDED_ERROR.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {!shaka.util.Error} error
 * @private
 */
shaka.media.StreamingEngine.prototype.handleQuotaExceeded_ = function(
    mediaState, error) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // The segment cannot fit into the SourceBuffer. Ideally, MediaSource would
  // have evicted old data to accommodate the segment; however, it may have
  // failed to do this if the segment is very large, or if it could not find
  // a suitable time range to remove.
  //
  // We can overcome the latter by trying to append the segment again;
  // however, to avoid continuous QuotaExceededErrors we must reduce the size
  // of the buffer going forward.
  //
  // If we've recently reduced the buffering goals, wait until the stream
  // which caused the first QuotaExceededError recovers. Doing this ensures
  // we don't reduce the buffering goals too quickly.

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  var mediaStates = shaka.util.MapUtils.values(this.mediaStates_);
  var waitingForAnotherStreamToRecover = mediaStates.some(function(ms) {
    return ms != mediaState && ms.recovering;
  });

  if (!waitingForAnotherStreamToRecover) {
    // Reduction schedule: 80%, 60%, 40%, 20%, 16%, 12%, 8%, 4%, fail.
    // Note: percentages are used for comparisons to avoid rounding errors.
    var percentBefore = Math.round(100 * this.bufferingGoalScale_);
    if (percentBefore > 20) {
      this.bufferingGoalScale_ -= 0.2;
    } else if (percentBefore > 4) {
      this.bufferingGoalScale_ -= 0.04;
    } else {
      shaka.log.error(
          logPrefix, 'MediaSource threw QuotaExceededError too many times');
      mediaState.hasError = true;
      this.fatalError_ = true;
      this.playerInterface_.onError(error);
      return;
    }
    var percentAfter = Math.round(100 * this.bufferingGoalScale_);
    shaka.log.warning(
        logPrefix,
        'MediaSource threw QuotaExceededError:',
        'reducing buffering goals by ' + (100 - percentAfter) + '%');
    mediaState.recovering = true;
  } else {
    shaka.log.debug(
        logPrefix,
        'MediaSource threw QuotaExceededError:',
        'waiting for another stream to recover...');
  }

  // QuotaExceededError gets thrown if evication didn't help to make room
  // for a segment. We want to wait for a while (4 seconds is just an
  // arbitrary number) before updating to give the playhead a chance to
  // advance, so we don't immidiately throw again.
  this.scheduleUpdate_(mediaState, 4);
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
  shaka.log.v1(logPrefix, 'setting append window end to ' + appendWindowEnd);
  var setStreamProperties =
      this.playerInterface_.mediaSourceEngine.setStreamProperties(
          mediaState.type, timestampOffset, appendWindowEnd);

  if (!mediaState.stream.initSegmentReference) {
    // The Stream is self initializing.
    return setStreamProperties;
  }

  shaka.log.v1(logPrefix, 'fetching init segment');
  var fetchInit = this.fetch_(mediaState.stream.initSegmentReference);
  var appendInit = fetchInit.then(function(initSegment) {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending init segment');

    return this.playerInterface_.mediaSourceEngine.appendBuffer(
        mediaState.type, initSegment, null /* startTime */, null /* endTime */);
  }.bind(this)).catch(function(error) {
    mediaState.needInitSegment = true;
    return Promise.reject(error);
  });

  return Promise.all([setStreamProperties, appendInit]);
};


/**
 * Appends the given segment and evicts content if required to append.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} playheadTime
 * @param {shakaExtern.Period} period
 * @param {shakaExtern.Stream} stream
 * @param {!shaka.media.SegmentReference} reference
 * @param {!ArrayBuffer} segment
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.append_ = function(
    mediaState, playheadTime, period, stream, reference, segment) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  if (stream.containsEmsgBoxes) {
    new shaka.util.Mp4Parser()
        .fullBox('emsg', this.parseEMSG_.bind(this, period, reference))
        .parse(segment);
  }

  return this.evict_(mediaState, playheadTime).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending media segment');

    return this.playerInterface_.mediaSourceEngine.appendBuffer(
        mediaState.type, segment, reference.startTime + period.startTime,
        reference.endTime + period.startTime);
  }.bind(this)).then(function() {
    if (this.destroyed_) return;
    shaka.log.v2(logPrefix, 'appended media segment');

    // We must use |stream| because switch() may have been called.
    mediaState.lastStream = stream;
    mediaState.lastSegmentReference = reference;

    return Promise.resolve();
  }.bind(this));
};


/**
 * Parse the EMSG box from a MP4 container.
 *
 * @param {!shakaExtern.Period} period
 * @param {!shaka.media.SegmentReference} reference
 * @param {!shaka.util.Mp4Parser.ParsedBox} box
 * @private
 */
shaka.media.StreamingEngine.prototype.parseEMSG_ = function(
    period, reference, box) {

  var schemeId = box.reader.readTerminatedString();
  // read rest of the data and dispatch event to the application
  var value = box.reader.readTerminatedString();
  var timescale = box.reader.readUint32();
  var presentationTimeDelta = box.reader.readUint32();
  var eventDuration = box.reader.readUint32();
  var id = box.reader.readUint32();
  var messageData = box.reader.readBytes(
      box.reader.getLength() - box.reader.getPosition());

  var startTime = period.startTime + reference.startTime +
      (presentationTimeDelta / timescale);

  // See DASH sec. 5.10.4.1
  // A special scheme in DASH used to signal manifest updates.
  if (schemeId == 'urn:mpeg:dash:event:2012') {
    this.playerInterface_.onManifestUpdate();
  } else {
    /** @type {shakaExtern.EmsgInfo} */
    var emsg = {
      startTime: startTime,
      endTime: startTime + (eventDuration / timescale),
      schemeIdUri: schemeId,
      value: value,
      timescale: timescale,
      presentationTimeDelta: presentationTimeDelta,
      eventDuration: eventDuration,
      id: id,
      messageData: messageData
    };

    var event = new shaka.util.FakeEvent('emsg', {'detail': emsg});
    this.playerInterface_.onEvent(event);
  }
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
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  shaka.log.v2(logPrefix, 'checking buffer length');

  var startTime =
      this.playerInterface_.mediaSourceEngine.bufferStart(mediaState.type);
  if (startTime == null) {
    shaka.log.v2(logPrefix,
                 'buffer behind okay because nothing buffered:',
                 'playheadTime=' + playheadTime,
                 'bufferBehind=' + this.config_.bufferBehind);
    return Promise.resolve();
  }
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

  return this.playerInterface_.mediaSourceEngine.remove(
      mediaState.type, startTime, startTime + overflow).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'evicted ' + overflow + ' seconds');
  }.bind(this));
};


/**
 * Sets up all known Periods when startup completes; otherwise, does nothing.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState The last
 *   MediaState updated.
 * @param {shakaExtern.Stream} stream
 * @private
 */
shaka.media.StreamingEngine.prototype.handleStartup_ = function(
    mediaState, stream) {
  var Functional = shaka.util.Functional;
  var MapUtils = shaka.util.MapUtils;
  var ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (this.startupComplete_)
    return;

  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  var mediaStates = MapUtils.values(this.mediaStates_);
  this.startupComplete_ = mediaStates.every(function(ms) {
    // Startup completes once we have buffered at least one segment from each
    // MediaState, not counting text.
    if (ms.type == ContentType.TEXT) return true;
    return !ms.waitingToClearBuffer &&
           !ms.clearingBuffer &&
           ms.lastSegmentReference;
  });

  if (!this.startupComplete_)
    return;

  shaka.log.debug(logPrefix, 'startup complete');

  // We must use |stream| because switch() may have been called.
  var currentPeriodIndex = this.findPeriodContainingStream_(stream);

  goog.asserts.assert(
      mediaStates.every(function(ms) {
        // It is possible for one stream (usually text) to buffer the whole
        // Period and need the next one.
        return ms.needPeriodIndex == currentPeriodIndex ||
            ms.needPeriodIndex == currentPeriodIndex + 1;
      }),
      logPrefix + ' expected all MediaStates to need same Period');

  // Setup the current Period if necessary, which is likely since the current
  // Period is probably the initial one.
  if (!this.canSwitchPeriod_[currentPeriodIndex]) {
    this.setupPeriod_(currentPeriodIndex).then(function() {
      shaka.log.v1(logPrefix, 'calling onCanSwitch()...');
      this.playerInterface_.onCanSwitch();
    }.bind(this)).catch(Functional.noop);
  }

  // Now setup all known Periods.
  for (var i = 0; i < this.manifest_.periods.length; ++i) {
    this.setupPeriod_(i).catch(Functional.noop);
  }

  if (this.playerInterface_.onStartupComplete) {
    shaka.log.v1(logPrefix, 'calling onStartupComplete()...');
    this.playerInterface_.onStartupComplete();
  }
};


/**
 * Calls onChooseStreams() when necessary.
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
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  var currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);
  if (mediaState.needPeriodIndex == currentPeriodIndex)
    return;

  var needPeriodIndex = mediaState.needPeriodIndex;

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  var mediaStates = MapUtils.values(this.mediaStates_);

  // For a Period transition to work, all media states must need the same
  // Period.  If a stream needs a different Period than the one it currently
  // has, it will try to transition or stop updates assuming that another stream
  // will handle it.  This only works when all streams either need the same
  // Period or are still performing updates.
  goog.asserts.assert(
      mediaStates.every(function(ms) {
        return ms.needPeriodIndex == needPeriodIndex || ms.hasError ||
            !shaka.media.StreamingEngine.isIdle_(ms);
      }),
      'All MediaStates should need the same Period be performing updates.');

  // Only call onChooseStreams() when all MediaStates need the same Period.
  var needSamePeriod = mediaStates.every(function(ms) {
    return ms.needPeriodIndex == needPeriodIndex;
  });
  if (!needSamePeriod) {
    shaka.log.debug(
        logPrefix, 'not all MediaStates need Period ' + needPeriodIndex);
    return;
  }

  // Only call onChooseStreams() once per Period transition.
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
  // onChooseStreams().
  this.setupPeriod_(needPeriodIndex).then(function() {
    if (this.destroyed_) return;

    // If we seek during a Period transition, we can start another transition.
    // So we need to verify that:
    // - We are still in need of the same Period.
    // - All streams are still idle.
    // - The current stream is not in the needed Period (another transition
    //   handled it).
    var allReady = mediaStates.every(function(ms) {
      var isIdle = shaka.media.StreamingEngine.isIdle_(ms);
      var currentPeriodIndex = this.findPeriodContainingStream_(ms.stream);
      return isIdle && ms.needPeriodIndex == needPeriodIndex &&
          currentPeriodIndex != needPeriodIndex;
    }.bind(this));
    if (!allReady) {
      // TODO: Write unit tests for this case.
      shaka.log.debug(logPrefix, 'ignoring transition to Period',
                      needPeriodIndex, 'since another is happening');
      return;
    }

    var needPeriod = this.manifest_.periods[needPeriodIndex];

    shaka.log.v1(logPrefix, 'calling onChooseStreams()...');
    var streamsByType = this.playerInterface_.onChooseStreams(needPeriod);

    // Vet |streamsByType| before switching.
    for (var type in this.mediaStates_) {
      if (streamsByType[type] || type == ContentType.TEXT) continue;

      shaka.log.error(logPrefix,
                      'invalid Streams chosen: missing ' + type + ' Stream');
      this.playerInterface_.onError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STREAMING,
          shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
      return;
    }

    for (var type in streamsByType) {
      if (this.mediaStates_[type]) continue;
      if (type == ContentType.TEXT) {
        // initStreams_ will switch streams and schedule an update.
        this.initStreams_(
            {text: streamsByType[ContentType.TEXT]}, needPeriod.startTime);
        delete streamsByType[type];
        continue;
      }

      shaka.log.error(logPrefix,
                      'invalid Streams chosen: unusable ' + type + ' Stream');
      this.playerInterface_.onError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STREAMING,
          shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
      return;
    }

    for (var type in this.mediaStates_) {
      var stream = streamsByType[type];
      if (stream) {
        this.switch(type, stream, /* clearBuffer */ false);
        this.scheduleUpdate_(this.mediaStates_[type], 0);
      } else {
        goog.asserts.assert(type == ContentType.TEXT, 'Invalid streams chosen');
        delete this.mediaStates_[type];
      }
    }

    // We've already set up the Period so call onCanSwitch() right now.
    shaka.log.v1(logPrefix, 'calling onCanSwitch()...');
    this.playerInterface_.onCanSwitch();
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
  goog.asserts.assert(this.manifest_, 'Must not be destroyed');
  return shaka.util.StreamUtils.findPeriodContainingTime(this.manifest_, time);
};


/**
 * @param {!shakaExtern.Stream} stream
 * @return {number} The index of the Period which contains |stream|, or -1 if
 *   no Period contains |stream|.
 * @private
 */
shaka.media.StreamingEngine.prototype.findPeriodContainingStream_ = function(
    stream) {
  goog.asserts.assert(this.manifest_, 'Must not be destroyed');
  return shaka.util.StreamUtils.findPeriodContainingStream(
      this.manifest_, stream);
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
      reference.getUris(), this.config_.retryParameters);

  // Set Range header. Note that some web servers don't accept Range headers,
  // so don't set one if it's not strictly required.
  if ((reference.startByte != 0) || (reference.endByte != null)) {
    var range = 'bytes=' + reference.startByte + '-';
    if (reference.endByte != null) range += reference.endByte;
    request.headers['Range'] = range;
  }

  shaka.log.v2('fetching: reference=' + reference);
  var p = this.playerInterface_.netEngine.request(requestType, request);
  return p.then(function(response) {
    return response.data;
  });
};


/**
 * Clears the buffer and schedules another update.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {boolean} flush
 * @private
 */
shaka.media.StreamingEngine.prototype.clearBuffer_ =
    function(mediaState, flush) {
  var logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  goog.asserts.assert(
      !mediaState.performingUpdate && (mediaState.updateTimer == null),
      logPrefix + ' unexpected call to clearBuffer_()');

  mediaState.waitingToClearBuffer = false;
  mediaState.waitingToFlushBuffer = false;
  mediaState.clearingBuffer = true;

  shaka.log.debug(logPrefix, 'clearing buffer');
  var p = this.playerInterface_.mediaSourceEngine.clear(mediaState.type);
  p.then(function() {
    if (!this.destroyed_ && flush) {
      return this.playerInterface_.mediaSourceEngine.flush(mediaState.type);
    }
  }.bind(this)).then(function() {
    if (this.destroyed_) return;
    shaka.log.debug(logPrefix, 'cleared buffer');
    mediaState.lastStream = null;
    mediaState.lastSegmentReference = null;
    mediaState.clearingBuffer = false;
    mediaState.endOfStream = false;
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
