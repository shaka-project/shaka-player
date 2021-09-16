/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.text.Cue');
goog.require('shaka.text.WebVttGenerator');

describe('WebVttGenerator', () => {
  it('supports no cues', () => {
    verifyHelper([], [], 'WEBVTT\n\n');
  });

  it('convert cues to WebVTT', () => {
    const shakaCue1 = new shaka.text.Cue(20, 40, 'Test');
    shakaCue1.textAlign = shaka.text.Cue.textAlign.LEFT;
    shakaCue1.writingMode = shaka.text.Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
    const shakaCue2 = new shaka.text.Cue(40, 50, 'Test2');
    shakaCue2.textAlign = shaka.text.Cue.textAlign.RIGHT;
    shakaCue2.writingMode = shaka.text.Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
    const shakaCue3 = new shaka.text.Cue(50, 51, 'Test3');
    shakaCue3.textAlign = shaka.text.Cue.textAlign.CENTER;
    const shakaCue4 = new shaka.text.Cue(52, 53, 'Test4');
    shakaCue4.textAlign = shaka.text.Cue.textAlign.START;
    const shakaCue5 = new shaka.text.Cue(53, 54, 'Test5');
    shakaCue5.textAlign = shaka.text.Cue.textAlign.END;

    const adCuePoints = [];

    verifyHelper(
        [
          shakaCue1,
          shakaCue2,
          shakaCue3,
          shakaCue4,
          shakaCue5,
        ],
        adCuePoints,
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:left vertical:lr\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 align:right vertical:rl\n' +
        'Test2\n\n' +
        '00:00:50.000 --> 00:00:51.000 align:middle\n' +
        'Test3\n\n' +
        '00:00:52.000 --> 00:00:53.000 align:start\n' +
        'Test4\n\n' +
        '00:00:53.000 --> 00:00:54.000 align:end\n' +
        'Test5\n\n');
  });

  it('creates style tags for cues with underline/italics/bold', () => {
    const shakaCue = new shaka.text.Cue(10, 20, '');

    // First cue is underlined and italicized.
    const nestedCue1 = new shaka.text.Cue(10, 20, 'Test1');
    nestedCue1.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
    nestedCue1.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);

    // Second cue is italicized and bolded.
    const nestedCue2 = new shaka.text.Cue(10, 20, 'Test2');
    nestedCue2.fontStyle = shaka.text.Cue.fontStyle.ITALIC;
    nestedCue2.fontWeight = shaka.text.Cue.fontWeight.BOLD;

    // Third cue has no bold, italics, or underline.
    const nestedCue3 = new shaka.text.Cue(10, 20, 'Test3');

    // Fourth cue is only underlined.
    const nestedCue4 = new shaka.text.Cue(10, 20, 'Test4');
    nestedCue4.textDecoration.push(shaka.text.Cue.textDecoration.UNDERLINE);

    shakaCue.nestedCues = [nestedCue1, nestedCue2, nestedCue3, nestedCue4];

    const adCuePoints = [];

    verifyHelper(
        [shakaCue],
        adCuePoints,
        'WEBVTT\n\n' +
        '00:00:10.000 --> 00:00:20.000 align:middle\n' +
        '<i><u>Test1</u></i><b><i>Test2</i></b>Test3<u>Test4</u>\n\n');
  });

  it('computes the time with ad cue points', () => {
    const shakaCue1 = new shaka.text.Cue(20, 30, 'Test');
    shakaCue1.textAlign = shaka.text.Cue.textAlign.LEFT;
    shakaCue1.writingMode = shaka.text.Cue.writingMode.VERTICAL_LEFT_TO_RIGHT;
    const shakaCue2 = new shaka.text.Cue(40, 50, 'Test2');
    shakaCue2.textAlign = shaka.text.Cue.textAlign.RIGHT;
    shakaCue2.writingMode = shaka.text.Cue.writingMode.VERTICAL_RIGHT_TO_LEFT;
    const shakaCue3 = new shaka.text.Cue(50, 51, 'Test3');
    shakaCue3.textAlign = shaka.text.Cue.textAlign.CENTER;
    const shakaCue4 = new shaka.text.Cue(52, 53, 'Test4');
    shakaCue4.textAlign = shaka.text.Cue.textAlign.START;
    const shakaCue5 = new shaka.text.Cue(53, 54, 'Test5');
    shakaCue5.textAlign = shaka.text.Cue.textAlign.END;

    const adCuePoints = [
      {
        start: 0,
        end: 10,
      },
      {
        start: 35,
        end: 45,
      },
    ];

    verifyHelper(
        [
          shakaCue1,
          shakaCue2,
          shakaCue3,
          shakaCue4,
          shakaCue5,
        ],
        adCuePoints,
        'WEBVTT\n\n' +
        '00:00:30.000 --> 00:00:40.000 align:left vertical:lr\n' +
        'Test\n\n' +
        '00:01:00.000 --> 00:01:10.000 align:right vertical:rl\n' +
        'Test2\n\n' +
        '00:01:10.000 --> 00:01:11.000 align:middle\n' +
        'Test3\n\n' +
        '00:01:12.000 --> 00:01:13.000 align:start\n' +
        'Test4\n\n' +
        '00:01:13.000 --> 00:01:14.000 align:end\n' +
        'Test5\n\n');
  });

  /**
   * @param {!Array} cues
   * @param {!Array} adCuePoints
   * @param {string} text
   */
  function verifyHelper(cues, adCuePoints, text) {
    const result = shaka.text.WebVttGenerator.convert(cues, adCuePoints);
    expect(text).toBe(result);
  }
});
