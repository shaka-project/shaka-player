/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('Cea708Window', () => {
  const CeaUtils = shaka.test.CeaUtils;

  /** @type {!shaka.cea.Cea708Window} */
  let window;

  /** @type {number} */
  const serviceNumber = 1; // We will arbitrarily pick service 1 for all tests.

  /** @type {string} */
  const stream = `svc${serviceNumber}`;

  /** @type {number} */
  const rowCount = 10;

  /** @type {number} */
  const colCount = 32;

  /** @type {number} */
  const startTime = 1;

  /** @type {number} */
  const endTime = 2;

  beforeEach(() => {
    window = new shaka.cea.Cea708Window(/* windowNum= */ 0, serviceNumber);
    window.defineWindow(
        /* visible= */ true, /* verticalAnchor= */ 0,
        /* horAnchor= */ 0, /* anchorId= */ 0, /* relativeToggle= */ false,
        rowCount, colCount);
    window.setStartTime(startTime);
  });

  it('adds and emits a series of characters from the buffer', () => {
    const text = 'test word';
    for (const c of text) {
      window.setCharacter(c);
    }

    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, text),
    ];

    const caption = window.forceEmit(endTime, serviceNumber);
    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    expect(caption).toEqual(expectedCaption);
  });

  it('applies the window fill color to the emitted cue background', () => {
    const text = 'test word';
    window.setWindowFillColor('magenta');
    for (const c of text) {
      window.setCharacter(c);
    }

    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    // The fill color is applied to the top-level cue's background.
    topLevelCue.backgroundColor = 'magenta';
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, text),
    ];

    const caption = window.forceEmit(endTime, serviceNumber);
    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    expect(caption).toEqual(expectedCaption);
  });

  it('does not set a cue background when no fill color is applied', () => {
    const text = 'test word';
    for (const c of text) {
      window.setCharacter(c);
    }

    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    // No backgroundColor is set on the top-level cue (default empty).
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, text),
    ];

    const caption = window.forceEmit(endTime, serviceNumber);
    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    expect(caption).toEqual(expectedCaption);
  });

  describe('handles carriage returns', () => {
    it('handles a regular carriage return', () => {
      const text1 = 'test';
      const text2 = 'word';
      for (const c of text1) {
        window.setCharacter(c);
      }
      window.carriageReturn();
      for (const c of text2) {
        window.setCharacter(c);
      }

      const caption = window.forceEmit(endTime, serviceNumber);

      const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
          serviceNumber, 0, rowCount, colCount);
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text1),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, text2),
      ];

      const expectedCaption = {
        stream,
        cue: topLevelCue,
      };

      expect(caption).toEqual(expectedCaption);
    });

    it('handles a carriage return on the last row of the buffer', () => {
      const text1 = 'test';
      const text2 = 'word';

      // Set the pen location to the very last row in the buffer.
      window.setPenLocation(/* row= */ rowCount-1, /* col= */ 0);

      for (const c of text1) {
        window.setCharacter(c);
      }
      window.carriageReturn();
      for (const c of text2) {
        window.setCharacter(c);
      }

      const caption = window.forceEmit(endTime, serviceNumber);

      const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
          serviceNumber, 0, rowCount, colCount);
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text1),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, text2),
      ];

      const expectedCaption = {
        stream,
        cue: topLevelCue,
      };

      expect(caption).toEqual(expectedCaption);
    });

    it('handles a horizontal carriage return', () => {
      const text = 'test';

      for (const c of text) {
        window.setCharacter(c);
      }
      window.horizontalCarriageReturn();

      const caption = window.forceEmit(endTime, serviceNumber);

      // Nothing should have emitted, a horizontal carriage return wipes the row
      // and sets the column position to the beginning of the row.
      expect(caption).toBe(null);
    });
  });

  it('handles pen styling including colors, underlines, italics', () => {
    const text1 = 'style1';
    const text2 = 'style2';
    const text3 = 'style3';
    const textColor1 = 'red';
    const textColor2 = 'yellow';
    const backgroundColor1 = 'blue';
    const backgroundColor2 = 'magenta';
    // Set the pen to an underlined, italicized red color.
    window.setPenItalics(true);
    window.setPenUnderline(true);
    window.setPenTextColor('red');
    for (const c of text1) {
      window.setCharacter(c);
    }

    // Remove the underline and italics, and set the background color to blue.
    window.setPenItalics(false);
    window.setPenUnderline(false);
    window.setPenBackgroundColor('blue');
    for (const c of text2) {
      window.setCharacter(c);
    }

    // Turn underline on again, make the text yellow and background magenta.
    window.setPenUnderline(true);
    window.setPenTextColor('yellow');
    window.setPenBackgroundColor('magenta');
    for (const c of text3) {
      window.setCharacter(c);
    }

    // These three stylings should correspond to three nested cues.
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    topLevelCue.nestedCues = [
      CeaUtils.createStyledCue(startTime, endTime, text1, /* underline= */ true,
          /* italics= */ true, textColor1,
          shaka.cea.CeaUtils.DEFAULT_BG_COLOR),
      CeaUtils.createStyledCue(startTime, endTime, text2,
          /* underline= */ false, /* italics= */ false,
          textColor1, backgroundColor1),
      CeaUtils.createStyledCue(startTime, endTime, text3, /* underline= */ true,
          /* italics= */ false, textColor2, backgroundColor2),
    ];

    const caption = window.forceEmit(endTime, serviceNumber);
    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    expect(caption).toEqual(expectedCaption);
  });

  describe('handles justification of cues', () => {
    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    it('justifies the text left', () => {
      for (const c of text) {
        window.setCharacter(c);
      }

      // Left-justified.
      window.setJustification(shaka.cea.Cea708Window.TextJustification.LEFT);
      topLevelCue.textAlign = shaka.text.Cue.textAlign.LEFT;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text),
      ];
      const expectedCaption = {
        stream,
        cue: topLevelCue,
      };

      const caption = window.forceEmit(endTime, serviceNumber);
      expect(caption).toEqual(expectedCaption);
    });

    it('justifies the text right', () => {
      for (const c of text) {
        window.setCharacter(c);
      }

      // Right-justified.
      window.setJustification(shaka.cea.Cea708Window.TextJustification.RIGHT);
      topLevelCue.textAlign = shaka.text.Cue.textAlign.RIGHT;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text),
      ];
      const expectedCaption = {
        stream,
        cue: topLevelCue,
      };

      const caption = window.forceEmit(endTime, serviceNumber);
      expect(caption).toEqual(expectedCaption);
    });

    it('default justification should be centered', () => {
      for (const c of text) {
        window.setCharacter(c);
      }
      topLevelCue.textAlign = shaka.text.Cue.textAlign.CENTER;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text),
      ];
      const expectedCaption = {
        stream,
        cue: topLevelCue,
      };

      const caption = window.forceEmit(endTime, serviceNumber);
      expect(caption).toEqual(expectedCaption);
    });
  });

  it('resets the pen correctly', () => {
    const text1 = 'abcd';
    // cspell: disable-next-line
    const text2 = 'efgh';

    // Set some styles on the pen and add the first text to window.
    window.setPenUnderline(true);
    window.setPenBackgroundColor('blue');
    for (const c of text1) {
      window.setCharacter(c);
    }

    // Reset the pen and add the second text to window.
    window.resetPen();
    for (const c of text2) {
      window.setCharacter(c);
    }

    // The second text should have overwritten the first text,
    // and all the styles should have been cleared.
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, text2),
    ];
    const caption = window.forceEmit(endTime, serviceNumber);
    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };
    expect(caption).toEqual(expectedCaption);
  });

  it('handles the backspace command to backspace text correctly', () => {
    // cspell: disable-next-line
    const text = 'testt';
    const backspacedText = 'test';

    for (const c of text) {
      window.setCharacter(c);
    }
    window.backspace();

    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, backspacedText),
    ];
    const caption = window.forceEmit(endTime, serviceNumber);
    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };
    expect(caption).toEqual(expectedCaption);
  });

  it('correctly sets pen location', () => {
    const text1 = 'test';
    const text2 = 'word';
    const text3 = 'on new line';
    for (const c of text1) {
      window.setCharacter(c);
    }

    window.setPenLocation(/* row= */ 0, /* col= */ 6);
    for (const c of text2) {
      window.setCharacter(c);
    }

    window.setPenLocation(/* row= */ 3, /* col= */ 0);
    for (const c of text3) {
      window.setCharacter(c);
    }

    // There should be two spaces between the words on the first row,
    // and then the last row with text should appear 3 linebreaks later.
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, text1+'  '+text2),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, text3),
    ];
    const caption = window.forceEmit(endTime, serviceNumber);
    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };
    expect(caption).toEqual(expectedCaption);
  });

  it('cuts off text that exceeds the column size on a given row', () => {
    const text = '0123456789012345678901234567890123'; // this text is 34 chars.
    const trimmedText = text.substr(0, 32);
    for (const c of text) {
      window.setCharacter(c);
    }

    // Since column size is 32, the buffer should have only taken the first
    // 32 chars, and omitted the two extra ones at the end.
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, 0, rowCount, colCount);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, trimmedText),
    ];
    const caption = window.forceEmit(endTime, serviceNumber);
    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };
    expect(caption).toEqual(expectedCaption);
  });


  describe('pen-bounds safety', () => {
    // setCharacter writes a character only when the pen is within the
    // window's row and column counts; otherwise the window memory remains
    // unchanged (and nothing is emitted). The window is defined with rowCount
    // rows and colCount columns in beforeEach, so valid pen indices are
    // [0, rowCount) x [0, colCount).

    it('does not write a character when the pen row is out of bounds', () => {
      // Row == rowCount is one past the last valid row.
      window.setPenLocation(/* row= */ rowCount, /* col= */ 0);
      window.setCharacter('x');

      // Memory is unchanged, so nothing is emitted.
      expect(window.forceEmit(endTime, serviceNumber)).toBeNull();
    });

    it('does not write a character when the pen column is out of bounds',
        () => {
          // Col == colCount is one past the last valid column.
          window.setPenLocation(/* row= */ 0, /* col= */ colCount);
          window.setCharacter('x');

          expect(window.forceEmit(endTime, serviceNumber)).toBeNull();
        });

    it('does not write a character when the pen location is negative', () => {
      window.setPenLocation(/* row= */ -1, /* col= */ 0);
      window.setCharacter('x');
      expect(window.forceEmit(endTime, serviceNumber)).toBeNull();

      window.setPenLocation(/* row= */ 0, /* col= */ -1);
      window.setCharacter('y');
      expect(window.forceEmit(endTime, serviceNumber)).toBeNull();
    });

    it('leaves existing window memory unchanged for an out-of-bounds write',
        () => {
          const text = 'test';
          for (const c of text) {
            window.setCharacter(c);
          }

          // Move the pen out of bounds and attempt to write. This must not add
          // to or corrupt the existing memory.
          window.setPenLocation(/* row= */ rowCount, /* col= */ 0);
          window.setCharacter('X');

          const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
              serviceNumber, 0, rowCount, colCount);
          topLevelCue.nestedCues = [
            CeaUtils.createDefaultCue(startTime, endTime, text),
          ];

          const caption = window.forceEmit(endTime, serviceNumber);
          expect(caption).toEqual({stream, cue: topLevelCue});
        });

    it('writes a character at the last in-bounds pen location', () => {
      // The last valid row is rowCount - 1; leading empty rows are trimmed by
      // the emitter, so the single character appears with no line breaks.
      const text = 'hi';
      window.setPenLocation(/* row= */ rowCount - 1, /* col= */ 0);
      for (const c of text) {
        window.setCharacter(c);
      }

      const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
          serviceNumber, 0, rowCount, colCount);
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text),
      ];

      const caption = window.forceEmit(endTime, serviceNumber);
      expect(caption).toEqual({stream, cue: topLevelCue});
    });

    // setCharacter writes only when the pen is within rowCount/colCount;
    // an out-of-bounds write leaves the window memory unchanged.

    /**
     * A small, deterministic PRNG (mulberry32). Given the same seed it always
     * produces the same sequence, which keeps this property test reproducible.
     * @param {number} seed
     * @return {function(): number} Returns floats in [0, 1).
     */
    const mulberry32 = (seed) => {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    /**
     * Draws a random integer in [0, maxInclusive] from the given PRNG.
     * @param {function(): number} rng
     * @param {number} maxInclusive
     * @return {number}
     */
    const randInt = (rng, maxInclusive) =>
      Math.floor(rng() * (maxInclusive + 1));

    /**
     * Draws a random integer in [min, max] (both inclusive) from the PRNG.
     * @param {function(): number} rng
     * @param {number} min
     * @param {number} max
     * @return {number}
     */
    const randIntRange = (rng, min, max) =>
      min + Math.floor(rng() * (max - min + 1));

    // A small alphabet of printable characters used for the random writes.
    const alphabet = 'abcXYZ0189';

    /**
     * Builds a fresh window matching the beforeEach geometry (rowCount rows,
     * colCount columns) so the "new window" pen-bounds semantics apply.
     * @return {!shaka.cea.Cea708Window}
     */
    const makeWindow = () => {
      const w = new shaka.cea.Cea708Window(/* windowNum= */ 0, serviceNumber);
      w.defineWindow(
          /* visible= */ true, /* verticalAnchor= */ 0, /* horAnchor= */ 0,
          /* anchorId= */ 0, /* relativeToggle= */ false, rowCount, colCount);
      w.setStartTime(startTime);
      return w;
    };

    it('out-of-bounds writes never change the emitted memory', () => {
      // A spread of fixed seeds keeps the test deterministic while exercising
      // many randomly chosen (row, col, char) operation sequences.
      const seeds = [
        0x00000001, 0x00c0ffee, 0x0badf00d, 0x00012345,
        0x00abcdef, 0x9e3779b9, 0x2545f491, 0xdeadbeef,
      ];
      const iterationsPerSeed = 30;

      for (const seed of seeds) {
        const rng = mulberry32(seed);
        for (let i = 0; i < iterationsPerSeed; i++) {
          // Generate a sequence of writes. Each location ranges from one past
          // the negative edge to one past the positive edge, so roughly the
          // outer values are out of bounds and the rest are valid.
          const opCount = randIntRange(rng, 1, 20);
          const ops = [];
          for (let k = 0; k < opCount; k++) {
            ops.push({
              row: randIntRange(rng, -2, rowCount + 1),
              col: randIntRange(rng, -2, colCount + 1),
              char: alphabet[randInt(rng, alphabet.length - 1)],
            });
          }

          // The "full" window applies every op. Out-of-bounds ops must be
          // no-ops, so its emitted memory must match the baseline below.
          const full = makeWindow();
          for (const op of ops) {
            full.setPenLocation(op.row, op.col);
            full.setCharacter(op.char);
          }

          // The baseline window applies only the in-bounds ops. Because every
          // op explicitly sets the pen location before writing, dropping the
          // out-of-bounds ops is equivalent to writing nothing for them.
          const baseline = makeWindow();
          for (const op of ops) {
            const inBounds = op.row >= 0 && op.row < rowCount &&
                op.col >= 0 && op.col < colCount;
            if (inBounds) {
              baseline.setPenLocation(op.row, op.col);
              baseline.setCharacter(op.char);
            }
          }

          // The out-of-bounds writes left the memory unchanged: the full
          // sequence emits exactly what the in-bounds-only sequence emits.
          expect(full.forceEmit(endTime, serviceNumber))
              .toEqual(baseline.forceEmit(endTime, serviceNumber));
        }
      }
    });
  });

  it('correctly handles display(), hide(), and toggle() commands', () => {
    window.display(); // The window should be visible.
    expect(window.isVisible()).toBe(true);

    window.hide(); // The window should be hidden.
    expect(window.isVisible()).toBe(false);

    window.toggle(); // The window was hidden, but is now toggled to visible.
    expect(window.isVisible()).toBe(true);
  });

  describe('correctly handles the window anchors', () => {
    it('handles bottom of video window anchors', () => {
      window = new shaka.cea.Cea708Window(/* windowNum= */ 0,
          /* serviceNumber= */ 1);
      window.defineWindow(
          /* visible= */ true, /* verticalAnchor= */ 99,
          /* horAnchor= */ 50, /* anchorId= */ 7, /* relativeToggle= */ true,
          rowCount, colCount);
      window.setStartTime(startTime);

      const text = 'test word';
      for (const c of text) {
        window.setCharacter(c);
      }

      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text),
      ];

      const caption = window.forceEmit(endTime, serviceNumber);

      const region = new shaka.text.CueRegion();
      region.id = 'svc1win0';
      region.height = rowCount;
      region.width = colCount;
      region.heightUnits = shaka.text.CueRegion.units.LINES;
      region.widthUnits = shaka.text.CueRegion.units.LINES;
      region.viewportAnchorX = 50;
      region.viewportAnchorY = 99;
      region.regionAnchorX = 50;
      region.regionAnchorY = 100;
      region.viewportAnchorUnits = shaka.text.CueRegion.units.PERCENTAGE;

      expect(caption.cue.region).toEqual(region);
    });

    it('handles top of video window anchors', () => {
      window = new shaka.cea.Cea708Window(/* windowNum= */ 0,
          /* serviceNumber= */ 2);
      window.defineWindow(
          /* visible= */ true, /* verticalAnchor= */ 0,
          /* horAnchor= */ 50, /* anchorId= */ 1, /* relativeToggle= */ true,
          rowCount, colCount);
      window.setStartTime(startTime);

      const text = 'test word';
      for (const c of text) {
        window.setCharacter(c);
      }

      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text),
      ];

      const caption = window.forceEmit(endTime, serviceNumber);

      const region = new shaka.text.CueRegion();
      region.id = 'svc2win0';
      region.height = rowCount;
      region.width = colCount;
      region.heightUnits = shaka.text.CueRegion.units.LINES;
      region.widthUnits = shaka.text.CueRegion.units.LINES;
      region.viewportAnchorX = 50;
      region.viewportAnchorY = 0;
      region.regionAnchorX = 50;
      region.regionAnchorY = 0;
      region.viewportAnchorUnits = shaka.text.CueRegion.units.PERCENTAGE;

      expect(caption.cue.region).toEqual(region);
    });

    it('handles bottom right of video window anchors using line values', () => {
      window = new shaka.cea.Cea708Window(/* windowNum= */ 0,
          /* serviceNumber= */ 3);
      window.defineWindow(
          /* visible= */ true, /* verticalAnchor= */ 74,
          /* horAnchor= */ 209, /* anchorId= */ 8, /* relativeToggle= */ false,
          rowCount, colCount);
      window.setStartTime(startTime);

      const text = 'test word';
      for (const c of text) {
        window.setCharacter(c);
      }

      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, text),
      ];

      const caption = window.forceEmit(endTime, serviceNumber);

      const region = new shaka.text.CueRegion();
      region.id = 'svc3win0';
      region.height = rowCount;
      region.width = colCount;
      region.heightUnits = shaka.text.CueRegion.units.LINES;
      region.widthUnits = shaka.text.CueRegion.units.LINES;
      region.viewportAnchorX = 209;
      region.viewportAnchorY = 74;
      region.regionAnchorX = 100;
      region.regionAnchorY = 100;
      region.viewportAnchorUnits = shaka.text.CueRegion.units.LINES;

      expect(caption.cue.region).toEqual(region);
    });
  });
});

