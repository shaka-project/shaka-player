/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Externs for mux.js library.
 * @externs
 */


/** @const */
var muxjs = {};


/** @const */
muxjs.mp4 = {};


/**
 * @constructor
 * @struct
 * @param {Object=} options
 */
muxjs.mp4.Transmuxer = function(options) {};


/**
 * @param {number} time
 */
muxjs.mp4.Transmuxer.prototype.setBaseMediaDecodeTime = function(time) {};


/**
 * @param {!Uint8Array} data
 */
muxjs.mp4.Transmuxer.prototype.push = function(data) {};


muxjs.mp4.Transmuxer.prototype.flush = function() {};


/**
 * Add a handler for a specified event type.
 * @param {string} type Event name
 * @param {Function} listener The callback to be invoked
 */
muxjs.mp4.Transmuxer.prototype.on = function(type, listener) {};


/**
 * Remove a handler for a specified event type.
 * @param {string} type Event name
 * @param {Function} listener The callback to be removed
 */
muxjs.mp4.Transmuxer.prototype.off = function(type, listener) {};


/**
 * Remove all handlers and clean up.
 */
muxjs.mp4.Transmuxer.prototype.dispose = function() {};


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


/**
 * Parser for CEA closed captions embedded in video streams for Dash.
 * @constructor
 * @struct
 */
muxjs.mp4.CaptionParser = function() {};


/**
 * Initializes the closed caption parser.
 */
muxjs.mp4.CaptionParser.prototype.init = function() {};


/**
 * Return true if a new video track is selected or if the timescale is
 * changed.
 * @param {!Array.<number>} videoTrackIds A list of video tracks found in the
 *    init segment.
 * @param {!Object.<number, number>} timescales The map of track Ids and the
 *    tracks' timescales in the init segment.
 * @return {boolean}
 */
muxjs.mp4.CaptionParser.prototype.isNewInit = function(
    videoTrackIds, timescales) {};


/**
 * Parses embedded CEA closed captions and interacts with the underlying
 * CaptionStream, and return the parsed captions.
 * @param {!Uint8Array} segment The fmp4 segment containing embedded captions
 * @param {!Array.<number>} videoTrackIds A list of video tracks found in the
 *    init segment.
 * @param {!Object.<number, number>} timescales The timescales found in the
 *    init segment.
 * @return {Object} Parsed captions
 */
muxjs.mp4.CaptionParser.prototype.parse = function(
    segment, videoTrackIds, timescales) {};


/**
 * Clear the parsed closed captions data for new data.
 */
muxjs.mp4.CaptionParser.prototype.clearParsedCaptions = function() {};
