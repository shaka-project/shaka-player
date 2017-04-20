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
  var logWarningSpy;
  var originalVTTCue;

  beforeAll(function() {
    originalVTTCue = window.VTTCue;

    logWarningSpy = jasmine.createSpy('shaka.log.warning');
    shaka.log.warning = logWarningSpy;
  });

  afterAll(function() {
    window.VTTCue = originalVTTCue;
  });

  beforeEach(function() {
    logWarningSpy.calls.reset();
    window.VTTCue = function(start, end, text) {
      this.startTime = start;
      this.endTime = end;
      this.text = text;
    };
  });

  it('supports no cues', function() {
    verifyHelper([],
        'WEBVTT',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports initial comments', function() {
    verifyHelper([],
        'WEBVTT - Comments',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports comment blocks', function() {
    verifyHelper([],
        'WEBVTT\n\n' +
        'NOTE\n' +
        'This is a comment block',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports comment blocks with inital comment', function() {
    verifyHelper([],
        'WEBVTT\n\n' +
        'NOTE - A header comment\n' +
        'This is a comment block',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('handles a blank line at the end of the file', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('handles no blank line at the end of the file', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0
        });
  });

  it('handles no newline after the final text payload', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('ignores offset', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports cues with no settings', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test', id: '1'},
          {start: 40, end: 50, text: 'Test2', id: '2'}
        ],
        'WEBVTT\n\n' +
        '1\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '2\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports cues with no ID', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'},
          {start: 40, end: 50, text: 'Test2'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports comments within cues', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'},
          {start: 40, end: 50, text: 'Test2'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000\n' +
        'Test\n\n' +
        'NOTE\n' +
        'This is a note\n\n' +
        '00:00:40.000 --> 00:00:50.000\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports non-integer timecodes', function() {
    verifyHelper(
        [
          {start: 20.1, end: 40.505, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.100 --> 00:00:40.505\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports large timecodes', function() {
    verifyHelper(
        [
          {start: 20, end: 108000, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 30:00:00.000\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('requires header', function() {
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_HEADER,
                '',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_HEADER,
                '00:00:00.000 --> 00:00:00.020\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('rejects invalid time values', function() {
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00.020    --> 0:00.040\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n0:00.020  --> 0:00.040\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:00.20  --> 0:00.040\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:100.20 --> 0:00.040\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:00.020 --> 0:00.040\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:00:00:00.020 --> 0:00.040\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n00:61.020 --> 0:00.040\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
    errorHelper(shaka.util.Error.Code.INVALID_TEXT_CUE,
                'WEBVTT\n\n61:00.020 --> 0:00.040\nTest',
                { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports vertical setting', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test', vertical: 'rl'},
          {start: 40, end: 50, text: 'Test2', vertical: 'lr'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:rl\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 vertical:lr\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports line setting', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test', line: 0},
          {start: 40, end: 50, text: 'Test2', line: -1}
        ] ,
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:0\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports line setting with optional part', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test', line: 10},
          {start: 40, end: 50, text: 'Test2', line: -1}
        ] ,
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:10%,start\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1,center\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports position setting', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test2', position: 45}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 position:45%\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports position setting with optional part', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test', position: 45},
          {start: 20, end: 40, text: 'Test2', position: 45}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 position:45%,line-left\n' +
        'Test\n\n' +
        '00:00:20.000 --> 00:00:40.000 position:45%,start\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports size setting', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test', size: 56}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 size:56%\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports align setting', function() {
    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test', align: 'center'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:center\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports multiple settings', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            text: 'Test',
            align: 'center',
            size: 56,
            vertical: 'lr'
          }
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports timestamps with one-digit hour at start time', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            text: 'Test',
            align: 'center',
            size: 56,
            vertical: 'lr'
          }
        ],
        'WEBVTT\n\n' +
        '0:00:20.000 --> 00:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports timestamps with one-digit hour at end time', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            text: 'Test',
            align: 'center',
            size: 56,
            vertical: 'lr'
          }
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 0:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('supports stamps with one-digit hours at start & end time', function() {
    verifyHelper(
        [
          {
            start: 20,
            end: 40,
            text: 'Test',
            align: 'center',
            size: 56,
            vertical: 'lr'
          }
        ],
        'WEBVTT\n\n' +
        '0:00:20.000 --> 0:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });

  it('uses segment time', function() {
    verifyHelper(
        [
          {
            start: 40, // Note these are 20s off of the cue
            end: 60,   // because using relative timestamps
            text: 'Test',
            align: 'center',
            size: 56,
            vertical: 'lr'
          }
        ],
        'WEBVTT\n\n' +
        '0:00:20.000 --> 0:00:40.000 align:center size:56% vertical:lr\n' +
        'Test',
        { periodStart: 0, segmentStart: 20, segmentEnd: 0 });
  });

  it('ignores and logs invalid settings', function() {
    expect(logWarningSpy.calls.count()).toBe(0);

    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:es\n' +
        'Test\n\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });

    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical:\n' +
        'Test\n\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });

    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 vertical\n' +
        'Test\n\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });

    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:-3%\n' +
        'Test\n\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });

    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:45%%\n' +
        'Test\n\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });

    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:10\n' +
        'Test\n\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });

    verifyHelper(
        [
          {start: 20, end: 40, text: 'Test'}
        ],
        'WEBVTT\n\n' +
        '00:00:20.000 --> 00:00:40.000 align:foo\n' +
        'Test\n\n',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });

    expect(logWarningSpy.calls.count()).toBe(7);
  });

  it('respects X-TIMESTAMP-MAP header', function() {
    verifyHelper(
        [
          {start: 30, end: 50, text: 'Test'},
          {start: 50, end: 60, text: 'Test2'}
        ] ,
        // 900000 = 10 sec, so expect every timestamp to be 10
        // seconds ahead of what is specified.
        'WEBVTT\n' +
        'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000\n\n' +
        '00:00:20.000 --> 00:00:40.000 line:0\n' +
        'Test\n\n' +
        '00:00:40.000 --> 00:00:50.000 line:-1\n' +
        'Test2',
        { periodStart: 0, segmentStart: 0, segmentEnd: 0 });
  });


  /**
   * @param {!Array} cues
   * @param {string} text
   * @param {shakaExtern.TextParser.TimeContext} time
   */
  function verifyHelper(cues, text, time) {
    var data = shaka.util.StringUtils.toUTF8(text);

    var result = new shaka.media.VttTextParser().parseMedia(data, time);
    expect(result).toBeTruthy();
    expect(result.length).toBe(cues.length);
    for (var i = 0; i < cues.length; i++) {
      expect(result[i].startTime).toBe(cues[i].start);
      expect(result[i].endTime).toBe(cues[i].end);
      expect(result[i].text).toBe(cues[i].text);

      if (cues[i].id)
        expect(result[i].id).toBe(cues[i].id);
      if (cues[i].vertical)
        expect(result[i].vertical).toBe(cues[i].vertical);
      if (cues[i].line)
        expect(result[i].line).toBe(cues[i].line);
      if (cues[i].align)
        expect(result[i].align).toBe(cues[i].align);
      if (cues[i].size)
        expect(result[i].size).toBe(cues[i].size);
      if (cues[i].position)
        expect(result[i].position).toBe(cues[i].position);
    }
  }

  /**
   * @param {shaka.util.Error.Code} code
   * @param {string} text
   * @param {shakaExtern.TextParser.TimeContext} time
   */
  function errorHelper(code, text, time) {
    var error = new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.TEXT,
        code);
    var data = shaka.util.StringUtils.toUTF8(text);
    try {
      new shaka.media.VttTextParser().parseMedia(data, time);
      fail('Invalid WebVTT file supported');
    } catch (e) {
      shaka.test.Util.expectToEqualError(e, error);
    }
  }
});
