/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


/**
 * @externs
 */


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
   * @param {?(string|undefined)} uri
   *    The media uri.
   * @return {!Array.<!shaka.text.Cue>}
   *
   * @exportDoc
   */
  parseMedia(data, timeContext, uri) {}

  /**
   * Notifies the stream if the manifest is in sequence mode or not.
   *
   * @param {boolean} sequenceMode
   */
  setSequenceMode(sequenceMode) {}

  /**
   * Notifies the manifest type.
   *
   * @param {string} manifestType
   */
  setManifestType(manifestType) {}
};


/**
 * A collection of time offsets used to adjust text cue times.
 *
 * @typedef {{
 *   periodStart: number,
 *   segmentStart: number,
 *   segmentEnd: number,
 *   vttOffset: number
 * }}
 *
 * @property {number} periodStart
 *     The absolute start time of the period in seconds.
 * @property {number} segmentStart
 *     The absolute start time of the segment in seconds.
 * @property {number} segmentEnd
 *     The absolute end time of the segment in seconds.
 * @property {number} vttOffset
 *     The start time relative to either segment or period start depending
 *     on <code>segmentRelativeVttTiming</code> configuration.
 *
 * @exportDoc
 */
shaka.extern.TextParser.TimeContext;


/**
 * @typedef {function():!shaka.extern.TextParser}
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
 * @typedef {function():!shaka.extern.TextDisplayer}
 * @exportDoc
 */
shaka.extern.TextDisplayer.Factory;
