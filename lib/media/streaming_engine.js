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
goog.require('shaka.net.Backoff');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.DelayedTick');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Networking');
goog.require('shaka.util.Periods');
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
 * @param {shaka.extern.Manifest} manifest
 * @param {shaka.media.StreamingEngine.PlayerInterface} playerInterface
 *
 * @constructor
 * @struct
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.StreamingEngine = function(manifest, playerInterface) {
  /** @private {?shaka.media.StreamingEngine.PlayerInterface} */
  this.playerInterface_ = playerInterface;

  /** @private {?shaka.extern.Manifest} */
  this.manifest_ = manifest;

  /** @private {?shaka.extern.StreamingConfiguration} */
  this.config_ = null;

  /** @private {number} */
  this.bufferingGoalScale_ = 1;

  /** @private {Promise} */
  this.setupPeriodPromise_ = Promise.resolve();

  /**
   * Maps a Period's index to an object that indicates that either
   *   1. the Period has not been set up (undefined).
   *   2. the Period is being set up ([a PublicPromise, false]).
   *   3. the Period is set up (i.e., all Streams within the Period are set up)
   *      and can be switched to ([a PublicPromise, true]).
   *
   * @private {Array.<?{promise: shaka.util.PublicPromise, resolved: boolean}>}
   */
  this.canSwitchPeriod_ = [];

  /**
   * Maps a Stream's ID to an object that indicates that either
   *   1. the Stream has not been set up (undefined).
   *   2. the Stream is being set up ([a Promise instance, false]).
   *   3. the Stream is set up and can be switched to
   *      ([a Promise instance, true]).
   *
   * @private {!Map.<number,
   *                 ?{promise: shaka.util.PublicPromise, resolved: boolean}>}
   */
  this.canSwitchStream_ = new Map();

  /**
   * Maps a content type, e.g., 'audio', 'video', or 'text', to a MediaState.
   *
   * @private {!Map.<shaka.util.ManifestParserUtils.ContentType,
                       !shaka.media.StreamingEngine.MediaState_>}
   */
  this.mediaStates_ = new Map();

  /**
   * Set to true once one segment of each content type has been buffered.
   *
   * @private {boolean}
   */
  this.startupComplete_ = false;

  /**
   * Used for delay and backoff of failure callbacks, so that apps do not retry
   * instantly.
   *
   * @private {shaka.net.Backoff}
   */
  this.failureCallbackBackoff_ = null;

  /**
   * Set to true on fatal error.  Interrupts fetchAndAppend_().
   *
   * @private {boolean}
   */
  this.fatalError_ = false;

  /** @private {boolean} */
  this.destroyed_ = false;

  /**
   * Set to true when a request to unload text stream comes in. This is used
   * since loading new text stream is async, the request of unloading text
   * stream might come in before setting up new text stream is finished.
   * @private {boolean}
   */
  this.unloadingTextStream_ = false;

  /** @private {number} */
  this.textStreamSequenceId_ = 0;
};


/**
 * @typedef {{
 *   variant: (?shaka.extern.Variant|undefined),
 *   text: ?shaka.extern.Stream
 * }}
 *
 * @property {(?shaka.extern.Variant|undefined)} variant
 *   The chosen variant.  May be omitted for text re-init.
 * @property {?shaka.extern.Stream} text
 *   The chosen text stream.
 */
shaka.media.StreamingEngine.ChosenStreams;


/**
 * @typedef {{
 *   getPresentationTime: function():number,
 *   getBandwidthEstimate: function():number,
 *   mediaSourceEngine: !shaka.media.MediaSourceEngine,
 *   netEngine: shaka.net.NetworkingEngine,
 *   onChooseStreams: function(!shaka.extern.Period):
 *                        shaka.media.StreamingEngine.ChosenStreams,
 *   onCanSwitch: function(),
 *   onError: function(!shaka.util.Error),
 *   onEvent: function(!Event),
 *   onManifestUpdate: function(),
 *   onSegmentAppended: function(),
 *   onInitialStreamsSetup: (function()|undefined),
 *   onStartupComplete: (function()|undefined)
 * }}
 *
 * @property {function():number} getPresentationTime
 *   Get the position in the presentation (in seconds) of the content that the
 *   viewer is seeing on screen right now.
 * @property {function():number} getBandwidthEstimate
 *   Get the estimated bandwidth in bits per second.
 * @property {!shaka.media.MediaSourceEngine} mediaSourceEngine
 *   The MediaSourceEngine. The caller retains ownership.
 * @property {shaka.net.NetworkingEngine} netEngine
 *   The NetworkingEngine instance to use. The caller retains ownership.
 * @property {function(!shaka.extern.Period):
 *                shaka.media.StreamingEngine.ChosenStreams} onChooseStreams
 *   Called by StreamingEngine when the given Period needs to be buffered.
 *   StreamingEngine will switch to the variant and text stream returned from
 *   this function.
 *   The owner cannot call switch() directly until the StreamingEngine calls
 *   onCanSwitch().
 * @property {function()} onCanSwitch
 *   Called by StreamingEngine when the Period is set up and switching is
 *   permitted.
 * @property {function(!shaka.util.Error)} onError
 *   Called when an error occurs. If the error is recoverable (see
 *   {@link shaka.util.Error}) then the caller may invoke either
 *   StreamingEngine.switch*() or StreamingEngine.seeked() to attempt recovery.
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
 *   stream: shaka.extern.Stream,
 *   lastStream: ?shaka.extern.Stream,
 *   lastSegmentReference: shaka.media.SegmentReference,
 *   restoreStreamAfterTrickPlay: ?shaka.extern.Stream,
 *   needInitSegment: boolean,
 *   needPeriodIndex: number,
 *   endOfStream: boolean,
 *   performingUpdate: boolean,
 *   updateTimer: shaka.util.DelayedTick,
 *   waitingToClearBuffer: boolean,
 *   waitingToFlushBuffer: boolean,
 *   clearBufferSafeMargin: number,
 *   clearingBuffer: boolean,
 *   recovering: boolean,
 *   hasError: boolean,
 *   resumeAt: number,
 *   operation: shaka.net.NetworkingEngine.PendingRequest
 * }}
 *
 * @description
 * Contains the state of a logical stream, i.e., a sequence of segmented data
 * for a particular content type. At any given time there is a Stream object
 * associated with the state of the logical stream.
 *
 * @property {shaka.util.ManifestParserUtils.ContentType} type
 *   The stream's content type, e.g., 'audio', 'video', or 'text'.
 * @property {shaka.extern.Stream} stream
 *   The current Stream.
 * @property {?shaka.extern.Stream} lastStream
 *   The Stream of the last segment that was appended.
 * @property {shaka.media.SegmentReference} lastSegmentReference
 *   The SegmentReference of the last segment that was appended.
 * @property {?shaka.extern.Stream} restoreStreamAfterTrickPlay
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
 * @property {shaka.util.DelayedTick} updateTimer
 *   A timer used to update the media state.
 * @property {boolean} waitingToClearBuffer
 *   True indicates that the buffer must be cleared after the current update
 *   finishes.
 * @property {boolean} waitingToFlushBuffer
 *   True indicates that the buffer must be flushed after it is cleared.
 * @property {number} clearBufferSafeMargin
 *   The amount of buffer to retain when clearing the buffer after the update.
 * @property {boolean} clearingBuffer
 *   True indicates that the buffer is being cleared.
 * @property {boolean} recovering
 *   True indicates that the last segment was not appended because it could not
 *   fit in the buffer.
 * @property {boolean} hasError
 *   True indicates that the stream has encountered an error and has stopped
 *   updating.
 * @property {number} resumeAt
 *   An override for the time to start performing updates at.  If the playhead
 *   is behind this time, update_() will still start fetching segments from
 *   this time.  If the playhead is ahead of the time, this field is ignored.
 * @property {shaka.net.NetworkingEngine.PendingRequest} operation
 *   Operation with the number of bytes to be downloaded.
 */
shaka.media.StreamingEngine.MediaState_;


/**
 * The fudge factor for appendWindowStart.  By adjusting the window backward, we
 * avoid rounding errors that could cause us to remove the keyframe at the start
 * of the Period.
 *
 * NOTE: This was increased as part of the solution to
 * https://github.com/google/shaka-player/issues/1281
 *
 * @const {number}
 * @private
 */
shaka.media.StreamingEngine.APPEND_WINDOW_START_FUDGE_ = 0.1;


/**
 * The fudge factor for appendWindowEnd.  By adjusting the window backward, we
 * avoid rounding errors that could cause us to remove the last few samples of
 * the Period.  This rounding error could then create an artificial gap and a
 * stutter when the gap-jumping logic takes over.
 *
 * https://github.com/google/shaka-player/issues/1597
 *
 * @const {number}
 * @private
 */
shaka.media.StreamingEngine.APPEND_WINDOW_END_FUDGE_ = 0.01;


/**
 * The maximum number of segments by which a stream can get ahead of other
 * streams.
 *
 * Introduced to keep StreamingEngine from letting one media type get too far
 * ahead of another.  For example, audio segments are typically much smaller
 * than video segments, so in the time it takes to fetch one video segment, we
 * could fetch many audio segments.  This doesn't help with buffering, though,
 * since the intersection of the two buffered ranges is what counts.
 *
 * @const {number}
 * @private
 */
