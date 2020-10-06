/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for TextTrackList which are missing from the Closure
 * compiler.
 *
 * @externs
 */


/**
 * This is an EventTarget, but Closure's built-in extern doesn't declare it as
 * such.  Here we override that definition.
 *
 * @implements {EventTarget}
 * @constructor
 * @suppress {duplicate}
 */
var TextTrackList = function() {};

/** @override */
TextTrackList.prototype.addEventListener =
    function(type, listener, useCapture) {};

/** @override */
TextTrackList.prototype.removeEventListener =
    function(type, listener, useCapture) {};

/** @override */
TextTrackList.prototype.dispatchEvent = function(event) {};
