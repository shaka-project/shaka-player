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
 * @interface
 * @exportDoc
 */
shaka.extern.CueRegion = function() {};


/**
 * Region identifier.
 * @type {string}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.id;


/**
 * The X offset to start the rendering area in anchorUnits of the video width.
 * @type {number}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.viewportAnchorX;


/**
 * The X offset to start the rendering area in anchorUnits of the video height.
 * @type {number}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.viewportAnchorY;


/**
 * The X offset to start the rendering area in percentage (0-100) of
 * the region width.
 * @type {number}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.regionAnchorX;


/**
 * The Y offset to start the rendering area in percentage (0-100) of
 * the region height.
 * @type {number}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.regionAnchorY;


/**
 * The width of the rendering area in widthUnits.
 * @type {number}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.width;


/**
 * The width of the rendering area in heightUnits.
 * @type {number}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.height;


/**
 * The units (percentage, pixels or lines) the region height is in.
 * @type {shaka.text.CueRegion.units}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.heightUnits;


/**
 * The units (percentage or pixels) the region width is in.
 * @type {shaka.text.CueRegion.units}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.widthUnits;


/**
 * The units (percentage or pixels) the region viewportAnchors are in.
 * @type {shaka.text.CueRegion.units}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.viewportAnchorUnits;


/**
 * If scroll=UP, it means that cues in the region will be added to the bottom of
 * the region and will push any already displayed cues in the region up.
 * Otherwise (scroll=NONE) cues will stay fixed at the location
 * they were first painted in.
 * @type {shaka.text.CueRegion.scrollMode}
 * @exportDoc
 */
shaka.extern.CueRegion.prototype.scroll;


/**
 * @interface
 * @exportDoc
 */
shaka.extern.Cue = function() {};


/**
 * The start time of the cue in seconds, relative to the start of the
 * presentation.
 * @type {number}
 * @exportDoc
 */
shaka.extern.Cue.prototype.startTime;


/**
 * The end time of the cue in seconds, relative to the start of the
 * presentation.
 * @type {number}
 * @exportDoc
 */
shaka.extern.Cue.prototype.endTime;


/**
 * The text payload of the cue.
 * @type {!string}
 * @exportDoc
 */
shaka.extern.Cue.prototype.payload;


/**
 * The region to render the cue into.
 * @type {shaka.extern.CueRegion}
 * @exportDoc
 */
shaka.extern.Cue.prototype.region;


/**
 * The indent (in percent) of the cue box in the direction defined by the
 * writing direction.
 * @type {?number}
 * @exportDoc
 */
shaka.extern.Cue.prototype.position;


/**
 * Position alignment of the cue.
 * @type {shaka.text.Cue.positionAlign}
 * @exportDoc
 */
shaka.extern.Cue.prototype.positionAlign;


/**
 * Size of the cue box (in percents).
 * @type {number}
 * @exportDoc
 */
shaka.extern.Cue.prototype.size;


/**
 * Alignment of the text inside the cue box.
 * @type {shaka.text.Cue.textAlign}
 * @exportDoc
 */
shaka.extern.Cue.prototype.textAlign;


/**
 * Text direction of the cue.
 * @type {shaka.text.Cue.direction}
 * @exportDoc
 */
shaka.extern.Cue.prototype.direction;


/**
 * Text writing mode of the cue.
 * @type {shaka.text.Cue.writingMode}
 * @exportDoc
 */
shaka.extern.Cue.prototype.writingMode;


/**
 * The way to interpret line field. (Either as an integer line number or
 * percentage from the display box).
 * @type {shaka.text.Cue.lineInterpretation}
 * @exportDoc
 */
shaka.extern.Cue.prototype.lineInterpretation;


/**
 * The offset from the display box in either number of lines or
 * percentage depending on the value of lineInterpretation.
 * @type {?number}
 * @exportDoc
 */
shaka.extern.Cue.prototype.line;


/**
 * Separation between line areas inside the cue box in px or em
 * (e.g. '100px'/'100em'). If not specified, this should be no less than
 * the largest font size applied to the text in the cue.
 * @type {string}.
 * @exportDoc
 */
shaka.extern.Cue.prototype.lineHeight;


/**
 * Line alignment of the cue box.
 * Start alignment means the cue box’s top side (for horizontal cues), left side
 * (for vertical growing right), or right side (for vertical growing left) is
 * aligned at the line.
 * Center alignment means the cue box is centered at the line.
 * End alignment The cue box’s bottom side (for horizontal cues), right side
 * (for vertical growing right), or left side (for vertical growing left) is
 * aligned at the line.
 * @type {shaka.text.Cue.lineAlign}
 * @exportDoc
 */
shaka.extern.Cue.prototype.lineAlign;


/**
 * Vertical alignments of the cues within their extents.
 * 'BEFORE' means displaying the captions at the top of the text display
 * container box, 'CENTER' means in the middle, 'AFTER' means at the bottom.
 * @type {shaka.text.Cue.displayAlign}
 * @exportDoc
 */
