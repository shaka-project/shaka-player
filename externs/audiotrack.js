/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Externs for AudioTrack which are missing from the Closure
 * compiler.
 *
 * @externs
 */

// See: https://github.com/WebKit/explainers/tree/main/TrackConfiguration
/** @constructor */
function AudioTrackConfiguration() {}

/** @type {string} */
AudioTrackConfiguration.prototype.codec;

/** @type {number} */
AudioTrackConfiguration.prototype.bitrate;

/** @type {number} */
AudioTrackConfiguration.prototype.sampleRate;

/** @type {number} */
AudioTrackConfiguration.prototype.numberOfChannels;


/** @constructor */
function AudioTrack() {}

/** @type {boolean} */
AudioTrack.prototype.enabled;

/** @type {string} */
AudioTrack.prototype.id;

/** @type {string} */
AudioTrack.prototype.kind;

/** @type {string} */
AudioTrack.prototype.label;

/** @type {string} */
AudioTrack.prototype.language;

/** @type {SourceBuffer} */
AudioTrack.prototype.sourceBuffer;

/** @type {?AudioTrackConfiguration} */
AudioTrack.prototype.configuration;


/**
 * @extends {IArrayLike<AudioTrack>}
 * @extends {EventTarget}
 * @interface
 */
class AudioTrackList {
  /** @override */
  addEventListener(type, listener, useCapture) {}

  /** @override */
  removeEventListener(type, listener, useCapture) {}

  /** @override */
  dispatchEvent(event) {}
}


/** @type {AudioTrackList} */
HTMLMediaElement.prototype.audioTracks;
