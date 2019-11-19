/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VttTextParser', () => {
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

  it('supports no cues', () => {
    verifyHelper([],
        'WEBVTT',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports initial comments', () => {
    verifyHelper([],
        'WEBVTT - Comments',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports comment blocks', () => {
    verifyHelper([],
        'WEBVTT\n\n' +
        'NOTE\n' +
        'This is a comment block',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports comment blocks with inital comment', () => {
    verifyHelper([],
        'WEBVTT\n\n' +
        'NOTE - A header comment\n' +
        'This is a comment block',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('handles a blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('handles no blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('handles no newline after the final text payload', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('ignores offset', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports cues with no settings', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test', id: '1'},
          {startTime: 40, endTime: 50, payload: 'Test2', id: '2'},
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

  it('supports cues with no ID', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
          {startTime: 40, endTime: 50, payload: 'Test2'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports comments within cues', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
          {startTime: 40, endTime: 50, payload: 'Test2'},
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

  it('supports non-integer timecodes', () => {
    verifyHelper(
        [
          {startTime: 20.1, endTime: 40.505, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.100 --> 00:00:40.505\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports large timecodes', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 108000, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 30:00:00.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('requires header', () => {
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_HEADER,
        '',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_HEADER,
        '00:00:00.000 --> 00:00:00.020\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('rejects invalid time values', () => {
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

  it('supports vertical setting', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
            payload: 'Test',
            writingMode: Cue.writingMode.VERTICAL_RIGHT_TO_LEFT,
          },
          {
            startTime: 40,
            endTime: 50,
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

  it('supports line setting', () => {
    verifyHelper(
        [
          {
            startTime: 20, endTime: 40, payload: 'Test', line: 0,
            lineInterpretation: Cue.lineInterpretation.LINE_NUMBER,
          },
          {
            startTime: 40, endTime: 50, payload: 'Test2', line: -1,
            lineInterpretation: Cue.lineInterpretation.LINE_NUMBER,
          },
          {
            startTime: 50, endTime: 60, payload: 'Test3', line: 45,
            lineInterpretation: Cue.lineInterpretation.PERCENTAGE,
          },
          {
            startTime: 55, endTime: 65, payload: 'Test4', line: 12.3,
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

  it('supports line setting with optional part', () => {
    verifyHelper(
        [
          {
            startTime: 20, endTime: 40, payload: 'Test', line: 10,
            lineInterpretation: Cue.lineInterpretation.PERCENTAGE,
            lineAlign: Cue.lineAlign.START,
          },
          {
            startTime: 40, endTime: 50, payload: 'Test2', line: -1,
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

  it('supports position setting', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test', position: 45},
          {startTime: 25, endTime: 45, payload: 'Test2', position: 12.3},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 position:45%\n' +
        'Test\n\n' +
        '00:00:25.000 --> 00:00:45.000 position:12.3%\n' +
        'Test2\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports position setting with optional part', () => {
    verifyHelper(
        [
          {
            startTime: 20, endTime: 40, payload: 'Test', position: 45,
            positionAlign: Cue.positionAlign.LEFT,
          },
          {
            startTime: 20, endTime: 40, payload: 'Test2', position: 45,
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

  it('supports size setting', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test', size: 56},
          {startTime: 25, endTime: 45, payload: 'Test2', size: 12.3},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 size:56%\n' +
        'Test\n\n' +
        '00:00:25.000 --> 00:00:45.000 size:12.3%\n' +
        'Test2\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports align setting', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test', textAlign: 'center'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:center\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports multiple settings', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
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

  it('supports timestamps with one-digit hour at start time', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
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

  it('supports timestamps with one-digit hour at end time', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
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

  it('supports stamps with one-digit hours at start & end time', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
            payload: 'Test',
            textAlign: 'center',
            size: 56,
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '0:00:20.000 --> 0:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('uses segment time', () => {
    verifyHelper(
        [
          {
            startTime: 40, // Note these are 20s off of the cue
            endTime: 60,   // because using relative timestamps
            payload: 'Test',
            textAlign: 'center',
            size: 56,
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '0:00:20.000 --> 0:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        {periodStart: 0, segmentStart: 20, segmentEnd: 0});
  });


  it('parses VTTRegions', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
            payload: 'Test',
            region: jasmine.objectContaining({
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
            }),
          },
        ],
        'WEBVTT\n' +
        'Region: id=reg1 width=50% lines=3 regionanchor=0%,100% ' +
        'viewportanchor=10%,90% scroll=up\n\n' +
        '0:00:20.000 --> 0:00:40.000 region:reg1\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('ignores and logs invalid settings', () => {
    expect(logWarningSpy).not.toHaveBeenCalled();

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:es\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:-3%\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:45%%\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:10\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:foo\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});

    expect(logWarningSpy).toHaveBeenCalledTimes(7);
  });

  it('parses X-TIMESTAMP-MAP header', () => {
    verifyHelper(
        [
          {startTime: 30, endTime: 50, payload: 'Test'},
          {startTime: 50, endTime: 60, payload: 'Test2'},
        ],
        // 900000 = 10 sec, so expect every timestamp to be 10
        // seconds ahead of what is specified.
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:0\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1\n' +
        'Test2',
        {periodStart: 0, segmentStart: 25, segmentEnd: 65});
  });

  it('handles timestamp rollover with X-TIMESTAMP-MAP header', () => {
    verifyHelper(
        [
          {startTime: 95443, endTime: 95445, payload: 'Test'},
        ],
        // 8589870000/900000 = 95443 sec, so expect every timestamp to be 95443
        // seconds ahead of what is specified.
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:8589870000,LOCAL:00:00:00.000\n\n' +
        '00:00:00.000 --> 00:00:02.000 line:0\n' +
        'Test',
        // Non-null segmentStart takes precedence over X-TIMESTAMP-MAP.
        // This protects us from rollover in the MPEGTS field.
        {periodStart: 0, segmentStart: 95440, segmentEnd: 95550});

    verifyHelper(
        [
          {startTime: 95552, endTime: 95554, payload: 'Test2'},
        ],
        // 95550 is larger than the roll over timestamp, so the timestamp offset
        // gets rolled over.
        // (9745408 + 0x200000000) / 90000 = 95552 sec
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:9745408,LOCAL:00:00:00.000\n\n' +
        '00:00:00.000 --> 00:00:02.000 line:0\n' +
        'Test2',
        {periodStart: 0, segmentStart: 95550, segmentEnd: 95560});
  });

  it('skips style blocks', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
          {startTime: 40, endTime: 50, payload: 'Test2'},
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
    const data =
        shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text));

    const result = new shaka.text.VttTextParser().parseMedia(data, time);
    expect(result).toEqual(cues.map((c) => jasmine.objectContaining(c)));
  }

  /**
   * @param {shaka.util.Error.Code} code
   * @param {string} text
   * @param {shaka.extern.TextParser.TimeContext} time
   */
  function errorHelper(code, text, time) {
    const error = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
        code));
    const data =
        shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text));
    expect(() => new shaka.text.VttTextParser().parseMedia(data, time))
        .toThrow(error);
  }
});
