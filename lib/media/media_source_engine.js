/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.MediaSourceEngine');

goog.require('goog.asserts');
goog.require('shaka.log');
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
goog.require('shaka.lcevc.Dil');


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
   * @param {?shaka.lcevc.Dil} [lcevcDil] Optional -  LCEVC Dil Object
   *
   */
  constructor(video, textDisplayer, onMetadata, lcevcDil) {
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

    /** @private {?shaka.lcevc.Dil} */
    this.lcevcDil_ = lcevcDil || null;

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

    /** @private {MediaSource} */
    this.mediaSource_ = this.createMediaSource(this.mediaSourceOpen_);

    /** @type {!shaka.util.Destroyer} */
    this.destroyer_ = new shaka.util.Destroyer(() => this.doDestroy_());

    /** @private {string} */
    this.url_ = '';

    /** @private {boolean} */
    this.sequenceMode_ = false;

    /** @private {string} */
    this.manifestType_ = shaka.media.ManifestParser.UNKNOWN;

    /** @private {boolean} */
    this.ignoreManifestTimestampsInSegmentsMode_ = false;

    /** @private {!shaka.util.PublicPromise.<number>} */
    this.textSequenceModeOffset_ = new shaka.util.PublicPromise();
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
    const mediaSource = new MediaSource();

    // Set up MediaSource on the video element.
    this.eventManager_.listenOnce(
        mediaSource, 'sourceopen', () => this.onSourceOpen_(p));

    // Store the object URL for releasing it later.
    this.url_ = shaka.media.MediaSourceEngine.createObjectURL(mediaSource);

    this.video_.src = this.url_;

    return mediaSource;
  }

  /**
   * @param {!shaka.util.PublicPromise} p
   * @private
   */
  onSourceOpen_(p) {
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
    const fullMimeType = shaka.util.MimeUtils.getFullType(
        stream.mimeType, stream.codecs);
    const extendedMimeType = shaka.util.MimeUtils.getExtendedType(stream);
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    return shaka.text.TextEngine.isTypeSupported(fullMimeType) ||
        shaka.media.Capabilities.isTypeSupported(extendedMimeType) ||
        TransmuxerEngine.isSupported(fullMimeType, stream.type);
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
      'audio/mp4; codecs="mp4a.40.2"',
      'audio/mp4; codecs="ac-3"',
      'audio/mp4; codecs="ec-3"',
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
      ...shaka.media.MediaSourceEngine.RAW_FORMATS,
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
    this.lcevcDil_ = null;
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

    for (const contentType of streamsByType.keys()) {
      const stream = streamsByType.get(contentType);
      goog.asserts.assert(
          shaka.media.MediaSourceEngine.isStreamSupported(stream),
          'Type negotiation should happen before MediaSourceEngine.init!');

      let mimeType = shaka.util.MimeUtils.getFullType(
          stream.mimeType, stream.codecs);
      if (contentType == ContentType.TEXT) {
        this.reinitText(mimeType, sequenceMode);
      } else {
        let needTransmux = this.config_.forceTransmux;
        if (!shaka.media.Capabilities.isTypeSupported(mimeType) ||
            (!sequenceMode &&
            shaka.media.MediaSourceEngine.RAW_FORMATS.includes(mimeType))) {
          needTransmux = true;
        }
        const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
        if (needTransmux &&
          TransmuxerEngine.isSupported(mimeType, contentType)) {
          const transmuxerPlugin = TransmuxerEngine.findTransmuxer(mimeType);
          if (transmuxerPlugin) {
            const transmuxer = transmuxerPlugin();
            this.transmuxers_[contentType] = transmuxer;
            mimeType = transmuxer.convertCodecs(contentType, mimeType);
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
              'The mediaSource_ status was' + this.mediaSource_.readyState +
              'expected \'open\'');
        }

        this.eventManager_.listen(
            sourceBuffer, 'error',
            () => this.onError_(contentType));
        this.eventManager_.listen(
            sourceBuffer, 'updateend',
            () => this.onUpdateEnd_(contentType));
        this.sourceBuffers_[contentType] = sourceBuffer;
        this.sourceBufferTypes_[contentType] = mimeType;
        this.queues_[contentType] = [];
        this.expectedEncryption_[contentType] = !!stream.drmInfos.length;
      }
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
   * Reinitialize the TextEngine for a new text type.
   * @param {string} mimeType
   * @param {boolean} sequenceMode
   */
  reinitText(mimeType, sequenceMode) {
    if (!this.textEngine_) {
      this.textEngine_ = new shaka.text.TextEngine(this.textDisplayer_);
    }
    this.textEngine_.initParser(mimeType, sequenceMode,
        this.segmentRelativeVttTiming_);
  }

  /**
   * @return {boolean} True if the MediaSource is in an "ended" state, or if the
   *   object has been destroyed.
   */
  ended() {
    return this.mediaSource_ ? this.mediaSource_.readyState == 'ended' : true;
  }

  /**
   * Gets the first timestamp in buffer for the given content type.
   *
   * @param {shaka.util.ManifestParserUtils.ContentType} contentType
   * @return {?number} The timestamp in seconds, or null if nothing is buffered.
   */
  bufferStart(contentType) {
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
      total: TimeRangesUtils.getBufferedInfo(this.video_.buffered),
      audio: TimeRangesUtils.getBufferedInfo(
          this.getBuffered_(ContentType.AUDIO)),
      video: TimeRangesUtils.getBufferedInfo(
          this.getBuffered_(ContentType.VIDEO)),
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
   * @return {!Promise}
   */
  async appendBuffer(
      contentType, data, reference, stream, hasClosedCaptions, seeked = false,
      adaptation = false) {
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
          reference ? reference.endTime : null);
      return;
    }

    const attemptTimestampOffsetCalculation = !this.sequenceMode_ &&
        this.manifestType_ == shaka.media.ManifestParser.HLS &&
        !this.ignoreManifestTimestampsInSegmentsMode_;

    let timestampOffset = this.sourceBuffers_[contentType].timestampOffset;

    const uint8ArrayData = shaka.util.BufferUtils.toUint8(data);
    let mimeType = this.sourceBufferTypes_[contentType];
    if (this.transmuxers_[contentType]) {
      mimeType = this.transmuxers_[contentType].getOrginalMimeType();
    }
    if (shaka.media.MediaSourceEngine.RAW_FORMATS.includes(mimeType)) {
      const frames = shaka.util.Id3Utils.getID3Frames(uint8ArrayData);
      if (frames.length && reference) {
        if (attemptTimestampOffsetCalculation) {
          const metadataTimestamp = frames.find((frame) => {
            return frame.description ===
                'com.apple.streaming.transportStreamTimestamp';
          });
          if (metadataTimestamp && metadataTimestamp.data) {
            const calculatedTimestampOffset = reference.startTime -
                Math.round(metadataTimestamp.data) / 1000;
            const timestampOffsetDifference =
                Math.abs(timestampOffset - calculatedTimestampOffset);
            if (timestampOffsetDifference >= 0.01 || seeked || adaptation) {
              timestampOffset = calculatedTimestampOffset;
              this.enqueueOperation_(contentType, () =>
                this.abort_(contentType));
              this.enqueueOperation_(
                  contentType,
                  () => this.setTimestampOffset_(
                      contentType, timestampOffset));
            }
          }
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
    } else if (attemptTimestampOffsetCalculation &&
        mimeType.includes('/mp4') &&
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

              const parsedTFDTBox = shaka.util.Mp4BoxParsers.parseTFDT(
                  box.reader, box.version);
              const baseTime = parsedTFDTBox.baseMediaDecodeTime;
              startTime = baseTime / timescale;
              parsedMedia = true;
              box.parser.stop();
            }).parse(data, /* partialOkay= */ true);
        if (parsedMedia) {
          const calculatedTimestampOffset = reference.startTime - startTime;
          const timestampOffsetDifference =
              Math.abs(timestampOffset - calculatedTimestampOffset);
          if (timestampOffsetDifference >= 0.01 || seeked || adaptation) {
            timestampOffset = calculatedTimestampOffset;
            this.enqueueOperation_(contentType, () => this.abort_(contentType));
            this.enqueueOperation_(
                contentType,
                () => this.setTimestampOffset_(contentType, timestampOffset));
          }
        }
      }
    } else if (shaka.util.TsParser.probe(uint8ArrayData)) {
      const tsParser = new shaka.util.TsParser().parse(uint8ArrayData);
      const startTime = tsParser.getStartTime()[contentType];
      if (startTime != null) {
        const calculatedTimestampOffset = reference.startTime - startTime;
        const timestampOffsetDifference =
            Math.abs(timestampOffset - calculatedTimestampOffset);
        if (timestampOffsetDifference >= 0.01 || seeked || adaptation) {
          timestampOffset = calculatedTimestampOffset;
          // The SourceBuffer timestampOffset may or may not be set yet,
          // so this is the timestamp offset that would eventually compute
          // for this segment either way.
          if (attemptTimestampOffsetCalculation) {
            this.enqueueOperation_(contentType, () => this.abort_(contentType));
            this.enqueueOperation_(
                contentType,
                () => this.setTimestampOffset_(contentType, timestampOffset));
          }
        }
      }
      const metadata = tsParser.getMetadata();
      if (metadata.length) {
        this.onMetadata_(metadata, timestampOffset,
            reference ? reference.endTime : null);
      }
    }
    if (hasClosedCaptions && contentType == ContentType.VIDEO) {
      if (!this.textEngine_) {
        this.reinitText('text/vtt', this.sequenceMode_);
      }
      if (!this.captionParser_) {
        this.captionParser_ = this.getCaptionParser(mimeType);
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
          data, stream, reference);
    }

    data = this.workAroundBrokenPlatforms_(
        data, reference ? reference.startTime : null, contentType);

    const sourceBuffer = this.sourceBuffers_[contentType];
    const SEQUENCE = shaka.media.MediaSourceEngine.SourceBufferMode_.SEQUENCE;

    if (this.sequenceMode_ && sourceBuffer.mode != SEQUENCE && reference) {
      // This is the first media segment to be appended to a SourceBuffer in
      // sequence mode.  We set the mode late so that we can trick MediaSource
      // into extracting a timestamp for us to align text segments in sequence
      // mode.

      const duration = this.mediaSource_.duration;

      // Timestamps can only be reliably extracted from video, not audio.
      // Packed audio formats do not have internal timestamps at all.
      // Prefer video for this when available.
      const isBestSourceBufferForTimestamps =
          contentType == ContentType.VIDEO ||
          !(ContentType.VIDEO in this.sourceBuffers_);
      if (isBestSourceBufferForTimestamps) {
        // Append the segment in segments mode first, with offset of 0 and an
        // open append window.
        const originalRange =
            [sourceBuffer.appendWindowStart, sourceBuffer.appendWindowEnd];
        sourceBuffer.appendWindowStart = 0;
        sourceBuffer.appendWindowEnd = Infinity;

        const originalOffset = sourceBuffer.timestampOffset;
        sourceBuffer.timestampOffset = 0;

        await this.enqueueOperation_(
            contentType, () => this.append_(contentType, data));
        // If the input buffer passed to SourceBuffer#appendBuffer() does not
        // contain a complete media segment, the call will exit while the
        // SourceBuffer's append state is
        // still PARSING_MEDIA_SEGMENT. Reset the parser state by calling
        // abort() to safely reset timestampOffset to 'originalOffset'.
        // https://www.w3.org/TR/media-source-2/#sourcebuffer-segment-parser-loop
        await this.enqueueOperation_(
            contentType, () => this.abort_(contentType));

        // Reset the offset and append window.
        sourceBuffer.timestampOffset = originalOffset;
        sourceBuffer.appendWindowStart = originalRange[0];
        sourceBuffer.appendWindowEnd = originalRange[1];

        // Now get the timestamp of the segment and compute the offset for text
        // segments.
        const mediaStartTime = shaka.media.TimeRangesUtils.bufferStart(
            this.getBuffered_(contentType));
        const textOffset = (reference.startTime || 0) - (mediaStartTime || 0);
        this.textSequenceModeOffset_.resolve(textOffset);

        // Clear the buffer.
        await this.enqueueOperation_(
            contentType,
            () => this.remove_(contentType, 0, duration));

        // Finally, flush the buffer in case of choppy video start on HLS fMP4.
        if (contentType == ContentType.VIDEO) {
          await this.enqueueOperation_(
              contentType,
              () => this.flush_(contentType));
        }
      }

      // Now switch to sequence mode and fall through to our normal operations.
      sourceBuffer.mode = SEQUENCE;

      // When we change the buffer mode the duration is lost, so we need to set
      // it explicitly.
      await this.setDuration(duration);
    }

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
      if (goog.DEBUG && reference) {
        bufferedBefore = this.getBuffered_(contentType);
      }
      this.append_(contentType, data);
    });

    if (goog.DEBUG && reference) {
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
   * @param {boolean} sequenceMode  If true, the timestampOffset will not be
   *   applied in this step.
   * @return {!Promise}
   */
  async setStreamProperties(
      contentType, timestampOffset, appendWindowStart, appendWindowEnd,
      sequenceMode) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;
    if (contentType == ContentType.TEXT) {
      if (!sequenceMode) {
        this.textEngine_.setTimestampOffset(timestampOffset);
      }
      this.textEngine_.setAppendWindow(appendWindowStart, appendWindowEnd);
      return;
    }

    await Promise.all([
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
          () => this.abort_(contentType)),
      // Don't set the timestampOffset here when in sequenceMode, since we
      // use timestampOffset for a different purpose in that mode (e.g. to
      // indicate where the current segment is).
      sequenceMode ? Promise.resolve() : this.enqueueOperation_(
          contentType,
          () => this.setTimestampOffset_(contentType, timestampOffset)),
      this.enqueueOperation_(
          contentType,
          () => this.setAppendWindow_(
              contentType, appendWindowStart, appendWindowEnd)),
    ]);
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
    await this.enqueueOperation_(
        contentType,
        () => this.setTimestampOffset_(contentType, timestampOffset));
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
   * @private
   */
  append_(contentType, data) {
    const ContentType = shaka.util.ManifestParserUtils.ContentType;

    // Append only video data to the LCEVC Dil.
    if (contentType == ContentType.VIDEO && this.lcevcDil_) {
      // Append video buffers to the LCEVC Dil for parsing and storing
      // of LCEVC data.
      this.lcevcDil_.appendBuffer(data);
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
   * @param {function()} run
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

    // Run the real operation, which is synchronous.
    try {
      run();
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
    //   1. this is an init segment,
    //   2. and encryption is expected,
    //   3. and the platform requires encryption in all init segments,
    //   4. and the content is MP4 (mimeType == "video/mp4" or "audio/mp4"),
    // then insert fake encryption metadata for init segments that lack it.
    // The MP4 requirement is because we can currently only do this
    // transformation on MP4 containers.
    // See: https://github.com/shaka-project/shaka-player/issues/2759
    if (isInitSegment &&
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
   * Update LCEVC DIL object when ready for LCEVC Decodes
   * @param {?shaka.lcevc.Dil} lcevcDil
   */
  updateLcevcDil(lcevcDil) {
    this.lcevcDil_ = lcevcDil;
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


/**
 * MIME types of raw formats.
 *
 * @const {!Array.<string>}
 */
shaka.media.MediaSourceEngine.RAW_FORMATS = [
  'audio/aac',
  'audio/ac3',
  'audio/ec3',
  'audio/mpeg',
];
