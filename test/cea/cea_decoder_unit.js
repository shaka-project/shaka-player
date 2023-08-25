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

    // Blank padding control code between two control codes that are the same.
    const blankPaddingControlCode = new Uint8Array([0x97, 0x23]);

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
      topLevelCue.line = 81.25;
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
      topLevelCue.line = 6.25;
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
      topLevelCue.line = 12.5;
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
      topLevelCue.line = 6.25;
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
      topLevelCue.line = 6.25;
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

      // Top level cue corresponding to the first closed caption.
      const topLevelCue1 = new shaka.text.Cue(
          /* startTime= */ time1, /* endTime= */ time2, '');
      topLevelCue1.line = 93.75;
      topLevelCue1.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue1.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time1, /* endTime= */ time2, /* payload= */ '1.'),
      ];

      // Top level cue corresponding to the second closed caption.
      const topLevelCue2 = new shaka.text.Cue(
          /* startTime= */ time2, /* endTime= */ time3, '');
      topLevelCue2.line = 93.75;
      topLevelCue2.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue2.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time2, /* endTime= */ time3, /* payload= */ '1.'),

        CeaUtils.createLineBreakCue(
            /* startTime= */ time2, /* endTime= */ time3),

        CeaUtils.createDefaultCue(
            /* startTime= */ time2, /* endTime= */ time3, /* payload= */ '2.'),
      ];

      // Top level cue corresponding to the third closed caption.
      const topLevelCue3 = new shaka.text.Cue(
          /* startTime= */ time3, /* endTime= */ time4, '');
      topLevelCue3.line = 93.75;
      topLevelCue3.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue3.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time3, /* endTime= */ time4, /* payload= */ '2.'),

        CeaUtils.createLineBreakCue(
            /* startTime= */ time3, /* endTime= */ time4),

        CeaUtils.createDefaultCue(
            /* startTime= */ time3, /* endTime= */ time4, /* payload= */ '3.'),
      ];

      // Top level cue corresponding to the fourth closed caption.
      const topLevelCue4 = new shaka.text.Cue(
          /* startTime= */ time4, /* endTime= */ time5, '');
      topLevelCue4.line = 93.75;
      topLevelCue4.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue4.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time4, /* endTime= */ time5, /* payload= */ '3.'),

        CeaUtils.createLineBreakCue(
            /* startTime= */ time4, /* endTime= */ time5),

        CeaUtils.createDefaultCue(
            /* startTime= */ time4, /* endTime= */ time5, /* payload= */ '4.'),
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
          0xfc, 0x97, 0x23, // Blank padding control code
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, /* padding= */ 0xff,
          0xfc, 0x31, 0xae, // 1, .
          0xfc, ...carriageReturnControlCode,
          0xfc, 0x97, 0x23, // Blank padding control code
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

      // Top level cue corresponding to the first closed caption.
      const topLevelCue1 = new shaka.text.Cue(/* startTime= */ 1,
          /* endTime= */ 2, '');
      topLevelCue1.line = 93.75;
      topLevelCue1.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue1.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ 1, /* endTime= */ 2, /* payload= */ '1.'),
      ];

      // Top level cue corresponding to the second closed caption.
      const topLevelCue2 = new shaka.text.Cue(/* startTime= */ 2,
          /* endTime= */ 3, '');
      topLevelCue2.line = 25;
      topLevelCue2.lineInterpretation =
          shaka.text.Cue.lineInterpretation.PERCENTAGE;
      topLevelCue2.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ 2, /* endTime= */ 3, /* payload= */ '1.'),

        CeaUtils.createLineBreakCue(/* startTime= */ 2, /* endTime= */ 3),

        CeaUtils.createDefaultCue(
            /* startTime= */ 2, /* endTime= */ 3, /* payload= */ '2.'),
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

    it('does not emit text sent while in CEA-608 Text Mode', () => {
      const controlCount = 0x03;
      const captionData = 0xc0 | controlCount;
      const textModePacket = new Uint8Array([
        ...atscCaptionInitBytes, captionData, /* padding= */ 0xff,
        0xfc, 0x94, 0x2a, // Text mode (Text restart control code).
        0xfc, 0xf4, 0xe5, // t, e
        0xfc, 0x73, 0xf4, // s, t
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;

      decoder.extract(textModePacket, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);

      const captions = decoder.decode();
      expect(captions).toEqual([]);
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
      const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
  });
});
