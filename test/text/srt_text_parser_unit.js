/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SrtTextParser', () => {
  const Cue = shaka.text.Cue;

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

  it('supports payload stylized', () => {
    verifyHelper(
        [
          {
            startTime: 10,
            endTime: 20,
            payload: '',
            nestedCues: [
              {
                startTime: 10,
                endTime: 20,
                payload: 'Test',
                fontWeight: Cue.fontWeight.BOLD,
              },
              {
                startTime: 10,
                endTime: 20,
                payload: ' Unstyled',
              },
            ],
          },
          {
            startTime: 20,
            endTime: 30,
            payload: '',
            nestedCues: [
              {
                startTime: 20,
                endTime: 30,
                payload: 'Test2',
                fontStyle: Cue.fontStyle.ITALIC,
              },
            ],
          },
          {
            startTime: 30,
            endTime: 40,
            payload: '',
            nestedCues: [
              {
                startTime: 30,
                endTime: 40,
                payload: 'Test3',
                textDecoration: [Cue.textDecoration.UNDERLINE],
              },
            ],
          },
          {
            startTime: 40,
            endTime: 50,
            payload: '',
            nestedCues: [
              {
                startTime: 40,
                endTime: 50,
                payload: 'Test4',
                color: 'red',
              },
            ],
          },
          {
            startTime: 50,
            endTime: 60,
            payload: '',
            nestedCues: [
              {
                startTime: 50,
                endTime: 60,
                payload: 'Hex color',
                color: 'yellow',
              },
            ],
          },
          {
            startTime: 60,
            endTime: 70,
            payload: 'Unknown color',
          },
          {
            startTime: 70,
            endTime: 80,
            payload: 'Aligned bottom-left',
            line: -1,
            lineInterpretation: Cue.lineInterpretation.LINE_NUMBER,
            textAlign: 'left',
          },
          {
            startTime: 80,
            endTime: 90,
            payload: 'Positioned cue',
            line: 50,
            position: 50,
          },
        ],
        '1\n' +
        '00:00:10,000 --> 00:00:20,000\n' +
        '{b}Test{/b} Unstyled\n\n' +
        '2\n' +
        '00:00:20,000 --> 00:00:30,000\n' +
        '{i}Test2{/i}\n\n' +
        '3\n' +
        '00:00:30,000 --> 00:00:40,000\n' +
        '{u}Test3{/u}\n\n' +
        '4\n' +
        '00:00:40,000 --> 00:00:50,000\n' +
        '<font color="red">Test4</font>\n\n' +
        '5\n' +
        '00:00:50,000 --> 00:01:00,000\n' +
        '<font color="#FFFF00">Hex color</font>\n\n' +
        '6\n' +
        '00:01:00,000 --> 00:01:10,000\n' +
        '<font color="unknown">Unknown color</font>\n\n' +
        '7\n' +
        '00:01:10,000 --> 00:01:20,000\n' +
        '{\\an1}Aligned bottom-left\n\n' +
        '8\n' +
        '00:01:20,000 --> 00:01:30,000\n' +
        '{\\pos(960,540)}Positioned cue',
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
    const result = parser.parseMedia(data, time, null);

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
