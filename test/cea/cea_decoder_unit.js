/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CeaDecoder', () => {
  const CeaUtils = shaka.test.CeaUtils;

  /** @type {string} */
  const DEFAULT_BG_COLOR = shaka.cea.CeaUtils.DEFAULT_BG_COLOR;

  /**
   * Initialization bytes for CC packet.
   * Includes padding bytes, USA country code, and ATSC provider code.
   * @type {!Uint8Array}
   */
  const atscCaptionInitBytes = new Uint8Array([
    0xb5, // USA country code.
    0x00, 0x31, // ATSC provider code.
    0x47, 0x41, 0x39, 0x34, // ATSC user identifier.
    0x03, // User data type for cc_data.
  ]);

  /** @type {!shaka.cea.CeaDecoder} */
  const decoder = new shaka.cea.CeaDecoder();

  describe('decodes CEA-608', () => {
    const edmCodeByte2 = 0x2c; // Erase displayed memory byte 2.

    // A harmless no-op control pair (AON, "alarm on") used as padding between
    // two control codes that are the same, to break duplicate-suppression
    // without affecting caption content or position.
    const blankPaddingControlCode = new Uint8Array([0x94, 0x23]);

    // Erases displayed memory on every captioning mode.
    const eraseDisplayedMemory = new Uint8Array([
      ...atscCaptionInitBytes, 0xc4, /* padding= */ 0xff,
      0xfc, 0x94, edmCodeByte2, // EDM on CC1
      0xfc, 0x1c, edmCodeByte2, // EDM on CC2
      0xfd, 0x15, edmCodeByte2, // EDM on CC3
      0xfd, 0x9d, edmCodeByte2, // EDM on CC4
    ]);

    beforeEach(() => {
      decoder.clear();
    });

    it('painton captions on CC4', () => {
      const controlCount = 0x03;
      const captionData = 0xc0 | controlCount;
      const paintonCaptionCC4Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfd, 0x9d, 0x29, // Paint-on mode (RDC control code).
        0xfd, 0xf4, 0xe5, // t, e
        0xfd, 0x73, 0xf4, // s, t
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;
      const expectedText = 'test';

      const topLevelCue = new shaka.text.Cue(startTimeCaption1,
          startTimeCaption2, '');
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(
            startTimeCaption1, startTimeCaption2, expectedText),
      ];

      const expectedCaptions = [{
        stream: 'CC4',
        cue: topLevelCue,
      }];

      decoder.extract(paintonCaptionCC4Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    it('green and underlined popon caption data on CC3', () => {
      const controlCount = 0x08;
      const captionData = 0xc0 | controlCount;
      const greenTextCC3Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfd, 0x15, 0x20, // Pop-on mode (RCL control code)
        0xfd, 0x13, 0xe3, // PAC to underline and color text green on last row.
        0xfd, 0x67, 0xf2, // g, r
        0xfd, 0xe5, 0xe5, // e, e
        0xfd, 0x6e, 0x20, // n, space
        0xfd, 0xf4, 0xe5, // t, e
        0xfd, 0xf8, 0xf4, // x, t
        0xfd, 0x15, 0x2f, // EOC
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;
      const expectedText = 'green text';

      const topLevelCue = new shaka.text.Cue(
          startTimeCaption1, startTimeCaption2, '');
      topLevelCue.line = 74;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createStyledCue(
            startTimeCaption1, startTimeCaption2, expectedText,
            /* underline= */ true, /* italics= */ false,
            /* textColor= */ 'green', /* backgroundColor= */ 'black'),
      ];

      const expectedCaptions = [
        {
          stream: 'CC3',
          cue: topLevelCue,
        },
      ];

      decoder.extract(greenTextCC3Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    it('popon captions that change color and underline midrow on CC2', () => {
      const controlCount = 0x08;
      const captionData = 0xc0 | controlCount;
      const midrowStyleChangeCC2Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfc, 0x1c, 0x20, // Pop-on mode (RCL control code).
        0xfc, 0xad, 0xad, // -, -
        0xfc, 0x19, 0x29, // Red + underline midrow style control code.
        0xfc, 0xf2, 0xe5, // r, e
        0xfc, 0x64, 0x80, // d, invalid
        0xfc, 0x19, 0x20, // Midrow style control code to clear styles.
        0xfc, 0xad, 0xad, // -, -
        0xfc, 0x1c, 0x2f, // EOC
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;
      const expectedText1 = '-- ';
      const expectedText2 = 'red';
      const expectedText3 = ' --';

      // Since there are three style changes, there should be three nested cues.
      const topLevelCue = new shaka.text.Cue(
          startTimeCaption1, startTimeCaption2, '');
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;

      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(
            startTimeCaption1, startTimeCaption2, expectedText1),

        CeaUtils.createStyledCue(
            startTimeCaption1, startTimeCaption2, expectedText2,
            /* underline= */ true, /* italics= */ false,
            /* textColor= */ 'red', /* backgroundColor= */ DEFAULT_BG_COLOR),

        CeaUtils.createDefaultCue(
            startTimeCaption1, startTimeCaption2, expectedText3),
      ];

      const expectedCaptions = [
        {
          stream: 'CC2',
          cue: topLevelCue,
        },
      ];

      decoder.extract(midrowStyleChangeCC2Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    it('italicized popon captions on a yellow background on CC2', () => {
      const controlCount = 0x08;
      const captionData = 0xc0 | controlCount;
      const midrowStyleChangeCC2Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfc, 0x1c, 0x20, // Pop-on mode (RCL control code).
        0xfc, 0x19, 0x6e, // White Italics PAC.
        0xfc, 0x98, 0x2a, // Background attribute yellow.
        0xfc, 0xf4, 0xe5, // t, e
        0xfc, 0x73, 0xf4, // s, t
        0xfc, 0x19, 0x20, // Midrow style control code to clear styles.
        0xfc, 0x98, 0x20, // Background attribute to clear background.
        0xfc, 0x1c, 0x2f, // EOC
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;
      const expectedText = 'test';

      // A single nested cue containing yellow, italicized text.
      const topLevelCue = new shaka.text.Cue(startTimeCaption1,
          startTimeCaption2, '');
      topLevelCue.line = 15.33;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createStyledCue(
            startTimeCaption1, startTimeCaption2, expectedText,
            /* underline= */ false, /* italics= */ true,
            /* textColor= */ 'white', /* backgroundColor= */ 'yellow'),
      ];

      const expectedCaptions = [{
        stream: 'CC2',
        cue: topLevelCue,
      }];

      decoder.extract(midrowStyleChangeCC2Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    // Locks the PAC styling semantics: a PAC sets the row
    // and the base style (color/italics/underline) AND resets the background
    // color to default. A yellow background is set first, then a PAC arrives;
    // the subsequently written characters must render with the PAC's base style
    // (green, underlined) on the default (reset) background, not yellow.
    it('PAC resets background and sets base style on CC3', () => {
      const controlCount = 0x06;
      const captionData = 0xc0 | controlCount;
      const pacResetsBgCC3Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfd, 0x15, 0x20, // Pop-on mode (RCL control code).
        0xfd, 0x90, 0x2a, // Background attribute yellow (set before the PAC).
        0xfd, 0x13, 0xe3, // PAC: underline + green on last row.
        0xfd, 0xf4, 0xe5, // t, e
        0xfd, 0x73, 0xf4, // s, t
        0xfd, 0x15, 0x2f, // EOC
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;
      const expectedText = 'test';

      // A single nested cue: green + underlined text on the DEFAULT background,
      // proving the PAC reset the previously-set yellow background.
      const topLevelCue = new shaka.text.Cue(
          startTimeCaption1, startTimeCaption2, '');
      topLevelCue.line = 74;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createStyledCue(
            startTimeCaption1, startTimeCaption2, expectedText,
            /* underline= */ true, /* italics= */ false,
            /* textColor= */ 'green', /* backgroundColor= */ DEFAULT_BG_COLOR),
      ];

      const expectedCaptions = [{
        stream: 'CC3',
        cue: topLevelCue,
      }];

      decoder.extract(pacResetsBgCC3Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    // Locks the mid-row styling semantics: a mid-row code
    // inserts a single spacing character and changes foreground color, italics,
    // and underline from that point onward, WITHOUT resetting the background.
    // Here a yellow background is set, "ab" is written, then a red + underline
    // mid-row code is received followed by "cd". The mid-row space joins the
    // leading default-color run, "cd" picks up red + underline, and the yellow
    // background carries across the mid-row change unchanged.
    it('mid-row inserts space and changes fg/style, keeping bg on CC2', () => {
      const controlCount = 0x06;
      const captionData = 0xc0 | controlCount;
      const midrowKeepsBgCC2Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfc, 0x1c, 0x20, // Pop-on mode (RCL control code).
        0xfc, 0x98, 0x2a, // Background attribute yellow.
        0xfc, 0x61, 0x62, // a, b
        0xfc, 0x19, 0x29, // Red + underline mid-row style control code.
        0xfc, 0xe3, 0x64, // c, d
        0xfc, 0x1c, 0x2f, // EOC
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;

      // "ab" plus the mid-row spacing character keep the default foreground on
      // the yellow background; "cd" turns red + underlined on the same yellow
      // background (mid-row does not reset the background).
      const topLevelCue = new shaka.text.Cue(
          startTimeCaption1, startTimeCaption2, '');
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createStyledCue(
            startTimeCaption1, startTimeCaption2, 'ab ',
            /* underline= */ false, /* italics= */ false,
            /* textColor= */ shaka.cea.CeaUtils.DEFAULT_TXT_COLOR,
            /* backgroundColor= */ 'yellow'),

        CeaUtils.createStyledCue(
            startTimeCaption1, startTimeCaption2, 'cd',
            /* underline= */ true, /* italics= */ false,
            /* textColor= */ 'red', /* backgroundColor= */ 'yellow'),
      ];

      const expectedCaptions = [{
        stream: 'CC2',
        cue: topLevelCue,
      }];

      decoder.extract(midrowKeepsBgCC2Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    it('popon captions with special characters on CC2', () => {
      const controlCount = 0x07;
      const captionData = 0xc0 | controlCount;
      const midrowStyleChangeCC2Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfc, 0x1c, 0x20, // Pop-on mode (RCL control code).
        0xfc, 0x19, 0x37, // Special North American character (♪)
        0xfc, 0x20, 0x80, // SP, invalid. SP will be replaced by extended char.
        0xfc, 0x1a, 0x25, // Extended Spanish/Misc character (ü)
        0xfc, 0x20, 0x80, // SP, invalid.
        0xfc, 0x9b, 0xb9, // Extended German/Danish character (å)
        0xfc, 0x1c, 0x2f, // EOC
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;
      const expectedText = '♪üå';

      const topLevelCue = new shaka.text.Cue(startTimeCaption1,
          startTimeCaption2, '');
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(
            startTimeCaption1, startTimeCaption2, expectedText),
      ];

      const expectedCaptions = [{
        stream: 'CC2',
        cue: topLevelCue,
      }];

      decoder.extract(midrowStyleChangeCC2Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const captions = decoder.decode();
      expect(captions).toEqual(expectedCaptions);
    });

    it('painton captions on CC1', () => {
      const controlCount = 0x03;
      const captionData = 0xc0 | controlCount;
      const paintonCaptionCC1Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfc, 0x94, 0x29, // Paint-on mode (RDC control code).
        0xfc, 0xf4, 0xe5, // t, e
        0xfc, 0x73, 0xf4, // s, t
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;
      const expectedText = 'test';

      const topLevelCue = new shaka.text.Cue(startTimeCaption1,
          startTimeCaption2, '');
      topLevelCue.line = 10;
      topLevelCue.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(
            startTimeCaption1, startTimeCaption2, expectedText),
      ];

      const expectedCaptions = [{
        stream: 'CC1',
        cue: topLevelCue,
      }];

      decoder.extract(paintonCaptionCC1Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    it('rollup captions (2 lines) on CC1', () => {
      const controlCount1 = 0x03;
      const controlCount2 = 0x02;
      const stream = 'CC1';
      const time1 = 1;
      const time2 = 2;
      const time3 = 3;
      const time4 = 4;
      const time5 = 5;

      // Carriage return on CC1
      const carriageReturnControlCode = new Uint8Array([0x94, 0xad]);
      const packets = [
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, /* padding= */ 0xff,
          0xfc, 0x94, 0x25, // Roll-up 2 rows control code.
          0xfc, ...carriageReturnControlCode,
          0xfc, ...blankPaddingControlCode,
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, /* padding= */ 0xff,
          0xfc, 0x31, 0xae, // 1, .
          0xfc, ...carriageReturnControlCode,
          0xfc, ...blankPaddingControlCode,
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, /* padding= */ 0xff,
          0xfc, 0x32, 0xae, // 2, .
          0xfc, ...carriageReturnControlCode,
          0xfc, ...blankPaddingControlCode,
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, /* padding= */ 0xff,
          0xfc, 0xb3, 0xae, // 3, .
          0xfc, ...carriageReturnControlCode,
          0xfc, ...blankPaddingControlCode,
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount2, /* padding= */ 0xff,
          0xfc, 0x34, 0xae, // 4, .
          0xfc, 0x94, 0x2f, // EOC
        ]),
      ];

      for (let i = 0; i < packets.length; i++) {
        decoder.extract(packets[i], i+1);
      }
      decoder.extract(eraseDisplayedMemory, 6);

      // Roll-up is revealed character by character: each row appears at the
      // time its bytes were decoded. The newest row of every caption was
      // decoded in the same frame as its carriage return (the end of the
      // caption's window), so it is revealed at that window's end time, while
      // older rows that scrolled up from a previous caption show immediately.

      // Top level cue corresponding to the first closed caption.
      const topLevelCue1 = new shaka.text.Cue(
          /* startTime= */ time1, /* endTime= */ time2, '');
      topLevelCue1.line = 84.66;
      topLevelCue1.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue1.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time2, /* endTime= */ time2, /* payload= */ '1.'),
      ];

      // Top level cue corresponding to the second closed caption.
      const topLevelCue2 = new shaka.text.Cue(
          /* startTime= */ time2, /* endTime= */ time3, '');
      // Two rows (14, 15); anchored to the first non-empty row (14).
      topLevelCue2.line = 79.33;
      topLevelCue2.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue2.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time2, /* endTime= */ time3, /* payload= */ '1.'),

        CeaUtils.createLineBreakCue(
            /* startTime= */ time2, /* endTime= */ time3),

        CeaUtils.createDefaultCue(
            /* startTime= */ time3, /* endTime= */ time3, /* payload= */ '2.'),
      ];

      // Top level cue corresponding to the third closed caption.
      const topLevelCue3 = new shaka.text.Cue(
          /* startTime= */ time3, /* endTime= */ time4, '');
      // Two rows (14, 15); anchored to the first non-empty row (14).
      topLevelCue3.line = 79.33;
      topLevelCue3.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue3.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time3, /* endTime= */ time4, /* payload= */ '2.'),

        CeaUtils.createLineBreakCue(
            /* startTime= */ time3, /* endTime= */ time4),

        CeaUtils.createDefaultCue(
            /* startTime= */ time4, /* endTime= */ time4, /* payload= */ '3.'),
      ];

      // Top level cue corresponding to the fourth closed caption.
      const topLevelCue4 = new shaka.text.Cue(
          /* startTime= */ time4, /* endTime= */ time5, '');
      // Two rows (14, 15); anchored to the first non-empty row (14).
      topLevelCue4.line = 79.33;
      topLevelCue4.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue4.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time4, /* endTime= */ time5, /* payload= */ '3.'),

        CeaUtils.createLineBreakCue(
            /* startTime= */ time4, /* endTime= */ time5),

        CeaUtils.createDefaultCue(
            /* startTime= */ time5, /* endTime= */ time5, /* payload= */ '4.'),
      ];

      const expectedCaptions = [
        {
          stream,
          cue: topLevelCue1,
        },
        {
          stream,
          cue: topLevelCue2,
        },
        {
          stream,
          cue: topLevelCue3,
        },
        {
          stream,
          cue: topLevelCue4,
        },
      ];

      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    it('PAC shifts entire 2-line rollup window to a new row on CC1', () => {
      const controlCount1 = 0x03;
      const controlCount2 = 0x02;
      const stream = 'CC1';

      // Carriage return on CC1
      const carriageReturnControlCode = new Uint8Array([0x94, 0xad]);
      const packets = [
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, /* padding= */ 0xff,
          0xfc, 0x94, 0x25, // Roll-up 2 rows control code.
          0xfc, ...carriageReturnControlCode,
          0xfc, 0x94, 0x23, // No-op padding control code (AON).
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, /* padding= */ 0xff,
          0xfc, 0x31, 0xae, // 1, .
          0xfc, ...carriageReturnControlCode,
          0xfc, 0x94, 0x23, // No-op padding control code (AON).
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount2, /* padding= */ 0xff,
          0xfc, 0x32, 0xae, // 2, .
          0xfc, 0x92, 0xe0, // PAC control code to move to row 4.
        ]),
      ];

      for (let i = 0; i < packets.length; i++) {
        decoder.extract(packets[i], i+1);
      }
      decoder.extract(eraseDisplayedMemory, 3);

      // Roll-up reveals each row at its decode time. The newest row of each
      // caption was decoded in the same frame that ends the caption's window,
      // so it is revealed at that end time; rows scrolled up from a previous
      // caption show immediately.

      // Top level cue corresponding to the first closed caption.
      const topLevelCue1 = new shaka.text.Cue(/* startTime= */ 1,
          /* endTime= */ 2, '');
      topLevelCue1.line = 84.66;
      topLevelCue1.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue1.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ 2, /* endTime= */ 2, /* payload= */ '1.'),
      ];

      // Top level cue corresponding to the second closed caption.
      const topLevelCue2 = new shaka.text.Cue(/* startTime= */ 2,
          /* endTime= */ 3, '');
      // The window moved to base row 4, so text is on rows 3 and 4; anchored
      // to the first non-empty row (3).
      topLevelCue2.line = 20.66;
      topLevelCue2.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue2.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ 2, /* endTime= */ 3, /* payload= */ '1.'),

        CeaUtils.createLineBreakCue(/* startTime= */ 2, /* endTime= */ 3),

        CeaUtils.createDefaultCue(
            /* startTime= */ 3, /* endTime= */ 3, /* payload= */ '2.'),
      ];

      const expectedCaptions = [
        {
          stream,
          cue: topLevelCue1,
        },
        {
          stream,
          cue: topLevelCue2,
        },
      ];

      const captions = decoder.decode();

      expect(captions).toEqual(expectedCaptions);
    });

    it('emits text sent while in CEA-608 Text Mode', () => {
      const controlCount = 0x03;
      const captionData = 0xc0 | controlCount;
      const textModePacket = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfc, 0x94, 0x2a, // Text mode (Text restart control code).
        0xfc, 0xf4, 0xe5, // t, e
        0xfc, 0x73, 0xf4, // s, t
      ]);

      // A later packet issues a Carriage Return to flush the text line.
      const carriageReturnPacket = new Uint8Array([
        ...atscCaptionInitBytes, 0xc1, /* padding= */ 0xff,
        0xfc, 0x94, 0xad, // Carriage return on CC1.
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;

      decoder.extract(textModePacket, startTimeCaption1);
      decoder.extract(carriageReturnPacket, startTimeCaption2);

      const captions = decoder.decode();
      // Text mode now emits a cue when a CR follows non-empty text.
      expect(captions.length).toBe(1);
      // The text-mode caption is surfaced on the text channel (T1), not the
      // captioning channel (CC1).
      expect(captions[0].stream).toBe('T1');
      // getStreams() reports the text-mode stream once text-mode cues are
      // produced.
      expect(decoder.getStreams()).toContain('T1');
    });

    it('surfaces text-mode cues on the matching text channel (T2)', () => {
      const controlCount = 0x03;
      const captionData = 0xc0 | controlCount;
      // CC2 is field 1, channel 1 (control byte 1 = 0x1c), so its text mode
      // emits on T2.
      const textModePacket = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfc, 0x1c, 0x2a, // Text mode (Text restart control code) on CC2.
        0xfc, 0xf4, 0xe5, // t, e
        0xfc, 0x73, 0xf4, // s, t
      ]);

      // A later packet issues a Carriage Return to flush the text line.
      const carriageReturnPacket = new Uint8Array([
        ...atscCaptionInitBytes, 0xc1, /* padding= */ 0xff,
        0xfc, 0x1c, 0xad, // Carriage return on CC2.
      ]);

      decoder.extract(textModePacket, /* pts= */ 1);
      decoder.extract(carriageReturnPacket, /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      // The text-channel number tracks the field/channel (CC2 -> T2).
      expect(captions[0].stream).toBe('T2');
      expect(decoder.getStreams()).toContain('T2');
      // The captioning stream (CC2) is never emitted as a text cue.
      expect(captions[0].stream).not.toBe('CC2');
    });

    it('resets the decoder on >=45 consecutive bad frames', () => {
    // CEA-608-B C.21 says to reset the decoder after 45 invalid frames.
      const controlCount = 0x0f;
      const captionData = 0xc0 | controlCount;
      const badFrames = [];
      const badFrameCount = 15;
      for (let i = 0; i<badFrameCount; i++) {
      // Without loss of generality, the bad frames will be sent on CC1.
        badFrames.push(0xfc, 0x0, 0x0);
      }

      const badFramesBuffer = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        ...new Uint8Array(badFrames),
      ]);

      // 3*15 = 45 total bad frames extracted.
      for (let i = 0; i < 3; i++) {
        decoder.extract(badFramesBuffer, i+1);
      }

      spyOn(decoder, 'reset').and.callThrough();
      decoder.decode();

      expect(decoder.reset).toHaveBeenCalledTimes(1);
    });

    it('does not attempt to extract SEI packet that is too short', () => {
      const badData = new Uint8Array([0xb5]);
      decoder.extract(badData, 0);
      const captions = decoder.decode();
      expect(captions.length).toBe(0);
    });
  });

  describe('CEA-608 stream robustness', () => {
    // Raw CEA-608 control bytes (parity is applied by the test helper).
    const RCL = {b1: 0x14, b2: 0x20}; // Resume Caption Loading (pop-on).
    const EOC = {b1: 0x14, b2: 0x2f}; // End Of Caption (flip memories).
    const EDM = {b1: 0x14, b2: 0x2c}; // Erase Displayed Memory.

    beforeEach(() => {
      decoder.clear();
    });

    /**
     * Builds a field-1 CEA-608 pair descriptor for buildCea608Sei, applying
     * odd parity unless told otherwise.
     * @param {number} b1
     * @param {number} b2
     * @param {boolean=} applyParity
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function pair(b1, b2, applyParity = true) {
      return {field: 1, b1, b2, applyParity};
    }

    /**
     * Decodes a CC1 pop-on caption that renders "test", optionally inserting
     * extra byte pairs between the "te" and "st" character pairs. The inserted
     * pairs let us prove that ignored data (XDS, even-parity frames) does not
     * alter the resulting caption.
     * @param {!Array<{field: number, b1: number, b2: number,
     *   applyParity: boolean}>} insertedPairs
     * @return {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>}
     */
    function decodePopon(insertedPairs) {
      decoder.clear();
      const pairs = [
        pair(RCL.b1, RCL.b2), // Pop-on mode.
        pair(0x74, 0x65), // t, e
        ...insertedPairs,
        pair(0x73, 0x74), // s, t
        pair(EOC.b1, EOC.b2), // EOC flips "test" into displayed memory.
      ];
      decoder.extract(CeaUtils.buildCea608Sei(pairs), /* pts= */ 1);
      // A later EDM forces the displayed memory out as a cue.
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(EDM.b1, EDM.b2)]), /* pts= */ 2);
      return decoder.decode();
    }

    /**
     * Extracts `count` consecutive bad (even-parity) frames on field 1,
     * chunked across SEI messages since cc_count is only 5 bits wide.
     * @param {number} count
     * @param {number} startPts
     */
    function extractBadFrames(count, startPts) {
      let remaining = count;
      let pts = startPts;
      while (remaining > 0) {
        const chunk = Math.min(remaining, 31);
        const pairs = [];
        for (let i = 0; i < chunk; i++) {
          // 0x03 has even parity, so the pair is rejected as a bad frame.
          pairs.push({field: 1, b1: 0x03, b2: 0x03, applyParity: false});
        }
        decoder.extract(CeaUtils.buildCea608Sei(pairs), pts++);
        remaining -= chunk;
      }
    }

    // the decoder must strip the odd-parity bit before interpreting
    // bytes. The helper sets parity bits on every byte; correct text proves
    // the bit is removed (otherwise 0xf4 etc. would map to other glyphs).
    it('strips the parity bit before interpreting byte pairs', () => {
      const captions = decodePopon([]);
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('CC1');
      const text = captions[0].cue.nestedCues.map((c) => c.payload).join('');
      expect(text).toBe('test');
    });

    // a pair where either byte has even parity yields no cue.
    const evenParityCases = [
      {name: 'both bytes have even parity', b1: 0x00, b2: 0x00},
      {name: 'only the first byte has even parity',
        b1: 0x03, b2: CeaUtils.withOddParity(0x41)},
      {name: 'only the second byte has even parity',
        b1: CeaUtils.withOddParity(0x41), b2: 0x03},
      {name: 'both bytes are 0xff', b1: 0xff, b2: 0xff},
    ];
    for (const testCase of evenParityCases) {
      it(`produces no cue when ${testCase.name}`, () => {
        const sei = CeaUtils.buildCea608Sei(
            [{field: 1, b1: testCase.b1, b2: testCase.b2, applyParity: false}]);
        decoder.extract(sei, /* pts= */ 1);
        const captions = decoder.decode();
        expect(captions).toEqual([]);
      });
    }

    // an even-parity pair injected mid-caption is ignored entirely
    // (it neither emits a cue nor corrupts the surrounding buffer).
    it('ignores an even-parity pair inserted mid-caption', () => {
      const baseline = decodePopon([]);
      const withBadFrame = decodePopon(
          [{field: 1, b1: 0x03, b2: 0x03, applyParity: false}]);
      expect(baseline.length).toBe(1);
      expect(withBadFrame).toEqual(baseline);
    });

    // the reset boundary is exactly 45 consecutive bad frames.
    it('does not reset before 45 consecutive bad frames', () => {
      extractBadFrames(/* count= */ 44, /* startPts= */ 1);
      spyOn(decoder, 'reset').and.callThrough();
      decoder.decode();
      expect(decoder.reset).not.toHaveBeenCalled();
    });

    it('resets exactly at the 45th consecutive bad frame', () => {
      extractBadFrames(/* count= */ 45, /* startPts= */ 1);
      spyOn(decoder, 'reset').and.callThrough();
      decoder.decode();
      expect(decoder.reset).toHaveBeenCalledTimes(1);
    });

    // a valid frame clears the bad-frame counter, so bad frames
    // on either side of it never sum past the reset threshold.
    it('clears the bad-frame counter after a valid frame', () => {
      extractBadFrames(/* count= */ 44, /* startPts= */ 1);
      // A valid RCL control pair resets the counter to zero.
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(RCL.b1, RCL.b2)]), /* pts= */ 45);
      extractBadFrames(/* count= */ 44, /* startPts= */ 46);
      spyOn(decoder, 'reset').and.callThrough();
      decoder.decode();
      expect(decoder.reset).not.toHaveBeenCalled();
    });

    // XDS control codes (b1 in [0x01, 0x0F]) are ignored and leave
    // the displayed/non-displayed buffers unchanged.
    it('ignores XDS control codes without altering caption buffers', () => {
      const baseline = decodePopon([]);
      const withXds = decodePopon([
        pair(0x01, 0x01), // XDS control code (lowest range).
        pair(0x0f, 0x0f), // XDS control code (highest range).
      ]);
      expect(baseline.length).toBe(1);
      expect(withXds).toEqual(baseline);
    });

    // a stream made up solely of XDS pairs emits nothing.
    it('emits no cue for a stream of only XDS control codes', () => {
      const sei = CeaUtils.buildCea608Sei([
        pair(0x01, 0x20),
        pair(0x05, 0x40),
        pair(0x0f, 0x0f),
      ]);
      decoder.extract(sei, /* pts= */ 1);
      const captions = decoder.decode();
      expect(captions).toEqual([]);
    });
  });

  describe('CEA-608 stream robustness (seeded-random properties)', () => {
    // Raw CEA-608 control bytes (parity applied by the test helper).
    const RCL = {b1: 0x14, b2: 0x20}; // Resume Caption Loading (pop-on).
    const EOC = {b1: 0x14, b2: 0x2f}; // End Of Caption (flip memories).
    const EDM = {b1: 0x14, b2: 0x2c}; // Erase Displayed Memory.

    /** A spread of fixed seeds so the suite covers many random inputs. */
    const SEEDS = [1, 2, 3, 7, 13, 42, 101, 1337, 65535, 0xc0ffee];

    /**
     * Deterministic 32-bit PRNG (mulberry32). Returns a function producing
     * floats in [0, 1). Seeding makes every generated case reproducible.
     * @param {number} seed
     * @return {function(): number}
     */
    function makeRng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /**
     * @param {function(): number} rng
     * @param {number} min
     * @param {number} max Inclusive.
     * @return {number}
     */
    function randInt(rng, min, max) {
      return min + Math.floor(rng() * (max - min + 1));
    }

    /**
     * Forces even parity on a 7-bit payload: sets the parity bit (bit 7) only
     * when the payload already has an odd number of ones, so the resulting
     * 8-bit byte always has an even number of ones. The decoder requires odd
     * parity, so such a byte is always rejected as a bad frame. This is the
     * inverse of shaka.test.CeaUtils.withOddParity.
     * @param {number} byte
     * @return {number}
     */
    function withEvenParity(byte) {
      let b = byte & 0x7f;
      let ones = 0;
      for (let i = 0; i < 7; i++) {
        ones += (b >> i) & 0x01;
      }
      if ((ones & 0x01) === 0x01) {
        b |= 0x80;
      }
      return b;
    }

    /**
     * Builds a field-1 pair descriptor whose first byte has even parity, so the
     * pair is guaranteed to be rejected as a bad frame (). Bytes are
     * pre-parity, so applyParity is false.
     * @param {function(): number} rng
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function randomBadPair(rng) {
      return {
        field: 1,
        b1: withEvenParity(randInt(rng, 0x00, 0x7f)),
        b2: randInt(rng, 0x00, 0xff),
        applyParity: false,
      };
    }

    /**
     * Extracts a list of pairs as bad frames, chunked across SEI messages
     * because cc_count is only 5 bits wide (max 31 triples per message).
     * @param {!shaka.cea.CeaDecoder} dec
     * @param {!Array<{field: number, b1: number, b2: number,
     *   applyParity: boolean}>} pairs
     * @param {number} startPts
     */
    function extractChunked(dec, pairs, startPts) {
      let pts = startPts;
      for (let i = 0; i < pairs.length; i += 31) {
        const chunk = pairs.slice(i, i + 31);
        dec.extract(CeaUtils.buildCea608Sei(chunk), pts++);
      }
    }

    /**
     * Field-1 pair with odd parity applied by the builder.
     * @param {number} b1
     * @param {number} b2
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function oddPair(b1, b2) {
      return {field: 1, b1, b2, applyParity: true};
    }

    // any byte pair where a byte has even parity yields no cue and
    // increments the bad-frame counter. We prove the increment behaviorally:
    // K bad frames followed by (45 - K) more bad frames must trigger exactly
    // one reset, which only happens once the counter reaches 45.
    for (const seed of SEEDS) {
      it(`rejects even-parity pairs and counts them (seed ${seed})`, () => {
        const rng = makeRng(seed);
        const dec = new shaka.cea.CeaDecoder();
        const k = randInt(rng, 1, 44);

        const firstBatch = [];
        for (let i = 0; i < k; i++) {
          firstBatch.push(randomBadPair(rng));
        }
        const secondBatch = [];
        for (let i = 0; i < 45 - k; i++) {
          secondBatch.push(randomBadPair(rng));
        }

        spyOn(dec, 'reset').and.callThrough();

        // First K (< 45) bad frames: no cue, and not yet enough to reset.
        extractChunked(dec, firstBatch, /* startPts= */ 1);
        expect(dec.decode()).toEqual([]);
        expect(dec.reset).not.toHaveBeenCalled();

        // The remaining frames bring the running total to exactly 45, which
        // can only happen if every bad frame incremented the counter by one.
        extractChunked(dec, secondBatch, /* startPts= */ 100);
        expect(dec.decode()).toEqual([]);
        expect(dec.reset).toHaveBeenCalledTimes(1);
      });
    }

    // injecting XDS control codes (b1 in [0x01, 0x0F]) into a
    // caption stream leaves the decoded output identical to the same stream
    // with the XDS pairs removed.
    for (const seed of SEEDS) {
      it(`isolates injected XDS pairs from caption output (seed ${seed})`,
          () => {
            const rng = makeRng(seed);

            // Build a random run of basic North American characters (A-Z) so
            // the caption renders deterministically. Each pair carries two
            // letters.
            const charCount = randInt(rng, 1, 8);
            const charPairs = [];
            for (let i = 0; i < charCount; i++) {
              const c1 = randInt(rng, 0x41, 0x5a); // 'A'..'Z'
              const c2 = randInt(rng, 0x41, 0x5a); // 'A'..'Z'
              charPairs.push(oddPair(c1, c2));
            }

            // Random XDS pairs to inject. b1 in [0x01, 0x0F] is the XDS range;
            // both bytes get odd parity so the pair reaches the XDS branch
            // (rather than being dropped earlier as a bad frame).
            const xdsCount = randInt(rng, 1, 6);
            const xdsPairs = [];
            for (let i = 0; i < xdsCount; i++) {
              const b1 = randInt(rng, 0x01, 0x0f);
              const b2 = randInt(rng, 0x20, 0x7f);
              xdsPairs.push(oddPair(b1, b2));
            }

            // Interleave the XDS pairs into the character run at random spots.
            const mixed = charPairs.slice();
            for (const xds of xdsPairs) {
              const pos = randInt(rng, 0, mixed.length);
              mixed.splice(pos, 0, xds);
            }

            const rcl = oddPair(RCL.b1, RCL.b2);
            const eoc = oddPair(EOC.b1, EOC.b2);
            const baselinePairs = [rcl, ...charPairs, eoc];
            const xdsInjectedPairs = [rcl, ...mixed, eoc];

            const baseline = decodeCaption(baselinePairs);
            const withXds = decodeCaption(xdsInjectedPairs);

            // The caption must actually be emitted, and XDS must not alter it.
            expect(baseline.length).toBe(1);
            expect(baseline[0].stream).toBe('CC1');
            expect(withXds).toEqual(baseline);
          });
    }

    /**
     * Decodes a pop-on caption on a fresh decoder: extracts the supplied pairs
     * at pts 1, then an EDM at pts 2 to flush displayed memory into a cue.
     * @param {!Array<{field: number, b1: number, b2: number,
     *   applyParity: boolean}>} pairs
     * @return {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>}
     */
    function decodeCaption(pairs) {
      const dec = new shaka.cea.CeaDecoder();
      dec.extract(CeaUtils.buildCea608Sei(pairs), /* pts= */ 1);
      dec.extract(
          CeaUtils.buildCea608Sei([oddPair(EDM.b1, EDM.b2)]), /* pts= */ 2);
      return dec.decode();
    }
  });

  describe('CEA-608 duplicate control-code suppression', () => {
    // FCC practice transmits control codes twice; an identical control pair in
    // the immediately following frame must be applied exactly once.
    // BackSpace (BS) is used as the probe because its effect -- erasing one
    // displayed character -- is directly observable in the emitted cue text.

    // Raw CEA-608 control bytes (parity applied by the test helper).
    const RCL = {b1: 0x14, b2: 0x20}; // Resume Caption Loading (pop-on).
    const EOC = {b1: 0x14, b2: 0x2f}; // End Of Caption (flip memories).
    const EDM = {b1: 0x14, b2: 0x2c}; // Erase Displayed Memory.
    const BS = {b1: 0x14, b2: 0x21}; // BackSpace (erases the last character).
    const PAD = {b1: 0x14, b2: 0x23}; // Harmless filler control pair (AON).

    beforeEach(() => {
      decoder.clear();
    });

    /**
     * Field-1 pair descriptor for buildCea608Sei with odd parity applied.
     * @param {number} b1
     * @param {number} b2
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function pair(b1, b2) {
      return {field: 1, b1, b2, applyParity: true};
    }

    /**
     * Pops on the word "test", runs the supplied control/character pairs,
     * flips the caption out with EOC, and flushes it to a cue with EDM. The
     * returned text is the concatenation of the emitted nested-cue payloads.
     * @param {!Array<{field: number, b1: number, b2: number,
     *   applyParity: boolean}>} insertedPairs
     * @return {string}
     */
    function decodePoponText(insertedPairs) {
      const pairs = [
        pair(RCL.b1, RCL.b2), // Pop-on mode.
        pair(0x74, 0x65), // t, e
        pair(0x73, 0x74), // s, t
        ...insertedPairs,
        pair(EOC.b1, EOC.b2), // Flip "test" (minus any erases) into display.
      ];
      decoder.extract(CeaUtils.buildCea608Sei(pairs), /* pts= */ 1);
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(EDM.b1, EDM.b2)]), /* pts= */ 2);
      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('CC1');
      return captions[0].cue.nestedCues.map((c) => c.payload).join('');
    }

    // Baseline: a single BS erases exactly one character ("test" -> "tes").
    // This anchors what "applied once" looks like for the duplicate cases.
    it('applies a single control pair once', () => {
      expect(decodePoponText([pair(BS.b1, BS.b2)])).toBe('tes');
    });

    // an identical control pair in two immediately consecutive frames
    // is applied exactly once, so only one character is erased ("test" ->
    // "tes"), matching the single-BS baseline rather than erasing two.
    it('applies a duplicated control pair in consecutive frames once', () => {
      expect(decodePoponText([
        pair(BS.b1, BS.b2), // BS.
        pair(BS.b1, BS.b2), // Duplicate BS in the very next frame -> ignored.
      ])).toBe('tes');
    });

    // Suppression is limited to the immediately following frame and a single
    // match: once an intervening (non-duplicate) control pair is seen, a
    // repeated BS counts again, erasing a second character ("test" -> "te").
    it('does not suppress a repeat separated by another control pair', () => {
      expect(decodePoponText([
        pair(BS.b1, BS.b2), // First BS erases "t".
        pair(PAD.b1, PAD.b2), // Intervening control pair clears the match.
        pair(BS.b1, BS.b2), // Second BS now applies, erasing "s".
      ])).toBe('te');
    });

    // Only one duplicate is swallowed: a control pair sent three times in a
    // row applies twice (first + third), since suppression resets after the
    // single ignored frame ("test" -> "te").
    it('suppresses only one duplicate in a run of three', () => {
      expect(decodePoponText([
        pair(BS.b1, BS.b2), // Applies (erases "t").
        pair(BS.b1, BS.b2), // Duplicate -> ignored.
        pair(BS.b1, BS.b2), // Match cleared, applies again (erases "s").
      ])).toBe('te');
    });
  });

  describe('CEA-608 text mode', () => {
    // 2.7). Text mode is entered via RTD or TR; typed characters accumulate in
    // a dedicated text buffer and are emitted (like roll-up) on Carriage
    // Return, surfaced on the text-channel streams (T1-T4). Raw control bytes
    // are listed here; the test helper applies odd parity.
    const RTD = {b1: 0x14, b2: 0x2b}; // Resume Text Display (enter text mode).
    const TR = {b1: 0x14, b2: 0x2a}; // Text Restart (clear buffer + enter).
    const CR = {b1: 0x14, b2: 0x2d}; // Carriage Return (emit + scroll).
    const EDM = {b1: 0x14, b2: 0x2c}; // Erase Displayed Memory.
    const RCL = {b1: 0x14, b2: 0x20}; // Resume Caption Loading (pop-on).
    const EOC = {b1: 0x14, b2: 0x2f}; // End Of Caption (flip memories).
    const RU2 = {b1: 0x14, b2: 0x25}; // Roll-Up, 2 rows.

    beforeEach(() => {
      decoder.clear();
    });

    /**
     * Builds a CEA-608 pair descriptor for buildCea608Sei with odd parity
     * applied. The channel bit lives in b1, so callers pass the raw control
     * bytes (e.g. 0x1c selects channel 2). Field defaults to 1 (CC1/CC2).
     * @param {number} b1
     * @param {number} b2
     * @param {number=} field
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function pair(b1, b2, field = 1) {
      return {field, b1, b2, applyParity: true};
    }

    /**
     * Concatenates the nested-cue payloads of an emitted caption into a string.
     * @param {!shaka.extern.ICaptionDecoder.ClosedCaption} caption
     * @return {string}
     */
    function textOf(caption) {
      return caption.cue.nestedCues.map((c) => c.payload).join('');
    }

    // entering text mode via RTD, typing, then a CR emits a
    // single cue on the matching text-mode stream (CC1 -> T1), and the stream
    // is discoverable via getStreams().
    it('enters text mode via RTD and emits a cue on T1 at CR', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(RTD.b1, RTD.b2), // Enter text mode.
        pair(0x74, 0x65), // t, e
        pair(0x73, 0x74), // s, t
      ]), /* pts= */ 1);
      // CR must arrive at a later pts so that startTime < endTime.
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(CR.b1, CR.b2)]), /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('T1');
      expect(textOf(captions[0])).toBe('test');
      expect(captions[0].cue.startTime).toBe(1);
      expect(captions[0].cue.endTime).toBe(2);
      expect(decoder.getStreams()).toContain('T1');
    });

    // entering text mode via TR behaves the same as RTD for a
    // fresh buffer -- typing then CR emits the text on T1.
    it('enters text mode via TR and emits a cue on T1 at CR', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(TR.b1, TR.b2), // Text Restart -> clears (already empty) + enter.
        pair(0x74, 0x65), // t, e
        pair(0x73, 0x74), // s, t
      ]), /* pts= */ 1);
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(CR.b1, CR.b2)]), /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('T1');
      expect(textOf(captions[0])).toBe('test');
      expect(decoder.getStreams()).toContain('T1');
    });

    // the text-channel number tracks the field/channel of the control
    // code. b1 = 0x1c selects channel 2 (CC2), so its text mode emits on T2.
    it('surfaces a channel-2 text-mode caption on T2', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(0x1c, RTD.b2), // Enter text mode on channel 2.
        pair(0x74, 0x65), // t, e
        pair(0x73, 0x74), // s, t
      ]), /* pts= */ 1);
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(0x1c, CR.b2)]), /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('T2');
      expect(textOf(captions[0])).toBe('test');
      expect(decoder.getStreams()).toContain('T2');
    });

    // field 2 (cc_type 1) with b1 = 0x15 selects CC3, so its text mode
    // emits on T3.
    it('surfaces a field-2 text-mode caption on T3', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(0x15, RTD.b2, /* field= */ 2), // Enter text mode on CC3.
        pair(0x74, 0x65, /* field= */ 2), // t, e
        pair(0x73, 0x74, /* field= */ 2), // s, t
      ]), /* pts= */ 1);
      decoder.extract(CeaUtils.buildCea608Sei(
          [pair(0x15, CR.b2, /* field= */ 2)]), /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('T3');
      expect(textOf(captions[0])).toBe('test');
      expect(decoder.getStreams()).toContain('T3');
    });

    // a Text Restart clears the text buffer. Text typed before the TR
    // ("AB") must not appear in the cue emitted after it; only the text typed
    // afterward ("CD") survives.
    it('clears the text buffer on TR', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(RTD.b1, RTD.b2), // Enter text mode.
        pair(0x41, 0x42), // A, B (typed before the restart).
      ]), /* pts= */ 1);
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(TR.b1, TR.b2), // Text Restart clears the buffer ("AB" is dropped).
        pair(0x43, 0x44), // C, D (typed after the restart).
      ]), /* pts= */ 2);
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(CR.b1, CR.b2)]), /* pts= */ 3);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('T1');
      // Only the post-restart text survives; "AB" was cleared by TR.
      expect(textOf(captions[0])).toBe('CD');
    });

    // Erase Displayed Memory does NOT clear the text buffer while text
    // mode is active. The text typed before EDM survives and is emitted by the
    // subsequent CR.
    it('does not clear the text buffer on EDM while in text mode', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(RTD.b1, RTD.b2), // Enter text mode.
        pair(0x74, 0x65), // t, e
        pair(0x73, 0x74), // s, t
        pair(EDM.b1, EDM.b2), // EDM must not touch the text buffer.
      ]), /* pts= */ 1);
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(CR.b1, CR.b2)]), /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('T1');
      // The text survived the EDM.
      expect(textOf(captions[0])).toBe('test');
    });

    // pop-on captioning is unaffected by the text-mode changes -- it
    // still emits on the captioning stream (CC1), never a text stream.
    it('leaves pop-on captioning emitting on CC1', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(RCL.b1, RCL.b2), // Pop-on mode.
        pair(0x74, 0x65), // t, e
        pair(0x73, 0x74), // s, t
        pair(EOC.b1, EOC.b2), // Flip "test" into displayed memory.
      ]), /* pts= */ 1);
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(EDM.b1, EDM.b2)]), /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('CC1');
      expect(textOf(captions[0])).toBe('test');
    });

    // roll-up captioning is unaffected by the text-mode changes -- it
    // still emits on the captioning stream (CC1), never a text stream.
    it('leaves roll-up captioning emitting on CC1', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(RU2.b1, RU2.b2), // Roll-up, 2 rows.
        pair(0x74, 0x65), // t, e
        pair(0x73, 0x74), // s, t
      ]), /* pts= */ 1);
      decoder.extract(
          CeaUtils.buildCea608Sei([pair(CR.b1, CR.b2)]), /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('CC1');
      expect(textOf(captions[0])).toBe('test');
    });
  });

  describe('CEA-608 text mode (seeded-random properties)', () => {
    // After entering text mode and issuing CR with non-empty text, decode()
    // emits at least one cue on a text-mode stream (T1-T4).

    // Raw CEA-608 control bytes (parity applied by the test helper).
    const RTD = {b1: 0x14, b2: 0x2b}; // Resume Text Display (enter text mode).
    const TR = {b1: 0x14, b2: 0x2a}; // Text Restart (clear buffer + enter).
    const CR = {b1: 0x14, b2: 0x2d}; // Carriage Return (emit + scroll).

    /** A spread of fixed seeds so the suite covers many random inputs. */
    const SEEDS = [1, 2, 3, 7, 13, 42, 101, 1337, 65535, 0xc0ffee];

    /**
     * Deterministic 32-bit PRNG (mulberry32). Returns a function producing
     * floats in [0, 1). Seeding makes every generated case reproducible.
     * @param {number} seed
     * @return {function(): number}
     */
    function makeRng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /**
     * @param {function(): number} rng
     * @param {number} min
     * @param {number} max Inclusive.
     * @return {number}
     */
    function randInt(rng, min, max) {
      return min + Math.floor(rng() * (max - min + 1));
    }

    /**
     * Field-1 pair descriptor for buildCea608Sei with odd parity applied.
     * @param {number} b1
     * @param {number} b2
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function pair(b1, b2) {
      return {field: 1, b1, b2, applyParity: true};
    }

    // For every seed, enter text mode (randomly via RTD or TR), type a random
    // run of non-empty printable text, then issue a CR at a strictly later pts
    // (the decoder seeds prevEndTime_ via firstPts(), so startTime < endTime is
    // required for emission). At least one cue must be emitted on a T{n}
    // stream.
    for (const seed of SEEDS) {
      it(`emits a text-mode cue for random text + CR (seed ${seed})`, () => {
        const rng = makeRng(seed);
        decoder.clear();

        // Randomly choose the text-mode entry control code.
        const entry = rng() < 0.5 ? RTD : TR;

        // Build a non-empty run of printable basic North American characters,
        // each pair carrying two characters. Bytes are drawn from [0x21, 0x7e]
        // (printable, excluding space and DEL) so the typed text is always
        // visibly non-empty. The pair count stays small so the entry, text,
        // and CR comfortably fit within a single SEI message's triple budget.
        const pairCount = randInt(rng, 1, 12);
        const entered = [pair(entry.b1, entry.b2)];
        for (let i = 0; i < pairCount; i++) {
          const c1 = randInt(rng, 0x21, 0x7e);
          const c2 = randInt(rng, 0x21, 0x7e);
          entered.push(pair(c1, c2));
        }

        decoder.extract(CeaUtils.buildCea608Sei(entered), /* pts= */ 1);
        // The CR arrives at a strictly later pts so that startTime < endTime.
        decoder.extract(
            CeaUtils.buildCea608Sei([pair(CR.b1, CR.b2)]), /* pts= */ 2);

        const captions = decoder.decode();

        // Text mode must be live: at least one cue is emitted, and every
        // emitted cue lands on a text-mode stream (T1-T4).
        expect(captions.length).toBeGreaterThanOrEqual(1);
        for (const caption of captions) {
          expect(caption.stream[0]).toBe('T');
        }
      });
    }
  });

  describe('CEA-608 mode exclusivity (seeded-random properties)', () => {
    // After a random walk through mode-switch controls, typed characters emerge
    // on exactly the stream that mode mandates (CC{n} or T{n}).

    // Mode-switch control codes (field 1, channel 1). Each selects one of the
    // four CEA-608 display modes and points curBuf_ at that mode's buffer.
    const RCL = {b1: 0x14, b2: 0x20}; // Pop-on: curBuf -> non-displayed.
    const RDC = {b1: 0x14, b2: 0x29}; // Paint-on: curBuf -> displayed.
    const RU2 = {b1: 0x14, b2: 0x25}; // Roll-up 2: curBuf -> displayed.
    const RU3 = {b1: 0x14, b2: 0x26}; // Roll-up 3: curBuf -> displayed.
    const RU4 = {b1: 0x14, b2: 0x27}; // Roll-up 4: curBuf -> displayed.
    const RTD = {b1: 0x14, b2: 0x2b}; // Resume Text Display: curBuf -> text.
    const TR = {b1: 0x14, b2: 0x2a}; // Text Restart: curBuf -> text.

    // Flush control codes used to force the active buffer out as a cue.
    const EOC = {b1: 0x14, b2: 0x2f}; // End Of Caption (flip pop-on memory).
    const EDM = {b1: 0x14, b2: 0x2c}; // Erase Displayed Memory (emit display).
    const CR = {b1: 0x14, b2: 0x2d}; // Carriage Return (emit scroll window).
    const AON = {b1: 0x14, b2: 0x23}; // Alarm-On no-op; breaks dup-suppression.

    /** Stable identifiers for the four CEA-608 display modes. */
    const Mode = {
      POPON: 'POPON',
      PAINTON: 'PAINTON',
      ROLLUP: 'ROLLUP',
      TEXT: 'TEXT',
    };

    /** Every mode-switch code paired with the mode it selects. */
    const MODE_SWITCHES = [
      {mode: Mode.POPON, code: RCL},
      {mode: Mode.PAINTON, code: RDC},
      {mode: Mode.ROLLUP, code: RU2},
      {mode: Mode.ROLLUP, code: RU3},
      {mode: Mode.ROLLUP, code: RU4},
      {mode: Mode.TEXT, code: RTD},
      {mode: Mode.TEXT, code: TR},
    ];

    /** A spread of fixed seeds so the suite covers many random inputs. */
    const SEEDS = [1, 2, 3, 7, 13, 42, 101, 1337, 65535, 0xc0ffee];

    /**
     * Deterministic 32-bit PRNG (mulberry32). Returns a function producing
     * floats in [0, 1). Seeding makes every generated case reproducible.
     * @param {number} seed
     * @return {function(): number}
     */
    function makeRng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /**
     * @param {function(): number} rng
     * @param {number} min
     * @param {number} max Inclusive.
     * @return {number}
     */
    function randInt(rng, min, max) {
      return min + Math.floor(rng() * (max - min + 1));
    }

    /**
     * Field-1 pair descriptor for buildCea608Sei with odd parity applied.
     * @param {number} b1
     * @param {number} b2
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function pair(b1, b2) {
      return {field: 1, b1, b2, applyParity: true};
    }

    // For every seed, walk a random-length sequence of mode switches, then
    // type a non-empty run of letters and flush. The flush is chosen to force
    // out whichever buffer the final mode made active, and is sent at strictly
    // increasing pts so that startTime < endTime (the decoder seeds
    // prevEndTime_ from the first packet's pts, which is 1 here).
    for (const seed of SEEDS) {
      it(`routes typed text to the active mode's stream (seed ${seed})`, () => {
        const rng = makeRng(seed);
        decoder.clear();

        // Build a random-length sequence of mode switches, separated by an AON
        // no-op so duplicate-control-code suppression never drops a switch and
        // the final switch always takes effect. No characters are typed during
        // the sequence, so every intermediate buffer stays empty and the
        // intermediate switches produce no cue (RU* force-emits only an empty
        // displayed memory, the others emit nothing).
        const switchCount = randInt(rng, 1, 8);
        const sequence = [];
        let finalMode = null;
        for (let i = 0; i < switchCount; i++) {
          const choice =
              MODE_SWITCHES[randInt(rng, 0, MODE_SWITCHES.length - 1)];
          if (i > 0) {
            sequence.push(pair(AON.b1, AON.b2)); // Break dup-suppression.
          }
          sequence.push(pair(choice.code.b1, choice.code.b2));
          finalMode = choice.mode;
        }

        // After the final switch, type a short non-empty run of letters
        // (A-Z) into whatever buffer the final mode made active.
        const charPairs = randInt(rng, 1, 4);
        for (let i = 0; i < charPairs; i++) {
          const c1 = randInt(rng, 0x41, 0x5a); // 'A'..'Z'
          const c2 = randInt(rng, 0x41, 0x5a); // 'A'..'Z'
          sequence.push(pair(c1, c2));
        }

        decoder.extract(CeaUtils.buildCea608Sei(sequence), /* pts= */ 1);

        // Flush the active buffer per the final mode, at strictly later pts.
        let expectedStream;
        if (finalMode === Mode.POPON) {
          // Pop-on writes to non-displayed memory: EOC flips it into the
          // display (emitting the previously displayed, empty memory), then
          // EDM emits the now-displayed text.
          decoder.extract(
              CeaUtils.buildCea608Sei([pair(EOC.b1, EOC.b2)]), /* pts= */ 2);
          decoder.extract(
              CeaUtils.buildCea608Sei([pair(EDM.b1, EDM.b2)]), /* pts= */ 3);
          expectedStream = 'CC1';
        } else if (finalMode === Mode.PAINTON) {
          // Paint-on writes to displayed memory: EDM emits it directly.
          decoder.extract(
              CeaUtils.buildCea608Sei([pair(EDM.b1, EDM.b2)]), /* pts= */ 2);
          expectedStream = 'CC1';
        } else if (finalMode === Mode.ROLLUP) {
          // Roll-up writes to displayed memory: CR emits + scrolls it.
          decoder.extract(
              CeaUtils.buildCea608Sei([pair(CR.b1, CR.b2)]), /* pts= */ 2);
          expectedStream = 'CC1';
        } else { // Mode.TEXT
          // Text mode writes to the text buffer: CR emits + scrolls it on the
          // text stream.
          decoder.extract(
              CeaUtils.buildCea608Sei([pair(CR.b1, CR.b2)]), /* pts= */ 2);
          expectedStream = 'T1';
        }

        const captions = decoder.decode();

        // Exactly one cue is produced -- a single active buffer received the
        // characters -- and it lands on exactly the stream the final mode
        // mandates: a text stream (T1) for text mode, a caption stream (CC1)
        // for the three caption modes. This is the observable witness that
        // curBuf_ matched type_ at the point the characters were written.
        expect(captions.length).toBe(1);
        expect(captions[0].stream).toBe(expectedStream);
      });
    }
  });

  describe('CEA-608 display modes', () => {
    // Example tests locking the CEA-608 display-mode semantics.
    // 2.6): the pop-on End Of Caption (EOC) memory flip, roll-up window sizing
    // (RU2/RU3/RU4) plus the pre-emit of any displayed non-roll-up content
    // before switching modes, and paint-on (RDC) mode exclusivity. Raw control
    // bytes are listed here; the test helper applies odd parity.

    // Miscellaneous control codes (field 1). The channel bit lives in b1.
    const RCL = {b1: 0x14, b2: 0x20}; // Resume Caption Loading (pop-on).
    const EOC = {b1: 0x14, b2: 0x2f}; // End Of Caption (flip memories).
    const EDM = {b1: 0x14, b2: 0x2c}; // Erase Displayed Memory.
    const CR = {b1: 0x14, b2: 0x2d}; // Carriage Return (emit + scroll).
    const AON = {b1: 0x14, b2: 0x23}; // Alarm-On no-op; breaks dup-suppression.
    const RDC = {b1: 0x14, b2: 0x29}; // Resume Direct Captions (paint-on).
    /** Roll-Up control codes keyed by their window size (rows). */
    const RU = {
      2: {b1: 0x14, b2: 0x25}, // Roll-Up, 2 rows.
      3: {b1: 0x14, b2: 0x26}, // Roll-Up, 3 rows.
      4: {b1: 0x14, b2: 0x27}, // Roll-Up, 4 rows.
    };

    beforeEach(() => {
      decoder.clear();
    });

    /**
     * Builds a field-1 CEA-608 pair descriptor for buildCea608Sei with odd
     * parity applied. The channel bit lives in b1, so callers pass the raw
     * control bytes verbatim.
     * @param {number} b1
     * @param {number} b2
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function pair(b1, b2) {
      return {field: 1, b1, b2, applyParity: true};
    }

    /**
     * Concatenates the nested-cue payloads of an emitted caption into a string.
     * @param {!shaka.extern.ICaptionDecoder.ClosedCaption} caption
     * @return {string}
     */
    function textOf(caption) {
      return caption.cue.nestedCues.map((c) => c.payload).join('');
    }

    /**
     * Counts the line-break cues in an emitted caption. A roll-up window of N
     * rows produces N - 1 line breaks between its rows.
     * @param {!shaka.extern.ICaptionDecoder.ClosedCaption} caption
     * @return {number}
     */
    function lineBreakCount(caption) {
      return caption.cue.nestedCues.filter((c) => c.lineBreak).length;
    }

    // End Of Caption emits the currently displayed memory AND swaps
    // displayed/non-displayed memory. Two successive pop-on captions prove the
    // flip: the first EOC loads "AB" into the display (emitting nothing yet),
    // the second EOC emits that displayed "AB" and swaps in the freshly loaded
    // "CD", which a trailing EDM then emits.
    it('flips loaded memory into the display and emits the prior caption ' +
        'on EOC', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(RCL.b1, RCL.b2), // Pop-on: load the non-displayed buffer.
        pair(0x41, 0x42), // A, B
        pair(EOC.b1, EOC.b2), // EOC flips "AB" into the display.
      ]), /* pts= */ 1);
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(RCL.b1, RCL.b2), // Pop-on: load the (now empty) non-displayed buf.
        pair(0x43, 0x44), // C, D
        pair(EOC.b1, EOC.b2), // EOC emits "AB" and flips "CD" into the display.
      ]), /* pts= */ 2);
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(EDM.b1, EDM.b2), // EDM emits the now-displayed "CD".
      ]), /* pts= */ 3);

      const captions = decoder.decode();
      expect(captions.length).toBe(2);
      // The first emit is the previously displayed "AB": EOC emits the
      // currently displayed memory BEFORE swapping the loaded buffer in.
      expect(captions[0].stream).toBe('CC1');
      expect(textOf(captions[0])).toBe('AB');
      expect(captions[0].cue.startTime).toBe(1);
      expect(captions[0].cue.endTime).toBe(2);
      // The second emit is "CD": the second EOC swapped the freshly loaded
      // non-displayed buffer into the display.
      expect(captions[1].stream).toBe('CC1');
      expect(textOf(captions[1])).toBe('CD');
      expect(captions[1].cue.startTime).toBe(2);
      expect(captions[1].cue.endTime).toBe(3);
    });

    // pop-on writes go to the non-displayed buffer, which is not
    // shown until an EOC flips it in. Without an EOC, an EDM finds the
    // displayed memory empty and emits nothing.
    it('does not display loaded pop-on memory until an EOC flips it in', () => {
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(RCL.b1, RCL.b2), // Pop-on mode.
        pair(0x41, 0x42), // A, B loaded into non-displayed memory.
      ]), /* pts= */ 1);
      decoder.extract(CeaUtils.buildCea608Sei([
        pair(EDM.b1, EDM.b2), // EDM erases/emits the (empty) displayed memory.
      ]), /* pts= */ 2);

      const captions = decoder.decode();
      // No EOC arrived, so the loaded "AB" never flipped into the display.
      expect(captions).toEqual([]);
    });

    /**
     * Rolls up `lineCount` single-pair lines in a window of `size` rows. The
     * Roll-Up command is prepended to the first packet; every line is sent in
     * its own SEI at a strictly increasing pts (so each Carriage Return emits
     * with startTime < endTime), and an Alarm-On no-op trails each CR to defeat
     * the duplicate-control-code suppression between consecutive CRs.
     * @param {number} size Roll-up window size (2, 3, or 4).
     * @param {number} lineCount Number of lines to roll up.
     * @return {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>}
     */
    function rollup(size, lineCount) {
      for (let i = 0; i < lineCount; i++) {
        const pairs = [];
        if (i === 0) {
          pairs.push(pair(RU[size].b1, RU[size].b2)); // Enter roll-up.
        }
        // Two distinct letters per line keep each rolled row visibly non-empty.
        pairs.push(pair(0x41 + i, 0x61 + i));
        pairs.push(pair(CR.b1, CR.b2)); // Emit + scroll.
        pairs.push(pair(AON.b1, AON.b2)); // No-op; resets dup-suppression.
        decoder.extract(CeaUtils.buildCea608Sei(pairs), /* pts= */ i + 1);
      }
      return decoder.decode();
    }

    // a Roll-Up command sets the scroll window to the requested size.
    // Rolling up more lines than the window holds saturates it, so the final
    // emitted caption shows exactly `size` rows (size - 1 line breaks). Testing
    // all three sizes proves RU2/RU3/RU4 are honored distinctly.
    for (const size of [2, 3, 4]) {
      it(`sets the roll-up window to exactly ${size} rows (RU${size})`, () => {
        // Six lines saturates every window size in [2, 4].
        const captions = rollup(size, /* lineCount= */ 6);
        expect(captions.length).toBeGreaterThan(0);
        const last = captions[captions.length - 1];
        expect(last.stream).toBe('CC1');
        // A saturated N-row window emits N rows, i.e. N - 1 line breaks.
        expect(lineBreakCount(last)).toBe(size - 1);
      });
    }

    // a Roll-Up command must emit any displayed non-roll-up content
    // before switching modes. A pop-on "test" is flipped into the display, then
    // an RU2 arrives: the displayed "test" is emitted as the mode switches.
    it('emits displayed non-roll-up content before switching to roll-up',
        () => {
          decoder.extract(CeaUtils.buildCea608Sei([
            pair(RCL.b1, RCL.b2), // Pop-on mode.
            pair(0x74, 0x65), // t, e
            pair(0x73, 0x74), // s, t
            pair(EOC.b1, EOC.b2), // Flip "test" into the display.
          ]), /* pts= */ 1);
          decoder.extract(CeaUtils.buildCea608Sei([
            pair(RU[2].b1, RU[2].b2), // RU2 forces out "test" before switching.
          ]), /* pts= */ 2);

          const captions = decoder.decode();
          expect(captions.length).toBe(1);
          expect(captions[0].stream).toBe('CC1');
          expect(textOf(captions[0])).toBe('test');
          expect(captions[0].cue.startTime).toBe(1);
          expect(captions[0].cue.endTime).toBe(2);
        });

    // paint-on (RDC) directs character writes to the displayed buffer,
    // and only one mode is active at a time. Pop-on first loads "AB" into the
    // non-displayed buffer; RDC then makes the displayed buffer active, so "CD"
    // is written there. A trailing EDM emits only the paint-on "CD" -- the
    // pop-on "AB" sits in the non-displayed buffer and was never flipped in.
    it('paint-on (RDC) writes to displayed memory, keeping modes exclusive',
        () => {
          decoder.extract(CeaUtils.buildCea608Sei([
            pair(RCL.b1, RCL.b2), // Pop-on: active buffer is non-displayed.
            pair(0x41, 0x42), // A, B -> non-displayed memory.
            pair(RDC.b1, RDC.b2), // Paint-on: active buffer becomes displayed.
            pair(0x43, 0x44), // C, D -> displayed memory.
          ]), /* pts= */ 1);
          decoder.extract(CeaUtils.buildCea608Sei([
            pair(EDM.b1, EDM.b2), // Emit the displayed memory.
          ]), /* pts= */ 2);

          const captions = decoder.decode();
          expect(captions.length).toBe(1);
          expect(captions[0].stream).toBe('CC1');
          // Only the paint-on text in displayed memory is emitted.
          expect(textOf(captions[0])).toBe('CD');
        });
  });

  describe('decodes CEA-708', () => {
    // Hide window (2 bytes), with a bitmap provided to indicate all windows.
    const hideWindow = new Uint8Array([
      ...atscCaptionInitBytes, 0xc2, /* padding= */ 0xff,
      0xff, 0x02, 0x22, // Service #1, and 2 bytes will follow.
      0xfe, 0x8a, 0xff,
    ]);

    it('well-formed caption packet that contains valid control codes', () => {
      const startTime = 1;
      const endTime = 2;
      const bytePairCount = 0x07;
      const captionData = 0xc0 | bytePairCount;
      const serviceNumber = 1;
      const cea708Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        // Byte 1 (0x07) is a DTVCC_PACKET_START that states 7 * 2 - 1 bytes
        // will follow. Byte 2 is a service block header that selects service #
        // and states that there are 12 bytes that will follow in the block.
        0xff, 0x07, (serviceNumber << 5) | 12,

        // Define window (7 bytes). Visible window #0 with 10 rows, 10 columns.
        0xfe, 0x98, 0x38,
        0xfe, 0x00, 0x00,
        0xfe, 0x0a, 0x0a,
        0xfe, 0x00,

        // Series of G0 control codes that add text
        0x74, // t
        0xfe, 0x65, 0x73, // e, s
        0xfe, 0x74, 0x00, // t, padding
      ]);

      decoder.extract(cea708Packet, startTime);
      decoder.extract(hideWindow, endTime);

      const text = 'test';
      const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
          serviceNumber, 0, 11, 11);
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
      ];

      const expectedCaptions = [
        {
          stream: 'svc1',
          cue: topLevelCue,
        },
      ];

      const captions = decoder.decode();
      expect(captions).toEqual(expectedCaptions);
    });

    it('service block contains a corrupted header', () => {
      const startTime = 1;
      const endTime = 2;
      const bytePairCount = 0x02;
      const captionData = 0xc0 | bytePairCount;
      const serviceNumber = 1;
      const cea708Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        // Byte 1 (0x01) is DTVCC_PACKET_START that states 1 * 2 - 1 bytes
        // will follow. Byte 2 is a service block header that selects service #
        // and states that there are 12 bytes that will follow in the block.
        0xff, 0x01, (serviceNumber << 5) | 12,
        0xfe, 0x00, 0x00,
      ]);

      // The data corrupted, since the service block header claimed 12 bytes
      // would follow, but only two bytes followed.
      decoder.extract(cea708Packet, startTime);
      decoder.extract(hideWindow, endTime);

      // Then we should have warned of the invalid data and stopped processing
      // the block without interrupting playback.
      spyOn(shaka.log, 'warnOnce').and.callThrough();

      const captions = decoder.decode();
      expect(shaka.log.warnOnce).toHaveBeenCalledWith('CEA708_INVALID_DATA',
          'Buffer read out of bounds / invalid CEA-708 Data.');
      expect(shaka.log.warnOnce).toHaveBeenCalledTimes(1);
      expect(captions).toEqual([]);
    });

    it('recovers from a malformed block without corrupting built windows',
        () => {
          // over-read): a malformed service block that declares more bytes than
          // are present makes DtvccPacket.readByte run off the end of the
          // packet, raising a typed shaka.util.Error with Code
          // BUFFER_READ_OUT_OF_BOUNDS. decodeCea708_ must catch it, log exactly
          // once via warnOnce('CEA708_INVALID_DATA', ...), and continue
          // decoding subsequent packets without corrupting window state that
          // was built by an EARLIER packet.
          const serviceNumber = 1;
          const startTime = 1;
          const midTime = 2;
          const endTime = 3;

          // SEI 1 (valid): define a visible window #0 (11 rows x 11 cols) and
          // render "test" into it. This builds window state that lives on the
          // persistent Cea708Service for service #1.
          const defineWindow = [0x98, 0x38, 0x00, 0x00, 0x0a, 0x0a, 0x00];
          const text = [0x74, 0x65, 0x73, 0x74]; // t, e, s, t
          const validSei = CeaUtils.buildDtvccSei([
            CeaUtils.dtvccServiceBlock(
                serviceNumber, [...defineWindow, ...text]),
          ]);

          // SEI 2 (malformed): a service block for the SAME service whose
          // header claims 31 (0x1f) bytes follow, but only two benign null
          // bytes are actually present. Reading the declared block length runs
          // past the end of the DTVCC packet and throws
          // BUFFER_READ_OUT_OF_BOUNDS. The header is built by hand because the
          // dtvccServiceBlock() helper would otherwise compute an honest
          // (matching) block size.
          const malformedHeader = ((serviceNumber & 0x07) << 5) | 0x1f;
          const malformedSei = CeaUtils.buildDtvccSei([
            [malformedHeader, 0x00, 0x00],
          ]);

          // SEI 3 (valid): hide all windows, which flushes the earlier window
          // #0 out as a cue. If the malformed block had corrupted the window,
          // this would emit nothing or the wrong text.
          const hideSei = CeaUtils.buildDtvccSei([
            CeaUtils.dtvccServiceBlock(serviceNumber, [0x8a, 0xff]),
          ]);

          spyOn(shaka.log, 'warnOnce').and.callThrough();

          decoder.clear();
          decoder.extract(validSei, startTime);
          decoder.extract(malformedSei, midTime);
          decoder.extract(hideSei, endTime);

          // decode() must not let the typed error propagate out.
          /** @type {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>} */
          let captions = [];
          expect(() => {
            captions = decoder.decode();
          }).not.toThrow();

          // The malformed block was caught and logged exactly once.
          expect(shaka.log.warnOnce).toHaveBeenCalledWith('CEA708_INVALID_DATA',
              'Buffer read out of bounds / invalid CEA-708 Data.');
          expect(shaka.log.warnOnce).toHaveBeenCalledTimes(1);

          // The previously-built window survived intact: hiding it still emits
          // the earlier "test" content on the right stream.
          expect(captions.length).toBe(1);
          expect(captions[0].stream).toBe('svc' + serviceNumber);
          expect(captions[0].cue.nestedCues.map((c) => c.payload).join(''))
              .toBe('test');
        });
  });

  describe('CEA-708 DTVCC block alignment (seeded-random properties)', () => {
    // Delay (0x8d) consumes one operand byte; DelayCancel (0x8e) has none.
    // Interleaving them among G0 text must not change the rendered output.

    const serviceNumber = 1;

    /** A spread of fixed seeds so the suite covers many random inputs. */
    const SEEDS = [1, 2, 3, 7, 13, 42, 101, 1337, 65535, 0xc0ffee];

    // DefineWindow #0 (DF0, 0x98) + 6 bytes: a visible window with 11 rows and
    // 11 columns and window/pen style 0. Matches the existing CEA-708 fixtures.
    const defineWindow = [0x98, 0x38, 0x00, 0x00, 0x0a, 0x0a, 0x00];

    // HideWindows (HDW, 0x8a) with an all-ones bitmap, in its own SEI; hiding a
    // visible window forces its buffer out as a cue.
    const hideSei = CeaUtils.buildDtvccSei(
        [CeaUtils.dtvccServiceBlock(serviceNumber, [0x8a, 0xff])]);

    beforeEach(() => {
      decoder.clear();
    });

    /**
     * Deterministic 32-bit PRNG (mulberry32). Returns a function producing
     * floats in [0, 1). Seeding makes every generated case reproducible.
     * @param {number} seed
     * @return {function(): number}
     */
    function makeRng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /**
     * @param {function(): number} rng
     * @param {number} min
     * @param {number} max Inclusive.
     * @return {number}
     */
    function randInt(rng, min, max) {
      return min + Math.floor(rng() * (max - min + 1));
    }

    /**
     * Wraps a service-block body (DefineWindow followed by the supplied bytes)
     * as a DTVCC SEI for the test service.
     * @param {!Array<number>} bodyBytes
     * @return {!Uint8Array}
     */
    function buildServiceSei(bodyBytes) {
      const data = [...defineWindow, ...bodyBytes];
      const block = CeaUtils.dtvccServiceBlock(serviceNumber, data);
      return CeaUtils.buildDtvccSei([block]);
    }

    /**
     * Decodes a single service block (DefineWindow + body), then hides the
     * window to flush it, and returns the concatenated rendered text. Asserts
     * exactly one caption was emitted on the expected service stream.
     * @param {!Array<number>} bodyBytes
     * @return {string}
     */
    function decodeText(bodyBytes) {
      decoder.clear();
      decoder.extract(buildServiceSei(bodyBytes), /* pts= */ 1);
      decoder.extract(hideSei, /* pts= */ 2);
      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      expect(captions[0].stream).toBe('svc' + serviceNumber);
      return captions[0].cue.nestedCues.map((c) => c.payload).join('');
    }

    // A delay operand drawn from values that include printable G0 codes, so a
    // mis-counted operand would visibly leak into the rendered text.
    /**
     * @param {function(): number} rng
     * @return {number}
     */
    function randomDelayOperand(rng) {
      // Half the time use a printable letter ('A'..'Z'); otherwise any byte.
      return rng() < 0.5 ?
          randInt(rng, 0x41, 0x5a) : randInt(rng, 0x00, 0xff);
    }

    // interleaving Delay / DelayCancel commands among G0 text never
    // changes the rendered text, because each command consumes exactly its
    // spec-defined length and leaves the block aligned.
    for (const seed of SEEDS) {
      it(`keeps the block aligned across random delays (seed ${seed})`, () => {
        const rng = makeRng(seed);

        // Build a token stream of text characters ('A'..'Z'), Delay commands
        // (0x8d + operand), and DelayCancel commands (0x8e). At least one text
        // character (so something is rendered) and at least one Delay (so the
        // operand-consumption path is exercised).
        const textCount = randInt(rng, 1, 8);
        const delayCount = randInt(rng, 1, 4);
        const cancelCount = randInt(rng, 0, 2);

        const tokens = [];
        for (let i = 0; i < textCount; i++) {
          tokens.push({type: 'text', byte: randInt(rng, 0x41, 0x5a)});
        }
        for (let i = 0; i < delayCount; i++) {
          tokens.push({type: 'delay', operand: randomDelayOperand(rng)});
        }
        for (let i = 0; i < cancelCount; i++) {
          tokens.push({type: 'delayCancel'});
        }

        // Deterministic Fisher-Yates shuffle so commands and text interleave.
        for (let i = tokens.length - 1; i > 0; i--) {
          const j = randInt(rng, 0, i);
          const tmp = tokens[i];
          tokens[i] = tokens[j];
          tokens[j] = tmp;
        }

        // Flatten the tokens into service-block body bytes.
        const withDelays = [];
        for (const token of tokens) {
          if (token.type === 'text') {
            withDelays.push(token.byte);
          } else if (token.type === 'delay') {
            withDelays.push(0x8d, token.operand);
          } else {
            withDelays.push(0x8e);
          }
        }

        // The expected text is just the text tokens, in their shuffled order;
        // delay operands and command bytes must contribute nothing.
        const textBytes =
            tokens.filter((t) => t.type === 'text').map((t) => t.byte);
        const expectedText =
            textBytes.map((b) => String.fromCharCode(b)).join('');

        // Decode the delay-laden block and the delay-free baseline.
        const withDelaysText = decodeText(withDelays);
        const baselineText = decodeText(textBytes);

        // Alignment proof: the delays neither shift nor leak any bytes.
        expect(withDelaysText).toBe(expectedText);
        expect(withDelaysText).toBe(baselineText);
      });
    }

    // A focused, non-random case: a Delay whose operand byte (0x41 = 'A') is a
    // printable G0 code sits between 'H' and 'I'. If the operand were not
    // consumed it would render as 'A' (giving "HAI"); correct alignment yields
    // "HI".
    it('consumes a printable delay operand instead of rendering it', () => {
      const body = [
        0x48, // 'H'
        0x8d, 0x41, // Delay, operand 0x41 ('A') -- must be consumed.
        0x49, // 'I'
      ];
      expect(decodeText(body)).toBe('HI');
    });

    // DelayCancel (0x8e) carries no operand; placing it between 'O' and 'K'
    // must not consume the following text byte.
    it('treats DelayCancel as a single byte with no operand', () => {
      const body = [
        0x4f, // 'O'
        0x8e, // DelayCancel, no operand.
        0x4b, // 'K'
      ];
      expect(decodeText(body)).toBe('OK');
    });
  });

  describe('cue output correctness (timing and structure)', () => {
    // Emitted cues must have startTime < endTime, be well-ordered per stream,
    // and form a Cue tree of styled runs and line breaks.
    const RU2 = {b1: 0x14, b2: 0x25}; // Roll-Up, 2 rows.
    const CR = {b1: 0x14, b2: 0x2d}; // Carriage Return (emit + scroll).
    const AON = {b1: 0x14, b2: 0x23}; // Alarm-On no-op; breaks dup-suppression.

    const serviceNumber = 1;

    beforeEach(() => {
      decoder.clear();
    });

    /**
     * Builds a field-1 CEA-608 pair descriptor for buildCea608Sei with odd
     * parity applied. The channel bit lives in b1, so callers pass the raw
     * control bytes verbatim.
     * @param {number} b1
     * @param {number} b2
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function pair(b1, b2) {
      return {field: 1, b1, b2, applyParity: true};
    }

    /**
     * Concatenates the nested-cue payloads of an emitted caption into a string.
     * @param {!shaka.extern.ICaptionDecoder.ClosedCaption} caption
     * @return {string}
     */
    function textOf(caption) {
      return caption.cue.nestedCues.map((c) => c.payload).join('');
    }

    /**
     * Asserts timing invariants over an emitted caption list that all belong
     * to a single stream: each cue has startTime < endTime, and consecutive
     * cues are non-overlapping and ordered (next.startTime >= prev.endTime).
     * @param {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>} captions
     */
    function assertWellOrderedTiming(captions) {
      for (let i = 0; i < captions.length; i++) {
        const cue = captions[i].cue;
        expect(cue.startTime).toBeLessThan(cue.endTime);
        if (i > 0) {
          expect(cue.startTime)
              .toBeGreaterThanOrEqual(captions[i - 1].cue.endTime);
        }
      }
    }

    // A CEA-608 roll-up stream emits a cue per Carriage Return.
    it('emits well-ordered CEA-608 roll-up cues on a single stream', () => {
      const lineCount = 4;
      for (let i = 0; i < lineCount; i++) {
        const pairs = [];
        if (i === 0) {
          pairs.push(pair(RU2.b1, RU2.b2)); // Enter roll-up (2 rows).
        }
        // Two distinct letters per line keep each rolled row non-empty.
        pairs.push(pair(0x41 + i, 0x61 + i));
        pairs.push(pair(CR.b1, CR.b2)); // Emit + scroll.
        pairs.push(pair(AON.b1, AON.b2)); // No-op; resets dup-suppression.
        decoder.extract(CeaUtils.buildCea608Sei(pairs), /* pts= */ i + 1);
      }

      const captions = decoder.decode();
      // Several consecutive cues are produced (one per Carriage Return).
      expect(captions.length).toBeGreaterThan(1);
      // They all belong to the same captioning stream.
      for (const caption of captions) {
        expect(caption.stream).toBe('CC1');
      }
      assertWellOrderedTiming(captions);
    });

    // A saturated 2-row roll-up window emits two text rows with one line break.
    it('emits a CEA-608 roll-up caption as a nested Cue tree with a line ' +
        'break', () => {
      const lineCount = 4;
      for (let i = 0; i < lineCount; i++) {
        const pairs = [];
        if (i === 0) {
          pairs.push(pair(RU2.b1, RU2.b2)); // Enter roll-up (2 rows).
        }
        pairs.push(pair(0x41 + i, 0x61 + i)); // Two distinct letters per line.
        pairs.push(pair(CR.b1, CR.b2)); // Emit + scroll.
        pairs.push(pair(AON.b1, AON.b2)); // No-op; resets dup-suppression.
        decoder.extract(CeaUtils.buildCea608Sei(pairs), /* pts= */ i + 1);
      }

      const captions = decoder.decode();
      expect(captions.length).toBeGreaterThan(1);

      // Inspect the last caption: a 2-row roll-up window shows both rows.
      const caption = captions[captions.length - 1];
      const topLevelCue = caption.cue;
      // The emitted caption is a Cue tree.
      expect(topLevelCue).toEqual(jasmine.any(shaka.text.Cue));
      expect(topLevelCue.nestedCues.length).toBeGreaterThan(0);
      // Every child is itself a Cue (styled run or line break).
      for (const nested of topLevelCue.nestedCues) {
        expect(nested).toEqual(jasmine.any(shaka.text.Cue));
      }

      // The two rows are separated by exactly one line-break cue, with a
      // non-empty text run on either side of it.
      const lineBreakIndexes = [];
      topLevelCue.nestedCues.forEach((nested, index) => {
        if (nested.lineBreak) {
          lineBreakIndexes.push(index);
        }
      });
      expect(lineBreakIndexes.length).toBe(1);
      const breakIndex = lineBreakIndexes[0];
      // A text run precedes and follows the line break.
      expect(breakIndex).toBeGreaterThan(0);
      expect(breakIndex).toBeLessThan(topLevelCue.nestedCues.length - 1);
      expect(topLevelCue.nestedCues[breakIndex - 1].payload).not.toBe('');
      expect(topLevelCue.nestedCues[breakIndex + 1].payload).not.toBe('');
      // The line-break cue itself carries no text.
      expect(topLevelCue.nestedCues[breakIndex].payload).toBe('');
    });

    // A styled CEA-608 run is surfaced as a nested cue that carries
    // the run's style fields (here: green, underlined text). This proves the
    // nested-cue structure expresses styled runs, not just plain text.
    it('expresses a styled CEA-608 run as a styled nested cue', () => {
      const controlCount = 0x08;
      const captionData = 0xc0 | controlCount;
      // Pop-on "green" on CC3 with an underline + green PAC (matches the
      // existing styling fixtures).
      const greenTextCC3Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfd, 0x15, 0x20, // Pop-on mode (RCL control code) on CC3.
        0xfd, 0x13, 0xe3, // PAC: underline + green on the last row.
        0xfd, 0x67, 0xf2, // g, r
        0xfd, 0xe5, 0xe5, // e, e
        0xfd, 0x6e, 0x20, // n, space
        0xfd, 0xf4, 0xe5, // t, e
        0xfd, 0xf8, 0xf4, // x, t
        0xfd, 0x15, 0x2f, // EOC
      ]);
      // EDM (on every mode/channel) forces the displayed memory out as a cue.
      const eraseDisplayedMemory = new Uint8Array([
        ...atscCaptionInitBytes, 0xc4, /* padding= */ 0xff,
        0xfc, 0x94, 0x2c, // EDM on CC1.
        0xfc, 0x1c, 0x2c, // EDM on CC2.
        0xfd, 0x15, 0x2c, // EDM on CC3.
        0xfd, 0x9d, 0x2c, // EDM on CC4.
      ]);

      decoder.extract(greenTextCC3Packet, /* pts= */ 1);
      decoder.extract(eraseDisplayedMemory, /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      const topLevelCue = captions[0].cue;
      expect(topLevelCue).toEqual(jasmine.any(shaka.text.Cue));
      expect(topLevelCue.nestedCues.length).toBe(1);

      const styledRun = topLevelCue.nestedCues[0];
      expect(styledRun).toEqual(jasmine.any(shaka.text.Cue));
      expect(styledRun.payload).toBe('green text');
      // The run carries the styling expressed by the PAC.
      expect(styledRun.color).toBe('green');
      expect(styledRun.textDecoration)
          .toContain(shaka.text.Cue.textDecoration.UNDERLINE);
      // The timing invariant still holds for a single emitted cue.
      assertWellOrderedTiming(captions);
    });

    // A CEA-708 service emits a cue per Form Feed (which
    // flushes the visible window and clears it). Three Form Feeds followed by a
    // window hide produce a run of cues on one service stream that must all
    // satisfy the timing invariants.
    it('emits well-ordered CEA-708 cues on a single stream', () => {
      // DefineWindow #0 (DF0, 0x98) + 6 bytes: a visible 11x11 window. Matches
      // the existing CEA-708 fixtures.
      const defineWindow = [0x98, 0x38, 0x00, 0x00, 0x0a, 0x0a, 0x00];
      const formFeed = 0x0c; // C0 Form Feed: emit (if visible) then clear.

      // pts 1: define the window and load "AB".
      decoder.extract(CeaUtils.buildDtvccSei([CeaUtils.dtvccServiceBlock(
          serviceNumber, [...defineWindow, 0x41, 0x42])]), /* pts= */ 1);
      // pts 2: Form Feed flushes "AB", clears, then loads "CD".
      decoder.extract(CeaUtils.buildDtvccSei([CeaUtils.dtvccServiceBlock(
          serviceNumber, [formFeed, 0x43, 0x44])]), /* pts= */ 2);
      // pts 3: Form Feed flushes "CD", clears, then loads "EF".
      decoder.extract(CeaUtils.buildDtvccSei([CeaUtils.dtvccServiceBlock(
          serviceNumber, [formFeed, 0x45, 0x46])]), /* pts= */ 3);
      // pts 4: hide the window to flush "EF".
      decoder.extract(CeaUtils.buildDtvccSei([CeaUtils.dtvccServiceBlock(
          serviceNumber, [0x8a, 0xff])]), /* pts= */ 4);

      const captions = decoder.decode();
      expect(captions.length).toBe(3);
      for (const caption of captions) {
        expect(caption.stream).toBe('svc' + serviceNumber);
      }
      expect(captions.map((c) => textOf(c))).toEqual(['AB', 'CD', 'EF']);
      assertWellOrderedTiming(captions);
    });

    // A CEA-708 caption spanning two rows is a shaka.text.Cue tree
    // whose nested cues are the per-row text runs separated by a line-break
    // cue. Text is written on row 0, the pen is moved to row 1 via
    // SetPenLocation, more text is written, and a window hide flushes the
    // single multi-row caption.
    it('emits a CEA-708 caption as a nested Cue tree with a line break', () => {
      const defineWindow = [0x98, 0x38, 0x00, 0x00, 0x0a, 0x0a, 0x00];
      // SetPenLocation (SPL, 0x92): row in b1's low nibble, col in b2.
      const setPenRow1 = [0x92, 0x01, 0x00];

      // Define a visible window, load "AB" on row 0, move the pen to row 1,
      // load "CD", all in one service block.
      decoder.extract(CeaUtils.buildDtvccSei([CeaUtils.dtvccServiceBlock(
          serviceNumber,
          [...defineWindow, 0x41, 0x42, ...setPenRow1, 0x43, 0x44])]),
      /* pts= */ 1);
      // Hide the window to flush the two-row caption.
      decoder.extract(CeaUtils.buildDtvccSei([CeaUtils.dtvccServiceBlock(
          serviceNumber, [0x8a, 0xff])]), /* pts= */ 2);

      const captions = decoder.decode();
      expect(captions.length).toBe(1);
      const topLevelCue = captions[0].cue;
      expect(topLevelCue).toEqual(jasmine.any(shaka.text.Cue));
      // Every child is a Cue (text run or line break).
      for (const nested of topLevelCue.nestedCues) {
        expect(nested).toEqual(jasmine.any(shaka.text.Cue));
      }

      // Exactly one line break separates the two rows, with a text run on
      // either side.
      const lineBreakIndexes = [];
      topLevelCue.nestedCues.forEach((nested, index) => {
        if (nested.lineBreak) {
          lineBreakIndexes.push(index);
        }
      });
      expect(lineBreakIndexes.length).toBe(1);
      const breakIndex = lineBreakIndexes[0];
      expect(breakIndex).toBeGreaterThan(0);
      expect(breakIndex).toBeLessThan(topLevelCue.nestedCues.length - 1);
      expect(topLevelCue.nestedCues[breakIndex - 1].payload).toBe('AB');
      expect(topLevelCue.nestedCues[breakIndex + 1].payload).toBe('CD');
      // The timing invariant holds for the emitted cue.
      assertWellOrderedTiming(captions);
    });
  });

  describe('monotonic cue timing (seeded-random properties)', () => {
    // Per stream: startTime < endTime, and consecutive cues satisfy
    // next.startTime >= prev.endTime.

    const RU2 = {b1: 0x14, b2: 0x25}; // Roll-Up, 2 rows.
    const CR = {b1: 0x14, b2: 0x2d}; // Carriage Return (emit + scroll).
    const AON = {b1: 0x14, b2: 0x23}; // Alarm-On no-op; breaks dup-suppression.

    const serviceNumber = 1;
    // DefineWindow #0 (DF0, 0x98) + 6 bytes: a visible 11x11 window. Matches
    // the existing CEA-708 fixtures.
    const defineWindow = [0x98, 0x38, 0x00, 0x00, 0x0a, 0x0a, 0x00];
    const formFeed = 0x0c; // C0 Form Feed: emit (if visible) then clear.
    const hideWindows = [0x8a, 0xff]; // HideWindows (HDW) with all-ones bitmap.

    /** A spread of fixed seeds so the suite covers many random inputs. */
    const SEEDS = [1, 2, 3, 7, 13, 42, 101, 1337, 65535, 0xc0ffee];

    beforeEach(() => {
      decoder.clear();
    });

    /**
     * Deterministic 32-bit PRNG (mulberry32). Returns a function producing
     * floats in [0, 1). Seeding makes every generated case reproducible.
     * @param {number} seed
     * @return {function(): number}
     */
    function makeRng(seed) {
      let a = seed >>> 0;
      return () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    /**
     * @param {function(): number} rng
     * @param {number} min
     * @param {number} max Inclusive.
     * @return {number}
     */
    function randInt(rng, min, max) {
      return min + Math.floor(rng() * (max - min + 1));
    }

    /**
     * Builds a field-1 CEA-608 pair descriptor for buildCea608Sei with odd
     * parity applied.
     * @param {number} b1
     * @param {number} b2
     * @return {{field: number, b1: number, b2: number, applyParity: boolean}}
     */
    function pair(b1, b2) {
      return {field: 1, b1, b2, applyParity: true};
    }

    /**
     * Wraps a CEA-708 service-block body for the test service as a DTVCC SEI.
     * @param {!Array<number>} bodyBytes
     * @return {!Uint8Array}
     */
    function dtvccSei(bodyBytes) {
      return CeaUtils.buildDtvccSei(
          [CeaUtils.dtvccServiceBlock(serviceNumber, bodyBytes)]);
    }

    /**
     * Groups an emitted caption list by its stream name.
     * @param {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>} captions
     * @return {!Map<string,
     *   !Array<!shaka.extern.ICaptionDecoder.ClosedCaption>>}
     */
    function groupByStream(captions) {
      const byStream = new Map();
      for (const caption of captions) {
        if (!byStream.has(caption.stream)) {
          byStream.set(caption.stream, []);
        }
        byStream.get(caption.stream).push(caption);
      }
      return byStream;
    }

    /**
     * Asserts over a list of cues that all belong to a
     * single stream: each cue has startTime < endTime, and consecutive cues
     * satisfy next.startTime >= prev.endTime.
     * @param {!Array<!shaka.extern.ICaptionDecoder.ClosedCaption>} captions
     */
    function assertWellOrderedTiming(captions) {
      for (let i = 0; i < captions.length; i++) {
        const cue = captions[i].cue;
        expect(cue.startTime).toBeLessThan(cue.endTime);
        if (i > 0) {
          expect(cue.startTime)
              .toBeGreaterThanOrEqual(captions[i - 1].cue.endTime);
        }
      }
    }
    // Across a randomized multi-stream decode, every stream's cues are
    // well-ordered in time.
    for (const seed of SEEDS) {
      it(`emits per-stream well-ordered cues (seed ${seed})`, () => {
        const rng = makeRng(seed);

        // Build a CEA-608 roll-up sub-sequence on CC1: one SEI per line, each
        // emitting a cue on its Carriage Return. The first line enters roll-up;
        // every line trails an Alarm-On no-op so duplicate-control-code
        // suppression never drops a consecutive Carriage Return.
        const lineCount = randInt(rng, 2, 5);
        const seq608 = [];
        for (let i = 0; i < lineCount; i++) {
          const pairs = [];
          if (i === 0) {
            pairs.push(pair(RU2.b1, RU2.b2));
          }
          // Two distinct letters per line keep each rolled row non-empty.
          const c1 = randInt(rng, 0x41, 0x5a); // 'A'..'Z'
          const c2 = randInt(rng, 0x41, 0x5a); // 'A'..'Z'
          pairs.push(pair(c1, c2));
          pairs.push(pair(CR.b1, CR.b2));
          pairs.push(pair(AON.b1, AON.b2));
          seq608.push(() => CeaUtils.buildCea608Sei(pairs));
        }

        // Build a CEA-708 sub-sequence on svc1: define a visible window with an
        // initial text run, then a number of Form Feeds (each flushes the
        // previous run and loads a new one), and finally a window hide to flush
        // the last run. This emits ffCount + 1 cues on svc1.
        const ffCount = randInt(rng, 1, 4);
        const seq708 = [];
        const firstChars = [randInt(rng, 0x41, 0x5a), randInt(rng, 0x41, 0x5a)];
        seq708.push(() => dtvccSei([...defineWindow, ...firstChars]));
        for (let i = 0; i < ffCount; i++) {
          const chars = [randInt(rng, 0x41, 0x5a), randInt(rng, 0x41, 0x5a)];
          seq708.push(() => dtvccSei([formFeed, ...chars]));
        }
        seq708.push(() => dtvccSei(hideWindows));

        // Interleave the two sub-sequences, preserving each one's relative
        // order, then deliver every SEI at a strictly increasing pts.
        let i608 = 0;
        let i708 = 0;
        let pts = 1;
        while (i608 < seq608.length || i708 < seq708.length) {
          const take608 = i708 >= seq708.length ||
              (i608 < seq608.length && rng() < 0.5);
          const build = take608 ? seq608[i608++] : seq708[i708++];
          decoder.extract(build(), /* pts= */ pts++);
        }

        const captions = decoder.decode();
        const byStream = groupByStream(captions);
        // More than one stream emitted cues, so the per-stream grouping is
        // exercised (CC1 from roll-up, svc1 from the CEA-708 service).
        expect(byStream.size).toBeGreaterThan(1);
        expect(byStream.has('CC1')).toBe(true);
        expect(byStream.has('svc' + serviceNumber)).toBe(true);
        // the timing invariant holds independently per stream.
        for (const streamCaptions of byStream.values()) {
          expect(streamCaptions.length).toBeGreaterThan(0);
          assertWellOrderedTiming(streamCaptions);
        }
      });
    }
  });
});
