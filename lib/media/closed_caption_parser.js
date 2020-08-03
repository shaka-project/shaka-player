/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.media.IClosedCaptionParser');
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
   * @param {function(Array<!shaka.cea.ICaptionDecoder.ClosedCaption>)} onCCData
   * A callback function to handle the closed captions from parsed data.
   */
  parseFrom(mediaFragment, onCCData) {}

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
  parseFrom(mediaFragment, onCCData) {
    // Parse the fragment.
    const captionPackets = this.ceaParser_.parse(mediaFragment);

    // Extract the caption packets for decoding.
    for (const captionPacket of captionPackets) {
      const uint8ArrayData =
          shaka.util.BufferUtils.toUint8(captionPacket.packet);
      this.ceaDecoder_.extract(uint8ArrayData, captionPacket.pts);
    }

    // Decode the captions.
    const captions = this.ceaDecoder_.decode();

    onCCData(captions);
  }

  /**
   * @override
   */
  reset() {
    this.ceaDecoder_.clear();
  }
};
