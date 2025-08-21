/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.MediaSourceEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.config.CodecSwitchingStrategy');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.media.Capabilities');
goog.require('shaka.media.ContentWorkarounds');
goog.require('shaka.media.ClosedCaptionParser');
goog.require('shaka.media.IClosedCaptionParser');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.TimeRangesUtils');
goog.require('shaka.text.TextEngine');
goog.require('shaka.transmuxer.TransmuxerEngine');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Destroyer');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.TimeUtils');
goog.require('shaka.util.TsParser');
goog.require('shaka.lcevc.Dec');


/**
 * @summary
 * MediaSourceEngine wraps all operations on MediaSource and SourceBuffers.
 * All asynchronous operations return a Promise, and all operations are
 * internally synchronized and serialized as needed.  Operations that can
 * be done in parallel will be done in parallel.
 *
 * @implements {shaka.util.IDestroyable}
 */
shaka.media.MediaSourceEngine = class {
  /**
   * @param {HTMLMediaElement} video The video element, whose source is tied to
   *   MediaSource during the lifetime of the MediaSourceEngine.
   * @param {!shaka.extern.TextDisplayer} textDisplayer
   *    The text displayer that will be used with the text engine.
   *    MediaSourceEngine takes ownership of the displayer. When
   *    MediaSourceEngine is destroyed, it will destroy the displayer.
   * @param {!shaka.media.MediaSourceEngine.PlayerInterface} playerInterface
   *   Interface for common player methods.
   * @param {shaka.extern.MediaSourceConfiguration} config
   * @param {?shaka.lcevc.Dec} [lcevcDec] Optional -  LCEVC Decoder Object
   */
  constructor(video, textDisplayer, playerInterface, config, lcevcDec) {
    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {?shaka.media.MediaSourceEngine.PlayerInterface} */
    this.playerInterface_ = playerInterface;

    /** @private {?shaka.extern.MediaSourceConfiguration} */
    this.config_ = config;

    /** @private {shaka.extern.TextDisplayer} */
    this.textDisplayer_ = textDisplayer;

    /**
     * @private {!Map<shaka.util.ManifestParserUtils.ContentType, SourceBuffer>}
     */
    this.sourceBuffers_ = new Map();

    /**
     * @private {!Map<shaka.util.ManifestParserUtils.ContentType, string>}
     */
    this.sourceBufferTypes_ = new Map();


    /**
     * @private {!Map<shaka.util.ManifestParserUtils.ContentType,
     *                    boolean>}
     */
    this.expectedEncryption_ = new Map();

    /** @private {shaka.text.TextEngine} */
    this.textEngine_ = null;

    /** @private {boolean} */
    this.segmentRelativeVttTiming_ = false;

    /** @private {?shaka.lcevc.Dec} */
    this.lcevcDec_ = lcevcDec || null;

    /**
     * @private {!Map<string, !Array<shaka.media.MediaSourceEngine.Operation>>}
     */
    this.queues_ = new Map();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /**
     * @private {!Map<shaka.util.ManifestParserUtils.ContentType,
                         !shaka.extern.Transmuxer>} */
    this.transmuxers_ = new Map();

    /** @private {?shaka.media.IClosedCaptionParser} */
    this.captionParser_ = null;

    /** @private {!shaka.util.PublicPromise} */
    this.mediaSourceOpen_ = new shaka.util.PublicPromise();

    /** @private {string} */
    this.url_ = '';

    /** @private {boolean} */
    this.playbackHasBegun_ = false;

    /** @private {boolean} */
    this.streamingAllowed_ = true;

    /** @private {boolean} */
    this.usingRemotePlayback_ = false;

    /** @private {HTMLSourceElement} */
    this.source_ = null;

    /**
     * Fallback source element with direct media URI, used for casting
     * purposes.
     * @private {HTMLSourceElement}
     */
    this.secondarySource_ = null;

    /** @private {MediaSource} */
    this.mediaSource_ = this.createMediaSource(this.mediaSourceOpen_);

    /** @private {boolean} */
    this.reloadingMediaSource_ = false;

    /** @private {boolean} */
    this.playAfterReset_ = false;

    /** @type {!shaka.util.Destroyer} */
    this.destroyer_ = new shaka.util.Destroyer(() => this.doDestroy_());

    /** @private {boolean} */
    this.sequenceMode_ = false;

    /** @private {string} */
    this.manifestType_ = shaka.media.ManifestParser.UNKNOWN;

    /** @private {boolean} */
    this.ignoreManifestTimestampsInSegmentsMode_ = false;

    /** @private {boolean} */
    this.attemptTimestampOffsetCalculation_ = false;

    /** @private {!shaka.util.PublicPromise<number>} */
    this.textSequenceModeOffset_ = new shaka.util.PublicPromise();

    /** @private {boolean} */
    this.needSplitMuxedContent_ = false;

    /** @private {?number} */
    this.lastDuration_ = null;

    /**
     * @private {!Map<shaka.util.ManifestParserUtils.ContentType,
     *                    !shaka.util.TsParser>}
     */
    this.tsParsers_ = new Map();

    /** @private {?number} */
    this.firstVideoTimestamp_ = null;

    /** @private {?number} */
    this.firstVideoReferenceStartTime_ = null;

    /** @private {?number} */
    this.firstAudioTimestamp_ = null;

    /** @private {?number} */
    this.firstAudioReferenceStartTime_ = null;

    /** @private {!shaka.util.PublicPromise<number>} */
    this.audioCompensation_ = new shaka.util.PublicPromise();

    if (this.video_.remote) {
      this.usingRemotePlayback_ = this.video_.remote.state != 'disconnected';

      this.eventManager_.listen(this.video_.remote, 'connect', () => {
        this.usingRemotePlayback_ = this.video_.remote.state != 'disconnected';
      });

      this.eventManager_.listen(this.video_.remote, 'connecting', () => {
        this.usingRemotePlayback_ = this.video_.remote.state != 'disconnected';
      });

      this.eventManager_.listen(this.video_.remote, 'disconnect', () => {
        this.usingRemotePlayback_ = this.video_.remote.state != 'disconnected';
      });
    }
  }

  /**
   * Create a MediaSource object, attach it to the video element, and return it.
   * Resolves the given promise when the MediaSource is ready.
   *
   * Replaced by unit tests.
   *
   * @param {!shaka.util.PublicPromise} p
   * @return {!MediaSource}
   */
  createMediaSource(p) {
    this.streamingAllowed_ = true;

    /** @type {!MediaSource} */
    let mediaSource;

    if (window.ManagedMediaSource) {
      if (!this.secondarySource_) {
        this.video_.disableRemotePlayback = true;
      }

      mediaSource = new ManagedMediaSource();

      this.eventManager_.listen(
          mediaSource, 'startstreaming', () => {
            shaka.log.info('MMS startstreaming');
            this.streamingAllowed_ = true;
          });

      this.eventManager_.listen(
          mediaSource, 'endstreaming', () => {
            shaka.log.info('MMS endstreaming');
            this.streamingAllowed_ = false;
          });
    } else {
      mediaSource = new MediaSource();
    }

    // Set up MediaSource on the video element.
    this.eventManager_.listenOnce(
        mediaSource, 'sourceopen', () => this.onSourceOpen_(p));

    // Correctly set when playback has begun.
    this.eventManager_.listenOnce(this.video_, 'playing', () => {
      this.playbackHasBegun_ = true;
    });

    // Store the object URL for releasing it later.
    this.url_ = shaka.media.MediaSourceEngine.createObjectURL(mediaSource);
    if (this.config_.useSourceElements) {
      this.video_.removeAttribute('src');
      if (this.source_) {
        this.video_.removeChild(this.source_);
      }
      if (this.secondarySource_) {
        this.video_.removeChild(this.secondarySource_);
      }
      this.source_ = shaka.util.Dom.createSourceElement(this.url_);
      this.video_.appendChild(this.source_);
      if (this.secondarySource_) {
        this.video_.appendChild(this.secondarySource_);
      }
      this.video_.load();
    } else {
      this.video_.src = this.url_;
    }

    return mediaSource;
  }

  /**
   * @param {string} uri
   * @param {string} mimeType
   */
  addSecondarySource(uri, mimeType) {
    if (!this.video_ || !window.ManagedMediaSource || !this.mediaSource_) {
      shaka.log.warning(
          'Secondary source is used only with ManagedMediaSource');
      return;
    }
    if (!this.config_.useSourceElements) {
      return;
    }
    if (this.secondarySource_) {
      this.video_.removeChild(this.secondarySource_);
    }
    this.secondarySource_ = shaka.util.Dom.createSourceElement(uri, mimeType);
    this.video_.appendChild(this.secondarySource_);
    this.video_.disableRemotePlayback = false;
  }

  /**
   * @param {shaka.util.PublicPromise} p
   * @private
   */
  onSourceOpen_(p) {
    goog.asserts.assert(this.url_, 'Must have object URL');

    // Release the object URL that was previously created, to prevent memory
    // leak.
    // createObjectURL creates a strong reference to the MediaSource object
    // inside the browser.  Setting the src of the video then creates another
    // reference within the video element.  revokeObjectURL will remove the
    // strong reference to the MediaSource object, and allow it to be
    // garbage-collected later.
    URL.revokeObjectURL(this.url_);
    p.resolve();
  }

  /**
   * Returns a map of MediaSource support for well-known types.
   *
   * @return {!Object<string, boolean>}
   */
  static probeSupport() {
    const MimeUtils = shaka.util.MimeUtils;

    const testMimeTypes = [
      // MP4 types
      'video/mp4; codecs="avc1.42E01E"',
      'video/mp4; codecs="avc3.42E01E"',
      'video/mp4; codecs="hev1.1.6.L93.90"',
      'video/mp4; codecs="hvc1.1.6.L93.90"',
      'video/mp4; codecs="hev1.2.4.L153.B0"; eotf="smpte2084"',  // HDR HEVC
      'video/mp4; codecs="hvc1.2.4.L153.B0"; eotf="smpte2084"',  // HDR HEVC
      'video/mp4; codecs="hvc1.2.20000000.L153.B0"',
      'video/mp4; codecs="hvc1.2.4.L120.b0"',
      'video/mp4; codecs="hvc1.2.4.L123.b0"',
      'video/mp4; codecs="vp9"',
      'video/mp4; codecs="vp09.00.10.08"',
      'video/mp4; codecs="av01.0.01M.08"',
      'video/mp4; codecs="dvh1.05.01"', // Dolby Vision p5
      'video/mp4; codecs="dvh1.08.01"', // Dolby Vision p8
      'video/mp4; codecs="dav1.10.01"', // Dolby Vision p10
      'video/mp4; codecs="dvh1.20.01"', // Dolby Vision p20
      'audio/mp4; codecs="mp4a.40.2"',
      'audio/mp4; codecs="ac-3"',
      'audio/mp4; codecs="ec-3"',
      'audio/mp4; codecs="ac-4.02.01.01"',
      'audio/mp4; codecs="opus"',
      'audio/mp4; codecs="flac"',
      'audio/mp4; codecs="dtsc"', // DTS Digital Surround
      'audio/mp4; codecs="dtse"', // DTS Express
      'audio/mp4; codecs="dtsx"', // DTS:X
      'audio/mp4; codecs="apac.31.00"',
      // WebM types
      'video/webm; codecs="vp8"',
      'video/webm; codecs="vp9"',
      'video/webm; codecs="vp09.00.10.08"',
      'audio/webm; codecs="vorbis"',
      'audio/webm; codecs="opus"',
      // MPEG2 TS types (video/ is also used for audio: https://bit.ly/TsMse)
      'video/mp2t; codecs="avc1.42E01E"',
      'video/mp2t; codecs="avc3.42E01E"',
      'video/mp2t; codecs="hvc1.1.6.L93.90"',
      'video/mp2t; codecs="mp4a.40.2"',
      'video/mp2t; codecs="ac-3"',
      'video/mp2t; codecs="ec-3"',
      // WebVTT types
      'text/vtt',
      'application/mp4; codecs="wvtt"',
      // TTML types
      'application/ttml+xml',
      'application/mp4; codecs="stpp"',
      // Containerless types
      ...MimeUtils.RAW_FORMATS,
    ];

    const support = {};
    const device = shaka.device.DeviceFactory.getDevice();
    for (const type of testMimeTypes) {
      if (shaka.text.TextEngine.isTypeSupported(type)) {
        support[type] = true;
      } else if (device.supportsMediaSource()) {
        const baseMimeType = MimeUtils.getBasicType(type);
        const codecs = shaka.util.StreamUtils.getCorrectAudioCodecs(
            MimeUtils.getCodecs(type), baseMimeType);
        const newType = MimeUtils.getFullType(baseMimeType, codecs);
        support[type] = shaka.media.Capabilities.isTypeSupported(newType) ||
                        shaka.transmuxer.TransmuxerEngine.isSupported(newType);
      } else {
        support[type] = device.supportsMediaType(type);
      }

      const basicType = type.split(';')[0];
      support[basicType] = support[basicType] || support[type];
    }

    return support;
  }

  /** @override */
  destroy() {
    return this.destroyer_.destroy();
  }

  /** @private */
  async doDestroy_() {
    const Functional = shaka.util.Functional;

    const cleanup = [];

    for (const [key, q] of this.queues_) {
      // Make a local copy of the queue and the first item.
      const inProgress = q[0];

      const contentType = /** @type {string} */(key);

      // Drop everything else out of the original queue.
      this.queues_.set(contentType, q.slice(0, 1));

      // We will wait for this item to complete/fail.
      if (inProgress) {
        cleanup.push(inProgress.p.catch(Functional.noop));
      }

      // The rest will be rejected silently if possible.
      for (const item of q.slice(1)) {
        item.p.reject(shaka.util.Destroyer.destroyedError());
      }
    }

    if (this.textEngine_) {
      cleanup.push(this.textEngine_.destroy());
    }

    await Promise.all(cleanup);

    for (const transmuxer of this.transmuxers_.values()) {
      transmuxer.destroy();
    }

    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    if (this.video_ && this.secondarySource_) {
      this.video_.removeChild(this.secondarySource_);
    }
    if (this.video_ && this.source_) {
      // "unload" the video element.
      this.video_.removeChild(this.source_);
      this.video_.load();
      this.video_.disableRemotePlayback = false;
    }

    this.video_ = null;
    this.source_ = null;
    this.secondarySource_ = null;
    this.config_ = null;
    this.mediaSource_ = null;
    this.textEngine_ = null;
    this.textDisplayer_ = null;
    this.sourceBuffers_.clear();
    this.expectedEncryption_.clear();
    this.transmuxers_.clear();
    this.captionParser_ = null;
    if (goog.DEBUG) {
      for (const [contentType, q] of this.queues_) {
        goog.asserts.assert(
            q.length == 0,
            contentType + ' queue should be empty after destroy!');
      }
    }
    this.queues_.clear();

    // This object is owned by Player
    this.lcevcDec_ = null;

    this.tsParsers_.clear();
    this.playerInterface_ = null;
  }

  /**
   * @return {!Promise} Resolved when MediaSource is open and attached to the
   *   media element.  This process is actually initiated by the constructor.
   */
  open() {
    return this.mediaSourceOpen_;
  }

  /**
   * Initialize MediaSourceEngine.
   *
   * Note that it is not valid to call this multiple times, except to add or
   * reinitialize text streams.
   *
   * @param {!Map<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   *   A map of content types to streams.
   * @param {boolean=} sequenceMode
   *   If true, the media segments are appended to the SourceBuffer in strict
   *   sequence.
   * @param {string=} manifestType
   *   Indicates the type of the manifest.
   * @param {boolean=} ignoreManifestTimestampsInSegmentsMode
   *   If true, don't adjust the timestamp offset to account for manifest
   *   segment durations being out of sync with segment durations. In other
   *   words, assume that there are no gaps in the segments when appending
   *   to the SourceBuffer, even if the manifest and segment times disagree.
   *   Indicates if the manifest has text streams.
   *
   * @return {!Promise}
   */
  async init(streamsByType, sequenceMode=false,
      manifestType=shaka.media.ManifestParser.UNKNOWN,
      ignoreManifestTimestampsInSegmentsMode=false) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    await this.mediaSourceOpen_;
    if (this.ended() || this.closed()) {
      shaka.log.alwaysError('Expected MediaSource to be open during init(); ' +
          'reopening the media source.');
      this.mediaSourceOpen_ = new shaka.util.PublicPromise();
      this.mediaSource_ = this.createMediaSource(this.mediaSourceOpen_);
      await this.mediaSourceOpen_;
    }

    this.sequenceMode_ = sequenceMode;
    this.manifestType_ = manifestType;
    this.ignoreManifestTimestampsInSegmentsMode_ =
      ignoreManifestTimestampsInSegmentsMode;

    this.attemptTimestampOffsetCalculation_ = !this.sequenceMode_ &&
        this.manifestType_ == shaka.media.ManifestParser.HLS &&
        !this.ignoreManifestTimestampsInSegmentsMode_;

    this.tsParsers_.clear();
    this.firstVideoTimestamp_ = null;
    this.firstVideoReferenceStartTime_ = null;
    this.firstAudioTimestamp_ = null;
    this.firstAudioReferenceStartTime_ = null;
    this.audioCompensation_ = new shaka.util.PublicPromise();

    for (const contentType of streamsByType.keys()) {
      const stream = streamsByType.get(contentType);
      this.initSourceBuffer_(contentType, stream, stream.codecs);
      if (this.needSplitMuxedContent_) {
        this.queues_.set(ContentType.AUDIO, []);
        this.queues_.set(ContentType.VIDEO, []);
      } else {
        this.queues_.set(contentType, []);
      }
    }
    const audio = streamsByType.get(ContentType.AUDIO);
    if (audio && audio.isAudioMuxedInVideo) {
      this.needSplitMuxedContent_ = true;
    }
  }

  /**
   * Initialize a specific SourceBuffer.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {shaka.extern.Stream} stream
   * @param {string} codecs
   * @private
   */
  initSourceBuffer_(contentType, stream, codecs) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    if (contentType == ContentType.AUDIO && codecs) {
      codecs = shaka.util.StreamUtils.getCorrectAudioCodecs(
          codecs, stream.mimeType);
    }

    let mimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, codecs);
    if (contentType == ContentType.TEXT) {
      this.reinitText(mimeType, this.sequenceMode_, stream.external);
    } else {
      let needTransmux = this.config_.forceTransmux;
      if (!shaka.media.Capabilities.isTypeSupported(mimeType) ||
          (!this.sequenceMode_ &&
          shaka.util.MimeUtils.RAW_FORMATS.includes(mimeType))) {
        needTransmux = true;
      }
      const mimeTypeWithAllCodecs =
          shaka.util.MimeUtils.getFullTypeWithAllCodecs(
              stream.mimeType, codecs);
      if (needTransmux) {
        const audioCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
            ContentType.AUDIO, (codecs || '').split(','));
        const videoCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
            ContentType.VIDEO, (codecs || '').split(','));
        if (audioCodec && videoCodec) {
          this.needSplitMuxedContent_ = true;
          this.initSourceBuffer_(ContentType.AUDIO, stream, audioCodec);
          this.initSourceBuffer_(ContentType.VIDEO, stream, videoCodec);
          return;
        }
        const transmuxerPlugin = shaka.transmuxer.TransmuxerEngine
            .findTransmuxer(mimeTypeWithAllCodecs);
        if (transmuxerPlugin) {
          const transmuxer = transmuxerPlugin();
          this.transmuxers_.set(contentType, transmuxer);
          mimeType =
              transmuxer.convertCodecs(contentType, mimeTypeWithAllCodecs);
        }
      }
      const type = this.addExtraFeaturesToMimeType_(mimeType);

      this.destroyer_.ensureNotDestroyed();

      let sourceBuffer;

      try {
        sourceBuffer = this.mediaSource_.addSourceBuffer(type);
      } catch (exception) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.MEDIA,
            shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
            exception,
            'The mediaSource_ status was ' + this.mediaSource_.readyState +
            ' expected \'open\'',
            null);
      }

      if (this.sequenceMode_) {
        sourceBuffer.mode =
            shaka.media.MediaSourceEngine.SourceBufferMode_.SEQUENCE;
      }

      this.eventManager_.listen(
          sourceBuffer, 'error',
          () => this.onError_(contentType));
      this.eventManager_.listen(
          sourceBuffer, 'updateend',
          () => this.onUpdateEnd_(contentType));
      this.sourceBuffers_.set(contentType, sourceBuffer);
      this.sourceBufferTypes_.set(contentType, mimeType);
      this.expectedEncryption_.set(contentType, !!stream.drmInfos.length);
    }
  }

  /**
   * Called by the Player to provide an updated configuration any time it
   * changes. Must be called at least once before init().
   *
   * @param {shaka.extern.MediaSourceConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    if (this.textEngine_) {
      this.textEngine_.setModifyCueCallback(config.modifyCueCallback);
    }
  }

  /**
   * Indicate if the streaming is allowed by MediaSourceEngine.
   * If we using MediaSource we always returns true.
   *
   * @return {boolean}
   */
  isStreamingAllowed() {
    return this.streamingAllowed_ && !this.usingRemotePlayback_ &&
        !this.reloadingMediaSource_;
  }

  /**
   * Reinitialize the TextEngine for a new text type.
   * @param {string} mimeType
   * @param {boolean} sequenceMode
   * @param {boolean} external
   */
  reinitText(mimeType, sequenceMode, external) {
    if (!this.textEngine_) {
      this.textEngine_ = new shaka.text.TextEngine(this.textDisplayer_);
      if (this.textEngine_) {
        this.textEngine_.setModifyCueCallback(this.config_.modifyCueCallback);
      }
    }
    this.textEngine_.initParser(mimeType, sequenceMode,
        external || this.segmentRelativeVttTiming_, this.manifestType_);
  }

  /**
   * @return {boolean} True if the MediaSource is in an "ended" state, or if the
   *   object has been destroyed.
   */
  ended() {
    if (this.reloadingMediaSource_) {
      return false;
    }
    return this.mediaSource_ ? this.mediaSource_.readyState == 'ended' : true;
  }

  /**
   * @return {boolean} True if the MediaSource is in an "closed" state, or if
   *   the object has been destroyed.
   */
  closed() {
    if (this.reloadingMediaSource_) {
      return false;
    }
    return this.mediaSource_ ? this.mediaSource_.readyState == 'closed' : true;
  }

  /**
   * Gets the first timestamp in buffer for the given content type.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {?number} The timestamp in seconds, or null if nothing is buffered.
   */
  bufferStart(contentType) {
    if (!this.sourceBuffers_.size) {
      return null;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      return this.textEngine_.bufferStart();
    }
    return shaka.media.TimeRangesUtils.bufferStart(
        this.getBuffered_(contentType));
  }

  /**
   * Gets the last timestamp in buffer for the given content type.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {?number} The timestamp in seconds, or null if nothing is buffered.
   */
  bufferEnd(contentType) {
    if (!this.sourceBuffers_.size) {
      return null;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      return this.textEngine_.bufferEnd();
    }
    return shaka.media.TimeRangesUtils.bufferEnd(
        this.getBuffered_(contentType));
  }

  /**
   * Determines if the given time is inside the buffered range of the given
   * content type.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} time Playhead time
   * @return {boolean}
   */
  isBuffered(contentType, time) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      return this.textEngine_.isBuffered(time);
    } else {
      const buffered = this.getBuffered_(contentType);
      return shaka.media.TimeRangesUtils.isBuffered(buffered, time);
    }
  }

  /**
   * Computes how far ahead of the given timestamp is buffered for the given
   * content type.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} time
   * @return {number} The amount of time buffered ahead in seconds.
   */
  bufferedAheadOf(contentType, time) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      return this.textEngine_.bufferedAheadOf(time);
    } else {
      const buffered = this.getBuffered_(contentType);
      return shaka.media.TimeRangesUtils.bufferedAheadOf(buffered, time);
    }
  }

  /**
   * Returns info about what is currently buffered.
   * @return {shaka.extern.BufferedInfo}
   */
  getBufferedInfo() {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const TimeRangesUtils = shaka.media.TimeRangesUtils;

    const info = {
      total: this.reloadingMediaSource_ ? [] :
        TimeRangesUtils.getBufferedInfo(this.video_.buffered),
      audio:
        TimeRangesUtils.getBufferedInfo(this.getBuffered_(ContentType.AUDIO)),
      video:
        TimeRangesUtils.getBufferedInfo(this.getBuffered_(ContentType.VIDEO)),
      text: [],
    };

    if (this.textEngine_) {
      const start = this.textEngine_.bufferStart();
      const end = this.textEngine_.bufferEnd();

      if (start != null && end != null) {
        info.text.push({start: start, end: end});
      }
    }
    return info;
  }

  /**
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {TimeRanges} The buffered ranges for the given content type, or
   *   null if the buffered ranges could not be obtained.
   * @private
   */
  getBuffered_(contentType) {
    if (this.reloadingMediaSource_ || this.usingRemotePlayback_) {
      return null;
    }
    try {
      return this.sourceBuffers_.get(contentType).buffered;
    } catch (exception) {
      if (this.sourceBuffers_.has(contentType)) {
        // Note: previous MediaSource errors may cause access to |buffered| to
        // throw.
        shaka.log.error('failed to get buffered range for ' + contentType,
            exception);
      }
      return null;
    }
  }

  /**
   * Create a new closed caption parser. This will ONLY be replaced by tests as
   * a way to inject fake closed caption parser instances.
   *
   * @param {string} mimeType
   * @return {!shaka.media.IClosedCaptionParser}
   */
  getCaptionParser(mimeType) {
    return new shaka.media.ClosedCaptionParser(mimeType);
  }

  /**
   * This method is only public for testing.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {!BufferSource} data
   * @param {!shaka.media.SegmentReference} reference The segment reference
   *   we are appending
   * @param {shaka.extern.Stream} stream
   * @param {!string} mimeType
   * @return {{timestamp: ?number, metadata: !Array<shaka.extern.ID3Metadata>}}
   */
  getTimestampAndDispatchMetadata(contentType, data, reference, stream,
      mimeType) {
    let timestamp = null;
    let metadata = [];

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);
    if (shaka.util.MimeUtils.RAW_FORMATS.includes(mimeType)) {
      const frames = shaka.util.Id3Utils.getID3Frames(uint8ArrayData);
      if (frames.length && reference) {
        const metadataTimestamp = frames.find((frame) => {
          return frame.description ===
              'com.apple.streaming.transportStreamTimestamp';
        });
        if (metadataTimestamp && typeof metadataTimestamp.data == 'number') {
          timestamp = Math.round(metadataTimestamp.data) / 1000;
        }
        /** @private {shaka.extern.ID3Metadata} */
        const id3Metadata = {
          cueTime: reference.startTime,
          data: uint8ArrayData,
          frames: frames,
          dts: reference.startTime,
          pts: reference.startTime,
        };
        this.playerInterface_.onMetadata(
            [id3Metadata], /* offset= */ 0, reference.endTime);
      }
    } else if (mimeType.includes('/mp4') &&
        reference &&
        reference.initSegmentReference &&
        reference.initSegmentReference.timescale) {
      const timescale = reference.initSegmentReference.timescale;
      if (!isNaN(timescale)) {
        const hasEmsg = ((stream.emsgSchemeIdUris != null &&
            stream.emsgSchemeIdUris.length > 0) ||
            this.config_.dispatchAllEmsgBoxes);
        const Mp4Parser = shaka.util.Mp4Parser;
        let startTime = 0;
        let parsedMedia = false;
        const parser = new Mp4Parser();
        if (hasEmsg) {
          parser.fullBox('emsg', (box) =>
            this.parseEMSG_(reference, stream.emsgSchemeIdUris, box));
        }
        parser.fullBox('prft', (box) => this.parsePrft_(timescale, box))
            .box('moof', Mp4Parser.children)
            .box('traf', Mp4Parser.children)
            .fullBox('tfdt', (box) => {
              if (!parsedMedia) {
                goog.asserts.assert(
                    box.version == 0 || box.version == 1,
                    'TFDT version can only be 0 or 1');
                const parsed = shaka.util.Mp4BoxParsers.parseTFDTInaccurate(
                    box.reader, box.version);
                startTime = parsed.baseMediaDecodeTime / timescale;
                parsedMedia = true;
                if (!hasEmsg) {
                  box.parser.stop();
                }
              }
            }).parse(data, /* partialOkay= */ true);
        if (parsedMedia && reference.timestampOffset == 0) {
          timestamp = startTime;
        }
      }
    } else if (!mimeType.includes('/mp4') && !mimeType.includes('/webm') &&
        shaka.util.TsParser.probe(uint8ArrayData)) {
      if (!this.tsParsers_.has(contentType)) {
        this.tsParsers_.set(contentType, new shaka.util.TsParser());
      }
      const tsParser = this.tsParsers_.get(contentType);
      tsParser.clearData();
      tsParser.setDiscontinuitySequence(reference.discontinuitySequence);
      tsParser.parse(uint8ArrayData);
      const startTime = tsParser.getStartTime(contentType);
      if (startTime != null) {
        timestamp = startTime;
      }
      metadata = tsParser.getMetadata();
    }
    return {timestamp, metadata};
  }


  /**
   * Parse the EMSG box from a MP4 container.
   *
   * @param {!shaka.media.SegmentReference} reference
   * @param {?Array<string>} emsgSchemeIdUris Array of emsg
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
    const messageDataRaw = box.reader.readBytes(
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
      } else {
        // All other schemes are dispatched as a general 'emsg' event.

        // messageDataRaw is a Uint8Array which uses shared ArrayBuffer.
        // We need to make a copy to not keep whole segment in memory.
        const messageData = new Uint8Array(messageDataRaw.byteLength);
        messageData.set(messageDataRaw);
        const endTime = startTime + (eventDuration / timescale);
        /** @type {shaka.extern.EmsgInfo} */
        const emsg = {
          startTime: startTime,
          endTime: endTime,
          schemeIdUri: schemeId,
          value: value,
          timescale: timescale,
          presentationTimeDelta: presentationTimeDelta,
          eventDuration: eventDuration,
          id: id,
          messageData: messageData,
        };

        this.playerInterface_.onEmsg(emsg);

        // Additionally, ID3 events generate a 'metadata' event.  This is a
        // pre-parsed version of the metadata blob already dispatched in the
        // 'emsg' event.
        if (schemeId == 'https://aomedia.org/emsg/ID3' ||
            schemeId == 'https://developer.apple.com/streaming/emsg-id3') {
          // See https://aomediacodec.github.io/id3-emsg/
          const frames = shaka.util.Id3Utils.getID3Frames(messageData);
          if (frames.length) {
            /** @private {shaka.extern.ID3Metadata} */
            const metadata = {
              cueTime: startTime,
              data: messageData,
              frames: frames,
              dts: startTime,
              pts: startTime,
            };
            this.playerInterface_.onMetadata(
                [metadata], /* offset= */ 0, endTime);
          }
        }
      }
    }
  }

  /**
   * Parse PRFT box.
   * @param {number} timescale
   * @param {!shaka.extern.ParsedBox} box
   * @private
   */
  parsePrft_(timescale, box) {
    goog.asserts.assert(
        box.version == 0 || box.version == 1,
        'PRFT version can only be 0 or 1');
    const parsed = shaka.util.Mp4BoxParsers.parsePRFTInaccurate(
        box.reader, box.version);

    const wallClockTime = shaka.util.TimeUtils.convertNtp(parsed.ntpTimestamp);
    const programStartDate = new Date(wallClockTime -
      (parsed.mediaTime / timescale) * 1000);
    /** @type {shaka.extern.ProducerReferenceTime} */
    const prftInfo = {
      wallClockTime,
      programStartDate,
    };

    const eventName = shaka.util.FakeEvent.EventName.Prft;
    const data = (new Map()).set('detail', prftInfo);
    const event = new shaka.util.FakeEvent(
        eventName, data);
    this.playerInterface_.onEvent(event);
  }

  /**
   * Enqueue an operation to append data to the SourceBuffer.
   * Start and end times are needed for TextEngine, but not for MediaSource.
   * Start and end times may be null for initialization segments; if present
   * they are relative to the presentation timeline.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {!BufferSource} data
   * @param {?shaka.media.SegmentReference} reference The segment reference
   *   we are appending, or null for init segments
   * @param {shaka.extern.Stream} stream
   * @param {?boolean} hasClosedCaptions True if the buffer contains CEA closed
   *   captions
   * @param {boolean=} seeked True if we just seeked
   * @param {boolean=} adaptation True if we just automatically switched active
   *   variant(s).
   * @param {boolean=} isChunkedData True if we add to the buffer from the
   * @param {boolean=} fromSplit
   * @param {number=} continuityTimeline an optional continuity timeline
   * @return {!Promise}
   */
  async appendBuffer(
      contentType, data, reference, stream, hasClosedCaptions, seeked = false,
      adaptation = false, isChunkedData = false, fromSplit = false,
      continuityTimeline) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    if (contentType == ContentType.TEXT) {
      if (this.manifestType_ == shaka.media.ManifestParser.HLS) {
        // This won't be known until the first video segment is appended.
        const offset = await this.textSequenceModeOffset_;
        this.textEngine_.setTimestampOffset(offset);
      }
      await this.textEngine_.appendBuffer(
          data,
          reference ? reference.startTime : null,
          reference ? reference.endTime : null,
          reference ? reference.getUris()[0] : null);
      return;
    }

    if (!fromSplit && this.needSplitMuxedContent_) {
      await this.appendBuffer(ContentType.AUDIO, data, reference, stream,
          hasClosedCaptions, seeked, adaptation, isChunkedData,
          /* fromSplit= */ true);
      await this.appendBuffer(ContentType.VIDEO, data, reference, stream,
          hasClosedCaptions, seeked, adaptation, isChunkedData,
          /* fromSplit= */ true);
      return;
    }

    if (!this.sourceBuffers_.has(contentType)) {
      shaka.log.warning('Attempted to restore a non-existent source buffer');
      return;
    }

    let timestampOffset = this.sourceBuffers_.get(contentType).timestampOffset;

    let mimeType = this.sourceBufferTypes_.get(contentType);
    if (this.transmuxers_.has(contentType)) {
      mimeType = this.transmuxers_.get(contentType).getOriginalMimeType();
    }
    if (reference) {
      const {timestamp, metadata} = this.getTimestampAndDispatchMetadata(
          contentType, data, reference, stream, mimeType);
      if (timestamp != null) {
        if (this.firstVideoTimestamp_ == null &&
            contentType == ContentType.VIDEO) {
          this.firstVideoTimestamp_ = timestamp;
          this.firstVideoReferenceStartTime_ = reference.startTime;
          if (this.firstAudioTimestamp_ != null) {
            let compensation = 0;
            // Only apply compensation if video and audio segment startTime
            // match, to avoid introducing sync issues.
            if (this.firstVideoReferenceStartTime_ ==
                this.firstAudioReferenceStartTime_) {
              compensation =
                  this.firstVideoTimestamp_ - this.firstAudioTimestamp_;
            }
            this.audioCompensation_.resolve(compensation);
          }
        }
        if (this.firstAudioTimestamp_ == null &&
            contentType == ContentType.AUDIO) {
          this.firstAudioTimestamp_ = timestamp;
          this.firstAudioReferenceStartTime_ = reference.startTime;
          if (this.firstVideoTimestamp_ != null) {
            let compensation = 0;
            // Only apply compensation if video and audio segment startTime
            // match, to avoid introducing sync issues.
            if (this.firstVideoReferenceStartTime_ ==
                this.firstAudioReferenceStartTime_) {
              compensation =
                  this.firstVideoTimestamp_ - this.firstAudioTimestamp_;
            }
            this.audioCompensation_.resolve(compensation);
          }
        }
        let realTimestamp = timestamp;
        const RAW_FORMATS = shaka.util.MimeUtils.RAW_FORMATS;
        // For formats without containers and using segments mode, we need to
        // adjust TimestampOffset relative to 0 because segments do not have
        // any timestamp information.
        if (!this.sequenceMode_ &&
            RAW_FORMATS.includes(this.sourceBufferTypes_.get(contentType))) {
          realTimestamp = 0;
        }
        const calculatedTimestampOffset = reference.startTime - realTimestamp;
        const timestampOffsetDifference =
            Math.abs(timestampOffset - calculatedTimestampOffset);
        if ((timestampOffsetDifference >= 0.001 || seeked || adaptation) &&
            (!isChunkedData || calculatedTimestampOffset > 0 ||
            !timestampOffset)) {
          timestampOffset = calculatedTimestampOffset;
          if (this.attemptTimestampOffsetCalculation_) {
            this.enqueueOperation_(
                contentType,
                () => this.abort_(contentType),
                null);
            this.enqueueOperation_(
                contentType,
                () => this.setTimestampOffset_(contentType, timestampOffset),
                null);
          }
        }
        // Timestamps can only be reliably extracted from video, not audio.
        // Packed audio formats do not have internal timestamps at all.
        // Prefer video for this when available.
        const isBestSourceBufferForTimestamps =
            contentType == ContentType.VIDEO ||
            !(this.sourceBuffers_.has(ContentType.VIDEO));
        if (isBestSourceBufferForTimestamps) {
          this.textSequenceModeOffset_.resolve(timestampOffset);
        }
      }
      if (metadata.length) {
        this.playerInterface_.onMetadata(metadata, timestampOffset,
            reference ? reference.endTime : null);
      }
    }
    if (hasClosedCaptions && contentType == ContentType.VIDEO) {
      if (!this.textEngine_) {
        this.reinitText(shaka.util.MimeUtils.CEA608_CLOSED_CAPTION_MIMETYPE,
            this.sequenceMode_, /* external= */ false);
      }
      if (!this.captionParser_) {
        const basicType = mimeType.split(';', 1)[0];
        this.captionParser_ = this.getCaptionParser(basicType);
      }
      // If it is the init segment for closed captions, initialize the closed
      // caption parser.
      if (!reference) {
        this.captionParser_.init(data, adaptation, continuityTimeline);
      } else {
        const closedCaptions = this.captionParser_.parseFrom(data);
        if (closedCaptions.length) {
          this.textEngine_.storeAndAppendClosedCaptions(
              closedCaptions,
              reference.startTime,
              reference.endTime,
              timestampOffset);
        }
      }
    }

    if (this.transmuxers_.has(contentType)) {
      const transmuxerOutput =
          await this.transmuxers_.get(contentType).transmux(
              data, stream, reference, this.mediaSource_.duration, contentType);
      if (ArrayBuffer.isView(transmuxerOutput)) {
        data = /** @type {!Uint8Array} */(transmuxerOutput);
      } else {
        const output =
        /** @type {!shaka.extern.TransmuxerOutput} */(transmuxerOutput);
        if (output.init != null) {
          const initData = output.init;
          this.enqueueOperation_(contentType, () => {
            this.append_(contentType, initData, timestampOffset, stream);
          }, reference ? reference.getUris()[0] : null);
        }
        data = output.data;
      }
    }

    data = this.workAroundBrokenPlatforms_(
        stream, data, reference, contentType);

    if (reference && this.sequenceMode_ && contentType != ContentType.TEXT) {
      // In sequence mode, for non-text streams, if we just cleared the buffer
      // and are either performing an unbuffered seek or handling an automatic
      // adaptation, we need to set a new timestampOffset on the sourceBuffer.
      if (seeked || adaptation) {
        let timestampOffset = reference.startTime;
        // Audio and video may not be aligned, so we will compensate for audio
        // if necessary.
        if (this.manifestType_ == shaka.media.ManifestParser.HLS &&
            !this.needSplitMuxedContent_ &&
            contentType == ContentType.AUDIO &&
            this.sourceBuffers_.has(ContentType.VIDEO)) {
          const compensation = await this.audioCompensation_;
          // Only apply compensation if the difference is greater than 150ms
          if (Math.abs(compensation) > 0.15) {
            timestampOffset -= compensation;
          }
        }
        // The logic to call abort() before setting the timestampOffset is
        // extended during unbuffered seeks or automatic adaptations; it is
        // possible for the append state to be PARSING_MEDIA_SEGMENT from the
        // previous SourceBuffer#appendBuffer() call.
        this.enqueueOperation_(
            contentType,
            () => this.abort_(contentType),
            null);
        this.enqueueOperation_(
            contentType,
            () => this.setTimestampOffset_(contentType, timestampOffset),
            null);
      }
    }

    let bufferedBefore = null;

    await this.enqueueOperation_(contentType, () => {
      if (goog.DEBUG && reference && !reference.isPreload() && !isChunkedData) {
        bufferedBefore = this.getBuffered_(contentType);
      }
      this.append_(contentType, data, timestampOffset, stream);
    }, reference ? reference.getUris()[0] : null);

    if (goog.DEBUG && reference && !reference.isPreload() && !isChunkedData) {
      const bufferedAfter = this.getBuffered_(contentType);
      const newBuffered = shaka.media.TimeRangesUtils.computeAddedRange(
          bufferedBefore, bufferedAfter);
      if (newBuffered) {
        const segmentDuration = reference.endTime - reference.startTime;
        const timeAdded = newBuffered.end - newBuffered.start;
        // Check end times instead of start times.  We may be overwriting a
        // buffer and only the end changes, and that would be fine.
        // Also, exclude tiny segments.  Sometimes alignment segments as small
        // as 33ms are seen in Google DAI content.  For such tiny segments,
        // half a segment duration would be no issue.
        const offset = Math.abs(newBuffered.end - reference.endTime);
        if (segmentDuration > 0.100 && (offset > segmentDuration / 2 ||
            Math.abs(segmentDuration - timeAdded) > 0.030)) {
          shaka.log.error('Possible encoding problem detected!',
              'Unexpected buffered range for reference', reference,
              'from URIs', reference.getUris(),
              'should be', {start: reference.startTime, end: reference.endTime},
              'but got', newBuffered);
        }
      }
    }
  }

  /**
   * Set the selected closed captions Id and language.
   *
   * @param {string} id
   */
  setSelectedClosedCaptionId(id) {
    const VIDEO = shaka.util.ManifestParserUtils.ContentType.VIDEO;
    const videoBufferEndTime = this.bufferEnd(VIDEO) || 0;
    this.textEngine_.setSelectedClosedCaptionId(id, videoBufferEndTime);
  }

  /** Disable embedded closed captions. */
  clearSelectedClosedCaptionId() {
    if (this.textEngine_) {
      this.textEngine_.setSelectedClosedCaptionId('', 0);
    }
  }

  /**
   * Enqueue an operation to remove data from the SourceBuffer.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} startTime relative to the start of the presentation
   * @param {number} endTime relative to the start of the presentation
   * @param {Array<number>=} continuityTimelines a list of continuity timelines
   *     that are still available on the stream.
   * @return {!Promise}
   */
  async remove(contentType, startTime, endTime, continuityTimelines) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.VIDEO && this.captionParser_) {
      this.captionParser_.remove(continuityTimelines);
    }
    if (contentType == ContentType.TEXT) {
      await this.textEngine_.remove(startTime, endTime);
    } else if (endTime > startTime) {
      await this.enqueueOperation_(
          contentType,
          () => this.remove_(contentType, startTime, endTime),
          null);
      if (this.needSplitMuxedContent_) {
        await this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.remove_(ContentType.AUDIO, startTime, endTime),
            null);
      }
    }
  }

  /**
   * Enqueue an operation to clear the SourceBuffer.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {!Promise}
   */
  async clear(contentType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      if (!this.textEngine_) {
        return;
      }
      await this.textEngine_.remove(0, Infinity);
    } else {
      // Note that not all platforms allow clearing to Infinity.
      await this.enqueueOperation_(
          contentType,
          () => this.remove_(contentType, 0, this.mediaSource_.duration),
          null);
      if (this.needSplitMuxedContent_) {
        await this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.remove_(
                ContentType.AUDIO, 0, this.mediaSource_.duration),
            null);
      }
    }
  }

  /**
   * Fully reset the state of the caption parser owned by MediaSourceEngine.
   */
  resetCaptionParser() {
    if (this.captionParser_) {
      this.captionParser_.reset();
    }
  }

  /**
   * Enqueue an operation to flush the SourceBuffer.
   * This is a workaround for what we believe is a Chromecast bug.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {!Promise}
   */
  async flush(contentType) {
    // Flush the pipeline.  Necessary on Chromecast, even though we have removed
    // everything.
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      // Nothing to flush for text.
      return;
    }
    await this.enqueueOperation_(
        contentType,
        () => this.flush_(contentType),
        null);
    if (this.needSplitMuxedContent_) {
      await this.enqueueOperation_(
          ContentType.AUDIO,
          () => this.flush_(ContentType.AUDIO),
          null);
    }
  }

  /**
   * Sets the timestamp offset and append window end for the given content type.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} timestampOffset The timestamp offset.  Segments which start
   *   at time t will be inserted at time t + timestampOffset instead.  This
   *   value does not affect segments which have already been inserted.
   * @param {number} appendWindowStart The timestamp to set the append window
   *   start to.  For future appends, frames/samples with timestamps less than
   *   this value will be dropped.
   * @param {number} appendWindowEnd The timestamp to set the append window end
   *   to.  For future appends, frames/samples with timestamps greater than this
   *   value will be dropped.
   * @param {boolean} ignoreTimestampOffset  If true, the timestampOffset will
   *   not be applied in this step.
   * @param {string} mimeType
   * @param {string} codecs
   * @param {!Map<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   *   A map of content types to streams.
   *
   * @return {!Promise}
   */
  async setStreamProperties(
      contentType, timestampOffset, appendWindowStart, appendWindowEnd,
      ignoreTimestampOffset, mimeType, codecs, streamsByType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      if (!ignoreTimestampOffset) {
        this.textEngine_.setTimestampOffset(timestampOffset);
      }
      this.textEngine_.setAppendWindow(appendWindowStart, appendWindowEnd);
      return;
    }
    const operations = [];

    const hasChangedCodecs = await this.codecSwitchIfNecessary_(
        contentType, mimeType, codecs, streamsByType);

    if (!hasChangedCodecs) {
      // Queue an abort() to help MSE splice together overlapping segments.
      // We set appendWindowEnd when we change periods in DASH content, and the
      // period transition may result in overlap.
      //
      // An abort() also helps with MPEG2-TS.  When we append a TS segment, we
      // always enter a PARSING_MEDIA_SEGMENT state and we can't change the
      // timestamp offset.  By calling abort(), we reset the state so we can
      // set it.
      operations.push(this.enqueueOperation_(
          contentType,
          () => this.abort_(contentType),
          null));
      if (this.needSplitMuxedContent_) {
        operations.push(this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.abort_(ContentType.AUDIO),
            null));
      }
    }
    if (!ignoreTimestampOffset) {
      operations.push(this.enqueueOperation_(
          contentType,
          () => this.setTimestampOffset_(contentType, timestampOffset),
          null));
      if (this.needSplitMuxedContent_) {
        operations.push(this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.setTimestampOffset_(
                ContentType.AUDIO, timestampOffset),
            null));
      }
    }
    if (appendWindowStart != 0 || appendWindowEnd != Infinity) {
      operations.push(this.enqueueOperation_(
          contentType,
          () => this.setAppendWindow_(
              contentType, appendWindowStart, appendWindowEnd),
          null));
      if (this.needSplitMuxedContent_) {
        operations.push(this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.setAppendWindow_(
                ContentType.AUDIO, appendWindowStart, appendWindowEnd),
            null));
      }
    }

    if (operations.length) {
      await Promise.all(operations);
    }
  }

  /**
   * Adjust timestamp offset to maintain AV sync across discontinuities.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} timestampOffset
   * @return {!Promise}
   */
  async resync(contentType, timestampOffset) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    if (contentType == ContentType.TEXT) {
      // This operation is for audio and video only.
      return;
    }

    // Reset the promise in case the timestamp offset changed during
    // a period/discontinuity transition.
    if (contentType == ContentType.VIDEO) {
      this.textSequenceModeOffset_ = new shaka.util.PublicPromise();
    }

    if (!this.sequenceMode_) {
      return;
    }

    // Avoid changing timestampOffset when the difference is less than 100 ms
    // from the end of the current buffer.
    const bufferEnd = this.bufferEnd(contentType);
    if (bufferEnd && Math.abs(bufferEnd - timestampOffset) < 0.15) {
      return;
    }

    // Queue an abort() to help MSE splice together overlapping segments.
    // We set appendWindowEnd when we change periods in DASH content, and the
    // period transition may result in overlap.
    //
    // An abort() also helps with MPEG2-TS.  When we append a TS segment, we
    // always enter a PARSING_MEDIA_SEGMENT state and we can't change the
    // timestamp offset.  By calling abort(), we reset the state so we can
    // set it.
    this.enqueueOperation_(
        contentType,
        () => this.abort_(contentType),
        null);
    if (this.needSplitMuxedContent_) {
      this.enqueueOperation_(
          ContentType.AUDIO,
          () => this.abort_(ContentType.AUDIO),
          null);
    }
    await this.enqueueOperation_(
        contentType,
        () => this.setTimestampOffset_(contentType, timestampOffset),
        null);
    if (this.needSplitMuxedContent_) {
      await this.enqueueOperation_(
          ContentType.AUDIO,
          () => this.setTimestampOffset_(ContentType.AUDIO, timestampOffset),
          null);
    }
  }

  /**
   * @param {string=} reason Valid reasons are 'network' and 'decode'.
   * @return {!Promise}
   * @see http://w3c.github.io/media-source/#idl-def-EndOfStreamError
   */
  async endOfStream(reason) {
    await this.enqueueBlockingOperation_(() => {
      // If endOfStream() has already been called on the media source,
      // don't call it again. Also do not call if readyState is
      // 'closed' (not attached to video element) since it is not a
      // valid operation.
      if (this.ended() || this.closed()) {
        return;
      }
      // Tizen won't let us pass undefined, but it will let us omit the
      // argument.
      if (reason) {
        this.mediaSource_.endOfStream(reason);
      } else {
        this.mediaSource_.endOfStream();
      }
    });
  }

  /**
   * @param {number} duration
   * @return {!Promise}
   */
  async setDuration(duration) {
    await this.enqueueBlockingOperation_(() => {
      // https://www.w3.org/TR/media-source-2/#duration-change-algorithm
      // "Duration reductions that would truncate currently buffered media
      // are disallowed.
      // When truncation is necessary, use remove() to reduce the buffered
      // range before updating duration."
      // But in some platforms, truncating the duration causes the
      // buffer range removal algorithm to run which triggers an
      // 'updateend' event to fire.
      // To handle this scenario, we have to insert a dummy operation into
      // the beginning of each queue, which the 'updateend' handler will remove.
      // Using config to disable it by default and enable only
      // on relevant platforms.
      if (this.config_.durationReductionEmitsUpdateEnd &&
                duration < this.mediaSource_.duration) {
        for (const contentType of this.sourceBuffers_.keys()) {
          const dummyOperation = {
            start: () => {},
            p: new shaka.util.PublicPromise(),
            uri: null,
          };
          this.queues_.get(contentType).unshift(dummyOperation);
        }
      }

      this.mediaSource_.duration = duration;
      this.lastDuration_ = duration;
    });
  }

  /**
   * Get the current MediaSource duration.
   *
   * @return {number}
   */
  getDuration() {
    return this.mediaSource_.duration;
  }

  /**
   * Updates the live seekable range.
   *
   * @param {number} startTime
   * @param {number} endTime
   */
  async setLiveSeekableRange(startTime, endTime) {
    if (this.destroyer_.destroyed() || this.video_.error ||
        this.usingRemotePlayback_ || this.reloadingMediaSource_) {
      return;
    }
    goog.asserts.assert('setLiveSeekableRange' in this.mediaSource_,
        'Using setLiveSeekableRange on not supported platform');
    if (this.ended() || this.closed()) {
      return;
    }
    await this.enqueueBlockingOperation_(() => {
      if (this.ended() || this.closed()) {
        return;
      }
      this.mediaSource_.setLiveSeekableRange(startTime, endTime);
    });
  }

  /**
   * Clear the current live seekable range.
   */
  async clearLiveSeekableRange() {
    if (this.destroyer_.destroyed() || this.video_.error ||
        this.usingRemotePlayback_ || this.reloadingMediaSource_) {
      return;
    }
    goog.asserts.assert('clearLiveSeekableRange' in this.mediaSource_,
        'Using clearLiveSeekableRange on not supported platform');
    if (this.ended() || this.closed()) {
      return;
    }
    await this.enqueueBlockingOperation_(() => {
      if (this.ended() || this.closed()) {
        return;
      }
      this.mediaSource_.clearLiveSeekableRange();
    });
  }

  /**
   * Append dependency data.
   * @param {BufferSource} data
   * @param {number} timestampOffset
   * @param {shaka.extern.Stream} stream
   */
  appendDependency(data, timestampOffset, stream) {
    if (this.lcevcDec_) {
      // Append buffers to the LCEVC Dec for parsing and storing
      // of LCEVC data.
      this.lcevcDec_.appendBuffer(data, timestampOffset, stream);
    }
  }

  /**
   * Append data to the SourceBuffer.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {BufferSource} data
   * @param {number} timestampOffset
   * @param {shaka.extern.Stream} stream
   * @private
   */
  append_(contentType, data, timestampOffset, stream) {
    this.appendDependency(data, timestampOffset, stream);

    // This will trigger an 'updateend' event.
    this.sourceBuffers_.get(contentType).appendBuffer(data);
  }

  /**
   * Remove data from the SourceBuffer.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} startTime relative to the start of the presentation
   * @param {number} endTime relative to the start of the presentation
   * @private
   */
  remove_(contentType, startTime, endTime) {
    if (endTime <= startTime) {
      // Ignore removal of inverted or empty ranges.
      // Fake 'updateend' event to resolve the operation.
      this.onUpdateEnd_(contentType);
      return;
    }

    // This will trigger an 'updateend' event.
    this.sourceBuffers_.get(contentType).remove(startTime, endTime);
  }

  /**
   * Call abort() on the SourceBuffer.
   * This resets MSE's last_decode_timestamp on all track buffers, which should
   * trigger the splicing logic for overlapping segments.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  abort_(contentType) {
    const sourceBuffer = this.sourceBuffers_.get(contentType);
    // Save the append window, which is reset on abort().
    const appendWindowStart = sourceBuffer.appendWindowStart;
    const appendWindowEnd = sourceBuffer.appendWindowEnd;

    // This will not trigger an 'updateend' event, since nothing is happening.
    // This is only to reset MSE internals, not to abort an actual operation.
    sourceBuffer.abort();

    // Restore the append window.
    sourceBuffer.appendWindowStart = appendWindowStart;
    sourceBuffer.appendWindowEnd = appendWindowEnd;

    // Fake an 'updateend' event to resolve the operation.
    this.onUpdateEnd_(contentType);
  }

  /**
   * Nudge the playhead to force the media pipeline to be flushed.
   * This seems to be necessary on Chromecast to get new content to replace old
   * content.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  flush_(contentType) {
    // Never use flush_ if there's data.  It causes a hiccup in playback.
    goog.asserts.assert(
        this.video_.buffered.length == 0, 'MediaSourceEngine.flush_ should ' +
        'only be used after clearing all data!');

    // Seeking forces the pipeline to be flushed.
    this.video_.currentTime -= 0.001;

    // Fake an 'updateend' event to resolve the operation.
    this.onUpdateEnd_(contentType);
  }

  /**
   * Set the SourceBuffer's timestamp offset.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} timestampOffset
   * @private
   */
  setTimestampOffset_(contentType, timestampOffset) {
    // Work around for
    // https://github.com/shaka-project/shaka-player/issues/1281:
    // TODO(https://bit.ly/2ttKiBU): follow up when this is fixed in Edge
    if (timestampOffset < 0) {
      // Try to prevent rounding errors in Edge from removing the first
      // keyframe.
      timestampOffset += 0.001;
    }

    this.sourceBuffers_.get(contentType).timestampOffset = timestampOffset;

    // Fake an 'updateend' event to resolve the operation.
    this.onUpdateEnd_(contentType);
  }

  /**
   * Set the SourceBuffer's append window end.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {number} appendWindowStart
   * @param {number} appendWindowEnd
   * @private
   */
  setAppendWindow_(contentType, appendWindowStart, appendWindowEnd) {
    const sourceBuffer = this.sourceBuffers_.get(contentType);
    if (sourceBuffer.appendWindowEnd !== appendWindowEnd ||
        sourceBuffer.appendWindowStart !== appendWindowStart) {
      // You can't set start > end, so first set start to 0, then set the new
      // end, then set the new start.  That way, there are no intermediate
      // states which are invalid.
      sourceBuffer.appendWindowStart = 0;
      sourceBuffer.appendWindowEnd = appendWindowEnd;
      sourceBuffer.appendWindowStart = appendWindowStart;
    }

    // Fake an 'updateend' event to resolve the operation.
    this.onUpdateEnd_(contentType);
  }

  /**
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  onError_(contentType) {
    const operation = this.queues_.get(contentType)[0];
    goog.asserts.assert(operation, 'Spurious error event!');
    goog.asserts.assert(!this.sourceBuffers_.get(contentType).updating,
        'SourceBuffer should not be updating on error!');
    const code = this.video_.error ? this.video_.error.code : 0;
    operation.p.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED,
        code, operation.uri));
    // Do not pop from queue.  An 'updateend' event will fire next, and to
    // avoid synchronizing these two event handlers, we will allow that one to
    // pop from the queue as normal.  Note that because the operation has
    // already been rejected, the call to resolve() in the 'updateend' handler
    // will have no effect.
  }

  /**
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  onUpdateEnd_(contentType) {
    // If we're reloading or have been destroyed, clear the queue for this
    // content type.
    if (this.reloadingMediaSource_ || this.destroyer_.destroyed()) {
      // Resolve any pending operations in this content type's queue
      const queue = this.queues_.get(contentType);
      if (queue && queue.length) {
        // Resolve the first operation that triggered this updateEnd
        const firstOperation = queue[0];
        if (firstOperation && firstOperation.p) {
          firstOperation.p.resolve();
        }
        // Clear the rest of the queue
        this.queues_.set(contentType, []);
      }
      return;
    }
    const operation = this.queues_.get(contentType)[0];
    goog.asserts.assert(operation, 'Spurious updateend event!');
    if (!operation) {
      return;
    }
    goog.asserts.assert(!this.sourceBuffers_.get(contentType).updating,
        'SourceBuffer should not be updating on updateend!');
    operation.p.resolve();
    this.popFromQueue_(contentType);
  }

  /**
   * Enqueue an operation and start it if appropriate.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {function()} start
   * @param {?string} uri
   * @return {!Promise}
   * @private
   */
  enqueueOperation_(contentType, start, uri) {
    this.destroyer_.ensureNotDestroyed();
    const operation = {
      start: start,
      p: new shaka.util.PublicPromise(),
      uri,
    };
    this.queues_.get(contentType).push(operation);

    if (this.queues_.get(contentType).length == 1) {
      this.startOperation_(contentType);
    }
    return operation.p;
  }

  /**
   * Enqueue an operation which must block all other operations on all
   * SourceBuffers.
   *
   * @param {function():(Promise|undefined)} run
   * @return {!Promise}
   * @private
   */
  async enqueueBlockingOperation_(run) {
    this.destroyer_.ensureNotDestroyed();

    /** @type {!Array<!shaka.util.PublicPromise>} */
    const allWaiters = [];
    /** @type {!Array<!shaka.util.ManifestParserUtils.ContentType>} */
    const contentTypes = Array.from(this.sourceBuffers_.keys());

    // Enqueue a 'wait' operation onto each queue.
    // This operation signals its readiness when it starts.
    // When all wait operations are ready, the real operation takes place.
    for (const contentType of contentTypes) {
      const ready = new shaka.util.PublicPromise();
      const operation = {
        start: () => ready.resolve(),
        p: ready,
        uri: null,
      };

      const queue = this.queues_.get(contentType);

      queue.push(operation);
      allWaiters.push(ready);

      if (queue.length == 1) {
        operation.start();
      }
    }

    // Return a Promise to the real operation, which waits to begin until
    // there are no other in-progress operations on any SourceBuffers.
    try {
      await Promise.all(allWaiters);
    } catch (error) {
      // One of the waiters failed, which means we've been destroyed.
      goog.asserts.assert(
          this.destroyer_.destroyed(), 'Should be destroyed by now');
      // We haven't popped from the queue.  Canceled waiters have been removed
      // by destroy.  What's left now should just be resolved waiters.  In
      // uncompiled mode, we will maintain good hygiene and make sure the
      // assert at the end of destroy passes.  In compiled mode, the queues
      // are wiped in destroy.
      if (goog.DEBUG) {
        for (const contentType of contentTypes) {
          const queue = this.queues_.get(contentType);
          if (queue.length) {
            goog.asserts.assert(queue.length == 1,
                'Should be at most one item in queue!');
            goog.asserts.assert(allWaiters.includes(queue[0].p),
                'The item in queue should be one of our waiters!');
            queue.shift();
          }
        }
      }
      throw error;
    }

    if (goog.DEBUG) {
      // If we did it correctly, nothing is updating.
      for (const contentType of contentTypes) {
        goog.asserts.assert(
            this.sourceBuffers_.get(contentType).updating == false,
            'SourceBuffers should not be updating after a blocking op!');
      }
    }

    // Run the real operation, which can be asynchronous.
    try {
      await run();
    } catch (exception) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
          exception,
          this.video_.error || 'No error in the media element',
          null);
    } finally {
      // Unblock the queues.
      for (const contentType of contentTypes) {
        this.popFromQueue_(contentType);
      }
    }
  }

  /**
   * Pop from the front of the queue and start a new operation.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  popFromQueue_(contentType) {
    goog.asserts.assert(this.queues_.has(contentType), 'Queue should exist');
    // Remove the in-progress operation, which is now complete.
    this.queues_.get(contentType).shift();
    this.startOperation_(contentType);
  }

  /**
   * Starts the next operation in the queue.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  startOperation_(contentType) {
    // Retrieve the next operation, if any, from the queue and start it.
    const next = this.queues_.get(contentType)[0];
    if (next) {
      try {
        next.start();
      } catch (exception) {
        if (exception.name == 'QuotaExceededError') {
          next.p.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MEDIA,
              shaka.util.Error.Code.QUOTA_EXCEEDED_ERROR,
              contentType));
        } else if (!this.isStreamingAllowed()) {
          next.p.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MEDIA,
              shaka.util.Error.Code.STREAMING_NOT_ALLOWED,
              contentType));
        } else {
          next.p.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MEDIA,
              shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
              exception,
              this.video_.error || 'No error in the media element',
              next.uri));
        }
        this.popFromQueue_(contentType);
      }
    }
  }

  /**
   * @return {!shaka.extern.TextDisplayer}
   */
  getTextDisplayer() {
    goog.asserts.assert(
        this.textDisplayer_,
        'TextDisplayer should only be null when this is destroyed');

    return this.textDisplayer_;
  }

  /**
   * @param {!shaka.extern.TextDisplayer} textDisplayer
   */
  setTextDisplayer(textDisplayer) {
    this.textDisplayer_ = textDisplayer;
    if (this.textEngine_) {
      this.textEngine_.setDisplayer(textDisplayer);
    }
  }

  /**
   * @param {boolean} segmentRelativeVttTiming
   */
  setSegmentRelativeVttTiming(segmentRelativeVttTiming) {
    this.segmentRelativeVttTiming_ = segmentRelativeVttTiming;
  }

  /**
   * Apply platform-specific transformations to this segment to work around
   * issues in the platform.
   *
   * @param {shaka.extern.Stream} stream
   * @param {!BufferSource} segment
   * @param {?shaka.media.SegmentReference} reference
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {!BufferSource}
   * @private
   */
  workAroundBrokenPlatforms_(stream, segment, reference, contentType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    const isMp4 = shaka.util.MimeUtils.getContainerType(
        this.sourceBufferTypes_.get(contentType)) == 'mp4';
    if (!isMp4) {
      return segment;
    }

    const isInitSegment = reference === null;
    const encryptionExpected = this.expectedEncryption_.get(contentType);
    const keySystem = this.playerInterface_.getKeySystem();
    let isEncrypted = false;
    if (reference && reference.initSegmentReference) {
      isEncrypted = reference.initSegmentReference.encrypted;
    }
    const uri = reference ? reference.getUris()[0] : null;
    const device = shaka.device.DeviceFactory.getDevice();

    if (this.config_.correctEc3Enca &&
      isInitSegment &&
      contentType === ContentType.AUDIO) {
      segment = shaka.media.ContentWorkarounds.correctEnca(segment);
    }

    // If:
    //   1. the configuration tells to insert fake encryption,
    //   2. and this is an init segment or media segment,
    //   3. and encryption is expected,
    //   4. and the platform requires encryption in all init or media segments
    //      of current content type,
    // then insert fake encryption metadata for init segments that lack it.
    // The MP4 requirement is because we can currently only do this
    // transformation on MP4 containers.
    // See: https://github.com/shaka-project/shaka-player/issues/2759
    if (this.config_.insertFakeEncryptionInInit && encryptionExpected &&
        device.requiresEncryptionInfoInAllInitSegments(keySystem,
            contentType)) {
      if (isInitSegment) {
        shaka.log.debug('Forcing fake encryption information in init segment.');
        segment =
            shaka.media.ContentWorkarounds.fakeEncryption(stream, segment, uri);
      } else if (!isEncrypted && device.requiresTfhdFix(contentType)) {
        shaka.log.debug(
            'Forcing fake encryption information in media segment.');
        segment = shaka.media.ContentWorkarounds.fakeMediaEncryption(segment);
      }
    }

    if (isInitSegment && device.requiresEC3InitSegments()) {
      shaka.log.debug('Forcing fake EC-3 information in init segment.');
      segment = shaka.media.ContentWorkarounds.fakeEC3(segment);
    }

    return segment;
  }

  /**
   * Prepare the SourceBuffer to parse a potentially new type or codec.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {string} mimeType
   * @param {?shaka.extern.Transmuxer} transmuxer
   * @private
   */
  change_(contentType, mimeType, transmuxer) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType === ContentType.TEXT) {
      shaka.log.debug(`Change not supported for ${contentType}`);
      return;
    }
    const sourceBuffer = this.sourceBufferTypes_.get(contentType);
    shaka.log.debug(
        `Change Type: ${sourceBuffer} -> ${mimeType}`);
    if (shaka.media.Capabilities.isChangeTypeSupported()) {
      if (this.transmuxers_.has(contentType)) {
        this.transmuxers_.get(contentType).destroy();
        this.transmuxers_.delete(contentType);
      }
      if (transmuxer) {
        this.transmuxers_.set(contentType, transmuxer);
      }
      const type = this.addExtraFeaturesToMimeType_(mimeType);
      this.sourceBuffers_.get(contentType).changeType(type);
      this.sourceBufferTypes_.set(contentType, mimeType);
    } else {
      shaka.log.debug('Change Type not supported');
    }

    // Fake an 'updateend' event to resolve the operation.
    this.onUpdateEnd_(contentType);
  }

  /**
   * Enqueue an operation to prepare the SourceBuffer to parse a potentially new
   * type or codec.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {string} mimeType
   * @param {?shaka.extern.Transmuxer} transmuxer
   * @return {!Promise}
   */
  changeType(contentType, mimeType, transmuxer) {
    return this.enqueueOperation_(
        contentType,
        () => this.change_(contentType, mimeType, transmuxer),
        null);
  }

  /**
   * Resets the MediaSource and re-adds source buffers due to codec mismatch
   *
   * @param {!Map<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   * @private
   */
  async reset_(streamsByType) {
    if (this.reloadingMediaSource_ || this.usingRemotePlayback_) {
      return;
    }
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    this.reloadingMediaSource_ = true;
    this.needSplitMuxedContent_ = false;
    const currentTime = this.video_.currentTime;

    // When codec switching if the user is currently paused we don't want
    // to trigger a play when switching codec.
    // Playing can also end up in a paused state after a codec switch
    // so we need to remember the current states.
    const previousAutoPlayState = this.video_.autoplay;
    if (!this.video_.paused) {
      this.playAfterReset_ = true;
    }
    if (this.playbackHasBegun_) {
      // Only set autoplay to false if the video playback has already begun.
      // When a codec switch happens before playback has begun this can cause
      // autoplay not to work as expected.
      this.video_.autoplay = false;
    }

    try {
      this.eventManager_.removeAll();

      for (const transmuxer of this.transmuxers_.values()) {
        transmuxer.destroy();
      }
      for (const sourceBuffer of this.sourceBuffers_.values()) {
        try {
          this.mediaSource_.removeSourceBuffer(sourceBuffer);
        } catch (e) {
          shaka.log.debug('Exception on removeSourceBuffer', e);
        }
      }
      this.transmuxers_.clear();
      this.sourceBuffers_.clear();

      const previousDuration = this.mediaSource_.duration;
      this.mediaSourceOpen_ = new shaka.util.PublicPromise();
      this.mediaSource_ = this.createMediaSource(this.mediaSourceOpen_);
      await this.mediaSourceOpen_;
      if (!isNaN(previousDuration) && previousDuration) {
        this.mediaSource_.duration = previousDuration;
      } else if (!isNaN(this.lastDuration_) && this.lastDuration_) {
        this.mediaSource_.duration = this.lastDuration_;
      }

      const sourceBufferAdded = new shaka.util.PublicPromise();
      const sourceBuffers =
        /** @type {EventTarget} */(this.mediaSource_.sourceBuffers);

      const totalOfBuffers = streamsByType.size;
      let numberOfSourceBufferAdded = 0;
      const onSourceBufferAdded = () => {
        numberOfSourceBufferAdded++;
        if (numberOfSourceBufferAdded === totalOfBuffers) {
          sourceBufferAdded.resolve();
          this.eventManager_.unlisten(sourceBuffers, 'addsourcebuffer',
              onSourceBufferAdded);
        }
      };

      this.eventManager_.listen(sourceBuffers, 'addsourcebuffer',
          onSourceBufferAdded);

      for (const contentType of streamsByType.keys()) {
        const stream = streamsByType.get(contentType);
        this.initSourceBuffer_(contentType, stream, stream.codecs);
      }
      const audio = streamsByType.get(ContentType.AUDIO);
      if (audio && audio.isAudioMuxedInVideo) {
        this.needSplitMuxedContent_ = true;
      }
      if (this.needSplitMuxedContent_ && !this.queues_.has(ContentType.AUDIO)) {
        this.queues_.set(ContentType.AUDIO, []);
      }

      // Fake a seek to catchup the playhead.
      this.video_.currentTime = currentTime;

      await sourceBufferAdded;
    } finally {
      this.reloadingMediaSource_ = false;

      this.destroyer_.ensureNotDestroyed();

      this.eventManager_.listenOnce(this.video_, 'canplaythrough', () => {
        // Don't use ensureNotDestroyed() from this event listener, because
        // that results in an uncaught exception.  Instead, just check the
        // flag.
        if (this.destroyer_.destroyed()) {
          return;
        }

        this.video_.autoplay = previousAutoPlayState;
        if (this.playAfterReset_) {
          this.playAfterReset_ = false;
          this.video_.play();
        }
      });
    }
  }

  /**
   * Resets the Media Source
   * @param {!Map<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   * @return {!Promise}
   */
  reset(streamsByType) {
    return this.enqueueBlockingOperation_(
        () => this.reset_(streamsByType));
  }

  /**
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {string} mimeType
   * @param {string} codecs
   * @return {{
   *   transmuxer: ?shaka.extern.Transmuxer,
   *   transmuxerMuxed: boolean,
   *   basicType: string,
   *   codec: string,
   *   mimeType: string,
   * }}
   * @private
   */
  getRealInfo_(contentType, mimeType, codecs) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const MimeUtils = shaka.util.MimeUtils;
    /** @type {?shaka.extern.Transmuxer} */
    let transmuxer;
    let transmuxerMuxed = false;
    const audioCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.AUDIO, (codecs || '').split(','));
    const videoCodec = shaka.util.ManifestParserUtils.guessCodecsSafe(
        ContentType.VIDEO, (codecs || '').split(','));
    let codec = videoCodec;
    if (contentType == ContentType.AUDIO) {
      codec = audioCodec;
    }
    if (!codec) {
      codec = codecs;
    }
    let newMimeType = shaka.util.MimeUtils.getFullType(mimeType, codec);
    const currentBasicType = MimeUtils.getBasicType(
        this.sourceBufferTypes_.get(contentType));

    let needTransmux = this.config_.forceTransmux;
    if (!shaka.media.Capabilities.isTypeSupported(newMimeType) ||
        (!this.sequenceMode_ &&
        shaka.util.MimeUtils.RAW_FORMATS.includes(newMimeType))) {
      needTransmux = true;
    } else if (!needTransmux && mimeType != currentBasicType) {
      const device = shaka.device.DeviceFactory.getDevice();
      needTransmux = !device.supportsContainerChangeType() &&
          shaka.util.MimeUtils.RAW_FORMATS.includes(mimeType);
    }
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    if (needTransmux) {
      const newMimeTypeWithAllCodecs =
          shaka.util.MimeUtils.getFullTypeWithAllCodecs(mimeType, codec);
      const transmuxerPlugin =
          TransmuxerEngine.findTransmuxer(newMimeTypeWithAllCodecs);
      if (transmuxerPlugin) {
        transmuxer = transmuxerPlugin();
        if (audioCodec && videoCodec) {
          transmuxerMuxed = true;
        }
        newMimeType =
            transmuxer.convertCodecs(contentType, newMimeTypeWithAllCodecs);
      }
    }

    const newCodec = MimeUtils.getNormalizedCodec(
        MimeUtils.getCodecs(newMimeType));
    const newBasicType = MimeUtils.getBasicType(newMimeType);
    return {
      transmuxer,
      transmuxerMuxed,
      basicType: newBasicType,
      codec: newCodec,
      mimeType: newMimeType,
    };
  }

  /**
   * Codec switch if necessary, this will not resolve until the codec
   * switch is over.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {string} mimeType
   * @param {string} codecs
   * @param {!Map<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   * @return {{
   *   type: string,
   *   newMimeType: string,
   *   transmuxer: ?shaka.extern.Transmuxer,
   * }}
   * @private
   */
  getInfoAboutResetOrChangeType_(contentType, mimeType, codecs, streamsByType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      return {
        type: shaka.media.MediaSourceEngine.ResetMode_.NONE,
        newMimeType: mimeType,
        transmuxer: null,
      };
    }
    const MimeUtils = shaka.util.MimeUtils;
    const currentCodec = MimeUtils.getNormalizedCodec(
        MimeUtils.getCodecs(this.sourceBufferTypes_.get(contentType)));
    const currentBasicType = MimeUtils.getBasicType(
        this.sourceBufferTypes_.get(contentType));

    const realInfo = this.getRealInfo_(contentType, mimeType, codecs);
    const transmuxer = realInfo.transmuxer;
    const transmuxerMuxed = realInfo.transmuxerMuxed;
    const newBasicType = realInfo.basicType;
    const newCodec = realInfo.codec;
    const newMimeType = realInfo.mimeType;

    let muxedContentCheck = true;
    if (transmuxerMuxed &&
        this.sourceBufferTypes_.has(ContentType.AUDIO)) {
      const muxedRealInfo =
          this.getRealInfo_(ContentType.AUDIO, mimeType, codecs);
      const muxedCurrentCodec = MimeUtils.getNormalizedCodec(
          MimeUtils.getCodecs(this.sourceBufferTypes_.get(ContentType.AUDIO)));
      const muxedCurrentBasicType = MimeUtils.getBasicType(
          this.sourceBufferTypes_.get(ContentType.AUDIO));
      muxedContentCheck = muxedCurrentCodec == muxedRealInfo.codec &&
        muxedCurrentBasicType == muxedRealInfo.basicType;
      if (muxedRealInfo.transmuxer) {
        muxedRealInfo.transmuxer.destroy();
      }
    }

    // Current/new codecs base and basic type match then no need to switch
    if (currentCodec === newCodec && currentBasicType === newBasicType &&
        muxedContentCheck) {
      return {
        type: shaka.media.MediaSourceEngine.ResetMode_.NONE,
        newMimeType,
        transmuxer,
      };
    }

    let allowChangeType = true;
    if ((this.needSplitMuxedContent_ &&
        !streamsByType.has(ContentType.AUDIO)) || (transmuxerMuxed &&
        transmuxer && !this.transmuxers_.has(contentType))) {
      allowChangeType = false;
    }

    if (allowChangeType && this.config_.codecSwitchingStrategy ===
        shaka.config.CodecSwitchingStrategy.SMOOTH &&
          shaka.media.Capabilities.isChangeTypeSupported()) {
      return {
        type: shaka.media.MediaSourceEngine.ResetMode_.CHANGE_TYPE,
        newMimeType,
        transmuxer,
      };
    } else {
      if (transmuxer) {
        transmuxer.destroy();
      }
      return {
        type: shaka.media.MediaSourceEngine.ResetMode_.RESET,
        newMimeType,
        transmuxer: null,
      };
    }
  }

  /**
   * Codec switch if necessary, this will not resolve until the codec
   * switch is over.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {string} mimeType
   * @param {string} codecs
   * @param {!Map<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   * @return {!Promise<boolean>} true if there was a codec switch,
   *                              false otherwise.
   * @private
   */
  async codecSwitchIfNecessary_(contentType, mimeType, codecs, streamsByType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    const {type, transmuxer, newMimeType} = this.getInfoAboutResetOrChangeType_(
        contentType, mimeType, codecs, streamsByType);

    const newAudioStream = streamsByType.get(ContentType.AUDIO);
    if (newAudioStream) {
      this.needSplitMuxedContent_ = newAudioStream.isAudioMuxedInVideo;
    }

    if (type == shaka.media.MediaSourceEngine.ResetMode_.NONE) {
      if (this.transmuxers_.has(contentType) && !transmuxer) {
        this.transmuxers_.get(contentType).destroy();
        this.transmuxers_.delete(contentType);
      } else if (!this.transmuxers_.has(contentType) && transmuxer) {
        this.transmuxers_.set(contentType, transmuxer);
      } else if (transmuxer) {
        // Compare if the transmuxer is different
        if (this.transmuxers_.has(contentType) &&
            this.transmuxers_.get(contentType).transmux !==
              transmuxer.transmux) {
          this.transmuxers_.get(contentType).destroy();
          this.transmuxers_.set(contentType, transmuxer);
        } else {
          transmuxer.destroy();
        }
      }
      return false;
    }

    if (type == shaka.media.MediaSourceEngine.ResetMode_.CHANGE_TYPE) {
      await this.changeType(contentType, newMimeType, transmuxer);
    } else if (type == shaka.media.MediaSourceEngine.ResetMode_.RESET) {
      if (transmuxer) {
        transmuxer.destroy();
      }
      await this.reset(streamsByType);
    }
    return true;
  }

  /**
   * Returns true if it's necessary reset the media source to load the
   * new stream.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {string} mimeType
   * @param {string} codecs
   * @return {boolean}
   */
  isResetMediaSourceNecessary(contentType, mimeType, codecs, streamsByType) {
    const info = this.getInfoAboutResetOrChangeType_(
        contentType, mimeType, codecs, streamsByType);
    if (info.transmuxer) {
      info.transmuxer.destroy();
    }
    return info.type == shaka.media.MediaSourceEngine.ResetMode_.RESET;
  }

  /**
   * Update LCEVC Decoder object when ready for LCEVC Decode.
   * @param {?shaka.lcevc.Dec} lcevcDec
   */
  updateLcevcDec(lcevcDec) {
    this.lcevcDec_ = lcevcDec;
  }

  /**
   * @param {string} mimeType
   * @return {string}
   * @private
   */
  addExtraFeaturesToMimeType_(mimeType) {
    const extraFeatures = this.config_.addExtraFeaturesToSourceBuffer(mimeType);
    const extendedType = mimeType + extraFeatures;
    shaka.log.debug('Using full mime type', extendedType);

    return extendedType;
  }
};


