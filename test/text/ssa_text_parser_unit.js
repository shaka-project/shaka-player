/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.text.Cue');
goog.require('shaka.text.SsaTextParser');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.StringUtils');

describe('SsaTextParser', () => {
  const Cue = shaka.text.Cue;

  it('supports no cues', () => {
    verifyHelper([],
        '',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('handles a blank line at the start of the file', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '\n\n' +
        '[Script Info]\n' +
        'Title: Foo\n\n' +
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,0,0,0,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('handles a blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '[Script Info]\n' +
        'Title: Foo\n\n' +
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,0,0,0,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test' +
        '\n\n',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('handles no blank line at the end of the file', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '[Script Info]\n' +
        'Title: Foo\n\n' +
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,0,0,0,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports no styles', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '[Script Info]\n' +
        'Title: Foo\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('support no script info', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,0,0,0,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports only events', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
        ],
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports text with commas', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test,1,Test2'},
        ],
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test,1,Test2',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports multiple cues', () => {
    verifyHelper(
        [
          {startTime: 0, endTime: 2, payload: 'Test'},
          {startTime: 4.5, endTime: 6.1, payload: 'Test2'},
          {startTime: 8.01, endTime: 10.1, payload: 'Test3'},
        ],
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test\n' +
        'Dialogue: 0,0:00:04.50,0:00:06.10,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test2\n' +
        'Dialogue: 0,0:00:08.01,0:00:10.10,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test3',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0});
  });

  it('supports fontFamily style', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 2,
            payload: 'Test',
            fontFamily: 'Arial',
          },
        ],
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,0,0,0,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports bold style', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 2,
            payload: 'Test',
            fontWeight: Cue.fontWeight.BOLD,
          },
        ],
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,1,0,0,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports italic style', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 2,
            payload: 'Test',
            fontStyle: Cue.fontStyle.ITALIC,
          },
        ],
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,0,1,0,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports underline style', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 2,
            payload: 'Test',
            textDecoration: [Cue.textDecoration.UNDERLINE],
          },
        ],
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,0,0,1,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports letterSpacing style', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 2,
            payload: 'Test',
            letterSpacing: '2px',
          },
        ],
        '[V4+ Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
        'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
        'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
        'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
        '&H80000008,-1,0,0,0,100,100,2,0.00,1,1.00,2.00,2,30,30,30,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
  });

  it('supports V4 style', () => {
    verifyHelper(
        [
          {
            startTime: 0,
            endTime: 2,
            payload: 'Test',
            fontFamily: 'Arial',
          },
        ],
        '[V4 Styles]\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
        'TertiaryColour, BackColour, Bold, Italic, BorderStyle, Outline, ' +
        'Shadow, Alignment, MarginL, MarginR, MarginV, AlphaLevel, '+
        'Encoding\n' +
        'Style: DefaultVCD, Arial,28,11861244,11861244,11861244,' +
        '-2147483640,-1,0,1,1,2,2,30,30,30,0,0\n\n' +
        '[Events]\n' +
        'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
        'Effect, Text\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test',
        {periodStart: 0, segmentStart: 0, segmentEnd: 0,
        });
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

    const parser = new shaka.text.SsaTextParser();
    const result = parser.parseMedia(data, time);

    const expected = cues.map((cue) => {
      if (cue.nestedCues) {
        cue.nestedCues = cue.nestedCues.map(
            (nestedCue) => jasmine.objectContaining(nestedCue)
        );
      }
      return jasmine.objectContaining(cue);
    });
    expect(result).toEqual(expected);
  }
});
