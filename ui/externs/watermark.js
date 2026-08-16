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
 *   skip: number,
 *   displayDuration: number,
 *   transitionDuration: number,
 *   jitterSpeed: number,
 *   jitterAmount: number,
 *   maxRotationDeg: number,
 * }}
 *
 * @property {string} type
 *   The type of watermark ('static' or 'dynamic').
 *   <br>
 *   Defaults to 'dynamic'.
 * @property {string} text
 *   The text content of the watermark. Required.
 * @property {string} position
 *   Position of the watermark.
 *   Only used when type is 'static'.
 *   Dynamic watermarks automatically cycle through predefined positions.
 *   <br>
 *   Defaults to 'top-left'.
 * @property {string} color
 *   The color of the watermark text.
 *   <br>
 *   Defaults to 'white'.
 * @property {number} size
 *   Font size of the watermark text in pixels.
 *   <br>
 *   Defaults to 24.
 * @property {number} alpha
 *   Opacity of the watermark (0.0 to 1.0).
 *   <br>
 *   Defaults to 0.7.
 * @property {number} skip
 *   Skip duration for dynamic watermarks (in seconds).
 *   Only used when type is 'dynamic'.
 *   <br>
 *   Defaults to 5.
 * @property {number} displayDuration
 *   Duration to display watermark at each position (in seconds).
 *   Only used when type is 'dynamic'.
 *   <br>
 *   Defaults to 10.
 * @property {number} transitionDuration
 *   Duration of fade transitions between positions (in seconds).
 *   Only used when type is 'dynamic'.
 *   <br>
 *   Defaults to 1.
 * @property {number} jitterSpeed
 *   Speed of jitter movement (cycles per second) for dynamic watermarks.
 *   Only used when type is 'dynamic'.
 *   <br>
 *   Defaults to 0.5.
 * @property {number} jitterAmount
 *   Maximum pixel offset for jitter on X and Y axes.
 *   Only used when type is 'dynamic'.
 *   <br>
 *   Defaults to 1.2.
 * @property {number} maxRotationDeg
 *   Maximum rotation applied to the watermark text (in degrees, positive or
 *   negative).
 *   Only used when type is 'dynamic'.
 *   <br>
 *   Defaults to 3.
 * @exportDoc
 */
shaka.ui.Watermark.Options;
