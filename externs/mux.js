/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for mux.js library.
 * @externs
 */


/** @const */
var muxjs = {};


/** @const */
muxjs.mp4 = {};


/** @const */
muxjs.mp4.probe = class {
  /**
   * Parses an MP4 initialization segment and extracts the timescale
   * values for any declared tracks.
   *
   * @param {Uint8Array} init The bytes of the init segment
   * @return {!Object.<number, number>} a hash of track ids to timescale
   * values or null if the init segment is malformed.
   */
  static timescale(init) {}

  /**
    * Find the trackIds of the video tracks in this source.
    * Found by parsing the Handler Reference and Track Header Boxes:
    *
    * @param {Uint8Array} init The bytes of the init segment for this source
    * @return {!Array.<number>} A list of trackIds
   **/
  static videoTrackIds(init) {}
};


muxjs.mp4.Transmuxer = class {
  /** @param {Object=} options */
  constructor(options) {}

  /** @param {number} time */
  setBaseMediaDecodeTime(time) {}

  /** @param {!Uint8Array} data */
  push(data) {}

  flush() {}

  /**
   * Add a handler for a specified event type.
   * @param {string} type Event name
   * @param {Function} listener The callback to be invoked
   */
  on(type, listener) {}

  /**
   * Remove a handler for a specified event type.
   * @param {string} type Event name
   * @param {Function} listener The callback to be removed
   */
  off(type, listener) {}

  /** Remove all handlers and clean up. */
  dispose() {}
};


/**
 * @typedef {{
 *   initSegment: !Uint8Array,
 *   data: !Uint8Array,
 *   captions: !Array
 * }}
 *
 * @description Transmuxed data from mux.js.
 * @property {!Uint8Array} initSegment
 * @property {!Uint8Array} data
 * @property {!Array} captions
 * @exportDoc
 */
muxjs.mp4.Transmuxer.Segment;


muxjs.mp4.CaptionParser = class {
  /**
   * Parser for CEA closed captions embedded in video streams for Dash.
   * @constructor
   * @struct
   */
  constructor() {}

  /** Initializes the closed caption parser. */
  init() {}

  /**
   * Return true if a new video track is selected or if the timescale is
   * changed.
   * @param {!Array.<number>} videoTrackIds A list of video tracks found in the
   *    init segment.
   * @param {!Object.<number, number>} timescales The map of track Ids and the
   *    tracks' timescales in the init segment.
   * @return {boolean}
   */
  isNewInit(videoTrackIds, timescales) {}

  /**
   * Parses embedded CEA closed captions and interacts with the underlying
   * CaptionStream, and return the parsed captions.
   * @param {!Uint8Array} segment The fmp4 segment containing embedded captions
   * @param {!Array.<number>} videoTrackIds A list of video tracks found in the
   *    init segment.
   * @param {!Object.<number, number>} timescales The timescales found in the
   *    init segment.
   * @return {muxjs.mp4.ParsedClosedCaptions}
   */
  parse(segment, videoTrackIds, timescales) {}

  /** Clear the parsed closed captions data for new data. */
  clearParsedCaptions() {}

  /** Reset the captions stream. */
  resetCaptionStream() {}
};


/**
 * @typedef {{
 *   captionStreams: Object.<string, boolean>,
 *   captions: !Array.<muxjs.mp4.ClosedCaption>
 * }}
 *
 * @description closed captions data parsed from mux.js caption parser.
 * @property {Object.<string, boolean>} captionStreams
 * @property {Array.<muxjs.mp4.ClosedCaption>} captions
 */
muxjs.mp4.ParsedClosedCaptions;


/**
 * @typedef {{
 *   startPts: number,
 *   endPts: number,
 *   startTime: number,
 *   endTime: number,
 *   stream: string,
 *   text: string
 * }}
 *
 * @description closed caption parsed from mux.js caption parser.
 * @property {number} startPts
 * @property {number} endPts
 * @property {number} startTime
 * @property {number} endTime
 * @property {string} stream The channel id of the closed caption.
 * @property {string} text The content of the closed caption.
 */
muxjs.mp4.ClosedCaption;
