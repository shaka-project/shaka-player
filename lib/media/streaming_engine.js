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
goog.require('shaka.net.Backoff');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MapUtils');
goog.require('shaka.util.MimeUtils');
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
 *   variant: (?shakaExtern.Variant|undefined),
 *   text: ?shakaExtern.Stream
 * }}
 *
 * @property {(?shakaExtern.Variant|undefined)} variant
 *   The chosen variant.  May be omitted for text re-init.
 * @property {?shakaExtern.Stream} text
 *   The chosen text stream.
 */
shaka.media.StreamingEngine.ChosenStreams;


/**
 * @typedef {{
 *   playhead: !shaka.media.Playhead,
 *   mediaSourceEngine: !shaka.media.MediaSourceEngine,
 *   netEngine: shaka.net.NetworkingEngine,
 *   onChooseStreams: function(!shakaExtern.Period):
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
 * @property {!shaka.media.Playhead} playhead
 *   The Playhead. The caller retains ownership.
 * @property {!shaka.media.MediaSourceEngine} mediaSourceEngine
 *   The MediaSourceEngine. The caller retains ownership.
 * @property {shaka.net.NetworkingEngine} netEngine
 *   The NetworkingEngine instance to use. The caller retains ownership.
 * @property {function(!shakaExtern.Period):
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
 *   updating.
 * @property {number} resumeAt
 *   An override for the time to start performing updates at.  If the playhead
 *   is behind this time, update_() will still start fetching segments from
 *   this time.  If the playhead is ahead of the time, this field is ignored.
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
  for (let type in this.mediaStates_) {
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
 * Must be called at least once before init().
 *
 * @param {shakaExtern.StreamingConfiguration} config
 */
shaka.media.StreamingEngine.prototype.configure = function(config) {
  this.config_ = config;

  // Create separate parameters for backoff during streaming failure.

  /** @type {shakaExtern.RetryParameters} */
  let failureRetryParams = {
    // The term "attempts" includes the initial attempt, plus all retries.
    // In order to see a delay, there would have to be at least 2 attempts.
    maxAttempts: Math.max(config.retryParameters.maxAttempts, 2),
    baseDelay: config.retryParameters.baseDelay,
    backoffFactor: config.retryParameters.backoffFactor,
    fuzzFactor: config.retryParameters.fuzzFactor,
    timeout: 0  // irrelevant
  };

  // We don't want to ever run out of attempts.  The application should be
  // allowed to retry streaming infinitely if it wishes.
  let autoReset = true;
  this.failureCallbackBackoff_ =
      new shaka.net.Backoff(failureRetryParams, autoReset);
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
  goog.asserts.assert(this.config_,
      'StreamingEngine configure() must be called before init()!');

  // Determine which Period we must buffer.
  let playheadTime = this.playerInterface_.playhead.getTime();
  let needPeriodIndex = this.findPeriodContainingTime_(playheadTime);

  // Get the initial set of Streams.
  let initialStreams = this.playerInterface_.onChooseStreams(
      this.manifest_.periods[needPeriodIndex]);
  if (!initialStreams.variant && !initialStreams.text) {
    shaka.log.error('init: no Streams chosen');
    return Promise.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STREAMING,
        shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
  }

  // Setup the initial set of Streams and then begin each update cycle. After
  // startup completes onUpdate_() will set up the remaining Periods.
  return this.initStreams_(initialStreams).then(function() {
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
  }.bind(this));
};


/**
 * Gets the current Period the stream is in.  This Period might not be
 * initialized yet if canSwitch(period) has not been called yet.
 * @return {shakaExtern.Period}
 */
shaka.media.StreamingEngine.prototype.getCurrentPeriod = function() {
  let playheadTime = this.playerInterface_.playhead.getTime();
  let needPeriodIndex = this.findPeriodContainingTime_(playheadTime);
  return this.manifest_.periods[needPeriodIndex];
};


/**
 * Gets the Period in which we are currently buffering.  This might be different
 * from the Period which contains the Playhead.
 * @return {?shakaExtern.Period}
 */
