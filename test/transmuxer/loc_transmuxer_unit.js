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

  describe('decoder config cache', () => {
    /**
     * @param {number} id
     * @return {shaka.extern.Stream}
     */
    function videoStream(id) {
      return /** @type {shaka.extern.Stream} */ ({
        id,
        type: ContentType.VIDEO,
        codecs: 'avc3.4d401f',
        mimeType: 'moq/loc',
        width: 1920,
        height: 1080,
        language: 'und',
      });
    }

    // A length-prefixed non-IDR slice: no parameter sets, so it can never
    // refresh the cache on its own.  This is what the first frames after a
    // mid-GOP adaptation look like.
    const nonKeyFrame = new Uint8Array([0, 0, 0, 3, 0x41, 0x9a, 0x02]);

    /**
     * The cache is the transmuxer's own state, and the only way to observe
     * which rendition it describes.  Stands in for a key frame having
     * populated it.
     *
     * @suppress {visibility}
     */
    function primeAvcInfo() {
      transmuxer.avcInfo_ = {
        videoConfig: new Uint8Array([1]),
        hSpacing: 1,
        vSpacing: 1,
        width: 1920,
        height: 1080,
      };
    }

    /**
     * @return {boolean}
     * @suppress {visibility}
     */
    function hasAvcInfo() {
      return transmuxer.avcInfo_ != null;
    }

    /**
     * @param {shaka.extern.Stream} stream
     * @return {!Promise}
     */
    function transmuxVideo(stream) {
      return transmuxer.transmux(nonKeyFrame, stream, makeReference(),
          /* duration= */ 1 / 25, ContentType.VIDEO);
    }

    it('keeps the cache while the rendition is unchanged', async () => {
      const stream = videoStream(1);
      await transmuxVideo(stream);

      primeAvcInfo();
      await transmuxVideo(stream);

      expect(hasAvcInfo()).toBe(true);
    });

    it('drops the cache when the rendition changes', async () => {
      // MediaSourceEngine keeps one transmuxer per content type and every LOC
      // rendition normalises to the same base codec, so an adaptation reuses
      // this instance with no changeType().  A switch lands mid-GOP, so the
      // first frames of the new rendition cannot refresh the cache — and the
      // initialization segment would describe the previous rendition.
      await transmuxVideo(videoStream(1));
      primeAvcInfo();

      await transmuxVideo(videoStream(2));

      expect(hasAvcInfo()).toBe(false);
    });

    it('emits nothing until the new rendition has a key frame', async () => {
      await transmuxVideo(videoStream(1));
      primeAvcInfo();

      const result = /** @type {!shaka.extern.TransmuxerOutput} */ (
        await transmuxVideo(videoStream(2)));
      expect(result.data.byteLength).toBe(0);
    });
  });

  describe('AV1', () => {
    // The sequence header OBU of moqlivemock's
    // assets/test10s/video_600kbps_av1.mp4: 1280x720, profile 0, level 5,
    // 8-bit 4:2:0.  moqlivemock sends it in-band ahead of every key frame,
    // exactly as it appears here.
    const sequenceHeaderObu = new Uint8Array([
      0x0a, 0x0b,
      0x00, 0x00, 0x00, 0x2d, 0x4c, 0xff, 0xb3, 0xc6, 0xaf, 0x98, 0x04,
    ]);

    // OBU_FRAME, 3-byte payload.  The first byte of the uncompressed header
    // packs show_existing_frame f(1), frame_type f(2) and show_frame f(1).
    const keyFrameObu = new Uint8Array([0x32, 0x03, 0x10, 0x00, 0x96]);
    const interFrameObu = new Uint8Array([0x32, 0x03, 0x30, 0x00, 0x96]);

    const keyFrameUnit =
        shaka.util.Uint8ArrayUtils.concat(sequenceHeaderObu, keyFrameObu);

    /**
     * @param {number=} id
     * @return {shaka.extern.Stream}
     */
    function av1Stream(id) {
      return /** @type {shaka.extern.Stream} */ ({
        id: id || 1,
        type: ContentType.VIDEO,
        codecs: 'av01.0.05M.08',
        mimeType: 'moq/loc',
        language: 'und',
      });
    }

    /**
     * @param {!Uint8Array} data
     * @param {shaka.extern.Stream=} stream
     * @return {!Promise<!shaka.extern.TransmuxerOutput>}
     */
    function transmuxAv1(data, stream) {
      return /** @type {!Promise<!shaka.extern.TransmuxerOutput>} */ (
        transmuxer.transmux(
            data, stream || av1Stream(), makeReference(),
            /* duration= */ 1 / 25, ContentType.VIDEO));
    }

    it('supports the codec', async () => {
      if (!await shaka.test.Util.isTypeSupported(
          'video/mp4; codecs="av01.0.05M.08"',
          /* width= */ 1280, /* height= */ 720)) {
        pending('Codec AV1 is not supported by the platform.');
      }

      expect(transmuxer.isSupported(
          'moq/loc; codecs="av01.0.05M.08"', ContentType.VIDEO)).toBe(true);
    });

    it('passes the temporal unit through as one sample', async () => {
      // LOC carries the temporal unit exactly as an av01 sample wants it, so
      // nothing is reframed: no start codes to strip, no length prefixes to
      // add, and the sequence header OBU stays in the sample.
      const result = await transmuxAv1(keyFrameUnit);
      expect(mdatOf(result.data)).toEqual(keyFrameUnit);
    });

    it('takes the resolution from the sequence header', async () => {
      const stream = av1Stream();
      await transmuxAv1(keyFrameUnit, stream);

      expect(stream.width).toBe(1280);
      expect(stream.height).toBe(720);
    });

    it('builds an av01 sample entry with an av1C box', async () => {
      const result = await transmuxAv1(keyFrameUnit);
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
      expect(av1C).toEqual(shaka.util.Uint8ArrayUtils.concat(
          new Uint8Array([0x81, 0x05, 0x0c, 0x00]), sequenceHeaderObu));
    });

    it('emits nothing before the first sequence header', async () => {
      // An inter frame carries no sequence header, so there is nothing to
      // describe the stream with yet.
      const result = await transmuxAv1(interFrameObu);
      expect(result.data.byteLength).toBe(0);
    });

    it('reuses the cached sequence header for inter frames', async () => {
      await transmuxAv1(keyFrameUnit);

      const result = await transmuxAv1(interFrameObu);
      expect(mdatOf(result.data)).toEqual(interFrameObu);
    });

    it('drops the cache when the rendition changes', async () => {
      await transmuxAv1(keyFrameUnit, av1Stream(1));

      const result = await transmuxAv1(interFrameObu, av1Stream(2));
      expect(result.data.byteLength).toBe(0);
    });
  });

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
