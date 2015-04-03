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
 * @fileoverview Defines the IVideoSource interface.
 */

goog.provide('shaka.player.IVideoSource');

goog.require('shaka.media.StreamConfig');
goog.require('shaka.player.AudioTrack');
goog.require('shaka.player.DrmSchemeInfo');
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
 * Destroys the video source.
 */
shaka.player.IVideoSource.prototype.destroy = function() {};


/**
 * Attaches the video source to the specified video element.
 * This allows the Player to avoid setting the video's |src| attribute until it
 * is ready.  Should not be called until after load() has been resolved.
 *
 * @param {shaka.player.Player} player The associated Player, which may be used
 *     for event bubbling and stats.
 * @param {!HTMLVideoElement} video The video element.
 * @return {!Promise}
 */
shaka.player.IVideoSource.prototype.attach = function(player, video) {};


/**
 * Load any intermediate source material (manifest, etc.)
 *
 * @param {string} preferredLanguage The user's preferred language tag.
 * @see IETF RFC 5646
 * @see ISO 639
 * @return {!Promise}
 */
shaka.player.IVideoSource.prototype.load = function(preferredLanguage) {};


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
 * Gets the number of seconds of data needed to resume after buffering.
 *
 * @return {number}
 */
shaka.player.IVideoSource.prototype.getResumeThreshold = function() {};


/**
 * Get a list of configurations supported by this source.
 * The array may not be empty.
 *
 * Should not be called before the load() promise is resolved.
 *
 * @return {!Array.<!shaka.media.StreamConfig>}
 */
shaka.player.IVideoSource.prototype.getConfigurations = function() {};


/**
 * Select streams based on the given configurations.
 * Should not be called before the load() promise is resolved.
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
 * @param {boolean} immediate If true, switch immediately.  Otherwise, switch
 *     when convenient.
 *
 * @return {boolean} True if the specified VideoTrack was found.
 */
shaka.player.IVideoSource.prototype.selectVideoTrack =
    function(id, immediate) {};


/**
 * Select an audio track by ID.
 *
 * @param {number} id The |id| field of the desired AudioTrack object.
 * @param {boolean} immediate If true, switch immediately.  Otherwise, switch
 *     when convenient.
 *
 * @return {boolean} True if the specified AudioTrack was found.
 */
shaka.player.IVideoSource.prototype.selectAudioTrack =
    function(id, immediate) {};


/**
 * Select a text track by ID.
 *
 * @param {number} id The |id| field of the desired TextTrack object.
 * @param {boolean} immediate If true, switch immediately.  Otherwise, switch
 *     when convenient.
 *
 * @return {boolean} True if the specified TextTrack was found.
 */
shaka.player.IVideoSource.prototype.selectTextTrack =
    function(id, immediate) {};


/**
 * Enable or disable the text track.  Has no effect if called before
 * load() resolves.
 *
 * @param {boolean} enabled
 */
shaka.player.IVideoSource.prototype.enableTextTrack = function(enabled) {};


/**
 * Enable or disable bitrate adaptation.  May be called at any time.
 *
 * @param {boolean} enabled
 */
shaka.player.IVideoSource.prototype.enableAdaptation = function(enabled) {};


/**
 * Sets restrictions on the video tracks which can be selected.  Video tracks
 * that exceed any of these restrictions will be ignored.  Should not be called
 * before IVideoSource.load() resolves.
 *
 * @param {!shaka.player.DrmSchemeInfo.Restrictions} restrictions
 */
shaka.player.IVideoSource.prototype.setRestrictions = function(restrictions) {};


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
 * @return {boolean} True if the stream is live.
 */
shaka.player.IVideoSource.prototype.isLive = function() {};