shaka.media.StreamingEngine.prototype.getActivePeriod = function() {
  goog.asserts.assert(this.mediaStates_, 'Must be initialized');
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  let anyMediaState = this.mediaStates_[ContentType.VIDEO] ||
                      this.mediaStates_[ContentType.AUDIO];
  return anyMediaState ?
         this.manifest_.periods[anyMediaState.needPeriodIndex] : null;
};


/**
 * Get the active audio stream. Returns null if there is no audio streaming.
 * @return {?shakaExtern.Stream}
 */
shaka.media.StreamingEngine.prototype.getActiveAudio = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return this.getStream_(ContentType.AUDIO);
};


/**
 * Get the active video stream. Returns null if there is no video streaming.
 * @return {?shakaExtern.Stream}
 */
shaka.media.StreamingEngine.prototype.getActiveVideo = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return this.getStream_(ContentType.VIDEO);
};


/**
 * Get the active text stream. Returns null if there is no text streaming.
 * @return {?shakaExtern.Stream}
 */
shaka.media.StreamingEngine.prototype.getActiveText = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  return this.getStream_(ContentType.TEXT);
};


/**
 * Get the active stream for the given type. Returns null if there is no stream
 * for the given type.
 * @param {shaka.util.ManifestParserUtils.ContentType} type
 * @return {?shakaExtern.Stream}
 * @private
*/
shaka.media.StreamingEngine.prototype.getStream_ = function(type) {
  goog.asserts.assert(this.mediaStates_, 'Must be initialized');
  let state = this.mediaStates_[type];

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
 * @param {shakaExtern.Stream} stream
 * @return {!Promise}
 */
shaka.media.StreamingEngine.prototype.loadNewTextStream = function(
    stream) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  // Clear MediaSource's buffered text, so that the new text stream will
  // properly replace the old buffered text.
  this.playerInterface_.mediaSourceEngine.clear(ContentType.TEXT);

  // Since setupStreams_() is async, if the user hides/shows captions quickly,
  // there would be a race condition that a new text media state is created
  // but the old media state is not yet deleted.
  // The Sequence Id is to avoid that risk condition.
  this.textStreamSequenceId_++;
  this.unloadingTextStream_ = false;
  let currentSequenceId = this.textStreamSequenceId_;

  let mediaSourceEngine = this.playerInterface_.mediaSourceEngine;

  return mediaSourceEngine.init({text: stream}, /** forceTansmuxTS */ false)
      .then(() => {
    return this.setupStreams_([stream]);
  }).then(() => {
    if (this.destroyed_) {
      return;
    }

    if ((this.textStreamSequenceId_ == currentSequenceId) &&
        !this.mediaStates_[ContentType.TEXT] && !this.unloadingTextStream_) {
      let playheadTime = this.playerInterface_.playhead.getTime();
      let needPeriodIndex = this.findPeriodContainingTime_(playheadTime);
      this.mediaStates_[ContentType.TEXT] =
          this.createMediaState_(stream, needPeriodIndex);
      this.scheduleUpdate_(this.mediaStates_[ContentType.TEXT], 0);
    }
  });
};


/**
 * Stop fetching text stream when the user chooses to hide the captions.
 */
shaka.media.StreamingEngine.prototype.unloadTextStream = function() {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  this.unloadingTextStream_ = true;
  if (this.mediaStates_[ContentType.TEXT]) {
    this.cancelUpdate_(this.mediaStates_[ContentType.TEXT]);
    delete this.mediaStates_[ContentType.TEXT];
  }
};


/**
 * Set trick play on or off.
 * If trick play is on, related trick play streams will be used when possible.
 * @param {boolean} on
 */
shaka.media.StreamingEngine.prototype.setTrickPlay = function(on) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  let mediaState = this.mediaStates_[ContentType.VIDEO];
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
    this.switchInternal_(trickModeVideo, false);
    mediaState.restoreStreamAfterTrickPlay = stream;
  } else {
    let normalVideo = mediaState.restoreStreamAfterTrickPlay;
    if (!normalVideo) return;

    shaka.log.debug('Restoring non-trick-mode stream', normalVideo);
    mediaState.restoreStreamAfterTrickPlay = null;
    this.switchInternal_(normalVideo, true);
  }
};


