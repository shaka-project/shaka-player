/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Testing helpers to assist tests for Closed Caption decoders for CEA captions.
 */
shaka.test.CeaUtils = class {
  /**
   * Returns a cue with no underline/italics, and default colors
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} payload
   */
  static createDefaultCue(startTime, endTime, payload) {
    const cue = new shaka.text.Cue(startTime, endTime, payload);
    cue.color = shaka.cea.CeaUtils.DEFAULT_TXT_COLOR;
    cue.backgroundColor = shaka.cea.CeaUtils.DEFAULT_BG_COLOR;
    return cue;
  }

  /**
   * Returns a cue with custom underline, italics, color, background color.
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} payload
   * @param {boolean} underline
   * @param {boolean} italics
   * @param {string} textColor
   * @param {string} backgroundColor
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
   * @param {number} startTime
   * @param {number} endTime
   * @return {!shaka.text.Cue}
   */
  static createLineBreakCue(startTime, endTime) {
    const cue = new shaka.text.Cue(startTime, endTime, /* payload= */ '');
    cue.lineBreak = true;
    return cue;
  }

  /**
   * Create shaka Cue with region updated to a specific value.
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} payload
   * @param {number} serviceNumber
   * @param {number} windowId
   * @param {number} rowCount
   * @param {number} colCount
   * @param {number=} anchorId
   * @return {!shaka.text.Cue}
   */
  static createWindowedCue(startTime, endTime, payload,
      serviceNumber, windowId, rowCount, colCount, anchorId) {
    const cue = new shaka.text.Cue(startTime, endTime, payload);
    const region = cue.region;
    const AnchorId = shaka.cea.Cea708Window.AnchorId;

    region.id = 'svc' + serviceNumber + 'win' + windowId;
    region.height = rowCount;
    region.width = colCount;
    region.heightUnits = shaka.text.CueRegion.units.LINES;
    region.widthUnits = shaka.text.CueRegion.units.LINES;
    region.viewportAnchorUnits = shaka.text.CueRegion.units.LINES;

    if (typeof anchorId === 'number') {
      switch (anchorId) {
        case AnchorId.UPPER_LEFT:
          region.regionAnchorX = 0;
          region.regionAnchorY = 0;
          break;
        case AnchorId.UPPER_CENTER:
          region.regionAnchorX = 50;
          region.regionAnchorY = 0;
          break;
        case AnchorId.UPPER_RIGHT:
          region.regionAnchorX = 100;
          region.regionAnchorY = 0;
          break;
        case AnchorId.MIDDLE_LEFT:
          region.regionAnchorX = 0;
          region.regionAnchorY = 50;
          break;
        case AnchorId.MIDDLE_CENTER:
          region.regionAnchorX = 50;
          region.regionAnchorY = 50;
          break;
        case AnchorId.MIDDLE_RIGHT:
          region.regionAnchorX = 100;
          region.regionAnchorY = 50;
          break;
        case AnchorId.LOWER_LEFT:
          region.regionAnchorX = 0;
          region.regionAnchorY = 100;
          break;
        case AnchorId.LOWER_CENTER:
          region.regionAnchorX = 50;
          region.regionAnchorY = 100;
          break;
        case AnchorId.LOWER_RIGHT:
          region.regionAnchorX = 100;
          region.regionAnchorY = 100;
          break;
      }
    }

    return cue;
  }
};