shaka.media.StreamingEngine.MAX_RUN_AHEAD_SEGMENTS_ = 1;


/** @override */
shaka.media.StreamingEngine.prototype.destroy = function() {
  for (const state of this.mediaStates_.values()) {
    this.cancelUpdate_(state);
  }

  this.mediaStates_.clear();
  this.canSwitchStream_.clear();

  this.playerInterface_ = null;
  this.manifest_ = null;
  this.setupPeriodPromise_ = null;
  this.canSwitchPeriod_ = null;
  this.config_ = null;

  this.destroyed_ = true;

  return Promise.resolve();
};


/**
 * Called by the Player to provide an updated configuration any time it changes.
 * Must be called at least once before init().
 *
 * @param {shaka.extern.StreamingConfiguration} config
 */
shaka.media.StreamingEngine.prototype.configure = function(config) {
  this.config_ = config;

  // Create separate parameters for backoff during streaming failure.

  /** @type {shaka.extern.RetryParameters} */
  let failureRetryParams = {
    // The term "attempts" includes the initial attempt, plus all retries.
    // In order to see a delay, there would have to be at least 2 attempts.
    maxAttempts: Math.max(config.retryParameters.maxAttempts, 2),
    baseDelay: config.retryParameters.baseDelay,
    backoffFactor: config.retryParameters.backoffFactor,
    fuzzFactor: config.retryParameters.fuzzFactor,
    timeout: 0,  // irrelevant
  };

  // We don't want to ever run out of attempts.  The application should be
  // allowed to retry streaming infinitely if it wishes.
  let autoReset = true;
  this.failureCallbackBackoff_ =
      new shaka.net.Backoff(failureRetryParams, autoReset);
};


/**
 * Initialize and start streaming.
 *
 * By calling this method, streaming engine will choose the initial streams by
 * calling out to |onChooseStreams| followed by |onCanSwitch|. When streaming
 * engine switches periods, it will call |onChooseStreams| followed by
 * |onCanSwitch|.
 *
 * Asking streaming engine to switch streams between |onChooseStreams| and
 * |onChangeSwitch| is not supported.
 *
 * After the StreamingEngine calls onChooseStreams(p) for the first time, it
 * will begin setting up the Streams returned from that function and
 * subsequently switch to them. However, the StreamingEngine will not begin
 * setting up any other Streams until at least one segment from each of the
 * initial set of Streams has been buffered (this reduces startup latency).
 *
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
shaka.media.StreamingEngine.prototype.start = async function() {
  goog.asserts.assert(this.config_,
      'StreamingEngine configure() must be called before init()!');

  // Determine which Period we must buffer.
  const presentationTime = this.playerInterface_.getPresentationTime();
  const needPeriodIndex = this.findPeriodForTime_(presentationTime);

  // Get the initial set of Streams.
  const initialStreams = this.playerInterface_.onChooseStreams(
      this.manifest_.periods[needPeriodIndex]);
  if (!initialStreams.variant && !initialStreams.text) {
    shaka.log.error('init: no Streams chosen');
    return new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STREAMING,
        shaka.util.Error.Code.INVALID_STREAMS_CHOSEN);
  }

  // Setup the initial set of Streams and then begin each update cycle. After
  // startup completes onUpdate_() will set up the remaining Periods.
  await this.initStreams_(
      initialStreams.variant ? initialStreams.variant.audio : null,
      initialStreams.variant ? initialStreams.variant.video : null,
      initialStreams.text,
      presentationTime);

  if (this.destroyed_) {
    return;
  }

  shaka.log.debug('init: completed initial Stream setup');

  // Subtlety: onInitialStreamsSetup() may call switch() or seeked(), so we
  // must schedule an update beforehand so |updateTimer| is set.
  if (this.playerInterface_ && this.playerInterface_.onInitialStreamsSetup) {
    shaka.log.v1('init: calling onInitialStreamsSetup()...');
    this.playerInterface_.onInitialStreamsSetup();
  }
};


/**
 * Gets the Period in which we are currently buffering.  This might be different
 * from the Period which contains the Playhead.
 * @return {?shaka.extern.Period}
 */
shaka.media.StreamingEngine.prototype.getBufferingPeriod = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const video = this.mediaStates_.get(ContentType.VIDEO);
  if (video) { return this.manifest_.periods[video.needPeriodIndex]; }

  const audio = this.mediaStates_.get(ContentType.AUDIO);
  if (audio) { return this.manifest_.periods[audio.needPeriodIndex]; }

  return null;
};


/**
 * Get the audio stream which we are currently buffering.  Returns null if there
 * is no audio streaming.
 * @return {?shaka.extern.Stream}
 */
shaka.media.StreamingEngine.prototype.getBufferingAudio = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return this.getStream_(ContentType.AUDIO);
};


/**
 * Get the video stream which we are currently buffering.  Returns null if there
 * is no video streaming.
 * @return {?shaka.extern.Stream}
 */
shaka.media.StreamingEngine.prototype.getBufferingVideo = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return this.getStream_(ContentType.VIDEO);
};


/**
 * Get the text stream which we are currently buffering.  Returns null if there
 * is no text streaming.
 * @return {?shaka.extern.Stream}
 */
shaka.media.StreamingEngine.prototype.getBufferingText = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return this.getStream_(ContentType.TEXT);
};


/**
 * Get the stream of the given type which we are currently buffering.  Returns
 * null if there is no stream for the given type.
 * @param {shaka.util.ManifestParserUtils.ContentType} type
 * @return {?shaka.extern.Stream}
 * @private
*/
shaka.media.StreamingEngine.prototype.getStream_ = function(type) {
  const state = this.mediaStates_.get(type);

  if (state) {
    // Don't tell the caller about trick play streams.  If we're in trick
    // play, return the stream we will go back to after we exit trick play.
    return state.restoreStreamAfterTrickPlay || state.stream;
  } else {
    return null;
  }
};


/**
 * Notifies StreamingEngine that a new text stream was added to the manifest.
 * This initializes the given stream. This returns a Promise that resolves when
 * the stream has been set up, and a media state has been created.
 *
 * @param {shaka.extern.Stream} stream
 * @return {!Promise}
 */
shaka.media.StreamingEngine.prototype.loadNewTextStream = async function(
    stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  // Clear MediaSource's buffered text, so that the new text stream will
  // properly replace the old buffered text.
  await this.playerInterface_.mediaSourceEngine.clear(ContentType.TEXT);

  // Since setupStreams_() is async, if the user hides/shows captions quickly,
  // there would be a race condition that a new text media state is created
  // but the old media state is not yet deleted.
  // The Sequence Id is to avoid that race condition.
  this.textStreamSequenceId_++;
  this.unloadingTextStream_ = false;
  let currentSequenceId = this.textStreamSequenceId_;

  let mediaSourceEngine = this.playerInterface_.mediaSourceEngine;

  const streamMap = new Map();
  const streamSet = new Set();

  streamMap.set(ContentType.TEXT, stream);
  streamSet.add(stream);

  await mediaSourceEngine.init(streamMap, /** forceTansmuxTS */ false);
  if (this.destroyed_) { return; }

  await this.setupStreams_(streamSet);
  if (this.destroyed_) { return; }

  const showText = this.playerInterface_
      .mediaSourceEngine
      .getTextDisplayer()
      .isTextVisible();

  const streamText = showText || this.config_.alwaysStreamText;

  if ((this.textStreamSequenceId_ == currentSequenceId) &&
      !this.mediaStates_.has(ContentType.TEXT) &&
      !this.unloadingTextStream_ && streamText) {
    const presentationTime = this.playerInterface_.getPresentationTime();
    const needPeriodIndex = this.findPeriodForTime_(presentationTime);

    const state = this.createMediaState_(stream,
                                         needPeriodIndex,
                                         /* resumeAt= */ 0);

    this.mediaStates_.set(ContentType.TEXT, state);
    this.scheduleUpdate_(state, 0);
  }
};


/**
 * Stop fetching text stream when the user chooses to hide the captions.
 */
shaka.media.StreamingEngine.prototype.unloadTextStream = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  this.unloadingTextStream_ = true;

  const state = this.mediaStates_.get(ContentType.TEXT);
  if (state) {
    this.cancelUpdate_(state);
    this.mediaStates_.delete(ContentType.TEXT);
  }
};


/**
 * Set trick play on or off.
 * If trick play is on, related trick play streams will be used when possible.
 * @param {boolean} on
 */
shaka.media.StreamingEngine.prototype.setTrickPlay = function(on) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const mediaState = this.mediaStates_.get(ContentType.VIDEO);
  if (!mediaState) return;

  let stream = mediaState.stream;
  if (!stream) return;

  shaka.log.debug('setTrickPlay', on);
  if (on) {
    let trickModeVideo = stream.trickModeVideo;
    if (!trickModeVideo) return;  // Can't engage trick play.

    let normalVideo = mediaState.restoreStreamAfterTrickPlay;
    if (normalVideo) return;  // Already in trick play.

    shaka.log.debug('Engaging trick mode stream', trickModeVideo);
    this.switchInternal_(trickModeVideo, /* clearBuffer= */ false,
        /* safeMargin= */ 0, /* force= */ false);
    mediaState.restoreStreamAfterTrickPlay = stream;
  } else {
    let normalVideo = mediaState.restoreStreamAfterTrickPlay;
    if (!normalVideo) return;

    shaka.log.debug('Restoring non-trick-mode stream', normalVideo);
    mediaState.restoreStreamAfterTrickPlay = null;
    this.switchInternal_(normalVideo, /* clearBuffer= */ true,
        /* safeMargin= */ 0, /* force= */ false);
  }
};