/**
 * Internal reference to window.URL.createObjectURL function to avoid
 * compatibility issues with other libraries and frameworks such as React
 * Native. For use in unit tests only, not meant for external use.
 *
 * @type {function(?):string}
 */
shaka.media.MediaSourceEngine.createObjectURL = window.URL.createObjectURL;


/**
 * @typedef {{
 *   start: function(),
 *   p: !shaka.util.PublicPromise,
 *   uri: ?string,
 * }}
 *
 * @summary An operation in queue.
 * @property {function()} start
 *   The function which starts the operation.
 * @property {!shaka.util.PublicPromise} p
 *   The PublicPromise which is associated with this operation.
 * @property {?string} uri
 *   A segment URI (if any) associated with this operation.
 */
shaka.media.MediaSourceEngine.Operation;


/**
 * @enum {string}
 * @private
 */
shaka.media.MediaSourceEngine.SourceBufferMode_ = {
  SEQUENCE: 'sequence',
  SEGMENTS: 'segments',
};


/**
 * @enum {string}
 * @private
 */
shaka.media.MediaSourceEngine.ResetMode_ = {
  NONE: 'none',
  RESET: 'reset',
  CHANGE_TYPE: 'changeType',
};


/**
 * @typedef {{
 *   getKeySystem: function():?string,
 *   onMetadata: function(!Array<shaka.extern.ID3Metadata>, number, ?number),
 *   onEmsg: function(!shaka.extern.EmsgInfo),
 *   onEvent: function(!Event),
 *   onManifestUpdate: function(),
 * }}
 *
 * @summary Player interface
 * @property {function():?string} getKeySystem
 *   Gets currently used key system or null if not used.
 * @property {function(
 *     !Array<shaka.extern.ID3Metadata>, number, ?number)} onMetadata
 *   Callback to use when metadata arrives.
 * @property {function(!shaka.extern.EmsgInfo)} onEmsg
 *   Callback to use when EMSG arrives.
 * @property {function(!Event)} onEvent
 *   Called when an event occurs that should be sent to the app.
 * @property {function()} onManifestUpdate
 *   Called when an embedded 'emsg' box should trigger a manifest update.
 */
shaka.media.MediaSourceEngine.PlayerInterface;
