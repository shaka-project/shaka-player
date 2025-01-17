/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SbvTextParser');

goog.require('goog.asserts');
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TextParser');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.SbvTextParser = class {
  /**
   * @override
   * @export
   */
  parseInit(data) {
    goog.asserts.assert(false, 'SubViewer does not have init segments');
  }

  /**
   * @override
   * @export
   */
  setSequenceMode(sequenceMode) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  setManifestType(manifestType) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    const StringUtils = shaka.util.StringUtils;

    // Get the input as a string.
    const strFromData = StringUtils.fromUTF8(data);
    // remove dos newlines
    let str = strFromData.replace(/\r+/g, '');
    // trim white space start and end
    str = str.trim();

    /** @type {!Array<!shaka.text.Cue>} */
    const cues = [];

    // Supports no cues
    if (str == '') {
      return cues;
    }

    // get cues
    const blocklist = str.split('\n\n');
    for (const block of blocklist) {
      const lines = block.split('\n');
      // Parse the times.
      const parser = new shaka.util.TextParser(lines[0]);
      const start = parser.parseTime();
      const expect = parser.readRegex(/,/g);
      const end = parser.parseTime();

      if (start == null || expect == null || end == null) {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.TEXT,
            shaka.util.Error.Code.INVALID_TEXT_CUE,
            'Could not parse cue time range in SubViewer');
      }

      // Get the payload.
      const payload = lines.slice(1).join('\n').trim();

      const cue = new shaka.text.Cue(start, end, payload);
      cues.push(cue);
    }

    return cues;
  }
};


shaka.text.TextEngine.registerParser(
    'text/x-subviewer', () => new shaka.text.SbvTextParser());
