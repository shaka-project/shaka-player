/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SrtTextParser', () => {
  it('supports no cues', () => {
    verifyHelper([],
        '',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles a blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        '1\n' +
        '00:00:20,000 --> 00:00:40,000\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles no blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        '1\n' +
        '00:00:20,000 --> 00:00:40,000\n' +
        'Test\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles no newline after the final text payload', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        '1\n' +
        '00:00:20,000 --> 00:00:40,000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports multiple cues', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
          {startTime: 40, endTime: 50, payload: 'Test2'},
        ],
        '1\n' +
        '00:00:20,000 --> 00:00:40,000\n' +
        'Test\n\n' +
        '2\n' +
        '00:00:40,000 --> 00:00:50,000\n' +
        'Test2',
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

    const parser = new shaka.text.SrtTextParser();
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
