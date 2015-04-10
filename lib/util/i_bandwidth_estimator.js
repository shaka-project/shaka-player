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
 * @fileoverview An interface for tracking bandwidth samples and estimating
 * available bandwidth.
 */

goog.provide('shaka.util.IBandwidthEstimator');


/**
 * @event shaka.util.IBandwidthEstimator.BandwidthEvent
 * @description Fired when a new bandwidth estimate is available.
 * @property {string} type 'bandwidth'
 * @property {boolean} bubbles false
 */



/**
 * Tracks bandwidth samples and estimates available bandwidth.
 *
 * @interface
 * @extends {EventTarget}
 */
shaka.util.IBandwidthEstimator = function() {};


/**
 * Takes a bandwidth sample and dispatches a 'bandwidth' event.
 *
 * @fires shaka.util.IBandwidthEstimator.BandwidthEvent
 *
 * @param {number} delayMs The time it took to collect the sample, in ms.
 * @param {number} bytes The number of bytes downloaded.
 * @expose
 */
shaka.util.IBandwidthEstimator.prototype.sample = function(delayMs, bytes) {};


/**
 * Get estimated bandwidth in bits per second.
 *
 * @return {number}
 * @expose
 */
shaka.util.IBandwidthEstimator.prototype.getBandwidth = function() {};


/**
 * Get the age of the data in seconds.  This is the time since the last sample
 * was collected.
 *
 * @return {number}
 * @expose
 */
shaka.util.IBandwidthEstimator.prototype.getDataAge = function() {};

