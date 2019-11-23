/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.StreamingEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.net.Backoff');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.DelayedTick');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Iterables');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Networking');
goog.require('shaka.util.Periods');


/**
 * @summary Creates a Streaming Engine.
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
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.StreamingEngine = class {
  /**
   * @param {shaka.extern.Manifest} manifest
   * @param {shaka.media.StreamingEngine.PlayerInterface} playerInterface
   */
  constructor(manifest, playerInterface) {
    /** @private {?shaka.media.StreamingEngine.PlayerInterface} */
    this.playerInterface_ = playerInterface;

    /** @private {?shaka.extern.Manifest} */
    this.manifest_ = manifest;

    /** @private {?shaka.extern.StreamingConfiguration} */
    this.config_ = null;

    /** @private {number} */
    this.bufferingGoalScale_ = 1;

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
     * Used for delay and backoff of failure callbacks, so that apps do not
     * retry instantly.
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

    /**
     * Set to true when a request to unload text stream comes in. This is used
     * since loading new text stream is async, the request of unloading text
     * stream might come in before setting up new text stream is finished.
     * @private {boolean}
     */
    this.unloadingTextStream_ = false;

    /** @private {number} */
    this.textStreamSequenceId_ = 0;

    /** @private {!shaka.util.Destroyer} */
    this.destroyer_ = new shaka.util.Destroyer(() => this.doDestroy_());
  }

  /** @override */
  destroy() {
    return this.destroyer_.destroy();
  }

  /**
   * @return {!Promise}
   * @private
   */
  doDestroy_() {
    for (const state of this.mediaStates_.values()) {
      this.cancelUpdate_(state);
    }

    this.mediaStates_.clear();

    this.playerInterface_ = null;
    this.manifest_ = null;
    this.config_ = null;

    return Promise.resolve();
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes. Must be called at least once before init().
   *
   * @param {shaka.extern.StreamingConfiguration} config
   */
  configure(config) {
    this.config_ = config;

    // Create separate parameters for backoff during streaming failure.

    /** @type {shaka.extern.RetryParameters} */
    const failureRetryParams = {
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
    const autoReset = true;
    this.failureCallbackBackoff_ =
        new shaka.net.Backoff(failureRetryParams, autoReset);
  }


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
   * After the StreamingEngine completes this startup phase it will begin
   * setting up each Period's Streams (while buffering in parrallel).
   *
   * When the StreamingEngine needs to buffer the next Period it will have
   * already set up that Period's Streams. So, when the StreamingEngine calls
   * onChooseStreams(p) after the first time, the StreamingEngine will
   * immediately switch to the Streams returned from that function.
   *
   * @return {!Promise}
   */
  async start() {
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
      throw new shaka.util.Error(
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
    this.destroyer_.ensureNotDestroyed();

    shaka.log.debug('init: completed initial Stream setup');

    // Subtlety: onInitialStreamsSetup() may call switch() or seeked(), so we
    // must schedule an update beforehand so |updateTimer| is set.
    if (this.playerInterface_ && this.playerInterface_.onInitialStreamsSetup) {
      shaka.log.v1('init: calling onInitialStreamsSetup()...');
      this.playerInterface_.onInitialStreamsSetup();
    }
  }


  /**
   * Gets the Period in which we are currently buffering.  This might be
   * different from the Period which contains the Playhead.
   * @return {?shaka.extern.Period}
   */
  getBufferingPeriod() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const video = this.mediaStates_.get(ContentType.VIDEO);
    if (video) {
      return this.manifest_.periods[video.needPeriodIndex];
    }

    const audio = this.mediaStates_.get(ContentType.AUDIO);
    if (audio) {
      return this.manifest_.periods[audio.needPeriodIndex];
    }

    return null;
  }


  /**
   * Get the audio stream which we are currently buffering.  Returns null if
   * there is no audio streaming.
   * @return {?shaka.extern.Stream}
   */
  getBufferingAudio() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return this.getStream_(ContentType.AUDIO);
  }


  /**
   * Get the video stream which we are currently buffering.  Returns null if
   * there is no video streaming.
   * @return {?shaka.extern.Stream}
   */
  getBufferingVideo() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return this.getStream_(ContentType.VIDEO);
  }


  /**
   * Get the text stream which we are currently buffering.  Returns null if
   * there is no text streaming.
   * @return {?shaka.extern.Stream}
   */
  getBufferingText() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    return this.getStream_(ContentType.TEXT);
  }

  /**
   * Get the stream of the given type which we are currently buffering.  Returns
   * null if there is no stream for the given type.
   * @param {shaka.util.ManifestParserUtils.ContentType} type
   * @return {?shaka.extern.Stream}
   * @private
  */
  getStream_(type) {
    const state = this.mediaStates_.get(type);

    if (state) {
      // Don't tell the caller about trick play streams.  If we're in trick
      // play, return the stream we will go back to after we exit trick play.
      return state.restoreStreamAfterTrickPlay || state.stream;
    } else {
      return null;
    }
  }

  /**
   * Notifies StreamingEngine that a new text stream was added to the manifest.
   * This initializes the given stream. This returns a Promise that resolves
   * when the stream has been set up, and a media state has been created.
   *
   * @param {shaka.extern.Stream} stream
   * @return {!Promise}
   */
  async loadNewTextStream(stream) {
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
    const currentSequenceId = this.textStreamSequenceId_;

    const mediaSourceEngine = this.playerInterface_.mediaSourceEngine;

    const streamMap = new Map();
    const streamSet = new Set();

    streamMap.set(ContentType.TEXT, stream);
    streamSet.add(stream);

    await mediaSourceEngine.init(streamMap, /** forceTansmuxTS */ false);
    this.destroyer_.ensureNotDestroyed();

    const textDisplayer =
        this.playerInterface_.mediaSourceEngine.getTextDisplayer();

    const streamText =
        textDisplayer.isTextVisible() || this.config_.alwaysStreamText;

    const presentationTime = this.playerInterface_.getPresentationTime();
    const needPeriodIndex = this.findPeriodForTime_(presentationTime);
    const state = this.createMediaState_(
        stream,
        needPeriodIndex,
        /* resumeAt= */ 0);

    if ((this.textStreamSequenceId_ == currentSequenceId) &&
        !this.mediaStates_.has(ContentType.TEXT) &&
        !this.unloadingTextStream_ && streamText) {
      this.mediaStates_.set(ContentType.TEXT, state);
      this.scheduleUpdate_(state, 0);
    }
  }


  /**
   * Stop fetching text stream when the user chooses to hide the captions.
   */
  unloadTextStream() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    this.unloadingTextStream_ = true;

    const state = this.mediaStates_.get(ContentType.TEXT);
    if (state) {
      this.cancelUpdate_(state);
      this.mediaStates_.delete(ContentType.TEXT);
    }
  }

  /**
   * Set trick play on or off.
   * If trick play is on, related trick play streams will be used when possible.
   * @param {boolean} on
   */
  setTrickPlay(on) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const mediaState = this.mediaStates_.get(ContentType.VIDEO);
    if (!mediaState) {
      return;
    }

    const stream = mediaState.stream;
    if (!stream) {
      return;
    }

    shaka.log.debug('setTrickPlay', on);
    if (on) {
      const trickModeVideo = stream.trickModeVideo;
      if (!trickModeVideo) {
        return;  // Can't engage trick play.
      }

      const normalVideo = mediaState.restoreStreamAfterTrickPlay;
      if (normalVideo) {
        return;  // Already in trick play.
      }

      shaka.log.debug('Engaging trick mode stream', trickModeVideo);
      this.switchInternal_(trickModeVideo, /* clearBuffer= */ false,
          /* safeMargin= */ 0, /* force= */ false);

      mediaState.restoreStreamAfterTrickPlay = stream;
    } else {
      const normalVideo = mediaState.restoreStreamAfterTrickPlay;
      if (!normalVideo) {
        return;
      }

      shaka.log.debug('Restoring non-trick-mode stream', normalVideo);
      mediaState.restoreStreamAfterTrickPlay = null;
      this.switchInternal_(normalVideo, /* clearBuffer= */ true,
          /* safeMargin= */ 0, /* force= */ false);
    }
  }


  /**
   * @param {shaka.extern.Variant} variant
   * @param {boolean} clearBuffer
   * @param {number} safeMargin
   */
  switchVariant(variant, clearBuffer, safeMargin) {
    if (variant.video) {
      this.switchInternal_(
          variant.video, /* clearBuffer= */ clearBuffer,
          /* safeMargin= */ safeMargin, /* force= */ false);
    }
    if (variant.audio) {
      this.switchInternal_(
          variant.audio, /* clearBuffer= */ clearBuffer,
          /* safeMargin= */ safeMargin, /* force= */ false);
    }
  }


  /**
   * @param {shaka.extern.Stream} textStream
   */
  switchTextStream(textStream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    goog.asserts.assert(textStream && textStream.type == ContentType.TEXT,
        'Wrong stream type passed to switchTextStream!');
    this.switchInternal_(
        textStream, /* clearBuffer= */ true,
        /* safeMargin= */ 0, /* force= */ false);
  }


  /** Reload the current text stream. */
  reloadTextStream() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const mediaState = this.mediaStates_.get(ContentType.TEXT);
    if (mediaState) { // Don't reload if there's no text to begin with.
      this.switchInternal_(
          mediaState.stream, /* clearBuffer= */ true,
          /* safeMargin= */ 0, /* force= */ true);
    }
  }


  /**
   * Switches to the given Stream. |stream| may be from any Variant or any
   * Period.
   *
   * @param {shaka.extern.Stream} stream
   * @param {boolean} clearBuffer
   * @param {number} safeMargin
   * @param {boolean} force
   *   If true, reload the text stream even if it did not change.
   * @private
   */
  switchInternal_(stream, clearBuffer, safeMargin, force) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const type = /** @type {!ContentType} */(stream.type);
    const mediaState = this.mediaStates_.get(type);

    if (!mediaState && stream.type == ContentType.TEXT &&
        this.config_.ignoreTextStreamFailures) {
      this.loadNewTextStream(stream);
      return;
    }
    goog.asserts.assert(mediaState, 'switch: expected mediaState to exist');
    if (!mediaState) {
      return;
    }

    // If we are selecting a stream from a different Period, then we need to
    // handle a Period transition. Simply ignore the given stream, assuming that
    // Player will select the same track in onChooseStreams.
    const periodIndex = this.findPeriodContainingStream_(stream);
    const mediaStates = Array.from(this.mediaStates_.values());
    const needSamePeriod = mediaStates.every((ms) => {
      return ms.needPeriodIndex == mediaState.needPeriodIndex;
    });
    if (clearBuffer && periodIndex != mediaState.needPeriodIndex &&
        needSamePeriod) {
      shaka.log.debug('switch: switching to stream in another Period; ' +
                      'clearing buffer and changing Periods');
      // handlePeriodTransition_ will be called on the next update because the
      // current Period won't match the playhead Period.
      for (const mediaState of this.mediaStates_.values()) {
        this.forceClearBuffer_(mediaState);
      }
      return;
    }

    if (mediaState.restoreStreamAfterTrickPlay) {
      shaka.log.debug('switch during trick play mode', stream);

      // Already in trick play mode, so stick with trick mode tracks if
      // possible.
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

    if (mediaState.stream == stream && !force) {
      const streamTag = shaka.media.StreamingEngine.logPrefix_(mediaState);
      shaka.log.debug('switch: Stream ' + streamTag + ' already active');
      return;
    }

    if (stream.type == ContentType.TEXT) {
      // Mime types are allowed to change for text streams.
      // Reinitialize the text parser, but only if we are going to fetch the
      // init segment again.
      const fullMimeType = shaka.util.MimeUtils.getFullType(
          stream.mimeType, stream.codecs);
      this.playerInterface_.mediaSourceEngine.reinitText(fullMimeType);
    }

    mediaState.stream = stream;
    mediaState.needInitSegment = true;

    const streamTag = shaka.media.StreamingEngine.logPrefix_(mediaState);
    shaka.log.debug('switch: switching to Stream ' + streamTag);

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
                this.playerInterface_.onError(error);
              }
            });
      }
    }

    this.makeAbortDecision_(mediaState, periodIndex).catch((error) => {
      if (this.playerInterface_) {
        this.playerInterface_.onError(error);
      }
    });
  }


  /**
   * Decide if it makes sense to abort the current operation, and abort it if
   * so.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} periodIndex
   * @private
   */
  async makeAbortDecision_(mediaState, periodIndex) {
    // If the operation is completed, it will be set to null, and there's no
    // need to abort the request.
    if (!mediaState.operation) {
      return;
    }

    const originalStream = mediaState.stream;
    const originalOperation = mediaState.operation;

    if (!originalStream.segmentIndex) {
      await originalStream.createSegmentIndex();
    }

    if (mediaState.operation != originalOperation) {
      // The original operation completed while we were getting a segment index,
      // so there's nothing to do now.
      return;
    }

    if (mediaState.stream != originalStream) {
      // The stream changed again while we were getting a segment index.  We
      // can't carry out this check, since another one might be in progress by
      // now.
      return;
    }

    if (this.shouldAbortCurrentRequest_(mediaState, periodIndex)) {
      shaka.log.info('Aborting current segment request.');
      mediaState.operation.abort();
    }
  }

  /**
   * Returns whether we should abort the current request.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} periodIndex
   * @return {boolean}
   * @private
   */
  shouldAbortCurrentRequest_(mediaState, periodIndex) {
    goog.asserts.assert(mediaState.operation,
        'Abort logic requires an ongoing operation!');

    const presentationTime = this.playerInterface_.getPresentationTime();
    const bufferEnd =
        this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);

    // The next segment to append from the current stream.  This doesn't
    // account for a pending network request and will likely be different from
    // that since we just switched.
    const newSegment = this.getSegmentReferenceNeeded_(
        mediaState, presentationTime, bufferEnd, periodIndex);
    let newSegmentSize = newSegment ? newSegment.getSize() : null;
    if (newSegmentSize == null) {
      return false;
    }

    // When switching, we'll need to download the init segment.
    const init = newSegment.initSegmentReference;
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
  }


  /**
   * Notifies the StreamingEngine that the playhead has moved to a valid time
   * within the presentation timeline.
   */
  seeked() {
    const Iterables = shaka.util.Iterables;
    const presentationTime = this.playerInterface_.getPresentationTime();
    const smallGapLimit = this.config_.smallGapLimit;
    const newTimeIsBuffered = (type) => {
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
        const bufferEnd =
            this.playerInterface_.mediaSourceEngine.bufferEnd(type);
        const somethingBuffered = bufferEnd != null;
        // Don't clear the buffer unless something is buffered.  This extra
        // check prevents extra, useless calls to clear the buffer.
        if (somethingBuffered && !newTimeIsBuffered(type)) {
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
          this.mediaStates_.keys(), newTimeIsBuffered);
      if (!isAllBuffered) {
        // This was an unbuffered seek for at least one stream, so clear all
        // buffers.
        // Don't clear only some of the buffers because we can become stalled
        // since the media states are waiting for different Periods.
        shaka.log.debug('(all): seeked: unbuffered seek: clearing all buffers');
        for (const mediaState of this.mediaStates_.values()) {
          this.forceClearBuffer_(mediaState);
        }
        streamCleared = true;
      }
    }

    if (!streamCleared) {
      shaka.log.debug(
          '(all): seeked: buffered seek: presentationTime=' + presentationTime);
    }
  }


  /**
   * Clear the buffer for a given stream.  Unlike clearBuffer_, this will handle
   * cases where a MediaState is performing an update.  After this runs, every
   * MediaState will have a pending update.
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @private
   */
  forceClearBuffer_(mediaState) {
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
        this.playerInterface_.onError(error);
      }
    });
  }


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
  async initStreams_(audio, video, text, resumeAt) {
    goog.asserts.assert(this.config_,
        'StreamingEngine configure() must be called before init()!');

    // Determine which Period we must buffer.
    const presentationTime = this.playerInterface_.getPresentationTime();
    const needPeriodIndex = this.findPeriodForTime_(presentationTime);

    // Init/re-init MediaSourceEngine. Note that a re-init is only valid for
    // text.
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
    const mediaSourceEngine = this.playerInterface_.mediaSourceEngine;
    const forceTransmuxTS = this.config_.forceTransmuxTS;

    await mediaSourceEngine.init(streamsByType, forceTransmuxTS);
    this.destroyer_.ensureNotDestroyed();

    this.setDuration_();

    for (const type of streamsByType.keys()) {
      const stream = streamsByType.get(type);
      if (!this.mediaStates_.has(type)) {
        const state = this.createMediaState_(
            stream, needPeriodIndex, resumeAt);
        this.mediaStates_.set(type, state);
        this.scheduleUpdate_(state, 0);
      }
    }
  }


  /**
   * Creates a media state.
   *
   * @param {shaka.extern.Stream} stream
   * @param {number} needPeriodIndex
   * @param {number} resumeAt
   * @return {shaka.media.StreamingEngine.MediaState_}
   * @private
   */
  createMediaState_(stream, needPeriodIndex, resumeAt) {
    return /** @type {shaka.media.StreamingEngine.MediaState_} */ ({
      stream: stream,
      type: stream.type,
      lastStream: null,
      lastSegmentReference: null,
      lastInitSegmentReference: null,
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
  }


  /**
   * Sets the MediaSource's duration.
   * @private
   */
  setDuration_() {
    const duration = this.manifest_.presentationTimeline.getDuration();
    if (duration < Infinity) {
      this.playerInterface_.mediaSourceEngine.setDuration(duration);
    } else {
      // Not all platforms support infinite durations, so set a finite duration
      // so we can append segments and so the user agent can seek.
      this.playerInterface_.mediaSourceEngine.setDuration(Math.pow(2, 32));
    }
  }


  /**
   * Called when |mediaState|'s update timer has expired.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @private
   */
  async onUpdate_(mediaState) {
    this.destroyer_.ensureNotDestroyed();

    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    // Sanity check.
    goog.asserts.assert(
        !mediaState.performingUpdate && (mediaState.updateTimer != null),
        logPrefix + ' unexpected call to onUpdate_()');
    if (mediaState.performingUpdate || (mediaState.updateTimer == null)) {
      return;
    }

    goog.asserts.assert(
        !mediaState.clearingBuffer, logPrefix +
        ' onUpdate_() should not be called when clearing the buffer');
    if (mediaState.clearingBuffer) {
      return;
    }

    mediaState.updateTimer = null;

    // Handle pending buffer clears.
    if (mediaState.waitingToClearBuffer) {
      // Note: clearBuffer_() will schedule the next update.
      shaka.log.debug(logPrefix, 'skipping update and clearing the buffer');
      await this.clearBuffer_(
          mediaState, mediaState.waitingToFlushBuffer,
          mediaState.clearBufferSafeMargin);
      return;
    }

    // Make sure the segment index exists.
    if (!mediaState.stream.segmentIndex) {
      const thisStream = mediaState.stream;

      await mediaState.stream.createSegmentIndex();

      if (thisStream != mediaState.stream) {
        // We switched streams while in the middle of this async call to
        // createSegmentIndex.  Abandon this update and schedule a new one if
        // there's not already one pending.
        if (mediaState.updateTimer == null) {
          this.scheduleUpdate_(mediaState, 0);
        }
        return;
      }

      goog.asserts.assert(mediaState.stream.segmentIndex,
          'Segment index should exist by now!');
    }

    // Update the MediaState.
    try {
      const delay = this.update_(mediaState);
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
        mediaStates.every((ms) => ms.endOfStream)) {
      shaka.log.v1(logPrefix, 'calling endOfStream()...');
      await this.playerInterface_.mediaSourceEngine.endOfStream();
      this.destroyer_.ensureNotDestroyed();

      // If the media segments don't reach the end, then we need to update the
      // timeline duration to match the final media duration to avoid
      // buffering forever at the end.
      // We should only do this if the duration needs to shrink.
      // Growing it by less than 1ms can actually cause buffering on
      // replay, as in https://github.com/google/shaka-player/issues/979
      // On some platforms, this can spuriously be 0, so ignore this case.
      // https://github.com/google/shaka-player/issues/1967,
      const duration = this.playerInterface_.mediaSourceEngine.getDuration();
      if (duration != 0 &&
          duration < this.manifest_.presentationTimeline.getDuration()) {
        this.manifest_.presentationTimeline.setDuration(duration);
      }
    }
  }


  /**
   * Updates the given MediaState.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @return {?number} The number of seconds to wait until updating again or
   *   null if another update does not need to be scheduled.
   * @private
   */
  update_(mediaState) {
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

    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    // Compute how far we've buffered ahead of the playhead.
    const presentationTime = this.playerInterface_.getPresentationTime();

    // Get the next timestamp we need.
    const timeNeeded = this.getTimeNeeded_(mediaState, presentationTime);
    shaka.log.v2(logPrefix, 'timeNeeded=' + timeNeeded);

    const currentPeriodIndex =
        this.findPeriodContainingStream_(mediaState.stream);
    const needPeriodIndex = this.findPeriodForTime_(timeNeeded);

    // Get the amount of content we have buffered, accounting for drift.  This
    // is only used to determine if we have meet the buffering goal.  This
    // should be the same method that PlayheadObserver uses.
    const bufferedAhead =
        this.playerInterface_.mediaSourceEngine.bufferedAheadOf(
            mediaState.type, presentationTime);

    shaka.log.v2(logPrefix,
        'update_:',
        'presentationTime=' + presentationTime,
        'bufferedAhead=' + bufferedAhead);

    const unscaledBufferingGoal = Math.max(
        this.manifest_.minBufferTime || 0,
        this.config_.rebufferingGoal,
        this.config_.bufferingGoal);

    const scaledBufferingGoal =
        unscaledBufferingGoal * this.bufferingGoalScale_;

    // Check if we've buffered to the end of the presentation.
    if (timeNeeded >= this.manifest_.presentationTimeline.getDuration()) {
      // We shouldn't rebuffer if the playhead is close to the end of the
      // presentation.
      shaka.log.debug(logPrefix, 'buffered to end of presentation');
      mediaState.endOfStream = true;

      if (mediaState.type == ContentType.VIDEO) {
        // Since the text stream of CEA closed captions doesn't have update
        // timer, we have to set the text endOfStream based on the video
        // stream's endOfStream state.
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

    const bufferEnd =
        this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);
    const reference = this.getSegmentReferenceNeeded_(
        mediaState, presentationTime, bufferEnd, currentPeriodIndex);
    if (!reference) {
      // The segment could not be found, does not exist, or is not available.
      // In any case just try again... if the manifest is incomplete or is not
      // being updated then we'll idle forever; otherwise, we'll end up getting
      // a SegmentReference eventually.
      return 1;
    }

    // Do not let any one stream get far ahead of any other.
    let minTimeNeeded = Infinity;
    const mediaStates = Array.from(this.mediaStates_.values());
    for (const otherState of mediaStates) {
      // Do not consider embedded captions in this calculation.  It could lead
      // to hangs in streaming.
      if (shaka.media.StreamingEngine.isEmbeddedText_(otherState)) {
        continue;
      }

      const timeNeeded = this.getTimeNeeded_(otherState, presentationTime);
      minTimeNeeded = Math.min(minTimeNeeded, timeNeeded);
    }

    const maxSegmentDuration =
        this.manifest_.presentationTimeline.getMaxSegmentDuration();
    const maxRunAhead = maxSegmentDuration *
        shaka.media.StreamingEngine.MAX_RUN_AHEAD_SEGMENTS_;
    if (timeNeeded >= minTimeNeeded + maxRunAhead) {
      // Wait and give other media types time to catch up to this one.
      // For example, let video buffering catch up to audio buffering before
      // fetching another audio segment.
      return 1;
    }

    mediaState.resumeAt = 0;
    const p = this.fetchAndAppend_(
        mediaState, presentationTime, currentPeriodIndex, reference);
    p.catch(() => {});  // TODO(#1993): Handle asynchronous errors.
    return null;
  }


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
  getTimeNeeded_(mediaState, presentationTime) {
    // Get the next timestamp we need. We must use |lastSegmentReference|
    // to determine this and not the actual buffer for two reasons:
    //   1. Actual segments end slightly before their advertised end times, so
    //      the next timestamp we need is actually larger than |bufferEnd|.
    //   2. There may be drift (the timestamps in the segments are ahead/behind
    //      of the timestamps in the manifest), but we need drift-free times
    //      when comparing times against presentation and Period boundaries.
    if (!mediaState.lastStream || !mediaState.lastSegmentReference) {
      return Math.max(presentationTime, mediaState.resumeAt);
    }

    const lastPeriodIndex =
        this.findPeriodContainingStream_(mediaState.lastStream);
    const lastPeriod = this.manifest_.periods[lastPeriodIndex];
    return lastPeriod.startTime + mediaState.lastSegmentReference.endTime;
  }


  /**
   * Gets the SegmentReference of the next segment needed.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime
   * @param {?number} bufferEnd
   * @param {number} currentPeriodIndex
   * @return {shaka.media.SegmentReference} The SegmentReference of the
   *   next segment needed. Returns null if a segment could not be found, does
   *   not exist, or is not available.
   * @private
   */
  getSegmentReferenceNeeded_(
      mediaState, presentationTime, bufferEnd, currentPeriodIndex) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    if (mediaState.lastSegmentReference &&
        mediaState.stream == mediaState.lastStream) {
      // Something is buffered from the same Stream.
      const position = mediaState.lastSegmentReference.position + 1;
      shaka.log.v2(logPrefix, 'next position known:', 'position=' + position);

      return this.getSegmentReferenceIfAvailable_(
          mediaState, currentPeriodIndex, position);
    }

    /** @type {?number} */
    let position;

    if (mediaState.lastSegmentReference) {
      // Something is buffered from another Stream.
      goog.asserts.assert(mediaState.lastStream,
          'lastStream should not be null');
      shaka.log.v1(logPrefix, 'next position unknown: another Stream buffered');
      const lastPeriodIndex =
          this.findPeriodContainingStream_(mediaState.lastStream);
      const lastPeriod = this.manifest_.periods[lastPeriodIndex];
      position = this.lookupSegmentPosition_(
          mediaState,
          lastPeriod.startTime + mediaState.lastSegmentReference.endTime,
          currentPeriodIndex);
    } else {
      // Either nothing is buffered, or we have cleared part of the buffer.  If
      // we still have some buffered, use that time to find the segment,
      // otherwise start at the playhead time.
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
      // non-positive drift then we'll just end up buffering beind the playhead
      // a little more than we needed.
      shaka.log.v2(logPrefix, 'Nothing buffered, going back one segment.');
      const optimalPosition = Math.max(0, position - 1);
      reference = this.getSegmentReferenceIfAvailable_(
          mediaState, currentPeriodIndex, optimalPosition);
      if (!reference) {
        shaka.log.v2(logPrefix,
            'Previous segment not found.  Using exact segment requested.');
      }
    }
    return reference ||
        this.getSegmentReferenceIfAvailable_(
            mediaState, currentPeriodIndex, position);
  }


  /**
   * Looks up the position of the segment containing the given timestamp.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime The timestamp needed, relative to the
   *   start of the presentation.
   * @param {number} currentPeriodIndex
   * @return {?number} A segment position, or null if a segment was not be
   *                   found.
   * @private
   */
  lookupSegmentPosition_(
      mediaState, presentationTime, currentPeriodIndex) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
    const currentPeriod = this.manifest_.periods[currentPeriodIndex];

    shaka.log.debug(logPrefix,
        'looking up segment:',
        'presentationTime=' + presentationTime,
        'currentPeriod.startTime=' + currentPeriod.startTime);

    const lookupTime = Math.max(0, presentationTime - currentPeriod.startTime);
    const position = mediaState.stream.segmentIndex.find(lookupTime);

    if (position == null) {
      shaka.log.warning(logPrefix,
          'cannot find segment:',
          'currentPeriod.startTime=' + currentPeriod.startTime,
          'lookupTime=' + lookupTime);
    }

    return position;
  }


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
  getSegmentReferenceIfAvailable_(mediaState, currentPeriodIndex, position) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
    const currentPeriod = this.manifest_.periods[currentPeriodIndex];

    const reference = mediaState.stream.segmentIndex.get(position);
    if (!reference) {
      shaka.log.v1(logPrefix,
          'segment does not exist:',
          'currentPeriod.startTime=' + currentPeriod.startTime,
          'position=' + position);
      return null;
    }

    const timeline = this.manifest_.presentationTimeline;
    const availabilityStart = timeline.getSegmentAvailabilityStart();
    const availabilityEnd = timeline.getSegmentAvailabilityEnd();

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
  }


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
  async fetchAndAppend_(
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
    const stream = mediaState.stream;

    // Compute the append window.
    const duration = this.manifest_.presentationTimeline.getDuration();
    const followingPeriod = this.manifest_.periods[currentPeriodIndex + 1];

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

    const initSourceBuffer = this.initSourceBuffer_(
        mediaState, currentPeriodIndex, appendWindowStart, appendWindowEnd,
        reference);

    mediaState.performingUpdate = true;

    // We may set |needInitSegment| to true in switch(), so set it to false
    // here, since we want it to remain true if switch() is called.
    mediaState.needInitSegment = false;

    shaka.log.v2(logPrefix, 'fetching segment');
    const fetchSegment = this.fetch_(mediaState, reference);

    try {
      const results = await Promise.all([initSourceBuffer, fetchSegment]);
      this.destroyer_.ensureNotDestroyed();
      if (this.fatalError_) {
        return;
      }
      await this.append_(mediaState,
          presentationTime, currentPeriod, stream, reference, results[1]);
      this.destroyer_.ensureNotDestroyed();
      if (this.fatalError_) {
        return;
      }

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
    } catch (error) {
      this.destroyer_.ensureNotDestroyed(error);
      if (this.fatalError_) {
        return;
      }
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
        // If the network slows down, abort the current fetch request and start
        // a new one, and ignore the error message.
        mediaState.performingUpdate = false;
        mediaState.updateTimer = null;
        this.scheduleUpdate_(mediaState, 0);
      } else if (error.code == shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR) {
        this.handleQuotaExceeded_(mediaState, error);
      } else {
        shaka.log.error(logPrefix, 'failed fetch and append: code=' +
            error.code);
        mediaState.hasError = true;

        error.severity = shaka.util.Error.Severity.CRITICAL;
        this.handleStreamingError_(error);
      }
    }
  }


  /**
   * Clear per-stream error states and retry any failed streams.
   * @return {boolean} False if unable to retry.
   */
  retry() {
    if (this.destroyer_.destroyed()) {
      shaka.log.error('Unable to retry after StreamingEngine is destroyed!');
      return false;
    }

    if (this.fatalError_) {
      shaka.log.error('Unable to retry after StreamingEngine encountered a ' +
                      'fatal error!');
      return false;
    }

    for (const mediaState of this.mediaStates_.values()) {
      const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
      if (mediaState.hasError) {
        shaka.log.info(logPrefix, 'Retrying after failure...');
        mediaState.hasError = false;
        this.scheduleUpdate_(mediaState, 0.1);
      }
    }

    return true;
  }


  /**
   * Handles a QUOTA_EXCEEDED_ERROR.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {!shaka.util.Error} error
   * @private
   */
  handleQuotaExceeded_(mediaState, error) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

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
    const waitingForAnotherStreamToRecover = mediaStates.some((ms) => {
      return ms != mediaState && ms.recovering;
    });

    if (!waitingForAnotherStreamToRecover) {
      // Reduction schedule: 80%, 60%, 40%, 20%, 16%, 12%, 8%, 4%, fail.
      // Note: percentages are used for comparisons to avoid rounding errors.
      const percentBefore = Math.round(100 * this.bufferingGoalScale_);
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
      const percentAfter = Math.round(100 * this.bufferingGoalScale_);
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
  }


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
   * @param {!shaka.media.SegmentReference} reference
   * @return {!Promise}
   * @private
   */
  async initSourceBuffer_(
      mediaState, currentPeriodIndex, appendWindowStart, appendWindowEnd,
      reference) {
    // TODO: Remove needInitSegment.  Currently, this both signals the need for
    // a different init segment (switches, period transitions) and protects
    // against unnecessary calls to setStreamProperties.  If we can solve calls
    // to setStreamProperties another way, then we could finally drop
    // needInitSegment.
    if (!mediaState.needInitSegment) {
      return;
    }

    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
    const currentPeriod = this.manifest_.periods[currentPeriodIndex];

    // If we need an init segment then the Stream switched, so we've either
    // changed bitrates, Periods, or both. If we've changed Periods then we must
    // set a new timestamp offset and append window end. Note that by setting
    // these values here, we avoid having to co-ordinate ongoing updates, which
    // we would have to do if we instead set them in switch().
    const timestampOffset =
        currentPeriod.startTime - reference.presentationTimeOffset;
    shaka.log.v1(logPrefix, 'setting timestamp offset to ' + timestampOffset);
    shaka.log.v1(logPrefix,
        'setting append window start to ' + appendWindowStart);
    shaka.log.v1(logPrefix, 'setting append window end to ' + appendWindowEnd);
    const setStreamProperties =
        this.playerInterface_.mediaSourceEngine.setStreamProperties(
            mediaState.type, timestampOffset, appendWindowStart,
            appendWindowEnd);

    if (reference.initSegmentReference == mediaState.lastInitSegmentReference) {
      // The SourceBuffer already has the correct init segment appended.
      await setStreamProperties;
      return;
    }

    mediaState.lastInitSegmentReference = reference.initSegmentReference;

    if (!reference.initSegmentReference) {
      // The Stream is self initializing.
      await setStreamProperties;
      return;
    }

    shaka.log.v1(logPrefix, 'fetching init segment');

    goog.asserts.assert(
        reference.initSegmentReference, 'Should have init segment');
    const fetchInit =
        this.fetch_(mediaState, reference.initSegmentReference);
    const append = async () => {
      try {
        const initSegment = await fetchInit;
        this.destroyer_.ensureNotDestroyed();
        shaka.log.v1(logPrefix, 'appending init segment');
        const hasClosedCaptions = mediaState.stream.closedCaptions &&
            mediaState.stream.closedCaptions.size > 0;
        await this.playerInterface_.mediaSourceEngine.appendBuffer(
            mediaState.type, initSegment, null /* startTime */,
            null /* endTime */, hasClosedCaptions);
      } catch (error) {
        mediaState.needInitSegment = true;
        mediaState.lastInitSegmentReference = null;
        throw error;
      }
    };

    await Promise.all([setStreamProperties, append()]);
  }


  /**
   * Appends the given segment and evicts content if required to append.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime
   * @param {shaka.extern.Period} period
   * @param {shaka.extern.Stream} stream
   * @param {!shaka.media.SegmentReference} reference
   * @param {BufferSource} segment
   * @return {!Promise}
   * @private
   */
  async append_(mediaState, presentationTime, period, stream, reference,
      segment) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    const hasClosedCaptions = stream.closedCaptions &&
        stream.closedCaptions.size > 0;
    if (stream.emsgSchemeIdUris != null && stream.emsgSchemeIdUris.length > 0) {
      new shaka.util.Mp4Parser()
          .fullBox(
              'emsg',
              (box) => this.parseEMSG_(
                  period, reference, stream.emsgSchemeIdUris, box))
          .parse(segment);
    }

    await this.evict_(mediaState, presentationTime);
    this.destroyer_.ensureNotDestroyed();
    shaka.log.v1(logPrefix, 'appending media segment');

    // MediaSourceEngine expects times relative to the start of the
    // presentation.  Reference times are relative to the start of the period.
    const startTime = reference.startTime + period.startTime;
    const endTime = reference.endTime + period.startTime;

    await this.playerInterface_.mediaSourceEngine.appendBuffer(
        mediaState.type, segment, startTime, endTime, hasClosedCaptions);
    this.destroyer_.ensureNotDestroyed();
    shaka.log.v2(logPrefix, 'appended media segment');

    // We must use |stream| because switch() may have been called.
    mediaState.lastStream = stream;
    mediaState.lastSegmentReference = reference;
  }


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
  parseEMSG_(period, reference, emsgSchemeIdUris, box) {
    const schemeId = box.reader.readTerminatedString();
    // Read the rest of the data.
    const value = box.reader.readTerminatedString();
    const timescale = box.reader.readUint32();
    const presentationTimeDelta = box.reader.readUint32();
    const eventDuration = box.reader.readUint32();
    const id = box.reader.readUint32();
    const messageData = box.reader.readBytes(
        box.reader.getLength() - box.reader.getPosition());

    const startTime = period.startTime + reference.startTime +
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
        const emsg = {
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
        const event = new shaka.util.FakeEvent('emsg', {'detail': emsg});
        this.playerInterface_.onEvent(event);
      }
    }
  }


  /**
   * Evicts media to meet the max buffer behind limit.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime
   * @private
   */
  async evict_(mediaState, presentationTime) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
    shaka.log.v2(logPrefix, 'checking buffer length');

    // Use the max segment duration, if it is longer than the bufferBehind, to
    // avoid accidentally clearing too much data when dealing with a manifest
    // with a long keyframe interval.
    const bufferBehind = Math.max(this.config_.bufferBehind,
        this.manifest_.presentationTimeline.getMaxSegmentDuration());

    const startTime =
        this.playerInterface_.mediaSourceEngine.bufferStart(mediaState.type);
    if (startTime == null) {
      shaka.log.v2(logPrefix,
          'buffer behind okay because nothing buffered:',
          'presentationTime=' + presentationTime,
          'bufferBehind=' + bufferBehind);
      return;
    }
    const bufferedBehind = presentationTime - startTime;

    const overflow = bufferedBehind - bufferBehind;
    if (overflow <= 0) {
      shaka.log.v2(logPrefix,
          'buffer behind okay:',
          'presentationTime=' + presentationTime,
          'bufferedBehind=' + bufferedBehind,
          'bufferBehind=' + bufferBehind,
          'underflow=' + (-overflow));
      return;
    }

    shaka.log.v1(logPrefix,
        'buffer behind too large:',
        'presentationTime=' + presentationTime,
        'bufferedBehind=' + bufferedBehind,
        'bufferBehind=' + bufferBehind,
        'overflow=' + overflow);

    await this.playerInterface_.mediaSourceEngine.remove(mediaState.type,
        startTime, startTime + overflow);

    this.destroyer_.ensureNotDestroyed();
    shaka.log.v1(logPrefix, 'evicted ' + overflow + ' seconds');
  }


  /**
   * Sets up all known Periods when startup completes; otherwise, does nothing.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState The last
   *   MediaState updated.
   * @param {shaka.extern.Stream} stream
   * @private
   */
  handleStartup_(mediaState, stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (this.startupComplete_) {
      return;
    }

    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    // If the only media state is text, then we may have loaded text before
    // any media content.  Marking as complete early will break MediaSource.
    // See #1696.
    const mediaStates = Array.from(this.mediaStates_.values());
    if (mediaStates.length != 1 || mediaStates[0].type != ContentType.TEXT) {
      this.startupComplete_ = mediaStates.every((ms) => {
        // Startup completes once we have buffered at least one segment from
        // each MediaState, not counting text.
        if (ms.type == ContentType.TEXT) {
          return true;
        }
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
    const currentPeriodIndex = this.findPeriodContainingStream_(stream);

    goog.asserts.assert(
        mediaStates.every((ms) => {
          // It is possible for one stream (usually text) to buffer the whole
          // Period and need the next one.
          return ms.needPeriodIndex == currentPeriodIndex ||
              ms.needPeriodIndex == currentPeriodIndex + 1;
        }),
        logPrefix + ' expected all MediaStates to need same Period');

    // Since period setup is no longer required, call onCanSwitch() once
    // startup is complete.
    this.playerInterface_.onCanSwitch();

    if (this.playerInterface_.onStartupComplete) {
      shaka.log.v1(logPrefix, 'calling onStartupComplete()...');
      this.playerInterface_.onStartupComplete();
    }
  }


  /**
   * Calls onChooseStreams() when necessary.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState The last
   *   MediaState updated.
   * @private
   */
  handlePeriodTransition_(mediaState) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const currentPeriodIndex =
        this.findPeriodContainingStream_(mediaState.stream);
    if (mediaState.needPeriodIndex == currentPeriodIndex) {
      return;
    }

    const needPeriodIndex = mediaState.needPeriodIndex;

    /** @type {Array.<shaka.media.StreamingEngine.MediaState_>} */
    const mediaStates = Array.from(this.mediaStates_.values());

    // For a Period transition to work, all media states must need the same
    // Period.  If a stream needs a different Period than the one it currently
    // has, it will try to transition or stop updates assuming that another
    // streamwill handle it.
    // This only works when all streams either need the same Period or are still
    // performing updates.
    goog.asserts.assert(
        mediaStates.every((ms) => {
          return ms.needPeriodIndex == needPeriodIndex || ms.hasError ||
              !shaka.media.StreamingEngine.isIdle_(ms) ||
              shaka.media.StreamingEngine.isEmbeddedText_(ms);
        }), 'All MediaStates should need the same Period or be performing' +
        'updates.');

    // Only call onChooseStreams() when all MediaStates need the same Period.
    const needSamePeriod = mediaStates.every((ms) => {
      // Ignore embedded text streams since they are based on the video stream.
      return ms.needPeriodIndex == needPeriodIndex ||
          shaka.media.StreamingEngine.isEmbeddedText_(ms);
    });
    if (!needSamePeriod) {
      shaka.log.debug(
          logPrefix, 'not all MediaStates need Period ' + needPeriodIndex);
      return;
    }

    // Only call onChooseStreams() once per Period transition.
    const allAreIdle = mediaStates.every(shaka.media.StreamingEngine.isIdle_);
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
    try {
      // If we seek during a Period transition, we can start another transition.
      // So we need to verify that:
      //  1. We are still in need of the same Period.
      //  2. All streams are still idle.
      //  3. The current stream is not in the needed Period (another transition
      //     handled it).
      const allReady = mediaStates.every((ms) => {
        const isIdle = shaka.media.StreamingEngine.isIdle_(ms);
        const currentPeriodIndex = this.findPeriodContainingStream_(ms.stream);
        if (shaka.media.StreamingEngine.isEmbeddedText_(ms)) {
          // Embedded text tracks don't do Period transitions.
          return true;
        }
        return isIdle && ms.needPeriodIndex == needPeriodIndex &&
            currentPeriodIndex != needPeriodIndex;
      });
      if (!allReady) {
        // TODO: Write unit tests for this case.
        shaka.log.debug(logPrefix, 'ignoring transition to Period',
            needPeriodIndex, 'since another is happening');
        return;
      }

      const needPeriod = this.manifest_.periods[needPeriodIndex];

      shaka.log.v1(logPrefix, 'calling onChooseStreams()...');
      const chosenStreams = this.playerInterface_.onChooseStreams(needPeriod);

      /** @type {!Map.<!shaka.util.ManifestParserUtils.ContentType,
        *              shaka.extern.Stream>} */
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
        if (streamsByType.has(type) || type == ContentType.TEXT) {
          continue;
        }

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
        if (this.mediaStates_.has(type)) {
          continue;
        }

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
      const copyOfStateTypes = Array.from(this.mediaStates_.keys());
      for (const type of copyOfStateTypes) {
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

          this.switchInternal_(
              stream,
              /* clearBuffer= */ false,
              /* safeMargin= */ 0,
              /* force= */ false);

          // Don't schedule an update when changing from embedded text to
          // another embedded text since the update will try to load existing
          // captions, which are already loaded.
          //
          // But we do want to schedule an update if we switch to a non-embedded
          // text track of if we didn't have an embedded text track before.
          if (!wasEmbeddedText ||
              !shaka.media.StreamingEngine.isEmbeddedText_(state)) {
            const mediaState = this.mediaStates_.get(type);
            this.scheduleUpdate_(mediaState, 0);
          }
        } else {
          goog.asserts.assert(type == ContentType.TEXT,
              'Invalid streams chosen');
          this.mediaStates_.delete(type);
        }
      }

      // All streams for the new period are active, so call onCanSwitch().
      shaka.log.v1(logPrefix, 'calling onCanSwitch()...');
      this.playerInterface_.onCanSwitch();
    } catch (e) {}
  }

  /**
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @return {boolean}
   * @private
   */
  static isEmbeddedText_(mediaState) {
    const MimeUtils = shaka.util.MimeUtils;
    return mediaState &&
        mediaState.type == shaka.util.ManifestParserUtils.ContentType.TEXT &&
        mediaState.stream.mimeType == MimeUtils.CLOSED_CAPTION_MIMETYPE;
  }


  /**
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @return {boolean} True if the given MediaState is idle; otherwise, return
   *   false.
   * @private
   */
  static isIdle_(mediaState) {
    return !mediaState.performingUpdate &&
           (mediaState.updateTimer == null) &&
           !mediaState.waitingToClearBuffer &&
           !mediaState.clearingBuffer;
  }


  /**
   * Get the index in the manifest of the period that contains the given
   * presentation time. If |time| is before all periods, this will default to
   * returning the first period.
   *
   * @param {number} time The presentation time in seconds.
   * @return {number}
   * @private
   */
  findPeriodForTime_(time) {
    const ManifestParserUtils = shaka.util.ManifestParserUtils;
    const threshold = ManifestParserUtils.GAP_OVERLAP_TOLERANCE_SECONDS;

    // The last segment may end right before the end of the Period because of
    // rounding issues so we bias forward a little.
    const adjustedTime = time + threshold;

    const period = shaka.util.Periods.findPeriodForTime(
        /* periods= */ this.manifest_.periods,
        /* time= */ adjustedTime);

    return period ? this.manifest_.periods.indexOf(period) : 0;
  }


  /**
   * See if |stream| can be found in our manifest and return the period index.
   * If |stream| cannot be found, -1 will be returned.
   *
   * @param {!shaka.extern.Stream} stream
   * @return {number}
   * @private
   */
  findPeriodContainingStream_(stream) {
    return this.manifest_.periods.findIndex((period) => {
      for (const variant of period.variants) {
        if (variant.audio == stream || variant.video == stream) {
          return true;
        }
        if (variant.video && variant.video.trickModeVideo == stream) {
          return true;
        }
      }

      return period.textStreams.includes(stream);
    });
  }


  /**
   * Fetches the given segment.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {(!shaka.media.InitSegmentReference|!shaka.media.SegmentReference)}
   *   reference
   *
   * @return {!Promise.<BufferSource>}
   * @private
   */
  async fetch_(mediaState, reference) {
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;

    const request = shaka.util.Networking.createSegmentRequest(
        reference.getUris(),
        reference.startByte,
        reference.endByte,
        this.config_.retryParameters);

    shaka.log.v2('fetching: reference=', reference);

    const op = this.playerInterface_.netEngine.request(requestType, request);
    mediaState.operation = op;
    const response = await op.promise;
    mediaState.operation = null;
    return response.data;
  }


  /**
   * Clears the buffer and schedules another update.
   * The optional parameter safeMargin allows to retain a certain amount
   * of buffer, which can help avoiding rebuffering events.
   * The value of the safe margin should be provided by the ABR manager.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {boolean} flush
   * @param {number} safeMargin
   * @private
   */
  async clearBuffer_(mediaState, flush, safeMargin) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    goog.asserts.assert(
        !mediaState.performingUpdate && (mediaState.updateTimer == null),
        logPrefix + ' unexpected call to clearBuffer_()');

    mediaState.waitingToClearBuffer = false;
    mediaState.waitingToFlushBuffer = false;
    mediaState.clearBufferSafeMargin = 0;
    mediaState.clearingBuffer = true;

    shaka.log.debug(logPrefix, 'clearing buffer');

    if (safeMargin) {
      const presentationTime = this.playerInterface_.getPresentationTime();
      const duration = this.playerInterface_.mediaSourceEngine.getDuration();
      await this.playerInterface_.mediaSourceEngine.remove(
          mediaState.type, presentationTime + safeMargin, duration);
    } else {
      await this.playerInterface_.mediaSourceEngine.clear(mediaState.type);
      this.destroyer_.ensureNotDestroyed();

      if (flush) {
        await this.playerInterface_.mediaSourceEngine.flush(
            mediaState.type);
      }
    }
    this.destroyer_.ensureNotDestroyed();

    shaka.log.debug(logPrefix, 'cleared buffer');
    mediaState.lastStream = null;
    mediaState.lastSegmentReference = null;
    mediaState.clearingBuffer = false;
    mediaState.endOfStream = false;
    this.scheduleUpdate_(mediaState, 0);
  }


  /**
   * Schedules |mediaState|'s next update.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} delay The delay in seconds.
   * @private
   */
  scheduleUpdate_(mediaState, delay) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
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
  }


  /**
   * If |mediaState| is scheduled to update, stop it.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @private
   */
  cancelUpdate_(mediaState) {
    if (mediaState.updateTimer == null) {
      return;
    }

    mediaState.updateTimer.stop();
    mediaState.updateTimer = null;
  }


  /**
   * Handle streaming errors by delaying, then notifying the application by
   * error callback and by streaming failure callback.
   *
   * @param {!shaka.util.Error} error
   * @private
   */
  async handleStreamingError_(error) {
    // If we invoke the callback right away, the application could trigger a
    // rapid retry cycle that could be very unkind to the server.  Instead,
    // use the backoff system to delay and backoff the error handling.
    await this.failureCallbackBackoff_.attempt();
    this.destroyer_.ensureNotDestroyed();

    // First fire an error event.
    this.playerInterface_.onError(error);

    // If the error was not handled by the application, call the failure
    // callback.
    if (!error.handled) {
      this.config_.failureCallback(error);
    }
  }

  /**
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @return {string} A log prefix of the form ($CONTENT_TYPE:$STREAM_ID), e.g.,
   *   "(audio:5)" or "(video:hd)".
   * @private
   */
  static logPrefix_(mediaState) {
    return '(' + mediaState.type + ':' + mediaState.stream.id + ')';
  }
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
 *   Called by StreamingEngine when switching is permitted.
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
 *   lastInitSegmentReference: shaka.media.InitSegmentReference,
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
 * @property {shaka.media.InitSegmentReference} lastInitSegmentReference
 *   The InitSegmentReference of the last init segment that was appended.
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
