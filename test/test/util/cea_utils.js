/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.CeaUtils');

goog.require('shaka.cea.CeaUtils');
goog.require('shaka.text.Cue');


/**
 * Testing helpers to assist tests for Closed Caption decoders for CEA captions.
 */
shaka.test.CeaUtils = class {
  /**
   * Returns a cue with no underline/italics, and default colors
   * @param {!number} startTime
   * @param {!number} endTime
   * @param {!string} payload
   */
  static createDefaultCue(startTime, endTime, payload) {
    const cue = new shaka.text.Cue(startTime, endTime, payload);
    cue.color = shaka.cea.CeaUtils.DEFAULT_TXT_COLOR;
    cue.backgroundColor = shaka.cea.CeaUtils.DEFAULT_BG_COLOR;
    return cue;
  }

  /**
   * Returns a cue with custom underline, italics, color, background color.
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

  /**
   * Returns a cue that corresponds to a linebreak.
   * @param {!number} startTime
   * @param {!number} endTime
   * @return {!shaka.text.Cue}
   */
  static createLineBreakCue(startTime, endTime) {
    const cue = new shaka.text.Cue(startTime, endTime, /* payload= */ '');
    cue.spacer = true;
    return cue;
  }
};
