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
   * @param {!BufferSource} data init segment to parse.
   */
  init(data) {}

  /**
   * Parses the stream and extracts 708 closed captions packets.
   * @param {!BufferSource} data media segment.
   * @param {function(!BufferSource, number)} on708Data called when the parser
   * finds new CEA-708 caption packets in the inband stream
   */
  parse(data, on708Data) {}
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
