/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 */

goog.provide('shaka.media.StreamingEngine');

goog.require('goog.asserts');
goog.require('shaka.config.CrossBoundaryStrategy');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.log');
goog.require('shaka.media.Capabilities');
goog.require('shaka.media.InitSegmentReference');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.MediaSourceEngine');
goog.require('shaka.media.MetaSegmentIndex');
goog.require('shaka.media.SegmentIterator');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.SegmentPrefetch');
goog.require('shaka.media.SegmentUtils');
goog.require('shaka.net.Backoff');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.DelayedTick');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.LanguageUtils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Networking');
goog.require('shaka.util.Timer');
goog.require('shaka.util.Uint8ArrayUtils');


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

    /**
     * Retains a reference to the function used to close SegmentIndex objects
     * for streams which were switched away from during an ongoing update_().
     * @private {!Map<string, !function()>}
     */
    this.deferredCloseSegmentIndex_ = new Map();

    /** @private {number} */
    this.bufferingScale_ = 1;

    /** @private {?shaka.extern.Variant} */
    this.currentVariant_ = null;

    /** @private {?shaka.extern.Stream} */
    this.currentTextStream_ = null;

    /** @private {number} */
    this.textStreamSequenceId_ = 0;

    /**
     * Maps a content type, e.g., 'audio', 'video', or 'text', to a MediaState.
     *
     * @private {!Map<shaka.util.ManifestParserUtils.ContentType,
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

    /** @private {number} */
    this.lastMediaSourceReset_ = Date.now() / 1000;

    /**
     * @private {!Map<shaka.extern.Stream, !shaka.media.SegmentPrefetch>}
     */
    this.audioPrefetchMap_ = new Map();

    /** @private {!shaka.extern.SpatialVideoInfo} */
    this.spatialVideoInfo_ = {
      projection: null,
      hfov: null,
    };

    /** @private {number} */
    this.playRangeStart_ = 0;

    /** @private {number} */
    this.playRangeEnd_ = Infinity;

    /** @private {?shaka.media.StreamingEngine.MediaState_} */
    this.lastTextMediaStateBeforeUnload_ = null;

    /** @private {!Array} */
    this.requestedDependencySegments_ = [];

    /** @private {?shaka.util.Timer} */
    this.updateLiveSeekableRangeTimer_ = new shaka.util.Timer(() => {
      if (!this.manifest_ || !this.playerInterface_) {
        if (this.updateLiveSeekableRangeTimer_) {
          this.updateLiveSeekableRangeTimer_.stop();
        }
        return;
      }
      if (!this.manifest_.presentationTimeline.isLive()) {
        this.playerInterface_.mediaSourceEngine.clearLiveSeekableRange();
        if (this.updateLiveSeekableRangeTimer_) {
          this.updateLiveSeekableRangeTimer_.stop();
        }
        return;
      }
      const startTime = this.manifest_.presentationTimeline.getSeekRangeStart();
      const endTime = this.manifest_.presentationTimeline.getSeekRangeEnd();
      // Some older devices require the range to be greater than 1 or exceptions
      // are thrown, due to an old and buggy implementation.
      if (endTime - startTime > 1) {
        this.playerInterface_.mediaSourceEngine.setLiveSeekableRange(
            startTime, endTime);
      } else {
        this.playerInterface_.mediaSourceEngine.clearLiveSeekableRange();
      }
    });

    /** @private {?number} */
    this.boundaryTime_ = null;

    /** @private {boolean} */
    this.crossBoundarySeek_ = false;

    /** @private {?shaka.util.Timer} */
    this.crossBoundaryTimer_ = new shaka.util.Timer(() => {
      const video = this.playerInterface_.video;
      if (video.ended) {
        return;
      }
      if (this.boundaryTime_) {
        shaka.log.info('Crossing boundary at', this.boundaryTime_);
        this.crossBoundarySeek_ = true;
        video.currentTime = this.boundaryTime_;
        this.boundaryTime_ = null;
      }
    });

    /** @private {shaka.util.EventManager} */
    this.crossBoundaryEventManager_ = new shaka.util.EventManager();
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
    if (this.updateLiveSeekableRangeTimer_) {
      this.updateLiveSeekableRangeTimer_.stop();
    }
    this.updateLiveSeekableRangeTimer_ = null;
    if (this.crossBoundaryTimer_) {
      this.crossBoundaryTimer_.stop();
    }
    this.crossBoundaryTimer_ = null;

    if (this.crossBoundaryEventManager_) {
      this.crossBoundaryEventManager_.release();
      this.crossBoundaryEventManager_ = null;
    }

    const aborts = [];

    for (const state of this.mediaStates_.values()) {
      this.cancelUpdate_(state);
      aborts.push(this.abortOperations_(state));
      if (state.segmentPrefetch) {
        state.segmentPrefetch.clearAll();
        state.segmentPrefetch = null;
      }
    }
    for (const prefetch of this.audioPrefetchMap_.values()) {
      prefetch.clearAll();
    }

    await Promise.all(aborts);

    this.mediaStates_.clear();
    this.audioPrefetchMap_.clear();

    this.playerInterface_ = null;
    this.manifest_ = null;
    this.config_ = null;
    this.boundaryTime_ = null;
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

    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // disable audio segment prefetch if this is now set
    if (config.disableAudioPrefetch) {
      const state = this.mediaStates_.get(ContentType.AUDIO);
      if (state && state.segmentPrefetch) {
        state.segmentPrefetch.clearAll();
        state.segmentPrefetch = null;
      }

      for (const stream of this.audioPrefetchMap_.keys()) {
        const prefetch = this.audioPrefetchMap_.get(stream);
        prefetch.clearAll();
        this.audioPrefetchMap_.delete(stream);
      }
    }
    // disable text segment prefetch if this is now set
    if (config.disableTextPrefetch) {
      const state = this.mediaStates_.get(ContentType.TEXT);
      if (state && state.segmentPrefetch) {
        state.segmentPrefetch.clearAll();
        state.segmentPrefetch = null;
      }
    }

    // disable video segment prefetch if this is now set
    if (config.disableVideoPrefetch) {
      const state = this.mediaStates_.get(ContentType.VIDEO);
      if (state && state.segmentPrefetch) {
        state.segmentPrefetch.clearAll();
        state.segmentPrefetch = null;
      }
    }

    // Allow configuring the segment prefetch in middle of the playback.
    for (const type of this.mediaStates_.keys()) {
      const state = this.mediaStates_.get(type);
      if (state.segmentPrefetch) {
        state.segmentPrefetch.resetLimit(config.segmentPrefetchLimit);
        if (!(config.segmentPrefetchLimit > 0)) {
          // ResetLimit is still needed in this case,
          // to abort existing prefetch operations.
          state.segmentPrefetch.clearAll();
          state.segmentPrefetch = null;
        }
      } else if (config.segmentPrefetchLimit > 0) {
        state.segmentPrefetch = this.createSegmentPrefetch_(state.stream);
      }
    }

    if (!config.disableAudioPrefetch) {
      this.updatePrefetchMapForAudio_();
    }
  }


  /**
   * Applies a playback range. This will only affect non-live content.
   *
   * @param {number} playRangeStart
   * @param {number} playRangeEnd
   */
  applyPlayRange(playRangeStart, playRangeEnd) {
    if (!this.manifest_.presentationTimeline.isLive()) {
      this.playRangeStart_ = playRangeStart;
      this.playRangeEnd_ = playRangeEnd;
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
   * @param {!Map<number, shaka.media.SegmentPrefetch>=} segmentPrefetchById
   *   If provided, segments prefetched for these streams will be used as needed
   *   during playback.
   * @return {!Promise}
   */
  async start(segmentPrefetchById) {
    goog.asserts.assert(this.config_,
        'StreamingEngine configure() must be called before init()!');

    // Setup the initial set of Streams and then begin each update cycle.
    await this.initStreams_(segmentPrefetchById || (new Map()));
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
    this.textStreamSequenceId_++;
    const currentSequenceId = this.textStreamSequenceId_;

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
        mimeType, this.manifest_.sequenceMode, stream.external);

    const textDisplayer =
        this.playerInterface_.mediaSourceEngine.getTextDisplayer();
    const streamText =
        textDisplayer.isTextVisible() || this.config_.alwaysStreamText;

    if (streamText && (this.textStreamSequenceId_ == currentSequenceId)) {
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
      this.lastTextMediaStateBeforeUnload_ =
          this.mediaStates_.get(ContentType.TEXT);
      this.mediaStates_.delete(ContentType.TEXT);
      if (state.stream && state.stream.closeSegmentIndex) {
        state.stream.closeSegmentIndex();
      }
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

    this.updateSegmentIteratorReverse_();

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
  async switchTextStream(textStream) {
    this.lastTextMediaStateBeforeUnload_ = null;
    this.currentTextStream_ = textStream;

    if (!this.startupComplete_) {
      // The selected text stream will be used in start().
      return;
    }

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    goog.asserts.assert(textStream && textStream.type == ContentType.TEXT,
        'Wrong stream type passed to switchTextStream!');

    // In HLS it is possible that the mimetype changes when the media
    // playlist is downloaded, so it is necessary to have the updated data
    // here.
    if (!textStream.segmentIndex) {
      await textStream.createSegmentIndex();
    }

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
   * Handles deferred releases of old SegmentIndexes for the mediaState's
   * content type from a previous update.
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @private
   */
  handleDeferredCloseSegmentIndexes_(mediaState) {
    for (const [key, value] of this.deferredCloseSegmentIndex_.entries()) {
      const streamId = /** @type {string} */ (key);
      const closeSegmentIndex = /** @type {!function()} */ (value);
      if (streamId.includes(mediaState.type)) {
        closeSegmentIndex();
        this.deferredCloseSegmentIndex_.delete(streamId);
      }
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

    if (this.audioPrefetchMap_.has(stream)) {
      mediaState.segmentPrefetch = this.audioPrefetchMap_.get(stream);
    } else if (mediaState.segmentPrefetch) {
      mediaState.segmentPrefetch.switchStream(stream);
    }

    // We need compare the streams because we can use reloadTextStream but we
    // don't want download the init segment again because is still valid.
    if (stream.type == ContentType.TEXT && mediaState.stream != stream) {
      // Mime types are allowed to change for text streams.
      // Reinitialize the text parser, but only if we are going to fetch the
      // init segment again.
      const fullMimeType = shaka.util.MimeUtils.getFullType(
          stream.mimeType, stream.codecs);
      this.playerInterface_.mediaSourceEngine.reinitText(
          fullMimeType, this.manifest_.sequenceMode, stream.external);
    }

    // Releases the segmentIndex of the old stream.
    // Do not close segment indexes we are prefetching.
    if (!this.audioPrefetchMap_.has(mediaState.stream)) {
      if (mediaState.stream.closeSegmentIndex) {
        if (mediaState.performingUpdate) {
          const oldStreamTag =
              shaka.media.StreamingEngine.logPrefix_(mediaState);
          if (!this.deferredCloseSegmentIndex_.has(oldStreamTag)) {
            // The ongoing update is still using the old stream's segment
            // reference information.
            // If we close the old stream now, the update will not complete
            // correctly.
            // The next onUpdate_() for this content type will resume the
            // closeSegmentIndex() operation for the old stream once the ongoing
            // update has finished, then immediately create a new segment index.
            this.deferredCloseSegmentIndex_.set(
                oldStreamTag, mediaState.stream.closeSegmentIndex);
          }
        } else {
          mediaState.stream.closeSegmentIndex();
        }
      }
    }

    const switchingMuxedAndAlternateAudio =
        mediaState.stream.isAudioMuxedInVideo != stream.isAudioMuxedInVideo;

    mediaState.stream = stream;
    mediaState.segmentIterator = null;
    mediaState.adaptation = !!adaptation;
    if (stream.dependencyStream) {
      mediaState.dependencyMediaState =
          this.createMediaState_(stream.dependencyStream);
    } else {
      mediaState.dependencyMediaState = null;
    }

    this.setupCrossBoundaryListeners_();

    const streamTag = shaka.media.StreamingEngine.logPrefix_(mediaState);
    shaka.log.debug('switch: switching to Stream ' + streamTag);

    if (switchingMuxedAndAlternateAudio) {
      // Then clear our cache of the last init segment, since MSE will be
      // reloaded and no init segment will be there post-reload.
      mediaState.lastInitSegmentReference = null;
      // Clear cache of append window start and end, since they will need
      // to be reapplied post-reload by streaming engine.
      mediaState.lastAppendWindowStart = null;
      mediaState.lastAppendWindowEnd = null;

      if (stream.isAudioMuxedInVideo) {
        let otherState = null;
        if (mediaState.type === ContentType.VIDEO) {
          otherState = this.mediaStates_.get(ContentType.AUDIO);
        } else if (mediaState.type === ContentType.AUDIO) {
          otherState = this.mediaStates_.get(ContentType.VIDEO);
        }
        if (otherState) {
          // First, abort all operations in progress on the other stream.
          this.abortOperations_(otherState).catch(() => {});
          // Then clear our cache of the last init segment, since MSE will be
          // reloaded and no init segment will be there post-reload.
          otherState.lastInitSegmentReference = null;
          // Clear cache of append window start and end, since they will need
          // to be reapplied post-reload by streaming engine.
          otherState.lastAppendWindowStart = null;
          otherState.lastAppendWindowEnd = null;
          // Now force the existing buffer to be cleared.  It is not necessary
          // to perform the MSE clear operation, but this has the side-effect
          // that our state for that stream will then match MSE's post-reload
          // state.
          this.forceClearBuffer_(otherState);

          this.makeAbortDecision_(otherState).catch((error) => {
            if (this.playerInterface_) {
              goog.asserts.assert(error instanceof shaka.util.Error,
                  'Wrong error type!');
              this.playerInterface_.onError(error);
            }
          });
        }
      }
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
        this.clearBuffer_(mediaState, /* flush= */ true, safeMargin)
            .catch((error) => {
              if (this.playerInterface_) {
                goog.asserts.assert(error instanceof shaka.util.Error,
                    'Wrong error type!');
                this.playerInterface_.onError(error);
              }
            });
      }
    } else {
      if (!mediaState.performingUpdate && !mediaState.updateTimer) {
        this.scheduleUpdate_(mediaState, 0);
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

    const dependencyStream = originalStream.dependencyStream;
    if (dependencyStream && !dependencyStream.segmentIndex) {
      await dependencyStream.createSegmentIndex();
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
    const safetyBuffer = this.config_.rebufferingGoal;
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

      if (!this.crossBoundarySeek_ && !newTimeIsBuffered(type)) {
        this.lastMediaSourceReset_ = 0;
        if (mediaState.segmentPrefetch) {
          mediaState.segmentPrefetch.resetPosition();
        }
        if (mediaState.type === ContentType.AUDIO) {
          for (const prefetch of this.audioPrefetchMap_.values()) {
            prefetch.resetPosition();
          }
        }
        mediaState.segmentIterator = null;
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

      if (this.crossBoundarySeek_ && !mediaState.clearingBuffer &&
          !mediaState.performingUpdate && !mediaState.updateTimer) {
        this.scheduleUpdate_(mediaState, 0);
      }
    }

    if (this.shouldUseCrossBoundaryLogic_()) {
      // We might have seeked near a boundary, forward time in case MSE does not
      // recover due to segment misalignment near the boundary.
      this.forwardTimeForCrossBoundary_();
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
   * @param {!Map<number, shaka.media.SegmentPrefetch>} segmentPrefetchById
   * @return {!Promise}
   * @private
   */
  async initStreams_(segmentPrefetchById) {
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
     * @type {!Map<shaka.util.ManifestParserUtils.ContentType,
     *              shaka.extern.Stream>}
     */
    const streamsByType = this.getStreamsByType_(/* includeText= */ true);

    // Init MediaSourceEngine.
    const mediaSourceEngine = this.playerInterface_.mediaSourceEngine;

    await mediaSourceEngine.init(streamsByType,
        this.manifest_.sequenceMode,
        this.manifest_.type,
        this.manifest_.ignoreManifestTimestampsInSegmentsMode,
    );
    this.destroyer_.ensureNotDestroyed();

    this.updateDuration();

    for (const type of streamsByType.keys()) {
      const stream = streamsByType.get(type);
      if (!this.mediaStates_.has(type)) {
        const mediaState = this.createMediaState_(stream);
        if (segmentPrefetchById.has(stream.id)) {
          const segmentPrefetch = segmentPrefetchById.get(stream.id);
          segmentPrefetch.replaceFetchDispatcher(
              (reference, stream, streamDataCallback) => {
                return this.dispatchFetch_(
                    reference, stream, streamDataCallback);
              });
          mediaState.segmentPrefetch = segmentPrefetch;
        }
        this.mediaStates_.set(type, mediaState);
        this.scheduleUpdate_(mediaState, 0);
      }
    }

    this.setupCrossBoundaryListeners_();
  }


  /**
   * Creates a media state.
   *
   * @param {shaka.extern.Stream} stream
   * @return {shaka.media.StreamingEngine.MediaState_}
   * @private
   */
  createMediaState_(stream) {
    /** @type {!shaka.media.StreamingEngine.MediaState_} */
    const mediaState = {
      stream,
      type: /** @type {shaka.util.ManifestParserUtils.ContentType} */(
        stream.type),
      segmentIterator: null,
      segmentPrefetch: this.createSegmentPrefetch_(stream),
      lastSegmentReference: null,
      lastInitSegmentReference: null,
      lastTimestampOffset: null,
      lastAppendWindowStart: null,
      lastAppendWindowEnd: null,
      lastCodecs: null,
      lastMimeType: null,
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
      adaptation: false,
      recovering: false,
      hasError: false,
      operation: null,
      dependencyMediaState: null,
    };
    if (stream.dependencyStream) {
      mediaState.dependencyMediaState =
          this.createMediaState_(stream.dependencyStream);
    }
    return mediaState;
  }

  /**
   * Creates a media state.
   *
   * @param {shaka.extern.Stream} stream
   * @return {shaka.media.SegmentPrefetch | null}
   * @private
   */
  createSegmentPrefetch_(stream) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (stream.type === ContentType.VIDEO &&
        this.config_.disableVideoPrefetch) {
      return null;
    }
    if (stream.type === ContentType.AUDIO &&
        this.config_.disableAudioPrefetch) {
      return null;
    }
    const MimeUtils = shaka.util.MimeUtils;
    const CEA608_MIME = MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE;
    const CEA708_MIME = MimeUtils.CEA708_CLOSED_CAPTION_MIMETYPE;
    if (stream.type === ContentType.TEXT &&
        (stream.mimeType == CEA608_MIME || stream.mimeType == CEA708_MIME)) {
      return null;
    }
    if (stream.type === ContentType.TEXT &&
        this.config_.disableTextPrefetch) {
      return null;
    }
    if (this.audioPrefetchMap_.has(stream)) {
      return this.audioPrefetchMap_.get(stream);
    }
    const type = /** @type {!shaka.util.ManifestParserUtils.ContentType} */
        (stream.type);
    const mediaState = this.mediaStates_.get(type);
    const currentSegmentPrefetch = mediaState && mediaState.segmentPrefetch;
    if (currentSegmentPrefetch &&
      stream === currentSegmentPrefetch.getStream()) {
      return currentSegmentPrefetch;
    }
    if (this.config_.segmentPrefetchLimit > 0) {
      const reverse = this.playerInterface_.getPlaybackRate() < 0;
      return new shaka.media.SegmentPrefetch(
          this.config_.segmentPrefetchLimit,
          stream,
          (reference, stream, streamDataCallback) => {
            return this.dispatchFetch_(reference, stream, streamDataCallback);
          },
          reverse,
          this.playerInterface_.shouldPrefetchNextSegment);
    }
    return null;
  }

  /**
   * Populates the prefetch map depending on the configuration
   * @private
   */
  updatePrefetchMapForAudio_() {
    const prefetchLimit = this.config_.segmentPrefetchLimit;
    const prefetchLanguages = this.config_.prefetchAudioLanguages;
    const LanguageUtils = shaka.util.LanguageUtils;

    for (const variant of this.manifest_.variants) {
      if (!variant.audio) {
        continue;
      }

      if (this.audioPrefetchMap_.has(variant.audio)) {
        // if we already have a segment prefetch,
        // update it's prefetch limit and if the new limit isn't positive,
        // remove the segment prefetch from our prefetch map.
        const prefetch = this.audioPrefetchMap_.get(variant.audio);
        prefetch.resetLimit(prefetchLimit);
        if (!(prefetchLimit > 0) ||
            !prefetchLanguages.some(
                (lang) => LanguageUtils.areLanguageCompatible(
                    variant.audio.language, lang))
        ) {
          const type = /** @type {!shaka.util.ManifestParserUtils.ContentType}*/
            (variant.audio.type);
          const mediaState = this.mediaStates_.get(type);
          const currentSegmentPrefetch = mediaState &&
              mediaState.segmentPrefetch;
          // if this prefetch isn't the current one, we want to clear it
          if (prefetch !== currentSegmentPrefetch) {
            prefetch.clearAll();
          }
          this.audioPrefetchMap_.delete(variant.audio);
        }
        continue;
      }

      // don't try to create a new segment prefetch if the limit isn't positive.
      if (prefetchLimit <= 0) {
        continue;
      }

      // only create a segment prefetch if its language is configured
      // to be prefetched
      if (!prefetchLanguages.some(
          (lang) => LanguageUtils.areLanguageCompatible(
              variant.audio.language, lang))) {
        continue;
      }

      // use the helper to create a segment prefetch to ensure that existing
      // objects are reused.
      const segmentPrefetch = this.createSegmentPrefetch_(variant.audio);

      // if a segment prefetch wasn't created, skip the rest
      if (!segmentPrefetch) {
        continue;
      }

      if (!variant.audio.segmentIndex) {
        variant.audio.createSegmentIndex();
      }

      this.audioPrefetchMap_.set(variant.audio, segmentPrefetch);
    }
  }

  /**
   * Sets the MediaSource's duration.
   */
  updateDuration() {
    const isInfiniteLiveStreamDurationSupported =
        shaka.media.Capabilities.isInfiniteLiveStreamDurationSupported();
    const duration = this.manifest_.presentationTimeline.getDuration();
    if (duration < Infinity) {
      if (isInfiniteLiveStreamDurationSupported) {
        if (this.updateLiveSeekableRangeTimer_) {
          this.updateLiveSeekableRangeTimer_.stop();
        }
        this.playerInterface_.mediaSourceEngine.clearLiveSeekableRange();
      }
      this.playerInterface_.mediaSourceEngine.setDuration(duration);
    } else {
      // Set the media source live duration as Infinity if the platform supports
      // it.
      if (isInfiniteLiveStreamDurationSupported) {
        if (this.updateLiveSeekableRangeTimer_) {
          this.updateLiveSeekableRangeTimer_.tickEvery(/* seconds= */ 0.5);
        }
        this.playerInterface_.mediaSourceEngine.setDuration(Infinity);
      } else {
        // Not all platforms support infinite durations, so set a finite
        // duration so we can append segments and so the user agent can seek.
        this.playerInterface_.mediaSourceEngine.setDuration(Math.pow(2, 32));
      }
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

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
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

    // If stream switches happened during the previous update_() for this
    // content type, close out the old streams that were switched away from.
    // Even if we had switched away from the active stream 'A' during the
    // update_(), e.g. (A -> B -> A), closing 'A' is permissible here since we
    // will immediately re-create it in the logic below.
    this.handleDeferredCloseSegmentIndexes_(mediaState);

    // Make sure the segment index exists. If not, create the segment index.
    if (!mediaState.stream.segmentIndex) {
      const thisStream = mediaState.stream;

      try {
        await mediaState.stream.createSegmentIndex();
      } catch (error) {
        await this.handleStreamingError_(mediaState, error);
        return;
      }

      if (thisStream != mediaState.stream) {
        // We switched streams while in the middle of this async call to
        // createSegmentIndex.  Abandon this update and schedule a new one if
        // there's not already one pending.
        // Releases the segmentIndex of the old stream.
        if (thisStream.closeSegmentIndex) {
          goog.asserts.assert(!mediaState.stream.segmentIndex,
              'mediaState.stream should not have segmentIndex yet.');
          thisStream.closeSegmentIndex();
        }
        if (!mediaState.performingUpdate && !mediaState.updateTimer) {
          this.scheduleUpdate_(mediaState, 0);
        }
        return;
      }
    }

    // If the stream has a dependency, make sure its segment index exists.
    if (mediaState.dependencyMediaState) {
      if (!mediaState.dependencyMediaState.stream.segmentIndex) {
        try {
          await mediaState.dependencyMediaState.stream.createSegmentIndex();
        } catch (error) {
          shaka.log.warning(
              'Could not create segment index for dependency', error);
        }
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
      await this.handleStreamingError_(mediaState, error);
      return;
    }

    if (mediaState.type === ContentType.TEXT) {
      // MSE endOfStream() closes MediaSource, not TextEngine, so skip here.
      return;
    }
    const mediaStates = [mediaState];
    const otherType = mediaState.type === ContentType.AUDIO ?
        ContentType.VIDEO : ContentType.AUDIO;
    const otherMediaState = this.mediaStates_.get(otherType);
    if (otherMediaState) {
      mediaStates.push(otherMediaState);
    }

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

    // Do not schedule update for closed captions text mediaState, since closed
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

    // Only skip audio streams when audio is muxed in video.
    // Video streams with muxed audio should still be processed.
    if (mediaState.stream.isAudioMuxedInVideo &&
        mediaState.type == ContentType.AUDIO) {
      return null;
    }

    // Errors can sometimes cause the media state to become closed on Safari.
    // Recover from this by scheduling a reset.
    if (mediaState.type != ContentType.TEXT &&
        this.playerInterface_.mediaSourceEngine.closed()) {
      this.resetMediaSource(/* force= */ true);
      return null;
    }

    // Update updateIntervalSeconds according to our current playbackrate,
    // and always considering a minimum of 1.
    const updateIntervalSeconds = this.config_.updateIntervalSeconds /
        Math.max(1, Math.abs(this.playerInterface_.getPlaybackRate()));

    if (!this.playerInterface_.mediaSourceEngine.isStreamingAllowed() &&
        mediaState.type != ContentType.TEXT) {
      // It is not allowed to add segments yet, so we schedule an update to
      // check again later. So any prediction we make now could be terribly
      // invalid soon.
      return updateIntervalSeconds / 2;
    }

    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    // Compute how far we've buffered ahead of the playhead.
    const presentationTime = this.playerInterface_.getPresentationTime();

    if (mediaState.type === ContentType.AUDIO) {
      // evict all prefetched segments that are before the presentationTime
      for (const stream of this.audioPrefetchMap_.keys()) {
        const prefetch = this.audioPrefetchMap_.get(stream);
        prefetch.evict(presentationTime, /* clearInitSegments= */ true);
        prefetch.prefetchSegmentsByTime(presentationTime);
      }
    }

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
        this.config_.rebufferingGoal, this.config_.bufferingGoal);

    const scaledBufferingGoal = Math.max(1,
        unscaledBufferingGoal * this.bufferingScale_);

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
      // configuration (seconds).
      return updateIntervalSeconds / 2;
    }

    // Lack of segment iterator is the best indicator stream has changed.
    const streamChanged = !mediaState.segmentIterator;
    const reference = this.getSegmentReferenceNeeded_(
        mediaState, presentationTime, bufferEnd);
    if (!reference) {
      // The segment could not be found, does not exist, or is not available.
      // In any case just try again... if the manifest is incomplete or is not
      // being updated then we'll idle forever; otherwise, we'll end up getting
      // a SegmentReference eventually.
      return updateIntervalSeconds;
    }

    // Update some values mid stream for the initSegmentReference.
    const lastInitSegRef = mediaState.lastInitSegmentReference;
    const initSegRef = reference.initSegmentReference;
    if (lastInitSegRef && initSegRef &&
        shaka.media.InitSegmentReference.equal(initSegRef, lastInitSegRef)
    ) {
      // During live, the boundaryEnd of the last period as we do not know the
      // full duration. When live to VOD, we suddenly do know.
      // Make sure we update the boundaryEnd or else we'll discard the
      // segments due to a mismatch.
      lastInitSegRef.boundaryEnd = initSegRef.boundaryEnd;
    }

    // Get media state adaptation and reset this value. By guarding it during
    // actual stream change we ensure it won't be cleaned by accident on regular
    // append.
    let adaptation = false;
    if (streamChanged && mediaState.adaptation) {
      adaptation = true;
      mediaState.adaptation = false;
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
      return updateIntervalSeconds;
    }

    if (mediaState.segmentPrefetch && mediaState.segmentIterator &&
        !this.audioPrefetchMap_.has(mediaState.stream)) {
      // This will prevent duplicate segments from being downloaded when we
      // are close to the live edge.
      const fudgeTime = 0.001;
      mediaState.segmentPrefetch.evict(reference.startTime + fudgeTime);
      mediaState.segmentPrefetch.prefetchSegmentsByTime(reference.startTime)
          // We're treating this call as sync here, so ignore async errors
          // to not propagate them further.
          .catch(() => {});
    }

    if (this.shouldUseCrossBoundaryLogic_() &&
        this.discardReferenceByBoundary_(mediaState, reference)) {
      // Return null as we do not want to fetch and append segments outside
      // of the current boundary.
      return null;
    }

    const p = this.fetchAndAppend_(mediaState, presentationTime, reference,
        adaptation);
    p.catch(() => {});  // TODO(#1993): Handle asynchronous errors.
    if (mediaState.dependencyMediaState) {
      this.fetchAndAppendDependency_(
          mediaState.dependencyMediaState, presentationTime,
          scaledBufferingGoal);
    }
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
      let ref = mediaState.segmentIterator.current();
      if (ref && mediaState.lastSegmentReference) {
        // In HLS sometimes the segment iterator adds or removes segments very
        // quickly, so we have to be sure that we do not add the last segment
        // again, tolerating a difference of 1ms.
        const isDiffNegligible = (a, b) => Math.abs(a - b) < 0.001;
        const lastStartTime = mediaState.lastSegmentReference.startTime;
        if (isDiffNegligible(lastStartTime, ref.startTime)) {
          ref = mediaState.segmentIterator.next().value;
        }
      }
      return ref;
    } else if (mediaState.lastSegmentReference || bufferEnd) {
      // Something is buffered from another Stream.
      const time = mediaState.lastSegmentReference ?
          mediaState.lastSegmentReference.endTime :
          bufferEnd;
      goog.asserts.assert(time != null, 'Should have a time to search');
      shaka.log.v1(
          logPrefix, 'looking up segment from new stream endTime:', time);

      const reverse = this.playerInterface_.getPlaybackRate() < 0;
      if (mediaState.stream.segmentIndex) {
        mediaState.segmentIterator =
            mediaState.stream.segmentIndex.getIteratorForTime(
                time, /* allowNonIndependent= */ false, reverse);
      }
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
      const inaccurateTolerance =
          (this.manifest_.sequenceMode || this.shouldUseCrossBoundaryLogic_()) ?
          0 : this.config_.inaccurateManifestTolerance;
      const lookupTime = Math.max(presentationTime - inaccurateTolerance, 0);

      shaka.log.v1(logPrefix, 'looking up segment',
          'lookupTime:', lookupTime,
          'presentationTime:', presentationTime);

      const reverse = this.playerInterface_.getPlaybackRate() < 0;
      let ref = null;
      if (inaccurateTolerance) {
        if (mediaState.stream.segmentIndex) {
          mediaState.segmentIterator =
              mediaState.stream.segmentIndex.getIteratorForTime(
                  lookupTime, /* allowNonIndependent= */ false, reverse);
        }
        ref = mediaState.segmentIterator &&
            mediaState.segmentIterator.next().value;
      }
      if (!ref) {
        // If we can't find a valid segment with the drifted time, look for a
        // segment with the presentation time.
        if (mediaState.stream.segmentIndex) {
          mediaState.segmentIterator =
              mediaState.stream.segmentIndex.getIteratorForTime(
                  presentationTime, /* allowNonIndependent= */ false, reverse);
        }
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
   * @param {boolean} adaptation
   * @private
   */
  async fetchAndAppend_(mediaState, presentationTime, reference, adaptation) {
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
      await this.initSourceBuffer_(mediaState, reference, adaptation);
      this.destroyer_.ensureNotDestroyed();
      if (this.fatalError_) {
        return;
      }

      shaka.log.v2(logPrefix, 'fetching segment');
      const isMP4 = stream.mimeType == 'video/mp4' ||
              stream.mimeType == 'audio/mp4';
      const isReadableStreamSupported = window.ReadableStream;
      const lowLatencyMode = this.config_.lowLatencyMode &&
          this.manifest_.isLowLatency;
      // Enable MP4 low latency streaming with ReadableStream chunked data.
      // And only for DASH and HLS with byterange optimization.
      if (lowLatencyMode && isReadableStreamSupported && isMP4 &&
          (this.manifest_.type != shaka.media.ManifestParser.HLS ||
          reference.hasByterangeOptimization())) {
        let remaining = new Uint8Array(0);
        let processingResult = false;
        let callbackCalled = false;
        let streamDataCallbackError;
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
          try {
            // Append the data with complete boxes.
            // Every time streamDataCallback gets called, append the new data
            // to the remaining data.
            // Find the last fully completed Mdat box, and slice the data into
            // two parts: the first part with completed Mdat boxes, and the
            // second part with an incomplete box.
            // Append the first part, and save the second part as remaining
            // data, and handle it with the next streamDataCallback call.
            remaining = shaka.util.Uint8ArrayUtils.concat(remaining, data);
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
                  mediaState, presentationTime, stream, reference, dataToAppend,
                  /* isChunkedData= */ true, adaptation);

              if (mediaState.segmentPrefetch && mediaState.segmentIterator) {
                mediaState.segmentPrefetch.prefetchSegmentsByTime(
                    reference.startTime, /* skipFirst= */ true);
              }
            }
          } catch (error) {
            streamDataCallbackError = error;
          }
        };

        const result =
            await this.fetch_(mediaState, reference, streamDataCallback);
        if (streamDataCallbackError) {
          throw streamDataCallbackError;
        }
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

          await this.append_(mediaState, presentationTime, stream, reference,
              result, /* chunkedData= */ false, adaptation);
        }

        if (mediaState.segmentPrefetch && mediaState.segmentIterator) {
          mediaState.segmentPrefetch.prefetchSegmentsByTime(
              reference.startTime, /* skipFirst= */ true);
        }
      } else {
        if (lowLatencyMode && !isReadableStreamSupported) {
          shaka.log.warning('Low latency streaming mode is enabled, but ' +
            'ReadableStream is not supported by the browser.');
        }
        const fetchSegment = this.fetch_(mediaState, reference);
        const result = await fetchSegment;
        this.destroyer_.ensureNotDestroyed();
        if (this.fatalError_) {
          return;
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

        await this.append_(mediaState, presentationTime, stream, reference,
            result, /* chunkedData= */ false, adaptation);
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
        let otherState = null;
        if (mediaState.type === ContentType.VIDEO) {
          otherState = this.mediaStates_.get(ContentType.AUDIO);
        } else if (mediaState.type === ContentType.AUDIO) {
          otherState = this.mediaStates_.get(ContentType.VIDEO);
        }
        if (otherState && otherState.type == ContentType.AUDIO) {
          this.playerInterface_.onSegmentAppended(reference, mediaState.stream,
              otherState.stream.isAudioMuxedInVideo);
        } else {
          this.playerInterface_.onSegmentAppended(reference, mediaState.stream,
              mediaState.stream.codecs.includes(','));
        }
      }

      // Cancel the update timer, if any.
      this.cancelUpdate_(mediaState);
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
        await this.handleQuotaExceeded_(mediaState, error);
      } else {
        shaka.log.error(logPrefix, 'failed fetch and append: code=' +
            error.code);
        mediaState.hasError = true;

        if (error.category == shaka.util.Error.Category.NETWORK &&
            mediaState.segmentPrefetch) {
          mediaState.segmentPrefetch.removeReference(reference);
        }

        error.severity = shaka.util.Error.Severity.CRITICAL;
        await this.handleStreamingError_(mediaState, error);
      }
    }
  }


  /**
   * Fetches and appends a dependency media state
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} segmentTime
   * @param {number} bufferingGoal
   * @private
   */
  async fetchAndAppendDependency_(mediaState, segmentTime, bufferingGoal) {
    const dependencyStream = mediaState.stream;
    const segmentIndex = dependencyStream.segmentIndex;
    const iterator =
        segmentIndex && segmentIndex.getIteratorForTime(segmentTime);
    let reference = iterator && iterator.next().value;

    // If the reference has already been requested, advance to the next one
    // to avoid requesting the same segment multiple times
    while (reference && this.requestedDependencySegments_.includes(
        reference.startTime)) {
      reference = iterator && iterator.next().value;
    }

    if (reference) {
      const initSegmentReference = reference.initSegmentReference;
      if (initSegmentReference && !shaka.media.InitSegmentReference.equal(
          initSegmentReference, mediaState.lastInitSegmentReference)) {
        mediaState.lastInitSegmentReference = initSegmentReference;
        try {
          const init = await this.fetch_(mediaState, initSegmentReference);
          this.playerInterface_.mediaSourceEngine.appendDependency(
              init, 0, dependencyStream);
          this.requestedDependencySegments_ = [];
        } catch (e) {
          mediaState.lastInitSegmentReference = null;
          throw e;
        }
      }
      if (!mediaState.lastSegmentReference ||
          mediaState.lastSegmentReference != reference) {
        mediaState.lastSegmentReference = reference;
        try {
          const result = await this.fetch_(mediaState, reference);
          this.playerInterface_.mediaSourceEngine.appendDependency(
              result, 0, dependencyStream);
          this.requestedDependencySegments_.push(reference.startTime);
        } catch (e) {
          mediaState.lastSegmentReference = null;
          throw e;
        }

        const newestRequestedSegment =
            Math.max(0, ...this.requestedDependencySegments_);
        const presentationTime = this.playerInterface_.getPresentationTime();

        // Prefetch dependency segments if the segments we have buffered so far
        // are behind the buffering goal
        if (presentationTime + bufferingGoal > newestRequestedSegment) {
          await this.fetchAndAppendDependency_(mediaState, reference.startTime,
              bufferingGoal);
        }
      }
    }
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
   * Handles a QUOTA_EXCEEDED_ERROR.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {!shaka.util.Error} error
   * @return {!Promise}
   * @private
   */
  async handleQuotaExceeded_(mediaState, error) {
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
      const maxDisabledTime = this.getDisabledTime_(error);
      if (maxDisabledTime) {
        shaka.log.debug(logPrefix, 'Disabling stream due to quota', error);
      }
      const handled = this.playerInterface_.disableStream(
          mediaState.stream, maxDisabledTime);
      if (handled) {
        return;
      }
      if (this.config_.avoidEvictionOnQuotaExceededError) {
        // QuotaExceededError gets thrown if eviction didn't help to make room
        // for a segment. We want to wait for a while (4 seconds is just an
        // arbitrary number) before updating to give the playhead a chance to
        // advance, so we don't immediately throw again.
        this.scheduleUpdate_(mediaState, 4);
        return;
      }
      // Reduction schedule: 80%, 60%, 40%, 20%, 16%, 12%, 8%, 4%, fail.
      // Note: percentages are used for comparisons to avoid rounding errors.
      const percentBefore = Math.round(100 * this.bufferingScale_);
      if (percentBefore > 20) {
        this.bufferingScale_ -= 0.2;
      } else if (percentBefore > 4) {
        this.bufferingScale_ -= 0.04;
      } else {
        shaka.log.error(
            logPrefix, 'MediaSource threw QuotaExceededError too many times');
        mediaState.hasError = true;
        this.fatalError_ = true;
        this.playerInterface_.onError(error);
        return;
      }
      const percentAfter = Math.round(100 * this.bufferingScale_);
      shaka.log.warning(
          logPrefix,
          'MediaSource threw QuotaExceededError:',
          'reducing buffering goals by ' + (100 - percentAfter) + '%');
      mediaState.recovering = true;
      const presentationTime = this.playerInterface_.getPresentationTime();
      await this.evict_(mediaState, presentationTime);
    } else {
      shaka.log.debug(
          logPrefix,
          'MediaSource threw QuotaExceededError:',
          'waiting for another stream to recover...');
    }

    // QuotaExceededError gets thrown if eviction didn't help to make room
    // for a segment. We want to wait for a while (4 seconds is just an
    // arbitrary number) before updating to give the playhead a chance to
    // advance, so we don't immediately throw again.
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
   * @param {boolean} adaptation
   * @return {!Promise}
   * @private
   */
  async initSourceBuffer_(mediaState, reference, adaptation) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MimeUtils = shaka.util.MimeUtils;
    const StreamingEngine = shaka.media.StreamingEngine;
    const logPrefix = StreamingEngine.logPrefix_(mediaState);
    const nullLastReferences = mediaState.lastSegmentReference == null;

    /** @type {!Array<!Promise>} */
    const operations = [];

    // Rounding issues can cause us to remove the first frame of a Period, so
    // reduce the window start time slightly.
    const appendWindowStart = Math.max(0,
        Math.max(reference.appendWindowStart, this.playRangeStart_) -
        StreamingEngine.APPEND_WINDOW_START_FUDGE_);
    const appendWindowEnd =
        Math.min(reference.appendWindowEnd, this.playRangeEnd_) +
        StreamingEngine.APPEND_WINDOW_END_FUDGE_;

    goog.asserts.assert(
        reference.startTime <= appendWindowEnd,
        logPrefix + ' segment should start before append window end');

    const fullCodecs = (reference.codecs || mediaState.stream.codecs);
    const codecs = MimeUtils.getCodecBase(fullCodecs);
    const mimeType = MimeUtils.getBasicType(
        reference.mimeType || mediaState.stream.mimeType);
    const timestampOffset = reference.timestampOffset;
    if (timestampOffset != mediaState.lastTimestampOffset ||
        appendWindowStart != mediaState.lastAppendWindowStart ||
        appendWindowEnd != mediaState.lastAppendWindowEnd ||
        codecs != mediaState.lastCodecs ||
        mimeType != mediaState.lastMimeType) {
      shaka.log.v1(logPrefix, 'setting timestamp offset to ' + timestampOffset);
      shaka.log.v1(logPrefix,
          'setting append window start to ' + appendWindowStart);
      shaka.log.v1(logPrefix,
          'setting append window end to ' + appendWindowEnd);

      const isResetMediaSourceNecessary =
          mediaState.lastCodecs && mediaState.lastMimeType &&
          this.playerInterface_.mediaSourceEngine.isResetMediaSourceNecessary(
              mediaState.type, mimeType, fullCodecs, this.getStreamsByType_());
      if (isResetMediaSourceNecessary) {
        let otherState = null;
        if (mediaState.type === ContentType.VIDEO) {
          otherState = this.mediaStates_.get(ContentType.AUDIO);
        } else if (mediaState.type === ContentType.AUDIO) {
          otherState = this.mediaStates_.get(ContentType.VIDEO);
        }
        if (otherState) {
          // First, abort all operations in progress on the other stream.
          await this.abortOperations_(otherState).catch(() => {});
          // Then clear our cache of the last init segment, since MSE will be
          // reloaded and no init segment will be there post-reload.
          otherState.lastInitSegmentReference = null;
          // Clear cache of append window start and end, since they will need
          // to be reapplied post-reload by streaming engine.
          otherState.lastAppendWindowStart = null;
          otherState.lastAppendWindowEnd = null;
          // Now force the existing buffer to be cleared.  It is not necessary
          // to perform the MSE clear operation, but this has the side-effect
          // that our state for that stream will then match MSE's post-reload
          // state.
          this.forceClearBuffer_(otherState);
        }
      }

      // Dispatching init asynchronously causes the sourceBuffers in
      // the MediaSourceEngine to become detached do to race conditions
      // with mediaSource and sourceBuffers being created simultaneously.
      await this.setProperties_(mediaState, timestampOffset, appendWindowStart,
          appendWindowEnd, reference, codecs, mimeType);
    }

    if (!shaka.media.InitSegmentReference.equal(
        reference.initSegmentReference, mediaState.lastInitSegmentReference)) {
      mediaState.lastInitSegmentReference = reference.initSegmentReference;

      if (reference.isIndependent() && reference.initSegmentReference) {
        shaka.log.v1(logPrefix, 'fetching init segment');

        const fetchInit =
            this.fetch_(mediaState, reference.initSegmentReference);
        const append = async () => {
          try {
            const initSegment = await fetchInit;
            this.destroyer_.ensureNotDestroyed();

            let lastTimescale = null;
            const timescaleMap = new Map();

            /** @type {!shaka.extern.SpatialVideoInfo} */
            const spatialVideoInfo = {
              projection: null,
              hfov: null,
            };

            if (mediaState.stream) {
              const videoLayout = mediaState.stream.videoLayout;
              if (videoLayout) {
                const layouts = videoLayout.split('/');
                if (layouts.includes('PROJ-RECT')) {
                  spatialVideoInfo.projection = 'rect';
                } else if (layouts.includes('PROJ-EQUI')) {
                  spatialVideoInfo.projection = 'equi';
                } else if (layouts.includes('PROJ-HEQU')) {
                  spatialVideoInfo.projection = 'hequ';
                } else if (layouts.includes('PROJ-PRIM')) {
                  spatialVideoInfo.projection = 'prim';
                } else if (layouts.includes('PROJ-AIV')) {
                  spatialVideoInfo.projection = 'hequ';
                }
              }
            }

            const parser = new shaka.util.Mp4Parser();
            const Mp4Parser = shaka.util.Mp4Parser;
            const Mp4BoxParsers = shaka.util.Mp4BoxParsers;
            parser.box('moov', Mp4Parser.children)
                .box('trak', Mp4Parser.children)
                .box('mdia', Mp4Parser.children)
                .fullBox('mdhd', (box) => {
                  goog.asserts.assert(
                      box.version != null,
                      'MDHD is a full box and should have a valid version.');
                  const parsedMDHDBox = Mp4BoxParsers.parseMDHD(
                      box.reader, box.version);
                  lastTimescale = parsedMDHDBox.timescale;
                })
                .box('hdlr', (box) => {
                  const parsedHDLR = Mp4BoxParsers.parseHDLR(box.reader);
                  switch (parsedHDLR.handlerType) {
                    case 'soun':
                      timescaleMap.set(ContentType.AUDIO, lastTimescale);
                      break;
                    case 'vide':
                      timescaleMap.set(ContentType.VIDEO, lastTimescale);
                      break;
                  }
                  lastTimescale = null;
                });
            if (mediaState.type === ContentType.VIDEO &&
                !spatialVideoInfo.projection) {
              parser.box('minf', Mp4Parser.children)
                  .box('stbl', Mp4Parser.children)
                  .fullBox('stsd', Mp4Parser.sampleDescription)
                  .box('encv', Mp4Parser.visualSampleEntry)
                  .box('avc1', Mp4Parser.visualSampleEntry)
                  .box('avc3', Mp4Parser.visualSampleEntry)
                  .box('hev1', Mp4Parser.visualSampleEntry)
                  .box('hvc1', Mp4Parser.visualSampleEntry)
                  .box('dvav', Mp4Parser.visualSampleEntry)
                  .box('dva1', Mp4Parser.visualSampleEntry)
                  .box('dvh1', Mp4Parser.visualSampleEntry)
                  .box('dvhe', Mp4Parser.visualSampleEntry)
                  .box('dvc1', Mp4Parser.visualSampleEntry)
                  .box('dvi1', Mp4Parser.visualSampleEntry)
                  .box('vexu', Mp4Parser.children)
                  .box('proj', Mp4Parser.children)
                  .fullBox('prji', (box) => {
                    const parsedPRJIBox = Mp4BoxParsers.parsePRJI(box.reader);
                    spatialVideoInfo.projection = parsedPRJIBox.projection;
                  })
                  .box('hfov', (box) => {
                    const parsedHFOVBox = Mp4BoxParsers.parseHFOV(box.reader);
                    spatialVideoInfo.hfov = parsedHFOVBox.hfov;
                  });
            }
            parser.parse(initSegment,
                /* partialOkay= */ true, /* stopOnPartial= */ true);

            if (mediaState.type === ContentType.VIDEO) {
              this.updateSpatialVideoInfo_(spatialVideoInfo);
            }

            if (timescaleMap.has(mediaState.type)) {
              reference.initSegmentReference.timescale =
                  timescaleMap.get(mediaState.type);
            } else if (lastTimescale != null) {
              // Fallback for segments without HDLR box
              reference.initSegmentReference.timescale = lastTimescale;
            }

            const segmentIndex = mediaState.stream.segmentIndex;
            let continuityTimeline;
            if (segmentIndex instanceof shaka.media.MetaSegmentIndex) {
              continuityTimeline = segmentIndex.getTimelineForTime(
                  reference.startTime);
            }
            shaka.log.v1(logPrefix, 'appending init segment');
            const hasClosedCaptions = mediaState.stream.closedCaptions &&
                mediaState.stream.closedCaptions.size > 0;
            await this.playerInterface_.beforeAppendSegment(
                mediaState.type, initSegment);
            await this.playerInterface_.mediaSourceEngine.appendBuffer(
                mediaState.type, initSegment, /* reference= */ null,
                mediaState.stream, hasClosedCaptions, mediaState.seeked,
                adaptation, /* isChunkedData= */ false, /* fromSplit= */ false,
                continuityTimeline);
          } catch (error) {
            mediaState.lastInitSegmentReference = null;
            throw error;
          }
        };
        let initSegmentTime = reference.startTime;
        if (nullLastReferences) {
          const bufferEnd =
            this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);
          if (bufferEnd != null) {
            // Adjust init segment append time if we have something in
            // a buffer, i.e. due to running switchVariant() with non zero
            // safe margin value.
            initSegmentTime = bufferEnd;
          }
        }
        this.playerInterface_.onInitSegmentAppended(
            initSegmentTime, reference.initSegmentReference);
        operations.push(append());
      }
    }

    const lastDiscontinuitySequence =
        mediaState.lastSegmentReference ?
            mediaState.lastSegmentReference.discontinuitySequence : -1;
    // Across discontinuity bounds, we should resync timestamps.  The next
    // segment appended should land at its theoretical timestamp from the
    // segment index.
    if (reference.discontinuitySequence != lastDiscontinuitySequence) {
      operations.push(this.playerInterface_.mediaSourceEngine.resync(
          mediaState.type, reference.startTime));
    }

    await Promise.all(operations);
  }

  /**
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} timestampOffset
   * @param {number} appendWindowStart
   * @param {number} appendWindowEnd
   * @param {!shaka.media.SegmentReference} reference
   * @param {?string=} codecs
   * @param {?string=} mimeType
   * @private
   */
  async setProperties_(mediaState, timestampOffset, appendWindowStart,
      appendWindowEnd, reference, codecs, mimeType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    /**
     * @type {!Map<shaka.util.ManifestParserUtils.ContentType,
     *              shaka.extern.Stream>}
     */
    const streamsByType = this.getStreamsByType_();
    try {
      mediaState.lastAppendWindowStart = appendWindowStart;
      mediaState.lastAppendWindowEnd = appendWindowEnd;
      if (codecs) {
        mediaState.lastCodecs = codecs;
      }
      if (mimeType) {
        mediaState.lastMimeType = mimeType;
      }
      mediaState.lastTimestampOffset = timestampOffset;

      const ignoreTimestampOffset = this.manifest_.sequenceMode ||
          this.manifest_.type == shaka.media.ManifestParser.HLS;

      let otherState = null;
      if (mediaState.type === ContentType.VIDEO) {
        otherState = this.mediaStates_.get(ContentType.AUDIO);
      } else if (mediaState.type === ContentType.AUDIO) {
        otherState = this.mediaStates_.get(ContentType.VIDEO);
      }
      if (otherState &&
          otherState.stream && otherState.stream.isAudioMuxedInVideo) {
        await this.playerInterface_.mediaSourceEngine.setStreamProperties(
            otherState.type, timestampOffset, appendWindowStart,
            appendWindowEnd, ignoreTimestampOffset,
            otherState.stream.mimeType,
            otherState.stream.codecs, streamsByType);
      }

      await this.playerInterface_.mediaSourceEngine.setStreamProperties(
          mediaState.type, timestampOffset, appendWindowStart,
          appendWindowEnd, ignoreTimestampOffset,
          reference.mimeType || mediaState.stream.mimeType,
          reference.codecs || mediaState.stream.codecs, streamsByType);
    } catch (error) {
      mediaState.lastAppendWindowStart = null;
      mediaState.lastAppendWindowEnd = null;
      mediaState.lastCodecs = null;
      mediaState.lastMimeType = null;
      mediaState.lastTimestampOffset = null;

      throw error;
    }
  }


  /**
   * Appends the given segment and evicts content if required to append.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime
   * @param {shaka.extern.Stream} stream
   * @param {!shaka.media.SegmentReference} reference
   * @param {BufferSource} segment
   * @param {boolean=} isChunkedData
   * @param {boolean=} adaptation
   * @return {!Promise}
   * @private
   */
  async append_(mediaState, presentationTime, stream, reference, segment,
      isChunkedData = false, adaptation = false) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    const hasClosedCaptions = stream.closedCaptions &&
        stream.closedCaptions.size > 0;

    if (this.config_.shouldFixTimestampOffset) {
      const isMP4 = stream.mimeType == 'video/mp4' ||
              stream.mimeType == 'audio/mp4';
      let timescale = null;
      if (reference.initSegmentReference) {
        timescale = reference.initSegmentReference.timescale;
      }
      const shouldFixTimestampOffset = isMP4 && timescale &&
          stream.type === shaka.util.ManifestParserUtils.ContentType.VIDEO &&
          this.manifest_.type == shaka.media.ManifestParser.DASH;

      if (shouldFixTimestampOffset) {
        new shaka.util.Mp4Parser()
            .box('moof', shaka.util.Mp4Parser.children)
            .box('traf', shaka.util.Mp4Parser.children)
            .fullBox('tfdt', async (box) => {
              goog.asserts.assert(
                  box.version != null,
                  'TFDT is a full box and should have a valid version.');

              const parsedTFDT = shaka.util.Mp4BoxParsers.parseTFDTInaccurate(
                  box.reader, box.version);

              const baseMediaDecodeTime = parsedTFDT.baseMediaDecodeTime;

              // In case the time is 0, it is not updated
              if (!baseMediaDecodeTime) {
                return;
              }
              goog.asserts.assert(typeof(timescale) == 'number',
                  'Should be an number!');

              const scaledMediaDecodeTime = -baseMediaDecodeTime / timescale;

              const comparison1 = Number(mediaState.lastTimestampOffset) || 0;

              if (comparison1 < scaledMediaDecodeTime) {
                const lastAppendWindowStart = mediaState.lastAppendWindowStart;
                const lastAppendWindowEnd = mediaState.lastAppendWindowEnd;
                goog.asserts.assert(typeof(lastAppendWindowStart) == 'number',
                    'Should be an number!');
                goog.asserts.assert(typeof(lastAppendWindowEnd) == 'number',
                    'Should be an number!');
                await this.setProperties_(mediaState, scaledMediaDecodeTime,
                    lastAppendWindowStart, lastAppendWindowEnd, reference);
              }
            })
            .parse(segment, /* partialOkay= */ false, isChunkedData);
      }
    }

    await this.evict_(mediaState, presentationTime);
    this.destroyer_.ensureNotDestroyed();

    // 'seeked' or 'adaptation' triggered logic applies only to this
    // appendBuffer() call.
    const seeked = mediaState.seeked;
    mediaState.seeked = false;

    await this.playerInterface_.beforeAppendSegment(mediaState.type, segment);
    await this.playerInterface_.mediaSourceEngine.appendBuffer(
        mediaState.type,
        segment,
        reference,
        stream,
        hasClosedCaptions,
        seeked,
        adaptation,
        isChunkedData);
    this.destroyer_.ensureNotDestroyed();
    shaka.log.v2(logPrefix, 'appended media segment');
  }

  /**
   * Evicts media to meet the max buffer behind limit.
   *
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {number} presentationTime
   * @private
   */
  async evict_(mediaState, presentationTime) {
    const segmentIndex = mediaState.stream.segmentIndex;
    /** @type {Array<number>} */
    let continuityTimelines;
    if (segmentIndex instanceof shaka.media.MetaSegmentIndex) {
      segmentIndex.evict(
          this.manifest_.presentationTimeline.getSegmentAvailabilityStart());

      continuityTimelines = [];
      segmentIndex.forEachIndex((index) => {
        continuityTimelines.push(index.continuityTimeline());
      });
    }

    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);
    shaka.log.v2(logPrefix, 'checking buffer length');

    // Use the max segment duration, if it is longer than the bufferBehind, to
    // avoid accidentally clearing too much data when dealing with a manifest
    // with a long keyframe interval.
    const bufferBehind = Math.max(
        this.config_.bufferBehind * this.bufferingScale_,
        this.manifest_.presentationTimeline.getMaxSegmentDuration());

    const startTime =
        this.playerInterface_.mediaSourceEngine.bufferStart(mediaState.type);
    if (startTime == null) {
      if (this.lastTextMediaStateBeforeUnload_ == mediaState) {
        this.lastTextMediaStateBeforeUnload_ = null;
      }
      shaka.log.v2(logPrefix,
          'buffer behind okay because nothing buffered:',
          'presentationTime=' + presentationTime,
          'bufferBehind=' + bufferBehind);
      return;
    }
    const bufferedBehind = presentationTime - startTime;

    const evictionGoal = this.config_.evictionGoal;

    const seekRangeStart =
        this.manifest_.presentationTimeline.getSeekRangeStart();
    const seekRangeEnd =
        this.manifest_.presentationTimeline.getSeekRangeEnd();

    let overflow = bufferedBehind - bufferBehind;
    if (seekRangeEnd - seekRangeStart > evictionGoal) {
      overflow = Math.max(bufferedBehind - bufferBehind,
          seekRangeStart - evictionGoal - startTime);
    }
    // See: https://github.com/shaka-project/shaka-player/issues/6240
    if (overflow <= evictionGoal) {
      shaka.log.v2(logPrefix,
          'buffer behind okay:',
          'presentationTime=' + presentationTime,
          'bufferedBehind=' + bufferedBehind,
          'bufferBehind=' + bufferBehind,
          'evictionGoal=' + evictionGoal,
          'underflow=' + Math.abs(overflow));
      return;
    }

    shaka.log.v1(logPrefix,
        'buffer behind too large:',
        'presentationTime=' + presentationTime,
        'bufferedBehind=' + bufferedBehind,
        'bufferBehind=' + bufferBehind,
        'evictionGoal=' + evictionGoal,
        'overflow=' + overflow);

    await this.playerInterface_.mediaSourceEngine.remove(mediaState.type,
        startTime, startTime + overflow, continuityTimelines);

    this.destroyer_.ensureNotDestroyed();
    shaka.log.v1(logPrefix, 'evicted ' + overflow + ' seconds');

    if (this.lastTextMediaStateBeforeUnload_) {
      await this.evict_(this.lastTextMediaStateBeforeUnload_, presentationTime);
      this.destroyer_.ensureNotDestroyed();
    }
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
   * @param {(!shaka.media.InitSegmentReference|
   *          !shaka.media.SegmentReference)} reference
   * @param {?function(BufferSource):!Promise=} streamDataCallback
   *
   * @return {!Promise<BufferSource>}
   * @private
   */
  async fetch_(mediaState, reference, streamDataCallback) {
    const segmentData = reference.getSegmentData();
    if (segmentData) {
      return segmentData;
    }
    let op = null;
    if (mediaState.segmentPrefetch) {
      op = mediaState.segmentPrefetch.getPrefetchedSegment(
          reference, streamDataCallback);
    }
    if (!op) {
      op = this.dispatchFetch_(
          reference, mediaState.stream, streamDataCallback);
    }

    let position = 0;
    if (mediaState.segmentIterator) {
      position = mediaState.segmentIterator.currentPosition();
    }

    mediaState.operation = op;
    const response = await op.promise;
    mediaState.operation = null;
    let result = response.data;
    if (reference.aesKey) {
      result = await shaka.media.SegmentUtils.aesDecrypt(
          result, reference.aesKey, position);
    }
    return result;
  }

  /**
   * Fetches the given segment.
   *
   * @param {(!shaka.media.InitSegmentReference|
   *          !shaka.media.SegmentReference)} reference
   * @param {!shaka.extern.Stream} stream
   * @param {?function(BufferSource):!Promise=} streamDataCallback
   * @param {boolean=} isPreload
   *
   * @return {!shaka.net.NetworkingEngine.PendingRequest}
   * @private
   */
  dispatchFetch_(reference, stream, streamDataCallback, isPreload = false) {
    goog.asserts.assert(
        this.playerInterface_.netEngine, 'Must have net engine');
    return shaka.media.StreamingEngine.dispatchFetch(
        reference, stream, streamDataCallback || null,
        this.config_.retryParameters, this.playerInterface_.netEngine);
  }

  /**
   * Fetches the given segment.
   *
   * @param {(!shaka.media.InitSegmentReference|
   *          !shaka.media.SegmentReference)} reference
   * @param {!shaka.extern.Stream} stream
   * @param {?function(BufferSource):!Promise} streamDataCallback
   * @param {shaka.extern.RetryParameters} retryParameters
   * @param {!shaka.net.NetworkingEngine} netEngine
   * @param {boolean=} isPreload
   *
   * @return {!shaka.net.NetworkingEngine.PendingRequest}
   */
  static dispatchFetch(
      reference, stream, streamDataCallback, retryParameters, netEngine,
      isPreload = false) {
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    const segment = reference instanceof shaka.media.SegmentReference ?
        reference : undefined;
    const type = segment ?
        shaka.net.NetworkingEngine.AdvancedRequestType.MEDIA_SEGMENT :
        shaka.net.NetworkingEngine.AdvancedRequestType.INIT_SEGMENT;
    const request = shaka.util.Networking.createSegmentRequest(
        reference.getUris(),
        reference.startByte,
        reference.endByte,
        retryParameters,
        streamDataCallback);
    request.contentType = stream.type;

    shaka.log.v2('fetching: reference=', reference);

    return netEngine.request(
        requestType, request, {type, stream, segment, isPreload});
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
    mediaState.segmentIterator = null;

    shaka.log.debug(logPrefix, 'clearing buffer');
    if (mediaState.segmentPrefetch &&
        !this.audioPrefetchMap_.has(mediaState.stream)) {
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
   * @param {shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {!shaka.util.Error} error
   * @return {!Promise}
   * @private
   */
  async handleStreamingError_(mediaState, error) {
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    if (error.code == shaka.util.Error.Code.STREAMING_NOT_ALLOWED) {
      mediaState.performingUpdate = false;
      this.cancelUpdate_(mediaState);
      this.scheduleUpdate_(mediaState, 0);
      return;
    }

    // If we invoke the callback right away, the application could trigger a
    // rapid retry cycle that could be very unkind to the server.  Instead,
    // use the backoff system to delay and backoff the error handling.
    await this.failureCallbackBackoff_.attempt();
    this.destroyer_.ensureNotDestroyed();

    // Try to recover from network errors, but not timeouts.
    // See https://github.com/shaka-project/shaka-player/issues/7368
    if (error.category === shaka.util.Error.Category.NETWORK &&
        error.code != shaka.util.Error.Code.TIMEOUT) {
      if (mediaState.restoreStreamAfterTrickPlay) {
        this.setTrickPlay(/* on= */ false);
        return;
      }
      const maxDisabledTime = this.getDisabledTime_(error);
      if (maxDisabledTime) {
        shaka.log.debug(logPrefix, 'Disabling stream due to error', error);
      }
      error.handled = this.playerInterface_.disableStream(
          mediaState.stream, maxDisabledTime);

      // Decrease the error severity to recoverable
      if (error.handled) {
        error.severity = shaka.util.Error.Severity.RECOVERABLE;
      }
    }

    // First fire an error event.
    if (!error.handled ||
        error.code != shaka.util.Error.Code.SEGMENT_MISSING) {
      this.playerInterface_.onError(error);
    }

    // If the error was not handled by the application, call the failure
    // callback.
    if (!error.handled) {
      this.config_.failureCallback(error);
    }
  }

  /**
   * @param {!shaka.util.Error} error
   * @return {number}
   * @private
   */
  getDisabledTime_(error) {
    if (this.config_.maxDisabledTime === 0 &&
        error.code == shaka.util.Error.Code.SEGMENT_MISSING) {
      // Spec: https://datatracker.ietf.org/doc/html/draft-pantos-hls-rfc8216bis#section-6.3.3
      // The client SHOULD NOT attempt to load Media Segments that have been
      // marked with an EXT-X-GAP tag, or to load Partial Segments with a
      // GAP=YES attribute. Instead, clients are encouraged to look for
      // another Variant Stream of the same Rendition which does not have the
      // same gap, and play that instead.
      return 1;
    }

    return this.config_.maxDisabledTime;
  }

  /**
   * Reset Media Source
   *
   * @param {boolean=} force
   * @return {!Promise<boolean>}
   */
  async resetMediaSource(force = false, clearBuffer = true) {
    const now = (Date.now() / 1000);
    const minTimeBetweenRecoveries = this.config_.minTimeBetweenRecoveries;
    if (!force) {
      if (!this.config_.allowMediaSourceRecoveries ||
          (now - this.lastMediaSourceReset_) < minTimeBetweenRecoveries) {
        return false;
      }
      this.lastMediaSourceReset_ = now;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const audioMediaState = this.mediaStates_.get(ContentType.AUDIO);
    if (audioMediaState) {
      this.cancelUpdate_(audioMediaState);
      if (audioMediaState.operation) {
        audioMediaState.operation.abort();
        audioMediaState.operation = null;
      }
      audioMediaState.lastInitSegmentReference = null;
      audioMediaState.lastAppendWindowStart = null;
      audioMediaState.lastAppendWindowEnd = null;
      audioMediaState.lastInitSegmentReference = null;
      audioMediaState.lastAppendWindowStart = null;
      audioMediaState.lastAppendWindowEnd = null;
      audioMediaState.performingUpdate = false;
      audioMediaState.waitingToClearBuffer = false;
      audioMediaState.clearBufferSafeMargin = 0;
      audioMediaState.waitingToFlushBuffer = false;
      audioMediaState.clearingBuffer = false;
      if (audioMediaState.segmentIterator) {
        audioMediaState.segmentIterator.resetToLastIndependent();
      }
    }
    const videoMediaState = this.mediaStates_.get(ContentType.VIDEO);
    if (videoMediaState) {
      this.cancelUpdate_(videoMediaState);
      if (videoMediaState.operation) {
        videoMediaState.operation.abort();
        videoMediaState.operation = null;
      }
      videoMediaState.lastInitSegmentReference = null;
      videoMediaState.lastAppendWindowStart = null;
      videoMediaState.lastAppendWindowEnd = null;
      videoMediaState.performingUpdate = false;
      videoMediaState.waitingToClearBuffer = false;
      videoMediaState.clearBufferSafeMargin = 0;
      videoMediaState.waitingToFlushBuffer = false;
      videoMediaState.clearingBuffer = false;
      if (videoMediaState.segmentIterator) {
        videoMediaState.segmentIterator.resetToLastIndependent();
      }
    }
    const pausedBeforeReset = this.playerInterface_.video.paused;
    await this.playerInterface_.mediaSourceEngine.reset(
        this.getStreamsByType_());
    if (videoMediaState && !videoMediaState.clearingBuffer &&
        !videoMediaState.performingUpdate && !videoMediaState.updateTimer) {
      this.scheduleUpdate_(videoMediaState, 0);
    }
    if (audioMediaState && !audioMediaState.clearingBuffer &&
        !audioMediaState.performingUpdate && !audioMediaState.updateTimer) {
      this.scheduleUpdate_(audioMediaState, 0);
    }
    if (!pausedBeforeReset) {
      this.playerInterface_.video.play();
    }
    return true;
  }

  /**
   * Update the spatial video info and notify to the app.
   *
   * @param {shaka.extern.SpatialVideoInfo} info
   * @private
   */
  updateSpatialVideoInfo_(info) {
    if (this.spatialVideoInfo_.projection != info.projection ||
        this.spatialVideoInfo_.hfov != info.hfov) {
      const EventName = shaka.util.FakeEvent.EventName;
      let event;
      if (info.projection != null || info.hfov != null) {
        const eventName = EventName.SpatialVideoInfoEvent;
        const data = (new Map()).set('detail', info);
        event = new shaka.util.FakeEvent(eventName, data);
      } else {
        const eventName = EventName.NoSpatialVideoInfoEvent;
        event = new shaka.util.FakeEvent(eventName);
      }
      event.cancelable = true;
      this.playerInterface_.onEvent(event);
      this.spatialVideoInfo_ = info;
    }
  }

  /**
   * Update the segment iterator direction.
   *
   * @private
   */
  updateSegmentIteratorReverse_() {
    const reverse = this.playerInterface_.getPlaybackRate() < 0;
    for (const mediaState of this.mediaStates_.values()) {
      if (mediaState.segmentIterator) {
        mediaState.segmentIterator.setReverse(reverse);
      }
      if (mediaState.segmentPrefetch) {
        mediaState.segmentPrefetch.setReverse(reverse);
      }
    }
    for (const prefetch of this.audioPrefetchMap_.values()) {
      prefetch.setReverse(reverse);
    }
  }

  /**
   * @return {boolean}
   * @private
   */
  shouldUseCrossBoundaryLogic_() {
    const CrossBoundaryStrategy = shaka.config.CrossBoundaryStrategy;
    if (this.config_.crossBoundaryStrategy !== CrossBoundaryStrategy.KEEP) {
      return true;
    }
    const device = shaka.device.DeviceFactory.getDevice();
    if (!shaka.media.Capabilities.isChangeTypeSupported() ||
        !device.supportsSmoothCodecSwitching() ) {
      for (const type of this.mediaStates_.keys()) {
        const mediaState = this.mediaStates_.get(type);
        const ContentType = shaka.util.ManifestParserUtils.ContentType;
        if (mediaState.type === ContentType.TEXT) {
          continue;
        }
        const stream = mediaState.stream;
        if (stream && stream.fullMimeTypes && stream.fullMimeTypes.size > 1) {
          return true;
        }
      }
    } else if (!device.supportsContainerChangeType()) {
      for (const type of this.mediaStates_.keys()) {
        const mediaState = this.mediaStates_.get(type);
        const ContentType = shaka.util.ManifestParserUtils.ContentType;
        if (mediaState.type === ContentType.TEXT) {
          continue;
        }
        const stream = mediaState.stream;
        if (stream && stream.fullMimeTypes && stream.fullMimeTypes.size > 1) {
          const containersType = new Set();
          for (const mimeType of stream.fullMimeTypes) {
            containersType.add(shaka.util.MimeUtils.getContainerType(mimeType));
          }
          return containersType.size > 1;
        }
      }
    }
    return false;
  }

  /**
   * @private
   */
  setupCrossBoundaryListeners_() {
    this.crossBoundaryEventManager_.removeAll();
    if (this.shouldUseCrossBoundaryLogic_()) {
      this.crossBoundaryEventManager_.listen(
          this.playerInterface_.video,
          'waiting',
          () => this.forwardTimeForCrossBoundary_());
      this.crossBoundaryEventManager_.listen(
          this.playerInterface_.video,
          'timeupdate',
          () => this.forwardTimeForCrossBoundary_());
    }
  }

  /**
   * Checks if need to push time forward to cross a boundary. If so,
   * an MSE reset will happen. If the strategy is KEEP, this logic is skipped.
   * Called on timeupdate to schedule a theoretical, future, offset or on
   * waiting, which is another indicator we might need to cross a boundary.
   * @private
   */
  forwardTimeForCrossBoundary_() {
    if (!this.shouldUseCrossBoundaryLogic_()) {
      // When crossBoundaryStrategy changed to keep mid stream, we can bail
      // out early.
      return;
    }

    // Stop timer first, in case someone seeked back during the time a timer
    // was scheduled.
    this.crossBoundaryTimer_.stop();

    const presentationTime = this.playerInterface_.getPresentationTime();

    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const mediaState = this.mediaStates_.get(ContentType.VIDEO) ||
      this.mediaStates_.get(ContentType.AUDIO);
    if (!mediaState) {
      return;
    }

    const lastInitRef = mediaState.lastInitSegmentReference;
    if (!lastInitRef || lastInitRef.boundaryEnd === null) {
      return;
    }

    const threshold = shaka.media.StreamingEngine.CROSS_BOUNDARY_END_THRESHOLD_;
    const fromEnd = lastInitRef.boundaryEnd - presentationTime;
    // Check if within threshold and not smaller than 0 to eliminate
    // a backwards seek.
    if (fromEnd < 0 || fromEnd > threshold) {
      return;
    }

    // Set the intended time to seek to in order to cross the boundary.
    this.boundaryTime_ = lastInitRef.boundaryEnd +
        shaka.media.StreamingEngine.APPEND_WINDOW_END_FUDGE_;
    // Schedule a time tick when the boundary theoretically should be reached,
    // else we'd risk getting stalled if a waiting event doesn't come due to
    // a segment misalignment near a boundary.
    this.crossBoundaryTimer_.tickAfter(fromEnd);
  }

  /**
   * Returns whether the reference should be discarded. If the segment crosses
   * a boundary, we'll discard it based on the crossBoundaryStrategy.
   *
   * @param {!shaka.media.StreamingEngine.MediaState_} mediaState
   * @param {!shaka.media.SegmentReference} reference
   * @private
   */
  discardReferenceByBoundary_(mediaState, reference) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (mediaState.type === ContentType.TEXT) {
      return false;
    }

    const lastInitRef = mediaState.lastInitSegmentReference;
    if (!lastInitRef) {
      return false;
    }

    const CrossBoundaryStrategy = shaka.config.CrossBoundaryStrategy;
    const logPrefix = shaka.media.StreamingEngine.logPrefix_(mediaState);

    const initRef = reference.initSegmentReference;
    let discard = lastInitRef.boundaryEnd !== initRef.boundaryEnd;
    // Some devices can play plain data when initialized with an encrypted
    // init segment. We can keep the MediaSource in this case.
    if (this.config_.crossBoundaryStrategy ===
          CrossBoundaryStrategy.RESET_TO_ENCRYPTED) {
      if (!lastInitRef.encrypted && !initRef.encrypted) {
        // We're crossing a plain to plain boundary, allow the reference.
        discard = false;
      }
      if (lastInitRef.encrypted) {
        // We initialized MediaSource with an encrypted init segment, from
        // now on, we can keep the buffer.
        shaka.log.debug(logPrefix, 'stream is encrypted, ' +
          'discard crossBoundaryStrategy');
        this.config_.crossBoundaryStrategy = CrossBoundaryStrategy.KEEP;
      }
    }
    if (this.config_.crossBoundaryStrategy ===
          CrossBoundaryStrategy.RESET_ON_ENCRYPTION_CHANGE) {
      if (lastInitRef.encrypted == initRef.encrypted) {
        // We're crossing a plain to plain boundary or we're crossing a
        // encrypted to encrypted boundary, allow the reference.
        discard = false;
      }
    }
    if (this.config_.crossBoundaryStrategy === CrossBoundaryStrategy.KEEP &&
        lastInitRef.mimeType && initRef.mimeType) {
      const MimeUtils = shaka.util.MimeUtils;
      const oldCodec = MimeUtils.getNormalizedCodec(
          MimeUtils.getCodecs(lastInitRef.mimeType));
      const newCodec = MimeUtils.getNormalizedCodec(
          MimeUtils.getCodecs(lastInitRef.mimeType));
      if (lastInitRef.mimeType == initRef.mimeType &&
          oldCodec == newCodec) {
        discard = false;
      }
    }
    // this.crossBoundarySeek_ is used when a seek occurs due to crossing the
    // boundary without user interaction. mediaState.seeked occurs when the
    // user explicitly seeks.
    // If discarded & seeked across a boundary, reset MediaSource.
    if (discard && (this.crossBoundarySeek_ || mediaState.seeked)) {
      shaka.log.debug(logPrefix, 'reset mediaSource',
          'from=', mediaState.lastInitSegmentReference,
          'to=', reference.initSegmentReference);

      this.crossBoundarySeek_ = false;
      this.resetMediaSource(/* force= */ true).then(() => {
        const eventName = shaka.util.FakeEvent.EventName.BoundaryCrossed;
        const data = new Map()
            .set('oldEncrypted', lastInitRef.encrypted)
            .set('newEncrypted', initRef.encrypted);
        this.playerInterface_.onEvent(
            new shaka.util.FakeEvent(eventName, data));
      });
    }
    return discard;
  }

  /**
   * @param {boolean=} includeText
   * @return {!Map<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>}
   * @private
   */
  getStreamsByType_(includeText = false) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const updateCodecsAndMimeType = (stream) => {
      if (stream.fullMimeTypes && stream.fullMimeTypes.size > 1) {
        if (this.mediaStates_.has(stream.type)) {
          const mediaState = this.mediaStates_.get(stream.type);
          const bufferEnd =
            this.playerInterface_.mediaSourceEngine.bufferEnd(mediaState.type);
          const presentationTime = this.playerInterface_.getPresentationTime();
          const reference = this.getSegmentReferenceNeeded_(
              mediaState, presentationTime, bufferEnd);
          if (reference && reference.codecs && reference.mimeType) {
            stream.codecs = reference.codecs;
            stream.mimeType = reference.mimeType;
          }
        }
      }
    };

    /**
     * @type {!Map<shaka.util.ManifestParserUtils.ContentType,
     *              shaka.extern.Stream>}
     */
    const streamsByType = new Map();
    const audio = this.currentVariant_.audio;
    if (audio) {
      updateCodecsAndMimeType(audio);
      streamsByType.set(ContentType.AUDIO, audio);
    }
    const video = this.currentVariant_.video;
    if (video) {
      updateCodecsAndMimeType(video);
      streamsByType.set(ContentType.VIDEO, video);
    }
    if (includeText && this.currentTextStream_) {
      streamsByType.set(ContentType.TEXT, this.currentTextStream_);
    }
    return streamsByType;
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
 *   getPlaybackRate: function():number,
 *   video: !HTMLMediaElement,
 *   mediaSourceEngine: !shaka.media.MediaSourceEngine,
 *   netEngine: shaka.net.NetworkingEngine,
 *   onError: function(!shaka.util.Error),
 *   onEvent: function(!Event),
 *   onSegmentAppended: function(!shaka.media.SegmentReference,
 *     !shaka.extern.Stream, boolean),
 *   onInitSegmentAppended: function(!number,!shaka.media.InitSegmentReference),
 *   beforeAppendSegment: function(
 *     shaka.util.ManifestParserUtils.ContentType,!BufferSource):Promise,
 *   disableStream: function(!shaka.extern.Stream, number):boolean,
 *   shouldPrefetchNextSegment: function(!shaka.media.SegmentReference,
 *     !shaka.extern.Stream):boolean,
 * }}
 *
 * @property {function():number} getPresentationTime
 *   Get the position in the presentation (in seconds) of the content that the
 *   viewer is seeing on screen right now.
 * @property {function():number} getBandwidthEstimate
 *   Get the estimated bandwidth in bits per second.
 * @property {function():number} getPlaybackRate
 *   Get the playback rate.
 * @property {!HTMLVideoElement} video
 *   Get the video element.
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
 * @property {function(!shaka.media.SegmentReference,
 *     !shaka.extern.Stream, boolean)} onSegmentAppended
 *   Called after a segment is successfully appended to a MediaSource.
 * @property {function(!number,
 *                     !shaka.media.InitSegmentReference)} onInitSegmentAppended
 *   Called when an init segment is appended to a MediaSource.
 * @property {!function(shaka.util.ManifestParserUtils.ContentType,
 *   !BufferSource):Promise} beforeAppendSegment
 *   A function called just before appending to the source buffer.
 * @property {function(!shaka.extern.Stream, number):boolean} disableStream
 *   Called to temporarily disable a stream i.e. disabling all variant
 *   containing said stream.
 * @property {function(!shaka.media.SegmentReference,
 *     !shaka.extern.Stream):boolean} shouldPrefetchNextSegment
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
 *   lastCodecs: ?string,
 *   lastMimeType: ?string,
 *   restoreStreamAfterTrickPlay: ?shaka.extern.Stream,
 *   endOfStream: boolean,
 *   performingUpdate: boolean,
 *   updateTimer: shaka.util.DelayedTick,
 *   waitingToClearBuffer: boolean,
 *   waitingToFlushBuffer: boolean,
 *   clearBufferSafeMargin: number,
 *   clearingBuffer: boolean,
 *   seeked: boolean,
 *   adaptation: boolean,
 *   recovering: boolean,
 *   hasError: boolean,
 *   operation: shaka.net.NetworkingEngine.PendingRequest,
 *   segmentPrefetch: shaka.media.SegmentPrefetch,
 *   dependencyMediaState: ?shaka.media.StreamingEngine.MediaState_,
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
 * @property {?string} lastCodecs
 *   The last append codecs given to MediaSourceEngine for this type.
 * @property {?string} lastMimeType
 *   The last append mime type given to MediaSourceEngine for this type.
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
 * @property {?shaka.media.StreamingEngine.MediaState_} dependencyMediaState
 *   A dependency media state.
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
shaka.media.StreamingEngine.APPEND_WINDOW_END_FUDGE_ = 0.1;


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


/**
 * The threshold to decide if we're close to a boundary. If presentation time
 * is before this offset, boundary crossing logic will be skipped.
 *
 * @const {number}
 * @private
 */
shaka.media.StreamingEngine.CROSS_BOUNDARY_END_THRESHOLD_ = 1;
