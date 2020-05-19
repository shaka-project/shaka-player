/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for fontfaceonload.
 * @see https://github.com/zachleat/fontfaceonload/
 * @externs
 */


/**
 * @param {string} fontFamily
 * @param {{
 *   tolerance: (number|undefined),
 *   delay: (number|undefined),
 *   glyphs: (string|undefined),
 *   success: (function()|undefined),
 *   error: (function()|undefined),
 *   timeout: (number|undefined),
 *   weight: (string|undefined),
 *   style: (string|undefined),
 *   window: (Window|undefined),
 * }} options All options have defaults.
 * @see https://github.com/zachleat/fontfaceonload/blob/b18d28bf/src/fontfaceonload.js#L22
 */
function FontFaceOnload(fontFamily, options) {}