/**
 * @param {shaka.extern.Variant} variant
 * @param {boolean} clearBuffer
 * @param {number} safeMargin
 */
shaka.media.StreamingEngine.prototype.switchVariant =
    function(variant, clearBuffer, safeMargin) {
  if (variant.video) {
    this.switchInternal_(variant.video, /* clearBuffer= */ clearBuffer,
        /* safeMargin= */ safeMargin, /* force= */ false);
  }
  if (variant.audio) {
    this.switchInternal_(variant.audio, /* clearBuffer= */ clearBuffer,
        /* safeMargin= */ safeMargin, /* force= */ false);
  }
};


/**
 * @param {shaka.extern.Stream} textStream
 */
shaka.media.StreamingEngine.prototype.switchTextStream = function(textStream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  goog.asserts.assert(textStream && textStream.type == ContentType.TEXT,
      'Wrong stream type passed to switchTextStream!');
  this.switchInternal_(textStream, /* clearBuffer= */ true, /* safeMargin= */ 0,
      /* force= */ false);
};


/** Reload the current text stream. */
shaka.media.StreamingEngine.prototype.reloadTextStream = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const mediaState = this.mediaStates_.get(ContentType.TEXT);
  if (mediaState) { // Don't reload if there's no text to begin with.
    this.switchInternal_(mediaState.stream, /* clearBuffer= */ true,
        /* safeMargin= */ 0, /* force= */ true);
  }
};


/**
 * Switches to the given Stream. |stream| may be from any Variant or any Period.
 *
 * @param {shaka.extern.Stream} stream
 * @param {boolean} clearBuffer
 * @param {number} safeMargin
 * @param {boolean} force
 *   If true, reload the text stream even if it did not change.
 * @private
 */
shaka.media.StreamingEngine.prototype.switchInternal_ = function(
    stream, clearBuffer, safeMargin, force) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const type = /** @type {!ContentType} */(stream.type);
  const mediaState = this.mediaStates_.get(type);

  if (!mediaState && stream.type == ContentType.TEXT &&
      this.config_.ignoreTextStreamFailures) {
    this.loadNewTextStream(stream);
    return;
  }
  goog.asserts.assert(mediaState, 'switch: expected mediaState to exist');
  if (!mediaState) return;

  // If we are selecting a stream from a different Period, then we need to
  // handle a Period transition. Simply ignore the given stream, assuming that
  // Player will select the same track in onChooseStreams.
  let periodIndex = this.findPeriodContainingStream_(stream);
  const mediaStates = Array.from(this.mediaStates_.values());
  const needSamePeriod = mediaStates.every((ms) => {
    return ms.needPeriodIndex == mediaState.needPeriodIndex;
  });
  if (clearBuffer && periodIndex != mediaState.needPeriodIndex &&
      needSamePeriod) {
    shaka.log.debug('switch: switching to stream in another Period; clearing ' +
                    'buffer and changing Periods');
    // handlePeriodTransition_ will be called on the next update because the
    // current Period won't match the playhead Period.
    this.mediaStates_.forEach((mediaState) => {
      this.forceClearBuffer_(mediaState);
    });
    return;
  }

  if (mediaState.restoreStreamAfterTrickPlay) {
    shaka.log.debug('switch during trick play mode', stream);

    // Already in trick play mode, so stick with trick mode tracks if possible.
    if (stream.trickModeVideo) {
      // Use the trick mode stream, but revert to the new selection later.
      mediaState.restoreStreamAfterTrickPlay = stream;
      stream = stream.trickModeVideo;
      shaka.log.debug('switch found trick play stream', stream);
    } else {
      // There is no special trick mode video for this stream!
      mediaState.restoreStreamAfterTrickPlay = null;
      shaka.log.debug('switch found no special trick play stream');
    }
  }

  // Ensure the Period is ready.
  let canSwitchRecord = this.canSwitchPeriod_[periodIndex];
  goog.asserts.assert(
      canSwitchRecord && canSwitchRecord.resolved,
      'switch: expected Period ' + periodIndex + ' to be ready');
  if (!canSwitchRecord || !canSwitchRecord.resolved) return;

  // Sanity check. If the Period is ready then the Stream should be ready too.
  canSwitchRecord = this.canSwitchStream_.get(stream.id);
  goog.asserts.assert(canSwitchRecord && canSwitchRecord.resolved,
                      'switch: expected Stream ' + stream.id + ' to be ready');
  if (!canSwitchRecord || !canSwitchRecord.resolved) return;

  if (mediaState.stream == stream && !force) {
    const streamTag = shaka.media.StreamingEngine.logPrefix_(mediaState);
    shaka.log.debug('switch: Stream ' + streamTag + ' already active');
    return;
  }

  if (stream.type == ContentType.TEXT) {
    // Mime types are allowed to change for text streams.
    // Reinitialize the text parser, but only if we are going to fetch the init
    // segment again.
    let fullMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    this.playerInterface_.mediaSourceEngine.reinitText(fullMimeType);
  }

  mediaState.stream = stream;
  mediaState.needInitSegment = true;

  let streamTag = shaka.media.StreamingEngine.logPrefix_(mediaState);
  shaka.log.debug('switch: switching to Stream ' + streamTag);

  if (this.shouldAbortCurrentRequest_(mediaState, periodIndex)) {
    shaka.log.info('Aborting current segment request to switch.');
    mediaState.operation.abort();
  }

  if (clearBuffer) {
    if (mediaState.clearingBuffer) {
      // We are already going to clear the buffer, but make sure it is also
      // flushed.
      mediaState.waitingToFlushBuffer = true;
    } else if (mediaState.performingUpdate) {
      // We are performing an update, so we have to wait until it's finished.
      // onUpdate_() will call clearBuffer_() when the update has finished.
      // We need to save the safe margin because its value will be needed when
      // clearing the buffer after the update.
      mediaState.waitingToClearBuffer = true;
      mediaState.clearBufferSafeMargin = safeMargin;
      mediaState.waitingToFlushBuffer = true;
    } else {
      // Cancel the update timer, if any.
      this.cancelUpdate_(mediaState);
      // Clear right away.
      this.clearBuffer_(mediaState, /* flush */ true, safeMargin)
          .catch((error) => {
            if (this.playerInterface_) {
              this.playerInterface_.onError(
                  /** @type {!shaka.util.Error} */ (error));
            }
          });
    }
  }
};


/**
 * Returns whether we should abort the current request.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} periodIndex
 * @return {boolean}
 */
shaka.media.StreamingEngine.prototype.shouldAbortCurrentRequest_ =
    function(mediaState, periodIndex) {
  // If the operation is completed, it will be set to null, and there's no need
  // to abort the request.
  if (!mediaState.operation) {
    return false;
  }

  const presentationTime = this.playerInterface_.getPresentationTime();
  const bufferEnd =
      this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);

  // The next segment to append from the current stream.  This doesn't account
  // for a pending network request and will likely be different from that since
  // we just switched.
  const newSegment = this.getSegmentReferenceNeeded_(
      mediaState, presentationTime, bufferEnd, periodIndex);
  let newSegmentSize = newSegment ? newSegment.getSize() : null;
  if (newSegmentSize == null) {
    return false;
  }

  // When switching, we'll need to download the init segment.
  const init = mediaState.stream.initSegmentReference;
  if (init) {
    newSegmentSize += init.getSize() || 0;
  }

  const bandwidthEstimate = this.playerInterface_.getBandwidthEstimate();

  // The estimate is in bits per second, and the size is in bytes.  The time
  // remaining is in seconds after this calculation.
  const timeToFetchNewSegment = (newSegmentSize * 8) / bandwidthEstimate;

  // If the new segment can be finished in time without risking a buffer
  // underflow, we should abort the old one and switch.
  const bufferedAhead = bufferEnd - presentationTime;
  const safetyBuffer = Math.max(
      this.manifest_.minBufferTime || 0,
      this.config_.rebufferingGoal);
  const safeBufferedAhead = bufferedAhead - safetyBuffer;
  if (timeToFetchNewSegment < safeBufferedAhead) {
    return true;
  }

  // If the thing we want to switch to will be done more quickly than what
  // we've got in progress, we should abort the old one and switch.
  const bytesRemaining = mediaState.operation.getBytesRemaining();
  if (bytesRemaining > newSegmentSize) {
    return true;
  }

  // Otherwise, complete the operation in progress.
  return false;
};


/**
 * Notifies the StreamingEngine that the playhead has moved to a valid time
 * within the presentation timeline.
 */
