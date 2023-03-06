/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * @suppress {missingRequire} TODO(b/152540451): this shouldn't be needed
 */

goog.provide('shaka.media.StreamingEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.SegmentIterator');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.SegmentPrefetch');
goog.require('shaka.net.Backoff');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.DelayedTick');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Networking');


/**
 * @summary Creates a Streaming Engine.
 * The StreamingEngine is responsible for setting up the Manifest's Streams
 * (i.e., for calling each Stream's createSegmentIndex() function), for
 * downloading segments, for co-ordinating audio, video, and text buffering.
 * The StreamingEngine provides an interface to switch between Streams, but it
 * does not choose which Streams to switch to.
 *
 * The StreamingEngine does not need to be notified about changes to the
 * Manifest's SegmentIndexes; however, it does need to be notified when new
 * Variants are added to the Manifest.
 *
 * To start the StreamingEngine the owner must first call configure(), followed
 * by one call to switchVariant(), one optional call to switchTextStream(), and
 * finally a call to start().  After start() resolves, switch*() can be used
 * freely.
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

    /** @private {?shaka.extern.Variant} */
    this.currentVariant_ = null;

    /** @private {?shaka.extern.Stream} */
    this.currentTextStream_ = null;

    /** @private {boolean} */
    this.parsedPrftEventRaised_ = false;

    /**
     * Maps a content type, e.g., 'audio', 'video', or 'text', to a MediaState.
     *
     * @private {!Map.<shaka.util.ManifestParserUtils.ContentType,
     *                 !shaka.media.StreamingEngine.MediaState_>}
     */
    this.mediaStates_ = new Map();

    /**
     * Set to true once the initial media states have been created.
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
  async doDestroy_() {
    const aborts = [];

    for (const state of this.mediaStates_.values()) {
      this.cancelUpdate_(state);
      aborts.push(this.abortOperations_(state));
    }

    await Promise.all(aborts);

    this.mediaStates_.clear();

    this.playerInterface_ = null;
    this.manifest_ = null;
    this.config_ = null;
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes. Must be called at least once before start().
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
      stallTimeout: 0, // irrelevant
      connectionTimeout: 0, // irrelevant
    };

    // We don't want to ever run out of attempts.  The application should be
    // allowed to retry streaming infinitely if it wishes.
    const autoReset = true;
    this.failureCallbackBackoff_ =
        new shaka.net.Backoff(failureRetryParams, autoReset);

    // Allow configuring the segment prefetch in middle of the playback.
    for (const type of this.mediaStates_.keys()) {
      const state = this.mediaStates_.get(type);
      if (state.segmentPrefetch) {
        state.segmentPrefetch.resetLimit(config.segmentPrefetchLimit);
        if (!(config.segmentPrefetchLimit > 0)) {
          // ResetLimit is still needed in this case,
          // to abort existing prefetch operations.
          state.segmentPrefetch = null;
        }
      } else if (config.segmentPrefetchLimit > 0) {
        state.segmentPrefetch = this.createSegmentPrefetch_(state.stream);
      }
    }
  }


  /**
   * Initialize and start streaming.
   *
   * By calling this method, StreamingEngine will start streaming the variant
   * chosen by a prior call to switchVariant(), and optionally, the text stream
   * chosen by a prior call to switchTextStream().  Once the Promise resolves,
   * switch*() may be called freely.
   *
   * @return {!Promise}
   */
  async start() {
    goog.asserts.assert(this.config_,
        'StreamingEngine configure() must be called before init()!');

    // Setup the initial set of Streams and then begin each update cycle.
    await this.initStreams_();
    this.destroyer_.ensureNotDestroyed();

    shaka.log.debug('init: completed initial Stream setup');
    this.startupComplete_ = true;
  }

  /**
   * Get the current variant we are streaming.  Returns null if nothing is
   * streaming.
   * @return {?shaka.extern.Variant}
   */
  getCurrentVariant() {
    return this.currentVariant_;
  }

  /**
   * Get the text stream we are streaming.  Returns null if there is no text
   * streaming.
   * @return {?shaka.extern.Stream}
   */
  getCurrentTextStream() {
    return this.currentTextStream_;
  }

  /**
   * Start streaming text, creating a new media state.
   *
   * @param {shaka.extern.Stream} stream
   * @return {!Promise}
   * @private
   */
  async loadNewTextStream_(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    goog.asserts.assert(!this.mediaStates_.has(ContentType.TEXT),
        'Should not call loadNewTextStream_ while streaming text!');

    try {
      // Clear MediaSource's buffered text, so that the new text stream will
      // properly replace the old buffered text.
      // TODO: Should this happen in unloadTextStream() instead?
      await this.playerInterface_.mediaSourceEngine.clear(ContentType.TEXT);
    } catch (error) {
      if (this.playerInterface_) {
        this.playerInterface_.onError(error);
      }
    }

    const mimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    this.playerInterface_.mediaSourceEngine.reinitText(
        mimeType, this.manifest_.sequenceMode);

    const textDisplayer =
        this.playerInterface_.mediaSourceEngine.getTextDisplayer();
    const streamText =
        textDisplayer.isTextVisible() || this.config_.alwaysStreamText;

    if (streamText) {
      const state = this.createMediaState_(stream);
      this.mediaStates_.set(ContentType.TEXT, state);
      this.scheduleUpdate_(state, 0);
    }
  }


  /**
   * Stop fetching text stream when the user chooses to hide the captions.
   */
  unloadTextStream() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const state = this.mediaStates_.get(ContentType.TEXT);
    if (state) {
      this.cancelUpdate_(state);
      this.abortOperations_(state).catch(() => {});
      this.mediaStates_.delete(ContentType.TEXT);
    }
    this.currentTextStream_ = null;
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
   * @param {boolean=} clearBuffer
   * @param {number=} safeMargin
   * @param {boolean=} force
   *   If true, reload the variant even if it did not change.
   * @param {boolean=} adaptation
   *   If true, update the media state to indicate MediaSourceEngine should
   *   reset the timestamp offset to ensure the new track segments are correctly
   *   placed on the timeline.
   */
  switchVariant(
      variant, clearBuffer = false, safeMargin = 0, force = false,
      adaptation = false) {
    this.currentVariant_ = variant;

    if (!this.startupComplete_) {
      // The selected variant will be used in start().
      return;
    }

    if (variant.video) {
      this.switchInternal_(
          variant.video, /* clearBuffer= */ clearBuffer,
          /* safeMargin= */ safeMargin, /* force= */ force,
          /* adaptation= */ adaptation);
    }
    if (variant.audio) {
      this.switchInternal_(
          variant.audio, /* clearBuffer= */ clearBuffer,
          /* safeMargin= */ safeMargin, /* force= */ force,
          /* adaptation= */ adaptation);
    }
  }


  /**
   * @param {shaka.extern.Stream} textStream
   */
  switchTextStream(textStream) {
    this.currentTextStream_ = textStream;

    if (!this.startupComplete_) {
      // The selected text stream will be used in start().
      return;
    }

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
   * Switches to the given Stream. |stream| may be from any Variant.
   *
   * @param {shaka.extern.Stream} stream
   * @param {boolean} clearBuffer
   * @param {number} safeMargin
   * @param {boolean} force
   *   If true, reload the text stream even if it did not change.
   * @param {boolean=} adaptation
   *   If true, update the media state to indicate MediaSourceEngine should
   *   reset the timestamp offset to ensure the new track segments are correctly
   *   placed on the timeline.
   * @private
   */
  switchInternal_(stream, clearBuffer, safeMargin, force, adaptation) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const type = /** @type {!ContentType} */(stream.type);
    const mediaState = this.mediaStates_.get(type);

    if (!mediaState && stream.type == ContentType.TEXT) {
      this.loadNewTextStream_(stream);
      return;
    }

    goog.asserts.assert(mediaState, 'switch: expected mediaState to exist');
    if (!mediaState) {
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

    if (mediaState.segmentPrefetch) {
      mediaState.segmentPrefetch.switchStream(stream);
    }

    if (stream.type == ContentType.TEXT) {
      // Mime types are allowed to change for text streams.
      // Reinitialize the text parser, but only if we are going to fetch the
      // init segment again.
      const fullMimeType = shaka.util.MimeUtils.getFullType(
          stream.mimeType, stream.codecs);
      this.playerInterface_.mediaSourceEngine.reinitText(
          fullMimeType, this.manifest_.sequenceMode);
    }

    // Releases the segmentIndex of the old stream.
    if (mediaState.stream.closeSegmentIndex) {
      mediaState.stream.closeSegmentIndex();
    }

    mediaState.stream = stream;
    mediaState.segmentIterator = null;
    mediaState.adaptation = !!adaptation;

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
        this.clearBuffer_(mediaState, /* flush= */ true, safeMargin)
            .catch((error) => {
              if (this.playerInterface_) {
                goog.asserts.assert(error instanceof shaka.util.Error,
                    'Wrong error type!');
                this.playerInterface_.onError(error);
              }
            });
      }
    }

    this.makeAbortDecision_(mediaState).catch((error) => {
      if (this.playerInterface_) {
        goog.asserts.assert(error instanceof shaka.util.Error,
            'Wrong error type!');
        this.playerInterface_.onError(error);
      }
    });
  }


  /**
   * Decide if it makes sense to abort the current operation, and abort it if
   * so.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @private
   */
  async makeAbortDecision_(mediaState) {
    // If the operation is completed, it will be set to null, and there's no
    // need to abort the request.
    if (!mediaState.operation) {
      return;
    }

    const originalStream = mediaState.stream;
    const originalOperation = mediaState.operation;

    if (!originalStream.segmentIndex) {
      // Create the new segment index so the time taken is accounted for when
      // deciding whether to abort.
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

    goog.asserts.assert(mediaState.stream.segmentIndex,
        'Segment index should exist by now!');

    if (this.shouldAbortCurrentRequest_(mediaState)) {
      shaka.log.info('Aborting current segment request.');
      mediaState.operation.abort();
    }
  }

  /**
   * Returns whether we should abort the current request.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @return {boolean}
   * @private
   */
  shouldAbortCurrentRequest_(mediaState) {
    goog.asserts.assert(mediaState.operation,
        'Abort logic requires an ongoing operation!');
    goog.asserts.assert(mediaState.stream && mediaState.stream.segmentIndex,
        'Abort logic requires a segment index');

    const presentationTime = this.playerInterface_.getPresentationTime();
    const bufferEnd =
        this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);

    // The next segment to append from the current stream.  This doesn't
    // account for a pending network request and will likely be different from
    // that since we just switched.
    const timeNeeded = this.getTimeNeeded_(mediaState, presentationTime);
    const index = mediaState.stream.segmentIndex.find(timeNeeded);
    const newSegment =
        index == null ? null : mediaState.stream.segmentIndex.get(index);

    let newSegmentSize = newSegment ? newSegment.getSize() : null;
    if (newSegment && !newSegmentSize) {
      // compute approximate segment size using stream bandwidth
      const duration = newSegment.getEndTime() - newSegment.getStartTime();
      const bandwidth = mediaState.stream.bandwidth || 0;
      // bandwidth is in bits per second, and the size is in bytes
      newSegmentSize = duration * bandwidth / 8;
    }

    if (!newSegmentSize) {
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
    const bufferedAhead = (bufferEnd || 0) - presentationTime;
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
    if (!this.playerInterface_) {
      // Already destroyed.
      return;
    }

    const presentationTime = this.playerInterface_.getPresentationTime();
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const newTimeIsBuffered = (type) => {
      return this.playerInterface_.mediaSourceEngine.isBuffered(
          type, presentationTime);
    };

    let streamCleared = false;
    for (const type of this.mediaStates_.keys()) {
      const mediaState = this.mediaStates_.get(type);
      const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

      // Always clear the iterator since we need to start streaming from the
      // new time.  This also happens in clearBuffer_, but if we don't clear,
      // we still want to reset the iterator.
      mediaState.segmentIterator = null;

      if (!newTimeIsBuffered(type)) {
        const bufferEnd =
            this.playerInterface_.mediaSourceEngine.bufferEnd(type);
        const somethingBuffered = bufferEnd != null;

        // Don't clear the buffer unless something is buffered.  This extra
        // check prevents extra, useless calls to clear the buffer.
        if (somethingBuffered || mediaState.performingUpdate) {
          this.forceClearBuffer_(mediaState);
          streamCleared = true;
        }

        // If there is an operation in progress, stop it now.
        if (mediaState.operation) {
          mediaState.operation.abort();
          shaka.log.debug(logPrefix, 'Aborting operation due to seek');
          mediaState.operation = null;
        }

        // The pts has shifted from the seek, invalidating captions currently
        // in the text buffer. Thus, clear and reset the caption parser.
        if (type === ContentType.TEXT) {
          this.playerInterface_.mediaSourceEngine.resetCaptionParser();
        }

        // Mark the media state as having seeked, so that the new buffers know
        // that they will need to be at a new position (for sequence mode).
        mediaState.seeked = true;
      }
    }

    if (!streamCleared) {
      shaka.log.debug(
          '(all): seeked: buffered seek: presentationTime=' + presentationTime);
    }
  }


  /**
   * Clear the buffer for a given stream.  Unlike clearBuffer_, this will handle
   * cases where a MediaState is performing an update.  After this runs, the
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
      // See: https://github.com/shaka-project/shaka-player/issues/334
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
        // presentation, or when we raise an error.
        this.scheduleUpdate_(mediaState, 0);
      }
      return;
    }

    // An update may be scheduled, but we can just cancel it and clear the
    // buffer right away. Note: clearBuffer_() will schedule the next update.
    shaka.log.debug(logPrefix, 'clear: handling right now');
    this.cancelUpdate_(mediaState);
    this.clearBuffer_(mediaState, /* flush= */ false, 0).catch((error) => {
      if (this.playerInterface_) {
        goog.asserts.assert(error instanceof shaka.util.Error,
            'Wrong error type!');
        this.playerInterface_.onError(error);
      }
    });
  }


  /**
   * Initializes the initial streams and media states.  This will schedule
   * updates for the given types.
   *
   * @return {!Promise}
   * @private
   */
  async initStreams_() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    goog.asserts.assert(this.config_,
        'StreamingEngine configure() must be called before init()!');

    if (!this.currentVariant_) {
      shaka.log.error('init: no Streams chosen');
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.STREAMING,
          shaka.util.Error.Code.STREAMING_ENGINE_STARTUP_INVALID_STATE);
    }

    /**
     * @type {!Map.<shaka.util.ManifestParserUtils.ContentType,
     *              shaka.extern.Stream>}
     */
    const streamsByType = new Map();
    /** @type {!Set.<shaka.extern.Stream>} */
    const streams = new Set();

    if (this.currentVariant_.audio) {
      streamsByType.set(ContentType.AUDIO, this.currentVariant_.audio);
      streams.add(this.currentVariant_.audio);
    }

    if (this.currentVariant_.video) {
      streamsByType.set(ContentType.VIDEO, this.currentVariant_.video);
      streams.add(this.currentVariant_.video);
    }

    if (this.currentTextStream_) {
      streamsByType.set(ContentType.TEXT, this.currentTextStream_);
      streams.add(this.currentTextStream_);
    }

    // Init MediaSourceEngine.
    const mediaSourceEngine = this.playerInterface_.mediaSourceEngine;

    await mediaSourceEngine.init(streamsByType,
        this.manifest_.sequenceMode,
        this.manifest_.type);
    this.destroyer_.ensureNotDestroyed();

    this.updateDuration();

    for (const type of streamsByType.keys()) {
      const stream = streamsByType.get(type);
      if (!this.mediaStates_.has(type)) {
        const mediaState = this.createMediaState_(stream);
        this.mediaStates_.set(type, mediaState);
        this.scheduleUpdate_(mediaState, 0);
      }
    }
  }


  /**
   * Creates a media state.
   *
   * @param {shaka.extern.Stream} stream
   * @return {shaka.media.StreamingEngine.MediaState_}
   * @private
   */
  createMediaState_(stream) {
    return /** @type {shaka.media.StreamingEngine.MediaState_} */ ({
      stream,
      type: stream.type,
      segmentIterator: null,
      segmentPrefetch: this.createSegmentPrefetch_(stream),
      lastSegmentReference: null,
      lastInitSegmentReference: null,
      lastTimestampOffset: null,
      lastAppendWindowStart: null,
      lastAppendWindowEnd: null,
      restoreStreamAfterTrickPlay: null,
      endOfStream: false,
      performingUpdate: false,
      updateTimer: null,
      waitingToClearBuffer: false,
      clearBufferSafeMargin: 0,
      waitingToFlushBuffer: false,
      clearingBuffer: false,
      // The playhead might be seeking on startup, if a start time is set, so
      // start "seeked" as true.
      seeked: true,
      needsResync: false,
      recovering: false,
      hasError: false,
      operation: null,
    });
  }

  /**
   * Creates a media state.
   *
   * @param {shaka.extern.Stream} stream
   * @return {shaka.media.SegmentPrefetch | null}
   * @private
   */
  createSegmentPrefetch_(stream) {
    if (
      stream.type !== shaka.util.ManifestParserUtils.ContentType.VIDEO &&
      stream.type !== shaka.util.ManifestParserUtils.ContentType.AUDIO
    ) {
      return null;
    }
    if (this.config_.segmentPrefetchLimit > 0) {
      return new shaka.media.SegmentPrefetch(
          this.config_.segmentPrefetchLimit,
          stream,
          (reference, stream) => this.dispatchFetch_(reference, stream, null),
      );
    }
    return null;
  }

  /**
   * Sets the MediaSource's duration.
   */
  updateDuration() {
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
   * @suppress {suspiciousCode} The compiler assumes that updateTimer can't
   *   change during the await, and so complains about the null check.
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

    // Make sure the segment index exists. If not, create the segment index.
    if (!mediaState.stream.segmentIndex) {
      const thisStream = mediaState.stream;

      await mediaState.stream.createSegmentIndex();

      if (thisStream != mediaState.stream) {
        // We switched streams while in the middle of this async call to
        // createSegmentIndex.  Abandon this update and schedule a new one if
        // there's not already one pending.
        // Releases the segmentIndex of the old stream.
        if (thisStream.closeSegmentIndex) {
          goog.asserts.assert(!mediaState.stream.segmentIndex,
              'mediastate.stream should not have segmentIndex yet.');
          thisStream.closeSegmentIndex();
        }
        if (!mediaState.performingUpdate && !mediaState.updateTimer) {
          this.scheduleUpdate_(mediaState, 0);
        }
        return;
      }
    }

    // Update the MediaState.
    try {
      const delay = this.update_(mediaState);
      if (delay != null) {
        this.scheduleUpdate_(mediaState, delay);
        mediaState.hasError = false;
      }
    } catch (error) {
      await this.handleStreamingError_(error);
      return;
    }

    const mediaStates = Array.from(this.mediaStates_.values());

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
      // replay, as in https://github.com/shaka-project/shaka-player/issues/979
      // On some platforms, this can spuriously be 0, so ignore this case.
      // https://github.com/shaka-project/shaka-player/issues/1967,
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

    // Do not schedule update for closed captions text mediastate, since closed
    // captions are embedded in video streams.
    if (shaka.media.StreamingEngine.isEmbeddedText_(mediaState)) {
      this.playerInterface_.mediaSourceEngine.setSelectedClosedCaptionId(
          mediaState.stream.originalId || '');
      return null;
    } else if (mediaState.type == ContentType.TEXT) {
      // Disable embedded captions if not desired (e.g. if transitioning from
      // embedded to not-embedded captions).
      this.playerInterface_.mediaSourceEngine.clearSelectedClosedCaptionId();
    }

    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    // Compute how far we've buffered ahead of the playhead.
    const presentationTime = this.playerInterface_.getPresentationTime();

    // Get the next timestamp we need.
    const timeNeeded = this.getTimeNeeded_(mediaState, presentationTime);
    shaka.log.v2(logPrefix, 'timeNeeded=' + timeNeeded);

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
    const timeUntilEnd =
        this.manifest_.presentationTimeline.getDuration() - timeNeeded;
    const oneMicrosecond = 1e-6;

    const bufferEnd =
      this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);

    if (timeUntilEnd < oneMicrosecond && !!bufferEnd) {
      // We shouldn't rebuffer if the playhead is close to the end of the
      // presentation.
      shaka.log.debug(logPrefix, 'buffered to end of presentation');
      mediaState.endOfStream = true;

      if (mediaState.type == ContentType.VIDEO) {
        // Since the text stream of CEA closed captions doesn't have update
        // timer, we have to set the text endOfStream based on the video
        // stream's endOfStream state.
        const textState = this.mediaStates_.get(ContentType.TEXT);
        if (textState &&
            shaka.media.StreamingEngine.isEmbeddedText_(textState)) {
          textState.endOfStream = true;
        }
      }
      return null;
    }
    mediaState.endOfStream = false;

    // If we've buffered to the buffering goal then schedule an update.
    if (bufferedAhead >= scaledBufferingGoal) {
      shaka.log.v2(logPrefix, 'buffering goal met');

      // Do not try to predict the next update.  Just poll according to
      // configuration (seconds). The playback rate can change at any time, so
      // any prediction we make now could be terribly invalid soon.
      return this.config_.updateIntervalSeconds / 2;
    }

    const reference = this.getSegmentReferenceNeeded_(
        mediaState, presentationTime, bufferEnd);
    if (!reference) {
      // The segment could not be found, does not exist, or is not available.
      // In any case just try again... if the manifest is incomplete or is not
      // being updated then we'll idle forever; otherwise, we'll end up getting
      // a SegmentReference eventually.
      return this.config_.updateIntervalSeconds;
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
      // If there is no next segment, ignore this stream.  This happens with
      // text when there's a Period with no text in it.
      if (otherState.segmentIterator && !otherState.segmentIterator.current()) {
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
      shaka.log.v2(logPrefix, 'waiting for other streams to buffer');
      return this.config_.updateIntervalSeconds;
    }

    if (mediaState.segmentPrefetch && mediaState.segmentIterator) {
      mediaState.segmentPrefetch.prefetchSegments(reference);
    }

    const p = this.fetchAndAppend_(mediaState, presentationTime, reference);
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
    //      when comparing times against the presentation timeline.
    if (!mediaState.lastSegmentReference) {
      return presentationTime;
    }

    return mediaState.lastSegmentReference.endTime;
  }


  /**
   * Gets the SegmentReference of the next segment needed.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime
   * @param {?number} bufferEnd
   * @return {shaka.media.SegmentReference} The SegmentReference of the
   *   next segment needed. Returns null if a segment could not be found, does
   *   not exist, or is not available.
   * @private
   */
  getSegmentReferenceNeeded_(mediaState, presentationTime, bufferEnd) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
    goog.asserts.assert(
        mediaState.stream.segmentIndex,
        'segment index should have been generated already');

    if (mediaState.segmentIterator) {
      // Something is buffered from the same Stream.  Use the current position
      // in the segment index.  This is updated via next() after each segment is
      // appended.
      return mediaState.segmentIterator.current();
    } else if (mediaState.lastSegmentReference || bufferEnd) {
      // Something is buffered from another Stream.
      const time = mediaState.lastSegmentReference ?
          mediaState.lastSegmentReference.endTime :
          bufferEnd;
      goog.asserts.assert(time != null, 'Should have a time to search');
      shaka.log.v1(
          logPrefix, 'looking up segment from new stream endTime:', time);

      // Using a new iterator means we need to resync the stream in sequence
      // mode.  The buffered range might not align perfectly with the last
      // segment end time, so we may end up repeating a segment.  Resyncing
      // makes this safe to do.
      mediaState.needsResync = true;
      mediaState.segmentIterator =
          mediaState.stream.segmentIndex.getIteratorForTime(time);
      const ref = mediaState.segmentIterator &&
          mediaState.segmentIterator.next().value;
      if (ref == null) {
        shaka.log.warning(logPrefix, 'cannot find segment', 'endTime:', time);
      }
      return ref;
    } else {
      // Nothing is buffered.  Start at the playhead time.

      // If there's positive drift then we need to adjust the lookup time, and
      // may wind up requesting the previous segment to be safe.
      // inaccurateManifestTolerance should be 0 for low latency streaming.
      const inaccurateTolerance = this.config_.inaccurateManifestTolerance;
      const lookupTime = Math.max(presentationTime - inaccurateTolerance, 0);

      shaka.log.v1(logPrefix, 'looking up segment',
          'lookupTime:', lookupTime,
          'presentationTime:', presentationTime);

      let ref = null;
      if (inaccurateTolerance) {
        mediaState.segmentIterator =
            mediaState.stream.segmentIndex.getIteratorForTime(lookupTime);
        ref = mediaState.segmentIterator &&
            mediaState.segmentIterator.next().value;
      }
      if (!ref) {
        // If we can't find a valid segment with the drifted time, look for a
        // segment with the presentation time.
        mediaState.segmentIterator =
            mediaState.stream.segmentIndex.getIteratorForTime(presentationTime);
        ref = mediaState.segmentIterator &&
            mediaState.segmentIterator.next().value;
      }
      if (ref == null) {
        shaka.log.warning(logPrefix, 'cannot find segment',
            'lookupTime:', lookupTime,
            'presentationTime:', presentationTime);
      }
      return ref;
    }
  }


  /**
   * Fetches and appends the given segment. Sets up the given MediaState's
   * associated SourceBuffer and evicts segments if either are required
   * beforehand. Schedules another update after completing successfully.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime
   * @param {!shaka.media.SegmentReference} reference
   * @private
   */
  async fetchAndAppend_(mediaState, presentationTime, reference) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const StreamingEngine = shaka.media.StreamingEngine;
    const logPrefix = StreamingEngine.logPrefix_(mediaState);

    shaka.log.v1(logPrefix,
        'fetchAndAppend_:',
        'presentationTime=' + presentationTime,
        'reference.startTime=' + reference.startTime,
        'reference.endTime=' + reference.endTime);

    // Subtlety: The playhead may move while asynchronous update operations are
    // in progress, so we should avoid calling playhead.getTime() in any
    // callbacks. Furthermore, switch() or seeked() may be called at any time,
    // so we store the old iterator.  This allows the mediaState to change and
    // we'll update the old iterator.
    const stream = mediaState.stream;
    const iter = mediaState.segmentIterator;

    mediaState.performingUpdate = true;

    try {
      if (reference.getStatus() ==
          shaka.media.SegmentReference.Status.MISSING) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.SEGMENT_MISSING);
      }
      await this.initSourceBuffer_(mediaState, reference);
      this.destroyer_.ensureNotDestroyed();
      if (this.fatalError_) {
        return;
      }

      shaka.log.v2(logPrefix, 'fetching segment');
      const isMP4 = stream.mimeType == 'video/mp4' ||
              stream.mimeType == 'audio/mp4';
      const isReadableStreamSupported = window.ReadableStream;
      // Enable MP4 low latency streaming with ReadableStream chunked data.
      // And only for DASH.
      if (this.config_.lowLatencyMode && isReadableStreamSupported && isMP4 &&
          this.manifest_.type != shaka.media.ManifestParser.HLS) {
        let remaining = new Uint8Array(0);
        let processingResult = false;
        let callbackCalled = false;
        const streamDataCallback = async (data) => {
          if (processingResult) {
            // If the fallback result processing was triggered, don't also
            // append the buffer here.  In theory this should never happen,
            // but it does on some older TVs.
            return;
          }
          callbackCalled = true;
          this.destroyer_.ensureNotDestroyed();
          if (this.fatalError_) {
            return;
          }
          // Append the data with complete boxes.
          // Every time streamDataCallback gets called, append the new data to
          // the remaining data.
          // Find the last fully completed Mdat box, and slice the data into two
          // parts: the first part with completed Mdat boxes, and the second
          // part with an incomplete box.
          // Append the first part, and save the second part as remaining data,
          // and handle it with the next streamDataCallback call.
          remaining = this.concatArray_(remaining, data);
          let sawMDAT = false;
          let offset = 0;
          new shaka.util.Mp4Parser()
              .box('mdat', (box) => {
                offset = box.size + box.start;
                sawMDAT = true;
              })
              .parse(remaining, /* partialOkay= */ false,
                  /* isChunkedData= */ true);
          if (sawMDAT) {
            const dataToAppend = remaining.subarray(0, offset);
            remaining = remaining.subarray(offset);
            await this.append_(
                mediaState, presentationTime, stream, reference, dataToAppend);
          }
        };

        const result =
            await this.fetch_(mediaState, reference, streamDataCallback);
        if (!callbackCalled) {
          // In some environments, we might be forced to use network plugins
          // that don't support streamDataCallback. In those cases, as a
          // fallback, append the buffer here.
          processingResult = true;
          this.destroyer_.ensureNotDestroyed();
          if (this.fatalError_) {
            return;
          }

          // If the text stream gets switched between fetch_() and append_(),
          // the new text parser is initialized, but the new init segment is
          // not fetched yet.  That would cause an error in
          // TextParser.parseMedia().
          // See http://b/168253400
          if (mediaState.waitingToClearBuffer) {
            shaka.log.info(logPrefix, 'waitingToClearBuffer, skip append');
            mediaState.performingUpdate = false;
            this.scheduleUpdate_(mediaState, 0);
            return;
          }

          await this.append_(
              mediaState, presentationTime, stream, reference, result);
        }
      } else {
        if (this.config_.lowLatencyMode && !isReadableStreamSupported) {
          shaka.log.warning('Low latency streaming mode is enabled, but ' +
            'ReadableStream is not supported by the browser.');
        }
        const fetchSegment = this.fetch_(mediaState, reference);
        let result = await fetchSegment;
        this.destroyer_.ensureNotDestroyed();
        if (this.fatalError_) {
          return;
        }
        if (reference.hlsAes128Key) {
          goog.asserts.assert(iter, 'mediaState.segmentIterator should exist');
          result = await this.aes128Decrypt_(result, reference, iter);
        }
        this.destroyer_.ensureNotDestroyed();

        // If the text stream gets switched between fetch_() and append_(), the
        // new text parser is initialized, but the new init segment is not
        // fetched yet.  That would cause an error in TextParser.parseMedia().
        // See http://b/168253400
        if (mediaState.waitingToClearBuffer) {
          shaka.log.info(logPrefix, 'waitingToClearBuffer, skip append');
          mediaState.performingUpdate = false;
          this.scheduleUpdate_(mediaState, 0);
          return;
        }

        await this.append_(
            mediaState, presentationTime, stream, reference, result);
      }

      this.destroyer_.ensureNotDestroyed();
      if (this.fatalError_) {
        return;
      }
      // move to next segment after appending the current segment.
      mediaState.lastSegmentReference = reference;
      const newRef = iter.next().value;
      shaka.log.v2(logPrefix, 'advancing to next segment', newRef);

      mediaState.performingUpdate = false;
      mediaState.recovering = false;

      const info = this.playerInterface_.mediaSourceEngine.getBufferedInfo();
      const buffered = info[mediaState.type];
      // Convert the buffered object to a string capture its properties on
      // WebOS.
      shaka.log.v1(logPrefix, 'finished fetch and append',
          JSON.stringify(buffered));

      if (!mediaState.waitingToClearBuffer) {
        this.playerInterface_.onSegmentAppended(
            reference.startTime, reference.endTime, mediaState.type);
      }

      // Update right away.
      this.scheduleUpdate_(mediaState, 0);
    } catch (error) {
      this.destroyer_.ensureNotDestroyed(error);
      if (this.fatalError_) {
        return;
      }
      goog.asserts.assert(error instanceof shaka.util.Error,
          'Should only receive a Shaka error');

      mediaState.performingUpdate = false;

      if (error.code == shaka.util.Error.Code.OPERATION_ABORTED) {
        // If the network slows down, abort the current fetch request and start
        // a new one, and ignore the error message.
        mediaState.performingUpdate = false;
        this.cancelUpdate_(mediaState);
        this.scheduleUpdate_(mediaState, 0);
      } else if (mediaState.type == ContentType.TEXT &&
          this.config_.ignoreTextStreamFailures) {
        if (error.code == shaka.util.Error.Code.BAD_HTTP_STATUS) {
          shaka.log.warning(logPrefix,
              'Text stream failed to download. Proceeding without it.');
        } else {
          shaka.log.warning(logPrefix,
              'Text stream failed to parse. Proceeding without it.');
        }
        this.mediaStates_.delete(ContentType.TEXT);
      } else if (error.code == shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR) {
        this.handleQuotaExceeded_(mediaState, error);
      } else {
        shaka.log.error(logPrefix, 'failed fetch and append: code=' +
            error.code);
        mediaState.hasError = true;

        error.severity = shaka.util.Error.Severity.CRITICAL;
        await this.handleStreamingError_(error);
      }
    }
  }

  /**
   * @param {!BufferSource} rawResult
   * @param {!shaka.media.SegmentReference} reference
   * @param {!shaka.media.SegmentIterator} iter
   * @return {!Promise.<!BufferSource>} finalResult
   * @private
   */
  async aes128Decrypt_(rawResult, reference, iter) {
    const key = reference.hlsAes128Key;
    if (!key.cryptoKey) {
      goog.asserts.assert(key.fetchKey, 'If AES-128 cryptoKey was not ' +
          'preloaded, fetchKey function should be provided');
      await key.fetchKey();
      goog.asserts.assert(key.cryptoKey, 'AES-128 cryptoKey should now be set');
    }
    let iv = key.iv;
    if (!iv) {
      iv = shaka.util.BufferUtils.toUint8(new ArrayBuffer(16));
      let sequence = key.firstMediaSequenceNumber + iter.currentPosition();
      for (let i = iv.byteLength - 1; i >= 0; i--) {
        iv[i] = sequence & 0xff;
        sequence >>= 8;
      }
    }
    return window.crypto.subtle.decrypt(
        {name: 'AES-CBC', iv}, key.cryptoKey, rawResult);
  }


  /**
   * Clear per-stream error states and retry any failed streams.
   * @param {number} delaySeconds
   * @return {boolean} False if unable to retry.
   */
  retry(delaySeconds) {
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
      // Only schedule an update if it has an error, but it's not mid-update
      // and there is not already an update scheduled.
      if (mediaState.hasError && !mediaState.performingUpdate &&
          !mediaState.updateTimer) {
        shaka.log.info(logPrefix, 'Retrying after failure...');
        mediaState.hasError = false;
        this.scheduleUpdate_(mediaState, delaySeconds);
      }
    }

    return true;
  }


  /**
   * Append the data to the remaining data.
   * @param {!Uint8Array} remaining
   * @param {!Uint8Array} data
   * @return {!Uint8Array}
   * @private
   */
  concatArray_(remaining, data) {
    const result = new Uint8Array(remaining.length + data.length);
    result.set(remaining);
    result.set(data, remaining.length);
    return result;
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
   * Sets the given MediaState's associated SourceBuffer's timestamp offset,
   * append window, and init segment if they have changed. If an error occurs
   * then neither the timestamp offset or init segment are unset, since another
   * call to switch() will end up superseding them.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {!shaka.media.SegmentReference} reference
   * @return {!Promise}
   * @private
   */
  async initSourceBuffer_(mediaState, reference) {
    const StreamingEngine = shaka.media.StreamingEngine;
    const logPrefix = StreamingEngine.logPrefix_(mediaState);

    /** @type {!Array.<!Promise>} */
    const operations = [];

    // Rounding issues can cause us to remove the first frame of a Period, so
    // reduce the window start time slightly.
    const appendWindowStart = Math.max(0,
        reference.appendWindowStart -
        StreamingEngine.APPEND_WINDOW_START_FUDGE_);
    const appendWindowEnd =
        reference.appendWindowEnd + StreamingEngine.APPEND_WINDOW_END_FUDGE_;

    goog.asserts.assert(
        reference.startTime <= appendWindowEnd,
        logPrefix + ' segment should start before append window end');

    const timestampOffset = reference.timestampOffset;
    if (timestampOffset != mediaState.lastTimestampOffset ||
        appendWindowStart != mediaState.lastAppendWindowStart ||
        appendWindowEnd != mediaState.lastAppendWindowEnd) {
      shaka.log.v1(logPrefix, 'setting timestamp offset to ' + timestampOffset);
      shaka.log.v1(logPrefix,
          'setting append window start to ' + appendWindowStart);
      shaka.log.v1(logPrefix,
          'setting append window end to ' + appendWindowEnd);

      const setProperties = async () => {
        try {
          mediaState.lastAppendWindowStart = appendWindowStart;
          mediaState.lastAppendWindowEnd = appendWindowEnd;
          mediaState.lastTimestampOffset = timestampOffset;

          await this.playerInterface_.mediaSourceEngine.setStreamProperties(
              mediaState.type, timestampOffset, appendWindowStart,
              appendWindowEnd, this.manifest_.sequenceMode);
        } catch (error) {
          mediaState.lastAppendWindowStart = null;
          mediaState.lastAppendWindowEnd = null;
          mediaState.lastTimestampOffset = null;

          throw error;
        }
      };
      operations.push(setProperties());
    }

    if (!shaka.media.InitSegmentReference.equal(
        reference.initSegmentReference, mediaState.lastInitSegmentReference)) {
      mediaState.lastInitSegmentReference = reference.initSegmentReference;

      if (reference.initSegmentReference) {
        shaka.log.v1(logPrefix, 'fetching init segment');

        const fetchInit =
            this.fetch_(mediaState, reference.initSegmentReference,
            /* streamDataCallback= */ undefined, /* isInit= */ true);
        const append = async () => {
          try {
            const initSegment = await fetchInit;
            this.destroyer_.ensureNotDestroyed();

            const parser = new shaka.util.Mp4Parser();
            const Mp4Parser = shaka.util.Mp4Parser;
            parser.box('moov', Mp4Parser.children)
                .box('trak', Mp4Parser.children)
                .box('mdia', Mp4Parser.children)
                .fullBox('mdhd', (box) => {
                  this.parseMDHD_(reference, box);
                })
                .parse(initSegment);

            shaka.log.v1(logPrefix, 'appending init segment');
            const hasClosedCaptions = mediaState.stream.closedCaptions &&
                mediaState.stream.closedCaptions.size > 0;
            await this.playerInterface_.beforeAppendSegment(
                mediaState.type, initSegment);
            await this.playerInterface_.mediaSourceEngine.appendBuffer(
                mediaState.type, initSegment, /* reference= */ null,
                hasClosedCaptions);
          } catch (error) {
            mediaState.lastInitSegmentReference = null;
            throw error;
          }
        };
        this.playerInterface_.onInitSegmentAppended(
            reference.startTime, reference.initSegmentReference);
        operations.push(append());
      }
    }

    if (this.manifest_.sequenceMode) {
      // Across discontinuity bounds, we should resync timestamps for
      // sequence mode playbacks.  The next segment appended should
      // land at its theoretical timestamp from the segment index.
      const lastDiscontinuitySequence =
          mediaState.lastSegmentReference ?
              mediaState.lastSegmentReference.discontinuitySequence : null;
      if (reference.discontinuitySequence != lastDiscontinuitySequence ||
          mediaState.needsResync) {
        mediaState.needsResync = false;
        operations.push(this.playerInterface_.mediaSourceEngine.resync(
            mediaState.type, reference.startTime));
      }
    }

    await Promise.all(operations);
  }


  /**
   * Appends the given segment and evicts content if required to append.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime
   * @param {shaka.extern.Stream} stream
   * @param {!shaka.media.SegmentReference} reference
   * @param {BufferSource} segment
   * @return {!Promise}
   * @private
   */
  async append_(mediaState, presentationTime, stream, reference, segment) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    const hasClosedCaptions = stream.closedCaptions &&
        stream.closedCaptions.size > 0;

    let parser;
    const hasEmsg = ((stream.emsgSchemeIdUris != null &&
      stream.emsgSchemeIdUris.length > 0) ||
      this.config_.dispatchAllEmsgBoxes);
    const shouldParsePrftBox =
      (this.config_.parsePrftBox && !this.parsedPrftEventRaised_);

    if (hasEmsg || shouldParsePrftBox) {
      parser = new shaka.util.Mp4Parser();
    }

    if (hasEmsg) {
      parser
          .fullBox(
              'emsg',
              (box) => this.parseEMSG_(
                  reference, stream.emsgSchemeIdUris, box));
    }

    if (shouldParsePrftBox) {
      parser
          .fullBox(
              'prft',
              (box) => this.parsePrft_(
                  reference, box));
    }

    if (hasEmsg || shouldParsePrftBox) {
      parser.parse(segment);
    }

    await this.evict_(mediaState, presentationTime);
    this.destroyer_.ensureNotDestroyed();

    // 'seeked' or 'adaptation' triggered logic applies only to this
    // appendBuffer() call.
    const seeked = mediaState.seeked;
    mediaState.seeked = false;
    const adaptation = mediaState.adaptation;
    mediaState.adaptation = false;

    await this.playerInterface_.beforeAppendSegment(mediaState.type, segment);
    await this.playerInterface_.mediaSourceEngine.appendBuffer(
        mediaState.type,
        segment,
        reference,
        hasClosedCaptions,
        seeked,
        adaptation);
    this.destroyer_.ensureNotDestroyed();
    shaka.log.v2(logPrefix, 'appended media segment');
  }


  /**
   * Parse the EMSG box from a MP4 container.
   *
   * @param {!shaka.media.SegmentReference} reference
   * @param {?Array.<string>} emsgSchemeIdUris Array of emsg
   *     scheme_id_uri for which emsg boxes should be parsed.
   * @param {!shaka.extern.ParsedBox} box
   * @private
   * https://dashif-documents.azurewebsites.net/Events/master/event.html#emsg-format
   * aligned(8) class DASHEventMessageBox
   *    extends FullBox(‘emsg’, version, flags = 0){
   * if (version==0) {
   *   string scheme_id_uri;
   *   string value;
   *   unsigned int(32) timescale;
   *   unsigned int(32) presentation_time_delta;
   *   unsigned int(32) event_duration;
   *   unsigned int(32) id;
   * } else if (version==1) {
   *   unsigned int(32) timescale;
   *   unsigned int(64) presentation_time;
   *   unsigned int(32) event_duration;
   *   unsigned int(32) id;
   *   string scheme_id_uri;
   *   string value;
   * }
   * unsigned int(8) message_data[];
   */
  parseEMSG_(reference, emsgSchemeIdUris, box) {
    let timescale;
    let id;
    let eventDuration;
    let schemeId;
    let startTime;
    let presentationTimeDelta;
    let value;

    if (box.version === 0) {
      schemeId = box.reader.readTerminatedString();
      value = box.reader.readTerminatedString();
      timescale = box.reader.readUint32();
      presentationTimeDelta = box.reader.readUint32();
      eventDuration = box.reader.readUint32();
      id = box.reader.readUint32();
      startTime = reference.startTime + (presentationTimeDelta / timescale);
    } else {
      timescale = box.reader.readUint32();
      const pts = box.reader.readUint64();
      startTime = (pts / timescale) + reference.timestampOffset;
      presentationTimeDelta = startTime - reference.startTime;
      eventDuration = box.reader.readUint32();
      id = box.reader.readUint32();
      schemeId = box.reader.readTerminatedString();
      value = box.reader.readTerminatedString();
    }
    const messageData = box.reader.readBytes(
        box.reader.getLength() - box.reader.getPosition());


    // See DASH sec. 5.10.3.3.1
    // If a DASH client detects an event message box with a scheme that is not
    // defined in MPD, the client is expected to ignore it.
    if ((emsgSchemeIdUris && emsgSchemeIdUris.includes(schemeId)) ||
        this.config_.dispatchAllEmsgBoxes) {
      // See DASH sec. 5.10.4.1
      // A special scheme in DASH used to signal manifest updates.
      if (schemeId == 'urn:mpeg:dash:event:2012') {
        this.playerInterface_.onManifestUpdate();
      } else if (schemeId == 'https://aomedia.org/emsg/ID3') {
        // See https://aomediacodec.github.io/id3-emsg/
        const frames = shaka.util.Id3Utils.getID3Frames(messageData);
        if (frames.length && reference) {
          /** @private {shaka.extern.ID3Metadata} */
          const metadata = {
            cueTime: reference.startTime,
            data: messageData,
            frames: frames,
            dts: reference.startTime,
            pts: reference.startTime,
          };
          this.playerInterface_.onMetadata(
              [metadata], /* offset= */ 0, reference.endTime);
        }
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
        const eventName = shaka.util.FakeEvent.EventName.Emsg;
        const data = (new Map()).set('detail', emsg);
        const event = new shaka.util.FakeEvent(eventName, data);
        this.playerInterface_.onEvent(event);
      }
    }
  }

  /**
   * Parse MDHD box.
   * @param {!shaka.media.SegmentReference} reference
   * @param {!shaka.extern.ParsedBox} box
   * @private
   */
  parseMDHD_(reference, box) {
    const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
        box.reader || 0, box.version || 0);
    reference.initSegmentReference.timescale = parsedMDHDBox.timescale;
  }

  /**
   * Parse PRFT box.
   * @param {!shaka.media.SegmentReference} reference
   * @param {!shaka.extern.ParsedBox} box
   * @private
   */
  parsePrft_(reference, box) {
    if (this.parsedPrftEventRaised_ ||
      !reference.initSegmentReference.timescale) {
      return;
    }
    box.reader.readUint32(); // Ignore referenceTrackId
    const ntpTimestampSec = box.reader.readUint32();
    const ntpTimestampFrac = box.reader.readUint32();
    const ntpTimestamp = ntpTimestampSec * 1000 +
        ntpTimestampFrac / 2**32 * 1000;

    let mediaTime;
    if (box.version === 0) {
      mediaTime = box.reader.readUint32();
    } else {
      try {
        mediaTime = box.reader.readUint64();
      } catch (e) {
        shaka.log.warning('parsePrft_: parsing mediatime resulted in a '+
          'MEDIA.JS_INTEGER_OVERFLOW exception');
        this.parsedPrftEventRaised_ = true;
        return;
      }
    }

    const timescale = reference.initSegmentReference.timescale;
    const wallClockTime = this.convertNtp(ntpTimestamp);
    const programStartDate = new Date(wallClockTime -
      (mediaTime / timescale) * 1000);
    const prftInfo = {
      wallClockTime,
      programStartDate,
    };

    const eventName = shaka.util.FakeEvent.EventName.Prft;
    const data = (new Map()).set('detail', prftInfo);
    const event = new shaka.util.FakeEvent(
        eventName, data);
    this.playerInterface_.onEvent(event);
    this.parsedPrftEventRaised_ = true;
  }


  /**
     * Convert Ntp ntpTimeStamp to UTC Time
     *
     * @param {number} ntpTimeStamp
     * @return {number} utcTime
     */
  convertNtp(ntpTimeStamp) {
    const start = new Date(Date.UTC(1900, 0, 1, 0, 0, 0));
    return new Date(start.getTime() + ntpTimeStamp).getTime();
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
    // See: https://github.com/shaka-project/shaka-player/issues/2982
    if (overflow <= 0.01) {
      shaka.log.v2(logPrefix,
          'buffer behind okay:',
          'presentationTime=' + presentationTime,
          'bufferedBehind=' + bufferedBehind,
          'bufferBehind=' + bufferBehind,
          'underflow=' + Math.abs(overflow));
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
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @return {boolean}
   * @private
   */
  static isEmbeddedText_(mediaState) {
    const MimeUtils = shaka.util.MimeUtils;
    const CEA608_MIME = MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE;
    const CEA708_MIME = MimeUtils.CEA708_CLOSED_CAPTION_MIMETYPE;
    return mediaState &&
        mediaState.type == shaka.util.ManifestParserUtils.ContentType.TEXT &&
        (mediaState.stream.mimeType == CEA608_MIME ||
         mediaState.stream.mimeType == CEA708_MIME);
  }


  /**
   * Fetches the given segment.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {(!shaka.media.InitSegmentReference|!shaka.media.SegmentReference)}
   *   reference
   * @param {?function(BufferSource):!Promise=} streamDataCallback
   * @param {boolean=} isInit
   *
   * @return {!Promise.<BufferSource>}
   * @private
   * @suppress {strictMissingProperties}
   */
  async fetch_(mediaState, reference, streamDataCallback, isInit) {
    let op = null;
    if (
      mediaState.segmentPrefetch &&
      reference instanceof shaka.media.SegmentReference
    ) {
      op = mediaState.segmentPrefetch.getPrefetchedSegment(reference);
    }
    if (!op) {
      op = this.dispatchFetch_(
          reference, mediaState.stream, streamDataCallback, isInit,
      );
    }

    mediaState.operation = op;
    const response = await op.promise;
    mediaState.operation = null;
    return response.data;
  }

  /**
   * Fetches the given segment.
   *
   * @param {!shaka.extern.Stream} stream
   * @param {(!shaka.media.InitSegmentReference|!shaka.media.SegmentReference)}
   *   reference
   * @param {?function(BufferSource):!Promise=} streamDataCallback
   * @param {boolean=} isInit
   *
   * @return {!shaka.net.NetworkingEngine.PendingRequest}
   * @private
   */
  dispatchFetch_(reference, stream, streamDataCallback, isInit) {
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const advType = isInit ?
        shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT :
        shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT;

    const request = shaka.util.Networking.createSegmentRequest(
        reference.getUris(),
        reference.startByte,
        reference.endByte,
        this.config_.retryParameters,
        streamDataCallback);

    shaka.log.v2('fetching: reference=', reference);
    let duration = 0;
    if (reference instanceof shaka.media.SegmentReference) {
      // start and endTime are not defined in InitSegmentReference
      duration = reference.endTime - reference.startTime;
    }
    this.playerInterface_.modifySegmentRequest(
        request,
        {
          type: stream.type,
          init: reference instanceof shaka.media.InitSegmentReference,
          duration: duration,
          mimeType: stream.mimeType,
          codecs: stream.codecs,
          bandwidth: stream.bandwidth,
        },
    );
    return this.playerInterface_.netEngine.request(
        requestType, request, advType);
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
    mediaState.lastSegmentReference = null;
    mediaState.lastInitSegmentReference = null;
    mediaState.segmentIterator = null;

    shaka.log.debug(logPrefix, 'clearing buffer');
    if (mediaState.segmentPrefetch) {
      mediaState.segmentPrefetch.clearAll();
    }

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
    mediaState.clearingBuffer = false;
    mediaState.endOfStream = false;
    // Since the clear operation was async, check to make sure we're not doing
    // another update and we don't have one scheduled yet.
    if (!mediaState.performingUpdate && !mediaState.updateTimer) {
      this.scheduleUpdate_(mediaState, 0);
    }
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

    // If the text's update is canceled and its mediaState is deleted, stop
    // scheduling another update.
    const type = mediaState.type;
    if (type == shaka.util.ManifestParserUtils.ContentType.TEXT &&
          !this.mediaStates_.has(type)) {
      shaka.log.v1(logPrefix, 'Text stream is unloaded. No update is needed.');
      return;
    }

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
   * If |mediaState| holds any in-progress operations, abort them.
   *
   * @return {!Promise}
   * @private
   */
  async abortOperations_(mediaState) {
    if (mediaState.operation) {
      await mediaState.operation.abort();
    }
  }

  /**
   * Handle streaming errors by delaying, then notifying the application by
   * error callback and by streaming failure callback.
   *
   * @param {!shaka.util.Error} error
   * @return {!Promise}
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
 *   getPresentationTime: function():number,
 *   getBandwidthEstimate: function():number,
 *   modifySegmentRequest: function(shaka.extern.Request,
 *     shaka.util.CmcdManager.SegmentInfo),
 *   mediaSourceEngine: !shaka.media.MediaSourceEngine,
 *   netEngine: shaka.net.NetworkingEngine,
 *   onError: function(!shaka.util.Error),
 *   onEvent: function(!Event),
 *   onManifestUpdate: function(),
 *   onSegmentAppended: function(number, number,
 *     !shaka.util.ManifestParserUtils.ContentType),
 *   onInitSegmentAppended: function(!number,!shaka.media.InitSegmentReference),
 *   beforeAppendSegment: function(
 *     shaka.util.ManifestParserUtils.ContentType,!BufferSource):Promise,
 *   onMetadata: !function(!Array.<shaka.extern.ID3Metadata>, number, ?number)
 * }}
 *
 * @property {function():number} getPresentationTime
 *   Get the position in the presentation (in seconds) of the content that the
 *   viewer is seeing on screen right now.
 * @property {function():number} getBandwidthEstimate
 *   Get the estimated bandwidth in bits per second.
 * @property {function(shaka.extern.Request,
 *   shaka.extern.Cmcd.SegmentInfo)} modifySegmentRequest
 *   The request modifier
 * @property {!shaka.media.MediaSourceEngine} mediaSourceEngine
 *   The MediaSourceEngine. The caller retains ownership.
 * @property {shaka.net.NetworkingEngine} netEngine
 *   The NetworkingEngine instance to use. The caller retains ownership.
 * @property {function(!shaka.util.Error)} onError
 *   Called when an error occurs. If the error is recoverable (see
 *   {@link shaka.util.Error}) then the caller may invoke either
 *   StreamingEngine.switch*() or StreamingEngine.seeked() to attempt recovery.
 * @property {function(!Event)} onEvent
 *   Called when an event occurs that should be sent to the app.
 * @property {function()} onManifestUpdate
 *   Called when an embedded 'emsg' box should trigger a manifest update.
 * @property {function(number, number,
 *   !shaka.util.ManifestParserUtils.ContentType)} onSegmentAppended
 *   Called after a segment is successfully appended to a MediaSource.
 *   The parameters are the start and end time.
 * @property
 *  {function(!number, !shaka.media.InitSegmentReference)} onInitSegmentAppended
 *   Called when an init segment is appended to a MediaSource.
 * @property {!function(shaka.util.ManifestParserUtils.ContentType,
 *   !BufferSource):Promise} beforeAppendSegment
 *   A function called just before appending to the source buffer.
 * @property
 *  {!function(!Array.<shaka.extern.ID3Metadata>, number, ?number)} onMetadata
 *   Called when an ID3 is found in a EMSG.
 */
shaka.media.StreamingEngine.PlayerInterface;


/**
 * @typedef {{
 *   type: shaka.util.ManifestParserUtils.ContentType,
 *   stream: shaka.extern.Stream,
 *   segmentIterator: shaka.media.SegmentIterator,
 *   lastSegmentReference: shaka.media.SegmentReference,
 *   lastInitSegmentReference: shaka.media.InitSegmentReference,
 *   lastTimestampOffset: ?number,
 *   lastAppendWindowStart: ?number,
 *   lastAppendWindowEnd: ?number,
 *   restoreStreamAfterTrickPlay: ?shaka.extern.Stream,
 *   endOfStream: boolean,
 *   performingUpdate: boolean,
 *   updateTimer: shaka.util.DelayedTick,
 *   waitingToClearBuffer: boolean,
 *   waitingToFlushBuffer: boolean,
 *   clearBufferSafeMargin: number,
 *   clearingBuffer: boolean,
 *   seeked: boolean,
 *   needsResync: boolean,
 *   adaptation: boolean,
 *   recovering: boolean,
 *   hasError: boolean,
 *   operation: shaka.net.NetworkingEngine.PendingRequest,
 *   segmentPrefetch: shaka.media.SegmentPrefetch
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
 * @property {shaka.media.SegmentIndexIterator} segmentIterator
 *   An iterator through the segments of |stream|.
 * @property {shaka.media.SegmentReference} lastSegmentReference
 *   The SegmentReference of the last segment that was appended.
 * @property {shaka.media.InitSegmentReference} lastInitSegmentReference
 *   The InitSegmentReference of the last init segment that was appended.
 * @property {?number} lastTimestampOffset
 *   The last timestamp offset given to MediaSourceEngine for this type.
 * @property {?number} lastAppendWindowStart
 *   The last append window start given to MediaSourceEngine for this type.
 * @property {?number} lastAppendWindowEnd
 *   The last append window end given to MediaSourceEngine for this type.
 * @property {?shaka.extern.Stream} restoreStreamAfterTrickPlay
 *   The Stream to restore after trick play mode is turned off.
 * @property {boolean} endOfStream
 *   True indicates that the end of the buffer has hit the end of the
 *   presentation.
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
 * @property {boolean} seeked
 *   True indicates that the presentation just seeked.
 * @property {boolean} adaptation
 *   True indicates that the presentation just automatically switched variants.
 * @property {boolean} needsResync
 *   True indicates that the stream needs to be resynced in sequence mode,
 *   regardless of discontinuity sequence.
 * @property {boolean} recovering
 *   True indicates that the last segment was not appended because it could not
 *   fit in the buffer.
 * @property {boolean} hasError
 *   True indicates that the stream has encountered an error and has stopped
 *   updating.
 * @property {shaka.net.NetworkingEngine.PendingRequest} operation
 *   Operation with the number of bytes to be downloaded.
 * @property {?shaka.media.SegmentPrefetch} segmentPrefetch
 *   A prefetch object for managing prefetching. Null if unneeded
 *   (if prefetching is disabled, etc).
 */
shaka.media.StreamingEngine.MediaState_;


/**
 * The fudge factor for appendWindowStart.  By adjusting the window backward, we
 * avoid rounding errors that could cause us to remove the keyframe at the start
 * of the Period.
 *
 * NOTE: This was increased as part of the solution to
 * https://github.com/shaka-project/shaka-player/issues/1281
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
 * https://github.com/shaka-project/shaka-player/issues/1597
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
