/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Cea608Memory', () => {
  const ceaUtils = shaka.test.CeaUtils;

  const CharSet = shaka.cea.Cea608Memory.CharSet;

  /** @type {!shaka.cea.Cea608Memory} */
  let memory;

  /** @type {!string} */
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

    const expectedNestedCue = ceaUtils.createDefaultCue(
        startTime, endTime, text);

    const expectedNestedCues = [expectedNestedCue];

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.nestedCues = expectedNestedCues;

    const expectedCaption = {
      stream,
      cue: topLevelCue,
    };

    expect(caption).toEqual(expectedCaption);
  });

  it('adds and emits a series of special characters from the buffer', () => {
    const startTime = 1;
    const endTime = 2;
    const expectedText = '½¿èôÇ©ë»ö{ß¦';
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

    const expectedNestedCue = ceaUtils.createDefaultCue(
        startTime, endTime, expectedText);
    const expectedNestedCues = [expectedNestedCue];

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.nestedCues = expectedNestedCues;

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

    const nestedCue1 = ceaUtils.createStyledCue(startTime, endTime,
        expectedText, /* underline= */ true,
        /* italics= */ true, /* textColor= */ 'red',
        /* backgroundColor= */ shaka.cea.Cea608Memory.DEFAULT_BG_COLOR);

    const nestedCue2 = ceaUtils.createStyledCue(startTime, endTime,
        expectedText, /* underline= */ false,
        /* italics= */ false, /* textColor= */ 'red',
        /* backgroundColor= */ shaka.cea.Cea608Memory.DEFAULT_BG_COLOR);

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.nestedCues.push(nestedCue1, nestedCue2);

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

    const expectedNestedCue = ceaUtils.createDefaultCue(
        startTime, endTime, text);

    const expectedNestedCues = [
      expectedNestedCue,
      ceaUtils.createLineBreakCue(startTime, endTime),
      ceaUtils.createLineBreakCue(startTime, endTime),
      expectedNestedCue,
    ];

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.nestedCues = expectedNestedCues;

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
    memory.eraseChar();

    const expectedNestedCue = ceaUtils.createDefaultCue(
        startTime, endTime, expectedText);

    const expectedNestedCues = [
      expectedNestedCue,
    ];

    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    topLevelCue.nestedCues = expectedNestedCues;

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
      for (const c of text) {
        memory.addChar(CharSet.BASIC_NORTH_AMERICAN,
            c.charCodeAt(0));
        memory.setRow(memory.getRow() + 1); // increment row
      }

      // Move first 2 rows down to 5th row, and then clear their old positions.
      const srcRowIdx = 1;
      const dstRowIdx = 5;
      const rowsToMove = 2;
      memory.moveRows(dstRowIdx, srcRowIdx, rowsToMove);
      memory.resetRows(srcRowIdx, rowsToMove - 1);

      const expectedNestedCue1 = ceaUtils.createDefaultCue(
          startTime, endTime, 's');
      const expectedNestedCue2 = ceaUtils.createDefaultCue(
          startTime, endTime, 't');
      const expectedNestedCue3 = ceaUtils.createDefaultCue(
          startTime, endTime, 't');
      const expectedNestedCue4 = ceaUtils.createDefaultCue(
          startTime, endTime, 'e');

      // Expected text is 's\nt\nt\ne'
      const expectedNestedCues = [
        expectedNestedCue1,
        ceaUtils.createLineBreakCue(startTime, endTime),
        expectedNestedCue2,
        ceaUtils.createLineBreakCue(startTime, endTime),
        expectedNestedCue3,
        ceaUtils.createLineBreakCue(startTime, endTime),
        expectedNestedCue4,
      ];

      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
      topLevelCue.nestedCues = expectedNestedCues;

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
