/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.ICaptionDecoder');

/**
 * Interface for decoding inband closed captions from packets.
 * @interface
 */
shaka.cea.ICaptionDecoder = class {
  /**
   * @param {!Uint8Array} data Caption stream data.
   * @param {!number} time Time for the stream data.
   */
  extract(data, time) {}

  /**
   * Decodes extracted packets
   * @return {!Array.<!shaka.cea.ICaptionDecoder.Cue>}
   */
  decode() {}

  /**
   * Clears the decoder completely.
   */
  clear() {}
};

/**
 * Parsed Cue.
 * @typedef {{
 *   startTime: number,
 *   endTime: number,
 *   stream: string,
 *   text: string
 * }}
 */
shaka.cea.ICaptionDecoder.Cue;
