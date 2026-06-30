/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.cea.CeaUtils');
goog.provide('shaka.cea.CeaUtils.StyledChar');

goog.require('shaka.text.Cue');


shaka.cea.CeaUtils = class {
  /**
   * Emits a closed caption based on the state of the buffer.
   * @param {!shaka.text.Cue} topLevelCue
   * @param {string} stream
   * @param {!Array<!Array<?shaka.cea.CeaUtils.StyledChar>>} memory
   * @param {number} startTime Start time of the cue.
   * @param {number} endTime End time of the cue.
   * @param {boolean=} progressive If true, each character is revealed at the
   *   time it was decoded (its {@link StyledChar#getTime}), instead of all at
   *   once at startTime. This reproduces the native "paint-on" / roll-up look
   *   where text appears character by character. Characters decoded at or
   *   before startTime are still revealed immediately.
   * @return {?shaka.extern.ICaptionDecoder.ClosedCaption}
   */
  static getParsedCaption(topLevelCue, stream, memory, startTime, endTime,
      progressive = false) {
    if (startTime >= endTime) {
      return null;
    }

    // Find the first and last row that contains characters, in a single pass.
    let firstNonEmptyRow = -1;
    let lastNonEmptyRow = -1;

    for (let i = 0; i < memory.length; i++) {
      if (memory[i].some((e) => e != null && e.getChar().trim() != '')) {
        if (firstNonEmptyRow === -1) {
          firstNonEmptyRow = i;
        }
        lastNonEmptyRow = i;
      }
    }

    // Exit early if no non-empty row was found.
    if (firstNonEmptyRow === -1 || lastNonEmptyRow === -1) {
      return null;
    }

    // Keeps track of the current styles for a cue being emitted.
    let currentUnderline = false;
    let currentItalics = false;
    let currentTextColor = shaka.cea.CeaUtils.DEFAULT_TXT_COLOR;
    let currentBackgroundColor = shaka.cea.CeaUtils.DEFAULT_BG_COLOR;

    // Start time of the run currently being built. Kept in sync with
    // currentCue.startTime so that, in progressive mode, a change in character
    // timing opens a new nested cue (just like a style change does).
    let currentTime = startTime;

    // Create first cue that will be nested in top level cue. Default styles.
    let currentCue = shaka.cea.CeaUtils.createStyledCue(
        startTime, endTime, currentUnderline, currentItalics,
        currentTextColor, currentBackgroundColor);

    // Logic: Reduce rows into a single top level cue containing nested cues.
    // Each nested cue corresponds either a style change or a line break.

    for (let i = firstNonEmptyRow; i <= lastNonEmptyRow; i++) {
      // Find the first and last non-empty characters in this row. We do this so
      // no styles creep in before/after the first and last non-empty chars.
      const row = memory[i];
      let firstNonEmptyCol = -1;
      let lastNonEmptyCol = -1;

      // Find the first and last non-empty columns in a single pass.
      for (let j = 0; j < row.length; j++) {
        if (row[j] != null && row[j].getChar().trim() !== '') {
          if (firstNonEmptyCol === -1) {
            firstNonEmptyCol = j;
          }
          lastNonEmptyCol = j;
        }
      }

      // If no non-empty char. was found in this row, it must be a linebreak.
      if (firstNonEmptyCol === -1 || lastNonEmptyCol === -1) {
        const linebreakCue = shaka.cea.CeaUtils
            .createLineBreakCue(startTime, endTime);
        topLevelCue.nestedCues.push(linebreakCue);
        continue;
      }

      for (let j = firstNonEmptyCol; j <= lastNonEmptyCol; j++) {
        const styledChar = row[j];

        // A null between non-empty cells in a row is handled as a space.
        if (!styledChar) {
          currentCue.payload += ' ';
          continue;
        }
        const underline = styledChar.isUnderlined();
        const italics = styledChar.isItalicized();
        const textColor = styledChar.getTextColor();
        const backgroundColor = styledChar.getBackgroundColor();

        // In progressive mode, reveal each character at its decode time. Chars
        // decoded at or before startTime (e.g. already-displayed roll-up rows)
        // are merged into the startTime run so they appear immediately.
        const charTime = styledChar.getTime();
        const time = (progressive && charTime != null && charTime > startTime) ?
            charTime : startTime;

        // If any style property or the reveal time has changed, open a new cue.
        if (underline != currentUnderline || italics != currentItalics ||
            textColor != currentTextColor ||
            backgroundColor != currentBackgroundColor ||
            time != currentTime) {
          // Push the currently built cue and start a new cue, with new styles.
          if (currentCue.payload) {
            topLevelCue.nestedCues.push(currentCue);
          }
          currentCue = shaka.cea.CeaUtils.createStyledCue(
              time, endTime, underline,
              italics, textColor, backgroundColor);

          currentUnderline = underline;
          currentItalics = italics;
          currentTextColor = textColor;
          currentBackgroundColor = backgroundColor;
          currentTime = time;
        }

        currentCue.payload += styledChar.getChar();
      }
      if (currentCue.payload) {
        topLevelCue.nestedCues.push(currentCue);
      }

      // Add a linebreak since the row just ended.
      if (i !== lastNonEmptyRow) {
        const linebreakCue = shaka.cea.CeaUtils
            .createLineBreakCue(startTime, endTime);
        topLevelCue.nestedCues.push(linebreakCue);
      }

      // Create a new cue.
      currentTime = startTime;
      currentCue = shaka.cea.CeaUtils.createStyledCue(
          startTime, endTime, currentUnderline, currentItalics,
          currentTextColor, currentBackgroundColor);
    }

    if (topLevelCue.nestedCues.length) {
      return {
        cue: topLevelCue,
        stream,
      };
    }

    return null;
  }

  /**
   * @param {number} startTime
   * @param {number} endTime
   * @param {boolean} underline
   * @param {boolean} italics
   * @param {string} txtColor
   * @param {string} bgColor
   * @return {!shaka.text.Cue}
   */
  static createStyledCue(startTime, endTime, underline,
      italics, txtColor, bgColor) {
    const cue = new shaka.text.Cue(startTime, endTime, /* payload= */ '');
    if (underline) {
      cue.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);
    }
    if (italics) {
      cue.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
    }
    cue.color = txtColor;
    cue.backgroundColor = bgColor;
    return cue;
  }

  /**
   * @param {number} startTime
   * @param {number} endTime
   * @return {!shaka.text.Cue}
   */
  static createLineBreakCue(startTime, endTime) {
    const linebreakCue = new shaka.text.Cue(
        startTime, endTime, /* payload= */ '');
    linebreakCue.lineBreak = true;
    return linebreakCue;
  }

  /**
   * Returns the CEA-608 stream/mode name (e.g. "CC1") for a given field and
   * channel pair.
   * @param {number} fieldNum Field number (0 or 1).
   * @param {number} channelNum Channel number (0 or 1).
   * @return {string}
   */
  static getCea608StreamName(fieldNum, channelNum) {
    return `CC${((fieldNum << 1) | channelNum) + 1}`;
  }

  /**
   * Returns whether the given NALU type is an SEI NALU for the given codec
   * family.
   * @param {shaka.cea.CeaUtils.CodecFamily} codecFamily
   * @param {number} naluType
   * @return {boolean}
   */
  static isSeiNaluType(codecFamily, naluType) {
    const CeaUtils = shaka.cea.CeaUtils;
    switch (codecFamily) {
      case CeaUtils.CodecFamily.H264:
        return naluType == CeaUtils.H264_NALU_TYPE_SEI;
      case CeaUtils.CodecFamily.H265:
        return naluType == CeaUtils.H265_PREFIX_NALU_TYPE_SEI ||
            naluType == CeaUtils.H265_SUFFIX_NALU_TYPE_SEI;
      case CeaUtils.CodecFamily.H266:
        return naluType == CeaUtils.H266_PREFIX_NALU_TYPE_SEI ||
            naluType == CeaUtils.H266_SUFFIX_NALU_TYPE_SEI;
      default:
        return false;
    }
  }
};

