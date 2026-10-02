/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.codec.VP9');
goog.require('shaka.mkv.CodecId');
goog.require('shaka.mkv.MatroskaConstants');
goog.require('shaka.mkv.MatroskaCodecs');
goog.require('shaka.mkv.TrackType');

describe('MatroskaCodecs', () => {
  const CodecId = shaka.mkv.CodecId;
  const MatroskaCodecs = shaka.mkv.MatroskaCodecs;
  const TrackType = shaka.mkv.TrackType;

  /**
   * @param {number} number
   * @param {!Object=} overrides
   * @return {!shaka.mkv.MatroskaIndexParser.Track}
   */
  const makeTrack = (number, overrides) => {
    return shaka.test.Matroska.makeTrack(number, overrides);
  };

  describe('getContentType', () => {
    it('maps the track types the player uses', () => {
      expect(MatroskaCodecs.getContentType(
          makeTrack(1, {type: TrackType.VIDEO}))).toBe('video');
      expect(MatroskaCodecs.getContentType(
          makeTrack(1, {type: TrackType.AUDIO}))).toBe('audio');
      expect(MatroskaCodecs.getContentType(
          makeTrack(1, {type: TrackType.SUBTITLE}))).toBe('text');
    });

    it('ignores the others', () => {
      // Buttons.
      expect(MatroskaCodecs.getContentType(
          makeTrack(1, {type: 0x12}))).toBe(null);
    });
  });

  describe('getCodecs', () => {
    /**
     * @param {string} codecId
     * @param {?Uint8Array=} codecPrivate
     * @param {!Object=} overrides
     * @return {?string}
     */
    const getCodecs = (codecId, codecPrivate = null, overrides = {}) => {
      return MatroskaCodecs.getCodecs(makeTrack(1, Object.assign(
          {codecId, codecPrivate}, overrides)));
    };

    it('gives the AVC profile, constraints and level from avcC', () => {
      // Version 1, High profile, no constraints, level 3.1.
      const avcC = new Uint8Array([1, 0x64, 0x00, 0x1f, 0xff, 0xe1]);
      expect(getCodecs(CodecId.AVC, avcC)).toBe('avc1.64001f');
    });

    it('gives the HEVC parameters from hvcC', () => {
      // Main 10 (profile 2, compatible with 2), main tier, level 4.0 (120),
      // and the constraint byte 0x90.
      const hvcC = new Uint8Array([
        1, 0x02,
        0x20, 0x00, 0x00, 0x00,
        0x90, 0, 0, 0, 0, 0,
        120,
      ]);
      expect(getCodecs(CodecId.HEVC, hvcC)).toBe('hvc1.2.4.L120.90');
    });

    it('gives the tier, the profile space and every constraint of HEVC', () => {
      // Profile space 1 ("A"), high tier, profile 1, compatible with 1 and 2
      // (0x60000000 becomes 6 when the bits are reversed), level 5.1 (153),
      // and constraints 0xB0 0x00 0x0A.
      const hvcC = new Uint8Array([
        1, 0x40 | 0x20 | 0x01,
        0x60, 0x00, 0x00, 0x00,
        0xb0, 0x00, 0x0a, 0, 0, 0,
        153,
      ]);
      expect(getCodecs(CodecId.HEVC, hvcC)).toBe('hvc1.A1.6.H153.B0.0.A');
    });

    it('gives the AV1 profile, level, tier and bit depth from av1C', () => {
      // Profile 0, level 4.0 (index 8), main tier, 10 bits.
      expect(getCodecs(CodecId.AV1, new Uint8Array([0x81, 0x08, 0x4c, 0])))
          .toBe('av01.0.08M.10');
      // Profile 2, level 5.1 (index 13), high tier, 12 bits.
      expect(getCodecs(CodecId.AV1,
          new Uint8Array([0x81, 0x40 | 13, 0x80 | 0x40 | 0x20, 0])))
          .toBe('av01.2.13H.12');
      // 8 bits.
      expect(getCodecs(CodecId.AV1, new Uint8Array([0x81, 0x00, 0x00, 0])))
          .toBe('av01.0.00M.08');
    });

    it('gives the AAC object type from the AudioSpecificConfig', () => {
      // AAC-LC (2) at 44.1 kHz, stereo.
      expect(getCodecs(CodecId.AAC, new Uint8Array([0x12, 0x10])))
          .toBe('mp4a.40.2');
    });

    it('takes AAC-LC with a doubled output rate as HE-AAC', () => {
      expect(getCodecs(CodecId.AAC, new Uint8Array([0x13, 0x08]),
          {sampleRate: 24000, outputSampleRate: 48000})).toBe('mp4a.40.5');
      expect(getCodecs(CodecId.AAC, new Uint8Array([0x13, 0x08]),
          {sampleRate: 48000, outputSampleRate: 48000})).toBe('mp4a.40.2');
    });

    it('names the codecs that need no configuration', () => {
      expect(getCodecs(CodecId.AC3)).toBe('ac-3');
      expect(getCodecs(CodecId.EAC3)).toBe('ec-3');
      expect(getCodecs(CodecId.OPUS)).toBe('opus');
      expect(getCodecs(CodecId.MP3)).toBe('mp3');
      expect(getCodecs(CodecId.VP8)).toBe('vp8');
      expect(getCodecs(CodecId.SRT)).toBe('srt');
      expect(getCodecs(CodecId.ASCII)).toBe('srt');
    });

    it('takes SSA and ASS with the header of the track', () => {
      const header = new Uint8Array([91, 69, 118]);
      expect(getCodecs(CodecId.ASS, header)).toBe('ass');
      expect(getCodecs(CodecId.SSA, header)).toBe('ass');
      // The styles are in the header: without it there is nothing to show.
      expect(getCodecs(CodecId.ASS)).toBe(null);
    });

    it('rejects the codecs that no browser plays', () => {
      for (const codecId of ['A_DTS', 'A_TRUEHD', 'A_PCM/INT/LIT', 'V_MPEG2',
        'S_TEXT/WEBVTT', 'S_HDMV/PGS']) {
        expect(getCodecs(codecId, new Uint8Array(20))).toBe(null);
      }
    });

    it('rejects a track without the configuration it needs', () => {
      expect(getCodecs(CodecId.AVC)).toBe(null);
      expect(getCodecs(CodecId.AVC, new Uint8Array(2))).toBe(null);
      expect(getCodecs(CodecId.HEVC, new Uint8Array(12))).toBe(null);
      expect(getCodecs(CodecId.AV1, new Uint8Array(3))).toBe(null);
      expect(getCodecs(CodecId.AAC)).toBe(null);
      expect(getCodecs(CodecId.VORBIS)).toBe(null);
      expect(getCodecs(CodecId.FLAC)).toBe(null);
      expect(getCodecs(CodecId.FLAC, new Uint8Array(10))).toBe(null);
    });

    it('needs the headers of Vorbis and the STREAMINFO of FLAC', () => {
      expect(getCodecs(CodecId.VORBIS, new Uint8Array([2, 30, 40])))
          .toBe('vorbis');
      // The block header of STREAMINFO (type 0, 34 bytes) and its 34 bytes,
      // with a sample rate of 48000 and a block size of 4096.
      const streamInfo = new Uint8Array(38);
      streamInfo.set([0x00, 0x00, 0x00, 0x22, 0x10, 0x00, 0x10, 0x00]);
      streamInfo.set([0x0b, 0xb8, 0x0a, 0xf0], 14);
      expect(getCodecs(CodecId.FLAC, streamInfo)).toBe('flac');
    });

    it('rejects a track that is compressed or encrypted', () => {
      const avcC = new Uint8Array([1, 0x64, 0x00, 0x1f, 0xff, 0xe1]);
      expect(getCodecs(CodecId.AVC, avcC, {unsupportedEncoding: true}))
          .toBe(null);
    });

    describe('Dolby Vision', () => {
      const hvcC = new Uint8Array([
        1, 0x02, 0x20, 0, 0, 0, 0x90, 0, 0, 0, 0, 0, 120,
      ]);

      /**
       * @param {number} profile
       * @param {number} compatibility
       * @param {boolean=} hasEnhancementLayer
       * @return {!Uint8Array}
       */
      const makeRecord = (profile, compatibility,
          hasEnhancementLayer = false) => {
        const record = new Uint8Array(24);
        record.set([1, 0, profile << 1,
          (3 << 3) | 0x05 | (hasEnhancementLayer ? 2 : 0),
          compatibility << 4]);
        return record;
      };

      /**
       * @param {string} codecId
       * @param {!Uint8Array} config
       * @param {!Uint8Array} record
       * @return {!shaka.mkv.MatroskaIndexParser.Track}
       */
      const makeDolbyVisionTrack = (codecId, config, record) => {
        return makeTrack(1, {
          codecId, codecPrivate: config, dolbyVisionConfig: record,
        });
      };

      it('keeps the plain codec when the base layer plays on its own', () => {
        const track = makeDolbyVisionTrack(
            CodecId.HEVC, hvcC, makeRecord(8, 1));
        expect(MatroskaCodecs.getCodecs(track)).toBe('hvc1.2.4.L120.90');
      });

      it('gives the Dolby Vision codecs as the supplemental ones', () => {
        const track = makeDolbyVisionTrack(
            CodecId.HEVC, hvcC, makeRecord(8, 1));
        expect(MatroskaCodecs.getSupplementalCodecs(track))
            .toBe('dvh1.08.03');
      });

      it('has only the Dolby Vision codecs for profile 5', () => {
        const track = makeDolbyVisionTrack(
            CodecId.HEVC, hvcC, makeRecord(5, 0));
        expect(MatroskaCodecs.getCodecs(track)).toBe('dvh1.05.03');
        expect(MatroskaCodecs.getSupplementalCodecs(track)).toBe('');
      });

      it('has only the plain codec with an enhancement layer', () => {
        const track = makeDolbyVisionTrack(
            CodecId.HEVC, hvcC, makeRecord(7, 6, true));
        expect(MatroskaCodecs.getCodecs(track)).toBe('hvc1.2.4.L120.90');
        expect(MatroskaCodecs.getSupplementalCodecs(track)).toBe('');
      });

      it('has only the plain codec for a record that cannot be read', () => {
        const track = makeDolbyVisionTrack(
            CodecId.HEVC, hvcC, new Uint8Array(2));
        expect(MatroskaCodecs.getCodecs(track)).toBe('hvc1.2.4.L120.90');
        expect(MatroskaCodecs.getSupplementalCodecs(track)).toBe('');
      });

      it('has none for a track that is not Dolby Vision', () => {
        expect(MatroskaCodecs.getSupplementalCodecs(
            makeTrack(1, {codecId: CodecId.HEVC, codecPrivate: hvcC})))
            .toBe('');
      });

      it('names the AVC and AV1 versions', () => {
        const avcC = new Uint8Array([1, 0x64, 0x00, 0x1f, 0xff, 0xe1]);
        expect(MatroskaCodecs.getSupplementalCodecs(makeDolbyVisionTrack(
            CodecId.AVC, avcC, makeRecord(9, 2)))).toBe('dva1.09.03');
        const av1C = new Uint8Array([0x81, 0x08, 0x4c, 0]);
        expect(MatroskaCodecs.getSupplementalCodecs(makeDolbyVisionTrack(
            CodecId.AV1, av1C, makeRecord(10, 1)))).toBe('dav1.10.03');
      });

      it('has none for a codec that has no Dolby Vision', () => {
        expect(MatroskaCodecs.getSupplementalCodecs(makeTrack(1, {
          codecId: CodecId.VP9, dolbyVisionConfig: makeRecord(8, 1),
        }))).toBe('');
      });

      it('gives the HDR type from the base layer', () => {
        expect(MatroskaCodecs.getHdr(makeTrack(1, {
          dolbyVisionConfig: makeRecord(8, 1),
        }))).toBe('PQ');
        expect(MatroskaCodecs.getHdr(makeTrack(1, {
          dolbyVisionConfig: makeRecord(8, 4),
        }))).toBe('HLG');
        expect(MatroskaCodecs.getHdr(makeTrack(1, {
          dolbyVisionConfig: makeRecord(5, 0),
        }))).toBe('PQ');
      });
    });

    describe('VP9', () => {
      it('is provisional without CodecPrivate', () => {
        expect(getCodecs(CodecId.VP9, null,
            {width: 1280, height: 720, defaultDuration: 1 / 25}))
            .toBe('vp09.00.31.08.01');
      });

      it('reads the features of CodecPrivate', () => {
        // Profile 2, level (ignored), bit depth 10, chroma 4:4:4.
        const features = new Uint8Array([1, 1, 2, 2, 1, 40, 3, 1, 10, 4, 1, 3]);
        expect(getCodecs(CodecId.VP9, features,
            {width: 1920, height: 1080, defaultDuration: 1 / 24}))
            .toBe('vp09.02.40.10.03');
      });

      it('picks the level for the size and the frame rate', () => {
        const level = (width, height, fps) => {
          return getCodecs(CodecId.VP9, null,
              {width, height, defaultDuration: 1 / fps}).split('.')[2];
        };
        expect(level(352, 288, 30)).toBe('20');
        expect(level(1280, 720, 30)).toBe('31');
        expect(level(1920, 1080, 30)).toBe('40');
        // The same picture size, but a rate that needs the next level.
        expect(level(1920, 1080, 60)).toBe('41');
        expect(level(3840, 2160, 30)).toBe('50');
        expect(level(3840, 2160, 60)).toBe('51');
        // Larger than any level: the last one.
        expect(level(16384, 16384, 120)).toBe('62');
      });

      it('assumes a frame rate when the track has none', () => {
        expect(getCodecs(CodecId.VP9, null, {width: 1280, height: 720}))
            .toBe('vp09.00.31.08.01');
      });
    });
  });

  describe('getMp4VideoCodec', () => {
    it('names the sample entry of each video codec', () => {
      expect(MatroskaCodecs.getMp4VideoCodec(CodecId.AVC)).toBe('avc1');
      expect(MatroskaCodecs.getMp4VideoCodec(CodecId.HEVC)).toBe('hvc1');
      expect(MatroskaCodecs.getMp4VideoCodec(CodecId.AV1)).toBe('av01');
      expect(MatroskaCodecs.getMp4VideoCodec(CodecId.VP9)).toBe('vp09');
      expect(MatroskaCodecs.getMp4VideoCodec(CodecId.AAC)).toBe('');
    });
  });

  describe('getVideoConfig', () => {
    it('is CodecPrivate for AVC, HEVC and AV1', () => {
      const config = new Uint8Array([1, 2, 3, 4]);
      for (const codecId of [CodecId.AVC, CodecId.HEVC, CodecId.AV1]) {
        expect(MatroskaCodecs.getVideoConfig(
            makeTrack(1, {codecId, codecPrivate: config}), ''))
            .toBe(config);
      }
    });

    it('is built from the codec string for VP9', () => {
      const track = makeTrack(1, {codecId: CodecId.VP9});
      expect(MatroskaCodecs.getVideoConfig(track, 'vp09.00.31.08.01'))
          .toEqual(shaka.codec.VP9.buildVpcC('vp09.00.31.08.01'));
    });
  });

  describe('getPixelAspectRatio', () => {
    it('is null for square pixels', () => {
      expect(MatroskaCodecs.getPixelAspectRatio(makeTrack(1, {
        width: 1920, height: 1080, displayWidth: 1920, displayHeight: 1080,
      }))).toBe(null);
      // 1280x720 shown as 16:9.
      expect(MatroskaCodecs.getPixelAspectRatio(makeTrack(1, {
        width: 1280, height: 720, displayWidth: 16, displayHeight: 9,
      }))).toBe(null);
    });

    it('is null when the track has no display size', () => {
      expect(MatroskaCodecs.getPixelAspectRatio(makeTrack(1, {
        width: 1920, height: 1080,
      }))).toBe(null);
    });

    it('is reduced to its lowest terms', () => {
      expect(MatroskaCodecs.getPixelAspectRatio(makeTrack(1, {
        width: 720, height: 480, displayWidth: 853, displayHeight: 480,
      }))).toEqual({horizontal: 853, vertical: 720});
      // Anamorphic 1440x1080 shown as 16:9.
      expect(MatroskaCodecs.getPixelAspectRatio(makeTrack(1, {
        width: 1440, height: 1080, displayWidth: 1920, displayHeight: 1080,
      }))).toEqual({horizontal: 4, vertical: 3});
    });
  });

  describe('getHdr', () => {
    it('recognizes PQ and HLG', () => {
      expect(MatroskaCodecs.getHdr(
          makeTrack(1, {transferCharacteristics: 16}))).toBe('PQ');
      expect(MatroskaCodecs.getHdr(
          makeTrack(1, {transferCharacteristics: 18}))).toBe('HLG');
    });

    it('is not set for anything else', () => {
      expect(MatroskaCodecs.getHdr(
          makeTrack(1, {transferCharacteristics: 1}))).toBeUndefined();
      expect(MatroskaCodecs.getHdr(makeTrack(1))).toBeUndefined();
    });
  });

  describe('getFrameRate', () => {
    /**
     * @param {number} nanoseconds
     * @return {(number|undefined)}
     */
    const rateOf = (nanoseconds) => {
      return MatroskaCodecs.getFrameRate(makeTrack(1, {
        defaultDuration: nanoseconds / 1e9,
      }));
    };

    it('is undefined when the track does not say', () => {
      expect(MatroskaCodecs.getFrameRate(makeTrack(1))).toBeUndefined();
    });

    it('is a whole number when the duration is rounded to it', () => {
      // 1/24 s is 41666666.67 ns, which is written as 41666666: 24.00000038.
      expect(rateOf(41666666)).toBe(24);
      expect(rateOf(41666667)).toBe(24);
      expect(rateOf(40000000)).toBe(25);
      expect(rateOf(33333333)).toBe(30);
      expect(rateOf(16666667)).toBe(60);
    });

    it('is the exact NTSC rate', () => {
      expect(rateOf(41708333)).toBe(24000 / 1001);
      expect(rateOf(33366667)).toBe(30000 / 1001);
      expect(rateOf(16683333)).toBe(60000 / 1001);
    });

    it('is left alone when it is neither', () => {
      expect(rateOf(100000000)).toBe(10);
      expect(rateOf(43000000)).toBeCloseTo(23.2558, 3);
    });
  });

  describe('getTrackNumber', () => {
    it('is the identifier of the stream of a track', () => {
      expect(MatroskaCodecs.getTrackNumber(1)).toBe(1);
      expect(MatroskaCodecs.getTrackNumber(127)).toBe(127);
    });

    it('takes the offset of the second stream away', () => {
      const offset = shaka.mkv.MatroskaConstants.ALTERNATE_STREAM_ID_OFFSET;
      expect(MatroskaCodecs.getTrackNumber(1 + offset)).toBe(1);
      expect(MatroskaCodecs.getTrackNumber(300 + offset)).toBe(300);
    });
  });

  describe('usesWebm', () => {
    it('is true for the codecs that browsers only take in WebM', () => {
      expect(MatroskaCodecs.usesWebm(CodecId.VP8)).toBe(true);
      expect(MatroskaCodecs.usesWebm(CodecId.VORBIS)).toBe(true);
    });

    it('is false for the rest', () => {
      for (const codecId of [CodecId.AVC, CodecId.HEVC, CodecId.VP9,
        CodecId.AV1, CodecId.AAC, CodecId.OPUS, CodecId.FLAC, CodecId.MP3]) {
        expect(MatroskaCodecs.usesWebm(codecId)).toBe(false);
      }
    });
  });

  describe('getOpusConfig', () => {
    it('converts the OpusHead of the track', () => {
      // 'OpusHead', version, 2 channels, pre-skip 312, 48000 Hz, no gain.
      const head = new Uint8Array([
        0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64,
        1, 2, 0x38, 0x01, 0x80, 0xbb, 0x00, 0x00, 0x00, 0x00, 0,
      ]);
      expect(Array.from(MatroskaCodecs.getOpusConfig(
          makeTrack(1, {codecPrivate: head})))).toEqual(
          [0, 2, 0x01, 0x38, 0x00, 0x00, 0xbb, 0x80, 0, 0, 0]);
    });

    it('makes one up for a track that has none', () => {
      // The delay of the codec is the pre-skip, 312 samples.
      expect(Array.from(MatroskaCodecs.getOpusConfig(
          makeTrack(1, {channels: 1, codecDelay: 0.0065})))).toEqual(
          [0, 1, 0x01, 0x38, 0x00, 0x00, 0xbb, 0x80, 0, 0, 0]);
    });
  });
});
