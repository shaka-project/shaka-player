/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */

/**
 * Interface for parsing inband closed caption data from MP4 streams.
 * @interface
 * @exportDoc
 */
shaka.extern.ICeaParser = class {
  /**
   * Initializes the parser with init segment data.
   * @param {!BufferSource} initSegment init segment to parse.
   * @exportDoc
   */
  init(initSegment) {}

  /**
   * Parses the stream and extracts closed captions packets.
   * @param {!BufferSource} mediaSegment media segment to parse.
   * @return {!Array<!shaka.extern.ICeaParser.CaptionPacket>}
   * @exportDoc
   */
  parse(mediaSegment) {}
};

/**
 * @typedef {{
 *   packet: !Uint8Array,
 *   pts: number
 * }}
 *
 * @description Parsed Caption Packet.
 * @property {!Uint8Array} packet
 * Caption packet. More specifically, it contains a "User data
 * registered by Recommendation ITU-T T.35 SEI message", from section D.1.6
 * and section D.2.6 of Rec. ITU-T H.264 (06/2019).
 * @property {number} pts
 * The presentation timestamp (pts) at which the ITU-T T.35 data shows up.
 * in seconds.
 * @exportDoc
 */
shaka.extern.ICeaParser.CaptionPacket;


/**
 * Interface for decoding inband closed captions from packets.
 * @interface
 * @exportDoc
 */
shaka.extern.ICaptionDecoder = class {
  /**
   * Extracts packets and prepares them for decoding. In a given media fragment,
   * all the caption packets found in its SEI messages should be extracted by
   * successive calls to extract(), followed by a single call to decode().
   *
   * @param {!Uint8Array} userDataSeiMessage
   * This is a User Data registered by Rec.ITU-T T.35 SEI message.
   * It is described in sections D.1.6 and D.2.6 of Rec. ITU-T H.264 (06/2019).
   * @param {number} pts PTS when this packet was received, in seconds.
   * @exportDoc
   */
  extract(userDataSeiMessage, pts) {}

  /**
   * Decodes all currently extracted packets and then clears them.
   * This should be called once for a set of extracts (see comment on extract).
   * @return {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>}
   * @exportDoc
   */
  decode() {}

  /**
   * Clears the decoder state completely.
   * Should be used when an action renders the decoder state invalid,
   * e.g. unbuffered seeks.
   * @exportDoc
   */
  clear() {}

  /**
   * Returns the streams that the CEA decoder found.
   * @return {!Array<string>}
   * @exportDoc
   */
  getStreams() {}
};

/**
 * Parsed Cue.
 * @typedef {{
 *   cue: !shaka.text.Cue,
 *   stream: string
 * }}
 *
 * @exportDoc
 */
shaka.extern.ICaptionDecoder.ClosedCaption;

/**
 * @typedef {function():!shaka.extern.ICeaParser}
 * @exportDoc
 */
shaka.extern.CeaParserPlugin;

/**
 * @typedef {function():!shaka.extern.ICaptionDecoder}
 * @exportDoc
 */
shaka.extern.CaptionDecoderPlugin;