shaka.media.StreamingEngine.prototype.seeked = function() {
  const Iterables = shaka.util.Iterables;
  const presentationTime = this.playerInterface_.getPresentationTime();
  const smallGapLimit = this.config_.smallGapLimit;
  const checkBuffered = (type) => {
    return this.playerInterface_.mediaSourceEngine.isBuffered(
        type, presentationTime, smallGapLimit);
  };

  let streamCleared = false;
  const atPeriodIndex = this.findPeriodForTime_(presentationTime);
  const allSeekingWithinSamePeriod = Iterables.every(
      this.mediaStates_.values(),
      (state) => state.needPeriodIndex == atPeriodIndex);
  if (allSeekingWithinSamePeriod) {
    // If seeking to the same period you were in before, clear buffers
    // individually as desired.
    for (const type of this.mediaStates_.keys()) {
      if (!checkBuffered(type)) {
        // This stream exists, and isn't buffered.
        this.forceClearBuffer_(this.mediaStates_.get(type));
        streamCleared = true;
      }
    }
  } else {
    // Only treat this as a buffered seek if every media state has a buffer.
    // For example, if we have buffered text but not video, we should still
    // clear every buffer so all media states need the same Period.
    const isAllBuffered = Iterables.every(
        this.mediaStates_.keys(), checkBuffered);
    if (!isAllBuffered) {
      // This was an unbuffered seek for at least one stream, so clear all
      // buffers.
      // Don't clear only some of the buffers because we can become stalled
      // since the media states are waiting for different Periods.
      shaka.log.debug('(all): seeked: unbuffered seek: clearing all buffers');
      this.mediaStates_.forEach((mediaState) => {
        this.forceClearBuffer_(mediaState);
      });
      streamCleared = true;
    }
  }

  if (!streamCleared) {
    shaka.log.debug(
        '(all): seeked: buffered seek: presentationTime=' + presentationTime);
  }
};


/**
 * Clear the buffer for a given stream.  Unlike clearBuffer_, this will handle
 * cases where a MediaState is performing an update.  After this runs, every
 * MediaState will have a pending update.
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @private
 */
shaka.media.StreamingEngine.prototype.forceClearBuffer_ = function(
    mediaState) {
  const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  if (mediaState.clearingBuffer) {
    // We're already clearing the buffer, so we don't need to clear the
    // buffer again.
    shaka.log.debug(logPrefix, 'clear: already clearing the buffer');
    return;
  }

  if (mediaState.waitingToClearBuffer) {
    // May not be performing an update, but an update will still happen.
    // See: https://github.com/google/shaka-player/issues/334
    shaka.log.debug(logPrefix, 'clear: already waiting');
    return;
  }

  if (mediaState.performingUpdate) {
    // We are performing an update, so we have to wait until it's finished.
    // onUpdate_() will call clearBuffer_() when the update has finished.
    shaka.log.debug(logPrefix, 'clear: currently updating');
    mediaState.waitingToClearBuffer = true;
    // We can set the offset to zero to remember that this was a call to
    // clearAllBuffers.
    mediaState.clearBufferSafeMargin = 0;
    return;
  }

  const type = mediaState.type;
  if (this.playerInterface_.mediaSourceEngine.bufferStart(type) == null) {
    // Nothing buffered.
    shaka.log.debug(logPrefix, 'clear: nothing buffered');
    if (mediaState.updateTimer == null) {
      // Note: an update cycle stops when we buffer to the end of the
      // presentation or Period, or when we raise an error.
      this.scheduleUpdate_(mediaState, 0);
    }
    return;
  }

  // An update may be scheduled, but we can just cancel it and clear the
  // buffer right away. Note: clearBuffer_() will schedule the next update.
  shaka.log.debug(logPrefix, 'clear: handling right now');
  this.cancelUpdate_(mediaState);
  this.clearBuffer_(mediaState, /* flush */ false, 0).catch((error) => {
    if (this.playerInterface_) {
      this.playerInterface_.onError(/** @type {!shaka.util.Error} */ (error));
    }
  });
};


/**
 * Initializes the given streams and media states if required.  This will
 * schedule updates for the given types.
 *
 * @param {?shaka.extern.Stream} audio
 * @param {?shaka.extern.Stream} video
 * @param {?shaka.extern.Stream} text
 * @param {number} resumeAt
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.initStreams_ = async function(
    audio, video, text, resumeAt) {
  goog.asserts.assert(this.config_,
      'StreamingEngine configure() must be called before init()!');

  // Determine which Period we must buffer.
  const presentationTime = this.playerInterface_.getPresentationTime();
  const needPeriodIndex = this.findPeriodForTime_(presentationTime);

  // Init/re-init MediaSourceEngine. Note that a re-init is only valid for text.
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /**
   * @type {!Map.<shaka.util.ManifestParserUtils.ContentType,
   *              shaka.extern.Stream>}
   */
  const streamsByType = new Map();
  /** @type {!Set.<shaka.extern.Stream>} */
  const streams = new Set();

  if (audio) {
    streamsByType.set(ContentType.AUDIO, audio);
    streams.add(audio);
  }

  if (video) {
    streamsByType.set(ContentType.VIDEO, video);
    streams.add(video);
  }

  if (text) {
    streamsByType.set(ContentType.TEXT, text);
    streams.add(text);
  }

  // Init MediaSourceEngine.
  let mediaSourceEngine = this.playerInterface_.mediaSourceEngine;
  let forceTransmuxTS = this.config_.forceTransmuxTS;

  await mediaSourceEngine.init(streamsByType, forceTransmuxTS);
  if (this.destroyed_) { return; }

  this.setDuration_();

  // Setup the initial set of Streams and then begin each update cycle. After
  // startup completes onUpdate_() will set up the remaining Periods.
  await this.setupStreams_(streams);
  if (this.destroyed_) { return; }

  streamsByType.forEach((stream, type) => {
    if (!this.mediaStates_.has(type)) {
      const state = this.createMediaState_(stream, needPeriodIndex, resumeAt);
      this.mediaStates_.set(type, state);
      this.scheduleUpdate_(state, 0);
    }
  });
};


/**
 * Creates a media state.
 *
 * @param {shaka.extern.Stream} stream
 * @param {number} needPeriodIndex
 * @param {number} resumeAt
 * @return {shaka.media.StreamingEngine.MediaState_}
 * @private
 */
shaka.media.StreamingEngine.prototype.createMediaState_ = function(
    stream, needPeriodIndex, resumeAt) {
  return /** @type {shaka.media.StreamingEngine.MediaState_} */ ({
    stream: stream,
    type: stream.type,
    lastStream: null,
    lastSegmentReference: null,
    restoreStreamAfterTrickPlay: null,
    needInitSegment: true,
    needPeriodIndex: needPeriodIndex,
    endOfStream: false,
    performingUpdate: false,
    updateTimer: null,
    waitingToClearBuffer: false,
    clearBufferSafeMargin: 0,
    waitingToFlushBuffer: false,
    clearingBuffer: false,
    recovering: false,
    hasError: false,
    resumeAt: resumeAt || 0,
    operation: null,
  });
};


/**
 * Sets up the given Period if necessary. Calls onError() if an error occurs.
 *
 * @param {number} periodIndex The Period's index.
 * @return {!Promise} A Promise which resolves when the given Period is set up.
 * @private
 */
