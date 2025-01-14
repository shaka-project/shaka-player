/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 * @suppress {duplicate} To prevent compiler errors with the namespace
 *   being declared both here and by goog.provide in the library.
 */


/**
 * @typedef {{
 *   type: string,
 *   text: string,
 *   position: string,
 *   color: string,
 *   size: number,
 *   alpha: number,
 *   interval: number,
 *   skip: number,
 *   displayDuration: number,
 *   transitionDuration: number
 * }}
 *
 * @property {string} type
 *   The type of watermark ('static' or 'dynamic').
 *   Defaults to 'static'.
 * @property {string} text
 *   The text content of the watermark. Required.
 * @property {string} position
 *   Position of the watermark.
 *   Defaults to 'top-left'.
 * @property {string} color
 *   The color of the watermark text.
 *   Defaults to 'white'.
 * @property {number} size
 *   Font size of the watermark text in pixels.
 *   Defaults to 24.
 * @property {number} alpha
 *   Opacity of the watermark (0.0 to 1.0).
 *   Defaults to 0.7.
 * @property {number} interval
 *   Interval between position updates for dynamic watermarks (in seconds).
 *   Only used when type is 'dynamic'.
 *   Defaults to 2.
 * @property {number} skip
 *   Skip duration for dynamic watermarks (in seconds).
 *   Only used when type is 'dynamic'.
 *   Defaults to 0.5.
 * @property {number} displayDuration
 *   Duration to display watermark at each position (in seconds).
 *   Only used when type is 'dynamic'.
 *   Defaults to 2.
 * @property {number} transitionDuration
 *   Duration of fade transitions between positions (in seconds).
 *   Only used when type is 'dynamic'.
 *   Defaults to 0.5.
 * @exportDoc
 */
shaka.ui.Watermark.Options;
