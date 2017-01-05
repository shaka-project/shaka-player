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


/** @externs */



/**
 * An object which selects Streams for adaptive bit-rate presentations.
 *
 * @interface
 * @exportDoc
 */
shakaExtern.AbrManager = function() {};


/**
 * A callback which implementations call to switch streams.
 *
 * The first argument is a map of content types to chosen streams.
 *
 * The second argument is an optional boolean.  If true, all data will be
 * from the buffer, which will result in a buffering event.
 *
 * @typedef {function(!Object.<string, !shakaExtern.Stream>, boolean=)}
 * @exportDoc
 */
shakaExtern.AbrManager.SwitchCallback;


/**
 * Initializes the AbrManager.
 *
 * @param {shakaExtern.AbrManager.SwitchCallback} switchCallback
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.init = function(switchCallback) {};


/**
 * Updates manager's variants collection.
 *
 * @param {!Array.<!shakaExtern.Variant>} variants
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.setVariants = function(variants) {};


/**
 * Updates manager's text streams collection.
 *
 * @param {!Array.<!shakaExtern.Stream>} streams
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.setTextStreams = function(streams) {};


/**
 * Chooses one Stream from each media type in mediaTypesToUpdate to switch to.
 * All Variants and Streams must be from the same Period.
 *
 * @param {!Array.<!string>} mediaTypesToUpdate
 * @return {!Object.<string, shakaExtern.Stream>}
 * @exportDoc
 */
// TODO: Consider breaking down into chooseVariant() and chooseText()
shakaExtern.AbrManager.prototype.chooseStreams =
    function(mediaTypesToUpdate) {};


/**
 * Enables automatic Stream choices from the last StreamSets passed to
 * chooseStreams(). After this, the AbrManager may call switchCallback() at any
 * time.
 *
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.enable = function() {};


/**
 * Disables automatic Stream suggestions. After this, the AbrManager may not
 * call switchCallback().
 *
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.disable = function() {};


/**
 * Notifies the AbrManager that a segment has been downloaded (includes MP4
 * SIDX data, WebM Cues data, initialization segments, and media segments).
 *
 * @param {number} deltaTimeMs The duration, in milliseconds, that the request
 *     took to complete.
 * @param {number} numBytes The total number of bytes transferred.
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.segmentDownloaded = function(
    deltaTimeMs, numBytes) {};


/**
 * Stops any background timers and frees any objects held by this instance.
 * This will only be called after a call to init.
 *
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.stop = function() {};


/**
 * Gets an estimate of the current bandwidth in bit/sec.  This is used by the
 * Player to generate stats.
 *
 * @return {number}
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.getBandwidthEstimate = function() {};


/**
 * Sets the default bandwidth estimate to use if there is not enough data.
 *
 * @param {number} estimate The default bandwidth estimate, in bit/sec.
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.setDefaultEstimate = function(estimate) {};


/**
 * Sets the restrictions that AbrManager will use when choosing streams.
 *
 * @param {shakaExtern.Restrictions} restrictions
 * @exportDoc
 */
shakaExtern.AbrManager.prototype.setRestrictions = function(restrictions) {};
