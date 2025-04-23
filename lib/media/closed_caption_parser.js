/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ClosedCaptionParser');
goog.provide('shaka.media.IClosedCaptionParser');

goog.require('shaka.cea.DummyCaptionDecoder');
goog.require('shaka.cea.DummyCeaParser');
goog.require('shaka.log');
goog.require('shaka.util.BufferUtils');


/**
 * The IClosedCaptionParser defines the interface to provide all operations for
 * parsing the closed captions embedded in Dash videos streams.
 * TODO: Remove this interface and move method definitions
 * directly to ClosedCaptionParser.
 * @interface
 * @export
 */
shaka.media.IClosedCaptionParser = class {
  /**
   * Initialize the caption parser. This should be called whenever new init
   * segment arrives.
   * @param {BufferSource} initSegment
   * @param {boolean=} adaptation True if we just automatically switched active
   *   variant(s).
   * @param {number=} continuityTimeline the optional continuity timeline
   */
  init(initSegment, adaptation = false, continuityTimeline = -1) {}

  /**
   * Parses embedded CEA closed captions and interacts with the underlying
   * CaptionStream, and calls the callback function when there are closed
   * captions.
   *
   * @param {BufferSource} mediaFragment
   * @return {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>}
   * An array of parsed closed captions.
   */
  parseFrom(mediaFragment) {}

  /**
   * Resets the CaptionStream.
   */
  reset() {}

  /**
   * Remove items from the decoder cache based on the provided continuity
   * timelines. Caches relating to provided timelines are kept and the rest
   * are discarded.
   *
   * @param {Array<number>} timelinesToKeep
   */
  remove(timelinesToKeep = []) {}

  /**
   * Returns the streams that the CEA decoder found.
   * @return {!Array<string>}
   */
  getStreams() {}
};

/**
 * Closed Caption Parser provides all operations for parsing the closed captions
 * embedded in Dash videos streams.
 *
 * @implements {shaka.media.IClosedCaptionParser}
 * @final
 * @export
 */
shaka.media.ClosedCaptionParser = class {
  /**
   * @param {string} mimeType
   */
  constructor(mimeType) {
    /** @private {Map<number, shaka.extern.ICaptionDecoder>} */
    this.decoderCache_ = new Map();
    /** @private {number} */
    this.currentContinuityTimeline_ = 0;

    /** @private {!shaka.extern.ICeaParser} */
    this.ceaParser_ = new shaka.cea.DummyCeaParser();

    const parserFactory =
        shaka.media.ClosedCaptionParser.findParser(mimeType.toLowerCase());
    if (parserFactory) {
      this.ceaParser_ = parserFactory();
    }

    /**
     * Decoder for decoding CEA-X08 data from closed caption packets.
     * @private {!shaka.extern.ICaptionDecoder}
     */
    this.ceaDecoder_ = new shaka.cea.DummyCaptionDecoder();

    const decoderFactory = shaka.media.ClosedCaptionParser.findDecoder();
    if (decoderFactory) {
      this.ceaDecoder_ = decoderFactory();
      this.decoderCache_.set(this.currentContinuityTimeline_, this.ceaDecoder_);
    }
  }

  /**
   * @override
   */
  init(initSegment, adaptation = false, continuityTimeline = -1) {
    shaka.log.debug('Passing new init segment to CEA parser');
    if (continuityTimeline != -1 &&
      this.currentContinuityTimeline_ != continuityTimeline) {
      // When we get a new init segment associated with a different continuity
      // timeline, we should switch to a new decoder until we go back to the
      // current continuity timeline.
      this.updateDecoder_(continuityTimeline);
    } else if (!adaptation) {
      // Reset underlying decoder when new init segment arrives
      // to clear stored pts values.
      // This is necessary when a new Period comes in DASH or a discontinuity
      // in HLS.
      this.reset();
    }
    this.ceaParser_.init(initSegment);
    if (continuityTimeline != -1) {
      this.currentContinuityTimeline_ = continuityTimeline;
    }
  }

  /**
   * @override
   */
  parseFrom(mediaFragment) {
    // Parse the fragment.
    const captionPackets = this.ceaParser_.parse(mediaFragment);

    // Extract the caption packets for decoding.
    for (const captionPacket of captionPackets) {
      const uint8ArrayData =
          shaka.util.BufferUtils.toUint8(captionPacket.packet);
      if (uint8ArrayData.length > 0) {
        this.ceaDecoder_.extract(uint8ArrayData, captionPacket.pts);
      }
    }

    // Decode and return the parsed captions.
    return this.ceaDecoder_.decode();
  }

  /**
   * @private
   */
  updateDecoder_(continuityTimeline) {
    const decoder = this.decoderCache_.get(continuityTimeline);

    this.decoderCache_.set(this.currentContinuityTimeline_, this.ceaDecoder_);

    if (decoder) {
      this.ceaDecoder_ = decoder;
    } else {
      const decoderFactory = shaka.media.ClosedCaptionParser.findDecoder();
      if (decoderFactory) {
        this.ceaDecoder_ = decoderFactory();
      }
      this.decoderCache_.set(continuityTimeline, this.ceaDecoder_);
    }
  }

  /**
   * @override
   */
  reset() {
    this.ceaDecoder_.clear();
  }

  /**
   * @override
   */
  remove(timelinesToKeep = []) {
    const timelines = new Set(timelinesToKeep);
    for (const key of this.decoderCache_.keys()) {
      if (!timelines.has(key)) {
        let decoder = this.decoderCache_.get(key);
        if (decoder) {
          decoder.clear();
        }
        this.decoderCache_.delete(key);
        decoder = null;
      }
    }
  }

  /**
   * @override
   */
  getStreams() {
    return this.ceaDecoder_.getStreams();
  }

  /**
   * @param {string} mimeType
   * @param {!shaka.extern.CeaParserPlugin} plugin
   * @export
   */
  static registerParser(mimeType, plugin) {
    shaka.media.ClosedCaptionParser.parserMap_.set(mimeType, plugin);
  }

  /**
   * @param {string} mimeType
   * @export
   */
  static unregisterParser(mimeType) {
    shaka.media.ClosedCaptionParser.parserMap_.delete(mimeType);
  }

  /**
   * @param {string} mimeType
   * @return {?shaka.extern.CeaParserPlugin}
   * @export
   */
  static findParser(mimeType) {
    return shaka.media.ClosedCaptionParser.parserMap_.get(mimeType);
  }

  /**
   * @param {!shaka.extern.CaptionDecoderPlugin} plugin
   * @export
   */
  static registerDecoder(plugin) {
    shaka.media.ClosedCaptionParser.decoderFactory_ = plugin;
  }

  /**
   * @export
   */
  static unregisterDecoder() {
    shaka.media.ClosedCaptionParser.decoderFactory_ = null;
  }

  /**
   * @return {?shaka.extern.CaptionDecoderPlugin}
   * @export
   */
  static findDecoder() {
    return shaka.media.ClosedCaptionParser.decoderFactory_;
  }
};

/** @private {!Map<string, shaka.extern.CeaParserPlugin>} */
shaka.media.ClosedCaptionParser.parserMap_ = new Map();

/** @private {?shaka.extern.CaptionDecoderPlugin} */
shaka.media.ClosedCaptionParser.decoderFactory_ = null;
