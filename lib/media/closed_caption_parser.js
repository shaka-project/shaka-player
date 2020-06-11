/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.IClosedCaptionParser');
goog.provide('shaka.media.MuxJSClosedCaptionParser');
goog.provide('shaka.media.NoopCaptionParser');
goog.provide('shaka.media.ClosedCaptionParser');

goog.require('shaka.util.BufferUtils');


/**
 * The IClosedCaptionParser defines the interface to provide all operations for
 * parsing the closed captions embedded in Dash videos streams.
 * @interface
 */
shaka.media.IClosedCaptionParser = class {
  /**
   * Initialize the caption parser. This should be called only once.
   * @param {BufferSource} initSegment
   */
  init(initSegment) {}

  /**
   * Parses embedded CEA closed captions and interacts with the underlying
   * CaptionStream, and calls the callback function when there are closed
   * captions.
   *
   * @param {BufferSource} mediaFragment
   * @param {function(Array.<muxjs.mp4.ClosedCaption>)} onCaptions
   * A callback function to handle the closed captions from parsed data.
   */
  parseFrom(mediaFragment, onCaptions) {}

  /**
   * Resets the CaptionStream.
   */
  reset() {}
};


/**
 * Closed Caption Parser provides all operations for parsing the closed captions
 * embedded in Dash videos streams.
 *
 * @implements {shaka.media.IClosedCaptionParser}
 * @final
 */
shaka.media.MuxJSClosedCaptionParser = class {
  constructor() {
    /** @private {muxjs.mp4.CaptionParser} */
    this.muxCaptionParser_ = new muxjs.mp4.CaptionParser();

    /** @private {!Array.<number>} */
    this.videoTrackIds_ = [];

    /**
     * Timescales from the init segments, used for mux.js CaptionParser.
     * @private {!Object.<number, number>}
     */
    this.timescales_ = {};
  }

  /**
   * @override
   */
  init(initSegment) {
    const probe = muxjs.mp4.probe;
    // Caption parser for Dash
    const initBytes = shaka.util.BufferUtils.toUint8(initSegment);
    this.videoTrackIds_ = probe.videoTrackIds(initBytes);
    this.timescales_ = probe.timescale(initBytes);
    this.muxCaptionParser_.init();
  }

  /**
   * @override
   */
  parseFrom(mediaFragment, onCaptions) {
    const segmentBytes = shaka.util.BufferUtils.toUint8(mediaFragment);
    const dashParsed = this.muxCaptionParser_.parse(
        segmentBytes, this.videoTrackIds_, this.timescales_);
    if (dashParsed && dashParsed.captions) {
      onCaptions(dashParsed.captions);
    }
    // ParsedCaptions is used by mux.js to store the captions parsed so far.
    // It should be reset every time some data is parsed, so as to store new
    // data.
    this.muxCaptionParser_.clearParsedCaptions();
  }

  /**
   * @override
   */
  reset() {
    this.muxCaptionParser_.resetCaptionStream();
  }

  /**
   * Check if the MuxJS closed caption parser is supported on this platform.
   *
   * @return {boolean}
   */
  static isSupported() {
    return !!window.muxjs;
  }
};

/**
 * Noop Caption Parser creates an empty caption parser object when mux.js is not
 * available.
 *
 * @implements {shaka.media.IClosedCaptionParser}
 * @final
 */
shaka.media.NoopCaptionParser = class {
  /**
   * @override
   */
  init(initSegment) {}

  /**
   * @override
   */
  parseFrom(mediaFragment, onCaptions) {}

  /**
   * @override
   */
  reset() {}
};

/** Closed Caption Parser provides all operations
 * for parsing the closed captions
 * embedded in Dash videos streams.
 *
 * @implements {shaka.media.IClosedCaptionParser}
 * @final
 */
shaka.media.ClosedCaptionParser = class {
  constructor() {
    /**
     * MP4 Parser to extract closed caption packets from H.264 video.
     * @private {!shaka.cea.ICeaParser}
     */
    this.ceaParser_ = new shaka.cea.Mp4CeaParser();

    /**
     * Decoder for decoding CEA-X08 data from closed caption packets.
     * @private {!shaka.cea.ICaptionDecoder}
     */
    this.ceaDecoder_ = new shaka.cea.AtscDecoder();
  }

  /**
   * @override
   */
  init(initSegment) {
    this.ceaParser_.init(initSegment);
  }

  /**
   * @override
   */
  parseFrom(mediaFragment, onCaptions) {
    // Parse the fragment.
    const captionPackets = this.ceaParser_.parse(mediaFragment);

    // Extract the caption packets for decoding.
    for (const captionPacket of captionPackets) {
      const uint8ArrayData =
          shaka.util.BufferUtils.toUint8(captionPacket.packet);
      this.ceaDecoder_.extract(uint8ArrayData, captionPacket.pts);
    }

    // Decode the captions.
    const cues = this.ceaDecoder_.decode();
    shaka.log.info(cues);
    onCaptions(cues);
  }

  /**
   * @override
   */
  reset() {
    this.ceaDecoder_.clear();
  }
};
