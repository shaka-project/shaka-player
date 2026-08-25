/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:ignore testtest toasttesttest toasttest

describe('Cea708Service', () => {
  const CeaUtils = shaka.test.CeaUtils;

  /** @type {!shaka.cea.Cea708Service} */
  let service;

  /**
   * Hide window (2 bytes), with a bitmap provided to indicate all windows.
   * @type {!Array<number>}
   */
  const hideWindow = [0x8a, 0xff];

  /**
   * Define window (7 bytes), defines window #0 to be a visible window
   * with 32 rows and 32 columns. (We specify 31 for each since decoder adds 1).
   * @type {!Array<number>}
   */
  const defineWindow = [
    0x98, 0x38, 0x00, 0x00, 0x1f, 0x1f, 0x00,
  ];

  const defineWindow2 = [
    0x99, 0x38, 0x00, 0x00, 0x1f, 0x1f, 0x00,
  ];

  /** @type {number} */
  const startTime = 1;

  /** @type {number} */
  const endTime = 2;

  /**
   * We arbitrarily pick service 1 for all of these tests.
   * @type {number}
   */
  const serviceNumber = 1;

  /** @type {string} */
  const stream = `svc${serviceNumber}`;

  /** @type {number} */
  const windowId = 0;
  const windowId2 = 1;

  /** @type {number} */
  const rowCount = 16;

  /** @type {number} */
  const colCount = 32;

  /** @type {shaka.cea.Cea708Window.AnchorId} */
  const anchorId = shaka.cea.Cea708Window.AnchorId.UPPER_CENTER;

  /**
   * Takes in a array of bytes and a presentation timestamp (in seconds),
   * and converts it into a CEA-708 DTVCC Packet.
   * @param {!Array<number>} bytes
   * @param {number} pts
   * @return {!shaka.cea.DtvccPacket}
   */
  const createCea708PacketFromBytes = (bytes, pts) => {
    const cea708Bytes = bytes.map((code, i) => {
      return {
        pts,
        type: shaka.cea.DtvccPacketBuilder.DTVCC_PACKET_DATA,
        value: code,
        order: i,
      };
    });
    return new shaka.cea.DtvccPacket(cea708Bytes);
  };

  /**
   * Takes in a CEA-708 service and array of 708 packets with control codes,
   * and returns all the captions inside of them, using the service to decode.
   * @param {!shaka.cea.Cea708Service} service
   * @param {...!shaka.cea.DtvccPacket} packets
   * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
   */
  const getCaptionsFromPackets = (service, ...packets) => {
    const allCaptions = [];
    for (const packet of packets) {
      while (packet.hasMoreData()) {
        const captions = service.handleCea708ControlCode(packet);
        if (captions) {
          allCaptions.push(...captions);
        }
      }
    }
    return allCaptions;
  };

  beforeEach(() => {
    service = new shaka.cea.Cea708Service(serviceNumber);
  });

  it('decodes regular unstyled caption text', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('decodes multibyte unstyled caption text (Korean)', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of C0 control codes that add multi-byte text.
      0x18, 0xb9, 0xd9, 0x18, 0xb7, 0xce, // 맙, 럎
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    const text = '맙럎';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('decodes multibyte unstyled caption text (Polish)', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of C0 control codes that add multi-byte text.
      0x18, 0x01, 0x7c, 0xF3, 0x18, 0x01, 0x42, 0x18, 0x01, 0x07, // ż, ó, ł, ć
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    const text = 'żółć'; // cspell:ignore żółć
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('setPenLocation sets the pen location correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // SetPenLocation command to move the pen to (2, 0)
      0x92, 0x02, 0x00,

      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // After decoding, the buffer should look like this (omitting null cells).
    // [0]: test
    // [1]:
    // [2]: test
    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('setPenAttributes sets underline and italics correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // setPenAttributes. First byte is a "don't care", since this
      // decoder ignores it. First 2 bits of second byte are italics
      // and underline toggles. Turn on italics + underline.
      0x90, 0x00, 0xc0,

      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // setPenAttributes. Turn off italics + underline.
      0x90, 0x00, 0x00,

      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // Three nested cues, where the middle one should be underlined+italicized.
    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
      CeaUtils.createStyledCue(
          startTime, endTime, text,
          /* underline= */ true, /* italics= */ true,
          /* textColor= */ shaka.cea.CeaUtils.DEFAULT_TXT_COLOR,
          /* backgroundColor= */ shaka.cea.CeaUtils.DEFAULT_BG_COLOR),
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('setPenAttributes reads pen size, font tag, and edge type', () => {
    const Cea708Window = shaka.cea.Cea708Window;
    const controlCodes = [
      ...defineWindow,
      // SetPenAttributes (0x90 + 2 bytes).
      // Byte 1 |PENSIZE|OFFSET|TEXTTAG|: top 2 bits = 0b10 -> large pen size.
      // Byte 2 |I|U|EDTYP|FNTAG|: I=1, U=0, EDTYP=0b101 (5), FNTAG=0b011 (3).
      0x90, 0x80, 0xab,
    ];

    const packet = createCea708PacketFromBytes(controlCodes, startTime);
    getCaptionsFromPackets(service, packet);

    const window = (/** @type {?} */ (service))['windows_'][windowId];
    expect(window).not.toBeNull();
    // Pen size from byte 1 (large = 2).
    expect(window.getPenSize()).toBe(Cea708Window.PenSize.LARGE);
    // Edge type and font tag from byte 2.
    expect(window.getPenEdgeType()).toBe(5);
    expect(window.getPenFontStyle()).toBe(3);
    // Italics/underline behavior must be unchanged.
    expect(window['italics_']).toBe(true);
    expect(window['underline_']).toBe(false);
  });

  it('setPenAttributes leaves pen size small when byte 1 is zero', () => {
    const Cea708Window = shaka.cea.Cea708Window;
    const controlCodes = [
      ...defineWindow,
      // Byte 1 = 0x00 -> pen size small (0). Byte 2 = 0xc0 -> italics +
      // underline.
      0x90, 0x00, 0xc0,
    ];

    const packet = createCea708PacketFromBytes(controlCodes, startTime);
    getCaptionsFromPackets(service, packet);

    const window = (/** @type {?} */ (service))['windows_'][windowId];
    expect(window).not.toBeNull();
    expect(window.getPenSize()).toBe(Cea708Window.PenSize.SMALL);
    expect(window.getPenEdgeType()).toBe(0);
    expect(window.getPenFontStyle()).toBe(0);
    expect(window['italics_']).toBe(true);
    expect(window['underline_']).toBe(true);
  });

  it('setPenColor sets foreground and background color correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // setPenColor (4 bytes). Last 6 bits of byte 2 are R,G,B for foreground.
      // Last 6 bits of byte 3 are R,G,B for background. This decoder ignores
      // byte 4 which is edge color, so it's a "don't care".
      0x91, 0x30, 0x33, 0x00, // Red foreground, magenta background.

      // Series of G0 control codes that add text.
      0x63, 0x6f, 0x6c, 0x6f, 0x72, // c, o, l, o, r
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // Two nested cues, the second one should have colors.
    const text1 = 'test';
    const text2 = 'color';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text1),
      CeaUtils.createStyledCue(
          startTime, endTime, text2,
          /* underline= */ false, /* italics= */ false,
          /* textColor= */ 'red', /* backgroundColor= */ 'magenta'),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('handles special characters from the G0, G1, G2, and G3 groups', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 text control code
      0x7f, // A musical note, the only exception the G0 table has to ASCII.

      // setPenLocation (1, 0) to go to next row.
      0x92, 0x01, 0x00,

      // Series of G1 control codes that add text.
      0xa9, 0xb6, 0xf7,  // ©, ¶, ÷

      // setPenLocation (2, 0) to go to next row.
      0x92, 0x02, 0x00,

      // Series of G2 control codes that add text.
      0x1079, 0x107b, 0x1039, // ⅞, ┐, ™

      // setPenLocation (3, 0) to go to next row.
      0x92, 0x03, 0x00,

      // G3 control code.
      0x10a0, // As of CEA-708-E, there is only 1 char in G3, on 0xa0.
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    const text1 = '♪';
    const text2 = '©¶÷';
    const text3 = '⅞┐™';
    const text4 = '[CC]';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text1),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text2),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text3),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text4),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('adds an underline for unsupported chars from the G2/G3 groups', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G2 control codes that add text.
      0x1036, 0x103c, 0x1070, // unsupported, œ, unsupported

      // setPenLocation (1, 0) to go to next row.
      0x92, 0x01, 0x00,

      // Series of G3 control codes that add text.
      0x10a0, 0x10a1, 0x10db,  // [CC], unsupported, unsupported
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // Some of the characters are unsupported as of CEA-708-E, so they should
    // be replaced by an underline.
    const text1 = '_œ_';
    const text2 = '[CC]__';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text1),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text2),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];
    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('handles the reset command correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t
    ];

    const resetControlCode = [0x8f];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(resetControlCode, endTime);

    // The text in the current window should have been emitted, and then clear
    // should have been called.
    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    spyOn(service, 'clear').and.callThrough();
    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
    expect(service.clear).toHaveBeenCalledTimes(1);
  });

  it('handles the setWindowAttributes command correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // setWindowAttributes justifies text via the last 2 bits of byte 3.
      // Byte 1 is the fill color/opacity; use 0xc0 (transparent fill) so this
      // test stays focused on justification and applies no background. Byte 2
      // (border) and byte 4 (effects) are "don't care".
      0x97, 0xc0, 0x00, 0x01, 0x00, // Transparent fill, justify right
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // Right-justified text is expected.
    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.textAlign = shaka.text.Cue.textAlign.RIGHT;
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('applies a setWindowAttributes fill color to the cue background', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // setWindowAttributes (4 bytes). Byte 1 is the fill color/opacity:
      // |FILL_OPACITY(2)|FILL_R(2)|FILL_G(2)|FILL_B(2)|. 0x33 = solid opacity
      // (0b00), red 0b00, green 0b11, blue 0b11 -> magenta. Byte 3 (0x02) keeps
      // the default (center) justification and word wrap off.
      0x97, 0x33, 0x00, 0x02, 0x00,
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    // The fill color is applied to the top-level cue's background.
    topLevelCue.backgroundColor = 'magenta';
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('does not apply a transparent setWindowAttributes fill', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // setWindowAttributes with a transparent fill (opacity id 3, 0b11 in the
      // top two bits of byte 1). No background should be applied even though
      // the color bits would otherwise map to a color. Byte 3 (0x02) keeps the
      // default (center) justification.
      0x97, 0xff, 0x00, 0x02, 0x00,
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    // No backgroundColor is set on the top-level cue (default empty).
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('reads the setWindowAttributes word-wrap flag', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // setWindowAttributes with a transparent fill (byte 1 = 0xc0) and byte 3
      // = 0x40, which sets the word-wrap bit (0x40) and keeps default
      // justification.
      0x97, 0xc0, 0x00, 0x40, 0x00,
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);

    // Decode the packet so setWindowAttributes is processed.
    getCaptionsFromPackets(service, packet1);

    // The current window should have word wrap enabled.
    const window = (/** @type {?} */ (service))['windows_'][windowId];
    expect(window).not.toBeNull();
    expect(window.getWordWrap()).toBe(true);
  });

  it('handles the carriage return command correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65,  // t, e,

      // Carriage return.
      0x0d,

      // Series of G0 control codes that add text.
      0x73, 0x74, // s, t
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    const text1 = 'te';
    const text2 = 'st';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text1),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text2),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('handles the horizontal carriage return command correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65,  // t, e,

      // setPenLocation (1, 0) to go to next row.
      0x92, 0x01, 0x00,

      // Series of G0 control codes that add text.
      0x6d, 0x70, // m, p

      // Horizontal Carriage return.
      0x0e,

      // Series of G0 control codes that add text.
      0x73, 0x74, // s, t
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // HCR wipes the row and moves the pen to the row start.
    const text1 = 'te';
    const text2 = 'st';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text1),
      CeaUtils.createLineBreakCue(startTime, endTime),
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text2),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('handles the ASCII backspace command correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t

      // Backspace.
      0x08,
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // Backspace should have erased the last 't' in 'test'.
    const text = 'tes';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);
    expect(captions).toEqual(expectedCaptions);
  });

  it('handles the ASCII form-feed command correctly', () => {
    const controlCodes = [
      ...defineWindow,
      // Series of G0 control codes that add text.
      0x61, 0x62,  // a, b,

      // setPenLocation (1, 0) to go to next row.
      0x92, 0x01, 0x00,

      // Series of G0 control codes that add text.
      0x62, 0x61, // b, a

      // Form-feed.
      0x0c,

      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // The form feed control code would have wiped the entire window
    // including new lines, and the text after is just 'test'.
    const text = 'test';
    const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
        serviceNumber, windowId, rowCount, colCount, anchorId);
    topLevelCue.nestedCues = [
      CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
    ];

    const expectedCaptions = [
      {
        stream,
        cue: topLevelCue,
      },
    ];

    const captions = getCaptionsFromPackets(service, packet1, packet2);

    expect(captions).toEqual(expectedCaptions);
  });

  it('handles C2 and C3 no-op control codes correctly', () => {
    // As of CEA-708, the C2 and C3 control code group has no operations.
    // However, the bytes are reserved for future modifications to the spec,
    // and so the correct # of bytes should be skipped if they are seen.
    const packets = [
      // C2 control code data.
      [0x1008, 0x00], // C2 Packet 1.
      [0x1010, 0x00, 0x00], // C2 Packet 2.
      [0x1018, 0x00, 0x00, 0x00], // C2 Packet 3.

      // C3 control code data.
      [0x1080, 0x00, 0x00, 0x00, 0x00], // C3 packet 1.
      [0x1088, 0x00, 0x00, 0x00, 0x00, 0x00], // C3 packet 2.
    ];
    const expectedSkips = [1, 2, 3, 4, 5]; // As per the CEA-708-E spec.

    for (let i = 0; i < packets.length; i++) {
      const packet = createCea708PacketFromBytes(packets[i], /* pts= */ 1);
      spyOn(packet, 'skip');
      getCaptionsFromPackets(service, packet);
      expect(packet.skip).toHaveBeenCalledWith(expectedSkips[i]);
    }
  });

  describe('handles commands that change the display of windows', () => {
    const time1 = 1;
    const time2 = 2;
    const time3 = 4;
    const time4 = 5;
    const textControlCodes = [
      // Series of G0 control codes that add text.
      0x74, 0x65, 0x73, 0x74, // t, e, s, t
    ];

    const textControlCodes2 = [
      // Series of G0 control codes that add text.
      0x74, 0x6F, 0x61, 0x73, 0x74, // t, o, a, s, t
    ];

    // These commands affect ALL windows, per the 0xff bitmap.
    const toggleWindow = [0x8b, 0xff];
    const displayWindow = [0x89, 0xff];
    const deleteWindow = [0x8c, 0xff];
    const clearWindow = [0x88, 0xff];

    it('handles display, toggle, and delete commands on windows', () => {
      // Define a visible window, add some text, and toggle it off,
      // which should force the window to emit the caption, 'test'.
      const packet1 = createCea708PacketFromBytes(defineWindow, time1);
      const packet2 = createCea708PacketFromBytes(textControlCodes, time1);
      const packet3 = createCea708PacketFromBytes(toggleWindow, time2);

      // Window is now hidden. Turn it back on at time 3, and append
      // more text to it.
      const packet4 = createCea708PacketFromBytes(displayWindow, time3);
      const packet5 = createCea708PacketFromBytes(textControlCodes, time3);

      // Window is now being displayed. Delete all the windows.
      // This should force the displayed window to emit the caption, 'testtest'.
      const packet6 = createCea708PacketFromBytes(deleteWindow, time4);

      const text1 = 'test';
      const text2 = 'testtest';
      const topLevelCue1 = CeaUtils.createWindowedCue(
          /* startTime= */ time1, /* endTime= */ time2, '',
          serviceNumber, windowId, rowCount, colCount, anchorId,
      );
      topLevelCue1.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time1, /* endTime= */ time2, /* payload= */ text1),
      ];

      const topLevelCue2 = CeaUtils.createWindowedCue(
          /* startTime= */ time3, /* endTime= */ time4, '',
          serviceNumber, windowId, rowCount, colCount, anchorId,
      );
      topLevelCue2.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time3, /* endTime= */ time4, /* payload= */ text2),
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

      const captions = getCaptionsFromPackets(
          service, packet1, packet2, packet3, packet4, packet5, packet6);
      expect(captions).toEqual(expectedCaptions);
    });

    it('if more than one window, ' +
      'delete should extract cues on all windows', () => {
      // Define a visible window, and add some text
      const packet1a = createCea708PacketFromBytes(defineWindow, time1);
      const packet1b = createCea708PacketFromBytes(textControlCodes, time1);
      const packet1c = createCea708PacketFromBytes(textControlCodes, time2);

      // Define a second visible window, and add some text
      const packet2a = createCea708PacketFromBytes(defineWindow2, time1);
      const packet2b = createCea708PacketFromBytes(textControlCodes2, time1);
      const packet3a = createCea708PacketFromBytes(textControlCodes, time2);

      // Delete all the windows.
      // This should force the first window to emit 'testtest' and the second
      // to emit 'toasttesttest'.
      const packet4 = createCea708PacketFromBytes(deleteWindow, time2);

      const text1 = 'testtest';
      const text2 = 'toasttest';
      const topLevelCue1 = CeaUtils.createWindowedCue(
          /* startTime= */ time1, /* endTime= */ time2, '',
          serviceNumber, windowId, rowCount, colCount, anchorId,
      );
      topLevelCue1.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time1, /* endTime= */ time2, /* payload= */ text1),
      ];

      const topLevelCue2 = CeaUtils.createWindowedCue(
          /* startTime= */ time1, /* endTime= */ time2, '',
          serviceNumber, windowId2, rowCount, colCount, anchorId,
      );
      topLevelCue2.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time1, /* endTime= */ time2, /* payload= */ text2),
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

      const captions = getCaptionsFromPackets(
          service, packet1a, packet1b, packet1c, packet2a, packet2b,
          packet3a, packet4);
      expect(captions).toEqual(expectedCaptions);
    });

    it('if more than one window, ' +
      'clear should extract cues on all windows', () => {
      // Define a visible window, and add some text
      const packet1a = createCea708PacketFromBytes(defineWindow, time1);
      const packet1b = createCea708PacketFromBytes(textControlCodes, time1);
      const packet1c = createCea708PacketFromBytes(textControlCodes, time2);

      // Define a second visible window, and add some text
      const packet2a = createCea708PacketFromBytes(defineWindow2, time1);
      const packet2b = createCea708PacketFromBytes(textControlCodes2, time1);
      const packet3a = createCea708PacketFromBytes(textControlCodes, time2);

      // Delete all the windows.
      // This should force the first window to emit 'testtest' and the second
      // to emit 'toasttesttest'.
      const packet4 = createCea708PacketFromBytes(clearWindow, time2);

      const text1 = 'testtest';
      const text2 = 'toasttest';
      const topLevelCue1 = CeaUtils.createWindowedCue(
          /* startTime= */ time1, /* endTime= */ time2, '',
          serviceNumber, windowId, rowCount, colCount, anchorId,
      );
      topLevelCue1.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time1, /* endTime= */ time2, /* payload= */ text1),
      ];

      const topLevelCue2 = CeaUtils.createWindowedCue(
          /* startTime= */ time1, /* endTime= */ time2, '',
          serviceNumber, windowId2, rowCount, colCount, anchorId,
      );
      topLevelCue2.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time1, /* endTime= */ time2, /* payload= */ text2),
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

      const captions = getCaptionsFromPackets(
          service, packet1a, packet1b, packet1c, packet2a, packet2b,
          packet3a, packet4);
      expect(captions).toEqual(expectedCaptions);
    });

    it('handles the clear command on a window', () => {
      // Define a visible window, add text to it, and then clear it.
      // This should emit a caption, since a visible window is being cleared.
      const packet1 = createCea708PacketFromBytes(defineWindow, time1);
      const packet2 = createCea708PacketFromBytes(textControlCodes, time1);
      const packet3 = createCea708PacketFromBytes(clearWindow, time2);

      // Display the window again, and then hide it. Although a visible window
      // that turns off usually emits, this should NOT emit a caption, since
      // the window contains nothing in it after the clear.
      const packet4 = createCea708PacketFromBytes(displayWindow, time3);
      const packet5 = createCea708PacketFromBytes(textControlCodes, time3);
      const packet6 = createCea708PacketFromBytes(hideWindow, time1);

      // Only one cue should have been emitted as per the explanation above.
      const text = 'test';
      const topLevelCue = CeaUtils.createWindowedCue(
          /* startTime= */ time1, /* endTime= */ time2, '',
          serviceNumber, windowId, rowCount, colCount, anchorId,
      );

      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time1, /* endTime= */ time2, /* payload= */ text),
      ];

      const expectedCaptions = [
        {
          stream,
          cue: topLevelCue,
        },
      ];

      const captions = getCaptionsFromPackets(service, packet1, packet2,
          packet3, packet4, packet5, packet6);
      expect(captions).toEqual(expectedCaptions);
    });
  });

  describe('handles predefined window and pen styles (WNSTY/PNSTY)', () => {
    const Cea708Window = shaka.cea.Cea708Window;

    /**
     * Builds a DefineWindow command (for window #0) whose b6 byte encodes the
     * given predefined window style (WNSTY) and pen style (PNSTY).
     * @param {number} windowStyle 0-7
     * @param {number} penStyle 0-7
     * @return {!Array<number>}
     */
    const defineWindowWithStyles = (windowStyle, penStyle) => {
      const b6 = ((windowStyle & 0x07) << 3) | (penStyle & 0x07);
      return [0x98, 0x38, 0x00, 0x00, 0x1f, 0x1f, b6];
    };

    /**
     * Defines window #0 in the service with the given style bytes and returns
     * the resulting window.
     * @param {number} windowStyle
     * @param {number} penStyle
     * @return {!shaka.cea.Cea708Window}
     */
    const defineStyledWindow = (windowStyle, penStyle) => {
      const packet = createCea708PacketFromBytes(
          defineWindowWithStyles(windowStyle, penStyle), startTime);
      getCaptionsFromPackets(service, packet);
      const window = (/** @type {?} */ (service))['windows_'][windowId];
      expect(window).not.toBeNull();
      return /** @type {!shaka.cea.Cea708Window} */ (window);
    };

    it('applies each predefined window style deterministically', () => {
      // Expected (printDirection, scrollDirection, wordWrap) per style id.
      const expected = {
        1: {printDirection: 0, scrollDirection: 3, wordWrap: false},
        2: {printDirection: 0, scrollDirection: 3, wordWrap: false},
        3: {printDirection: 0, scrollDirection: 3, wordWrap: false},
        4: {printDirection: 0, scrollDirection: 3, wordWrap: true},
        5: {printDirection: 0, scrollDirection: 3, wordWrap: true},
        6: {printDirection: 0, scrollDirection: 3, wordWrap: true},
        7: {printDirection: 2, scrollDirection: 1, wordWrap: false},
      };
      const svc = /** @type {?} */ (service);

      for (let id = 1; id <= 7; id++) {
        const window1 = new Cea708Window(windowId, serviceNumber);
        const window2 = new Cea708Window(windowId, serviceNumber);
        svc['applyWindowStylePreset_'](window1, id);
        svc['applyWindowStylePreset_'](window2, id);

        // Pure function of the preset id: two windows get identical state.
        expect(window1.getPrintDirection()).toBe(expected[id].printDirection);
        expect(window1.getScrollDirection()).toBe(expected[id].scrollDirection);
        expect(window1.getWordWrap()).toBe(expected[id].wordWrap);

        expect(window2.getPrintDirection()).toBe(window1.getPrintDirection());
        expect(window2.getScrollDirection()).toBe(window1.getScrollDirection());
        expect(window2.getWordWrap()).toBe(window1.getWordWrap());
      }
    });

    it('applies each predefined pen style deterministically', () => {
      // Expected (penSize, fontStyle, edgeType) per style id.
      const expected = {
        1: {penSize: 1, fontStyle: 0, edgeType: 0},
        2: {penSize: 1, fontStyle: 1, edgeType: 0},
        3: {penSize: 1, fontStyle: 2, edgeType: 0},
        4: {penSize: 1, fontStyle: 3, edgeType: 0},
        5: {penSize: 1, fontStyle: 4, edgeType: 0},
        6: {penSize: 1, fontStyle: 3, edgeType: 3},
        7: {penSize: 1, fontStyle: 4, edgeType: 3},
      };
      const svc = /** @type {?} */ (service);

      for (let id = 1; id <= 7; id++) {
        const window1 = new Cea708Window(windowId, serviceNumber);
        const window2 = new Cea708Window(windowId, serviceNumber);
        svc['applyPenStylePreset_'](window1, id);
        svc['applyPenStylePreset_'](window2, id);

        expect(window1.getPenSize()).toBe(expected[id].penSize);
        expect(window1.getPenFontStyle()).toBe(expected[id].fontStyle);
        expect(window1.getPenEdgeType()).toBe(expected[id].edgeType);

        expect(window2.getPenSize()).toBe(window1.getPenSize());
        expect(window2.getPenFontStyle()).toBe(window1.getPenFontStyle());
        expect(window2.getPenEdgeType()).toBe(window1.getPenEdgeType());
      }
    });

    it('leaves an existing window style unchanged for preset id 0', () => {
      const window = new Cea708Window(windowId, serviceNumber);
      const svc = /** @type {?} */ (service);
      // Seed a non-default style (style 7: ticker tape).
      svc['applyWindowStylePreset_'](window, 7);
      const printDirection = window.getPrintDirection();
      const scrollDirection = window.getScrollDirection();
      const wordWrap = window.getWordWrap();

      // Preset id 0 must keep the existing style.
      svc['applyWindowStylePreset_'](window, 0);
      expect(window.getPrintDirection()).toBe(printDirection);
      expect(window.getScrollDirection()).toBe(scrollDirection);
      expect(window.getWordWrap()).toBe(wordWrap);
    });

    it('defines a new window with style 0 using preset 1 defaults', () => {
      // A brand new window with WNSTY=0 should resolve to predefined style 1.
      const window = defineStyledWindow(
          /* windowStyle= */ 0, /* penStyle= */ 0);
      expect(window.getPrintDirection()).toBe(0);
      expect(window.getScrollDirection()).toBe(3);
      expect(window.getWordWrap()).toBe(false);

      // Preset 1 / default pen: standard size, default font, no edge.
      expect(window.getPenSize()).toBe(Cea708Window.PenSize.STANDARD);
      expect(window.getPenFontStyle()).toBe(0);
      expect(window.getPenEdgeType()).toBe(0);
    });

    it('reads WNSTY and PNSTY from the DefineWindow b6 byte', () => {
      // Window style 7 (ticker), pen style 6 (mono no-serif, uniform edge).
      const window = defineStyledWindow(
          /* windowStyle= */ 7, /* penStyle= */ 6);
      expect(window.getPrintDirection()).toBe(2);
      expect(window.getScrollDirection()).toBe(1);
      expect(window.getWordWrap()).toBe(false);

      expect(window.getPenSize()).toBe(1);
      expect(window.getPenFontStyle()).toBe(3);
      expect(window.getPenEdgeType()).toBe(3);
    });

    it('keeps default center justification for a styled window', () => {
      // Defining a window with a predefined style must not change the decoder's
      // default (center) justification, which is governed by
      // SetWindowAttributes. This guards the existing default rendering.
      const controlCodes = [
        ...defineWindowWithStyles(/* windowStyle= */ 0, /* penStyle= */ 0),
        0x74, 0x65, 0x73, 0x74, // t, e, s, t
      ];
      const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
      const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

      const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
          serviceNumber, windowId, rowCount, colCount, anchorId);
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ 'test'),
      ];

      const captions = getCaptionsFromPackets(service, packet1, packet2);
      expect(captions).toEqual([{stream, cue: topLevelCue}]);
      // Default textAlign is CENTER and must be preserved.
      expect(captions[0].cue.textAlign).toBe(shaka.text.Cue.textAlign.CENTER);
    });

    // For a given (WNSTY, PNSTY) pair, the resulting style is a pure function
    // of those preset ids (prior style is used only when an id is 0).

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

    // The preset tables are the source of truth for the expected style state.
    const WindowStylePresets =
        shaka.cea.Cea708Service.WindowStylePresets;
    const PenStylePresets = shaka.cea.Cea708Service.PenStylePresets;

    /**
     * Resolves a raw WNSTY id to the preset id actually applied to a freshly
     * defined window: a window style of 0 on a new window defaults to style 1.
     * @param {number} windowStyle 0-7
     * @return {number}
     */
    const resolveNewWindowStyle = (windowStyle) => windowStyle || 1;

    /**
     * Resolves a raw PNSTY id to the preset id actually applied to a freshly
     * defined window: a pen style of 0 on a new window defaults to style 1.
     * @param {number} penStyle 0-7
     * @return {number}
     */
    const resolveNewPenStyle = (penStyle) => penStyle || 1;

    /**
     * Defines window #0 on a brand-new service with the given style bytes and
     * returns the resulting window. Each call uses a fresh service/window so
     * the "new window" semantics (style 0 -> default style 1) apply.
     * @param {number} windowStyle 0-7
     * @param {number} penStyle 0-7
     * @return {!shaka.cea.Cea708Window}
     */
    const defineFreshStyledWindow = (windowStyle, penStyle) => {
      const freshService = new shaka.cea.Cea708Service(serviceNumber);
      const packet = createCea708PacketFromBytes(
          defineWindowWithStyles(windowStyle, penStyle), startTime);
      getCaptionsFromPackets(freshService, packet);
      const window =
          (/** @type {?} */ (freshService))['windows_'][windowId];
      expect(window).not.toBeNull();
      return /** @type {!shaka.cea.Cea708Window} */ (window);
    };

    /**
     * Snapshots the preset-derived state of a window into a plain object so two
     * windows can be compared for equality.
     * @param {!shaka.cea.Cea708Window} window
     * @return {!Object}
     */
    const styleSnapshot = (window) => ({
      printDirection: window.getPrintDirection(),
      scrollDirection: window.getScrollDirection(),
      wordWrap: window.getWordWrap(),
      penSize: window.getPenSize(),
      fontStyle: window.getPenFontStyle(),
      edgeType: window.getPenEdgeType(),
    });

    it('predefined style is a pure function of (WNSTY, PNSTY)', () => {
      // A spread of fixed seeds keeps the test deterministic while still
      // exercising many randomly chosen (windowStyle, penStyle) pairs.
      const seeds = [
        0x00000001, 0x00c0ffee, 0x0badf00d, 0x00012345,
        0x00abcdef, 0x9e3779b9, 0x2545f491, 0xdeadbeef,
      ];
      const iterationsPerSeed = 40;

      for (const seed of seeds) {
        const rng = mulberry32(seed);
        for (let i = 0; i < iterationsPerSeed; i++) {
          const windowStyle = randInt(rng, 7); // WNSTY in [0, 7].
          const penStyle = randInt(rng, 7); // PNSTY in [0, 7].

          // Expected state comes straight from the preset tables, with the
          // "new window" resolution of id 0 -> default style 1.
          const expectedWindowPreset =
              WindowStylePresets[resolveNewWindowStyle(windowStyle)];
          const expectedPenPreset =
              PenStylePresets[resolveNewPenStyle(penStyle)];

          const window = defineFreshStyledWindow(windowStyle, penStyle);

          // The resulting window-style state matches the preset table exactly.
          expect(window.getPrintDirection())
              .toBe(expectedWindowPreset.printDirection);
          expect(window.getScrollDirection())
              .toBe(expectedWindowPreset.scrollDirection);
          expect(window.getWordWrap()).toBe(expectedWindowPreset.wordWrap);

          // The resulting pen-style state matches the preset table exactly.
          expect(window.getPenSize()).toBe(expectedPenPreset.penSize);
          expect(window.getPenFontStyle()).toBe(expectedPenPreset.fontStyle);
          expect(window.getPenEdgeType()).toBe(expectedPenPreset.edgeType);

          // Determinism: decoding the same (WNSTY, PNSTY) again on a fresh
          // service yields byte-for-byte identical preset-derived state.
          const window2 = defineFreshStyledWindow(windowStyle, penStyle);
          expect(styleSnapshot(window2)).toEqual(styleSnapshot(window));
        }
      }
    });

    it('uses prior style only for id 0 on an existing window', () => {
      // a preset id of 0 keeps the existing
      // style, but only when the window already existed. Re-defining the same
      // window with (WNSTY=0, PNSTY=0) must leave the previously applied preset
      // state untouched.
      const seeds = [0x13572468, 0x0f0f0f0f, 0x77777777, 0xa5a5a5a5];
      const iterationsPerSeed = 20;

      for (const seed of seeds) {
        const rng = mulberry32(seed);
        for (let i = 0; i < iterationsPerSeed; i++) {
          // Pick non-zero ids so there is a concrete prior style to preserve.
          const windowStyle = 1 + randInt(rng, 6); // [1, 7]
          const penStyle = 1 + randInt(rng, 6); // [1, 7]

          const freshService = new shaka.cea.Cea708Service(serviceNumber);

          // First define establishes the window's preset-derived style.
          getCaptionsFromPackets(freshService, createCea708PacketFromBytes(
              defineWindowWithStyles(windowStyle, penStyle), startTime));
          const window =
              (/** @type {?} */ (freshService))['windows_'][windowId];
          expect(window).not.toBeNull();
          const priorState = styleSnapshot(
              /** @type {!shaka.cea.Cea708Window} */ (window));

          // Re-defining the existing window with id 0 keeps the prior style.
          getCaptionsFromPackets(freshService, createCea708PacketFromBytes(
              defineWindowWithStyles(/* windowStyle= */ 0, /* penStyle= */ 0),
              endTime));
          expect(styleSnapshot(
              /** @type {!shaka.cea.Cea708Window} */ (window)))
              .toEqual(priorState);
        }
      }
    });
  });

  describe('reserved C2/C3 codes and unmapped G2/G3 chars', () => {
    // a C2 or C3 reserved control code skips the spec-mandated number
    // of operand bytes without altering window state. Per CTA-708-E, the C2
    // set skips 0/1/2/3 operand bytes for code ranges 0x00-0x07 / 0x08-0x0f /
    // 0x10-0x17 / 0x18-0x1f, and the C3 set skips 4/5 operand bytes for ranges
    // 0x80-0x87 / 0x88-0x8f.
    // a G2 or G3 character with no mapping renders the spec-mandated
    // underline ('_') placeholder; mapped characters render their glyph.

    /**
     * Decodes a fresh service with: defineWindow, a reserved control code
     * followed by its operand bytes, then the text "test", then a hide-window.
     * The operand bytes are printable G0 characters, so an incorrect skip count
     * would either leak an operand into the output or consume part of "test" --
     * "test" survives intact only when exactly the right number of operand
     * bytes is skipped (). The window geometry in the emitted cue also
     * confirms the window state was not altered by the reserved code.
     * @param {number} reservedCode The synthetic extended control-code value
     *   (e.g. 0x1008 for a C2 0x08, 0x1080 for a C3 0x80).
     * @param {!Array<number>} operandBytes Operand bytes that follow the code.
     * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
     */
    const decodeReservedThenText = (reservedCode, operandBytes) => {
      const svc = new shaka.cea.Cea708Service(serviceNumber);
      const controlCodes = [
        ...defineWindow,
        reservedCode, ...operandBytes,
        0x74, 0x65, 0x73, 0x74, // t, e, s, t
      ];
      const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
      const packet2 = createCea708PacketFromBytes(hideWindow, endTime);
      return getCaptionsFromPackets(svc, packet1, packet2);
    };

    /**
     * The expected caption when a reserved code is fully skipped and only the
     * text "test" renders in window #0 with its original geometry.
     * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
     */
    const expectedTestCaption = () => {
      const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
          serviceNumber, windowId, rowCount, colCount, anchorId);
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ 'test'),
      ];
      return [{stream, cue: topLevelCue}];
    };

    /**
     * Decodes a fresh service with: defineWindow, a single G2/G3 character
     * control code, then a hide-window, and returns the emitted captions.
     * @param {number} charCode The synthetic extended control-code value
     *   (e.g. 0x1025 for a G2 char, 0x10a0 for a G3 char).
     * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
     */
    const decodeSingleChar = (charCode) => {
      const svc = new shaka.cea.Cea708Service(serviceNumber);
      const packet1 = createCea708PacketFromBytes(
          [...defineWindow, charCode], startTime);
      const packet2 = createCea708PacketFromBytes(hideWindow, endTime);
      return getCaptionsFromPackets(svc, packet1, packet2);
    };

    /**
     * The expected caption when a single character renders in window #0.
     * @param {string} text The rendered glyph or placeholder.
     * @return {!Array<shaka.extern.ICaptionDecoder.ClosedCaption>}
     */
    const expectedCharCaption = (text) => {
      const topLevelCue = CeaUtils.createWindowedCue(startTime, endTime, '',
          serviceNumber, windowId, rowCount, colCount, anchorId);
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(startTime, endTime, /* payload= */ text),
      ];
      return [{stream, cue: topLevelCue}];
    };

    // Operand bytes 'V'..'Z' (0x56-0x5a) are printable G0 characters.

    it('C2 0x00-0x07 reserved codes skip 0 operand bytes', () => {
      // No operand bytes follow; text decodes immediately after the code.
      expect(decodeReservedThenText(0x1000, []))
          .toEqual(expectedTestCaption());
      expect(decodeReservedThenText(0x1007, []))
          .toEqual(expectedTestCaption());
    });

    it('C2 0x08-0x0f reserved codes skip 1 operand byte', () => {
      expect(decodeReservedThenText(0x1008, [0x56]))
          .toEqual(expectedTestCaption());
      expect(decodeReservedThenText(0x100f, [0x56]))
          .toEqual(expectedTestCaption());
    });

    it('C2 0x10-0x17 reserved codes skip 2 operand bytes', () => {
      expect(decodeReservedThenText(0x1010, [0x56, 0x57]))
          .toEqual(expectedTestCaption());
      expect(decodeReservedThenText(0x1017, [0x56, 0x57]))
          .toEqual(expectedTestCaption());
    });

    it('C2 0x18-0x1f reserved codes skip 3 operand bytes', () => {
      expect(decodeReservedThenText(0x1018, [0x56, 0x57, 0x58]))
          .toEqual(expectedTestCaption());
      expect(decodeReservedThenText(0x101f, [0x56, 0x57, 0x58]))
          .toEqual(expectedTestCaption());
    });

    it('C3 0x80-0x87 reserved codes skip 4 operand bytes', () => {
      expect(decodeReservedThenText(0x1080, [0x56, 0x57, 0x58, 0x59]))
          .toEqual(expectedTestCaption());
      expect(decodeReservedThenText(0x1087, [0x56, 0x57, 0x58, 0x59]))
          .toEqual(expectedTestCaption());
    });

    it('C3 0x88-0x8f reserved codes skip 5 operand bytes', () => {
      expect(decodeReservedThenText(0x1088, [0x56, 0x57, 0x58, 0x59, 0x5a]))
          .toEqual(expectedTestCaption());
      expect(decodeReservedThenText(0x108f, [0x56, 0x57, 0x58, 0x59, 0x5a]))
          .toEqual(expectedTestCaption());
    });

    it('renders a mapped G2 character as its glyph', () => {
      // 0x25 maps to the horizontal ellipsis in the G2 charset.
      expect(decodeSingleChar(0x1025)).toEqual(expectedCharCaption('…'));
    });

    it('renders an unmapped G2 character as the underline placeholder', () => {
      // 0x36 has no mapping in the G2 charset, so the spec mandates '_'.
      expect(decodeSingleChar(0x1036)).toEqual(expectedCharCaption('_'));
    });

    it('renders the only mapped G3 character (0xa0) as [CC]', () => {
      expect(decodeSingleChar(0x10a0)).toEqual(expectedCharCaption('[CC]'));
    });

    it('renders unmapped G3 characters as the underline placeholder', () => {
      // As of CEA-708-E, G3 maps only 0xa0; every other code renders '_'.
      expect(decodeSingleChar(0x10a1)).toEqual(expectedCharCaption('_'));
      expect(decodeSingleChar(0x10db)).toEqual(expectedCharCaption('_'));
    });
  });

  describe('window-command bitmap selection and current-window safety', () => {
    // a window command (clear/display/hide/toggle/delete) carrying an
    // 8-bit window bitmap affects exactly the set of EXISTING windows whose bit
    // is set, and no others. Windows whose bit is set but that were never
    // defined are silently ignored (getSpecifiedWindowIds_ filters them out).
    // a command that targets a non-existent window, or a pen/character
    // command issued with no current window, is ignored and emits no cue.

    // Text codes that spell 'test'.
    const textControlCodes = [0x74, 0x65, 0x73, 0x74];

    /**
     * Builds a DefineWindow command for the given window number (0-7). The
     * window geometry matches `defineWindow` (16 rows, 32 cols, upper-center
     * anchor); only the visibility bit of b1 varies.
     * @param {number} windowNum 0-7.
     * @param {boolean} visible Whether the window's visible bit is set.
     * @return {!Array<number>}
     */
    const defineWindowCmd = (windowNum, visible) => {
      // b1: 0x18 keeps the row/col-lock bits; 0x20 is the visibility bit.
      const b1 = visible ? 0x38 : 0x18;
      return [0x98 + windowNum, b1, 0x00, 0x00, 0x1f, 0x1f, 0x00];
    };

    /**
     * The shared 708 service array of windows, exposed for state assertions.
     * @param {!shaka.cea.Cea708Service} svc
     * @return {!Array<?shaka.cea.Cea708Window>}
     */
    const windowsOf = (svc) => (/** @type {?} */ (svc))['windows_'];

    /**
     * Builds the expected caption for window `id` containing the text 'test'.
     * @param {number} id Window number.
     * @param {number} cueStart
     * @param {number} cueEnd
     * @return {shaka.extern.ICaptionDecoder.ClosedCaption}
     */
    const expectedTestCue = (id, cueStart, cueEnd) => {
      const topLevelCue = CeaUtils.createWindowedCue(cueStart, cueEnd, '',
          serviceNumber, id, rowCount, colCount, anchorId);
      topLevelCue.nestedCues = [
        CeaUtils.createDefaultCue(cueStart, cueEnd, /* payload= */ 'test'),
      ];
      return {stream, cue: topLevelCue};
    };

    /**
     * Defines windows 0, 2, and 5 (each with the text 'test') on the service.
     * Windows 1 and 3 are intentionally left undefined so a bitmap can target
     * them without effect. Window 5's bit is left out of the test bitmap so it
     * can serve as the "untouched" control.
     * @param {boolean} visible Whether the windows are defined visible.
     */
    const defineWindows025 = (visible) => {
      const controlCodes = [];
      for (const id of [0, 2, 5]) {
        controlCodes.push(...defineWindowCmd(id, visible), ...textControlCodes);
      }
      const packet = createCea708PacketFromBytes(controlCodes, startTime);
      getCaptionsFromPackets(service, packet);
    };

    // Bitmap selecting windows {0, 1, 2, 3}. Only 0 and 2 exist; 1 and 3 do
    // not, and 5 is deliberately excluded.
    const bitmap0123 = 0x0f;

    it('delete affects only existing windows whose bit is set', () => {
      defineWindows025(/* visible= */ true);

      const deletePacket =
          createCea708PacketFromBytes([0x8c, bitmap0123], endTime);
      const captions = getCaptionsFromPackets(service, deletePacket);

      // Only the existing, selected windows (0 and 2) emit and are deleted.
      expect(captions).toEqual([
        expectedTestCue(windowId, startTime, endTime),
        expectedTestCue(2, startTime, endTime),
      ]);

      const windows = windowsOf(service);
      expect(windows[0]).toBeNull();
      expect(windows[2]).toBeNull();
      // Window 5 was not selected, so it must be untouched.
      expect(windows[5]).not.toBeNull();
      expect(windows[5].isVisible()).toBe(true);
    });

    it('clear affects only existing windows whose bit is set', () => {
      defineWindows025(/* visible= */ true);

      const clearPacket =
          createCea708PacketFromBytes([0x88, bitmap0123], endTime);
      const captions = getCaptionsFromPackets(service, clearPacket);

      expect(captions).toEqual([
        expectedTestCue(windowId, startTime, endTime),
        expectedTestCue(2, startTime, endTime),
      ]);

      const windows = windowsOf(service);
      // Clear keeps the window but empties its memory: a later emit is null.
      expect(windows[0]).not.toBeNull();
      expect(windows[0].forceEmit(endTime + 1, serviceNumber)).toBeNull();
      expect(windows[2]).not.toBeNull();
      expect(windows[2].forceEmit(endTime + 1, serviceNumber)).toBeNull();
      // Window 5 was not selected: its memory is intact and still emits.
      expect(windows[5]).not.toBeNull();
      expect(windows[5].forceEmit(endTime + 1, serviceNumber)).not.toBeNull();
    });

    it('hide affects only existing windows whose bit is set', () => {
      defineWindows025(/* visible= */ true);

      const hidePacket =
          createCea708PacketFromBytes([0x8a, bitmap0123], endTime);
      const captions = getCaptionsFromPackets(service, hidePacket);

      // Both hidden, visible windows emit their contents.
      expect(captions).toEqual([
        expectedTestCue(windowId, startTime, endTime),
        expectedTestCue(2, startTime, endTime),
      ]);

      const windows = windowsOf(service);
      expect(windows[0].isVisible()).toBe(false);
      expect(windows[2].isVisible()).toBe(false);
      // Window 5 was not selected, so its visibility is unchanged.
      expect(windows[5].isVisible()).toBe(true);
    });

    it('toggle affects only existing windows whose bit is set', () => {
      defineWindows025(/* visible= */ true);

      const togglePacket =
          createCea708PacketFromBytes([0x8b, bitmap0123], endTime);
      const captions = getCaptionsFromPackets(service, togglePacket);

      // Visible windows being toggled off emit their contents.
      expect(captions).toEqual([
        expectedTestCue(windowId, startTime, endTime),
        expectedTestCue(2, startTime, endTime),
      ]);

      const windows = windowsOf(service);
      expect(windows[0].isVisible()).toBe(false);
      expect(windows[2].isVisible()).toBe(false);
      // Window 5 was not selected, so its visibility is unchanged.
      expect(windows[5].isVisible()).toBe(true);
    });

    it('display affects only existing windows whose bit is set', () => {
      // Define the windows hidden so display has an observable effect.
      defineWindows025(/* visible= */ false);

      const displayPacket =
          createCea708PacketFromBytes([0x89, bitmap0123], endTime);
      const captions = getCaptionsFromPackets(service, displayPacket);

      // Display emits no cue; it only changes visibility.
      expect(captions).toEqual([]);

      const windows = windowsOf(service);
      expect(windows[0].isVisible()).toBe(true);
      expect(windows[2].isVisible()).toBe(true);
      // Window 5 was not selected, so it remains hidden.
      expect(windows[5].isVisible()).toBe(false);
    });

    it('ignores a window command targeting only non-existent windows', () => {
      // Only window 5 exists; the bitmap selects windows {0, 1} which do not.
      const controlCodes = [
        ...defineWindowCmd(5, /* visible= */ true), ...textControlCodes,
      ];
      getCaptionsFromPackets(
          service, createCea708PacketFromBytes(controlCodes, startTime));

      const deletePacket =
          createCea708PacketFromBytes([0x8c, 0x03], endTime);
      const captions = getCaptionsFromPackets(service, deletePacket);

      // No existing window matches the bitmap, so nothing is emitted...
      expect(captions).toEqual([]);
      // ...and the one defined window is untouched.
      const windows = windowsOf(service);
      expect(windows[5]).not.toBeNull();
      expect(windows[5].isVisible()).toBe(true);
    });

    it('keeps the current window when SetCurrentWindow targets an ' +
        'undefined window', () => {
      // Define window 0, type 'te', then SetCurrentWindow to window 2 (0x82),
      // which was never defined. The command must be ignored so the current
      // window stays window 0, and the remaining text 'st' lands in window 0.
      const controlCodes = [
        ...defineWindowCmd(windowId, /* visible= */ true),
        0x74, 0x65, // t, e
        0x82, // SetCurrentWindow -> window 2 (undefined): ignored.
        0x73, 0x74, // s, t
      ];
      const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
      const packet2 = createCea708PacketFromBytes(hideWindow, endTime);
      const captions = getCaptionsFromPackets(service, packet1, packet2);

      // All four characters landed in window 0.
      expect(captions).toEqual([
        expectedTestCue(windowId, startTime, endTime),
      ]);
      // Window 2 was never created by the ignored SetCurrentWindow command.
      expect(windowsOf(service)[2]).toBeNull();
    });

    it('ignores pen and character commands when there is no current ' +
        'window', () => {
      // With no DefineWindow first, there is no current window. Each command
      // still reads its operand bytes (keeping the block aligned) but must be
      // a no-op that creates no window and emits no cue.
      const controlCodes = [
        0x74, 0x65, 0x73, 0x74, // G0 text 'test' with no current window.
        0x92, 0x02, 0x00, // SetPenLocation (reads 2 operand bytes).
        0x90, 0x00, 0xc0, // SetPenAttributes (reads 2 operand bytes).
        0x91, 0x30, 0x33, 0x00, // SetPenColor (reads 3 operand bytes).
      ];
      const packet = createCea708PacketFromBytes(controlCodes, startTime);

      // No exception (operands consumed) and no cue emitted.
      const captions = getCaptionsFromPackets(service, packet);
      expect(captions).toEqual([]);

      // No window was created by any of the commands.
      for (const window of windowsOf(service)) {
        expect(window).toBeNull();
      }
    });

    // A window command affects exactly the existing windows whose bitmap bit
    // is set. delete (0x8c) is used as the representative command.

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

    it('delete affects exactly the existing windows whose bit is set', () => {
      // A spread of fixed seeds keeps the test deterministic while exercising
      // many randomly chosen (defined-window set, bitmap) pairs.
      const seeds = [
        0x00000001, 0x00c0ffee, 0x0badf00d, 0x00012345,
        0x00abcdef, 0x9e3779b9, 0x2545f491, 0xdeadbeef,
      ];
      const iterationsPerSeed = 30;

      for (const seed of seeds) {
        const rng = mulberry32(seed);
        for (let i = 0; i < iterationsPerSeed; i++) {
          // Randomly define a subset of windows 0-7 (each with ~1/2 chance),
          // and pick a random 8-bit window bitmap for the delete command.
          const definedIds = [];
          for (let id = 0; id < 8; id++) {
            if (rng() < 0.5) {
              definedIds.push(id);
            }
          }
          const bitmap = randInt(rng, 0xff);

          // Each defined window is visible and holds the text 'test'.
          const svc = new shaka.cea.Cea708Service(serviceNumber);
          const controlCodes = [];
          for (const id of definedIds) {
            controlCodes.push(
                ...defineWindowCmd(id, /* visible= */ true),
                ...textControlCodes);
          }
          if (controlCodes.length) {
            getCaptionsFromPackets(
                svc, createCea708PacketFromBytes(controlCodes, startTime));
          }

          // The command should affect exactly the existing, selected windows.
          const affected = new Set(
              definedIds.filter((id) => (bitmap & (1 << id)) !== 0));

          getCaptionsFromPackets(
              svc, createCea708PacketFromBytes([0x8c, bitmap], endTime));

          const windows = windowsOf(svc);
          for (let id = 0; id < 8; id++) {
            if (affected.has(id)) {
              // Selected, existing windows are deleted.
              expect(windows[id]).toBeNull();
            } else if (definedIds.includes(id)) {
              // Existing but unselected windows are untouched: still present,
              // still visible, and still holding their 'test' content.
              expect(windows[id]).not.toBeNull();
              expect(windows[id].isVisible()).toBe(true);
              expect(windows[id].forceEmit(endTime + 1, serviceNumber))
                  .not.toBeNull();
            } else {
              // Never-defined windows remain null regardless of the bitmap.
              expect(windows[id]).toBeNull();
            }
          }
        }
      }
    });
  });
});
