/**
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
 *
 * @fileoverview An interface for tracking bandwidth samples and estimating
 * available bandwidth.
 */

goog.provide('shaka.media.IAbrManager');



/**
 * An interface for a generic adaptive bit-rate Manager.  An AbrManager listens
 * for bandwidth events and makes decisions about which stream should be used at
 * any given time.  It can be queried for the initial stream to use when
 * starting playback, and it will make active stream changes during playback
 * (if enabled).
 *
 * @listens shaka.util.IBandwidthEstimator.BandwidthEvent
 *
 * @interface
 */
shaka.media.IAbrManager = function() {};


/**
 * Destroy the AbrManager.
 *
 * @expose
 */
shaka.media.IAbrManager.prototype.destroy = function() {};


/**
 * Starts the AbrManager.
 *
 * @param {!shaka.util.IBandwidthEstimator} estimator
 * @param {!shaka.player.IVideoSource} videoSource
 * @expose
 */
shaka.media.IAbrManager.prototype.start = function(estimator, videoSource) {};


/**
 * Enable or disable the AbrManager.  It is enabled by default when created.
 *
 * @param {boolean} enabled
 * @expose
 */
shaka.media.IAbrManager.prototype.enable = function(enabled) {};


/**
 * Decide on an initial video track to use.  Called before playback begins.
 *
 * @return {?number} The chosen video track ID or null if there are no video
 *     tracks to choose.
 * @expose
 */
shaka.media.IAbrManager.prototype.getInitialVideoTrackId = function() {};
