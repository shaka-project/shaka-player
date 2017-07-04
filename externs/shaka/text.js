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
 * An interface for plugins that parse text tracks.
 *
 * @interface
 * @exportDoc
 */
shakaExtern.TextParser = function() {};


/**
 * A collection of time offsets used to adjust text cue times.
 *
 * @typedef {{
 *   periodStart : number,
 *   segmentStart : number,
 *   segmentEnd : number
 * }}
 *
 * @property {number} periodStart
 *     The absolute start time of the period in seconds.
 * @property {number} segmentStart
 *     The absolute start time of the segment in seconds.
 * @property {number} segmentEnd
 *     The absolute end time of the segment in seconds.
 *
 * @exportDoc
 */
shakaExtern.TextParser.TimeContext;


/**
 * Parse an initialization segment. Some formats do not have init
 * segments so this won't always be called.
 *
 * @param {!ArrayBuffer} data
 *    The data that makes up the init segment.
 *
 * @exportDoc
 */
shakaExtern.TextParser.prototype.parseInit = function(data) {};


/**
 * Parse a media segment and return the cues that make up the segment.
 *
 * @param {!ArrayBuffer} data
 *    The next section of buffer.
 * @param {shakaExtern.TextParser.TimeContext} timeContext
 *    The time information that should be used to adjust the times values
 *    for each cue.
 * @return {!Array.<!TextTrackCue>}
 *
 * @exportDoc
 */
shakaExtern.TextParser.prototype.parseMedia = function(data, timeContext) {};


/**
 * @typedef {function(new:shakaExtern.TextParser)}
 */
shakaExtern.TextParserPlugin;
