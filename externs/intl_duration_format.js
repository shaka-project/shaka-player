/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for Intl.DurationFormat, which is missing from the
 * Closure compiler.
 *
 * @externs
 */


/**
 * @typedef {{
 *   style: (string|undefined),
 *   secondsDisplay: (string|undefined)
 * }}
 */
Intl.DurationFormatOptions;


/**
 * @typedef {{
 *   days: (number|undefined),
 *   hours: (number|undefined),
 *   minutes: (number|undefined),
 *   seconds: (number|undefined)
 * }}
 */
Intl.DurationLike;


/**
 * @constructor
 * @param {(string|!Array<string>)=} locales
 * @param {Intl.DurationFormatOptions=} options
 */
Intl.DurationFormat = function(locales, options) {};


/**
 * @param {Intl.DurationLike} duration
 * @return {string}
 */
Intl.DurationFormat.prototype.format = function(duration) {};
