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
 * @externs
 */


/**
 * An object which selects Streams from a set of possible choices.  This also
 * watches for system changes to automatically adapt for the current streaming
 * requirements.  For example, when the network slows down, this class is in
 * charge of telling the Player which streams to switch to in order to reduce
 * the required bandwidth.
 *
 * This class is given a set of streams to choose from when the Player starts
 * up.  This class should store these and use them to make future decisions
 * about ABR.  It is up to this class how those decisions are made.  All the
 * Player will do is tell this class what streams to choose from.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.AbrManager = function() {};


/**
 * A callback into the Player that should be called when the AbrManager decides
 * it's time to change to a different variant.
 *
 * The first argument is a variant to switch to.
 *
 * The second argument is an optional boolean. If true, all data will be removed
 * from the buffer, which will result in a buffering event. Unless a third
 * argument is passed.
 *
 * The third argument in an optional number that specifies how much data (in
 * seconds) should be retained when clearing the buffer. This can help achieve
 * a fast switch that doesn't involve a buffering event. A minimum of two video
 * segments should always be kept buffered to avoid temporary hiccups.
 *
 * @typedef {function(shaka.extern.Variant, boolean=, number=)}
 * @exportDoc
 */
shaka.extern.AbrManager.SwitchCallback;


/**
 * A factory for creating the abr manager.  This will be called with 'new'.
 *
 * @typedef {function(new:shaka.extern.AbrManager)}
 * @exportDoc
 */
shaka.extern.AbrManager.Factory;


/**
 * Initializes the AbrManager.
 *
 * @param {shaka.extern.AbrManager.SwitchCallback} switchCallback
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.init = function(switchCallback) {};


/**
 * Stops any background timers and frees any objects held by this instance.
 * This will only be called after a call to init.
 *
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.stop = function() {};


/**
 * Updates manager's variants collection.
 *
 * @param {!Array.<!shaka.extern.Variant>} variants
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.setVariants = function(variants) {};


/**
 * Chooses one variant to switch to.  Called by the Player.
 * @return {shaka.extern.Variant}
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.chooseVariant = function() {};


/**
 * Enables automatic Variant choices from the last ones passed to setVariants.
 * After this, the AbrManager may call switchCallback() at any time.
 *
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.enable = function() {};


/**
 * Disables automatic Stream suggestions. After this, the AbrManager may not
 * call switchCallback().
 *
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.disable = function() {};


/**
 * Notifies the AbrManager that a segment has been downloaded (includes MP4
 * SIDX data, WebM Cues data, initialization segments, and media segments).
 *
 * @param {number} deltaTimeMs The duration, in milliseconds, that the request
 *     took to complete.
 * @param {number} numBytes The total number of bytes transferred.
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.segmentDownloaded = function(
    deltaTimeMs, numBytes) {};


/**
 * Gets an estimate of the current bandwidth in bit/sec.  This is used by the
 * Player to generate stats.
 *
 * @return {number}
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.getBandwidthEstimate = function() {};


/**
 * Sets the ABR configuration.
 *
 * It is the responsibility of the AbrManager implementation to implement the
 * restrictions behavior described in shaka.extern.AbrConfiguration.
 *
 * @param {shaka.extern.AbrConfiguration} config
 * @exportDoc
 */
shaka.extern.AbrManager.prototype.configure = function(config) {};
