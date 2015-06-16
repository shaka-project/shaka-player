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

goog.require('shaka.media.StreamInfo');



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


/** @return {shaka.media.SegmentIndex} */
shaka.media.IStream.prototype.getSegmentIndex = function() {};


/** @return {boolean} */
shaka.media.IStream.prototype.hasStarted = function() {};


/** @return {boolean} */
shaka.media.IStream.prototype.hasEnded = function() {};


/**
 * Start or switch the stream to the given |streamInfo|.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @param {number} minBufferTime The amount of content to buffer, in seconds,
 *     when the stream starts for the first time.
 * @param {boolean} clearBuffer If true, removes the previous stream's content
 *     before switching to the new stream.
 */
shaka.media.IStream.prototype.switch = function(
    streamInfo, minBufferTime, clearBuffer) {};


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

