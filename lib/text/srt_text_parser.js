/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.text.SrtTextParser');

goog.require('goog.asserts');
goog.require('shaka.text.TextEngine');
goog.require('shaka.text.VttTextParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');


/**
 * @implements {shaka.extern.TextParser}
 * @export
 */
shaka.text.SrtTextParser = class {
  constructor() {
    /**
     * @type {!shaka.extern.TextParser}
     * @private
     */
    this.parser_ = new shaka.text.VttTextParser();
  }

  /**
   * @override
   * @export
   */
  parseInit(data) {
    goog.asserts.assert(false, 'SRT does not have init segments');
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    const SrtTextParser = shaka.text.SrtTextParser;
    const BufferUtils = shaka.util.BufferUtils;
    const StringUtils = shaka.util.StringUtils;

    // Get the input as a string.  Normalize newlines to \n.
    let str = shaka.util.StringUtils.fromUTF8(data);
    str = str.replace(/\r\n|\r(?=[^\n]|$)/gm, '\n');

    const vvtText = SrtTextParser.srt2webvtt_(str);

    const newData = BufferUtils.toUint8(StringUtils.toUTF8(vvtText));

    return this.parser_.parseMedia(newData, time);
  }

  /**
   * Convert a SRT format to WebVTT
   *
   * @param {!string} data
   * @return {!string}
   * @private
   */
  static srt2webvtt_(data) {
    const SrtTextParser = shaka.text.SrtTextParser;
    let result = 'WEBVTT\n\n';

    // Supports no cues
    if (data == '') {
      return result;
    }

    // remove dos newlines
    let srt = data.replace(/\r+/g, '');
    // trim white space start and end
    srt = srt.replace(/^\s+|\s+$/g, '');

    // get cues
    const cuelist = srt.split('\n\n');
    for (const cue of cuelist) {
      result += SrtTextParser.convertSrtCue_(cue);
    }

    return result;
  }

  /**
   * Convert a SRT cue into WebVTT cue
   *
   * @param {!string} caption
   * @return {!string}
   * @private
   */
  static convertSrtCue_(caption) {
    let cue = '';

    const s = caption.split(/\n/);

    // concatenate muilt-line string separated in array into one
    while (s.length > 3) {
      for (let i = 3; i < s.length; i++) {
        s[2] += '\n' + s[i];
      }
      s.splice(3, s.length - 3);
    }

    let line = 0;

    // detect identifier
    if (!s[0].match(/\d+:\d+:\d+/) && s[1].match(/\d+:\d+:\d+/)) {
      cue += s[0].match(/\w+/) + '\n';
      line += 1;
    }

    // get time strings
    if (s[line].match(/\d+:\d+:\d+/)) {
      // convert time string
      // eslint-disable-next-line max-len
      const m = s[1].match(/(\d+):(\d+):(\d+)(?:,(\d+))?\s*--?>\s*(\d+):(\d+):(\d+)(?:,(\d+))?/);
      if (m) {
        cue += m[1]+':'+m[2]+':'+m[3]+'.'+m[4]+' --> '
              +m[5]+':'+m[6]+':'+m[7]+'.'+m[8]+'\n';
        line += 1;
      } else {
        // Unrecognized timestring
        return '';
      }
    } else {
      // file format error or comment lines
      return '';
    }

    // get cue text
    if (s[line]) {
      cue += s[line] + '\n\n';
    }

    return cue;
  }
};


shaka.text.TextEngine.registerParser(
    'text/srt', () => new shaka.text.SrtTextParser());
