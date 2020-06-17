/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.CeaParser');

/**
 * Interface for parsing inband closed caption data from MP4 streams.
 * @interface
 */
shaka.cea.CeaParser = class {
  /**
   * Initializes the parser with stream segment data.
   * @param {BufferSource} data Stream segment data to parse.
   */
  init(data) {}

  /**
   * Parses the stream and extracts 708 closed captions information.
   * @param {BufferSource} data segment data
   * @param {function(!BufferSource, number)} on708Data called when the parser
   * finds new CEA-708 caption packets in the inband stream
   */
  parse(data, on708Data) {}
};

/**
 * NALU type for Supplemental Enhancement Information (SEI).
 * @const {number}
 */
shaka.cea.CeaParser.NALU_TYPE_SEI = 0x06;

/**
 * Default timescale value for a track.
 */
shaka.cea.CeaParser.DEFAULT_TIMESCALE_VALUE = 90000;
