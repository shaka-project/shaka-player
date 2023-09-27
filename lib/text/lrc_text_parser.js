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
    const LrcTextParser = shaka.text.LrcTextParser;

    // Get the input as a string.
    const str = StringUtils.fromUTF8(data);

    /** @type {shaka.text.Cue} */
    let prevCue = null;

    /** @type {!Array.<!shaka.text.Cue>} */
    const cues = [];
    const lines = str.split(/\r?\n/);
    for (const line of lines) {
      if (!line || /^\s+$/.test(line)) {
        continue;
      }

      // LRC content
      const match = LrcTextParser.lyricLine_.exec(line);
      if (match) {
        const startTime = LrcTextParser.parseTime_(match[1]);
        // This time can be overwritten by a subsequent cue.
        // By default we add 2 seconds of duration.
        const endTime = time.segmentEnd ? time.segmentEnd : startTime + 2;
        const payload = match[2];
        const cue = new shaka.text.Cue(startTime, endTime, payload);

        // Update previous
        if (prevCue) {
          prevCue.endTime = startTime;
          cues.push(prevCue);
        }
        prevCue = cue;
        continue;
      }
      shaka.log.warning('LrcTextParser encountered an unknown line.', line);
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
    const seconds = parseFloat(match[2].replace(',', '.'));
    return minutes * 60 + seconds;
  }
};

/**
 * @const
 * @private {!RegExp}
 * @example [00:12.0]Text or [00:12.00]Text or [00:12.000]Text or
 * [00:12,0]Text or [00:12,00]Text or [00:12,000]Text
 */
shaka.text.LrcTextParser.lyricLine_ =
    /^\[(\d{1,2}:\d{1,2}(?:[.,]\d{1,3})?)\](.*)/;

/**
 * @const
 * @private {!RegExp}
 * @example 00:12.0 or 00:12.00 or 00:12.000 or
 * 00:12,0 or 00:12,00 or 00:12,000
 */
shaka.text.LrcTextParser.timeFormat_ =
    /^(\d+):(\d{1,2}(?:[.,]\d{1,3})?)$/;

shaka.text.TextEngine.registerParser(
    'application/x-subtitle-lrc', () => new shaka.text.LrcTextParser());
