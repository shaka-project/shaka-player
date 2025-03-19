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

// See: https://github.com/WebKit/explainers/tree/main/TrackConfiguration
/** @constructor */
function VideoTrackConfiguration() {}

/** @type {string} */
VideoTrackConfiguration.prototype.codec;

/** @type {number} */
VideoTrackConfiguration.prototype.bitrate;

/** @type {number} */
VideoTrackConfiguration.prototype.framerate;

/** @type {number} */
VideoTrackConfiguration.prototype.width;

/** @type {number} */
VideoTrackConfiguration.prototype.height;

/** @type {VideoColorSpace} */
VideoTrackConfiguration.prototype.colorSpace;


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

/** @type {?VideoTrackConfiguration} */
VideoTrack.prototype.configuration;


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
