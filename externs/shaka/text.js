/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


/**
 * @interface
 * @exportDoc
 */
shaka.extern.CueRegion = class {
  constructor() {
    /**
     * Region identifier.
     * @type {string}
     * @exportDoc
     */
    this.id;

    /**
     * The X offset to start the rendering area in anchorUnits of the video
     * width.
     * @type {number}
     * @exportDoc
     */
    this.viewportAnchorX;

    /**
     * The X offset to start the rendering area in anchorUnits of the video
     * height.
     * @type {number}
     * @exportDoc
     */
    this.viewportAnchorY;

    /**
     * The X offset to start the rendering area in percentage (0-100) of this
     * region width.
     * @type {number}
     * @exportDoc
     */
    this.regionAnchorX;

    /**
     * The Y offset to start the rendering area in percentage (0-100) of the
     * region height.
     * @type {number}
     * @exportDoc
     */
    this.regionAnchorY;

    /**
     * The width of the rendering area in widthUnits.
     * @type {number}
     * @exportDoc
     */
    this.width;

    /**
     * The width of the rendering area in heightUnits.
     * @type {number}
     * @exportDoc
     */
    this.height;

    /**
     * The units (percentage, pixels or lines) the region height is in.
     * @type {shaka.text.CueRegion.units}
     * @exportDoc
     */
    this.heightUnits;

    /**
     * The units (percentage or pixels) the region width is in.
     * @type {shaka.text.CueRegion.units}
     * @exportDoc
     */
    this.widthUnits;

    /**
     * The units (percentage or pixels) the region viewportAnchors are in.
     * @type {shaka.text.CueRegion.units}
     * @exportDoc
     */
    this.viewportAnchorUnits;

    /**
     * If scroll=UP, it means that cues in the region will be added to the
     * bottom of the region and will push any already displayed cues in the
     * region up.  Otherwise (scroll=NONE) cues will stay fixed at the location
     * they were first painted in.
     * @type {shaka.text.CueRegion.scrollMode}
     * @exportDoc
     */
    shaka.extern.CueRegion.prototype.scroll;
  }
};


/**
 * @interface
 * @exportDoc
 */
shaka.extern.Cue = class {
  constructor() {
    /**
     * The start time of the cue in seconds, relative to the start of the
     * presentation.
     * @type {number}
     * @exportDoc
     */
    this.startTime;

    /**
     * The end time of the cue in seconds, relative to the start of the
     * presentation.
     * @type {number}
     * @exportDoc
     */
    this.endTime;

    /**
     * The text payload of the cue.
     * @type {!string}
     * @exportDoc
     */
    this.payload;

    /**
     * The region to render the cue into.
     * @type {shaka.extern.CueRegion}
     * @exportDoc
     */
    this.region;

    /**
     * The indent (in percent) of the cue box in the direction defined by the
     * writing direction.
     * @type {?number}
     * @exportDoc
     */
    this.position;

    /**
     * Position alignment of the cue.
     * @type {shaka.text.Cue.positionAlign}
     * @exportDoc
     */
    this.positionAlign;

    /**
     * Size of the cue box (in percents).
     * @type {number}
     * @exportDoc
     */
    this.size;

    /**
     * Alignment of the text inside the cue box.
     * @type {shaka.text.Cue.textAlign}
     * @exportDoc
     */
    this.textAlign;

    /**
     * Text direction of the cue.
     * @type {shaka.text.Cue.direction}
     * @exportDoc
     */
    this.direction;

    /**
     * Text writing mode of the cue.
     * @type {shaka.text.Cue.writingMode}
     * @exportDoc
     */
    this.writingMode;

    /**
     * The way to interpret line field. (Either as an integer line number or
     * percentage from the display box).
     * @type {shaka.text.Cue.lineInterpretation}
     * @exportDoc
     */
    this.lineInterpretation;

    /**
     * The offset from the display box in either number of lines or
     * percentage depending on the value of lineInterpretation.
     * @type {?number}
     * @exportDoc
     */
    this.line;

    /**
     * Separation between line areas inside the cue box in px or em
     * (e.g. '100px'/'100em'). If not specified, this should be no less than
     * the largest font size applied to the text in the cue.
     * @type {string}.
     * @exportDoc
     */
    this.lineHeight;

    /**
     * Line alignment of the cue box.
     * Start alignment means the cue box’s top side (for horizontal cues), left
     * side (for vertical growing right), or right side (for vertical growing
     * left) is aligned at the line.
     * Center alignment means the cue box is centered at the line.
     * End alignment The cue box’s bottom side (for horizontal cues), right side
     * (for vertical growing right), or left side (for vertical growing left) is
     * aligned at the line.
     * @type {shaka.text.Cue.lineAlign}
     * @exportDoc
     */
    this.lineAlign;

    /**
     * Vertical alignments of the cues within their extents.
     * 'BEFORE' means displaying the captions at the top of the text display
     * container box, 'CENTER' means in the middle, 'AFTER' means at the bottom.
     * @type {shaka.text.Cue.displayAlign}
     * @exportDoc
     */
    this.displayAlign;

    /**
     * Text color represented by any string that would be accepted in CSS.
     * E. g. '#FFFFFF' or 'white'.
     * @type {!string}
     * @exportDoc
     */
    this.color;

    /**
     * Text background color represented by any string that would be
     * accepted in CSS.
     * E. g. '#FFFFFF' or 'white'.
     * @type {!string}
     * @exportDoc
     */
    this.backgroundColor;

    /**
     * Image background represented by any string that would be
     * accepted in image HTML element.
     * E. g. 'data:[mime type];base64,[data]'.
     * @type {!string}
     * @exportDoc
     */
    this.backgroundImage;

    /**
     * Text font size in px or em (e.g. '100px'/'100em').
     * @type {string}
     * @exportDoc
     */
    this.fontSize;

    /**
     * Text font weight. Either normal or bold.
     * @type {shaka.text.Cue.fontWeight}
     * @exportDoc
     */
    this.fontWeight;

    /**
     * Text font style. Normal, italic or oblique.
     * @type {shaka.text.Cue.fontStyle}
     * @exportDoc
     */
    this.fontStyle;

    /**
     * Text font family.
     * @type {!string}
     * @exportDoc
     */
    this.fontFamily;

    /**
     * Text decoration. A combination of underline, overline
     * and line through. Empty array means no decoration.
     * @type {!Array.<!shaka.text.Cue.textDecoration>}
     * @exportDoc
     */
    this.textDecoration;

    /**
     * Whether or not line wrapping should be applied to the cue.
     * @type {boolean}
     * @exportDoc
     */
    this.wrapLine;

    /**
     * Id of the cue.
     * @type {!string}
     * @exportDoc
     */
    this.id;

    /**
     * Nested cues
     * @type {Array.<!shaka.extern.Cue>}
     * @exportDoc
     */
    this.nestedCues;

    /**
     * Whether or not the cue only acts as a spacer between two cues
     * @type {boolean}
     * @exportDoc
     */
    this.spacer;
  }
};