/**
 * @param {shakaExtern.Variant} variant
 * @param {boolean} clearBuffer
 */
shaka.media.StreamingEngine.prototype.switchVariant =
    function(variant, clearBuffer) {
  if (variant.video) {
    this.switchInternal_(variant.video, clearBuffer);
  }

  if (variant.audio) {
    this.switchInternal_(variant.audio, clearBuffer);
  }
};


/**
 * @param {shakaExtern.Stream} textStream
 */
shaka.media.StreamingEngine.prototype.switchTextStream = function(textStream) {
  goog.asserts.assert(textStream && textStream.type == 'text',
                      'Wrong stream type passed to switchTextStream!');
  this.switchInternal_(textStream, /* clearBuffer */ true);
};


/**
 * Switches to the given Stream. |stream| may be from any Variant or any Period.
 *
 * @param {shakaExtern.Stream} stream
 * @param {boolean} clearBuffer
 * @private
 */
shaka.media.StreamingEngine.prototype.switchInternal_ = function(
    stream, clearBuffer) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  let mediaState = this.mediaStates_[/** @type {!ContentType} */(stream.type)];

  if (!mediaState && stream.type == ContentType.TEXT &&
      this.config_.ignoreTextStreamFailures) {
    this.loadNewTextStream(stream);
    return;
  }
  goog.asserts.assert(mediaState, 'switch: expected mediaState to exist');
  if (!mediaState) return;

  // If we are selecting a stream from a different Period, then we need to
  // handle a Period transition.  Simply ignore the given stream, assuming that
  // Player will select the same track in onChooseStreams.
  let periodIndex = this.findPeriodContainingStream_(stream);
  if (clearBuffer && periodIndex != mediaState.needPeriodIndex) {
    shaka.log.debug('switch: switching to stream in another Period; clearing ' +
                    'buffer and changing Periods');
    // handlePeriodTransition_ will be called on the next update because the
    // current Period won't match the playhead Period.
    this.clearAllBuffers_();
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
  canSwitchRecord = this.canSwitchStream_[stream.id];
  goog.asserts.assert(canSwitchRecord && canSwitchRecord.resolved,
                      'switch: expected Stream ' + stream.id + ' to be ready');
  if (!canSwitchRecord || !canSwitchRecord.resolved) return;

  if (mediaState.stream == stream) {
    let streamTag = shaka.media.StreamingEngine.logPrefix_(mediaState);
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

  if (clearBuffer) {
    if (mediaState.clearingBuffer) {
      // We are already going to clear the buffer, but make sure it is also
      // flushed.
      mediaState.waitingToFlushBuffer = true;
    } else if (mediaState.performingUpdate) {
      // We are performing an update, so we have to wait until it's finished.
      // onUpdate_() will call clearBuffer_() when the update has finished.
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

  let playheadTime = this.playerInterface_.playhead.getTime();
  const smallGapLimit = this.config_.smallGapLimit;
  let isAllBuffered = Object.keys(this.mediaStates_).every(function(type) {
    return this.playerInterface_.mediaSourceEngine.isBuffered(
        type, playheadTime, smallGapLimit);
  }.bind(this));

  // Only treat this as a buffered seek if every media state has a buffer.  For
  // example, if we have buffered text but not video, we should still clear
  // every buffer so all media states need the same Period.
  if (isAllBuffered) {
    shaka.log.debug(
        '(all): seeked: buffered seek: playheadTime=' + playheadTime);
    return;
  }

  // This was an unbuffered seek for at least one stream, so clear all buffers.
  // Don't clear only some of the buffers because we can become stalled since
  // the media states are waiting for different Periods.
  shaka.log.debug('(all): seeked: unbuffered seek: clearing all buffers');
  this.clearAllBuffers_();
};


/**
 * Clears the buffer for every stream.  Unlike clearBuffer_, this will handle
 * cases where a MediaState is performing an update.  After this runs, every
 * MediaState will have a pending update.
 * @private
 */
shaka.media.StreamingEngine.prototype.clearAllBuffers_ = function() {
  for (let type in this.mediaStates_) {
    let mediaState = this.mediaStates_[type];
    let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    if (mediaState.clearingBuffer) {
      // We're already clearing the buffer, so we don't need to clear the
      // buffer again.
      shaka.log.debug(logPrefix, 'clear: already clearing the buffer');
      continue;
    }

    if (mediaState.waitingToClearBuffer) {
      // May not be performing an update, but an update will still happen.
      // See: https://github.com/google/shaka-player/issues/334
      shaka.log.debug(logPrefix, 'clear: already waiting');
      continue;
    }

    if (mediaState.performingUpdate) {
      // We are performing an update, so we have to wait until it's finished.
      // onUpdate_() will call clearBuffer_() when the update has finished.
      shaka.log.debug(logPrefix, 'clear: currently updating');
      mediaState.waitingToClearBuffer = true;
      continue;
    }

    if (this.playerInterface_.mediaSourceEngine.bufferStart(type) == null) {
      // Nothing buffered.
      shaka.log.debug(logPrefix, 'clear: nothing buffered');
      if (mediaState.updateTimer == null) {
        // Note: an update cycle stops when we buffer to the end of the
        // presentation or Period, or when we raise an error.
        this.scheduleUpdate_(mediaState, 0);
      }
      continue;
    }

    // An update may be scheduled, but we can just cancel it and clear the
    // buffer right away. Note: clearBuffer_() will schedule the next update.
    shaka.log.debug(logPrefix, 'clear: handling right now');
    this.cancelUpdate_(mediaState);
    this.clearBuffer_(mediaState, /* flush */ false);
  }
};


/**
 * Initializes the given streams and media states if required.  This will
 * schedule updates for the given types.
 *
 * @param {shaka.media.StreamingEngine.ChosenStreams} chosenStreams
 * @param {number=} opt_resumeAt
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.initStreams_ = function(
    chosenStreams, opt_resumeAt) {
  goog.asserts.assert(this.config_,
      'StreamingEngine configure() must be called before init()!');

  // Determine which Period we must buffer.
  let playheadTime = this.playerInterface_.playhead.getTime();
  let needPeriodIndex = this.findPeriodContainingTime_(playheadTime);

  // Init/re-init MediaSourceEngine. Note that a re-init is only valid for text.
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /** @type {!Object.<!ContentType, shakaExtern.Stream>} */
  let streamsByType = {};
  /** @type {!Array.<shakaExtern.Stream>} */
  let streams = [];

  if (chosenStreams.variant && chosenStreams.variant.audio) {
    streamsByType[ContentType.AUDIO] = chosenStreams.variant.audio;
    streams.push(chosenStreams.variant.audio);
  }
  if (chosenStreams.variant && chosenStreams.variant.video) {
    streamsByType[ContentType.VIDEO] = chosenStreams.variant.video;
    streams.push(chosenStreams.variant.video);
  }
  if (chosenStreams.text) {
    streamsByType[ContentType.TEXT] = chosenStreams.text;
    streams.push(chosenStreams.text);
  }

  // Init MediaSourceEngine.
  let mediaSourceEngine = this.playerInterface_.mediaSourceEngine;
  let forceTransmuxTS = this.config_.forceTransmuxTS;
  return mediaSourceEngine.init(streamsByType, forceTransmuxTS).then(() => {
    if (this.destroyed_) {
      return;
    }

    this.setDuration_();

    // Setup the initial set of Streams and then begin each update cycle. After
    // startup completes onUpdate_() will set up the remaining Periods.
    return this.setupStreams_(streams);
  }).then(() => {
    if (this.destroyed_) {
      return;
    }

    for (let type in streamsByType) {
      let stream = streamsByType[type];
      if (!this.mediaStates_[type]) {
        this.mediaStates_[type] =
            this.createMediaState_(stream, needPeriodIndex, opt_resumeAt);
        this.scheduleUpdate_(this.mediaStates_[type], 0);
      }
    }
  });
};


/**
 * Creates a media state.
 *
 * @param {shakaExtern.Stream} stream
 * @param {number} needPeriodIndex
 * @param {number=} opt_resumeAt
 * @return {shaka.media.StreamingEngine.MediaState_}
 * @private
 */
shaka.media.StreamingEngine.prototype.createMediaState_ = function(
    stream, needPeriodIndex, opt_resumeAt) {
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
    waitingToFlushBuffer: false,
    clearingBuffer: false,
    recovering: false,
    hasError: false,
    resumeAt: opt_resumeAt || 0
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
  const Functional = shaka.util.Functional;
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
    resolved: false
  };
  this.canSwitchPeriod_[periodIndex] = canSwitchRecord;

  let streams = this.manifest_.periods[periodIndex].variants
      .map(function(variant) {
        let result = [];
        if (variant.audio) {
          result.push(variant.audio);
        }
        if (variant.video) {
          result.push(variant.video);
        }
        if (variant.video && variant.video.trickModeVideo) {
          result.push(variant.video.trickModeVideo);
        }
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
 * @param {!Array.<!shakaExtern.Stream>} streams
 * @return {!Promise}
 * @private
 */
shaka.media.StreamingEngine.prototype.setupStreams_ = function(streams) {
  // Make sure that all the streams have unique ids.
  // (Duplicate ids will cause the player to hang).
  let uniqueStreamIds = streams.map(function(s) { return s.id; })
                               .filter(shaka.util.Functional.isNotDuplicate);

  goog.asserts.assert(uniqueStreamIds.length == streams.length,
                      'streams should have unique ids');
  // Parallelize Stream set up.
  let async = [];

  for (let i = 0; i < streams.length; ++i) {
    let stream = streams[i];
    let canSwitchRecord = this.canSwitchStream_[stream.id];

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

    for (let i = 0; i < streams.length; ++i) {
      let stream = streams[i];
      let canSwitchRecord = this.canSwitchStream_[stream.id];
      if (!canSwitchRecord.resolved) {
        canSwitchRecord.promise.resolve();
        canSwitchRecord.resolved = true;
        shaka.log.v1('(all) setup Stream ' + stream.id);
      }
    }
  }.bind(this)).catch(function(error) {
    if (this.destroyed_) return;
    for (let i = 0; i < streams.length; i++) {
      this.canSwitchStream_[streams[i].id].promise.catch(() => {});
      this.canSwitchStream_[streams[i].id].promise.reject();
      delete this.canSwitchStream_[streams[i].id];
    }
    return Promise.reject(error);
  }.bind(this));
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
  const MapUtils = shaka.util.MapUtils;
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
    this.clearBuffer_(mediaState, mediaState.waitingToFlushBuffer);
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

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');

  let mediaStates = MapUtils.values(this.mediaStates_);

  // Check if we've buffered to the end of the Period.
  this.handlePeriodTransition_(mediaState);

  // Check if we've buffered to the end of the presentation.
  if (mediaStates.every(function(ms) { return ms.endOfStream; })) {
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
      let duration = this.playerInterface_.mediaSourceEngine.getDuration();
      if (duration < this.manifest_.presentationTimeline.getDuration()) {
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
  const MapUtils = shaka.util.MapUtils;

  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  // Compute how far we've buffered ahead of the playhead.
  let playheadTime = this.playerInterface_.playhead.getTime();

  // Get the next timestamp we need.
  let timeNeeded = this.getTimeNeeded_(mediaState, playheadTime);
  shaka.log.v2(logPrefix, 'timeNeeded=' + timeNeeded);

  let currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);
  let needPeriodIndex = this.findPeriodContainingTime_(timeNeeded);

  // Get the amount of content we have buffered, accounting for drift.  This
  // is only used to determine if we have meet the buffering goal.  This should
  // be the same method that PlayheadObserver uses.
  let bufferedAhead = this.playerInterface_.mediaSourceEngine.bufferedAheadOf(
      mediaState.type, playheadTime);

  shaka.log.v2(logPrefix,
               'update_:',
               'playheadTime=' + playheadTime,
               'bufferedAhead=' + bufferedAhead);

  let bufferingGoal = this.getBufferingGoal_();

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
  // because a SegmentIndex can provide SegmentReferences outside its Period.
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

  let bufferEnd =
      this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);
  let reference = this.getSegmentReferenceNeeded_(
      mediaState, playheadTime, bufferEnd, currentPeriodIndex);
  if (!reference) {
    // The segment could not be found, does not exist, or is not available.  In
    // any case just try again... if the manifest is incomplete or is not being
    // updated then we'll idle forever; otherwise, we'll end up getting a
    // SegmentReference eventually.
    return 1;
  }

  // Do not let any one stream get far ahead of any other.
  let minTimeNeeded = Infinity;
  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  const mediaStates = MapUtils.values(this.mediaStates_);
  mediaStates.forEach((otherState) => {
    const timeNeeded = this.getTimeNeeded_(otherState, playheadTime);
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

  let rebufferingGoal = shaka.util.StreamUtils.getRebufferingGoal(
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
  //   1. Actual segments end slightly before their advertised end times, so
  //      the next timestamp we need is actually larger than |bufferEnd|.
  //   2. There may be drift (the timestamps in the segments are ahead/behind
  //      of the timestamps in the manifest), but we need drift-free times when
  //      comparing times against presentation and Period boundaries.
  if (!mediaState.lastStream || !mediaState.lastSegmentReference) {
    return Math.max(playheadTime, mediaState.resumeAt);
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
 * @param {number} playheadTime
 * @param {?number} bufferEnd
 * @param {number} currentPeriodIndex
 * @return {shaka.media.SegmentReference} The SegmentReference of the
 *   next segment needed. Returns null if a segment could not be found, does not
 *   exist, or is not available.
 * @private
 */
shaka.media.StreamingEngine.prototype.getSegmentReferenceNeeded_ = function(
    mediaState, playheadTime, bufferEnd, currentPeriodIndex) {
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
        mediaState, bufferEnd || playheadTime, currentPeriodIndex);
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
 * @param {number} playheadTime
 * @param {number} currentPeriodIndex The index of the current Period.
 * @param {!shaka.media.SegmentReference} reference
 * @private
 */
shaka.media.StreamingEngine.prototype.fetchAndAppend_ = function(
    mediaState, playheadTime, currentPeriodIndex, reference) {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const StreamingEngine = shaka.media.StreamingEngine;
  const logPrefix = StreamingEngine.logPrefix_(mediaState);
  const currentPeriod = this.manifest_.periods[currentPeriodIndex];

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
  let fetchSegment = this.fetch_(reference);

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

      delete this.mediaStates_[ContentType.TEXT];
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

  for (let type in this.mediaStates_) {
    let mediaState = this.mediaStates_[type];
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

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  let mediaStates = shaka.util.MapUtils.values(this.mediaStates_);
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
  let fetchInit = this.fetch_(mediaState.stream.initSegmentReference);
  let appendInit = fetchInit.then(function(initSegment) {
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
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  if (stream.containsEmsgBoxes) {
    new shaka.util.Mp4Parser()
        .fullBox('emsg', this.parseEMSG_.bind(this, period, reference))
        .parse(segment);
  }

  return this.evict_(mediaState, playheadTime).then(function() {
    if (this.destroyed_) return;
    shaka.log.v1(logPrefix, 'appending media segment');

    // MediaSourceEngine expects times relative to the start of the
    // presentation.  Reference times are relative to the start of the period.
    const startTime = reference.startTime + period.startTime;
    const endTime = reference.endTime + period.startTime;

    return this.playerInterface_.mediaSourceEngine.appendBuffer(
        mediaState.type, segment, startTime, endTime);
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
 * @param {!shakaExtern.ParsedBox} box
 * @private
 */
shaka.media.StreamingEngine.prototype.parseEMSG_ = function(
    period, reference, box) {

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

  // See DASH sec. 5.10.4.1
  // A special scheme in DASH used to signal manifest updates.
  if (schemeId == 'urn:mpeg:dash:event:2012') {
    this.playerInterface_.onManifestUpdate();
  } else {
    /** @type {shakaExtern.EmsgInfo} */
    let emsg = {
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

    // Dispatch an event to notify the application about the emsg box.
    let event = new shaka.util.FakeEvent('emsg', {'detail': emsg});
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
                 'playheadTime=' + playheadTime,
                 'bufferBehind=' + bufferBehind);
    return Promise.resolve();
  }
  let bufferedBehind = playheadTime - startTime;

  let overflow = bufferedBehind - bufferBehind;
  if (overflow <= 0) {
    shaka.log.v2(logPrefix,
                 'buffer behind okay:',
                 'playheadTime=' + playheadTime,
                 'bufferedBehind=' + bufferedBehind,
                 'bufferBehind=' + bufferBehind,
                 'underflow=' + (-overflow));
    return Promise.resolve();
  }

  shaka.log.v1(logPrefix,
               'buffer behind too large:',
               'playheadTime=' + playheadTime,
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
 * @param {shakaExtern.Stream} stream
 * @private
 */
shaka.media.StreamingEngine.prototype.handleStartup_ = function(
    mediaState, stream) {
  const Functional = shaka.util.Functional;
  const MapUtils = shaka.util.MapUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  if (this.startupComplete_) {
    return;
  }

  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  let mediaStates = MapUtils.values(this.mediaStates_);
  this.startupComplete_ = mediaStates.every(function(ms) {
    // Startup completes once we have buffered at least one segment from each
    // MediaState, not counting text.
    if (ms.type == ContentType.TEXT) return true;
    return !ms.waitingToClearBuffer &&
           !ms.clearingBuffer &&
           ms.lastSegmentReference;
  });

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
  const MapUtils = shaka.util.MapUtils;
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  let currentPeriodIndex = this.findPeriodContainingStream_(mediaState.stream);
  if (mediaState.needPeriodIndex == currentPeriodIndex) {
    return;
  }

  let needPeriodIndex = mediaState.needPeriodIndex;

  goog.asserts.assert(this.mediaStates_, 'must not be destroyed');
  let mediaStates = MapUtils.values(this.mediaStates_);

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
      'All MediaStates should need the same Period or be performing updates.');

  // Only call onChooseStreams() when all MediaStates need the same Period.
  let needSamePeriod = mediaStates.every(function(ms) {
    return ms.needPeriodIndex == needPeriodIndex;
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
    let streamsByType = {};
    if (chosenStreams.variant && chosenStreams.variant.video) {
      streamsByType[ContentType.VIDEO] = chosenStreams.variant.video;
    }
    if (chosenStreams.variant && chosenStreams.variant.audio) {
      streamsByType[ContentType.AUDIO] = chosenStreams.variant.audio;
    }
    if (chosenStreams.text) {
      streamsByType[ContentType.TEXT] = chosenStreams.text;
    }

    // Vet |streamsByType| before switching.
    for (let type in this.mediaStates_) {
      if (streamsByType[type] || type == ContentType.TEXT) continue;

      shaka.log.error(logPrefix,
                      'invalid Streams chosen: missing ' + type + ' Stream');
      this.playerInterface_.onError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STREAMING,
          shaka.util.Error.Code.INVALID_STREAMS_CHOSEN));
      return;
    }

    for (let type in streamsByType) {
      if (this.mediaStates_[/** @type {!ContentType} */(type)]) continue;

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

    for (let type in this.mediaStates_) {
      let stream = streamsByType[type];
      if (stream) {
        this.switchInternal_(stream, /* clearBuffer */ false);
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
  const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
  let request = shaka.net.NetworkingEngine.makeRequest(
      reference.getUris(), this.config_.retryParameters);

  // Set the Range header. Note that some web servers don't accept Range
  // headers, so don't set one if it's not strictly required.
  if ((reference.startByte != 0) || (reference.endByte != null)) {
    let range = 'bytes=' + reference.startByte + '-';
    if (reference.endByte != null) range += reference.endByte;
    request.headers['Range'] = range;
  }

  shaka.log.v2('fetching: reference=', reference);
  let op = this.playerInterface_.netEngine.request(requestType, request);
  return op.promise.then(function(response) {
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
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

  goog.asserts.assert(
      !mediaState.performingUpdate && (mediaState.updateTimer == null),
      logPrefix + ' unexpected call to clearBuffer_()');

  mediaState.waitingToClearBuffer = false;
  mediaState.waitingToFlushBuffer = false;
  mediaState.clearingBuffer = true;

  shaka.log.debug(logPrefix, 'clearing buffer');
  let p = this.playerInterface_.mediaSourceEngine.clear(mediaState.type);
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
  let logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
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
