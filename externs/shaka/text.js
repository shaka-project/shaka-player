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
 * @typedef {{
 *   x: number,
 *   y: number,
 *   width: number,
 *   height: number
 * }}
 *
 * @description
 * The region of the video to render the cues into.
 *
 * @property {number} x
 *   The X offset to start the rendering area.  This is a percentage (0-100) of
 *   the video width.
 * @property {number} y
 *   The Y offset to start the rendering area.  This is a percentage (0-100) of
 *   the video height.
 * @property {number} width
 *   The width of the rendering area.  This is a percentage (0-100) of the video
 *   width.
 * @property {number} height
 *   The height of the rendering area.  This is a percentage (0-100) of the
 *   video height.
 */
shakaExtern.CueRegion;



/**
 * @interface
 * @exportDoc
 */
shakaExtern.Cue = function() {};


/**
 * The start time of the cue in seconds and fractions of a second.
 * @type {number}
 */
shakaExtern.Cue.prototype.startTime;


/**
 * The end time of the cue in seconds and fractions of a second.
 * @type {number}
 */
shakaExtern.Cue.prototype.endTime;


/**
 * The text payload of the cue.
 * @type {!string}
 */
shakaExtern.Cue.prototype.payload;


/**
 * The region to render the cue into.
 * @type {shakaExtern.CueRegion}
 */
shakaExtern.Cue.prototype.region;


/**
 * The indent (in percent) of the cue box in the direction defined by the
 * writing direction.
 * @type {?number}
 */
shakaExtern.Cue.prototype.position;


/**
 * Position alignment of the cue.
 * @type {shaka.text.Cue.positionAlign}
 */
shakaExtern.Cue.prototype.positionAlign;


/**
 * Size of the cue box (in percents).
 * @type {number}
 */
shakaExtern.Cue.prototype.size;


/**
 * Alignment of the text inside the cue box.
 * @type {shaka.text.Cue.textAlign}
 */
shakaExtern.Cue.prototype.textAlign;


/**
 * Text writing direction of the cue.
 * @type {shaka.text.Cue.writingDirection}
 */
shakaExtern.Cue.prototype.writingDirection;


/**
 * The way to interpret line field. (Either as an integer line number or
 * percentage from the display box).
 * @type {shaka.text.Cue.lineInterpretation}
 */
shakaExtern.Cue.prototype.lineInterpretation;


/**
 * The offset from the display box in either number of lines or
 * percentage depending on the value of lineInterpretation.
 * @type {?number}
 */
shakaExtern.Cue.prototype.line;


/**
 * Separation between line areas inside the cue box in px or em
 * (e.g. '100px'/'100em'). If not specified, should be no less than
 * the largest font size applied to the text in the cue.
 * @type {string}.
 */
shakaExtern.Cue.prototype.lineHeight;


/**
 * Line alignment of the cue box.
 * @type {shaka.text.Cue.lineAlign}
 */
shakaExtern.Cue.prototype.lineAlign;


/**
 * Vertical alignments of the cues within their extents.
 * @type {shaka.text.Cue.displayAlign}
 */
shakaExtern.Cue.prototype.displayAlign;


/**
 * Text color represented by any string that would be
 * accepted in CSS.
 * E. g. '#FFFFFF' or 'white'.
 * @type {!string}
 */
shakaExtern.Cue.prototype.color;


/**
 * Text background color represented by any string that would be
 * accepted in CSS.
 * E. g. '#FFFFFF' or 'white'.
 * @type {!string}
 */
shakaExtern.Cue.prototype.backgroundColor;


/**
 * Text font size in px or em (e.g. '100px'/'100em').
 * @type {string}
 */
shakaExtern.Cue.prototype.fontSize;


/**
 * Text font weight. Either normal or bold.
 * @type {shaka.text.Cue.fontWeight}
 */
shakaExtern.Cue.prototype.fontWeight;


/**
 * Text font style. Normal, italic or oblique.
 * @type {shaka.text.Cue.fontStyle}
 */
shakaExtern.Cue.prototype.fontStyle;


/**
 * Text font family.
 * @type {!string}
 */
shakaExtern.Cue.prototype.fontFamily;


/**
 * Text decoration. A combination of underline, overline
 * and line through. Empty array means no decoration.
 * @type {!Array.<!shaka.text.Cue.textDecoration>}
 */
shakaExtern.Cue.prototype.textDecoration;


/**
 * Whether or not line wrapping should be applied
 * to the cue.
 * @type {boolean}
 */
shakaExtern.Cue.prototype.wrapLine;


/**
 * Id of the cue.
 * @type {!string}
 */
shakaExtern.Cue.prototype.id;



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
 * @param {!Uint8Array} data
 *    The next section of buffer.
 * @param {shakaExtern.TextParser.TimeContext} timeContext
 *    The time information that should be used to adjust the times values
 *    for each cue.
 * @return {!Array.<!shakaExtern.Cue>}
 *
 * @exportDoc
 */
shakaExtern.TextParser.prototype.parseMedia = function(data, timeContext) {};


/**
 * @typedef {function(new:shakaExtern.TextParser)}
 */
shakaExtern.TextParserPlugin;



/**
 * An interface for plugins that display text.
 *
 * @interface
 * @extends {shaka.util.IDestroyable}
 * @exportDoc
 */
shakaExtern.TextDisplayer = function() {};


/**
 * Append given text cues to the list of cues to be displayed.
 *
 * @param {!Array.<!shaka.text.Cue>} cues
 *    Text cues to be appended.
 *
 * @exportDoc
 */
shakaExtern.TextDisplayer.prototype.append = function(cues) {};


/**
 * Remove cues in a given time range.
 *
 * @param {number} start
 * @param {number} end
 * @return {boolean}
 *
 * @exportDoc
 */
shakaExtern.TextDisplayer.prototype.remove = function(start, end) {};


/**
 * Returns true if text is currently visible.
 *
 * @return {boolean}
 *
 * @exportDoc
 */
shakaExtern.TextDisplayer.prototype.isTextVisible = function() {};


/**
 * Set text visibility.
 *
 * @param {boolean} on
 *
 * @exportDoc
 */
shakaExtern.TextDisplayer.prototype.setTextVisibility = function(on) {};


/**
 * A factory for creating a TextDisplayer.
 *
 * @typedef {function(new:shakaExtern.TextDisplayer)}
 * @exportDoc
 */
shakaExtern.TextDisplayer.Factory;
