/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for TextTrackCueList which are missing from the
 * Closure compiler.
 *
 * @externs
 */


/**
 * This is an Iterable, but Closure's built-in extern doesn't seem to declare it
 * as such in this version of the compiler (20200406).
 *
 * Here we override that definition.
 *
 * @implements {IArrayLike<!TextTrackCue>}
 * @implements {Iterable<!TextTrackCue>}
 * @constructor
 * @suppress {duplicate}
 */
var TextTrackCueList = function() {};

/** @override */
TextTrackCueList.prototype[Symbol.iterator] = function() {};
