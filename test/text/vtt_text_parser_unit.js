/*! @license
 * Shaka Player
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports initial comments', () => {
    verifyHelper([],
        'WEBVTT - Comments',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports comment blocks', () => {
    verifyHelper([],
        'WEBVTT\n\n' +
        'NOTE\n' +
        'This is a comment block',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports comment blocks with inital comment', () => {
    verifyHelper([],
        'WEBVTT\n\n' +
        'NOTE - A header comment\n' +
        'This is a comment block',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles a blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles no blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('handles no newline after the final text payload', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports non-integer timecodes', () => {
    verifyHelper(
        [
          {startTime: 20.1, endTime: 40.505, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.100 --> 00:00:40.505\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports large timecodes', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 108000, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 30:00:00.000\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('requires header', () => {
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_HEADER,
        '',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_HEADER,
        '00:00:00.000 --> 00:00:00.020\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('rejects invalid time values', () => {
    verifyHelper([],
        'WEBVTT\n\n00.020    --> 0:00.040\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
    verifyHelper([],
        'WEBVTT\n\n0:00.020  --> 0:00.040\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
    verifyHelper([],
        'WEBVTT\n\n00:00.20  --> 0:00.040\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
    verifyHelper([],
        'WEBVTT\n\n00:100.20 --> 0:00.040\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
    verifyHelper([],
        'WEBVTT\n\n00:00.020 --> 0:00.040\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
    verifyHelper([],
        'WEBVTT\n\n00:00:00:00.020 --> 0:00.040\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
    verifyHelper([],
        'WEBVTT\n\n00:61.020 --> 0:00.040\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
    verifyHelper([],
        'WEBVTT\n\n61:00.020 --> 0:00.040\nTest',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports align setting', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test', textAlign: 'center'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:center\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('uses time offset from vttOffset, not periodStart or segmentStart', () => {
    verifyHelper(
        [
          {
            startTime: 50,
            endTime: 60,
            payload: 'Test',
            textAlign: 'center',
            size: 56,
            writingMode: Cue.writingMode.VERTICAL_LEFT_TO_RIGHT,
          },
        ],
        'WEBVTT\n\n' +
        '0:00:10.000 --> 0:00:20.000 align:center size:56% vertical:lr\n' +
        'Test',
        {periodStart: 60, segmentStart: 80, segmentEnd: 100, vttOffset: 40});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
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
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:-3%\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:45%%\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:10\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});

    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:foo\n' +
        'Test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});

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
        {periodStart: 0, segmentStart: 25, segmentEnd: 65, vttOffset: 0},
        /* sequenceMode= */ true);
  });

  it('ignores X-TIMESTAMP-MAP header if not in sequence mode', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
          {startTime: 40, endTime: 50, payload: 'Test2'},
        ],
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:01:00:00.000\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:0\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1\n' +
        'Test2',
        {periodStart: 0, segmentStart: 25, segmentEnd: 65, vttOffset: 0},
        /* sequenceMode= */ false);
  });

  it('parses X-TIMESTAMP-MAP header with non-zero local base', () => {
    verifyHelper(
        [
          {startTime: 1800, endTime: 1810, payload: 'Test'},
          {startTime: 1820, endTime: 1830, payload: 'Test2'},
        ],
        // 162000000 = 30 * 60 * 90k = 30 minutes for the TS part of the map.
        // The local (VTT) part of the map is 1 hour.
        // So text times of 1 hour map to media times of 30 minutes.
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:162000000,LOCAL:01:00:00.000\n\n' +
        '01:00:00.000 --> 01:00:10.000 line:0\n' +
        'Test\n\n' +
        '01:00:20.000 --> 01:00:30.000 line:-1\n' +
        'Test2',
        {periodStart: 0, segmentStart: 25, segmentEnd: 65, vttOffset: 0},
        /* sequenceMode= */ true);
  });

  it('combines X-TIMESTAMP-MAP header with periodStart', () => {
    verifyHelper(
        [
          {startTime: 130, endTime: 150, payload: 'Test'},
          {startTime: 150, endTime: 160, payload: 'Test2'},
        ],
        // 900000 = 10 sec, so expect every timestamp to be 10
        // seconds ahead of what is specified.
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:0\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1\n' +
        'Test2',
        {periodStart: 100, segmentStart: 25, segmentEnd: 65, vttOffset: 0},
        /* sequenceMode= */ true);
  });

  it('handles timestamp rollover with X-TIMESTAMP-MAP header', () => {
    verifyHelper(
        [
          {startTime: 95443, endTime: 95445, payload: 'Test'},
        ],
        // 8589870000/90000 = 95443 sec, so expect every timestamp to be 95443
        // seconds ahead of what is specified.
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:8589870000,LOCAL:00:00:00.000\n\n' +
        '00:00:00.000 --> 00:00:02.000 line:0\n' +
        'Test',
        // Non-null segmentStart takes precedence over X-TIMESTAMP-MAP.
        // This protects us from rollover in the MPEGTS field.
        {periodStart: 0, segmentStart: 95440, segmentEnd: 95550, vttOffset: 0},
        /* sequenceMode= */ true);

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
        {periodStart: 0, segmentStart: 95550, segmentEnd: 95560, vttOffset: 0},
        /* sequenceMode= */ true);
  });

  // A mock-up of HLS live subs as seen in b/253104251.
  it('handles timestamp rollover and negative offset in HLS live', () => {
    // Similar to values seen in b/253104251, for a realistic regression test.
    // When using sequence mode on live HLS, we get negative offsets that
    // represent the timestamp of our first append in sequence mode.
    verifyHelper(
        [
          {startTime: 3600, endTime: 3602, payload: 'Test'},
        ],
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:8355814896,LOCAL:00:00:00.000\n\n' +
        '00:00:00.000 --> 00:00:02.000 line:0\n' +
        'Test',
        {
          periodStart: -1234567,
          segmentStart: 3600,
          segmentEnd: 3610,
          vttOffset: -1234567,
        },
        /* sequenceMode= */ true);
  });

  it('supports global style blocks', () => {
    const textShadow = '-1px 0 black, 0 1px black, 1px 0 black, 0 -1px black';
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
            payload: 'Test',
            color: 'cyan',
            fontSize: '10px',
            textCombineUpright: 'all',
            textShadow: textShadow,
          },
          {
            startTime: 40,
            endTime: 50,
            payload: 'Test2',
            color: 'cyan',
            fontSize: '10px',
            textCombineUpright: 'all',
            textShadow: textShadow,
          },
        ],
        'WEBVTT\n\n' +
        'STYLE\n' +
        '::cue {\n' +
        'color: cyan;\n'+
        'font-size: 10px;\n'+
        `text-shadow: ${textShadow};\n`+
        'text-combine-upright: all;\n'+
        '}\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports global style blocks without blank lines', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
            payload: 'Test',
            color: 'cyan',
            fontSize: '10px',
          },
          {
            startTime: 40,
            endTime: 50,
            payload: 'Test2',
            color: 'cyan',
            fontSize: '10px',
          },
        ],
        'WEBVTT\n\n' +
        'STYLE\n' +
        '::cue { color: cyan; font-size: 10px; }\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
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
                payload: '',
                fontWeight: Cue.fontWeight.BOLD,
                nestedCues: [
                  {
                    startTime: 50,
                    endTime: 60,
                    payload: 'Test',
                  },
                  {
                    startTime: 50,
                    endTime: 60,
                    payload: '5',
                    fontStyle: Cue.fontStyle.ITALIC,
                  },
                ],
              },
            ],
          },
          {
            startTime: 70,
            endTime: 80,
            payload: '',
            nestedCues: [
              {
                startTime: 70,
                endTime: 80,
                payload: 'Test',
                fontWeight: Cue.fontWeight.NORMAL,
              },
              {
                startTime: 70,
                endTime: 80,
                payload: '6',
                fontWeight: Cue.fontWeight.BOLD,
              },
            ],
          },
          {
            startTime: 80,
            endTime: 90,
            payload: '',
            nestedCues: [
              {
                startTime: 80,
                endTime: 90,
                payload: '',
                fontWeight: Cue.fontWeight.BOLD,
                nestedCues: [
                  {
                    startTime: 80,
                    endTime: 90,
                    payload: 'Test ',
                  },
                  {
                    startTime: 80,
                    endTime: 90,
                    payload: '7',
                    fontStyle: Cue.fontStyle.ITALIC,
                  },
                ],
              },
            ],
          },
          {
            startTime: 90,
            endTime: 100,
            payload: '<b>Test<i>8</b>',
          },
        ],
        'WEBVTT\n\n' +
        '00:00:10.000 --> 00:00:20.000\n' +
        '<b>Test</b>\n\n' +
        '00:00:20.000 --> 00:00:30.000\n' +
        '<i>Test2</i>\n\n' +
        '00:00:30.000 --> 00:00:40.000\n' +
        '<u>Test3</u>\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        '<a>Test4</a>\n\n' +
        '00:00:50.000 --> 00:01:00.000\n' +
        '<b>Test<i>5</i></b>\n\n' +
        '00:01:10.000 --> 00:01:20.000\n' +
        'Test<b>6</b>\n\n' +
        '00:01:20.000 --> 00:01:30.000\n' +
        '<b>Test <i>7</i></b>\n\n' +
        '00:01:30.000 --> 00:01:40.000\n' +
        '<b>Test<i>8</b>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('support escaped html payload', () => {
    verifyHelper(
        [
          {
            startTime: 20.1,
            endTime: 40.505,
            payload: '"Test & 1"\u{a0}',
          },
          {
            startTime: 41,
            endTime: 42,
            payload: '',
            nestedCues: [
              {
                startTime: 41,
                endTime: 42,
                payload: 'Test',
                fontStyle: Cue.fontStyle.ITALIC,
              },
              {
                startTime: 41,
                endTime: 42,
                payload: '&',
              },
            ],
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.100 --> 00:00:40.505\n' +
        '&quot;Test &amp; 1&quot;&nbsp;\n\n' +
        '00:00:41.000 --> 00:00:42.000\n' +
        '<i>Test</i>&amp;',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports specific style blocks', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
            payload: '',
            nestedCues: [
              {
                startTime: 20,
                endTime: 40,
                payload: 'Test',
                color: 'cyan',
                fontWeight: Cue.fontWeight.BOLD,
              },
            ],
          },
          {startTime: 40, endTime: 50, payload: 'Test2'},
        ],
        'WEBVTT\n\n' +
        'STYLE\n::cue(b) { color: cyan; }\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        '<b>Test</b>\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports ruby html tags', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
            payload: '',
            nestedCues: [
              {
                startTime: 20,
                endTime: 40,
                payload: '',
                rubyTag: 'ruby',
                nestedCues: [
                  {
                    startTime: 20,
                    endTime: 40,
                    payload: 'Test',
                  },
                  {
                    startTime: 20,
                    endTime: 40,
                    payload: '2',
                    rubyTag: 'rt',
                  },
                  {
                    startTime: 20,
                    endTime: 40,
                    payload: '3',
                    rubyTag: 'rp',
                  },
                ],
              },
            ],
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        '<ruby>Test<rt>2</rt><rp>3</rp></ruby>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports only two digits in the timestamp', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.00 --> 00:00:40.00\n' +
        'Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports class with default color', () => {
    verifyHelper(
        [
          {
            startTime: 20, endTime: 40,
            payload: '',
            nestedCues: [
              {
                startTime: 20,
                endTime: 40,
                payload: 'Test',
                color: 'yellow',
              },
            ],
          },
          {
            startTime: 40, endTime: 50,
            payload: '',
            nestedCues: [
              {
                startTime: 40,
                endTime: 50,
                payload: 'Test2',
                color: 'cyan',
                backgroundColor: 'blue',
              },
            ],
          },
          {
            startTime: 50, endTime: 60,
            payload: '',
            nestedCues: [
              {
                startTime: 50,
                endTime: 60,
                payload: 'Test 3',
                color: 'magenta',
                backgroundColor: 'black',
              },
            ],
          },
          {
            startTime: 60,
            endTime: 70,
            payload: '',
            nestedCues: [
              {
                startTime: 60,
                endTime: 70,
                payload: 'First row',
              },
              {
                startTime: 60,
                endTime: 70,
                payload: 'Test4.1',
                color: 'yellow',
              },
              {
                startTime: 60,
                endTime: 70,
                payload: '',
                lineBreak: true,
              },
              {
                startTime: 60,
                endTime: 70,
                payload: 'Second row',
              },
              {
                startTime: 60,
                endTime: 70,
                payload: 'Test4.2',
                color: 'blue',
              },
            ],
          },
          {
            startTime: 70,
            endTime: 80,
            payload: '',
            nestedCues: [
              {
                startTime: 70,
                endTime: 80,
                payload: '',
                color: 'red',
                nestedCues: [
                  {
                    startTime: 70,
                    endTime: 80,
                    payload: 'Test5.1',
                    color: 'red',
                  },
                  {
                    startTime: 70,
                    endTime: 80,
                    payload: 'Test5.2',
                    color: 'lime',
                  },
                ],
              },
            ],
          },
          {
            startTime: 80,
            endTime: 90,
            payload: '<b><c.lime>Parse fail 1</b></c.lime>',
            nestedCues: [],
          },
          {
            startTime: 90,
            endTime: 100,
            payload: '<c.lime><b>Parse fail 2</c.lime></b>',
            nestedCues: [],
          },
          {
            startTime: 100,
            endTime: 110,
            payload: '',
            nestedCues: [
              {
                startTime: 100,
                endTime: 110,
                payload: 'forward slash 1/2 in text',
                color: 'lime',
              },
            ],
          },
          {
            startTime: 110,
            endTime: 120,
            payload: '<c.lime>less or more < > in text</c.lime>',
            nestedCues: [],
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        '<c.yellow>Test</c>\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        '<c.cyan.bg_blue>Test2</c>\n\n' +
        '00:00:50.000 --> 00:01:00.000\n' +
        '<c.yellow.bg_blue.magenta.bg_black>Test 3</c>\n\n' +
        '00:01:00.000 --> 00:01:10.000\n' +
        'First row<c.yellow>Test4.1</c>\nSecond row<c.blue>Test4.2</c>\n\n' +
        '00:01:10.000 --> 00:01:20.000\n' +
        '<c.red>Test5.1<c.lime>Test5.2</c></c>\n\n' +
        '00:01:20.000 --> 00:01:30.000\n' +
        '<b><c.lime>Parse fail 1</b></c>\n\n' +
        '00:01:30.000 --> 00:01:40.000\n' +
        '<c.lime><b>Parse fail 2</c></b>\n\n' +
        '00:01:40.000 --> 00:01:50.000\n' +
        '<c.lime>forward slash 1/2 in text</c>\n\n' +
        '00:01:50.000 --> 00:02:00.000\n' +
        '<c.lime>less or more < > in text</c>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports karaoke style text', () => {
    verifyHelper(
        [
          {
            startTime: 20, endTime: 40,
            payload: '',
            nestedCues: [
              {
                startTime: 20,
                endTime: 40,
                payload: 'Test',
              },
              {
                startTime: 25,
                endTime: 40,
                payload: ' 1',
              },
            ],
          },
        ],
        'WEBVTT\n\n' +
        '00:00:20.00 --> 00:00:40.00\n' +
        'Test<00:00:25.00> 1',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports voice style blocks', () => {
    verifyHelper(
        [
          {
            startTime: 20,
            endTime: 40,
            payload: '',
            nestedCues: [
              {
                startTime: 20,
                endTime: 40,
                payload: 'Test',
                color: 'cyan',
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
                payload: 'Test',
                color: 'red',
              },
              {
                startTime: 40,
                endTime: 50,
                payload: '2',
                fontStyle: Cue.fontStyle.ITALIC,
              },
            ],
          },
        ],
        'WEBVTT\n\n' +
        'STYLE\n' +
        '::cue(v[voice="Shaka"]) { color: cyan; }\n' +
        '::cue(v[voice=ShakaBis]) { color: red; }\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        '<v Shaka>Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        '<v ShakaBis>Test</v><i>2</i>',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports default color overriding', () => {
    verifyHelper(
        [
          {
            startTime: 10, endTime: 20,
            payload: '',
            nestedCues: [
              {
                startTime: 10,
                endTime: 20,
                payload: 'Example 1',
                color: 'red',
                backgroundColor: 'yellow',
                fontSize: '10px',
              },
            ],
          },
        ],
        'WEBVTT\n\n' +
        'STYLE\n' +
        '::cue(.bg_blue) { font-size: 10px; background-color: yellow }\n\n' +
        '00:00:10.000 --> 00:00:20.000\n' +
        '<c.red.bg_blue>Example 1</c>\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  // https://github.com/shaka-project/shaka-player/issues/4479
  it('keep styles when there are line breaks', () => {
    verifyHelper(
        [
          {
            startTime: 10, endTime: 20,
            payload: '',
            nestedCues: [
              {
                startTime: 10,
                endTime: 20,
                payload: '1',
                color: 'magenta',
              },
              {
                startTime: 10,
                endTime: 20,
                payload: '',
                lineBreak: true,
              },
              {
                startTime: 10,
                endTime: 20,
                payload: '',
                color: 'magenta',
                nestedCues: [
                  {
                    startTime: 10,
                    endTime: 20,
                    payload: '2',
                    color: 'magenta',
                    fontStyle: Cue.fontStyle.ITALIC,
                  },
                ],
              },
            ],
          },
        ],
        'WEBVTT\n\n' +
        '00:00:10.000 --> 00:00:20.000\n' +
        '<c.magenta>1</c><br/><c.magenta><i>2</i></c>\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('does not fail on REGION blocks', () => {
    verifyHelper(
        [
          {
            startTime: 10, endTime: 20,
            payload: 'test',
          },
        ],
        'WEBVTT\n\n' +
        'REGION\n' +
        'id:1\n\n' +
        '00:00:10.000 --> 00:00:20.000\n' +
        'test\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports an extra newline inside the cue body', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: 'Test'},
          {startTime: 40, endTime: 50, payload: 'Test2'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\nExtra line\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  it('supports an extra newline before the cue body', () => {
    verifyHelper(
        [
          {startTime: 20, endTime: 40, payload: ''},
          {startTime: 40, endTime: 50, payload: 'Test2'},
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        '\nTest\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0, vttOffset: 0});
  });

  /**
   * @param {!Array} cues
   * @param {string} text
   * @param {shaka.extern.TextParser.TimeContext} time
   * @param {boolean=} sequenceMode
   */
  function verifyHelper(cues, text, time, sequenceMode = false) {
    const data =
        shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text));
    const parser = new shaka.text.VttTextParser();
    parser.setSequenceMode(sequenceMode);
    const result = parser.parseMedia(data, time);

    const checkCue = (cue) => {
      if (cue.nestedCues) {
        cue.nestedCues = cue.nestedCues.map((nestedCue) => checkCue(nestedCue));
      }
      return jasmine.objectContaining(cue);
    };

    const expected = cues.map(checkCue);
    expect(result).toEqual(expected);
  }

  /**
   * @param {shaka.util.Error.Code} code
   * @param {string} text
   * @param {shaka.extern.TextParser.TimeContext} time
   * @param {*=} errorData
   */
  function errorHelper(code, text, time, errorData = undefined) {
    let shakaError;
    if (errorData) {
      shakaError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
          code, errorData);
    } else {
      shakaError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
          code);
    }
    const error = shaka.test.Util.jasmineError(shakaError);
    const data =
        shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text));
    expect(() => new shaka.text.VttTextParser().parseMedia(data, time))
        .toThrow(error);
  }
});
