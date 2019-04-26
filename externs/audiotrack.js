/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
 * @extends {IArrayLike.<AudioTrack>}
 * @extends {EventTarget}
 * @interface
 */
function AudioTrackList() {}

/** @override */
AudioTrackList.prototype.addEventListener =
    function(type, listener, useCapture) {};

/** @override */
AudioTrackList.prototype.removeEventListener =
    function(type, listener, useCapture) {};

/** @override */
AudioTrackList.prototype.dispatchEvent = function(event) {};


/** @type {AudioTrackList} */
HTMLMediaElement.prototype.audioTracks;
