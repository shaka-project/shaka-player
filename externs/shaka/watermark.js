/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/** @namespace */
var shaka = {};

/** @namespace */
shaka.extern = {};


/**
 * @typedef {{
 *   type: string,
 *   text: string,
 *   position: string,
 *   color: string,
 *   size: number,
 *   alpha: number,
 *   interval: number,
 *   skip: number
 * }}
 *
 * @property {string} type
 *   The type of watermark ('static' or 'dynamic').
 * @property {string} text
 *   The text content of the watermark.
 * @property {string} position
 *   Position of the watermark.
 * @property {string} color
 *   The color of the watermark text.
 * @property {number} size
 *   Font size of the watermark text in pixels.
 * @property {number} alpha
 *   Opacity of the watermark (0.0 to 1.0).
 * @property {number} interval
 *   Interval between position updates for dynamic watermarks (in milliseconds).
 * @property {number} skip
 *   Skip duration for dynamic watermarks (in milliseconds).
 * @exportDoc
 */
shaka.extern.WatermarkOptions;
