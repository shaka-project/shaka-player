/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('Cue', function() {
  // This integration test checks platform support for various cue scenarios
  // that have caused platform-specific issues.  The unit tests for each parser
  // use a mocked VTTCue implementation, so they do not find platform issues.

  // The scenarios under test are not specific to WebVTT, but WebVTT is used to
  // exercise the platform's native cues and ensure that no errors occur.

  it('handles offsets', function() {
    // Offsets must be handled early.
    // See issue #502
    let cues = parseVtt(
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 7, segmentEnd: 0});
    expect(cues.length).toBe(1);
    expect(cues[0].startTime).toBe(27);
    expect(cues[0].endTime).toBe(47);
  });

  it('does not object to extra settings', function() {
    // To simplify refactoring, we are no longer checking for VTTCue before
    // setting properties that only exist on VTTCue.  So we want to ensure that
    // errors are not thrown when the extra settings are assigned.
    let cues = parseVtt(
        'WEBVTT\n\n' +
        'ID1\n' +
        '00:00:20.000 --> 00:00:40.000 align:middle size:56% vertical:lr\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    expect(cues.length).toBe(1);
  });

  /**
   * @param {string} text
   * @param {!shaka.extern.TextParser.TimeContext} time
   * @return {!Array.<!shaka.extern.Cue>}
   */
  function parseVtt(text, time) {
    let data = new Uint8Array(shaka.util.StringUtils.toUTF8(text));
    return new shaka.text.VttTextParser().parseMedia(data, time);
  }
});
