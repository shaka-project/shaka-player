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
 * @extends {IArrayLike.<VideoTrack>}
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
