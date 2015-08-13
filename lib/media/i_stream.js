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
 * @event shaka.media.IStream.AdaptationEvent
 * @description Fired when video, audio, or text tracks change.
 *     Bubbles up through the Player.
 * @property {string} type 'adaptation'
 * @property {boolean} bubbles true
 * @property {string} contentType 'video', 'audio', or 'text'
 * @property {?{width: number, height: number}} size The resolution chosen, if
 *     the stream is a video stream.
 * @property {number} bandwidth The stream's bandwidth requirement in bits per
 *     second.
 * @export
 */


/**
 * Configures the Stream options. Options are set via key-value pairs.
 *
 * @example
 *     stream.configure({'streamBufferSize': 20});
 *
 * @param {!Object.<string, *>} config A configuration object, which contains
 *     the configuration options as key-value pairs. All fields should have
 *     already been validated.
 */
shaka.media.IStream.prototype.configure = function(config) {};


/**
 * Destroys the Stream.
 */
shaka.media.IStream.prototype.destroy = function() {};


/** @return {shaka.media.StreamInfo} */
shaka.media.IStream.prototype.getStreamInfo = function() {};


/** @return {shaka.media.SegmentIndex} */
shaka.media.IStream.prototype.getSegmentIndex = function() {};


/**
 * Returns a promise that the Stream will resolve immediately after startup
 * (i.e., the Stream's initialization sequence) completes. Stream
 * implementations may implement startup as they wish but startup should entail
 * acquiring some initial resources. Implementations must resolve the returned
 * Promise if startup completes and reject the Promise if startup fails.
 *
 * This function can only be called once.
 *
 * @param {!Promise} proceed A Promise that the caller must resolve after
 *     startup completes to signal the Stream that it can proceed. Stream
 *     implementations must idle after startup completes and before the caller
 *     resolves |proceed|. Callers must never reject |proceed|.
 * @return {!Promise.<number>} A promise to a timestamp correction, which is
 *     the number of seconds that the media timeline (the sequence of
 *     timestamps in the stream's media segments) is offset from the Stream's
 *     initial StreamInfo's SegmentIndex (which is an approximation of the
 *     stream's media timeline).
 *
 *     For example, if the timestamp correction is 5 then a SegmentReference
 *     that has a start time of 10 would correspond to a segment that actually
 *     starts at 15. For well formed content, the absolute value of the
 *     timestamp correction should be small, specifically, less than the
 *     duration of any one segment in the stream.
 */
shaka.media.IStream.prototype.started = function(proceed) {};


/**
 * Returns true if the stream has ended; otherwise, returns false. The Stream
 * can only end after it has been signalled to proceed after startup completes.
 * (see {@link shaka.media.IStream#started}).
 *
 * @return {boolean} True if the stream has ended; otherwise, return false.
 */
shaka.media.IStream.prototype.hasEnded = function() {};


/**
 * Start or switch the stream to the given |streamInfo|.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @param {number} minBufferTime The amount of content to buffer, in seconds,
 *     when the stream starts for the first time.
 * @param {boolean} clearBuffer If true, removes the previous stream's content
 *     before switching to the new stream.
 * @param {number=} opt_clearBufferOffset if |clearBuffer| and
 *     |opt_clearBufferOffset|
 *     are truthy, clear the stream buffer from the offset (in front of video
 *     currentTime) to the end of the stream.
 */
shaka.media.IStream.prototype.switch = function(
    streamInfo, minBufferTime, clearBuffer, opt_clearBufferOffset) {};


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

