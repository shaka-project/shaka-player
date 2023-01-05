/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.ClosedCaptionParser');
goog.provide('shaka.media.IClosedCaptionParser');

goog.require('shaka.cea.CeaDecoder');
goog.require('shaka.cea.DummyCeaParser');
goog.require('shaka.cea.Mp4CeaParser');
goog.require('shaka.cea.TsCeaParser');
goog.require('shaka.util.BufferUtils');
goog.requireType('shaka.cea.ICaptionDecoder');
goog.requireType('shaka.cea.ICeaParser');


/**
 * The IClosedCaptionParser defines the interface to provide all operations for
 * parsing the closed captions embedded in Dash videos streams.
 * TODO: Remove this interface and move method definitions
 * directly to ClosedCaptonParser.
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
   * @return {!Array<!shaka.cea.ICaptionDecoder.ClosedCaption>}
   * An array of parsed closed captions.
   */
  parseFrom(mediaFragment) {}

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
shaka.media.ClosedCaptionParser = class {
  /** */
  constructor(mimeType) {
    /** @private {!shaka.cea.ICeaParser} */
    this.ceaParser_ = new shaka.cea.DummyCeaParser();

    if (mimeType.toLowerCase().includes('video/mp4')) {
      // MP4 Parser to extract closed caption packets from H.264/H.265 video.
      this.ceaParser_ = new shaka.cea.Mp4CeaParser();
    }
    if (mimeType.toLowerCase().includes('video/mp2t')) {
      // TS Parser to extract closed caption packets from H.264 video.
      this.ceaParser_ = new shaka.cea.TsCeaParser();
    }

    /**
     * Decoder for decoding CEA-X08 data from closed caption packets.
     * @private {!shaka.cea.ICaptionDecoder}
     */
    this.ceaDecoder_ = new shaka.cea.CeaDecoder();
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
   * @override
   */
  reset() {
    this.ceaDecoder_.clear();
  }
};
