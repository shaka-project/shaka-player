/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('AV1', () => {
  const AV1 = shaka.transmuxer.AV1;

  /**
   * The sequence header OBU of moqlivemock's
   * assets/test10s/video_600kbps_av1.mp4, copied out of the first coded key
   * frame: 1280x720, profile 0 (Main), level 5, 8-bit, 4:2:0.
   *
   * Header byte 0x0a is obu_type=1 (OBU_SEQUENCE_HEADER) with
   * obu_has_size_field=1, and 0x0b is the 11-byte payload size.
   *
   * @const {!Uint8Array}
   */
  const sequenceHeaderObu = new Uint8Array([
    0x0a, 0x0b,
    0x00, 0x00, 0x00, 0x2d, 0x4c, 0xff, 0xb3, 0xc6, 0xaf, 0x98, 0x04,
  ]);

  /**
   * Builds an OBU_FRAME whose uncompressed header begins with `firstByte`.
   *
   * @param {number} firstByte
   * @return {!Uint8Array}
   */
  function frameObu(firstByte) {
    // 0x32: obu_type=6 (OBU_FRAME), obu_has_size_field=1.
    return new Uint8Array([0x32, 0x03, firstByte, 0x00, 0x96]);
  }

  /**
   * @param {...!Uint8Array} parts
   * @return {!Uint8Array}
   */
  function concat(...parts) {
    return shaka.util.Uint8ArrayUtils.concat(...parts);
  }

  // The first byte of the uncompressed header packs show_existing_frame f(1),
  // frame_type f(2) and show_frame f(1) into its top nibble.
  const keyFrameHeaderByte = 0x10; // 0, KEY_FRAME (0), shown
  const interFrameHeaderByte = 0x30; // 0, INTER_FRAME (1), shown
  const showExistingHeaderByte = 0x80; // show_existing_frame = 1

  describe('parseObus', () => {
    it('splits a temporal unit into its OBUs', () => {
      const obus = AV1.parseObus(
          concat(sequenceHeaderObu, frameObu(keyFrameHeaderByte)));

      expect(obus.length).toBe(2);
      expect(obus[0].type).toBe(1);
      expect(obus[0].data.byteLength).toBe(11);
      expect(obus[0].fullData).toEqual(sequenceHeaderObu);
      expect(obus[1].type).toBe(6);
      expect(obus[1].data.byteLength).toBe(3);
    });

    it('skips the extension byte', () => {
      // 0x0e adds obu_extension_flag to the sequence header type, so a
      // temporal_id/spatial_id byte precedes the size field.
      const extended = concat(
          new Uint8Array([0x0e, 0x00, 0x0b]), sequenceHeaderObu.subarray(2));

      const obus = AV1.parseObus(extended);
      expect(obus.length).toBe(1);
      expect(obus[0].type).toBe(1);
      expect(obus[0].data).toEqual(sequenceHeaderObu.subarray(2));
    });

    it('runs an OBU with no size field to the end of the unit', () => {
      // 0x08 clears obu_has_size_field, which only the last OBU may do.
      const unsized =
          concat(new Uint8Array([0x08]), sequenceHeaderObu.subarray(2));

      const obus = AV1.parseObus(unsized);
      expect(obus.length).toBe(1);
      expect(obus[0].data.byteLength).toBe(11);
    });

    it('reads a multi-byte leb128 size', () => {
      const payload = new Uint8Array(200);
      // 200 = 0xc8 -> leb128 0xc8 0x01.
      const obus =
          AV1.parseObus(concat(new Uint8Array([0x32, 0xc8, 0x01]), payload));

      expect(obus.length).toBe(1);
      expect(obus[0].data.byteLength).toBe(200);
    });

    it('stops at an OBU that runs past the end of the unit', () => {
      const truncated =
          concat(sequenceHeaderObu, new Uint8Array([0x32, 0x40, 0x10]));

      const obus = AV1.parseObus(truncated);
      expect(obus.length).toBe(1);
      expect(obus[0].type).toBe(1);
    });

    it('stops when obu_forbidden_bit is set', () => {
      const obus = AV1.parseObus(
          concat(sequenceHeaderObu, new Uint8Array([0x80, 0x00])));

      expect(obus.length).toBe(1);
    });

    it('returns nothing for an empty unit', () => {
      expect(AV1.parseObus(new Uint8Array([]))).toEqual([]);
    });
  });

  describe('parseInfo', () => {
    it('reads the sequence header', () => {
      const obus = AV1.parseObus(
          concat(sequenceHeaderObu, frameObu(keyFrameHeaderByte)));
      const info = AV1.parseInfo(obus);

      goog.asserts.assert(info, 'Should have parsed the sequence header');
      expect(info.width).toBe(1280);
      expect(info.height).toBe(720);
      expect(info.reducedStillPicture).toBe(false);
    });

    it('builds the av1C record', () => {
      const obus = AV1.parseObus(sequenceHeaderObu);
      const info = AV1.parseInfo(obus);
      goog.asserts.assert(info, 'Should have parsed the sequence header');

      // The four fixed bytes are the ones the source file carries in its own
      // av1C box: marker+version, then profile 0 / level 5, then Main tier,
      // 8-bit, colour, 4:2:0 with an unknown chroma sample position.
      expect(info.videoConfig.subarray(0, 4))
          .toEqual(new Uint8Array([0x81, 0x05, 0x0c, 0x00]));
      // configOBUs is the sequence header OBU copied verbatim.
      expect(info.videoConfig.subarray(4)).toEqual(sequenceHeaderObu);
    });

    it('returns null without a sequence header', () => {
      const obus = AV1.parseObus(frameObu(interFrameHeaderByte));
      expect(AV1.parseInfo(obus)).toBe(null);
    });

    it('returns null for a truncated sequence header', () => {
      // A header that runs off the end reads as zeros, which would otherwise
      // describe a 1x1 stream.
      const obus = AV1.parseObus(new Uint8Array([0x0a, 0x02, 0x00, 0x00]));
      expect(AV1.parseInfo(obus)).toBe(null);
    });
  });

  describe('isKeyframe', () => {
    it('accepts a key frame', () => {
      const obus = AV1.parseObus(
          concat(sequenceHeaderObu, frameObu(keyFrameHeaderByte)));
      expect(AV1.isKeyframe(obus, /* reducedStillPicture= */ false)).toBe(true);
    });

    it('rejects an inter frame', () => {
      const obus = AV1.parseObus(frameObu(interFrameHeaderByte));
      expect(AV1.isKeyframe(obus, /* reducedStillPicture= */ false))
          .toBe(false);
    });

    it('rejects a show_existing_frame header', () => {
      const obus = AV1.parseObus(frameObu(showExistingHeaderByte));
      expect(AV1.isKeyframe(obus, /* reducedStillPicture= */ false))
          .toBe(false);
    });

    it('reads the first frame OBU, not a later one', () => {
      // A temporal unit with more than one frame is decided by the first.
      const obus = AV1.parseObus(concat(
          frameObu(interFrameHeaderByte), frameObu(keyFrameHeaderByte)));
      expect(AV1.isKeyframe(obus, /* reducedStillPicture= */ false))
          .toBe(false);
    });

    it('treats every frame of a reduced still picture as a key frame', () => {
      // reduced_still_picture_header suppresses show_existing_frame and
      // frame_type, so the bits that would read as INTER_FRAME are picture
      // data.
      const obus = AV1.parseObus(frameObu(interFrameHeaderByte));
      expect(AV1.isKeyframe(obus, /* reducedStillPicture= */ true)).toBe(true);
    });

    it('rejects a unit with no frame OBU', () => {
      const obus = AV1.parseObus(sequenceHeaderObu);
      expect(AV1.isKeyframe(obus, /* reducedStillPicture= */ false))
          .toBe(false);
    });
  });

  describe('real bitstream', () => {
    // The first 20 bytes of the first coded frame of
    // assets/test10s/video_600kbps_av1.mp4: the sequence header OBU followed
    // by the start of a 10209-byte OBU_FRAME.
    it('reads a key frame temporal unit', () => {
      const unit = new Uint8Array([
        0x0a, 0x0b, 0x00, 0x00, 0x00, 0x2d, 0x4c, 0xff, 0xb3, 0xc6,
        0xaf, 0x98, 0x04,
        // OBU_FRAME, leb128 size 10209, then the uncompressed header.
        0x32, 0xe1, 0x4f, 0x10, 0x00, 0x96, 0xc0,
      ]);

      const obus = AV1.parseObus(unit);
      // The frame OBU declares more bytes than this excerpt holds, so only the
      // sequence header survives the size check.
      expect(obus.length).toBe(1);

      const info = AV1.parseInfo(obus);
      goog.asserts.assert(info, 'Should have parsed the sequence header');
      expect(info.width).toBe(1280);
      expect(info.height).toBe(720);
    });

    it('reads an inter frame header', () => {
      // The start of the second coded frame: OBU_FRAME, size 429.
      const obus = AV1.parseObus(concat(
          new Uint8Array([0x32, 0x05, 0x30, 0x02, 0x00, 0x09, 0x24])));

      expect(obus.length).toBe(1);
      expect(obus[0].type).toBe(6);
      expect(AV1.isKeyframe(obus, /* reducedStillPicture= */ false))
          .toBe(false);
    });
  });
});
