/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.ICeaParser');

/**
 * Interface for parsing inband closed caption data from MP4 streams.
 * @interface
 */
shaka.cea.ICeaParser = class {
  /**
   * Initializes the parser with init segment data.
   * @param {!BufferSource} initSegment init segment to parse.
   */
  init(initSegment) {}

  /**
   * Parses the stream and extracts closed captions packets.
   * @param {!BufferSource} mediaSegment media segment.
   * @param {function(!BufferSource, !number)} onCaptionPackets called when the
   * parser finds new caption packets in the inband stream. The first parameter
   * contains caption packets. More specifically, it contains a "User data
   * registered by Recommendation ITU-T T.35 SEI message", from section D.1.6
   * and section D.2.6 of Rec. ITU-T H.264 (06/2019). The second parameter is
   * the presentation time stamp (pts).
   */
  parse(mediaSegment, onCaptionPackets) {}
};

/**
 * NALU type for Supplemental Enhancement Information (SEI).
 * @const {number}
 */
shaka.cea.ICeaParser.NALU_TYPE_SEI = 0x06;

/**
 * Default timescale value for a track.
 */
shaka.cea.ICeaParser.DEFAULT_TIMESCALE_VALUE = 90000;
