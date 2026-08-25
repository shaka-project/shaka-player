/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:ignore testt

describe('Cea608Memory', () => {
  const CeaUtils = shaka.test.CeaUtils;

  const CharSet = shaka.cea.Cea608Memory.CharSet;

  /** @type {!shaka.cea.Cea608Memory} */
  let memory;

  /** @type {string} */
  const stream = 'CC1';

  beforeEach(() => {
    // Create a CC1 Memory: F1 + C1 -> CC1
    memory = new shaka.cea.Cea608Memory(/* fieldNum= */ 0, /* channelNum= */ 0);
  });

  it('adds and emits a series of basic characters from the buffer', () => {
    const text = 'test word';
    const startTime = 1;
    const endTime = 2;
    for (const c of text) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }
    const caption = memory.forceEmit(startTime, endTime);

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.line = 10;
    topLevelCue.lineInterpretation =
        shaka.text.Cue.lineInterpretation.PERCENTAGE;
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, text),
    ];

    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    expect(caption).toEqual(expectedCaption);
  });

  it('emits on the text stream (T1) when marked as a text buffer', () => {
    const text = 'test word';
    const startTime = 1;
    const endTime = 2;
    // A text-mode buffer surfaces captions on the text channel (T1) rather
    // than the captioning channel (CC1).
    memory.setTextMode(true);
    for (const c of text) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, c.charCodeAt(0));
    }
    const caption = memory.forceEmit(startTime, endTime);

    expect(caption).not.toBe(null);
    expect(caption.stream).toBe('T1');
  });

  it('adds and emits a series of special characters from the buffer', () => {
    const startTime = 1;
    const endTime = 2;
    const expectedText = '½¿ èôÇ©ë»ö{ß│';
    const charGroups = [
      {
        set: CharSet.SPECIAL_NORTH_AMERICAN,
        // Note TS is not at either end to avoid side effect of trim()
        chars: [0x32, 0x33, 0x39, 0x3a, 0x3e], // ½, ¿, TS, è, ô
      },

      {
        set: CharSet.SPANISH_FRENCH,
        chars: [0x32, 0x2b, 0x36, 0x3f], // Ç, ©, ë, »
      },

      {
        set: CharSet.PORTUGUESE_GERMAN,
        chars: [0x33, 0x29, 0x34, 0x37], // ö, {, ß, ¦
      },
    ];
    for (const group of charGroups) {
      for (const c of group.chars) {
        if (group.set === CharSet.SPANISH_FRENCH ||
            group.set === CharSet.PORTUGUESE_GERMAN) {
          // As per the CEA-608 spec, a char received from these extended sets
          // does a backspace over a preceding char. Thus, the spec mandates any
          // extended char to be preceded by a basic char, which serves as a
          // fallback for systems that can't decode the extended char.
          memory.addChar(
              CharSet.BASIC_NORTH_AMERICAN, 0x20);
        }
        memory.addChar(group.set, c);
      }
    }

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.line = 10;
    topLevelCue.lineInterpretation =
        shaka.text.Cue.lineInterpretation.PERCENTAGE;
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, expectedText),
    ];

    const expectedCaption= {
      stream,
      cue: topLevelCue,
    };

    const caption = memory.forceEmit(startTime, endTime);
    expect(caption).toEqual(expectedCaption);
  });

  it('assigns styling appropriately to caption', () => {
    const startTime = 1;
    const endTime = 2;
    const expectedText = 'test';

    memory.setUnderline(true);
    memory.setItalics(true);
    memory.setTextColor('red');
    for (const c of expectedText) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }

    memory.setUnderline(false);
    memory.setItalics(false);
    for (const c of expectedText) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.line = 10;
    topLevelCue.lineInterpretation =
        shaka.text.Cue.lineInterpretation.PERCENTAGE;
    topLevelCue.nestedCues = [
      CeaUtils.createStyledCue(startTime, endTime,
          expectedText, /* underline= */ true,
          /* italics= */ true, /* textColor= */ 'red',
          /* backgroundColor= */ shaka.cea.CeaUtils.DEFAULT_BG_COLOR),

      CeaUtils.createStyledCue(startTime, endTime,
          expectedText, /* underline= */ false,
          /* italics= */ false, /* textColor= */ 'red',
          /* backgroundColor= */ shaka.cea.CeaUtils.DEFAULT_BG_COLOR),
    ];

    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    const caption = memory.forceEmit(startTime, endTime);
    expect(caption).toEqual(expectedCaption);
  });

  it('marks flash-on (FON) runs with a static bold style', () => {
    const startTime = 1;
    const endTime = 2;
    const expectedText = 'test';

    // Flash-On marks subsequently added characters as flashing, which maps to
    // a static bold cue style (no animated blinking).
    memory.setFlash(true);
    for (const c of expectedText) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, c.charCodeAt(0));
    }

    // Turning flash off returns subsequent characters to the default style,
    // splitting them into their own nested cue.
    memory.setFlash(false);
    for (const c of expectedText) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, c.charCodeAt(0));
    }

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.line = 10;
    topLevelCue.lineInterpretation =
        shaka.text.Cue.lineInterpretation.PERCENTAGE;
    topLevelCue.nestedCues = [
      CeaUtils.createStyledCue(startTime, endTime,
          expectedText, /* underline= */ false, /* italics= */ false,
          /* textColor= */ shaka.cea.CeaUtils.DEFAULT_TXT_COLOR,
          /* backgroundColor= */ shaka.cea.CeaUtils.DEFAULT_BG_COLOR,
          /* flash= */ true),

      CeaUtils.createStyledCue(startTime, endTime,
          expectedText, /* underline= */ false, /* italics= */ false,
          /* textColor= */ shaka.cea.CeaUtils.DEFAULT_TXT_COLOR,
          /* backgroundColor= */ shaka.cea.CeaUtils.DEFAULT_BG_COLOR,
          /* flash= */ false),
    ];

    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    const caption = memory.forceEmit(startTime, endTime);
    expect(caption).toEqual(expectedCaption);
  });

  it('trims leading and trailing newlines', () => {
    const startTime = 1;
    const endTime = 2;
    const text = 'test';

    memory.setRow(memory.getRow()+1);
    for (const c of text) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }

    memory.setRow(memory.getRow()+1);
    memory.setRow(memory.getRow()+1);

    for (const c of text) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }

    memory.setRow(memory.getRow()+1);
    memory.setRow(memory.getRow()+1);

    // At this point, the memory looks like this:
    // [1]:
    // [2]: test
    // [3]:
    // [4]: test
    // So we expect that test\n\ntest is emitted
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    // Anchored to the first non-empty row (row 2), not the cursor row (6).
    topLevelCue.line = 15.33;
    topLevelCue.lineInterpretation =
        shaka.text.Cue.lineInterpretation.PERCENTAGE;
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, text),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, text),
    ];

    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    const caption = memory.forceEmit(startTime, endTime);
    expect(caption).toEqual(expectedCaption);
  });

  it('does not emit caption when all rows are empty', () => {
    const startTime = 1;
    const endTime = 2;
    memory.setRow(memory.getRow()+1);
    memory.setRow(memory.getRow()+1);
    memory.setRow(memory.getRow()+1);
    memory.forceEmit(startTime, endTime);

    // Nothing was added to the buffer, so nothing should be emitted.
    const caption = memory.forceEmit(startTime, endTime);
    expect(caption).toBe(null);
  });

  it('erases a character from the buffer', () => {
    const startTime = 1;
    const endTime = 2;
    const text = 'testt';
    const expectedText = 'test';
    for (const c of text) {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }
    memory.eraseChar(); // Erase the last 't' from 'testt'

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.line = 10;
    topLevelCue.lineInterpretation =
        shaka.text.Cue.lineInterpretation.PERCENTAGE;
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, expectedText),
    ];

    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    const caption = memory.forceEmit(startTime, endTime);
    expect(caption).toEqual(expectedCaption);
  });

  describe('tab-offset and indent positioning', () => {
    // A tab offset shifts the horizontal start position independent of the PAC
    // indent, and the position derives from whichever of indent/offset is set.
    const startTime = 1;
    const endTime = 2;

    beforeEach(() => {
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'a'.charCodeAt(0));
    });

    it('leaves position unset when neither indent nor offset set', () => {
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption.cue.position).toBe(null);
    });

    it('derives position from the offset alone', () => {
      // Offset 2 with no indent: 10 + (2 * 2.5) = 15.
      memory.setOffset(2);
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption.cue.position).toBe(15);
    });

    it('derives position from the indent alone', () => {
      // Indent 3 with no offset: 10 + min(70, 3 * 10) = 40.
      memory.setIndent(3);
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption.cue.position).toBe(40);
    });

    it('combines indent and offset when both are present', () => {
      // Indent 3 and offset 2: 10 + min(70, 30) + (2 * 2.5) = 45.
      memory.setIndent(3);
      memory.setOffset(2);
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption.cue.position).toBe(45);
    });

    it('clamps the indent contribution to 70', () => {
      // Indent 8 clamps to 70: 10 + min(70, 80) + (1 * 2.5) = 82.5.
      memory.setIndent(8);
      memory.setOffset(1);
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption.cue.position).toBe(82.5);
    });

    it('treats a cleared offset as not present', () => {
      memory.setOffset(2);
      memory.setOffset(null);
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption.cue.position).toBe(null);
    });

    it('clears the indent and tab offset on reset', () => {
      memory.setIndent(2);
      memory.setOffset(3);
      memory.reset();
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'b'.charCodeAt(0));
      const caption = memory.forceEmit(startTime, endTime);
      // The positioning state was cleared, so no position should be emitted.
      expect(caption.cue.position).toBe(null);
    });
  });

  describe('eraseBuffer', () => {
    it('erases the entire buffer', () => {
      const startTime = 1;
      const endTime = 2;
      const text = '0123456789abcde';

      // Add characters to the memory buffer.
      for (const c of text) {
        memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
            c.charCodeAt(0));
        memory.setRow(memory.getRow() + 1); // increment row
      }

      // Erase the entire memory buffer.
      memory.eraseBuffer();

      // Force out the memory buffer.
      const caption = memory.forceEmit(startTime, endTime);

      // Expect the forced out memory to be blank. We just cleared it.
      expect(caption).toBe(null);
    });
  });

  describe('moveRows', () => {
    it('moves a set number of rows to a new position in the buffer', () => {
      const startTime = 1;
      const endTime = 2;
      const text = 'test';

      // Add the text to the buffer, each character on separate rows.
      // At this point, the memory looks like:
      // [1]: t
      // [2]: e
      // [3]: s
      // [4]: t
      for (const c of text) {
        memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
            c.charCodeAt(0));
        memory.setRow(memory.getRow() + 1); // increment row
      }

      // Move first 2 rows down to 5th row, and then clear their old positions.
      // After these operations, the memory looks like:
      // [1]:
      // [2]:
      // [3]: s
      // [4]: t
      // [5]: t
      // [6]: e
      const srcRowIdx = 1;
      const dstRowIdx = 5;
      const rowsToMove = 2;
      memory.moveRows(dstRowIdx, srcRowIdx, rowsToMove);
      memory.resetRows(srcRowIdx, rowsToMove - 1);

      // Expected text is 's\nt\nt\ne'
      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      // Anchored to the first non-empty row (row 3).
      topLevelCue.line = 20.66;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, 's'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 't'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 't'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 'e'),
      ];

      const expectedCaption = {
        stream,
        cue: topLevelCue,
      };

      // Force out the new memory.
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption).toEqual(expectedCaption);
    });

    it('does not move rows if source row index is negative', () => {
      const startTime = 1;
      const endTime = 2;
      const text = 'test';

      // Add the text to the buffer, each character on separate rows.
      // At this point, the memory looks like:
      // [1]: t
      // [2]: e
      // [3]: s
      // [4]: t
      for (const c of text) {
        memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
            c.charCodeAt(0));
        memory.setRow(memory.getRow() + 1); // increment row
      }

      const srcRowIdx = -1;
      const dstRowIdx = 2;
      const rowsToMove = 3;
      memory.moveRows(dstRowIdx, srcRowIdx, rowsToMove);

      // Expected text is 't\ne\ns\nt'
      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      // The move is a no-op, so text stays on rows 1-4; anchored to row 1.
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, 't'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 'e'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 's'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 't'),
      ];

      const expectedCaption = {
        stream,
        cue: topLevelCue,
      };

      // Force out the new memory.
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption).toEqual(expectedCaption);
    });

    it('does not move rows if destination row index is negative', () => {
      const startTime = 1;
      const endTime = 2;
      const text = 'test';

      // Add the text to the buffer, each character on separate rows.
      // At this point, the memory looks like:
      // [1]: t
      // [2]: e
      // [3]: s
      // [4]: t
      for (const c of text) {
        memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
            c.charCodeAt(0));
        memory.setRow(memory.getRow() + 1); // increment row
      }

      const srcRowIdx = 1;
      const dstRowIdx = -2;
      const rowsToMove = 3;
      memory.moveRows(dstRowIdx, srcRowIdx, rowsToMove);

      // Expected text is 't\ne\ns\nt'
      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      // The move is a no-op, so text stays on rows 1-4; anchored to row 1.
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, 't'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 'e'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 's'),
        CeaUtils.createLineBreakCue(startTime, endTime),
        CeaUtils.createDefaultCue(startTime, endTime, 't'),
      ];

      const expectedCaption = {
        stream,
        cue: topLevelCue,
      };

      // Force out the new memory.
      const caption = memory.forceEmit(startTime, endTime);
      expect(caption).toEqual(expectedCaption);
    });
  });

  describe('eraseToEndOfRow (DER locality)', () => {
    // After DER, the active row is cleared; other rows and the cursor row are
    // unchanged.

    // Deterministic inline PRNG (mulberry32).
    const mulberry32 = (seed) => {
      let a = seed >>> 0;
      return () => {
        a |= 0;
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    const CC_ROWS = shaka.cea.Cea608Memory.CC_ROWS;

    // Printable ASCII letters/digits that map to themselves in the basic
    // North American char set, keeping generated content easy to reason about.
    const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789 ';

    /**
     * Builds a fresh memory and writes the given per-row content into it,
     * leaving the cursor on `activeRow`.
     * @param {!Map<number, string>} rowContent Map of row index -> text.
     * @param {number} activeRow
     * @return {!shaka.cea.Cea608Memory}
     */
    const buildMemory = (rowContent, activeRow) => {
      const mem =
          new shaka.cea.Cea608Memory(/* fieldNum= */ 0, /* channelNum= */ 0);
      // Iterate keys (rather than destructuring entries) because Closure types
      // a destructured Map entry tuple as Array<KEY|VALUE>, widening row/text.
      for (const row of rowContent.keys()) {
        mem.setRow(row);
        const text = rowContent.get(row) || '';
        for (const c of text) {
          mem.addChar(CharSet.BASIC_NORTH_AMERICAN, c.charCodeAt(0));
        }
      }
      mem.setRow(activeRow);
      return mem;
    };

    // A spread of fixed seeds so the suite is deterministic but covers a wide
    // range of generated buffer states.
    const seeds = [1, 7, 42, 99, 1337, 2024, 0xc0ffee, 123456];
    const iterationsPerSeed = 25;

    for (const seed of seeds) {
      it(`preserves locality for randomized states (seed ${seed})`, () => {
        const startTime = 1;
        const endTime = 2;
        const rand = mulberry32(seed);
        const randInt = (min, maxInclusive) =>
          min + Math.floor(rand() * (maxInclusive - min + 1));

        for (let iter = 0; iter < iterationsPerSeed; iter++) {
          // Randomly populate a subset of rows with random-length content.
          /** @type {!Map<number, string>} */
          const rowContent = new Map();
          for (let row = 1; row <= CC_ROWS; row++) {
            // ~60% chance a given row holds content.
            if (rand() < 0.6) {
              const len = randInt(1, 10);
              let text = '';
              for (let i = 0; i < len; i++) {
                text += ALPHABET[randInt(0, ALPHABET.length - 1)];
              }
              rowContent.set(row, text);
            }
          }

          // Pick a random active row (the DER cursor row).
          const activeRow = randInt(1, CC_ROWS);

          // Actual: build the state, then apply DER on the active row.
          const actual = buildMemory(rowContent, activeRow);
          const rowBefore = actual.getRow();
          actual.eraseToEndOfRow();

          // Cursor row must be unchanged by DER.
          expect(actual.getRow()).toBe(rowBefore);

          // Expected post-condition: identical buffer with the active row's
          // content removed; every other row untouched.
          /** @type {!Map<number, string>} */
          const expectedContent = new Map();
          for (const row of rowContent.keys()) {
            if (row !== activeRow) {
              expectedContent.set(row, rowContent.get(row) || '');
            }
          }
          const expected = buildMemory(expectedContent, activeRow);

          // The decoder-visible state is what forceEmit produces; equal output
          // means other rows are unchanged and the active row was cleared.
          const actualCaption = actual.forceEmit(startTime, endTime);
          const expectedCaption = expected.forceEmit(startTime, endTime);
          expect(actualCaption).toEqual(expectedCaption);
        }
      });
    }
  });

  describe('progressive reveal', () => {
    it('reveals characters at their decode times', () => {
      const startTime = 1;
      const endTime = 5;

      // Each character is decoded at a later time, as in paint-on / roll-up.
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'a'.charCodeAt(0), 2);
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'b'.charCodeAt(0), 3);
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'c'.charCodeAt(0), 3);
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'd'.charCodeAt(0), 4);

      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      // One nested cue per decode time, each ending at the cue's end time.
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(/* startTime= */ 2, endTime, 'a'),
        CeaUtils.createDefaultCue(/* startTime= */ 3, endTime, 'bc'),
        CeaUtils.createDefaultCue(/* startTime= */ 4, endTime, 'd'),
      ];

      const caption =
          memory.forceEmit(startTime, endTime, /* progressive= */ true);
      expect(caption).toEqual({stream, cue: topLevelCue});
    });

    it('reveals characters decoded at or before the start immediately', () => {
      const startTime = 3;
      const endTime = 5;

      // 'a' and 'b' were decoded at or before the cue start (e.g. a roll-up row
      // that scrolled up), so they should be revealed immediately; 'c' is new.
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'a'.charCodeAt(0), 1);
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'b'.charCodeAt(0), 3);
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'c'.charCodeAt(0), 4);

      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(/* startTime= */ 3, endTime, 'ab'),
        CeaUtils.createDefaultCue(/* startTime= */ 4, endTime, 'c'),
      ];

      const caption =
          memory.forceEmit(startTime, endTime, /* progressive= */ true);
      expect(caption).toEqual({stream, cue: topLevelCue});
    });

    it('ignores decode times when not progressive (e.g. pop-on)', () => {
      const startTime = 1;
      const endTime = 5;

      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'a'.charCodeAt(0), 2);
      memory.addChar(CharSet.BASIC_NORTH_AMERICAN, 'b'.charCodeAt(0), 3);

      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      // Without progressive mode, everything appears at once at the start time.
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, 'ab'),
      ];

      const caption = memory.forceEmit(startTime, endTime);
      expect(caption).toEqual({stream, cue: topLevelCue});
    });
  });
});