/**
 * An interface for plugins that parse text tracks.
 *
 * @interface
 * @exportDoc
 */
shaka.extern.TextParser = class {
  /**
   * Parse an initialization segment. Some formats do not have init
   * segments so this won't always be called.
   *
   * @param {!Uint8Array} data
   *    The data that makes up the init segment.
   *
   * @exportDoc
   */
  parseInit(data) {}

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
  parseMedia(data, timeContext) {}
};


/**
 * A collection of time offsets used to adjust text cue times.
 *
 * @typedef {{
 *   periodStart: number,
 *   segmentStart: number,
 *   segmentEnd: number
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
shaka.extern.TextParser.TimeContext;


/**
 * @typedef {function(new:shaka.extern.TextParser)}
 * @exportDoc
 */
shaka.extern.TextParserPlugin;


/**
 * @summary
 * An interface for plugins that display text.
 *
 * @description
 * This should handle displaying the text cues on the page.  This is given the
 * cues to display and told when to start and stop displaying.  This should only
 * display the cues it is given and remove cues when told to.
 *
 * <p>
 * This should only change whether it is displaying the cues through the
 * <code>setTextVisibility</code> function; the app should not change the text
 * visibility outside the top-level Player methods.  If you really want to
 * control text visibility outside the Player methods, you must set the
 * <code>streaming.alwaysStreamText</code> Player configuration value to
 * <code>true</code>.
 *
 * @interface
 * @extends {shaka.util.IDestroyable}
 * @exportDoc
 */
shaka.extern.TextDisplayer = class {
  /**
   * @override
   * @exportDoc
   */
  destroy() {}

  /**
   * Append given text cues to the list of cues to be displayed.
   *
   * @param {!Array.<!shaka.text.Cue>} cues
   *    Text cues to be appended.
   *
   * @exportDoc
   */
  append(cues) {}

  /**
   * Remove all cues that are fully contained by the given time range (relative
   * to the presentation). <code>endTime</code> will be greater to equal to
   * <code>startTime</code>.  <code>remove</code> should only return
   * <code>false</code> if the displayer has been destroyed. If the displayer
   * has not been destroyed <code>remove</code> should return <code>true</code>.
   *
   * @param {number} startTime
   * @param {number} endTime
   *
   * @return {boolean}
   *
   * @exportDoc
   */
  remove(startTime, endTime) {}

  /**
   * Returns true if text is currently visible.
   *
   * @return {boolean}
   *
   * @exportDoc
   */
  isTextVisible() {}

  /**
   * Set text visibility.
   *
   * @param {boolean} on
   *
   * @exportDoc
   */
  setTextVisibility(on) {}
};


/**
 * A factory for creating a TextDisplayer.
 *
 * @typedef {function(new:shaka.extern.TextDisplayer)}
 * @exportDoc
 */
shaka.extern.TextDisplayer.Factory;
