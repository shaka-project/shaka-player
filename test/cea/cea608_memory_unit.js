/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

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
    topLevelCue.line = 6.25;
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

  it('adds and emits a series of special characters from the buffer', () => {
    const startTime = 1;
    const endTime = 2;
    const expectedText = '½¿èôÇ©ë»ö{ß│';
    const charGroups = [
      {
        set: CharSet.SPECIAL_NORTH_AMERICAN,
        chars: [0x32, 0x33, 0x3a, 0x3e], // ½, ¿, è, ô
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
    topLevelCue.line = 6.25;
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
    topLevelCue.line = 6.25;
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
    // ...
    // So we expect that test\n\ntest is emitted
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.line = 37.5;
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
    topLevelCue.line = 6.25;
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
      topLevelCue.line = 31.25;
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
      topLevelCue.line = 31.25;
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
      topLevelCue.line = 31.25;
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
});
