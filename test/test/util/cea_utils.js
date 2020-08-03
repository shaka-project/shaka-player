/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.CeaUtils');

/**
 * Testing helpers to assist tests for Closed Caption decoders for CEA captions.
 */
shaka.test.CeaUtils = class {
  /**
   * Returns a closed caption containing default styles.
   * All new line characters are converted into linebreak cues nested
   * inside the top-level cue.
   * @param {!string} stream
   * @param {!number} startTime
   * @param {!number} endTime
   * @param {!string} payload
   */
  static createDefaultClosedCaption(stream, startTime, endTime, payload) {
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    let currentCue = shaka.test.CeaUtils.createStyledCue(startTime, endTime, '',
        false, false, 'white', 'black');

    for (const char of payload) {
      if (char == '\n') {
        if (currentCue.payload) {
          topLevelCue.nestedCues.push(currentCue);
        }
        const lineBreakCue = new shaka.text.Cue(startTime, endTime, '');
        lineBreakCue.spacer = true;
        topLevelCue.nestedCues.push(lineBreakCue);
        currentCue = shaka.test.CeaUtils.createStyledCue(startTime, endTime, '',
            false, false, 'white', 'black');
      } else {
        currentCue.payload += char;
      }
    }
    topLevelCue.nestedCues.push(currentCue);

    return {
      stream,
      cue: topLevelCue,
    };
  }

  /**
   * Returns a cue with custom underline, italics, color, background color.
   * @param {!string} stream
   * @param {!number} startTime
   * @param {!number} endTime
   * @param {!string} payload
   * @param {!boolean} underline
   * @param {!boolean} italics
   * @param {!string} textColor
   * @param {!string} backgroundColor
   * @return {!shaka.text.Cue}
   */
  static createStyledCue(startTime, endTime, payload, underline,
      italics, textColor, backgroundColor) {
    const cue = new shaka.text.Cue(startTime, endTime, payload);
    if (italics) {
      cue.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
    }
    if (underline) {
      cue.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);
    }
    cue.color = textColor;
    cue.backgroundColor = backgroundColor;
    return cue;
  }
};