shaka.media.StreamingEngine.prototype.setupPeriod_ = function(periodIndex) {
  let canSwitchRecord = this.canSwitchPeriod_[periodIndex];
  if (canSwitchRecord) {
    shaka.log.debug(
        '(all) Period ' + periodIndex + ' is being or has been set up');
    goog.asserts.assert(canSwitchRecord.promise, 'promise must not be null');
    return canSwitchRecord.promise;
  }

  shaka.log.debug('(all) setting up Period ' + periodIndex);
  canSwitchRecord = {
    promise: new shaka.util.PublicPromise(),
    resolved: false,
  };
  this.canSwitchPeriod_[periodIndex] = canSwitchRecord;

  const streams = new Set();

  // Add all video, trick video, and audio streams.
  for (const variant of this.manifest_.periods[periodIndex].variants) {
    if (variant.video) {
      streams.add(variant.video);
    }
    if (variant.video && variant.video.trickModeVideo) {
      streams.add(variant.video.trickModeVideo);
    }
    if (variant.audio) {
      streams.add(variant.audio);
    }
  }

  // Add text streams
  for (const stream of this.manifest_.periods[periodIndex].textStreams) {
    streams.add(stream);
  }

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
    this.canSwitchPeriod_[periodIndex].promise.catch(() => {});
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
 * @param {!Set.<!shaka.extern.Stream>} streams
 *    Use a set instead of list because duplicate ids will cause the player to
 *    hang.
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.setupStreams_ = async function(streams) {
  // Parallelize Stream set up.
  const parallelWork = [];

  for (const stream of streams) {
    const canSwitchRecord = this.canSwitchStream_.get(stream.id);

    if (canSwitchRecord) {
      shaka.log.debug(
          '(all) Stream ' + stream.id + ' is being or has been set up');
      parallelWork.push(canSwitchRecord.promise);
    } else {
      shaka.log.v1('(all) setting up Stream ' + stream.id);
      this.canSwitchStream_.set(stream.id, {
        promise: new shaka.util.PublicPromise(),
        resolved: false,
      });
      parallelWork.push(stream.createSegmentIndex());
    }
  }

  try {
    await Promise.all(parallelWork);
    if (this.destroyed_) return;
  } catch (error) {
    if (this.destroyed_) return;

    for (const stream of streams) {
      this.canSwitchStream_.get(stream.id).promise.catch(() => {});
      this.canSwitchStream_.get(stream.id).promise.reject();
      this.canSwitchStream_.delete(stream.id);
    }

    throw error;
  }

  for (const stream of streams) {
    const canSwitchRecord = this.canSwitchStream_.get(stream.id);
    if (!canSwitchRecord.resolved) {
      canSwitchRecord.promise.resolve();
      canSwitchRecord.resolved = true;
      shaka.log.v1('(all) setup Stream ' + stream.id);
    }
  }
};


/**
 * Sets the MediaSource's duration.
 * @private
 */
shaka.media.StreamingEngine.prototype.setDuration_ = function() {
  let duration = this.manifest_.presentationTimeline.getDuration();
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
  if (this.destroyed_) return;

  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

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
    this.clearBuffer_(
        mediaState, mediaState.waitingToFlushBuffer,
        mediaState.clearBufferSafeMargin);
    return;
  }

  // Update the MediaState.
  try {
    let delay = this.update_(mediaState);
    if (delay != null) {
      this.scheduleUpdate_(mediaState, delay);
      mediaState.hasError = false;
    }
  } catch (error) {
    this.handleStreamingError_(error);
    return;
  }

  const mediaStates = Array.from(this.mediaStates_.values());

  // Check if we've buffered to the end of the Period.
  this.handlePeriodTransition_(mediaState);

  // Check if we've buffered to the end of the presentation.  We delay adding
  // the audio and video media states, so it is possible for the text stream
  // to be the only state and buffer to the end.  So we need to wait until we
  // have completed startup to determine if we have reached the end.
  if (this.startupComplete_ &&
      mediaStates.every(function(ms) { return ms.endOfStream; })) {
    shaka.log.v1(logPrefix, 'calling endOfStream()...');
    this.playerInterface_.mediaSourceEngine.endOfStream().then(function() {
      if (this.destroyed_) {
        return;
      }

      // If the media segments don't reach the end, then we need to update the
      // timeline duration to match the final media duration to avoid buffering
      // forever at the end.  We should only do this if the duration needs to
      // shrink.  Growing it by less than 1ms can actually cause buffering on
      // replay, as in https://github.com/google/shaka-player/issues/979
      // On some platforms, this can spuriously be 0, so ignore this case.
      // https://github.com/google/shaka-player/issues/1967,
      const duration = this.playerInterface_.mediaSourceEngine.getDuration();
      if (duration != 0 &&
          duration < this.manifest_.presentationTimeline.getDuration()) {
        this.manifest_.presentationTimeline.setDuration(duration);
      }
    }.bind(this));
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
  goog.asserts.assert(this.manifest_, 'manifest_ should not be null');
  goog.asserts.assert(this.config_, 'config_ should not be null');

  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  // If it's a text stream and the original id starts with 'CC', it's CEA
  // closed captions. Do not schedule update for closed captions text
  // mediastate, since closed captions are embedded in video streams.
    if (shaka.media.StreamingEngine.isEmbeddedText_(mediaState)) {
    this.playerInterface_.mediaSourceEngine.setSelectedClosedCaptionId(
        mediaState.stream.originalId || '');
    return null;
  }

  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // Compute how far we've buffered ahead of the playhead.
  const presentationTime = this.playerInterface_.getPresentationTime();

  // Get the next timestamp we need.
  let timeNeeded = this.getTimeNeeded_(mediaState, presentationTime);
  shaka.log.v2(logPrefix, 'timeNeeded=' + timeNeeded);

  let currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);
  const needPeriodIndex = this.findPeriodForTime_(timeNeeded);

  // Get the amount of content we have buffered, accounting for drift.  This
  // is only used to determine if we have meet the buffering goal.  This should
  // be the same method that PlayheadObserver uses.
  let bufferedAhead = this.playerInterface_.mediaSourceEngine.bufferedAheadOf(
      mediaState.type, presentationTime);

  shaka.log.v2(logPrefix,
               'update_:',
               'presentationTime=' + presentationTime,
               'bufferedAhead=' + bufferedAhead);

  let unscaledBufferingGoal = Math.max(
      this.manifest_.minBufferTime || 0,
      this.config_.rebufferingGoal,
      this.config_.bufferingGoal);

  let scaledBufferingGoal = unscaledBufferingGoal * this.bufferingGoalScale_;

  // Check if we've buffered to the end of the presentation.
  if (timeNeeded >= this.manifest_.presentationTimeline.getDuration()) {
    // We shouldn't rebuffer if the playhead is close to the end of the
    // presentation.
    shaka.log.debug(logPrefix, 'buffered to end of presentation');
    mediaState.endOfStream = true;

    if (mediaState.type == ContentType.VIDEO) {
      // Since the text stream of CEA closed captions doesn't have update timer,
      // we have to set the text endOfStream based on the video stream's
      // endOfStream state.
      const textState = this.mediaStates_.get(ContentType.TEXT);
      if (textState && textState.stream.mimeType ==
            shaka.util.MimeUtils.CLOSED_CAPTION_MIMETYPE) {
        textState.endOfStream = true;
      }
    }
    return null;
  }
  mediaState.endOfStream = false;

  // Check if we've buffered to the end of the Period. This should be done
  // before checking segment availability because the new Period may become
  // available once it's switched to. Note that we don't use the non-existence
  // of SegmentReferences as an indicator to determine Period boundaries
  // because a SegmentIndex can provide SegmentReferences outside its Period.
  mediaState.needPeriodIndex = needPeriodIndex;
  if (needPeriodIndex != currentPeriodIndex) {
    shaka.log.debug(logPrefix,
                    'need Period ' + needPeriodIndex,
                    'presentationTime=' + presentationTime,
                    'timeNeeded=' + timeNeeded,
                    'currentPeriodIndex=' + currentPeriodIndex);
    return null;
  }

  // If we've buffered to the buffering goal then schedule an update.
  if (bufferedAhead >= scaledBufferingGoal) {
    shaka.log.v2(logPrefix, 'buffering goal met');

    // Do not try to predict the next update.  Just poll twice every second.
    // The playback rate can change at any time, so any prediction we make now
    // could be terribly invalid soon.
    return 0.5;
  }

  let bufferEnd =
      this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);
  let reference = this.getSegmentReferenceNeeded_(
      mediaState, presentationTime, bufferEnd, currentPeriodIndex);
  if (!reference) {
    // The segment could not be found, does not exist, or is not available.  In
    // any case just try again... if the manifest is incomplete or is not being
    // updated then we'll idle forever; otherwise, we'll end up getting a
    // SegmentReference eventually.
    return 1;
  }

  // Do not let any one stream get far ahead of any other.
  let minTimeNeeded = Infinity;
  const mediaStates = Array.from(this.mediaStates_.values());
  mediaStates.forEach((otherState) => {
    // Do not consider embedded captions in this calculation.  It could lead
    // to hangs in streaming.
      if (shaka.media.StreamingEngine.isEmbeddedText_(otherState)) {
        return;
      }

    const timeNeeded = this.getTimeNeeded_(otherState, presentationTime);
    minTimeNeeded = Math.min(minTimeNeeded, timeNeeded);
  });

  const maxSegmentDuration =
      this.manifest_.presentationTimeline.getMaxSegmentDuration();
  const maxRunAhead =
      maxSegmentDuration * shaka.media.StreamingEngine.MAX_RUN_AHEAD_SEGMENTS_;
  if (timeNeeded >= minTimeNeeded + maxRunAhead) {
    // Wait and give other media types time to catch up to this one.
    // For example, let video buffering catch up to audio buffering before
    // fetching another audio segment.
    return 1;
  }

  mediaState.resumeAt = 0;
  this.fetchAndAppend_(
      mediaState,
      presentationTime,
      currentPeriodIndex,
      reference);
  return null;
};


/**
 * Gets the next timestamp needed. Returns the playhead's position if the
 * buffer is empty; otherwise, returns the time at which the last segment
 * appended ends.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} presentationTime
 * @return {number} The next timestamp needed.
 * @private
 */
shaka.media.StreamingEngine.prototype.getTimeNeeded_ = function(
    mediaState, presentationTime) {
  // Get the next timestamp we need. We must use |lastSegmentReference|
  // to determine this and not the actual buffer for two reasons:
  //   1. Actual segments end slightly before their advertised end times, so
  //      the next timestamp we need is actually larger than |bufferEnd|.
  //   2. There may be drift (the timestamps in the segments are ahead/behind
  //      of the timestamps in the manifest), but we need drift-free times when
  //      comparing times against presentation and Period boundaries.
  if (!mediaState.lastStream || !mediaState.lastSegmentReference) {
    return Math.max(presentationTime, mediaState.resumeAt);
  }

  let lastPeriodIndex =
      this.findPeriodContainingStream_(mediaState.lastStream);
  let lastPeriod = this.manifest_.periods[lastPeriodIndex];
  return lastPeriod.startTime + mediaState.lastSegmentReference.endTime;
};


/**
 * Gets the SegmentReference of the next segment needed.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} presentationTime
 * @param {?number} bufferEnd
 * @param {number} currentPeriodIndex
 * @return {shaka.media.SegmentReference} The SegmentReference of the
 *   next segment needed. Returns null if a segment could not be found, does not
 *   exist, or is not available.
 * @private
 */
