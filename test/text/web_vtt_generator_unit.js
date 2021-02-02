/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.text.WebVttGenerator');

describe('WebVttGenerator', () => {
  it('supports no cues', () => {
    verifyHelper([], 'WEBVTT\n\n');
  });

  it('convert cues to WebVTT', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
          {startTime: 40, endTime: 50, payload: 'Test2'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2\n\n');
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
