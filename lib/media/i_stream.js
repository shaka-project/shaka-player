/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview A generic media stream interface.
 */

goog.provide('shaka.media.IStream');

goog.require('shaka.dash.mpd');



/**
 * An IStream is a generic media stream interface.
 *
 * @interface
 * @extends {EventTarget}
 */
shaka.media.IStream = function() {};


/**
 * Destroys the Stream.
 */
shaka.media.IStream.prototype.destroy = function() {};


/** @return {shaka.media.StreamInfo} */
shaka.media.IStream.prototype.getStreamInfo = function() {};


/** @return {boolean} */
shaka.media.IStream.prototype.hasStarted = function() {};


/** @return {boolean} */
shaka.media.IStream.prototype.hasEnded = function() {};


/**
 * Start processing the stream.  This should only be called once.
 * An 'ended' event will be fired on EOF.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @param {number} initialBufferSize The amount of time, in seconds, which must
 *     be buffered to start playback.
 */
shaka.media.IStream.prototype.start =
    function(streamInfo, initialBufferSize) {};


/**
 * Switch the stream to use the given |representation|.  The stream must
 * already be started.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @param {boolean} immediate If true, switch as soon as possible.  Otherwise,
 *     switch when convenient.
 */
shaka.media.IStream.prototype.switch = function(streamInfo, immediate) {};


/**
 * Resync the stream with the video's currentTime.  Called on seeking.
 */
shaka.media.IStream.prototype.resync = function() {};


/**
 * Enable or disable the stream.  Not supported for all stream types.
 *
 * @param {boolean} enabled
 */
shaka.media.IStream.prototype.setEnabled = function(enabled) {};


/**
 * @return {boolean} true if the stream is enabled.
 */
shaka.media.IStream.prototype.getEnabled = function() {};

