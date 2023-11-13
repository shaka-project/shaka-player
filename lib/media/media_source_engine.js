/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.MediaSourceEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.config.CodecSwitchingStrategy');
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
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Functional');
goog.require('shaka.util.IDestroyable');
goog.require('shaka.util.Id3Utils');
goog.require('shaka.util.ManifestParserUtils');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.Mp4BoxParsers');
goog.require('shaka.util.Mp4Parser');
goog.require('shaka.util.Platform');
goog.require('shaka.util.PublicPromise');
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
   * @param {!function(!Array.<shaka.extern.ID3Metadata>, number, ?number)=}
   *    onMetadata
   * @param {?shaka.lcevc.Dec} [lcevcDec] Optional -  LCEVC Decoder Object
   *
   */
  constructor(video, textDisplayer, onMetadata, lcevcDec) {
    /** @private {HTMLMediaElement} */
    this.video_ = video;

    /** @private {?shaka.extern.MediaSourceConfiguration} */
    this.config_ = null;

    /** @private {shaka.extern.TextDisplayer} */
    this.textDisplayer_ = textDisplayer;

    /** @private {!Object.<shaka.util.ManifestParserUtils.ContentType,
                           SourceBuffer>} */
    this.sourceBuffers_ = {};

    /** @private {!Object.<shaka.util.ManifestParserUtils.ContentType,
                           string>} */
    this.sourceBufferTypes_ = {};


    /** @private {!Object.<shaka.util.ManifestParserUtils.ContentType,
                           boolean>} */
    this.expectedEncryption_ = {};

    /** @private {shaka.text.TextEngine} */
    this.textEngine_ = null;

    /** @private {boolean} */
    this.segmentRelativeVttTiming_ = false;

    const onMetadataNoOp = (metadata, timestampOffset, segmentEnd) => {};

    /** @private {!function(!Array.<shaka.extern.ID3Metadata>,
                    number, ?number)} */
    this.onMetadata_ = onMetadata || onMetadataNoOp;

    /** @private {?shaka.lcevc.Dec} */
    this.lcevcDec_ = lcevcDec || null;

    /**
     * @private {!Object.<string,
     *                    !Array.<shaka.media.MediaSourceEngine.Operation>>}
     */
    this.queues_ = {};

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {!Object.<string, !shaka.extern.Transmuxer>} */
    this.transmuxers_ = {};

    /** @private {?shaka.media.IClosedCaptionParser} */
    this.captionParser_ = null;

    /** @private {!shaka.util.PublicPromise} */
    this.mediaSourceOpen_ = new shaka.util.PublicPromise();

    /** @private {string} */
    this.url_ = '';

    /** @private {boolean} */
    this.playbackHasBegun_ = false;

    /** @private {(MediaSource|ManagedMediaSource)} */
    this.mediaSource_ = this.createMediaSource(this.mediaSourceOpen_);

    /** @private {boolean} */
    this.reloadingMediaSource_ = false;

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

    /** @private {!shaka.util.PublicPromise.<number>} */
    this.textSequenceModeOffset_ = new shaka.util.PublicPromise();

    /** @private {boolean} */
    this.needSplitMuxedContent_ = false;

    /** @private {boolean} */
    this.streamingAllowed_ = true;
  }

  /**
   * Create a MediaSource object, attach it to the video element, and return it.
   * Resolves the given promise when the MediaSource is ready.
   *
   * Replaced by unit tests.
   *
   * @param {!shaka.util.PublicPromise} p
   * @return {!(MediaSource|ManagedMediaSource)}
   */
  createMediaSource(p) {
    if (window.ManagedMediaSource) {
      this.video_.disableRemotePlayback = true;

      const mediaSource = new ManagedMediaSource();

      this.eventManager_.listenOnce(
          mediaSource, 'sourceopen', () => this.onSourceOpen_(p));

      this.eventManager_.listen(
          mediaSource, 'startstreaming', () => {
            this.streamingAllowed_ = true;
          });

      this.eventManager_.listen(
          mediaSource, 'endstreaming', () => {
            this.streamingAllowed_ = false;
          });

      // Correctly set when playback has begun.
      this.eventManager_.listenOnce(this.video_, 'playing', () => {
        this.playbackHasBegun_ = true;
      });

      this.url_ = shaka.media.MediaSourceEngine.createObjectURL(mediaSource);

      this.video_.src = this.url_;

      return mediaSource;
    } else {
      const mediaSource = new MediaSource();

      // Set up MediaSource on the video element.
      this.eventManager_.listenOnce(
          mediaSource, 'sourceopen', () => this.onSourceOpen_(p));

      // Correctly set when playback has begun.
      this.eventManager_.listenOnce(this.video_, 'playing', () => {
        this.playbackHasBegun_ = true;
      });

      // Store the object URL for releasing it later.
      this.url_ = shaka.media.MediaSourceEngine.createObjectURL(mediaSource);

      this.video_.src = this.url_;

      return mediaSource;
    }
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
   * Checks if a certain type is supported.
   *
   * @param {shaka.extern.Stream} stream
   * @return {boolean}
   */
  static isStreamSupported(stream) {
    const MimeUtils = shaka.util.MimeUtils;
    const fullMimeType = MimeUtils.getFullType(stream.mimeType, stream.codecs);
    const extendedMimeType = MimeUtils.getExtendedType(stream);
    const fullMimeTypeWithAllCodecs = MimeUtils.getFullTypeWithAllCodecs(
        stream.mimeType, stream.codecs);
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    return shaka.text.TextEngine.isTypeSupported(fullMimeType) ||
        shaka.media.Capabilities.isTypeSupported(extendedMimeType) ||
        TransmuxerEngine.isSupported(fullMimeTypeWithAllCodecs, stream.type);
  }

  /**
   * Returns a map of MediaSource support for well-known types.
   *
   * @return {!Object.<string, boolean>}
   */
  static probeSupport() {
    const testMimeTypes = [
      // MP4 types
      'video/mp4; codecs="avc1.42E01E"',
      'video/mp4; codecs="avc3.42E01E"',
      'video/mp4; codecs="hev1.1.6.L93.90"',
      'video/mp4; codecs="hvc1.1.6.L93.90"',
      'video/mp4; codecs="hev1.2.4.L153.B0"; eotf="smpte2084"',  // HDR HEVC
      'video/mp4; codecs="hvc1.2.4.L153.B0"; eotf="smpte2084"',  // HDR HEVC
      'video/mp4; codecs="vp9"',
      'video/mp4; codecs="vp09.00.10.08"',
      'video/mp4; codecs="av01.0.01M.08"',
      'video/mp4; codecs="dvh1.20.01"',
      'audio/mp4; codecs="mp4a.40.2"',
      'audio/mp4; codecs="ac-3"',
      'audio/mp4; codecs="ec-3"',
      'audio/mp4; codecs="ac-4"',
      'audio/mp4; codecs="opus"',
      'audio/mp4; codecs="flac"',
      'audio/mp4; codecs="dtsc"', // DTS Digital Surround
      'audio/mp4; codecs="dtse"', // DTS Express
      'audio/mp4; codecs="dtsx"', // DTS:X
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
      ...shaka.util.MimeUtils.RAW_FORMATS,
    ];

    const support = {};
    for (const type of testMimeTypes) {
      if (shaka.util.Platform.supportsMediaSource()) {
        // Our TextEngine is only effective for MSE platforms at the moment.
        if (shaka.text.TextEngine.isTypeSupported(type)) {
          support[type] = true;
        } else {
          support[type] = shaka.media.Capabilities.isTypeSupported(type) ||
                          shaka.transmuxer.TransmuxerEngine.isSupported(type);
        }
      } else {
        support[type] = shaka.util.Platform.supportsMediaType(type);
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

    for (const contentType in this.queues_) {
      // Make a local copy of the queue and the first item.
      const q = this.queues_[contentType];
      const inProgress = q[0];

      // Drop everything else out of the original queue.
      this.queues_[contentType] = q.slice(0, 1);

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
    if (this.textDisplayer_) {
      cleanup.push(this.textDisplayer_.destroy());
    }

    for (const contentType in this.transmuxers_) {
      cleanup.push(this.transmuxers_[contentType].destroy());
    }


    await Promise.all(cleanup);
    if (this.eventManager_) {
      this.eventManager_.release();
      this.eventManager_ = null;
    }

    if (this.video_) {
      // "unload" the video element.
      this.video_.removeAttribute('src');
      this.video_.load();
      this.video_ = null;
    }

    this.config_ = null;
    this.mediaSource_ = null;
    this.textEngine_ = null;
    this.textDisplayer_ = null;
    this.sourceBuffers_ = {};
    this.transmuxers_ = {};
    this.captionParser_ = null;
    if (goog.DEBUG) {
      for (const contentType in this.queues_) {
        goog.asserts.assert(
            this.queues_[contentType].length == 0,
            contentType + ' queue should be empty after destroy!');
      }
    }
    this.queues_ = {};

    // This object is owned by Player
    this.lcevcDec_ = null;
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
   * @param {!Map.<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   *   A map of content types to streams.  All streams must be supported
   *   according to MediaSourceEngine.isStreamSupported.
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

    this.sequenceMode_ = sequenceMode;
    this.manifestType_ = manifestType;
    this.ignoreManifestTimestampsInSegmentsMode_ =
      ignoreManifestTimestampsInSegmentsMode;

    this.attemptTimestampOffsetCalculation_ = !this.sequenceMode_ &&
        this.manifestType_ == shaka.media.ManifestParser.HLS &&
        !this.ignoreManifestTimestampsInSegmentsMode_;

    for (const contentType of streamsByType.keys()) {
      const stream = streamsByType.get(contentType);
      this.initSourceBuffer_(contentType, stream, stream.codecs);
      if (this.needSplitMuxedContent_) {
        this.queues_[ContentType.AUDIO] = [];
        this.queues_[ContentType.VIDEO] = [];
      } else {
        this.queues_[contentType] = [];
      }
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

    goog.asserts.assert(
        shaka.media.MediaSourceEngine.isStreamSupported(stream),
        'Type negotiation should happen before MediaSourceEngine.init!');

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
      const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
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
        const transmuxerPlugin =
            TransmuxerEngine.findTransmuxer(mimeTypeWithAllCodecs);
        if (transmuxerPlugin) {
          const transmuxer = transmuxerPlugin();
          this.transmuxers_[contentType] = transmuxer;
          mimeType =
              transmuxer.convertCodecs(contentType, mimeTypeWithAllCodecs);
        }
      }
      const type = mimeType + this.config_.sourceBufferExtraFeatures;

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
            ' expected \'open\'');
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
      this.sourceBuffers_[contentType] = sourceBuffer;
      this.sourceBufferTypes_[contentType] = mimeType;
      this.expectedEncryption_[contentType] = !!stream.drmInfos.length;
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
  }

  /**
   * Indicate if the streaming is allowed by MediaSourceEngine.
   * If we using MediaSource we allways returns true.
   *
   * @return {boolean}
   */
  isStreamingAllowed() {
    return this.streamingAllowed_;
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
   * Gets the first timestamp in buffer for the given content type.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {?number} The timestamp in seconds, or null if nothing is buffered.
   */
  bufferStart(contentType) {
    if (this.reloadingMediaSource_ ||
          !Object.keys(this.sourceBuffers_).length) {
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
    if (this.reloadingMediaSource_) {
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
    if (this.reloadingMediaSource_) {
      return false;
    }
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
    if (this.reloadingMediaSource_) {
      return 0;
    }
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
      audio: this.reloadingMediaSource_ ? [] :
        TimeRangesUtils.getBufferedInfo(this.getBuffered_(ContentType.AUDIO)),
      video: this.reloadingMediaSource_ ? [] :
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
    try {
      return this.sourceBuffers_[contentType].buffered;
    } catch (exception) {
      if (contentType in this.sourceBuffers_) {
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
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {!BufferSource} data
   * @param {?shaka.media.SegmentReference} reference The segment reference
   *   we are appending, or null for init segments
   * @param {!string} mimeType
   * @param {!number} timestampOffset
   * @return {?number}
   * @private
   */
  getTimestampAndDispatchMetadata_(contentType, data, reference, mimeType,
      timestampOffset) {
    let timestamp = null;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);
    if (shaka.util.MimeUtils.RAW_FORMATS.includes(mimeType)) {
      const frames = shaka.util.Id3Utils.getID3Frames(uint8ArrayData);
      if (frames.length && reference) {
        const metadataTimestamp = frames.find((frame) => {
          return frame.description ===
              'com.apple.streaming.transportStreamTimestamp';
        });
        if (metadataTimestamp && metadataTimestamp.data) {
          timestamp = Math.round(metadataTimestamp.data) / 1000;
        }
        /** @private {shaka.extern.ID3Metadata} */
        const metadata = {
          cueTime: reference.startTime,
          data: uint8ArrayData,
          frames: frames,
          dts: reference.startTime,
          pts: reference.startTime,
        };
        this.onMetadata_([metadata], /* offset= */ 0, reference.endTime);
      }
    } else if (mimeType.includes('/mp4') &&
        reference && reference.timestampOffset == 0 &&
        reference.initSegmentReference &&
        reference.initSegmentReference.timescale) {
      const timescale = reference.initSegmentReference.timescale;
      if (!isNaN(timescale)) {
        const Mp4Parser = shaka.util.Mp4Parser;
        let startTime = 0;
        let parsedMedia = false;
        new Mp4Parser()
            .box('moof', Mp4Parser.children)
            .box('traf', Mp4Parser.children)
            .fullBox('tfdt', (box) => {
              goog.asserts.assert(
                  box.version == 0 || box.version == 1,
                  'TFDT version can only be 0 or 1');
              const parsed = shaka.util.Mp4BoxParsers.parseTFDTInaccurate(
                  box.reader, box.version);
              startTime = parsed.baseMediaDecodeTime / timescale;
              parsedMedia = true;
              box.parser.stop();
            }).parse(data, /* partialOkay= */ true);
        if (parsedMedia) {
          timestamp = startTime;
        }
      }
    } else if (!mimeType.includes('/mp4') && !mimeType.includes('/webm') &&
        shaka.util.TsParser.probe(uint8ArrayData)) {
      const tsParser = new shaka.util.TsParser().parse(uint8ArrayData);
      const startTime = tsParser.getStartTime(contentType);
      if (startTime != null) {
        timestamp = startTime;
      }
      const metadata = tsParser.getMetadata();
      if (metadata.length) {
        this.onMetadata_(metadata, timestampOffset,
            reference ? reference.endTime : null);
      }
    }
    return timestamp;
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
   *   partial read of the segment.
   * @return {!Promise}
   */
  async appendBuffer(
      contentType, data, reference, stream, hasClosedCaptions, seeked = false,
      adaptation = false, isChunkedData = false, fromSplit = false) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    if (contentType == ContentType.TEXT) {
      if (this.sequenceMode_) {
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

    if (!this.sourceBuffers_[contentType]) {
      shaka.log.warning('Attempted to restore a non-existent source buffer');
      return;
    }

    let timestampOffset = this.sourceBuffers_[contentType].timestampOffset;

    let mimeType = this.sourceBufferTypes_[contentType];
    if (this.transmuxers_[contentType]) {
      mimeType = this.transmuxers_[contentType].getOriginalMimeType();
    }
    if (reference) {
      const timestamp = this.getTimestampAndDispatchMetadata_(
          contentType, data, reference, mimeType, timestampOffset);
      if (timestamp != null) {
        const calculatedTimestampOffset = reference.startTime - timestamp;
        const timestampOffsetDifference =
            Math.abs(timestampOffset - calculatedTimestampOffset);
        if ((timestampOffsetDifference >= 0.1 || seeked || adaptation) &&
            (!isChunkedData || calculatedTimestampOffset > 0 ||
            !timestampOffset)) {
          timestampOffset = calculatedTimestampOffset;
          if (this.attemptTimestampOffsetCalculation_) {
            this.enqueueOperation_(
                contentType,
                () => this.abort_(contentType));
            this.enqueueOperation_(
                contentType,
                () => this.setTimestampOffset_(contentType, timestampOffset));
          }
        }
        // Timestamps can only be reliably extracted from video, not audio.
        // Packed audio formats do not have internal timestamps at all.
        // Prefer video for this when available.
        const isBestSourceBufferForTimestamps =
            contentType == ContentType.VIDEO ||
            !(ContentType.VIDEO in this.sourceBuffers_);
        if (this.sequenceMode_ && isBestSourceBufferForTimestamps) {
          this.textSequenceModeOffset_.resolve(timestampOffset);
        }
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
        this.captionParser_.init(data);
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

    if (this.transmuxers_[contentType]) {
      data = await this.transmuxers_[contentType].transmux(
          data, stream, reference, this.mediaSource_.duration, contentType);
    }

    data = this.workAroundBrokenPlatforms_(
        data, reference ? reference.startTime : null, contentType);

    if (reference && this.sequenceMode_ && contentType != ContentType.TEXT) {
      // In sequence mode, for non-text streams, if we just cleared the buffer
      // and are either performing an unbuffered seek or handling an automatic
      // adaptation, we need to set a new timestampOffset on the sourceBuffer.
      if (seeked || adaptation) {
        const timestampOffset = reference.startTime;
        // The logic to call abort() before setting the timestampOffset is
        // extended during unbuffered seeks or automatic adaptations; it is
        // possible for the append state to be PARSING_MEDIA_SEGMENT from the
        // previous SourceBuffer#appendBuffer() call.
        this.enqueueOperation_(contentType, () => this.abort_(contentType));
        this.enqueueOperation_(
            contentType,
            () => this.setTimestampOffset_(contentType, timestampOffset));
      }
    }

    let bufferedBefore = null;

    await this.enqueueOperation_(contentType, () => {
      if (goog.DEBUG && reference && !reference.isPreload() && !isChunkedData) {
        bufferedBefore = this.getBuffered_(contentType);
      }
      this.append_(contentType, data, timestampOffset);
    });

    if (goog.DEBUG && reference && !reference.isPreload() && !isChunkedData) {
      const bufferedAfter = this.getBuffered_(contentType);
      const newBuffered = shaka.media.TimeRangesUtils.computeAddedRange(
          bufferedBefore, bufferedAfter);
      if (newBuffered) {
        const segmentDuration = reference.endTime - reference.startTime;
        // Check end times instead of start times.  We may be overwriting a
        // buffer and only the end changes, and that would be fine.
        // Also, exclude tiny segments.  Sometimes alignment segments as small
        // as 33ms are seen in Google DAI content.  For such tiny segments,
        // half a segment duration would be no issue.
        const offset = Math.abs(newBuffered.end - reference.endTime);
        if (segmentDuration > 0.100 && offset > segmentDuration / 2) {
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
   * @return {!Promise}
   */
  async remove(contentType, startTime, endTime) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      await this.textEngine_.remove(startTime, endTime);
    } else {
      await this.enqueueOperation_(
          contentType,
          () => this.remove_(contentType, startTime, endTime));
      if (this.needSplitMuxedContent_) {
        await this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.remove_(ContentType.AUDIO, startTime, endTime));
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
          () => this.remove_(contentType, 0, this.mediaSource_.duration));
      if (this.needSplitMuxedContent_) {
        await this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.remove_(
                ContentType.AUDIO, 0, this.mediaSource_.duration));
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
        () => this.flush_(contentType));
    if (this.needSplitMuxedContent_) {
      await this.enqueueOperation_(
          ContentType.AUDIO,
          () => this.flush_(ContentType.AUDIO));
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
   * @param {shaka.extern.Stream} stream The current stream.
   * @param {!Map.<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   *   A map of content types to streams.  All streams must be supported
   *   according to MediaSourceEngine.isStreamSupported.
   *
   * @return {!Promise}
   */
  async setStreamProperties(
      contentType, timestampOffset, appendWindowStart, appendWindowEnd,
      ignoreTimestampOffset, stream, streamsByType) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      if (!ignoreTimestampOffset) {
        this.textEngine_.setTimestampOffset(timestampOffset);
      }
      this.textEngine_.setAppendWindow(appendWindowStart, appendWindowEnd);
      return;
    }
    const operations = [];

    const hasChangedCodecs =
        await this.codecSwitchIfNecessary_(contentType, stream, streamsByType);

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
          () => this.abort_(contentType)));
      if (this.needSplitMuxedContent_) {
        operations.push(this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.abort_(ContentType.AUDIO)));
      }
    }
    if (!ignoreTimestampOffset) {
      operations.push(this.enqueueOperation_(
          contentType,
          () => this.setTimestampOffset_(contentType, timestampOffset)));
      if (this.needSplitMuxedContent_) {
        operations.push(this.enqueueOperation_(
            ContentType.AUDIO,
            () => this.setTimestampOffset_(
                ContentType.AUDIO, timestampOffset)));
      }
    }
    operations.push(this.enqueueOperation_(
        contentType,
        () => this.setAppendWindow_(
            contentType, appendWindowStart, appendWindowEnd)));
    if (this.needSplitMuxedContent_) {
      operations.push(this.enqueueOperation_(
          ContentType.AUDIO,
          () => this.setAppendWindow_(
              ContentType.AUDIO, appendWindowStart, appendWindowEnd)));
    }

    await Promise.all(operations);
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
        () => this.abort_(contentType));
    if (this.needSplitMuxedContent_) {
      this.enqueueOperation_(
          ContentType.AUDIO,
          () => this.abort_(ContentType.AUDIO));
    }
    await this.enqueueOperation_(
        contentType,
        () => this.setTimestampOffset_(contentType, timestampOffset));
    if (this.needSplitMuxedContent_) {
      await this.enqueueOperation_(
          ContentType.AUDIO,
          () => this.setTimestampOffset_(ContentType.AUDIO, timestampOffset));
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
      if (this.ended() || this.mediaSource_.readyState === 'closed') {
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
      // Reducing the duration causes the MSE removal algorithm to run, which
      // triggers an 'updateend' event to fire.  To handle this scenario, we
      // have to insert a dummy operation into the beginning of each queue,
      // which the 'updateend' handler will remove.
      if (duration < this.mediaSource_.duration) {
        for (const contentType in this.sourceBuffers_) {
          const dummyOperation = {
            start: () => {},
            p: new shaka.util.PublicPromise(),
          };
          this.queues_[contentType].unshift(dummyOperation);
        }
      }

      this.mediaSource_.duration = duration;
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
   * Append data to the SourceBuffer.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {BufferSource} data
   * @param {number} timestampOffset
   * @private
   */
  append_(contentType, data, timestampOffset) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // Append only video data to the LCEVC Dec.
    if (contentType == ContentType.VIDEO && this.lcevcDec_) {
      // Append video buffers to the LCEVC Dec for parsing and storing
      // of LCEVC data.
      this.lcevcDec_.appendBuffer(data, timestampOffset);
    }

    // This will trigger an 'updateend' event.
    this.sourceBuffers_[contentType].appendBuffer(data);
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
    this.sourceBuffers_[contentType].remove(startTime, endTime);
  }

  /**
   * Call abort() on the SourceBuffer.
   * This resets MSE's last_decode_timestamp on all track buffers, which should
   * trigger the splicing logic for overlapping segments.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  abort_(contentType) {
    // Save the append window, which is reset on abort().
    const appendWindowStart =
        this.sourceBuffers_[contentType].appendWindowStart;
    const appendWindowEnd = this.sourceBuffers_[contentType].appendWindowEnd;

    // This will not trigger an 'updateend' event, since nothing is happening.
    // This is only to reset MSE internals, not to abort an actual operation.
    this.sourceBuffers_[contentType].abort();

    // Restore the append window.
    this.sourceBuffers_[contentType].appendWindowStart = appendWindowStart;
    this.sourceBuffers_[contentType].appendWindowEnd = appendWindowEnd;

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

    this.sourceBuffers_[contentType].timestampOffset = timestampOffset;

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
    // You can't set start > end, so first set start to 0, then set the new
    // end, then set the new start.  That way, there are no intermediate
    // states which are invalid.
    this.sourceBuffers_[contentType].appendWindowStart = 0;
    this.sourceBuffers_[contentType].appendWindowEnd = appendWindowEnd;
    this.sourceBuffers_[contentType].appendWindowStart = appendWindowStart;

    // Fake an 'updateend' event to resolve the operation.
    this.onUpdateEnd_(contentType);
  }

  /**
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  onError_(contentType) {
    const operation = this.queues_[contentType][0];
    goog.asserts.assert(operation, 'Spurious error event!');
    goog.asserts.assert(!this.sourceBuffers_[contentType].updating,
        'SourceBuffer should not be updating on error!');
    const code = this.video_.error ? this.video_.error.code : 0;
    operation.p.reject(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.MEDIA,
        shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_FAILED,
        code));
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
    if (this.reloadingMediaSource_) {
      return;
    }
    const operation = this.queues_[contentType][0];
    goog.asserts.assert(operation, 'Spurious updateend event!');
    if (!operation) {
      return;
    }
    goog.asserts.assert(!this.sourceBuffers_[contentType].updating,
        'SourceBuffer should not be updating on updateend!');
    operation.p.resolve();
    this.popFromQueue_(contentType);
  }

  /**
   * Enqueue an operation and start it if appropriate.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {function()} start
   * @return {!Promise}
   * @private
   */
  enqueueOperation_(contentType, start) {
    this.destroyer_.ensureNotDestroyed();
    const operation = {
      start: start,
      p: new shaka.util.PublicPromise(),
    };
    this.queues_[contentType].push(operation);

    if (this.queues_[contentType].length == 1) {
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

    /** @type {!Array.<!shaka.util.PublicPromise>} */
    const allWaiters = [];

    // Enqueue a 'wait' operation onto each queue.
    // This operation signals its readiness when it starts.
    // When all wait operations are ready, the real operation takes place.
    for (const contentType in this.sourceBuffers_) {
      const ready = new shaka.util.PublicPromise();
      const operation = {
        start: () => ready.resolve(),
        p: ready,
      };

      this.queues_[contentType].push(operation);
      allWaiters.push(ready);

      if (this.queues_[contentType].length == 1) {
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
        for (const contentType in this.sourceBuffers_) {
          if (this.queues_[contentType].length) {
            goog.asserts.assert(
                this.queues_[contentType].length == 1,
                'Should be at most one item in queue!');
            goog.asserts.assert(
                allWaiters.includes(this.queues_[contentType][0].p),
                'The item in queue should be one of our waiters!');
            this.queues_[contentType].shift();
          }
        }
      }
      throw error;
    }

    if (goog.DEBUG) {
      // If we did it correctly, nothing is updating.
      for (const contentType in this.sourceBuffers_) {
        goog.asserts.assert(
            this.sourceBuffers_[contentType].updating == false,
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
          this.video_.error || 'No error in the media element');
    } finally {
      // Unblock the queues.
      for (const contentType in this.sourceBuffers_) {
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
    // Remove the in-progress operation, which is now complete.
    this.queues_[contentType].shift();
    this.startOperation_(contentType);
  }

  /**
   * Starts the next operation in the queue.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @private
   */
  startOperation_(contentType) {
    // Retrieve the next operation, if any, from the queue and start it.
    const next = this.queues_[contentType][0];
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
        } else {
          next.p.reject(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MEDIA,
              shaka.util.Error.Code.MEDIA_SOURCE_OPERATION_THREW,
              exception,
              this.video_.error || 'No error in the media element'));
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
    const oldTextDisplayer = this.textDisplayer_;
    this.textDisplayer_ = textDisplayer;
    if (oldTextDisplayer) {
      textDisplayer.setTextVisibility(oldTextDisplayer.isTextVisible());
      oldTextDisplayer.destroy();
    }
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
   * @param {!BufferSource} segment
   * @param {?number} startTime
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {!BufferSource}
   * @private
   */
  workAroundBrokenPlatforms_(segment, startTime, contentType) {
    const isInitSegment = startTime == null;
    const encryptionExpected = this.expectedEncryption_[contentType];

    // If:
    //   1. the configuration tells to insert fake encryption,
    //   2. and this is an init segment,
    //   3. and encryption is expected,
    //   4. and the platform requires encryption in all init segments,
    //   5. and the content is MP4 (mimeType == "video/mp4" or "audio/mp4"),
    // then insert fake encryption metadata for init segments that lack it.
    // The MP4 requirement is because we can currently only do this
    // transformation on MP4 containers.
    // See: https://github.com/shaka-project/shaka-player/issues/2759
    if (this.config_.insertFakeEncryptionInInit &&
        isInitSegment &&
        encryptionExpected &&
        shaka.util.Platform.requiresEncryptionInfoInAllInitSegments() &&
        shaka.util.MimeUtils.getContainerType(
            this.sourceBufferTypes_[contentType]) == 'mp4') {
      shaka.log.debug('Forcing fake encryption information in init segment.');
      segment = shaka.media.ContentWorkarounds.fakeEncryption(segment);
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
    shaka.log.debug(
        `Change Type: ${this.sourceBufferTypes_[contentType]} -> ${mimeType}`);
    if (shaka.media.Capabilities.isChangeTypeSupported()) {
      if (this.transmuxers_[contentType]) {
        this.transmuxers_[contentType].destroy();
      }
      if (transmuxer) {
        this.transmuxers_[contentType] = transmuxer;
      }
      const type = mimeType + this.config_.sourceBufferExtraFeatures;
      this.sourceBuffers_[contentType].changeType(type);
      this.sourceBufferTypes_[contentType] = mimeType;
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
        () => this.change_(contentType, mimeType, transmuxer));
  }

  /**
   * Resets the MediaSource and re-adds source buffers due to codec mismatch
   *
   * @param {!Map.<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   * @private
   */
  async reset_(streamsByType) {
    const Functional = shaka.util.Functional;
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    this.reloadingMediaSource_ = true;
    this.needSplitMuxedContent_ = false;
    const currentTime = this.video_.currentTime;

    // When codec switching if the user is currently paused we don't want
    // to trigger a play when switching codec.
    // Playing can also end up in a paused state after a codec switch
    // so we need to remember the current states.
    const previousAutoPlayState = this.video_.autoplay;
    const previousPausedState = this.video_.paused;
    if (this.playbackHasBegun_) {
      // Only set autoplay to false if the video playback has already begun.
      // When a codec switch happens before playback has begun this can cause
      // autoplay not to work as expected.
      this.video_.autoplay = false;
    }

    try {
      this.eventManager_.removeAll();

      const cleanup = [];
      for (const contentType in this.transmuxers_) {
        cleanup.push(this.transmuxers_[contentType].destroy());
      }
      for (const contentType in this.queues_) {
        // Make a local copy of the queue and the first item.
        const q = this.queues_[contentType];
        const inProgress = q[0];

        // Drop everything else out of the original queue.
        this.queues_[contentType] = q.slice(0, 1);

        // We will wait for this item to complete/fail.
        if (inProgress) {
          cleanup.push(inProgress.p.catch(Functional.noop));
        }

        // The rest will be rejected silently if possible.
        for (const item of q.slice(1)) {
          item.p.reject(shaka.util.Destroyer.destroyedError());
        }
      }
      for (const contentType in this.sourceBuffers_) {
        const sourceBuffer = this.sourceBuffers_[contentType];
        try {
          this.mediaSource_.removeSourceBuffer(sourceBuffer);
        } catch (e) {}
      }
      await Promise.all(cleanup);
      this.transmuxers_ = {};
      this.sourceBuffers_ = {};

      const previousDuration = this.mediaSource_.duration;
      this.mediaSourceOpen_ = new shaka.util.PublicPromise();
      this.mediaSource_ = this.createMediaSource(this.mediaSourceOpen_);
      await this.mediaSourceOpen_;
      this.mediaSource_.duration = previousDuration;

      const sourceBufferAdded = new shaka.util.PublicPromise();
      const sourceBuffers =
        /** @type {EventTarget} */(this.mediaSource_.sourceBuffers);

      const totalOfBuffers = streamsByType.size;
      let numberOfSourceBufferAdded = 0;
      this.eventManager_.listen(sourceBuffers, 'addsourcebuffer', (event) => {
        numberOfSourceBufferAdded++;
        if (numberOfSourceBufferAdded === totalOfBuffers) {
          sourceBufferAdded.resolve();
        }
      });

      for (const contentType of streamsByType.keys()) {
        const stream = streamsByType.get(contentType);
        this.initSourceBuffer_(contentType, stream, stream.codecs);
        if (this.needSplitMuxedContent_) {
          this.queues_[ContentType.AUDIO] = [];
          this.queues_[ContentType.VIDEO] = [];
        } else {
          this.queues_[contentType] = [];
        }
      }

      // Fake a seek to catchup the playhead.
      this.video_.currentTime = currentTime;

      await sourceBufferAdded;
    } finally {
      this.reloadingMediaSource_ = false;

      this.destroyer_.ensureNotDestroyed();

      this.eventManager_.listenOnce(this.video_, 'canplay', () => {
        this.destroyer_.ensureNotDestroyed();

        this.video_.autoplay = previousAutoPlayState;
        if (!previousPausedState) {
          this.video_.play();
        }
      });
    }
  }

  /**
   * Resets the Media Source
   * @param {!Map.<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   * @return {!Promise}
   */
  reset(streamsByType) {
    return this.enqueueBlockingOperation_(
        () => this.reset_(streamsByType));
  }

  /**
   * Codec switch if necessary, this will not resolve until the codec
   * switch is over.
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {shaka.extern.Stream} stream
   * @param {!Map.<shaka.util.ManifestParserUtils.ContentType,
   *               shaka.extern.Stream>} streamsByType
   * @return {!Promise.<boolean>} true if there was a codec switch,
   *                              false otherwise.
   * @private
   */
  async codecSwitchIfNecessary_(contentType, stream, streamsByType) {
    if (contentType == shaka.util.ManifestParserUtils.ContentType.TEXT) {
      return false;
    }
    const MimeUtils = shaka.util.MimeUtils;
    const currentCodec = MimeUtils.getCodecBase(
        MimeUtils.getCodecs(this.sourceBufferTypes_[contentType]));
    const currentBasicType = MimeUtils.getBasicType(
        this.sourceBufferTypes_[contentType]);

    /** @type {?shaka.extern.Transmuxer} */
    let transmuxer;
    let newMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    let needTransmux = this.config_.forceTransmux;
    if (!shaka.media.Capabilities.isTypeSupported(newMimeType) ||
        (!this.sequenceMode_ &&
        shaka.util.MimeUtils.RAW_FORMATS.includes(newMimeType))) {
      needTransmux = true;
    }
    const newMimeTypeWithAllCodecs =
        shaka.util.MimeUtils.getFullTypeWithAllCodecs(
            stream.mimeType, stream.codecs);
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    if (needTransmux) {
      const transmuxerPlugin =
          TransmuxerEngine.findTransmuxer(newMimeTypeWithAllCodecs);
      if (transmuxerPlugin) {
        transmuxer = transmuxerPlugin();
        newMimeType =
            transmuxer.convertCodecs(contentType, newMimeTypeWithAllCodecs);
      }
    }

    const newCodec = MimeUtils.getCodecBase(
        MimeUtils.getCodecs(newMimeType));
    const newBasicType = MimeUtils.getBasicType(newMimeType);

    // Current/new codecs base and basic type match then no need to switch
    if (currentCodec === newCodec && currentBasicType === newBasicType) {
      return false;
    }

    if (this.config_.codecSwitchingStrategy ===
        shaka.config.CodecSwitchingStrategy.SMOOTH &&
          shaka.media.Capabilities.isChangeTypeSupported() &&
            !this.needSplitMuxedContent_) {
      await this.changeType(contentType, newMimeType, transmuxer);
    } else {
      if (transmuxer) {
        transmuxer.destroy();
      }
      await this.reset(streamsByType);
    }
    return true;
  }

  /**
   * Returns true if it's necessary codec switch to load the new stream.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {shaka.extern.Stream} stream
   * @return {boolean}
   * @private
   */
  isCodecSwitchNecessary_(contentType, stream) {
    if (contentType == shaka.util.ManifestParserUtils.ContentType.TEXT) {
      return false;
    }
    const MimeUtils = shaka.util.MimeUtils;
    const currentCodec = MimeUtils.getCodecBase(
        MimeUtils.getCodecs(this.sourceBufferTypes_[contentType]));
    const currentBasicType = MimeUtils.getBasicType(
        this.sourceBufferTypes_[contentType]);

    let newMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    let needTransmux = this.config_.forceTransmux;
    if (!shaka.media.Capabilities.isTypeSupported(newMimeType) ||
        (!this.sequenceMode_ &&
        shaka.util.MimeUtils.RAW_FORMATS.includes(newMimeType))) {
      needTransmux = true;
    }
    const newMimeTypeWithAllCodecs =
        shaka.util.MimeUtils.getFullTypeWithAllCodecs(
            stream.mimeType, stream.codecs);
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    if (needTransmux) {
      const transmuxerPlugin =
          TransmuxerEngine.findTransmuxer(newMimeTypeWithAllCodecs);
      if (transmuxerPlugin) {
        const transmuxer = transmuxerPlugin();
        newMimeType =
            transmuxer.convertCodecs(contentType, newMimeTypeWithAllCodecs);
        transmuxer.destroy();
      }
    }

    const newCodec = MimeUtils.getCodecBase(
        MimeUtils.getCodecs(newMimeType));
    const newBasicType = MimeUtils.getBasicType(newMimeType);

    return currentCodec !== newCodec || currentBasicType !== newBasicType;
  }

  /**
   * Returns true if it's necessary reset the media source to load the
   * new stream.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @param {shaka.extern.Stream} stream
   * @return {boolean}
   */
  isResetMediaSourceNecessary(contentType, stream) {
    if (!this.isCodecSwitchNecessary_(contentType, stream)) {
      return false;
    }

    return this.config_.codecSwitchingStrategy !==
        shaka.config.CodecSwitchingStrategy.SMOOTH ||
        !shaka.media.Capabilities.isChangeTypeSupported() ||
        this.needSplitMuxedContent_;
  }

  /**
   * Update LCEVC Decoder object when ready for LCEVC Decode.
   * @param {?shaka.lcevc.Dec} lcevcDec
   */
  updateLcevcDec(lcevcDec) {
    this.lcevcDec_ = lcevcDec;
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
 *   p: !shaka.util.PublicPromise
 * }}
 *
 * @summary An operation in queue.
 * @property {function()} start
 *   The function which starts the operation.
 * @property {!shaka.util.PublicPromise} p
 *   The PublicPromise which is associated with this operation.
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
