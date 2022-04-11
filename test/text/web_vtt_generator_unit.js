/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('WebVttGenerator', () => {
  it('supports no cues', () => {
    verifyHelper([], 'WEBVTT\n\n');
  });

  it('convert cues to WebVTT', () => {
    const shakaCue1 = new shaka.text.Cue(20, 40, 'Test');
    const shakaCue2 = new shaka.text.Cue(40, 50, 'Test2');

    verifyHelper(
        [
          shakaCue1,
          shakaCue2,
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2\n\n');
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
    verifyHelper(
        [shakaCue],
        'WEBVTT\n\n' +
        '00:00:10.000 --> 00:00:20.000\n' +
        '<i><u>Test1</u></i><b><i>Test2</i></b>Test3<u>Test4</u>\n\n');
  });

  /**
   * @param {!Array} cues
   * @param {string} text
   */
  function verifyHelper(cues, text) {
    const result = shaka.text.WebVttGenerator.convert(cues);
    expect(text).toBe(result);
  }
});
