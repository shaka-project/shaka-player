/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for mux.js library.
 * @externs
 */


/**
 * @typedef {{
 *   mp4: typeof muxjs.mp4
 * }}
 * @const
*/
var muxjs = {};


/** @const */
muxjs.mp4 = {};


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
 *   data: !Uint8Array
 * }}
 *
 * @description Transmuxed data from mux.js.
 * @property {!Uint8Array} initSegment
 * @property {!Uint8Array} data
 * @exportDoc
 */
muxjs.mp4.Transmuxer.Segment;