shaka.media.StreamingEngine.prototype.getSegmentReferenceNeeded_ = function(
    mediaState, presentationTime, bufferEnd, currentPeriodIndex) {
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  if (mediaState.lastSegmentReference &&
      mediaState.stream == mediaState.lastStream) {
    // Something is buffered from the same Stream.
    let position = mediaState.lastSegmentReference.position + 1;
    shaka.log.v2(logPrefix, 'next position known:', 'position=' + position);

    return this.getSegmentReferenceIfAvailable_(
        mediaState, currentPeriodIndex, position);
  }

  let position;

  if (mediaState.lastSegmentReference) {
    // Something is buffered from another Stream.
    goog.asserts.assert(mediaState.lastStream, 'lastStream should not be null');
    shaka.log.v1(logPrefix, 'next position unknown: another Stream buffered');
    let lastPeriodIndex =
        this.findPeriodContainingStream_(mediaState.lastStream);
    let lastPeriod = this.manifest_.periods[lastPeriodIndex];
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
        mediaState, bufferEnd || presentationTime, currentPeriodIndex);
  }

  if (position == null) {
    return null;
  }

  let reference = null;
  if (bufferEnd == null) {
    // If there's positive drift then we need to get the previous segment;
    // however, we don't actually know how much drift there is, so we must
    // unconditionally get the previous segment. If it turns out that there's
    // non-positive drift then we'll just end up buffering beind the playhead a
    // little more than we needed.
    let optimalPosition = Math.max(0, position - 1);
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
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  let currentPeriod = this.manifest_.periods[currentPeriodIndex];

  shaka.log.debug(logPrefix,
                  'looking up segment:',
                  'presentationTime=' + presentationTime,
                  'currentPeriod.startTime=' + currentPeriod.startTime);

  let lookupTime = Math.max(0, presentationTime - currentPeriod.startTime);
  let position = mediaState.stream.findSegmentPosition(lookupTime);

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
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  let currentPeriod = this.manifest_.periods[currentPeriodIndex];

  let reference = mediaState.stream.getSegmentReference(position);
  if (!reference) {
    shaka.log.v1(logPrefix,
                 'segment does not exist:',
                 'currentPeriod.startTime=' + currentPeriod.startTime,
                 'position=' + position);
    return null;
  }

  let timeline = this.manifest_.presentationTimeline;
  let availabilityStart = timeline.getSegmentAvailabilityStart();
  let availabilityEnd = timeline.getSegmentAvailabilityEnd();

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
 * Fetches and appends the given segment. Sets up the given MediaState's
 * associated SourceBuffer and evicts segments if either are required
 * beforehand. Schedules another update after completing successfully.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} presentationTime
 * @param {number} currentPeriodIndex The index of the current Period.
 * @param {!shaka.media.SegmentReference} reference
 * @private
 */
shaka.media.StreamingEngine.prototype.fetchAndAppend_ = function(
    mediaState, presentationTime, currentPeriodIndex, reference) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const StreamingEngine = shaka.media.StreamingEngine;
  const logPrefix = StreamingEngine.logPrefix_(mediaState);
  const currentPeriod = this.manifest_.periods[currentPeriodIndex];

  shaka.log.v1(logPrefix,
               'fetchAndAppend_:',
               'presentationTime=' + presentationTime,
               'currentPeriod.startTime=' + currentPeriod.startTime,
               'reference.position=' + reference.position,
               'reference.startTime=' + reference.startTime,
               'reference.endTime=' + reference.endTime);

  // Subtlety: The playhead may move while asynchronous update operations are
  // in progress, so we should avoid calling playhead.getTime() in any
  // callbacks. Furthermore, switch() may be called at any time, so we should
  // also avoid using mediaState.stream or mediaState.needInitSegment in any
  // callbacks.
  let stream = mediaState.stream;

  // Compute the append window.
  let duration = this.manifest_.presentationTimeline.getDuration();
  let followingPeriod = this.manifest_.periods[currentPeriodIndex + 1];

  // Rounding issues can cause us to remove the first frame of the Period, so
  // reduce the start time slightly.
  const appendWindowStart = Math.max(0,
      currentPeriod.startTime - StreamingEngine.APPEND_WINDOW_START_FUDGE_);
  const appendWindowEnd = followingPeriod ?
      followingPeriod.startTime + StreamingEngine.APPEND_WINDOW_END_FUDGE_ :
      duration;

  goog.asserts.assert(
      reference.startTime <= appendWindowEnd,
      logPrefix + ' segment should start before append window end');

  let initSourceBuffer = this.initSourceBuffer_(
      mediaState, currentPeriodIndex, appendWindowStart, appendWindowEnd);

  mediaState.performingUpdate = true;

  // We may set |needInitSegment| to true in switch(), so set it to false here,
  // since we want it to remain true if switch() is called.
  mediaState.needInitSegment = false;

  shaka.log.v2(logPrefix, 'fetching segment');
  let fetchSegment = this.fetch_(mediaState, reference);


  Promise.all([initSourceBuffer, fetchSegment]).then(function(results) {
    if (this.destroyed_ || this.fatalError_) return;
    return this.append_(mediaState,
                        presentationTime,
                        currentPeriod,
                        stream,
                        reference,
                        results[1]);
  }.bind(this)).then(function() {
    if (this.destroyed_ || this.fatalError_) return;

    mediaState.performingUpdate = false;
    mediaState.recovering = false;

    if (!mediaState.waitingToClearBuffer) {
      this.playerInterface_.onSegmentAppended();
    }

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

    if (mediaState.type == ContentType.TEXT &&
        this.config_.ignoreTextStreamFailures) {
      if (error.code == shaka.util.Error.Code.BAD_HTTP_STATUS) {
        shaka.log.warning(logPrefix,
            'Text stream failed to download. Proceeding without it.');
      } else {
        shaka.log.warning(logPrefix,
            'Text stream failed to parse. Proceeding without it.');
      }
      this.mediaStates_.delete(ContentType.TEXT);
    } else if (error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
      // If the network slows down, abort the current fetch request and start a
      // new one, and ignore the error message.
      mediaState.performingUpdate = false;
      mediaState.updateTimer = null;
      this.scheduleUpdate_(mediaState, 0);
    } else if (error.code == shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR) {
      this.handleQuotaExceeded_(mediaState, error);
    } else {
      shaka.log.error(logPrefix, 'failed fetch and append: code=' + error.code);
      mediaState.hasError = true;

      error.severity = shaka.util.Error.Severity.CRITICAL;
      this.handleStreamingError_(error);
    }
  }.bind(this));
};


/**
 * Clear per-stream error states and retry any failed streams.
 * @return {boolean} False if unable to retry.
 */
