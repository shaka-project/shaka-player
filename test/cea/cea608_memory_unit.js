/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Cea608Memory', () => {
  /** @type {!shaka.cea.Cea608Memory} */
  let memory;

  /** @type {!string} */
  const stream = 'CC1';

  // Returns a closed caption with one nested cue, containing default styles.
  const createDefaultClosedCaption = (startTime, endTime, payload) => {
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
    const nestedCue = new shaka.text.Cue(startTime, endTime, payload);
    nestedCue.color = 'white'; // Default text color.
    nestedCue.backgroundColor = 'black'; // Default background color.
    topLevelCue.nestedCues.push(nestedCue);

    return {
      stream,
      cue: topLevelCue,
    };
  };

  beforeEach(() => {
    memory = new shaka.cea.Cea608Memory(new shaka.cea.AtscDecoder(),
        0, 0 // F1 + C1 -> CC1
    );
  });

  it('adds and emits a series of basic characters from the buffer', () => {
    const text = 'test word';
    const t1 = 1;
    const t2 = 2;
    for (const c of text) {
      memory.addChar(shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }
    memory.forceEmit(t1, t2);
    const cues = memory.decoder_.getParsedClosedCaptions();
    const expectedCaptions = [createDefaultClosedCaption(t1, t2, text)];
    expect(cues).toEqual(expectedCaptions);
  });

  it('adds and emits a series of special characters from the buffer', () => {
    const t1 = 1;
    const t2 = 2;
    const expectedText = '½¿èôÇ©ë»ö{ß¦';
    const charGroups = [
      {
        set: shaka.cea.Cea608Memory.CharSet.SPECIAL_NORTH_AMERICAN,
        chars: [0x32, 0x33, 0x3a, 0x3e], // ½, ¿, è, ô
      },

      {
        set: shaka.cea.Cea608Memory.CharSet.SPANISH_FRENCH,
        chars: [0x32, 0x2b, 0x36, 0x3f], // Ç, ©, ë, »
      },

      {
        set: shaka.cea.Cea608Memory.CharSet.PORTUGUESE_GERMAN,
        chars: [0x33, 0x29, 0x34, 0x37], // ö, {, ß, ¦
      },
    ];
    for (const group of charGroups) {
      for (const c of group.chars) {
        if (group.set === shaka.cea.Cea608Memory.CharSet.SPANISH_FRENCH ||
            group.set === shaka.cea.Cea608Memory.CharSet.PORTUGUESE_GERMAN) {
          // Add basic char, since this group does backspace on preceding chars.
          memory.addChar(
              shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN, 0x20);
        }
        memory.addChar(group.set, c);
      }
    }
    memory.forceEmit(t1, t2);
    const expectedCaptions = [createDefaultClosedCaption(t1, t2, expectedText)];
    const cues = memory.decoder_.getParsedClosedCaptions();
    expect(cues).toEqual(expectedCaptions);
  });

  it('assigns styling appropriately to cues', () => {
    const t1 = 1;
    const t2 = 2;
    const expectedText = 'test';

    memory.setUnderline(true);
    memory.setItalics(true);
    memory.setTextColor('red');
    for (const c of expectedText) {
      memory.addChar(shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }

    memory.setUnderline(false);
    memory.setItalics(false);
    for (const c of expectedText) {
      memory.addChar(shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }

    memory.forceEmit(t1, t2);
    const captions = memory.decoder_.getParsedClosedCaptions();
    const topLevelCue = captions[0].cue;

    expect(topLevelCue).toBeDefined();
    expect(topLevelCue.nestedCues[0].payload).toEqual(expectedText);
    expect(topLevelCue.nestedCues.length).toEqual(2);
    expect(topLevelCue.nestedCues[0].color).toEqual('red');
    expect(topLevelCue.nestedCues[0].textDecoration).toEqual(
        [shaka.text.Cue.textDecoration.UNDERLINE]);
    expect(topLevelCue.nestedCues[0].fontStyle).toEqual(
        shaka.text.Cue.fontStyle.ITALIC);

    expect(topLevelCue.nestedCues[1].payload).toEqual(expectedText);
    expect(topLevelCue.nestedCues[1].color).toEqual('red');
    expect(topLevelCue.nestedCues[1].textDecoration).toEqual([]);
    expect(topLevelCue.nestedCues[1].fontStyle).toEqual(
        shaka.text.Cue.fontStyle.NORMAL);
  });

  it('emits new lines between non-empty cues, but not otherwise', () => {
    const t1 = 1;
    const t2 = 2;
    const text = 'test';
    const expectedText = 'test\n\ntest';
    memory.setRow(memory.getRow()+1);
    for (const c of text) {
      memory.addChar(shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }

    memory.setRow(memory.getRow()+1);
    memory.setRow(memory.getRow()+1);

    for (const c of text) {
      memory.addChar(shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }

    memory.setRow(memory.getRow()+1);
    memory.setRow(memory.getRow()+1);
    memory.forceEmit(t1, t2);

    const expectedCaptions = [createDefaultClosedCaption(t1, t2, expectedText)];
    const captions = memory.decoder_.getParsedClosedCaptions();
    expect(captions).toEqual(expectedCaptions);
  });

  it('emits no nested cues when there\'s no non-empty rows', () => {
    const t1 = 1;
    const t2 = 2;
    memory.setRow(memory.getRow()+1);
    memory.setRow(memory.getRow()+1);
    memory.setRow(memory.getRow()+1);
    memory.forceEmit(t1, t2);

    const expectedCaptions = [];
    const captions = memory.decoder_.getParsedClosedCaptions();
    expect(captions).toEqual(expectedCaptions);
  });

  it('erases a character from the buffer', () => {
    const t1 = 1;
    const t2 = 2;
    const text = 'testt';
    const expectedText = 'test';
    for (const c of text) {
      memory.addChar(shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
    }
    memory.eraseChar();
    memory.forceEmit(t1, t2);
    const expectedCaptions = [createDefaultClosedCaption(t1, t2, expectedText)];
    const cues = memory.decoder_.getParsedClosedCaptions();
    expect(cues).toEqual(expectedCaptions);
  });

  it('erases the entire buffer', () => {
    const t1 = 1;
    const t2 = 2;
    const text = '0123456789abcde';
    const expectedText = '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\na\nb\nc\nd\ne';
    for (const c of text) {
      memory.addChar(shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
      memory.setRow(memory.getRow() + 1); // increment row
    }
    const expectedCaptions = [createDefaultClosedCaption(t1, t2, expectedText)];
    memory.forceEmit(t1, t2);

    // Expect the correct cue to be emitted.
    const cues = memory.decoder_.getParsedClosedCaptions();
    expect(cues).toEqual(expectedCaptions);

    // Erase the memory and currently buffered cues.
    memory.eraseBuffer();
    memory.decoder_.clearParsedClosedCaptions();

    // Force out the new memory.
    memory.forceEmit(t1, t2);

    // Expect the forced out memory to be blank. We just cleared it.
    expect(memory.decoder_.getParsedClosedCaptions()).toEqual([]);
  });

  it('erases the entire buffer', () => {
    const t1 = 1;
    const t2 = 2;
    const text = 'test';
    const expectedText1 = 't\ne\ns\nt';
    const expectedText2 = 's\nt\nt\ne';
    for (const c of text) {
      memory.addChar(shaka.cea.Cea608Memory.CharSet.BASIC_NORTH_AMERICAN,
          c.charCodeAt(0));
      memory.setRow(memory.getRow() + 1); // increment row
    }
    const expectedCaptions1 = [createDefaultClosedCaption(t1, t2, expectedText1)];
    memory.forceEmit(t1, t2);

    // Expect the correct cue to be emitted.
    const cues = memory.decoder_.getParsedClosedCaptions();
    expect(cues).toEqual(expectedCaptions1);

    // Move + clear the first 2 rows, and clear currently buffered cues.
    const srcRowIdx = 1;
    const dstRowIdx = 5;
    const rowsToMove = 2;
    memory.moveRows(dstRowIdx, srcRowIdx, rowsToMove);
    memory.resetRows(srcRowIdx, rowsToMove - 1);
    memory.decoder_.clearParsedClosedCaptions();

    // Force out the new memory.
    memory.forceEmit(t1, t2);

    const expectedCaptions2 = [createDefaultClosedCaption(t1, t2, expectedText2)];
    expect(memory.decoder_.getParsedClosedCaptions()).toEqual(expectedCaptions2);
  });
});
