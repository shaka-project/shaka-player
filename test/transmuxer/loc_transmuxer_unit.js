/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('LocTransmuxer', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /** @type {!shaka.transmuxer.LocTransmuxer} */
  let transmuxer;

  beforeEach(() => {
    transmuxer = new shaka.transmuxer.LocTransmuxer('moq/loc');
  });

  afterEach(() => {
    transmuxer.destroy();
  });

  /**
   * @param {number=} startTime
   * @return {!shaka.media.SegmentReference}
   */
  function makeReference(startTime) {
    const start = startTime || 0;
    return new shaka.media.SegmentReference(
        start,
        start + 1024 / 48000,
        /* getUris= */ () => [],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity);
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

  /**
   * Builds an ADTS frame (no CRC) wrapping `payload`: AAC-LC, 48 kHz, stereo.
   *
   * @param {!Uint8Array} payload
   * @param {number=} declaredFullLength Overrides the length written into the
   *   header, to simulate a syncword that is really raw audio.
   * @return {!Uint8Array}
   */
  function adtsFrame(payload, declaredFullLength) {
    const headerLength = 7;
    const fullLength = declaredFullLength === undefined ?
        headerLength + payload.byteLength :
        declaredFullLength;
    const header = new Uint8Array([
      0xff, 0xf1,
      // profile(2)=AAC-LC, samplingFreqIdx(4)=3 (48 kHz), private(1),
      // channelConfig high bit.
      0x4c,
      // channelConfig low bits = 2, then the top 2 bits of the length.
      0x80 | ((fullLength >> 11) & 0x03),
      (fullLength >> 3) & 0xff,
      ((fullLength & 0x07) << 5) | 0x1f,
      0xfc,
    ]);
    const out = new Uint8Array(headerLength + payload.byteLength);
    out.set(header, 0);
    out.set(payload, headerLength);
    return out;
  }

  /**
   * @param {!Uint8Array} data
   * @return {!Promise<!Uint8Array>}
   */
  async function transmuxAudio(data) {
    const stream = /** @type {shaka.extern.Stream} */ ({
      id: 1,
      type: ContentType.AUDIO,
      codecs: 'mp4a.40.2',
      mimeType: 'moq/loc',
      audioSamplingRate: 48000,
      channelsCount: 2,
      language: 'und',
    });
    const result = /** @type {!shaka.extern.TransmuxerOutput} */ (
      await transmuxer.transmux(
          data, stream, makeReference(), /* duration= */ 1024 / 48000,
          ContentType.AUDIO));
    return mdatOf(result.data);
  }

  describe('AAC', () => {
    // A plausible stereo AAC-LC raw_data_block: starts with a CPE element,
    // so its first byte is 0x21 and it is NOT an ADTS frame.
    const rawAac = new Uint8Array([
      0x21, 0x11, 0x45, 0x00, 0x14, 0x50, 0x01, 0x40,
    ]);

    it('passes a raw access unit through unchanged', async () => {
      // moqlivemock and any LOC-04 conforming publisher send this.
      expect(await transmuxAudio(rawAac)).toEqual(rawAac);
    });

    it('strips an ADTS header the publisher left on', async () => {
      // An mp4a sample entry is described by its esds, so a sample that still
      // carries the 0xFFFx syncword fails the whole decode pipeline.
      expect(await transmuxAudio(adtsFrame(rawAac))).toEqual(rawAac);
    });

    it('leaves a syncword-like access unit alone', async () => {
      // Raw AAC can begin with 0xFF by coincidence. In LOC one object is one
      // frame, so a genuine ADTS frame declares a length covering exactly the
      // object; anything else is not a header.
      const looksLikeAdts = adtsFrame(rawAac, /* declaredFullLength= */ 900);
      expect(await transmuxAudio(looksLikeAdts)).toEqual(looksLikeAdts);
    });
  });
});
