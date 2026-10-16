/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SsaTextParser', () => {
  const Cue = shaka.text.Cue;

  const time = {
    periodStart: 0,
    segmentStart: 0,
    segmentEnd: 0,
    vttOffset: 0,
    isMpegTs: false,
  };

  const v4PlusStyles =
      '[V4+ Styles]\n' +
      'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, ' +
      'OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ' +
      'ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, ' +
      'Alignment, MarginL, MarginR, MarginV, Encoding\n' +
      'Style: DefaultVCD, Arial,28,&H00B4FCFC,&H00B4FCFC,&H00000008,' +
      '&H80000008,-1,0,0,0,100,100,0.00,0.00,1,1.00,2.00,2,30,30,30,0\n\n';

  const eventsFormat =
      '[Events]\n' +
      'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, ' +
      'Effect, Text\n';

  /**
   * @param {string} text
   * @return {!Array<!shaka.text.Cue>}
   */
  const parse = (text) => {
    const data = shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(text));
    return new shaka.text.SsaTextParser().parseMedia(data, time, null, []);
  };

  /**
   * @param {string} style The Style line.
   * @param {string=} alignmentSection The name of the section of the styles.
   * @return {!shaka.text.Cue} The cue of an event that uses the style.
   */
  const parseWithStyle = (style, alignmentSection = 'V4+ Styles') => {
    const cues = parse(
        '[' + alignmentSection + ']\n' +
        'Format: Name, Fontname, Fontsize, PrimaryColour, BackColour, Bold, ' +
        'Italic, Underline, Spacing, Alignment, AlphaLevel\n' +
        style + '\n\n' +
        eventsFormat +
        'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,Test');
    expect(cues.length).toBe(1);
    return cues[0];
  };

  it('supports no cues', () => {
    expect(parse('')).toEqual([]);
  });

  it('reads the times and the text of an event', () => {
    const cues = parse(v4PlusStyles + eventsFormat +
        'Dialogue: 0,0:00:01.50,0:01:02.25,DefaultVCD,NTP,0000,0000,0000' +
        ',,Test');
    expect(cues.length).toBe(1);
    expect(cues[0].startTime).toBeCloseTo(1.5, 6);
    expect(cues[0].endTime).toBeCloseTo(62.25, 6);
    expect(cues[0].payload).toBe('Test');
  });

  it('handles a blank line at the start of the file', () => {
    const cues = parse('\n\n[Script Info]\nTitle: Foo\n\n' + v4PlusStyles +
        eventsFormat +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD, NTP,0000,0000,0000' +
        ',,{\\pos(400,570)}Test');
    expect(cues.length).toBe(1);
    expect(cues[0].payload).toBe('Test');
  });

  it('handles blank lines at the end of the file', () => {
    const cues = parse(v4PlusStyles + eventsFormat +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD,,0,0,0,,Test\n\n\n');
    expect(cues.length).toBe(1);
  });

  it('handles Windows line ends', () => {
    const cues = parse((v4PlusStyles + eventsFormat +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD,,0,0,0,,Test')
        .replace(/\n/g, '\r\n'));
    expect(cues.length).toBe(1);
    expect(cues[0].payload).toBe('Test');
  });

  it('supports no styles', () => {
    const cues = parse(eventsFormat +
        'Dialogue: 0,0:00:00.00,0:00:02.00,DefaultVCD,,0,0,0,,Test');
    expect(cues.length).toBe(1);
    expect(cues[0].fontFamily).toBe('');
  });

  it('supports a file with only events', () => {
    expect(parse(eventsFormat +
        'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,Test').length).toBe(1);
  });

  it('keeps the commas of the text', () => {
    const cues = parse(eventsFormat +
        'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,One, two , three');
    expect(cues[0].payload).toBe('One, two , three');
  });

  it('follows the columns that the Format line gives', () => {
    const cues = parse('[Events]\n' +
        'Format: Marked, Start, End, Style, Text\n' +
        'Dialogue: Marked=0,0:00:01.00,0:00:02.00,S,Hi');
    expect(cues.length).toBe(1);
    expect(cues[0].startTime).toBeCloseTo(1, 6);
    expect(cues[0].payload).toBe('Hi');
  });

  it('skips comments and other kinds of lines', () => {
    const cues = parse(eventsFormat +
        '; a comment\n' +
        'Comment: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,Not shown\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,Shown');
    expect(cues.map((cue) => cue.payload)).toEqual(['Shown']);
  });

  it('skips events with times that cannot be read', () => {
    const cues = parse(eventsFormat +
        'Dialogue: 0,soon,later,S,,0,0,0,,Bad\n' +
        'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,Good');
    expect(cues.map((cue) => cue.payload)).toEqual(['Good']);
  });

  it('reads times with one, two or three decimals', () => {
    const cues = parse(eventsFormat +
        'Dialogue: 0,0:00:01.1,0:00:02.18,S,,0,0,0,,A\n' +
        'Dialogue: 0,0:00:03.180,0:00:04,S,,0,0,0,,B');
    expect(cues[0].startTime).toBeCloseTo(1.1, 6);
    expect(cues[0].endTime).toBeCloseTo(2.18, 6);
    expect(cues[1].startTime).toBeCloseTo(3.18, 6);
    expect(cues[1].endTime).toBe(4);
  });

  describe('text', () => {
    /**
     * @param {string} text
     * @return {string}
     */
    const payloadOf = (text) => {
      return parse(eventsFormat +
          'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,' + text)[0].payload;
    };

    it('drops the override tags', () => {
      expect(payloadOf('{\\pos(400,570)}Test')).toBe('Test');
      expect(payloadOf('A{\\i1}B{\\i0}C')).toBe('ABC');
    });

    it('makes a line break of \\N', () => {
      expect(payloadOf('One\\NTwo')).toBe('One\nTwo');
    });

    it('makes a space of the soft line break and of \\h', () => {
      expect(payloadOf('One\\nTwo')).toBe('One Two');
      expect(payloadOf('One\\hTwo')).toBe('One Two');
    });

    it('skips an event that has no text to show', () => {
      const cues = parse(eventsFormat +
          'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,{\\an8}');
      expect(cues).toEqual([]);
    });

    it('skips an event that draws a shape', () => {
      const cues = parse(eventsFormat +
          'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,' +
          '{\\p1}m 0 0 l 100 0 100 100{\\p0}');
      expect(cues).toEqual([]);
    });

    it('does not take a tag that only starts with p for a drawing', () => {
      expect(payloadOf('{\\pos(1,2)}Shown')).toBe('Shown');
    });
  });

  describe('styles', () => {
    it('gives the font, size and colors', () => {
      const cue = parseWithStyle(
          'Style: S,Arial,28,&H00B4FCFC,&H80000008,0,0,0,0.5,2,1');
      expect(cue.fontFamily).toBe('Arial');
      expect(cue.fontSize).toBe('28px');
      // BGR, so the red and the blue trade places.
      expect(cue.color).toBe('rgba(252,252,180,1)');
      // The alpha is the other way around: 0x80 is half.
      expect(cue.backgroundColor).toMatch(/^rgba\(8,0,0,0\.49/);
      expect(cue.letterSpacing).toBe('0.5px');
    });

    it('reads a color in decimal', () => {
      const cue = parseWithStyle(
          'Style: S,Arial,28,11861244,-2147483640,0,0,0,0,2,1', 'V4 Styles');
      expect(cue.color).toBe('rgba(252,252,180,1)');
    });

    it('sets bold, italic and underline only when the flag is set', () => {
      const set = parseWithStyle('Style: S,Arial,28,&H0,&H0,-1,-1,-1,0,2,1');
      expect(set.fontWeight).toBe(Cue.fontWeight.BOLD);
      expect(set.fontStyle).toBe(Cue.fontStyle.ITALIC);
      expect(set.textDecoration).toEqual([Cue.textDecoration.UNDERLINE]);

      // 0 is not set.
      const unset = parseWithStyle('Style: S,Arial,28,&H0,&H0,0,0,0,0,2,1');
      expect(unset.fontWeight).toBe(Cue.fontWeight.NORMAL);
      expect(unset.fontStyle).toBe(Cue.fontStyle.NORMAL);
      expect(unset.textDecoration).toEqual([]);
    });

    it('reads the opacity', () => {
      const cue = parseWithStyle('Style: S,Arial,28,&H0,&H0,0,0,0,0,2,0.5');
      expect(cue.opacity).toBe(0.5);
    });

    it('uses the style that the event names', () => {
      const cues = parse(
          '[V4+ Styles]\n' +
          'Format: Name, Fontname\n' +
          'Style: One,Arial\n' +
          'Style: Two,Verdana\n\n' +
          eventsFormat +
          'Dialogue: 0,0:00:00.00,0:00:02.00,Two,,0,0,0,,A\n' +
          'Dialogue: 0,0:00:00.00,0:00:02.00,Missing,,0,0,0,,B');
      expect(cues[0].fontFamily).toBe('Verdana');
      expect(cues[1].fontFamily).toBe('');
    });

    it('reads the styles that come after the events', () => {
      const cues = parse(eventsFormat +
          'Dialogue: 0,0:00:00.00,0:00:02.00,S,,0,0,0,,A\n\n' +
          '[V4+ Styles]\nFormat: Name, Fontname\nStyle: S,Arial');
      expect(cues[0].fontFamily).toBe('Arial');
    });

    describe('alignment of ASS', () => {
      // The numbers are the keys of a numeric keypad.
      const cases = [
        [1, Cue.displayAlign.AFTER, Cue.textAlign.START],
        [2, Cue.displayAlign.AFTER, Cue.textAlign.CENTER],
        [3, Cue.displayAlign.AFTER, Cue.textAlign.END],
        [4, Cue.displayAlign.CENTER, Cue.textAlign.START],
        [5, Cue.displayAlign.CENTER, Cue.textAlign.CENTER],
        [6, Cue.displayAlign.CENTER, Cue.textAlign.END],
        [7, Cue.displayAlign.BEFORE, Cue.textAlign.START],
        [8, Cue.displayAlign.BEFORE, Cue.textAlign.CENTER],
        [9, Cue.displayAlign.BEFORE, Cue.textAlign.END],
      ];
      for (const [number, displayAlign, textAlign] of cases) {
        it('is ' + displayAlign + ' and ' + textAlign + ' for ' + number,
            () => {
              const cue = parseWithStyle(
                  'Style: S,Arial,28,&H0,&H0,0,0,0,0,' + number + ',1');
              expect(cue.displayAlign).toBe(displayAlign);
              expect(cue.textAlign).toBe(textAlign);
            });
      }
    });

    describe('alignment of SSA', () => {
      // 1 to 3 at the bottom, 5 to 7 at the top, 9 to 11 in the middle.
      const cases = [
        [1, Cue.displayAlign.AFTER, Cue.textAlign.START],
        [2, Cue.displayAlign.AFTER, Cue.textAlign.CENTER],
        [3, Cue.displayAlign.AFTER, Cue.textAlign.END],
        [5, Cue.displayAlign.BEFORE, Cue.textAlign.START],
        [6, Cue.displayAlign.BEFORE, Cue.textAlign.CENTER],
        [7, Cue.displayAlign.BEFORE, Cue.textAlign.END],
        [9, Cue.displayAlign.CENTER, Cue.textAlign.START],
        [10, Cue.displayAlign.CENTER, Cue.textAlign.CENTER],
        [11, Cue.displayAlign.CENTER, Cue.textAlign.END],
      ];
      for (const [number, displayAlign, textAlign] of cases) {
        it('is ' + displayAlign + ' and ' + textAlign + ' for ' + number,
            () => {
              const cue = parseWithStyle(
                  'Style: S,Arial,28,&H0,&H0,0,0,0,0,' + number + ',1',
                  'V4 Styles');
              expect(cue.displayAlign).toBe(displayAlign);
              expect(cue.textAlign).toBe(textAlign);
            });
      }
    });

    it('leaves the alignment alone when it is not one', () => {
      const cue = parseWithStyle('Style: S,Arial,28,&H0,&H0,0,0,0,0,42,1');
      expect(cue.displayAlign).toBe(new Cue(0, 0, '').displayAlign);
    });
  });
});