shaka.media.StreamingEngine.prototype.retry = function() {
  if (this.destroyed_) {
    shaka.log.error('Unable to retry after StreamingEngine is destroyed!');
    return false;
  }

  if (this.fatalError_) {
    shaka.log.error('Unable to retry after StreamingEngine encountered a ' +
                    'fatal error!');
    return false;
  }

  for (const mediaState of this.mediaStates_.values()) {
    let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
    if (mediaState.hasError) {
      shaka.log.info(logPrefix, 'Retrying after failure...');
      mediaState.hasError = false;
      this.scheduleUpdate_(mediaState, 0.1);
    }
  }

  return true;
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
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

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

  const mediaStates = Array.from(this.mediaStates_.values());
  let waitingForAnotherStreamToRecover = mediaStates.some(function(ms) {
    return ms != mediaState && ms.recovering;
  });

  if (!waitingForAnotherStreamToRecover) {
    // Reduction schedule: 80%, 60%, 40%, 20%, 16%, 12%, 8%, 4%, fail.
    // Note: percentages are used for comparisons to avoid rounding errors.
    let percentBefore = Math.round(100 * this.bufferingGoalScale_);
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
    let percentAfter = Math.round(100 * this.bufferingGoalScale_);
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
 * @param {number} appendWindowStart
 * @param {number} appendWindowEnd
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.initSourceBuffer_ = function(
    mediaState, currentPeriodIndex, appendWindowStart, appendWindowEnd) {
  if (!mediaState.needInitSegment) {
    return Promise.resolve();
  }

  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  let currentPeriod = this.manifest_.periods[currentPeriodIndex];

  // If we need an init segment then the Stream switched, so we've either
  // changed bitrates, Periods, or both. If we've changed Periods then we must
  // set a new timestamp offset and append window end. Note that by setting
  // these values here, we avoid having to co-ordinate ongoing updates, which
  // we would have to do if we instead set them in switch().
  let timestampOffset =
      currentPeriod.startTime - mediaState.stream.presentationTimeOffset;
  shaka.log.v1(logPrefix, 'setting timestamp offset to ' + timestampOffset);
  shaka.log.v1(logPrefix,
               'setting append window start to ' + appendWindowStart);
  shaka.log.v1(logPrefix, 'setting append window end to ' + appendWindowEnd);
  let setStreamProperties =
      this.playerInterface_.mediaSourceEngine.setStreamProperties(
          mediaState.type, timestampOffset, appendWindowStart, appendWindowEnd);

  if (!mediaState.stream.initSegmentReference) {
    // The Stream is self initializing.
    return setStreamProperties;
  }

  shaka.log.v1(logPrefix, 'fetching init segment');

  let fetchInit =
      this.fetch_(mediaState, mediaState.stream.initSegmentReference);
  let appendInit = fetchInit.then(function(initSegment) {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending init segment');
    const hasClosedCaptions = mediaState.stream.closedCaptions &&
        mediaState.stream.closedCaptions.size > 0;
    return this.playerInterface_.mediaSourceEngine.appendBuffer(
        mediaState.type, initSegment, null /* startTime */, null /* endTime */,
        hasClosedCaptions);
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
 * @param {number} presentationTime
 * @param {shaka.extern.Period} period
 * @param {shaka.extern.Stream} stream
 * @param {!shaka.media.SegmentReference} reference
 * @param {!ArrayBuffer} segment
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.append_ = function(
    mediaState, presentationTime, period, stream, reference, segment) {
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  const hasClosedCaptions = stream.closedCaptions &&
      stream.closedCaptions.size > 0;
  if (stream.emsgSchemeIdUris != null && stream.emsgSchemeIdUris.length > 0) {
    new shaka.util.Mp4Parser()
        .fullBox(
            'emsg',
            this.parseEMSG_.bind(
                this, period, reference, stream.emsgSchemeIdUris))
        .parse(segment);
  }

  return this.evict_(mediaState, presentationTime).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending media segment');

    // MediaSourceEngine expects times relative to the start of the
    // presentation.  Reference times are relative to the start of the period.
    const startTime = reference.startTime + period.startTime;
    const endTime = reference.endTime + period.startTime;

    return this.playerInterface_.mediaSourceEngine.appendBuffer(
        mediaState.type, segment, startTime, endTime, hasClosedCaptions);
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
 * @param {!shaka.extern.Period} period
 * @param {!shaka.media.SegmentReference} reference
 * @param {?Array.<string>} emsgSchemeIdUris Array of emsg
 *     scheme_id_uri for which emsg boxes should be parsed.
 * @param {!shaka.extern.ParsedBox} box
 * @private
 */
shaka.media.StreamingEngine.prototype.parseEMSG_ = function(
    period, reference, emsgSchemeIdUris, box) {
  let schemeId = box.reader.readTerminatedString();
  // Read the rest of the data.
  let value = box.reader.readTerminatedString();
  let timescale = box.reader.readUint32();
  let presentationTimeDelta = box.reader.readUint32();
  let eventDuration = box.reader.readUint32();
  let id = box.reader.readUint32();
  let messageData = box.reader.readBytes(
      box.reader.getLength() - box.reader.getPosition());

  let startTime = period.startTime + reference.startTime +
      (presentationTimeDelta / timescale);

  // See DASH sec. 5.10.3.3.1
  // If a DASH client detects an event message box with a scheme that is not
  // defined in MPD, the client is expected to ignore it.
  if (emsgSchemeIdUris.includes(schemeId)) {
    // See DASH sec. 5.10.4.1
    // A special scheme in DASH used to signal manifest updates.
    if (schemeId == 'urn:mpeg:dash:event:2012') {
      this.playerInterface_.onManifestUpdate();
    } else {
      /** @type {shaka.extern.EmsgInfo} */
      let emsg = {
        startTime: startTime,
        endTime: startTime + (eventDuration / timescale),
        schemeIdUri: schemeId,
        value: value,
        timescale: timescale,
        presentationTimeDelta: presentationTimeDelta,
        eventDuration: eventDuration,
        id: id,
        messageData: messageData,
      };

      // Dispatch an event to notify the application about the emsg box.
      let event = new shaka.util.FakeEvent('emsg', {'detail': emsg});
      this.playerInterface_.onEvent(event);
    }
  }
};


/**
 * Evicts media to meet the max buffer behind limit.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {number} presentationTime
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.evict_ = function(
    mediaState, presentationTime) {
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  shaka.log.v2(logPrefix, 'checking buffer length');

  // Use the max segment duration, if it is longer than the bufferBehind, to
  // avoid accidentally clearing too much data when dealing with a manifest
  // with a long keyframe interval.
  let bufferBehind = Math.max(this.config_.bufferBehind,
      this.manifest_.presentationTimeline.getMaxSegmentDuration());

  let startTime =
      this.playerInterface_.mediaSourceEngine.bufferStart(mediaState.type);
  if (startTime == null) {
    shaka.log.v2(logPrefix,
                 'buffer behind okay because nothing buffered:',
                 'presentationTime=' + presentationTime,
                 'bufferBehind=' + bufferBehind);
    return Promise.resolve();
  }
  let bufferedBehind = presentationTime - startTime;

  let overflow = bufferedBehind - bufferBehind;
  if (overflow <= 0) {
    shaka.log.v2(logPrefix,
                 'buffer behind okay:',
                 'presentationTime=' + presentationTime,
                 'bufferedBehind=' + bufferedBehind,
                 'bufferBehind=' + bufferBehind,
                 'underflow=' + (-overflow));
    return Promise.resolve();
  }

  shaka.log.v1(logPrefix,
               'buffer behind too large:',
               'presentationTime=' + presentationTime,
               'bufferedBehind=' + bufferedBehind,
               'bufferBehind=' + bufferBehind,
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
 * @param {shaka.extern.Stream} stream
 * @private
 */
shaka.media.StreamingEngine.prototype.handleStartup_ = function(
    mediaState, stream) {
  const Functional = shaka.util.Functional;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (this.startupComplete_) {
    return;
  }

  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // If the only media state is text, then we may have loaded text before
  // any media content.  Marking as complete early will break MediaSource.
  // See #1696.
  const mediaStates = Array.from(this.mediaStates_.values());
  if (mediaStates.length != 1 || mediaStates[0].type != ContentType.TEXT) {
    this.startupComplete_ = mediaStates.every(function(ms) {
      // Startup completes once we have buffered at least one segment from each
      // MediaState, not counting text.
      if (ms.type == ContentType.TEXT) return true;
      return !ms.waitingToClearBuffer &&
             !ms.clearingBuffer &&
             ms.lastSegmentReference;
    });
  }

  if (!this.startupComplete_) {
    return;
  }

  shaka.log.debug(logPrefix, 'startup complete');

  // We must use |stream| because switch() may have been called.
  let currentPeriodIndex = this.findPeriodContainingStream_(stream);

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
      if (this.destroyed_) {
        return;
      }

      shaka.log.v1(logPrefix, 'calling onCanSwitch()...');
      this.playerInterface_.onCanSwitch();
    }.bind(this)).catch(Functional.noop);
  }

  // Now setup all known Periods.
  for (let i = 0; i < this.manifest_.periods.length; ++i) {
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
  const Functional = shaka.util.Functional;
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  let currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);
  if (mediaState.needPeriodIndex == currentPeriodIndex) {
    return;
  }

  let needPeriodIndex = mediaState.needPeriodIndex;

  const mediaStates = Array.from(this.mediaStates_.values());

  // For a Period transition to work, all media states must need the same
  // Period.  If a stream needs a different Period than the one it currently
  // has, it will try to transition or stop updates assuming that another stream
  // will handle it.  This only works when all streams either need the same
  // Period or are still performing updates.
  goog.asserts.assert(
      mediaStates.every(function(ms) {
        return ms.needPeriodIndex == needPeriodIndex || ms.hasError ||
            !shaka.media.StreamingEngine.isIdle_(ms) ||
            shaka.media.StreamingEngine.isEmbeddedText_(ms);
      }),
      'All MediaStates should need the same Period or be performing updates.');

  // Only call onChooseStreams() when all MediaStates need the same Period.
  let needSamePeriod = mediaStates.every(function(ms) {
    return ms.needPeriodIndex == needPeriodIndex ||
        shaka.media.StreamingEngine.isEmbeddedText_(ms);
  });
  if (!needSamePeriod) {
    shaka.log.debug(
        logPrefix, 'not all MediaStates need Period ' + needPeriodIndex);
    return;
  }

  // Only call onChooseStreams() once per Period transition.
  let allAreIdle = mediaStates.every(shaka.media.StreamingEngine.isIdle_);
  if (!allAreIdle) {
    shaka.log.debug(
        logPrefix,
        'all MediaStates need Period ' + needPeriodIndex + ', ' +
        'but not all MediaStates are idle');
    return;
  }

  shaka.log.debug(logPrefix, 'all need Period ' + needPeriodIndex);

  // Ensure the Period which we need to buffer is set up and then call
  // onChooseStreams().
  this.setupPeriod_(needPeriodIndex).then(function() {
    if (this.destroyed_) return;

    // If we seek during a Period transition, we can start another transition.
    // So we need to verify that:
    //  1. We are still in need of the same Period.
    //  2. All streams are still idle.
    //  3. The current stream is not in the needed Period (another transition
    //     handled it).
    let allReady = mediaStates.every(function(ms) {
      let isIdle = shaka.media.StreamingEngine.isIdle_(ms);
      let currentPeriodIndex = this.findPeriodContainingStream_(ms.stream);
      if (shaka.media.StreamingEngine.isEmbeddedText_(ms)) {
        // Embedded text tracks don't do Period transitions.
        return true;
      }
      return isIdle && ms.needPeriodIndex == needPeriodIndex &&
          currentPeriodIndex != needPeriodIndex;
    }.bind(this));
    if (!allReady) {
      // TODO: Write unit tests for this case.
      shaka.log.debug(logPrefix, 'ignoring transition to Period',
                      needPeriodIndex, 'since another is happening');
      return;
    }

    let needPeriod = this.manifest_.periods[needPeriodIndex];

    shaka.log.v1(logPrefix, 'calling onChooseStreams()...');
    let chosenStreams = this.playerInterface_.onChooseStreams(needPeriod);

    /** @type {!Map.<!ContentType, shaka.extern.Stream>} */
    const streamsByType = new Map();
    if (chosenStreams.variant && chosenStreams.variant.video) {
      streamsByType.set(ContentType.VIDEO, chosenStreams.variant.video);
    }
    if (chosenStreams.variant && chosenStreams.variant.audio) {
      streamsByType.set(ContentType.AUDIO, chosenStreams.variant.audio);
    }
    if (chosenStreams.text) {
      streamsByType.set(ContentType.TEXT, chosenStreams.text);
    }

    // Vet |streamsByType| before switching.
    for (const type of this.mediaStates_.keys()) {
      if (streamsByType.has(type) || type == ContentType.TEXT) continue;

      shaka.log.error(logPrefix,
                      'invalid Streams chosen: missing ' + type + ' Stream');
      this.playerInterface_.onError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STREAMING,
          shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
      return;
    }

    // Because we are going to modify the map, we need to create a copy of the
    // keys, so copy the iterable to an array first.
    for (const type of Array.from(streamsByType.keys())) {
      if (this.mediaStates_.has(type)) continue;

      if (type == ContentType.TEXT) {
        // initStreams_ will switch streams and schedule an update.
        this.initStreams_(
            /* audio= */ null,
            /* video= */ null,
            /* text= */ streamsByType.get(ContentType.TEXT),
            needPeriod.startTime);
        streamsByType.delete(type);
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

    // Because we are going to modify the map, we need to create a copy of the
    // keys, so copy the iterable to an array first.
    for (const type of Array.from(this.mediaStates_.keys())) {
        const state = this.mediaStates_.get(type);
      const stream = streamsByType.get(type);
      if (stream) {
          const wasEmbeddedText =
              shaka.media.StreamingEngine.isEmbeddedText_(state);
          if (wasEmbeddedText) {
            // If this was an embedded text track, we'll need to update the
            // needPeriodIndex so it doesn't try to do a Period transition once
            // we switch.
            state.needPeriodIndex = needPeriodIndex;
            state.resumeAt = needPeriod.startTime;
          }

        this.switchInternal_(stream, /* clearBuffer= */ false,
            /* safeMargin= */ 0, /* force= */ false);

          // Don't schedule an update when changing from embedded text to
          // another embedded text since the update will try to load existing
          // captions, which are already loaded.
          //
          // But we do want to schedule an update if we switch to a non-embedded
          // text track of if we didn't have an embedded text track before.
          if (!wasEmbeddedText ||
              !shaka.media.StreamingEngine.isEmbeddedText_(state)) {
        this.scheduleUpdate_(this.mediaStates_.get(type), 0);
          }
      } else {
        goog.asserts.assert(type == ContentType.TEXT, 'Invalid streams chosen');
        this.mediaStates_.delete(type);
      }
    }

    // We've already set up the Period so call onCanSwitch() right now.
    shaka.log.v1(logPrefix, 'calling onCanSwitch()...');
    this.playerInterface_.onCanSwitch();
  }.bind(this)).catch(Functional.noop);
};


/**
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @return {boolean}
 * @private
 */
shaka.media.StreamingEngine.isEmbeddedText_ = function(mediaState) {
  const MimeUtils = shaka.util.MimeUtils;
    return mediaState &&
        mediaState.type == shaka.util.ManifestParserUtils.ContentType.TEXT &&
      mediaState.stream.mimeType == MimeUtils.CLOSED_CAPTION_MIMETYPE;
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
 * Get the index in the manifest of the period that contains the given
 * presentation time. If |time| is before all periods, this will default to
 * returning the first period.
 *
 * @param {number} time The presentation time in seconds.
 * @return {number}
 * @private
 */
shaka.media.StreamingEngine.prototype.findPeriodForTime_ = function(time) {
  const ManifestParserUtils = shaka.util.ManifestParserUtils;
  const threshold = ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS;

  // The last segment may end right before the end of the Period because of
  // rounding issues so we bias forward a little.
  const adjustedTime = time + threshold;

  const period = shaka.util.Periods.findPeriodForTime(
      /* periods= */ this.manifest_.periods,
      /* time= */ adjustedTime);

  return period ? this.manifest_.periods.indexOf(period) : 0;
};


/**
 * See if |stream| can be found in our manifest and return the period index. If
 * |stream| cannot be found, -1 will be returned.
 *
 * @param {!shaka.extern.Stream} stream
 * @return {number}
 * @private
 */
shaka.media.StreamingEngine.prototype.findPeriodContainingStream_ = function(
    stream) {
  goog.asserts.assert(this.manifest_, 'Must have a manifest to find a stream.');

  const periods = this.manifest_.periods;
  for (let i = 0; i < periods.length; i++) {
    const period = periods[i];

    // Collect all the streams in this period so that we can easily check
    // if the stream is found (regardless of type).
    const streams = new Set();

    for (const variant of period.variants) {
      if (variant.audio) {
        streams.add(variant.audio);
      }
      if (variant.video) {
        streams.add(variant.video);
      }
      if (variant.video && variant.video.trickModeVideo) {
        streams.add(variant.video.trickModeVideo);
      }
    }

    for (const text of period.textStreams) {
      streams.add(text);
    }

    if (streams.has(stream)) {
      return i;
    }
  }

  return -1;
};


/**
 * Fetches the given segment.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {(!shaka.media.InitSegmentReference|!shaka.media.SegmentReference)}
 *   reference
 *
 * @return {!Promise.<!ArrayBuffer>}
 * @private
 */
shaka.media.StreamingEngine.prototype.fetch_ = function(mediaState, reference) {
  const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

  const request = shaka.util.Networking.createSegmentRequest(
      reference.getUris(),
      reference.startByte,
      reference.endByte,
      this.config_.retryParameters);

  shaka.log.v2('fetching: reference=', reference);

  const op = this.playerInterface_.netEngine.request(requestType, request);
  mediaState.operation = op;
  return op.promise.then(function(response) {
    mediaState.operation = null;
    return response.data;
  });
};


/**
 * Clears the buffer and schedules another update.
 * The optional parameter safeMargin allows to retain a certain amount
 * of buffer, which can help avoiding rebuffering events.
 * The value of the safe margin should be provided by the ABR manager.
 *
 * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
 * @param {boolean} flush
 * @param {number} safeMargin
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.clearBuffer_ =
    async function(mediaState, flush, safeMargin) {
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  goog.asserts.assert(
      !mediaState.performingUpdate && (mediaState.updateTimer == null),
      logPrefix + ' unexpected call to clearBuffer_()');

  mediaState.waitingToClearBuffer = false;
  mediaState.waitingToFlushBuffer = false;
  mediaState.clearBufferSafeMargin = 0;
  mediaState.clearingBuffer = true;

  shaka.log.debug(logPrefix, 'clearing buffer');
  let p;
  if (safeMargin) {
    const presentationTime = this.playerInterface_.getPresentationTime();
    let duration = this.playerInterface_.mediaSourceEngine.getDuration();
    p = this.playerInterface_.mediaSourceEngine.remove(
        mediaState.type, presentationTime + safeMargin, duration);
  } else {
    p = this.playerInterface_.mediaSourceEngine.clear(mediaState.type).then(
        function() {
          if (!this.destroyed_ && flush) {
            return this.playerInterface_.mediaSourceEngine.flush(
                mediaState.type);
          }
        }.bind(this));
  }

  await p;
  if (this.destroyed_) return;

  shaka.log.debug(logPrefix, 'cleared buffer');
  mediaState.lastStream = null;
  mediaState.lastSegmentReference = null;
  mediaState.clearingBuffer = false;
  mediaState.endOfStream = false;
  this.scheduleUpdate_(mediaState, 0);
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
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  shaka.log.v2(logPrefix, 'updating in ' + delay + ' seconds');
  goog.asserts.assert(mediaState.updateTimer == null,
                      logPrefix + ' did not expect update to be scheduled');

  mediaState.updateTimer = new shaka.util.DelayedTick(async () => {
    try {
      await this.onUpdate_(mediaState);
    } catch (error) {
      if (this.playerInterface_) {
        this.playerInterface_.onError(error);
      }
    }
  }).tickAfter(delay);
};


/**
 * If |mediaState| is scheduled to update, stop it.
 *
 * @param {shaka.media.StreamingEngine.MediaState_} mediaState
 * @private
 */
shaka.media.StreamingEngine.prototype.cancelUpdate_ = function(mediaState) {
  if (mediaState.updateTimer == null) {
    return;
  }

  mediaState.updateTimer.stop();
  mediaState.updateTimer = null;
};


/**
 * Handle streaming errors by delaying, then notifying the application by error
 * callback and by streaming failure callback.
 *
 * @param {!shaka.util.Error} error
 * @private
 */
shaka.media.StreamingEngine.prototype.handleStreamingError_ = function(error) {
  // If we invoke the callback right away, the application could trigger a
  // rapid retry cycle that could be very unkind to the server.  Instead,
  // use the backoff system to delay and backoff the error handling.
  this.failureCallbackBackoff_.attempt().then(function() {
    if (this.destroyed_) {
      return;
    }

    // First fire an error event.
    this.playerInterface_.onError(error);

    // If the error was not handled by the application, call the failure
    // callback.
    if (!error.handled) {
      this.config_.failureCallback(error);
    }
  }.bind(this));
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
