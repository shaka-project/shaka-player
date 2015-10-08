/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.provide('shaka.media.IStream');

goog.require('shaka.media.StreamInfo');



/**
 * <p>
 * IStream provides an interface to present streams. A stream is data, which
 * may be fragmented into multiple segments, that can be presented to the user
 * (e.g., aurally or visually). A StreamInfo object describes an individual
 * stream. IStream does not dictate a presentation medium or mechanism; Stream
 * implementations may present streams however they wish (e.g., via an
 * HTMLMediaElement).
 * </p>
 *
 * <p>
 * Stream callers (i.e., clients) can use a single Stream object to present one
 * or more streams, but a Stream object can only present one stream at one time
 * (note that multiple Stream objects can present multiple streams in
 * parallel). Stream implementations should support stream switching, although
 * this may not be possible for all stream types. Furthermore, Streams may
 * support just one stream type (e.g., text) or multiple stream types (e.g.,
 * audio and video).
 * </p>
 *
 * <p>
 * Stream implementations must implement the IStream state model, which enables
 * callers to deduce which state the Stream is in based upon its interaction
 * with the Stream. The IStream state model consists of the following states
 * <ol>
 * <li>
 *   <b>idle</b> <br>
 *   The caller has created the Stream but has not called switch().
 *
 * <li>
 *   <b>startup</b> <br>
 *   The caller has called switch(), and the Stream is performing its
 *   initialization sequence (see {@link shaka.media.IStream#started}). If the
 *   Stream encounters an error during startup then it must reject its
 *   started() Promise. Stream implementations may treat errors during startup
 *   as either recoverable or unrecoverable and may provide their own recovery
 *   mechanism if they so choose.
 *
 * <li>
 *   <b>waiting</b> <br>
 *   The Stream has completed startup, but the caller has not signalled the
 *   Stream to proceed (see {@link shaka.media.IStream#started}).
 *
 * <li>
 *   <b>streaming</b> <br>
 *   The caller has signalled the Stream to proceed, and the Stream is
 *   processing and presenting data. If the Stream encounters an error while
 *   streaming then it should attempt to recover, fire an error event, or do
 *   both.
 *
 * <li>
 *   <b>ended</b> <br>
 *   The Stream has no more data available but may still be presenting data.
 * </ol>
 *
 * And state transitions
 * <pre>
 * idle --> startup --> waiting --> streaming --> ended --+
 *                                      ^                 |
 *                                      |                 |
 *                                      +-----------------+
 * </pre>
 * </p>
 *
 * @interface
 * @extends {EventTarget}
 */
shaka.media.IStream = function() {};


/**
 * @event shaka.media.IStream.AdaptationEvent
 * @description Fired when an audio, video, or text track has changed, or more
 *     specifically, when the Stream has buffered at least one segment of a
 *     new stream. Bubbles up through the Player.
 * @property {string} type 'adaptation'
 * @property {boolean} bubbles true
 * @property {string} contentType The new stream's content type, e.g., 'audio',
 *     'video', or 'text'.
 * @property {?{width: number, height: number}} size The new stream's
 *     resolution, if applicable. Note: the new stream may not start presenting
 *     immediately (see {@link shaka.media.IStream#switch}), so the user may not
 *     see the resolution change immediately.
 * @property {number} bandwidth The new stream's bandwidth requirement in
 *     bits per second.
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


/**
 * Gets the StreamInfo that corresponds to the stream that is currently being
 * processed or presented. Note that this StreamInfo may be different than the
 * last StreamInfo that was passed to switch()
 * (see {@link shaka.media.IStream#switch}).
 *
 * @return {shaka.media.StreamInfo}
 */
shaka.media.IStream.prototype.getStreamInfo = function() {};


/**
 * Gets the SegmentIndex of the StreamInfo that corresponds to the stream that
 * is currently being processed or presented. Note that this SegmentIndex may
 * be different than the SegmentIndex of the last StreamInfo that was passed to
 * switch()
 * (see {@link shaka.media.IStream#switch}).
 *
 * @return {shaka.media.SegmentIndex}
 */
shaka.media.IStream.prototype.getSegmentIndex = function() {};


/**
 * Returns a promise that the Stream will resolve immediately after startup
 * (i.e., the Stream's initialization sequence) completes. Stream
 * implementations may implement startup as they wish but startup should entail
 * acquiring some initial resources. Implementations must resolve the returned
 * Promise if startup completes and reject the returned Promise if startup
 * fails.
 *
 * This function can only be called once.
 *
 * @param {!Promise} proceed A Promise that the caller must resolve after
 *     startup completes to signal the Stream that it can proceed. The Stream
 *     will idle while in the 'waiting' state. Callers must never reject
 *     |proceed|.
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
 * can only end while it's in the 'streaming' state.
 *
 * @return {boolean} True if the stream has ended; otherwise, return false.
 */
shaka.media.IStream.prototype.hasEnded = function() {};


/**
 * Starts presenting the specified stream. Stream implementations may implement
 * stream switching asynchronously, in which case, they must implement the
 * switch state model, which consists of the following states
 * <ol>
 * <li>
 *   <b>acquiring-metadata</b> <br>
 *   The caller has called switch(), and the Stream is acquiring the new
 *   stream's metadata, but the stream itself is not being processed;
 *   getStreamInfo() and getSegmentIndex() must not return the new StreamInfo
 *   and SegmentIndex.
 *
 * <li>
 *   <b>processing</b> <br>
 *   The Stream is processing the new stream's content, but the stream's
 *   content is not buffered yet; getStreamInfo() and getSegmentIndex()
 *   must return the new StreamInfo and SegmentIndex.
 *
 * <li>
 *   <b>buffered</b> <br>
 *   The Stream has buffered some of the new stream's content (e.g., at least
 *   one segment), but the Stream may or may not be presenting the new stream's
 *   content, i.e., the Stream's current position may or may not be within the
 *   new stream's buffered range at this time.
 * </ol>
 *
 * Stream implementations must fire an AdaptationEvent when/after transitioning
 * from the 'processing' state to the 'buffered' state.
 *
 * @param {!shaka.media.StreamInfo} streamInfo
 * @param {boolean} clearBuffer If true, removes the previous stream's content
 *     before switching to the new stream.
 * @param {number=} opt_clearBufferOffset if |clearBuffer| and
 *     |opt_clearBufferOffset| are truthy, clear the stream buffer from the
 *     given offset (relative to the Stream's current position) to the end of
 *     the stream.
 */
shaka.media.IStream.prototype.switch = function(
    streamInfo, clearBuffer, opt_clearBufferOffset) {};


/**
 * Resynchronizes the Stream's current position, e.g., to the video's playhead,
 * or does nothing if the Stream does not require manual resynchronization.
 */
shaka.media.IStream.prototype.resync = function() {};


/**
 * Gets whether the given time is currently buffered by the stream.
 *
 * @param {number} time The time in seconds to check.
 * @return {boolean}
 */
shaka.media.IStream.prototype.isBuffered = function(time) {};


/**
 * Enables or disables stream presentation or does nothing if the Stream cannot
 * disable stream presentation.
 *
 * @param {boolean} enabled
 */
shaka.media.IStream.prototype.setEnabled = function(enabled) {};


/**
 * @return {boolean} True if the stream is enabled; otherwise, return false.
 */
shaka.media.IStream.prototype.getEnabled = function() {};

