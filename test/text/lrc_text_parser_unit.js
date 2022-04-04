/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.text.LrcTextParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');

describe('LrcTextParser', () => {
  it('supports no cues', () => {
    verifyHelper([],
        '',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles a blank line at the start of the file', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '\n\n' +
        '[00:00.00]Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles a blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '[00:00.00]Test' +
        '\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles no blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '[00:00.00]Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports multiple cues', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 10, payload: 'Test'},
          {startTime: 10, endTime: 20, payload: 'Test2'},
          {startTime: 20, endTime: 22, payload: 'Test3'},
        ],
        '[00:00.00]Test\n' +
        '[00:10.00]Test2\n' +
        '[00:20.00]Test3',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports different time formats', () => {
    verifyHelper(
        [
          {startTime: 0.1, endTime: 10.001, payload: 'Test'},
          {startTime: 10.001, endTime: 20.02, payload: 'Test2'},
          {startTime: 20.02, endTime: 30.1, payload: 'Test3'},
          {startTime: 30.1, endTime: 40.001, payload: 'Test4'},
          {startTime: 40.001, endTime: 50.02, payload: 'Test5'},
          {startTime: 50.02, endTime: 52.02, payload: 'Test6'},
        ],
        '[00:00.1]Test\n' +
        '[00:10.001]Test2\n' +
        '[00:20.02]Test3\n' +
        '[00:30,1]Test4\n' +
        '[00:40,001]Test5\n' +
        '[00:50,02]Test6',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  /**
   * @param {!Array} cues
   * @param {string} text
   * @param {shaka.extern.TextParser.TimeContext} time
   */
  function verifyHelper(cues, text, time) {
    const BufferUtils = shaka.util.BufferUtils;
    const StringUtils = shaka.util.StringUtils;

    const data = BufferUtils.toUint8(StringUtils.toUTF8(text));

    const parser = new shaka.text.LrcTextParser();
    const result = parser.parseMedia(data, time);

    const expected = cues.map((cue) => {
      if (cue.nestedCues) {
        cue.nestedCues = cue.nestedCues.map(
            (nestedCue) => jasmine.objectContaining(nestedCue));
      }
      return jasmine.objectContaining(cue);
    });
    expect(result).toEqual(expected);
  }
});
