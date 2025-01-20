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
