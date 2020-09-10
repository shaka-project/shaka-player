/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Cea708Service', () => {
  const CeaUtils = shaka.test.CeaUtils;

  /** @type {!shaka.cea.Cea708Service} */
  let service;

  /**
   * Hide window (2 bytes), with a bitmap provided to indicate all windows.
   * @type {!Array<!number>}
   */
  const hideWindow = [0x8a, 0xff];

  /**
   * Define window (7 bytes), defines window #0 to be a visible window
   * with 32 rows and 32 columns. (We specify 31 for each since decoder adds 1).
   * @type {!Array<!number>}
   */
  const defineWindow = [
    0x98, 0x38, 0x00, 0x00, 0x1f, 0x1f, 0x00,
  ];

  /** @type {!number} */
  const startTime = 1;

  /** @type {!number} */
  const endTime = 2;

  /**
   * We arbitrarily pick service 1 for all of these tests.
   * @type {!number}
   */
  const serviceNumber = 1;

  /** @type {!string} */
  const stream = `svc${serviceNumber}`;

  /**
   * Takes in a array of bytes and a presentation timestamp (in seconds),
   * and converts it into a CEA-708 DTVCC Packet.
   * @param {!Array<!number>} bytes
   * @param {!number} pts
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
   */
  const getCaptionsFromPackets = (service, ...packets) => {
    const captions = [];
    for (const packet of packets) {
      while (packet.hasMoreData()) {
        const caption = service.handleCea708ControlCode(packet);
        if (caption) {
          captions.push(caption);
        }
      }
    }
    return captions;
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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

      // Currently, setWindowAttributes is only used to justify text,
      // as specified by the last 2 bits of the fourth byte. The
      // other bytes after the first byte are "don't care".
      0x97, 0x00, 0x00, 0x01, 0x00, // Justify right
    ];

    const packet1 = createCea708PacketFromBytes(controlCodes, startTime);
    const packet2 = createCea708PacketFromBytes(hideWindow, endTime);

    // Right-justified text is expected.
    const text = 'test';
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
    const topLevelCue = new shaka.text.Cue(startTime, endTime, '');
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
      const topLevelCue1 = new shaka.text.Cue(
          /* startTime= */ time1, /* endTime= */ time2, '');
      topLevelCue1.nestedCues = [
        CeaUtils.createDefaultCue(
            /* startTime= */ time1, /* endTime= */ time2, /* payload= */ text1),
      ];

      const topLevelCue2 = new shaka.text.Cue(
          /* startTime= */ time3, /* endTime= */ time4, '');
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
      const topLevelCue = new shaka.text.Cue(
          /* startTime= */ time1, /* endTime= */ time2, '');
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
});
