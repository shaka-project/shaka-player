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
 * @param {Object=} opt_options
 */
muxjs.mp4.Transmuxer = function(opt_options) {};


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
