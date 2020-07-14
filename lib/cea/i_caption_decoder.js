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
   * Extracts closed caption bytes from CEA-608 parsed from the stream based on
   * ANSI/SCTE 128 and A/53, Part 4.
   * @param {!Uint8Array} userDataSeiMessage
   * This is a User Data registered by Rec.ITU-T T.35 SEI message.
   * It is described in sections D.1.6 and D.2.6 of Rec. ITU-T H.264 (06/2019).
   * @param {!number} pts PTS when this packet was received, in seconds.
   */
  extract(userDataSeiMessage, pts) {}

  /**
   * Decodes extracted packets
   * @return {!Array.<!shaka.cea.ICaptionDecoder.Cue>}
   */
  decode() {}

  /**
   * Clears the decoder state completely.
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
