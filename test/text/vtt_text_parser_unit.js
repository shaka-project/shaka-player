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

describe('VttTextParser', function() {
  const Cue = shaka.text.Cue;
  const CueRegion = shaka.text.CueRegion;
  const originalLogWarning = shaka.log.warning;

  /** @type {!jasmine.Spy} */
  let logWarningSpy;

  beforeEach(() => {
    logWarningSpy = jasmine.createSpy('shaka.log.warning');
    shaka.log.warning = shaka.test.Util.spyFunc(logWarningSpy);
  });

  afterEach(() => {
    shaka.log.warning = originalLogWarning;
  });

  it('supports no cues', function() {
    verifyHelper([],
        'WEBVTT',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports initial comments', function() {
    verifyHelper([],
        'WEBVTT - Comments',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports comment blocks', function() {
    verifyHelper([],
        'WEBVTT\n\n' +
        'NOTE\n' +
        'This is a comment block',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports comment blocks with inital comment', function() {
    verifyHelper([],
        'WEBVTT\n\n' +
        'NOTE - A header comment\n' +
        'This is a comment block',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('handles a blank line at the end of the file', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('handles no blank line at the end of the file', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('handles no newline after the final text payload', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('ignores offset', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports cues with no settings', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test', id: '1'},
          {start: 40, end: 50, payload: 'Test2', id: '2'},
        ],
        'WEBVTT\n\n' +
        '1\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '2\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports cues with no ID', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
          {start: 40, end: 50, payload: 'Test2'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports comments within cues', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
          {start: 40, end: 50, payload: 'Test2'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        'NOTE\n' +
        'This is a note\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports non-integer timecodes', function() {
    verifyHelper(
        [
          {start: 20.1, end: 40.505, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.100 --> 00:00:40.505\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports large timecodes', function() {
    verifyHelper(
        [
          {start: 20, end: 108000, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 30:00:00.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('requires header', function() {
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_HEADER,
                '',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_HEADER,
                '00:00:00.000 --> 00:00:00.020\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('rejects invalid time values', function() {
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00.020    --> 0:00.040\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n0:00.020  --> 0:00.040\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:00.20  --> 0:00.040\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:100.20 --> 0:00.040\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:00.020 --> 0:00.040\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:00:00:00.020 --> 0:00.040\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:61.020 --> 0:00.040\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n61:00.020 --> 0:00.040\nTest',
                {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports vertical setting', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            payload: 'Test',
            writingMode: Cue.writingMode.VERTICAL_RIGHT_TO_LEFT,
          },
          {
            start: 40,
            end: 50,
            payload: 'Test2',
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:rl\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 vertical:lr\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports line setting', function() {
    verifyHelper(
        [
          {
            start: 20, end: 40, payload: 'Test', line: 0,
            lineInterpretation: Cue.lineInterpretation.LINE_NUMBER,
          },
          {
            start: 40, end: 50, payload: 'Test2', line: -1,
            lineInterpretation: Cue.lineInterpretation.LINE_NUMBER,
          },
          {
            start: 50, end: 60, payload: 'Test3', line: 45,
            lineInterpretation: Cue.lineInterpretation.PERCENTAGE,
          },
          {
            start: 55, end: 65, payload: 'Test4', line: 12.3,
            lineInterpretation: Cue.lineInterpretation.PERCENTAGE,
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:0\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1\n' +
        'Test2\n\n' +
        '00:00:50.000 --> 00:01:00.000 line:45%\n' +
        'Test3\n\n' +
        '00:00:55.000 --> 00:01:05.000 line:12.3%\n' +
        'Test4\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports line setting with optional part', function() {
    verifyHelper(
        [
          {
            start: 20, end: 40, payload: 'Test', line: 10,
            lineInterpretation: Cue.lineInterpretation.PERCENTAGE,
            lineAlign: Cue.lineAlign.START,
          },
          {
            start: 40, end: 50, payload: 'Test2', line: -1,
            lineInterpretation: Cue.lineInterpretation.LINE_NUMBER,
            lineAlign: Cue.lineAlign.CENTER,
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:10%,start\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1,center\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports position setting', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test', position: 45},
          {start: 25, end: 45, payload: 'Test2', position: 12.3},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 position:45%\n' +
        'Test\n\n' +
        '00:00:25.000 --> 00:00:45.000 position:12.3%\n' +
        'Test2\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports position setting with optional part', function() {
    verifyHelper(
        [
          {
            start: 20, end: 40, payload: 'Test', position: 45,
            positionAlign: Cue.positionAlign.LEFT,
          },
          {
            start: 20, end: 40, payload: 'Test2', position: 45,
            positionAlign: Cue.positionAlign.LEFT,
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 position:45%,line-left\n' +
        'Test\n\n' +
        '00:00:20.000 --> 00:00:40.000 position:45%,start\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports size setting', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test', size: 56},
          {start: 25, end: 45, payload: 'Test2', size: 12.3},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 size:56%\n' +
        'Test\n\n' +
        '00:00:25.000 --> 00:00:45.000 size:12.3%\n' +
        'Test2\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports align setting', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test', align: 'center'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:center\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports multiple settings', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            payload: 'Test',
            textAlign: Cue.textAlign.CENTER,
            size: 56,
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports timestamps with one-digit hour at start time', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            payload: 'Test',
            textAlign: Cue.textAlign.CENTER,
            size: 56,
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '0:00:20.000 --> 00:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports timestamps with one-digit hour at end time', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            payload: 'Test',
            textAlign: Cue.textAlign.CENTER,
            size: 56,
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 0:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports stamps with one-digit hours at start & end time', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            payload: 'Test',
            align: 'center',
            size: 56,
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '0:00:20.000 --> 0:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('uses segment time', function() {
    verifyHelper(
        [
          {
            start: 40, // Note these are 20s off of the cue
            end: 60,   // because using relative timestamps
            payload: 'Test',
            align: 'center',
            size: 56,
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '0:00:20.000 --> 0:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        {periodStart: 0, segmentStart: 20, segmentEnd: 0});
  });


  it('parses VTTRegions', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            payload: 'Test',
            region: {
              id: 'reg1',
              viewportAnchorX: 10,
              viewportAnchorY: 90,
              regionAnchorX: 0,
              regionAnchorY: 100,
              width: 50,
              height: 3,
              heightUnits: CueRegion.units.LINES,
              widthUnits: CueRegion.units.PERCENTAGE,
              viewportAnchorUnits: CueRegion.units.PERCENTAGE,
              scroll: CueRegion.scrollMode.UP,
            },
          },
        ],
        'WEBVTT\n' +
        'Region: id=reg1 width=50% lines=3 regionanchor=0%,100% ' +
        'viewportanchor=10%,90% scroll=up\n\n' +
        '0:00:20.000 --> 0:00:40.000 region:reg1\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('ignores and logs invalid settings', function() {
    expect(logWarningSpy.calls.count()).toBe(0);

    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:es\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:-3%\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:45%%\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:10\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:foo\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    expect(logWarningSpy.calls.count()).toBe(7);
  });

  it('respects X-TIMESTAMP-MAP header in probes', function() {
    verifyHelper(
        [
          {start: 30, end: 50, payload: 'Test'},
          {start: 50, end: 60, payload: 'Test2'},
        ],
        // 900000 = 10 sec, so expect every timestamp to be 10
        // seconds ahead of what is specified.
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:0\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1\n' +
        'Test2',
        // segmentStart of null marks this as a probe.
        {periodStart: 0, segmentStart: null, segmentEnd: 0});
  });

  it('ignores X-TIMESTAMP-MAP header when segment times are known', function() {
    verifyHelper(
        [
          {start: 120, end: 140, payload: 'Test'},
          {start: 140, end: 150, payload: 'Test2'},
        ],
        // 900000 = 10 sec, so expect every timestamp to be 10
        // seconds ahead of what is specified.
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:0\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1\n' +
        'Test2',
        // Non-null segmentStart takes precedence over X-TIMESTAMP-MAP.
        // This protects us from rollover in the MPEGTS field.
        {periodStart: 0, segmentStart: 100, segmentEnd: 0});
  });

  it('skips style blocks', function() {
    verifyHelper(
        [
          {start: 20, end: 40, payload: 'Test'},
          {start: 40, end: 50, payload: 'Test2'},
        ],
        'WEBVTT\n\n' +
        'STYLE\n::cue(.cyan) { color: cyan; }\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });


  /**
   * @param {!Array} cues
   * @param {string} text
   * @param {shaka.extern.TextParser.TimeContext} time
   */
  function verifyHelper(cues, text, time) {
    let data = new Uint8Array(shaka.util.StringUtils.toUTF8(text));

    let result = new shaka.text.VttTextParser().parseMedia(data, time);
    expect(result).toBeTruthy();
    expect(result.length).toBe(cues.length);
    for (let i = 0; i < cues.length; i++) {
      expect(result[i].startTime).toBe(cues[i].start);
      expect(result[i].endTime).toBe(cues[i].end);
      expect(result[i].payload).toBe(cues[i].payload);

      if ('id' in cues[i]) {
        expect(result[i].id).toBe(cues[i].id);
      }
      if ('vertical' in cues[i]) {
        expect(result[i].writingMode).toBe(cues[i].writingMode);
      }
      if ('line' in cues[i]) {
        expect(result[i].line).toBe(cues[i].line);
      }
      if ('textAlign' in cues[i]) {
        expect(result[i].textAlign).toBe(cues[i].textAlign);
      }
      if ('size' in cues[i]) {
        expect(result[i].size).toBe(cues[i].size);
      }
      if ('position' in cues[i]) {
        expect(result[i].position).toBe(cues[i].position);
      }
      if ('region' in cues[i]) {
        verifyRegion(cues[i].region, result[i].region);
      }
    }
  }


  /**
   * @param {!Object} expected
   * @param {shaka.extern.CueRegion} actual
   */
  function verifyRegion(expected, actual) {
    let properties = ['id', 'viewportAnchorX', 'viewportAnchorY',
                      'regionAnchorX', 'regionAnchorY', 'width', 'height',
                      'heightUnits', 'widthUnits', 'viewportAnchorUnits',
                      'scroll'];
    expect(actual).toBeTruthy();

    for (let i = 0; i < properties.length; i++) {
      let property = properties[i];
      if (property in expected) {
        expect(actual[property]).toEqual(expected[property]);
      }
    }
  }

  /**
   * @param {shaka.util.Error.Code} code
   * @param {string} text
   * @param {shaka.extern.TextParser.TimeContext} time
   */
  function errorHelper(code, text, time) {
    let error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
        code);
    let data = new Uint8Array(shaka.util.StringUtils.toUTF8(text));
    try {
      new shaka.text.VttTextParser().parseMedia(data, time);
      fail('Invalid WebVTT file supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  }
});
