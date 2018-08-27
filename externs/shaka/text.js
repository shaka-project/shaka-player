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
 * @interface
 * @exportDoc
 */
shakaExtern.CueRegion = function() {};


/**
 * Region identifier.
 * @type {string}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.id;


/**
 * The X offset to start the rendering area in anchorUnits of the video width.
 * @type {number}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.viewportAnchorX;


/**
 * The X offset to start the rendering area in anchorUnits of the video height.
 * @type {number}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.viewportAnchorY;


/**
 * The X offset to start the rendering area in percentage (0-100) of
 * the region width.
 * @type {number}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.regionAnchorX;


/**
 * The Y offset to start the rendering area in percentage (0-100) of
 * the region height.
 * @type {number}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.regionAnchorY;


/**
 * The width of the rendering area in widthUnits.
 * @type {number}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.width;


/**
 * The width of the rendering area in heightUnits.
 * @type {number}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.height;


/**
 * The units (percentage, pixels or lines) the region height is in.
 * @type {shaka.text.CueRegion.units}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.heightUnits;


/**
 * The units (percentage or pixels) the region width is in.
 * @type {shaka.text.CueRegion.units}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.widthUnits;


/**
 * The units (percentage or pixels) the region viewportAnchors are in.
 * @type {shaka.text.CueRegion.units}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.viewportAnchorUnits;


/**
 * If scroll=UP, it means that cues in the region will be added to the bottom of
 * the region and will push any already displayed cues in the region up.
 * Otherwise (scroll=NONE) cues will stay fixed at the location
 * they were first painted in.
 * @type {shaka.text.CueRegion.scrollMode}
 * @exportDoc
 */
shakaExtern.CueRegion.prototype.scroll;


/**
 * @interface
 * @exportDoc
 */
shakaExtern.Cue = function() {};


/**
 * The start time of the cue in seconds, relative to the start of the
 * presentation.
 * @type {number}
 * @exportDoc
 */
shakaExtern.Cue.prototype.startTime;


/**
 * The end time of the cue in seconds, relative to the start of the
 * presentation.
 * @type {number}
 * @exportDoc
 */
shakaExtern.Cue.prototype.endTime;


/**
 * The text payload of the cue.
 * @type {!string}
 * @exportDoc
 */
shakaExtern.Cue.prototype.payload;


/**
 * The region to render the cue into.
 * @type {shakaExtern.CueRegion}
 * @exportDoc
 */
shakaExtern.Cue.prototype.region;


/**
 * The indent (in percent) of the cue box in the direction defined by the
 * writing direction.
 * @type {?number}
 * @exportDoc
 */
shakaExtern.Cue.prototype.position;


/**
 * Position alignment of the cue.
 * @type {shaka.text.Cue.positionAlign}
 * @exportDoc
 */
shakaExtern.Cue.prototype.positionAlign;


/**
 * Size of the cue box (in percents).
 * @type {number}
 * @exportDoc
 */
shakaExtern.Cue.prototype.size;


/**
 * Alignment of the text inside the cue box.
 * @type {shaka.text.Cue.textAlign}
 * @exportDoc
 */
shakaExtern.Cue.prototype.textAlign;


/**
 * Text writing direction of the cue.
 * @type {shaka.text.Cue.writingDirection}
 * @exportDoc
 */
shakaExtern.Cue.prototype.writingDirection;


/**
 * The way to interpret line field. (Either as an integer line number or
 * percentage from the display box).
 * @type {shaka.text.Cue.lineInterpretation}
 * @exportDoc
 */
shakaExtern.Cue.prototype.lineInterpretation;


/**
 * The offset from the display box in either number of lines or
 * percentage depending on the value of lineInterpretation.
 * @type {?number}
 * @exportDoc
 */
shakaExtern.Cue.prototype.line;


/**
 * Separation between line areas inside the cue box in px or em
 * (e.g. '100px'/'100em'). If not specified, this should be no less than
 * the largest font size applied to the text in the cue.
 * @type {string}.
 * @exportDoc
 */
shakaExtern.Cue.prototype.lineHeight;


/**
 * Line alignment of the cue box.
 * @type {shaka.text.Cue.lineAlign}
 * @exportDoc
 */
shakaExtern.Cue.prototype.lineAlign;


/**
 * Vertical alignments of the cues within their extents.
 * @type {shaka.text.Cue.displayAlign}
 * @exportDoc
 */
shakaExtern.Cue.prototype.displayAlign;


/**
 * Text color represented by any string that would be accepted in CSS.
 * E. g. '#FFFFFF' or 'white'.
 * @type {!string}
 * @exportDoc
 */
shakaExtern.Cue.prototype.color;


/**
 * Text background color represented by any string that would be
 * accepted in CSS.
 * E. g. '#FFFFFF' or 'white'.
 * @type {!string}
 * @exportDoc
 */
shakaExtern.Cue.prototype.backgroundColor;


/**
 * Text font size in px or em (e.g. '100px'/'100em').
 * @type {string}
 * @exportDoc
 */
shakaExtern.Cue.prototype.fontSize;


/**
 * Text font weight. Either normal or bold.
 * @type {shaka.text.Cue.fontWeight}
 * @exportDoc
 */
shakaExtern.Cue.prototype.fontWeight;


/**
 * Text font style. Normal, italic or oblique.
 * @type {shaka.text.Cue.fontStyle}
 * @exportDoc
 */
shakaExtern.Cue.prototype.fontStyle;


/**
 * Text font family.
 * @type {!string}
 * @exportDoc
 */
shakaExtern.Cue.prototype.fontFamily;


/**
 * Text decoration. A combination of underline, overline
 * and line through. Empty array means no decoration.
 * @type {!Array.<!shaka.text.Cue.textDecoration>}
 * @exportDoc
 */
shakaExtern.Cue.prototype.textDecoration;


/**
 * Whether or not line wrapping should be applied to the cue.
 * @type {boolean}
 * @exportDoc
 */
shakaExtern.Cue.prototype.wrapLine;


/**
 * Id of the cue.
 * @type {!string}
 * @exportDoc
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
 *   periodStart: number,
 *   segmentStart: ?number,
 *   segmentEnd: number
 * }}
 *
 * @property {number} periodStart
 *     The absolute start time of the period in seconds.
 * @property {?number} segmentStart
 *     The absolute start time of the segment in seconds.
 *     Null if the manifest does not provide this information, such as in HLS.
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
 * @param {!Uint8Array} data
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
 * @exportDoc
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
 * @override
 * @exportDoc
 */
shakaExtern.TextDisplayer.prototype.destroy = function() {};


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
 * @param {number} startTime relative to the start of the presentation
 * @param {number} endTime relative to the start of the presentation
 * @return {boolean}
 *
 * @exportDoc
 */
shakaExtern.TextDisplayer.prototype.remove = function(startTime, endTime) {};


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
