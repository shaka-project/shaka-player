/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for VideoTrack which are missing from the Closure
 * compiler.
 *
 * @externs
 */

/** @constructor */
function VideoTrack() {}

/** @type {boolean} */
VideoTrack.prototype.selected;

/** @type {string} */
VideoTrack.prototype.id;

/** @type {string} */
VideoTrack.prototype.kind;

/** @type {string} */
VideoTrack.prototype.label;

/** @type {string} */
VideoTrack.prototype.language;

/** @type {SourceBuffer} */
VideoTrack.prototype.sourceBuffer;


/**
 * @extends {IArrayLike<VideoTrack>}
 * @extends {EventTarget}
 * @interface
 */
function VideoTrackList() {}

/** @override */
VideoTrackList.prototype.addEventListener =
    function(type, listener, useCapture) {};

/** @override */
VideoTrackList.prototype.removeEventListener =
    function(type, listener, useCapture) {};

/** @override */
VideoTrackList.prototype.dispatchEvent = function(event) {};


/** @type {VideoTrackList} */
HTMLMediaElement.prototype.videoTracks;
