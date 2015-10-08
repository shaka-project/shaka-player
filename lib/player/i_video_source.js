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

goog.provide('shaka.player.IVideoSource');

goog.require('shaka.media.StreamConfig');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.Player');
goog.require('shaka.player.TextTrack');
goog.require('shaka.player.VideoTrack');
goog.require('shaka.util.MultiMap');



/**
 * @interface
 * @extends {EventTarget}
 */
shaka.player.IVideoSource = function() {};


/**
 * Configures the VideoSource options. Options are set via key-value pairs.
 *
 * @example
 *     videoSouce.configure({'streamBufferSize': 20});
 *
 * @param {!Object.<string, *>} config A configuration object, which contains
 *     the configuration options as key-value pairs. All fields should have
 *     already been validated.
 */
shaka.player.IVideoSource.prototype.configure = function(config) {};


/**
 * Destroys the video source.
 */
shaka.player.IVideoSource.prototype.destroy = function() {};


/**
 * Attaches the video source to the specified video element.
 * This allows the Player to avoid setting the video's |src| attribute until it
 * is ready.
 *
 * Should not be called until load() has been resolved.
 * Should only be called once.
 *
 * @param {shaka.player.Player} player The associated Player, which may be used
 *     for event bubbling and stats.
 * @param {!HTMLVideoElement} video The video element.
 * @return {!Promise}
 */
shaka.player.IVideoSource.prototype.attach = function(player, video) {};


/**
 * Load any intermediate source material (manifest, etc.)
 * Should only be called once.
 *
 * @return {!Promise}
 */
shaka.player.IVideoSource.prototype.load = function() {};


/**
 * Gets the available video tracks.
 *
 * @return {!Array.<!shaka.player.VideoTrack>}
 */
shaka.player.IVideoSource.prototype.getVideoTracks = function() {};


/**
 * Gets the available audio tracks.
 *
 * @return {!Array.<!shaka.player.AudioTrack>}
 */
shaka.player.IVideoSource.prototype.getAudioTracks = function() {};


/**
 * Gets the available text tracks.
 *
 * @return {!Array.<!shaka.player.TextTrack>}
 */
shaka.player.IVideoSource.prototype.getTextTracks = function() {};


/**
 * Gets the video source's buffering goal, which is the amount of content, in
 * seconds, that the video source requires to be buffered for smooth playback.
 *
 * @return {number} The buffering goal.
 */
shaka.player.IVideoSource.prototype.getBufferingGoal = function() {};


/**
 * Get a list of configurations supported by the video source.
 *
 * Should not be called before load() resolves.
 *
 * @return {!Array.<!shaka.media.StreamConfig>} A non-empty array.
 */
shaka.player.IVideoSource.prototype.getConfigurations = function() {};


/**
 * Select the streams to use based on the given configurations.
 *
 * Should not be called before load() resolves.
 * Should not be called after attach() has been resolved.
 *
 * @param {!shaka.util.MultiMap.<!shaka.media.StreamConfig>} configs
 *     The keys are content types, such as 'audio', 'video', or 'text'.
 *     The implementation may ignore the keys if they are not helpful.
 */
shaka.player.IVideoSource.prototype.selectConfigurations =
    function(configs) {};


/**
 * Select a video track by ID.
 *
 * @param {number} id The |id| field of the desired VideoTrack object.
 * @param {boolean} clearBuffer If true, removes the previous stream's content
 *     before switching to the new stream.
 * @param {number=} opt_clearBufferOffset if |clearBuffer| and
 *     |opt_clearBufferOffset| are truthy, clear the stream buffer from the
 *     given offset (relative to the video's current time) to the end of the
 *     stream.
 *
 * @return {boolean} True on success; otherwise, return false if the specified
 *     VideoTrack does not exist or if a video stream does not exist.
 */
shaka.player.IVideoSource.prototype.selectVideoTrack =
    function(id, clearBuffer, opt_clearBufferOffset) {};


/**
 * Select an audio track by ID.
 *
 * @param {number} id The |id| field of the desired AudioTrack object.
 * @param {boolean} clearBuffer If true, removes the previous stream's content
 *     before switching to the new stream.
 *
 * @return {boolean} True on success; otherwise, return false if the specified
 *     AudioTrack does not exist or if an audio stream does not exist.
 */
shaka.player.IVideoSource.prototype.selectAudioTrack =
    function(id, clearBuffer) {};


/**
 * Select a text track by ID.
 *
 * @param {number} id The |id| field of the desired TextTrack object.
 * @param {boolean} clearBuffer If true, removes the previous stream's content
 *     before switching to the new stream.
 *
 * @return {boolean} True on success; otherwise, return false if the specified
 *     TextTrack does not exist or if a text stream does not exist.
 */
shaka.player.IVideoSource.prototype.selectTextTrack =
    function(id, clearBuffer) {};


/**
 * Enable or disable the text track.
 *
 * Has no effect if called before load() resolves.
 *
 * @param {boolean} enabled
 */
shaka.player.IVideoSource.prototype.enableTextTrack = function(enabled) {};


/**
 * Gets the available session IDs.
 *
 * @return {!Array.<string>}
 */
shaka.player.IVideoSource.prototype.getSessionIds = function() {};


/**
 * Determines if the stream is used for offline playback.
 *
 * @return {boolean} True if the stream is stored or being stored.
 */
shaka.player.IVideoSource.prototype.isOffline = function() {};


/**
 * Determines if the stream is live.
 *
 * Should not be called before load() resolves.
 *
 * @return {boolean} True if the stream is live.
 */
shaka.player.IVideoSource.prototype.isLive = function() {};


/**
 * Sets the desired time (in seconds) to begin playback from.
 *
 * @param {?number} startTime
 */
shaka.player.IVideoSource.prototype.setPlaybackStartTime =
    function(startTime) {};


/**
 * Notifies the video source that one or more content encryption keys have
 * changed their status.
 * @param {!Object.<string, string>} keyStatusByKeyId A map from key ID, as a
 *     hex string, to key status. Each key status is a
 *     {@link https://w3c.github.io/encrypted-media/#idl-def-MediaKeyStatus
 *      MediaKeyStatus} value.
 */
shaka.player.IVideoSource.prototype.onKeyStatusesChange = function(
    keyStatusByKeyId) {};

