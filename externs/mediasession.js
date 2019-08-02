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
 * @fileoverview Externs for MediaSession based on
 * {@link https://bit.ly/2Id3dGD Editor's Draft, 12 January 2017}
 *
 * @externs
 */


/**
 * @constructor
 */
var MediaMetadata = function(options) {};


/** @type {string} */
MediaMetadata.prototype.title;


/** @type {string} */
MediaMetadata.prototype.artist;


/** @type {string} */
MediaMetadata.prototype.artwork;


/** @constructor */
var MediaSession = function() {};

/** @type {?MediaMetadata} */
MediaSession.prototype.metadata;


/** @type {MediaSession} */
Navigator.prototype.mediaSession;
