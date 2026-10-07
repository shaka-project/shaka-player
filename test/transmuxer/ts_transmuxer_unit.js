/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TsTransmuxer', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

  const VIDEO_PID = 0x100;
  const PMT_PID = 0x1000;

  /**
   * @param {number} pid
   * @param {boolean} start
   * @param {number} continuityCounter
   * @param {!Uint8Array} payload At most 184 bytes.
   * @return {!Uint8Array}
   */
  function makeTsPacket(pid, start, continuityCounter, payload) {
    goog.asserts.assert(payload.length <= 184, 'payload too long');
    const packet = new Uint8Array(188);
    packet[0] = 0x47;
    packet[1] = (start ? 0x40 : 0x00) | ((pid >> 8) & 0x1f);
    packet[2] = pid & 0xff;
    const stuffing = 184 - payload.length;
    if (stuffing) {
      // Adaptation field followed by a payload.
      packet[3] = 0x30 | (continuityCounter & 0xf);
      packet[4] = stuffing - 1;
      if (stuffing > 1) {
        packet[5] = 0x00;
        packet.fill(0xff, 6, 4 + stuffing);
      }
    } else {
      packet[3] = 0x10 | (continuityCounter & 0xf);
    }
    packet.set(payload, 4 + stuffing);
    return packet;
  }

  /** @return {!Uint8Array} */
  function makePat() {
    const section = new Uint8Array([
      0x00, // pointer_field
      0x00, // table_id
      0xb0, 0x0d, // section_syntax_indicator + section_length (13)
      0x00, 0x01, // transport_stream_id
      0xc1, 0x00, 0x00, // version, section numbers
      0x00, 0x01, // program_number
      0xe0 | ((PMT_PID >> 8) & 0x1f), PMT_PID & 0xff,
      0x00, 0x00, 0x00, 0x00, // CRC32 (not verified by the parser)
    ]);
    return makeTsPacket(0, true, 0, section);
  }

  /**
   * An AV1 PMT: stream_type 0x06 (private data), described by a registration
   * descriptor and an AV1 video descriptor.
   *
   * @return {!Uint8Array}
   */
  function makePmt() {
    const section = new Uint8Array([
      0x00, // pointer_field
      0x02, // table_id
      0xb0, 0x1e, // section_syntax_indicator + section_length (30)
      0x00, 0x01, // program_number
      0xc1, 0x00, 0x00, // version, section numbers
      0xe0 | ((VIDEO_PID >> 8) & 0x1f), VIDEO_PID & 0xff, // PCR PID
      0xf0, 0x00, // program_info_length
      // MPEG-2 PES packets containing private data.
      0x06,
      0xe0 | ((VIDEO_PID >> 8) & 0x1f), VIDEO_PID & 0xff,
      0xf0, 0x0c, // ES_info_length
      // Registration descriptor, 'AV01'.
      0x05, 0x04, 0x41, 0x56, 0x30, 0x31,
      // AV1 video descriptor: profile 0, level 5, 8-bit 4:2:0, no initial
      // presentation delay.
      0x80, 0x04, 0x81, 0x05, 0x0c, 0x00,
      0x00, 0x00, 0x00, 0x00, // CRC32 (not verified by the parser)
    ]);
    return makeTsPacket(PMT_PID, true, 0, section);
  }

  /**
   * @param {!Uint8Array} payload
   * @param {number} pts
   * @param {number} dts
   * @return {!Uint8Array}
   */
  function makePes(payload, pts, dts) {
    const header = new Uint8Array(19);
    header[0] = 0x00;
    header[1] = 0x00;
    header[2] = 0x01;
    header[3] = 0xbd; // stream_id: private_stream_1
    const packetLength = payload.length + 13;
    header[4] = (packetLength >> 8) & 0xff;
    header[5] = packetLength & 0xff;
    header[6] = 0x84; // data_alignment_indicator
    header[7] = 0xc0; // PTS and DTS present
    header[8] = 0x0a; // PES_header_data_length
    header[9] = 0x30 | ((pts >> 29) & 0x0e) | 0x01;
    header[10] = (pts >> 22) & 0xff;
    header[11] = ((pts >> 14) & 0xfe) | 0x01;
    header[12] = (pts >> 7) & 0xff;
    header[13] = ((pts << 1) & 0xfe) | 0x01;
    header[14] = 0x10 | ((dts >> 29) & 0x0e) | 0x01;
    header[15] = (dts >> 22) & 0xff;
    header[16] = ((dts >> 14) & 0xfe) | 0x01;
    header[17] = (dts >> 7) & 0xff;
    header[18] = ((dts << 1) & 0xfe) | 0x01;
    return Uint8ArrayUtils.concat(header, payload);
  }

  /**
   * Builds a TS carrying one access unit per PES, each of them the given OBUs
   * wrapped the way the AV1 in MPEG-2 TS spec asks for: a start code ahead of
   * every OBU, and its forbidden byte sequences escaped.
   *
   * @param {!Array<!Uint8Array>} accessUnits
   * @return {!Uint8Array}
   */
  function makeTs(accessUnits) {
    const packets = [makePat(), makePmt()];
    let continuityCounter = 0;
    // 3600 ticks of the 90 kHz clock, i.e. 25 fps.
    let dts = 900000;
    for (const accessUnit of accessUnits) {
      const pes = makePes(escape(accessUnit), dts + 3600, dts);
      dts += 3600;
      for (let j = 0; j < pes.length; j += 184) {
        packets.push(makeTsPacket(VIDEO_PID, j == 0, continuityCounter++,
            pes.subarray(j, j + 184)));
      }
    }
    return Uint8ArrayUtils.concatRange(packets);
  }

  /**
   * Wraps each OBU of an access unit into a ts_open_bitstream_unit().
   *
   * @param {!Uint8Array} accessUnit
   * @return {!Uint8Array}
   */
  function escape(accessUnit) {
    const output = [];
    for (const obu of shaka.util.Obu.parseAv1(accessUnit)) {
      output.push(0x00, 0x00, 0x01);
      let numZeros = 0;
      for (const byte of obu.fullData) {
        if (numZeros == 2 && byte <= 0x03) {
          output.push(0x03);
          numZeros = 0;
        }
        numZeros = byte ? 0 : numZeros + 1;
        output.push(byte);
      }
    }
    return new Uint8Array(output);
  }

  /**
   * Returns the bytes of the first mdat box in a transmuxed segment.
   *
   * @param {!Uint8Array} segment
   * @return {!Uint8Array}
   */
  function mdatOf(segment) {
    let payload = new Uint8Array([]);
    new shaka.util.Mp4Parser()
        .box('moof', shaka.util.Mp4Parser.children)
        .box('traf', shaka.util.Mp4Parser.children)
        .box('mdat', (box) => {
          payload = box.reader.readBytes(
              box.reader.getLength() - box.reader.getPosition(),
              /* clone= */ true);
        })
        .parse(segment);
    return payload;
  }

  /** @type {!shaka.transmuxer.TsTransmuxer} */
  let transmuxer;
  /** @type {shaka.extern.Stream} */
  let stream;
  /** @type {!shaka.media.SegmentReference} */
  let reference;

  beforeEach(() => {
    transmuxer = new shaka.transmuxer.TsTransmuxer('video/mp2t');
    stream = /** @type {shaka.extern.Stream} */ ({
      id: 1,
      originalId: '1',
      type: ContentType.VIDEO,
      mimeType: 'video/mp2t',
      codecs: 'av01.0.05M.08',
      language: 'und',
      drmInfos: [],
      keyIds: new Set(),
    });
    reference = /** @type {!shaka.media.SegmentReference} */ ({
      discontinuitySequence: 0,
      startTime: 0,
      endTime: 0.08,
      getUris: () => ['test://segment'],
    });
  });

  afterEach(() => {
    transmuxer.destroy();
  });

  describe('AV1', () => {
    // The sequence header OBU of moqlivemock's
    // assets/test10s/video_600kbps_av1.mp4: 1280x720, profile 0, level 5,
    // 8-bit 4:2:0.  Its payload holds 0x00 0x00 0x00 0x2d, a byte sequence a
    // TS muxer has to escape.
    const sequenceHeaderObu = new Uint8Array([
      0x0a, 0x0b,
      0x00, 0x00, 0x00, 0x2d, 0x4c, 0xff, 0xb3, 0xc6, 0xaf, 0x98, 0x04,
    ]);

    // OBU_TEMPORAL_DELIMITER, which has an empty payload.
    const temporalDelimiterObu = new Uint8Array([0x12, 0x00]);

    // OBU_FRAME, 3-byte payload.  The first byte of the uncompressed header
    // packs show_existing_frame f(1), frame_type f(2) and show_frame f(1).
    const keyFrameObu = new Uint8Array([0x32, 0x03, 0x10, 0x00, 0x96]);
    const interFrameObu = new Uint8Array([0x32, 0x03, 0x30, 0x00, 0x96]);

    const keyFrameUnit = Uint8ArrayUtils.concat(
        temporalDelimiterObu, sequenceHeaderObu, keyFrameObu);
    const interFrameUnit = Uint8ArrayUtils.concat(
        temporalDelimiterObu, interFrameObu);

    /**
     * @param {!Uint8Array} ts
     * @return {!Promise<!shaka.extern.TransmuxerOutput>}
     */
    function transmux(ts) {
      return /** @type {!Promise<!shaka.extern.TransmuxerOutput>} */ (
        transmuxer.transmux(
            ts, stream, reference, /* duration= */ 0.08, ContentType.VIDEO));
    }

    it('supports the codec', async () => {
      if (!await shaka.test.Util.isTypeSupported(
          'video/mp4; codecs="av01.0.05M.08"',
          /* width= */ 1280, /* height= */ 720)) {
        pending('Codec AV1 is not supported by the platform.');
      }

      expect(transmuxer.isSupported(
          'video/mp2t; codecs="av01.0.05M.08"', ContentType.VIDEO)).toBe(true);
    });

    it('turns each access unit into one sample', async () => {
      const result = await transmux(makeTs([keyFrameUnit, interFrameUnit]));

      // The start codes are gone and the escaped bytes are back to what the
      // encoder produced, which is what an av01 sample holds.
      expect(mdatOf(result.data))
          .toEqual(Uint8ArrayUtils.concat(keyFrameUnit, interFrameUnit));
    });

    it('takes the resolution from the sequence header', async () => {
      await transmux(makeTs([keyFrameUnit]));

      expect(stream.width).toBe(1280);
      expect(stream.height).toBe(720);
    });

    it('builds an av01 sample entry with an av1C box', async () => {
      const result = await transmux(makeTs([keyFrameUnit]));
      goog.asserts.assert(result.init, 'Should have an init segment');

      let av1C = null;
      new shaka.util.Mp4Parser()
          .box('moov', shaka.util.Mp4Parser.children)
          .box('trak', shaka.util.Mp4Parser.children)
          .box('mdia', shaka.util.Mp4Parser.children)
          .box('minf', shaka.util.Mp4Parser.children)
          .box('stbl', shaka.util.Mp4Parser.children)
          .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
          .box('av01', shaka.util.Mp4Parser.visualSampleEntry)
          .box('av1C', (box) => {
            av1C = box.reader.readBytes(
                box.reader.getLength() - box.reader.getPosition(),
                /* clone= */ true);
          })
          .parse(result.init);

      goog.asserts.assert(av1C, 'Should have found an av1C box');
      expect(av1C).toEqual(Uint8ArrayUtils.concat(
          new Uint8Array([0x81, 0x05, 0x0c, 0x00]), sequenceHeaderObu));
    });

    it('marks only the key frames as sync samples', async () => {
      const result = await transmux(makeTs([keyFrameUnit, interFrameUnit]));

      /** @type {!Array<boolean>} */
      const isNonSync = [];
      new shaka.util.Mp4Parser()
          .box('moof', shaka.util.Mp4Parser.children)
          .box('traf', shaka.util.Mp4Parser.children)
          .fullBox('trun', (box) => {
            const sampleCount = box.reader.readUint32();
            box.reader.skip(4); // data_offset
            for (let i = 0; i < sampleCount; i++) {
              box.reader.skip(4); // sample_duration
              box.reader.skip(4); // sample_size
              box.reader.skip(1);
              isNonSync.push((box.reader.readUint8() & 0x01) != 0);
              box.reader.skip(2);
              box.reader.skip(4); // sample_composition_time_offset
            }
          })
          .parse(result.data);

      expect(isNonSync).toEqual([false, true]);
    });

    it('reads the codec from the AV1 video descriptor', () => {
      const info = shaka.media.SegmentUtils.getBasicInfoFromTs(
          makeTs([keyFrameUnit]), /* disableAudio= */ false,
          /* disableVideo= */ false, /* disableText= */ true);

      goog.asserts.assert(info, 'Should have parsed the segment');
      expect(info.codecs).toBe('av01.0.05M.08.0.110.01.01.01.0');
    });

    it('emits nothing before the first sequence header', async () => {
      // An inter frame carries no sequence header, so there is nothing to
      // describe the stream with yet.
      const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.TRANSMUXING_FAILED,
          'test://segment'));
      await expectAsync(transmux(makeTs([interFrameUnit])))
          .toBeRejectedWith(expected);
    });
  });
});
