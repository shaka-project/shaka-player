/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for TextTrack, TextTrackList, and TextTrackCue which
 * are missing from the Closure compiler.
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


/** @type {string} */
TextTrack.prototype.id;

/** @type {string} */
TextTrack.prototype.kind;

/** @type {string} */
TextTrack.prototype.label;


/** @type {string} */
TextTrackCue.prototype.positionAlign;

/** @type {string} */
TextTrackCue.prototype.lineAlign;

/** @type {number|null|string} */
TextTrackCue.prototype.line;

/** @type {string} */
TextTrackCue.prototype.vertical;

/** @type {boolean} */
TextTrackCue.prototype.snapToLines;

/** @type {string} */
TextTrackCue.prototype.type;

/** @type {?} */
TextTrackCue.prototype.value;


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
