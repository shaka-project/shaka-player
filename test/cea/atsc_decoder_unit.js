/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('CeaDecoder', () => {
  /** @type {!Uint8Array} */
  const atscCaptionInitBytes = new Uint8Array([
    0xb5, 0x00, 0x31, 0x47, 0x41, 0x39, 0x34, 0x03,
  ]);

  /** @type {!shaka.cea.CeaDecoder} */
  const decoder = new shaka.cea.CeaDecoder();

  describe('decodes cea608', () => {
    const edmCodeByte2 = 0x2c; // Erase displayed memory byte 2.

    // Blank padding control code between two control codes that are the same.
    const blankPaddingControlCode = new Uint8Array([0x97, 0x23]);

    // Erases displayed memory on every captioning mode.
    const eraseDisplayedMemory = new Uint8Array([
      ...atscCaptionInitBytes, 0xc4, 0xff,
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
        ...atscCaptionInitBytes, captionData, 0xff,
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

      const expectedCues = [{
        startTime: startTimeCaption1,
        endTime: startTimeCaption2,
        stream: 'CC3',
        text: '<u><c.green>green text</c></u>',
      }];

      decoder.extract(greenTextCC3Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const cues = decoder.decode();

      expect(cues).toEqual(expectedCues);
    });

    it('popon captions that change color and underline midrow on CC2', () => {
      const controlCount = 0x08;
      const captionData = 0xc0 | controlCount;
      const midrowStyleChangeCC2Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, 0xff,
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

      const expectedCues = [{
        startTime: startTimeCaption1,
        endTime: startTimeCaption2,
        stream: 'CC2',
        text: '-- <u><c.red>red</c></u> --',
      }];

      decoder.extract(midrowStyleChangeCC2Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const cues = decoder.decode();

      expect(cues).toEqual(expectedCues);
    });

    it('italicized popon captions on a yellow background on CC2', () => {
      const controlCount = 0x08;
      const captionData = 0xc0 | controlCount;
      const midrowStyleChangeCC2Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, 0xff,
        0xfc, 0x1c, 0x20, // Pop-on mode (RCL control code).
        0xfc, 0x19, 0x6e, // White Italics PAC.
        0xfc, 0x98, 0x2a, // Background attribute red.
        0xfc, 0xf4, 0xe5, // t, e
        0xfc, 0x73, 0xf4, // s, t
        0xfc, 0x19, 0x20, // Midrow style control code to clear styles.
        0xfc, 0x98, 0x20, // Background attribute to clear background.
        0xfc, 0x1c, 0x2f, // EOC
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;

      const expectedCues = [{
        startTime: startTimeCaption1,
        endTime: startTimeCaption2,
        stream: 'CC2',
        text: '<i></i><i><c.bg_yellow>test</c></i><c.bg_yellow> </c>',
      }];

      decoder.extract(midrowStyleChangeCC2Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const cues = decoder.decode();

      expect(cues).toEqual(expectedCues);
    });

    it('popon captions with special characters on CC2', () => {
      const controlCount = 0x07;
      const captionData = 0xc0 | controlCount;
      const midrowStyleChangeCC2Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, 0xff,
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

      const expectedCues = [{
        startTime: startTimeCaption1,
        endTime: startTimeCaption2,
        stream: 'CC2',
        text: '♪üå',
      }];

      decoder.extract(midrowStyleChangeCC2Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const cues = decoder.decode();
      expect(cues).toEqual(expectedCues);
    });

    it('painton captions on CC1', () => {
      const controlCount = 0x03;
      const captionData = 0xc0 | controlCount;
      const paintonCaptionCC1Packet = new Uint8Array([
        ...atscCaptionInitBytes, captionData, 0xff,
        0xfc, 0x94, 0x29, // Paint-on mode (RDC control code).
        0xfc, 0xf4, 0xe5, // t, e
        0xfc, 0x73, 0xf4, // s, t
      ]);

      const startTimeCaption1 = 1;
      const startTimeCaption2 = 2;

      const expectedCues = [{
        startTime: startTimeCaption1,
        endTime: startTimeCaption2,
        stream: 'CC1',
        text: 'test',
      }];

      decoder.extract(paintonCaptionCC1Packet, startTimeCaption1);
      decoder.extract(eraseDisplayedMemory, startTimeCaption2);
      const cues = decoder.decode();

      expect(cues).toEqual(expectedCues);
    });

    it('rollup captions (2 lines) on CC1', () => {
      const controlCount1 = 0x03;
      const controlCount2 = 0x02;
      // Carriage return on CC1
      const carriageReturnControlCode = new Uint8Array([0x94, 0xad]);
      const packets = [
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, 0xff,
          0xfc, 0x94, 0x25, // Roll-up 2 rows control code.
          0xfc, ...carriageReturnControlCode,
          0xfc, ...blankPaddingControlCode,
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, 0xff,
          0xfc, 0x31, 0xae, // 1, .
          0xfc, ...carriageReturnControlCode,
          0xfc, ...blankPaddingControlCode,
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, 0xff,
          0xfc, 0x32, 0xae, // 2, .
          0xfc, ...carriageReturnControlCode,
          0xfc, ...blankPaddingControlCode,
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, 0xff,
          0xfc, 0xb3, 0xae, // 3, .
          0xfc, ...carriageReturnControlCode,
          0xfc, ...blankPaddingControlCode,
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount2, 0xff,
          0xfc, 0x34, 0xae, // 4, .
          0xfc, 0x94, 0x2f, // EOC
        ]),
      ];

      for (let i = 0; i < packets.length; i++) {
        decoder.extract(packets[i], i+1);
      }
      decoder.extract(eraseDisplayedMemory, 6);

      const expectedCues = [{
        startTime: 1,
        endTime: 2,
        stream: 'CC1',
        text: '1.',
      },
      {
        startTime: 2,
        endTime: 3,
        stream: 'CC1',
        text: '1.\n2.',
      },
      {
        startTime: 3,
        endTime: 4,
        stream: 'CC1',
        text: '2.\n3.',
      },
      {
        startTime: 4,
        endTime: 5,
        stream: 'CC1',
        text: '3.\n4.',
      }];

      const cues = decoder.decode();

      expect(cues).toEqual(expectedCues);
    });

    it('PAC shifts entire 2-line rollup window to a new row on CC1', () => {
      const controlCount1 = 0x03;
      const controlCount2 = 0x02;
      // Carriage return on CC1
      const carriageReturnControlCode = new Uint8Array([0x94, 0xad]);
      const packets = [
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, 0xff,
          0xfc, 0x94, 0x25, // Roll-up 2 rows control code.
          0xfc, ...carriageReturnControlCode,
          0xfc, 0x97, 0x23, // Blank padding control code
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount1, 0xff,
          0xfc, 0x31, 0xae, // 1, .
          0xfc, ...carriageReturnControlCode,
          0xfc, 0x97, 0x23, // Blank padding control code
        ]),
        new Uint8Array([
          ...atscCaptionInitBytes, 0xc0 | controlCount2, 0xff,
          0xfc, 0x32, 0xae, // 2, .
          0xfc, 0x92, 0xe0, // PAC control code to move to row 4.
        ]),
      ];

      for (let i = 0; i < packets.length; i++) {
        decoder.extract(packets[i], i+1);
      }
      decoder.extract(eraseDisplayedMemory, 3);

      const expectedCues = [{
        startTime: 1,
        endTime: 2,
        stream: 'CC1',
        text: '1.',
      },
      {
        startTime: 2,
        endTime: 3,
        stream: 'CC1',
        text: '1.\n2.',
      }];

      const cues = decoder.decode();

      expect(cues).toEqual(expectedCues);
    });
  });

  it('resets the decoder on >=45 bad frames on CC1', () => {
    const controlCount = 0x0f;
    const captionData = 0xc0 | controlCount;
    const badFrames = [];
    const badFrameCount = 15;
    for (let i = 0; i<badFrameCount; i++) {
      badFrames.push(0xfc, 0x0, 0x0);
    }

    const badFramesBuffer = new Uint8Array([
      ...atscCaptionInitBytes, captionData, 0xff,
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

