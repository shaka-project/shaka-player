/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.ICaptionDecoder');

goog.require('shaka.text.Cue');


/**
 * Interface for decoding inband closed captions from packets.
 * @interface
 */
shaka.cea.ICaptionDecoder = class {
  /**
   * Extracts packets and prepares them for decoding. In a given media fragment,
   * all the caption packets found in its SEI messages should be extracted by
   * successive calls to extract(), followed by a single call to decode().
   *
   * @param {!Uint8Array} userDataSeiMessage
   * This is a User Data registered by Rec.ITU-T T.35 SEI message.
   * It is described in sections D.1.6 and D.2.6 of Rec. ITU-T H.264 (06/2019).
   * @param {number} pts PTS when this packet was received, in seconds.
   */
  extract(userDataSeiMessage, pts) {}

  /**
   * Decodes all currently extracted packets and then clears them.
   * This should be called once for a set of extracts (see comment on extract).
   * @return {!Array.<!shaka.cea.ICaptionDecoder.ClosedCaption>}
   */
  decode() {}

  /**
   * Clears the decoder state completely.
   * Should be used when an action renders the decoder state invalid,
   * e.g. unbuffered seeks.
   */
  clear() {}
};

/**
 * Parsed Cue.
 * @typedef {{
 *   cue: !shaka.text.Cue,
 *   stream: string
 * }}
 */
shaka.cea.ICaptionDecoder.ClosedCaption;