/**
 * Video codec families that can carry CEA captions in SEI NALUs.
 * @enum {number}
 */
shaka.cea.CeaUtils.CodecFamily = {
  H264: 0,
  H265: 1,
  H266: 2,
};

shaka.cea.CeaUtils.StyledChar = class {
  /**
   * @param {string} character
   * @param {boolean} underline
   * @param {boolean} italics
   * @param {string} backgroundColor
   * @param {string} textColor
   * @param {?number=} time The presentation time (in seconds) at which this
   *   character was decoded. Used by paint-on and roll-up modes to reveal text
   *   character by character. May be null when timing is irrelevant (e.g.
   *   pop-on, or CEA-708).
   */
  constructor(character, underline, italics, backgroundColor, textColor,
      time = null) {
    /**
     * @private {string}
     */
    this.character_ = character;

    /**
     * @private {boolean}
     */
    this.underline_ = underline;

    /**
     * @private {boolean}
     */
    this.italics_ = italics;

    /**
     * @private {string}
     */
    this.backgroundColor_ = backgroundColor;

    /**
     * @private {string}
     */
    this.textColor_ = textColor;

    /**
     * @private {?number}
     */
    this.time_ = time;
  }

  /**
   * @return {string}
   */
  getChar() {
    return this.character_;
  }

  /**
   * @return {?number}
   */
  getTime() {
    return this.time_;
  }

  /**
   * @return {boolean}
   */
  isUnderlined() {
    return this.underline_;
  }

  /**
   * @return {boolean}
   */
  isItalicized() {
    return this.italics_;
  }

  /**
   * @return {string}
   */
  getBackgroundColor() {
    return this.backgroundColor_;
  }

  /**
   * @return {string}
   */
  getTextColor() {
    return this.textColor_;
  }
};

/**
 * Default background color for text.
 * @const {string}
 */
shaka.cea.CeaUtils.DEFAULT_BG_COLOR = 'black';

/**
 * Default text color.
 * @const {string}
 */
shaka.cea.CeaUtils.DEFAULT_TXT_COLOR = 'white';

/**
 * NALU type for Supplemental Enhancement Information (SEI) for H.264.
 * @const {number}
 */
shaka.cea.CeaUtils.H264_NALU_TYPE_SEI = 0x06;

/**
 * NALU type for Supplemental Enhancement Information (SEI) for H.265.
 * @const {number}
 */
shaka.cea.CeaUtils.H265_PREFIX_NALU_TYPE_SEI = 0x27;

/**
 * NALU type for Supplemental Enhancement Information (SEI) for H.265.
 * @const {number}
 */
shaka.cea.CeaUtils.H265_SUFFIX_NALU_TYPE_SEI = 0x28;

/**
 * NALU type for Supplemental Enhancement Information (SEI) for H.266.
 * @const {number}
 */
shaka.cea.CeaUtils.H266_PREFIX_NALU_TYPE_SEI = 0x17;

/**
 * NALU type for Supplemental Enhancement Information (SEI) for H.266.
 * @const {number}
 */
shaka.cea.CeaUtils.H266_SUFFIX_NALU_TYPE_SEI = 0x18;

/**
 * Default timescale value for a track.
 * @const {number}
 */
shaka.cea.CeaUtils.DEFAULT_TIMESCALE_VALUE = 90000;
