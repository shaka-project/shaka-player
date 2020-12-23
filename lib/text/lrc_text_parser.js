/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.LrcTextParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.text.Cue');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.StringUtils');


/**
 * LRC file format: https://en.wikipedia.org/wiki/LRC_(file_format)
 *
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.LrcTextParser = class {
  /**
   * @override
   * @export
   */
  parseInit(data) {
    goog.asserts.assert(false, 'LRC does not have init segments');
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    return shaka.text.LrcTextParser.getCues(data);
  }

  /**
   * @param {BufferSource} data
   * @return {!Array.<!shaka.extern.Cue>}
   * @export
   */
  static getCues(data) {
    const StringUtils = shaka.util.StringUtils;
    const LrcTextParser = shaka.text.LrcTextParser;

    // Get the input as a string.
    const str = StringUtils.fromUTF8(data);

    /** @type {shaka.extern.Cue} */
    let prevCue = null;

    /** @type {!Array.<!shaka.extern.Cue>} */
    const cues = [];
    const parts = str.split(/\r?\n/);
    for (const part of parts) {
      if (!part || /^\s+$/.test(part)) {
        continue;
      }

      // LRC content
      const match = LrcTextParser.lyricLine_.exec(part);
      if (match) {
        const startTime = LrcTextParser.parseTime_(match[1]);
        // By default we add 2 seconds of duration.
        const endTime = startTime + 2;
        const payload = match[3];
        const cue = new shaka.text.Cue(startTime, endTime, payload);

        // Update previous
        if (prevCue) {
          prevCue.endTime = startTime;
          cues.push(prevCue);
        }
        prevCue = cue;
        continue;
      }
      shaka.log.warning('LrcTextParser parser encountered an unknown part.',
          part);
    }
    if (prevCue) {
      cues.push(prevCue);
    }

    return cues;
  }

  /**
   * Parses a LRC time from the given parser.
   *
   * @param {string} string
   * @return {number}
   * @private
   */
  static parseTime_(string) {
    const LrcTextParser = shaka.text.LrcTextParser;
    const match = LrcTextParser.timeFormat_.exec(string);
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    const hundredthsOfSeconds = match[4] ? parseInt(match[4], 10) : 0;
    return minutes * 60 + seconds + hundredthsOfSeconds / 100;
  }
};

/**
 * @const
 * @private {!RegExp}
 * @example 50t or 50.5t
 */
shaka.text.LrcTextParser.lyricLine_ =
    /^\[(\d{1,2}:\d{1,2}([.,]\d{1,3})?)\](.*)(\r?\n)*$/;

/**
 * @const
 * @private {!RegExp}
 * @example 50t or 50.5t
 */
shaka.text.LrcTextParser.timeFormat_ =
    /^\s*(\d+):(\d{1,2})([.,](\d{1,3}))?\s*$/;

shaka.text.TextEngine.registerParser(
    'application/x-subtitle-lrc', () => new shaka.text.LrcTextParser());
