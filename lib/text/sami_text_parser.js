/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SamiTextParser');

goog.require('goog.asserts');
goog.require('shaka.text.TextEngine');
goog.require('shaka.util.StringUtils');


/**
 * Documentation: https://en.wikipedia.org/wiki/SAMI
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.SamiTextParser = class {
  /**
   * @override
   * @export
   */
  parseInit(data) {
    goog.asserts.assert(false, 'SAMI does not have init segments');
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
  parseMedia(data, time) {
    const StringUtils = shaka.util.StringUtils;
    const SamiTextParser = shaka.text.SamiTextParser;

    // Get the input as a string.
    const str = StringUtils.fromUTF8(data);

    // Process cues
    /** @type {!Array.<!shaka.extern.Cue>} */
    const cues = [];

    /** @type {shaka.extern.Cue} */
    let prevCue = null;

    const sami = str
        .replace(/^[\s\S]*<BODY[^>]*>/gi, '') // Remove content before body
        .replace(/<\/BODY[^>]*>[\s\S]*$/gi, ''); // Remove content after body

    const syncBlocks = sami.split(/<SYNC/gi);
    for (const syncBlock of syncBlocks) {
      if (!syncBlock || syncBlock.trim().length == 0) {
        continue;
      }
      // <SYNC Start = 1000>
      const match = /^<SYNC[^>]+Start\s*=\s*["']?(\d+)["']?[^>]*>([\s\S]*)/gi.exec('<SYNC' + syncBlock);
      if (match) {
        const startTime = parseInt(match[1], 10) / 1000;
        // This time can be overwritten by a subsequent cue.
        // By default we add 2 seconds of duration.
        const endTime = time.segmentEnd ? time.segmentEnd : startTime + 2;
        const payload = SamiTextParser.getPayload_(
            match[2].replace(/^<\/SYNC[^>]*>/gi, ''));
        const cue = new shaka.text.Cue(startTime, endTime, payload);

        // Update previous
        if (prevCue) {
          prevCue.endTime = startTime;
          cues.push(prevCue);
        }
        prevCue = cue;
        continue;
      }
      shaka.log.warning('SamiTextParser encountered an unknown line.', syncBlock);
    }
    if (prevCue) {
      cues.push(prevCue);
    }

    return cues;
  }

  /**
   * Get the correct payload.
   *
   * @param {string} colorString
   * @return {?string}
   * @private
   */
  static getPayload_(unProcessedPayload) {
    let payload = unProcessedPayload;

    let p = /^<P[^>]+Class\s*=\s*["']?([\w\d\-_]+)["']?[^>]*>([\s\S]*)/gi.exec(unProcessedPayload);
    if (!p) {
      p = /^<P([^>]*)>([\s\S]*)/gi.exec(unProcessedPayload);
    }
    if (p) {
      const html = p[2].replace(/<P[\s\S]+$/gi, '') // Remove string after another <P> tag
          .replace(/<BR\s*\/?>[\s\r\n]+/gi, '\r\n').replace(/<BR\s*\/?>/gi, '\r\n').replace(/<[^>]+>/g, '') // Remove all tags
          .replace(/^[\s\r\n]+/g, '').replace(/[\s\r\n]+$/g, ''); // Trim new lines and spaces
      payload = htmlDecode(html, '\r\n');
    }
    return payload;
  }
};


shaka.text.TextEngine.registerParser(
    'text/smi', () => new shaka.text.SamiTextParser());
