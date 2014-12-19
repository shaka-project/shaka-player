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
 * @fileoverview DASH stream interface.
 */

goog.provide('shaka.dash.IDashStream');

goog.require('shaka.dash.mpd');



/**
 * An IDashStream is an active representation.
 *
 * @interface
 * @extends {EventTarget}
 */
shaka.dash.IDashStream = function() {};


/**
 * Destroys the DashStream.
 */
shaka.dash.IDashStream.prototype.destroy = function() {};


/** @return {shaka.dash.mpd.Representation} */
shaka.dash.IDashStream.prototype.getRepresentation = function() {};


/** @return {boolean} */
shaka.dash.IDashStream.prototype.hasEnded = function() {};


/**
 * Start processing the stream.  This should only be called once.
 * An 'ended' event will be fired on EOF.
 *
 * @param {!shaka.dash.mpd.Representation} representation The representation.
 */
shaka.dash.IDashStream.prototype.start = function(representation) {};


/**
 * Switch the stream to use the given |representation|.  The stream must
 * already be started.
 *
 * @param {!shaka.dash.mpd.Representation} representation The representation.
 * @param {boolean} immediate If true, switch as soon as possible.  Otherwise,
 *     switch when convenient.
 */
shaka.dash.IDashStream.prototype.switch =
    function(representation, immediate) {};


/**
 * Resync the stream with the video's currentTime.  Called on seeking.
 */
shaka.dash.IDashStream.prototype.resync = function() {};


/**
 * Enable or disable the stream.  Not supported for all stream types.
 *
 * @param {boolean} enabled
 */
shaka.dash.IDashStream.prototype.setEnabled = function(enabled) {};


/**
 * @return {boolean} true if the stream is enabled.
 */
shaka.dash.IDashStream.prototype.getEnabled = function() {};