shaka.extern.Cue.prototype.displayAlign;


/**
 * Text color represented by any string that would be accepted in CSS.
 * E. g. '#FFFFFF' or 'white'.
 * @type {!string}
 * @exportDoc
 */
shaka.extern.Cue.prototype.color;


/**
 * Text background color represented by any string that would be
 * accepted in CSS.
 * E. g. '#FFFFFF' or 'white'.
 * @type {!string}
 * @exportDoc
 */
shaka.extern.Cue.prototype.backgroundColor;


/**
 * Image background represented by any string that would be
 * accepted in image HTML element.
 * E. g. 'data:[mime type];base64,[data]'.
 * @type {!string}
 * @exportDoc
 */
shaka.extern.Cue.prototype.backgroundImage;


/**
 * Text font size in px or em (e.g. '100px'/'100em').
 * @type {string}
 * @exportDoc
 */
shaka.extern.Cue.prototype.fontSize;


/**
 * Text font weight. Either normal or bold.
 * @type {shaka.text.Cue.fontWeight}
 * @exportDoc
 */
shaka.extern.Cue.prototype.fontWeight;


/**
 * Text font style. Normal, italic or oblique.
 * @type {shaka.text.Cue.fontStyle}
 * @exportDoc
 */
shaka.extern.Cue.prototype.fontStyle;


/**
 * Text font family.
 * @type {!string}
 * @exportDoc
 */
shaka.extern.Cue.prototype.fontFamily;


/**
 * Text decoration. A combination of underline, overline
 * and line through. Empty array means no decoration.
 * @type {!Array.<!shaka.text.Cue.textDecoration>}
 * @exportDoc
 */
shaka.extern.Cue.prototype.textDecoration;


/**
 * Whether or not line wrapping should be applied to the cue.
 * @type {boolean}
 * @exportDoc
 */
shaka.extern.Cue.prototype.wrapLine;


/**
 * Id of the cue.
 * @type {!string}
 * @exportDoc
 */
shaka.extern.Cue.prototype.id;

/**
 * Nested cues
 * @type {Array.<!shaka.extern.Cue>}
 * @exportDoc
 */
shaka.extern.Cue.prototype.nestedCues;

/**
 * Whether or not the cue only acts as a spacer between two cues
 * @type {boolean}
 * @exportDoc
 */
shaka.extern.Cue.prototype.spacer;


/**
 * An interface for plugins that parse text tracks.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.TextParser = function() {};


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
shaka.extern.TextParser.TimeContext;


/**
 * Parse an initialization segment. Some formats do not have init
 * segments so this won't always be called.
 *
 * @param {!Uint8Array} data
 *    The data that makes up the init segment.
 *
 * @exportDoc
 */
shaka.extern.TextParser.prototype.parseInit = function(data) {};


/**
 * Parse a media segment and return the cues that make up the segment.
 *
 * @param {!Uint8Array} data
 *    The next section of buffer.
 * @param {shaka.extern.TextParser.TimeContext} timeContext
 *    The time information that should be used to adjust the times values
 *    for each cue.
 * @return {!Array.<!shaka.extern.Cue>}
 *
 * @exportDoc
 */
shaka.extern.TextParser.prototype.parseMedia = function(data, timeContext) {};


/**
 * @typedef {function(new:shaka.extern.TextParser)}
 * @exportDoc
 */
shaka.extern.TextParserPlugin;


/**
 * An interface for plugins that display text.
 *
 * @interface
 * @extends {shaka.util.IDestroyable}
 * @exportDoc
 */
shaka.extern.TextDisplayer = function() {};


/**
 * @override
 * @exportDoc
 */
shaka.extern.TextDisplayer.prototype.destroy = function() {};


/**
 * Append given text cues to the list of cues to be displayed.
 *
 * @param {!Array.<!shaka.text.Cue>} cues
 *    Text cues to be appended.
 *
 * @exportDoc
 */
shaka.extern.TextDisplayer.prototype.append = function(cues) {};


/**
 * Remove all cues that are fully contained by the given time range (relative
 * to the presentation). |endTime| will be greater to equal to |startTime|.
 * |remove| should only return |false| if the displayer has been destroyed. If
 * the displayer has not been destroyed |remove| should return |true|.
 *
 * @param {number} startTime
 * @param {number} endTime
 *
 * @return {boolean}
 *
 * @exportDoc
 */
shaka.extern.TextDisplayer.prototype.remove = function(startTime, endTime) {};


/**
 * Returns true if text is currently visible.
 *
 * @return {boolean}
 *
 * @exportDoc
 */
shaka.extern.TextDisplayer.prototype.isTextVisible = function() {};


/**
 * Set text visibility.
 *
 * @param {boolean} on
 *
 * @exportDoc
 */
shaka.extern.TextDisplayer.prototype.setTextVisibility = function(on) {};


/**
 * A factory for creating a TextDisplayer.
 *
 * @typedef {function(new:shaka.extern.TextDisplayer)}
 * @exportDoc
 */
shaka.extern.TextDisplayer.Factory;
