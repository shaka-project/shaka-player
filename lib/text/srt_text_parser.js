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
  /** */
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
  setSequenceMode(sequenceMode) {
    // Unused.
  }

  /**
   * @override
   * @export
   */
  parseMedia(data, time) {
    const SrtTextParser = shaka.text.SrtTextParser;
    const BufferUtils = shaka.util.BufferUtils;
    const StringUtils = shaka.util.StringUtils;

    // Get the input as a string.
    const str = StringUtils.fromUTF8(data);

    const vvtText = SrtTextParser.srt2webvtt(str);

    const newData = BufferUtils.toUint8(StringUtils.toUTF8(vvtText));

    return this.parser_.parseMedia(newData, time);
  }

  /**
   * Convert a SRT format to WebVTT
   *
   * @param {string} data
   * @return {string}
   * @export
   */
  static srt2webvtt(data) {
    const SrtTextParser = shaka.text.SrtTextParser;
    let result = 'WEBVTT\n\n';

    // Supports no cues
    if (data == '') {
      return result;
    }

    // remove dos newlines
    let srt = data.replace(/\r+/g, '');
    // trim white space start and end
    srt = srt.trim();

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
   * @param {string} caption
   * @return {string}
   * @private
   */
  static convertSrtCue_(caption) {
    const lines = caption.split(/\n/);

    // detect and skip numeric identifier
    if (lines[0].match(/\d+/)) {
      lines.shift();
    }

    // convert time codes
    lines[0] = lines[0].replace(/,/g, '.');

    return lines.join('\n') + '\n\n';
  }
};


shaka.text.TextEngine.registerParser(
    'text/srt', () => new shaka.text.SrtTextParser());
