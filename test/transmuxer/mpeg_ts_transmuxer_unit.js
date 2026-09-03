/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MpegTsTransmuxer', () => {
  /** MPEG-1 Layer II, 48 kHz, stereo, 256 kbit/s. */
  const FRAME_LENGTH = 768;
  const AUDIO_PID = 0x100;
  const PMT_PID = 0x1000;

  /**
   * @param {number} count
   * @return {!Uint8Array}
   */
  function makeElementaryStream(count) {
    const data = new Uint8Array(count * FRAME_LENGTH);
    for (let i = 0; i < count; i++) {
      const offset = i * FRAME_LENGTH;
      data[offset] = 0xff;
      data[offset + 1] = 0xfc;
      data[offset + 2] = 0xc4;
      data[offset + 3] = 0x00;
      // Leave the rest as zeros, so that no false sync word can appear.
    }
    return data;
  }

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

  /** @return {!Uint8Array} */
  function makePmt() {
    const section = new Uint8Array([
      0x00, // pointer_field
      0x02, // table_id
      0xb0, 0x12, // section_syntax_indicator + section_length (18)
      0x00, 0x01, // program_number
      0xc1, 0x00, 0x00, // version, section numbers
      0xe0 | ((AUDIO_PID >> 8) & 0x1f), AUDIO_PID & 0xff, // PCR PID
      0xf0, 0x00, // program_info_length
      // ISO/IEC 13818-3 audio (MPEG-2 halved sample rate audio).
      0x04,
      0xe0 | ((AUDIO_PID >> 8) & 0x1f), AUDIO_PID & 0xff,
      0xf0, 0x00, // ES_info_length
      0x00, 0x00, 0x00, 0x00, // CRC32 (not verified by the parser)
    ]);
    return makeTsPacket(PMT_PID, true, 0, section);
  }

  /**
   * @param {!Uint8Array} payload
   * @param {number} pts
   * @return {!Uint8Array}
   */
  function makePes(payload, pts) {
    const header = new Uint8Array(14);
    header[0] = 0x00;
    header[1] = 0x00;
    header[2] = 0x01;
    header[3] = 0xc0; // stream_id: audio
    const packetLength = payload.length + 8;
    header[4] = (packetLength >> 8) & 0xff;
    header[5] = packetLength & 0xff;
    header[6] = 0x80;
    header[7] = 0x80; // PTS present
    header[8] = 0x05; // PES_header_data_length
    header[9] = 0x20 | ((pts >> 29) & 0x0e) | 0x01;
    header[10] = (pts >> 22) & 0xff;
    header[11] = ((pts >> 14) & 0xfe) | 0x01;
    header[12] = (pts >> 7) & 0xff;
    header[13] = ((pts << 1) & 0xfe) | 0x01;
    return shaka.util.Uint8ArrayUtils.concat(header, payload);
  }

  /**
   * Builds a TS with MPEG audio split into PES packets of |pesPayloadSize|
   * bytes, which is deliberately not a multiple of the frame length.
   *
   * @param {!Uint8Array} elementaryStream
   * @param {number} pesPayloadSize
   * @return {!Uint8Array}
   */
  function makeTs(elementaryStream, pesPayloadSize) {
    const packets = [makePat(), makePmt()];
    let continuityCounter = 0;
    let pts = 900000;
    for (let i = 0; i < elementaryStream.length; i += pesPayloadSize) {
      const pes = makePes(
          elementaryStream.subarray(i, i + pesPayloadSize), pts);
      pts += 90000;
      for (let j = 0; j < pes.length; j += 184) {
        packets.push(makeTsPacket(AUDIO_PID, j == 0, continuityCounter++,
            pes.subarray(j, j + 184)));
      }
    }
    return shaka.util.Uint8ArrayUtils.concatRange(packets);
  }

  /** @type {!shaka.transmuxer.MpegTsTransmuxer} */
  let transmuxer;
  /** @type {shaka.extern.Stream} */
  let stream;
  /** @type {!shaka.media.SegmentReference} */
  let reference;

  beforeEach(() => {
    transmuxer = new shaka.transmuxer.MpegTsTransmuxer('video/mp2t');
    stream = /** @type {shaka.extern.Stream} */ ({
      id: 1,
      originalId: '1',
      type: 'audio',
      mimeType: 'video/mp2t',
      codecs: 'mp4a.40.34',
      language: 'und',
      drmInfos: [],
      keyIds: new Set(),
    });
    reference = /** @type {!shaka.media.SegmentReference} */ ({
      discontinuitySequence: 0,
      startTime: 0,
      endTime: 10,
      getUris: () => ['test://segment'],
    });
  });

  afterEach(() => {
    transmuxer.destroy();
  });

  it('keeps frames that straddle a PES boundary', async () => {
    const elementaryStream = makeElementaryStream(40);
    // 500 is not a multiple of 768, so most frames cross a PES boundary.
    const ts = makeTs(elementaryStream, 500);

    const output = await transmuxer.transmux(
        ts, stream, reference, 10, 'audio');

    // The output must be the elementary stream, unchanged.  Before this was
    // fixed, the frames that straddled a PES boundary were dropped and their
    // leading bytes in the next payload were emitted as a truncated frame of
    // their own.
    expect(shaka.util.BufferUtils.equal(output, elementaryStream)).toBe(true);
  });
});
