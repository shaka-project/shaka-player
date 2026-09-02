/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4BoxParsers', () => {
  const videoInitSegmentUri = '/base/test/test/assets/sintel-video-init.mp4';
  const videoSegmentUri = '/base/test/test/assets/sintel-video-segment.mp4';

  const audioInitSegmentXheAacUri = '/base/test/test/assets/audio-xhe-aac.mp4';
  const audioInitSegmentAC4Uri = '/base/test/test/assets/audio-ac-4.mp4';

  const multidrmVideoInitSegmentUri =
      '/base/test/test/assets/multidrm-video-init.mp4';

  /** @type {!ArrayBuffer} */
  let videoInitSegment;
  /** @type {!ArrayBuffer} */
  let videoSegment;
  /** @type {!ArrayBuffer} */
  let audioInitSegmentXheAac;
  /** @type {!ArrayBuffer} */
  let audioInitSegmentAC4;
  /** @type {!ArrayBuffer} */
  let multidrmVideoInitSegment;

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(videoInitSegmentUri),
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioInitSegmentXheAacUri),
      shaka.test.Util.fetch(audioInitSegmentAC4Uri),
      shaka.test.Util.fetch(multidrmVideoInitSegmentUri),
    ]);
    videoInitSegment = responses[0];
    videoSegment = responses[1];
    audioInitSegmentXheAac = responses[2];
    audioInitSegmentAC4 = responses[3];
    multidrmVideoInitSegment = responses[4];
  });

  it('parses init segment', () => {
    let trexParsed = false;
    let tkhdParsed = false;
    let mdhdParsed = false;
    let defaultSampleDuration;
    let defaultSampleSize;
    let trackId;
    let width;
    let height;
    let timescale;
    let language;

    const expectedDefaultSampleDuration = 512;
    const expectedDefaultSampleSize = 0;
    const expectedTrackId = 1;
    const expectedWidth = 1685.9375;
    const expectedHeight = 110;
    const expectedTimescale = 12288;
    const expectedLanguage = 'eng';

    const Mp4Parser = shaka.util.Mp4Parser;
    new Mp4Parser()
        .boxes([
          'moov',
          'trak',
          'mdia',
          'mvex',
        ], Mp4Parser.children)
        .box('mvex', Mp4Parser.children)
        .fullBox('trex', (box) => {
          const parsedTREXBox = shaka.util.Mp4BoxParsers.parseTREX(
              box.reader);

          defaultSampleDuration = parsedTREXBox.defaultSampleDuration;
          defaultSampleSize = parsedTREXBox.defaultSampleSize;
          trexParsed = true;
        })
        .fullBox('tkhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TKHD is a full box and should have a valid version.');
          const parsedTKHDBox = shaka.util.Mp4BoxParsers.parseTKHD(
              box.reader, box.version);
          trackId = parsedTKHDBox.trackId;
          width = parsedTKHDBox.width;
          height = parsedTKHDBox.height;
          tkhdParsed = true;
        })
        .fullBox('mdhd', (box) => {
          goog.asserts.assert(
              box.version != null,
              'MDHD is a full box and should have a valid version.');
          const parsedMDHDBox = shaka.util.Mp4BoxParsers.parseMDHD(
              box.reader, box.version);
          timescale = parsedMDHDBox.timescale;
          language = parsedMDHDBox.language;
          mdhdParsed = true;
        })
        .parse(videoInitSegment, /* partialOkay= */ true);

    expect(trexParsed).toBe(true);
    expect(tkhdParsed).toBe(true);
    expect(mdhdParsed).toBe(true);
    expect(defaultSampleDuration).toBe(expectedDefaultSampleDuration);
    expect(defaultSampleSize).toBe(expectedDefaultSampleSize);
    expect(trackId).toBe(expectedTrackId);
    expect(width).toBe(expectedWidth);
    expect(height).toBe(expectedHeight);
    expect(timescale).toBe(expectedTimescale);
    expect(language).toBe(expectedLanguage);
  });

  it('parses video segment', () => {
    let trunParsed = false;
    let tfhdParsed = false;
    let tfdtParsed = false;
    let sampleCount;
    let sampleData;
    let defaultSampleDuration;
    let baseMediaDecodeTime;

    const expectedSampleCount = 240;
    const expectedDefaultSampleDuration = 512;
    const expectedBaseMediaDecodeTime = 491520;

    const Mp4Parser = shaka.util.Mp4Parser;
    new Mp4Parser()
        .boxes([
          'moof',
          'traf',
        ], Mp4Parser.children)
        .fullBox('trun', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TRUN is a full box and should have a valid version.');
          goog.asserts.assert(
              box.flags != null,
              'TRUN is a full box and should have valid flags.');

          const parsedTRUN = shaka.util.Mp4BoxParsers.parseTRUN(
              box.reader, box.version, box.flags);

          sampleCount = parsedTRUN.sampleCount;
          sampleData = parsedTRUN.sampleData;
          trunParsed = true;
        })

        .fullBox('tfhd', (box) => {
          goog.asserts.assert(
              box.flags != null,
              'TFHD is a full box and should have valid flags.');

          const parsedTFHD = shaka.util.Mp4BoxParsers.parseTFHD(
              box.reader, box.flags);
          defaultSampleDuration = parsedTFHD.defaultSampleDuration;
          tfhdParsed = true;
        })

        .fullBox('tfdt', (box) => {
          goog.asserts.assert(
              box.version != null,
              'TFDT is a full box and should have a valid version.');

          const parsedTFDT = shaka.util.Mp4BoxParsers.parseTFDT(
              box.reader, box.version);

          baseMediaDecodeTime = parsedTFDT.baseMediaDecodeTime;
          tfdtParsed = true;
        }).parse(videoSegment, /* partialOkay= */ false);

    expect(trunParsed).toBe(true);
    expect(tfhdParsed).toBe(true);
    expect(tfdtParsed).toBe(true);
    expect(sampleCount).toBe(expectedSampleCount);
    expect(sampleData).toBeDefined();
    expect(Array.isArray(sampleData)).toBe(true);
    expect(defaultSampleDuration).toBe(expectedDefaultSampleDuration);
    expect(baseMediaDecodeTime).toBe(expectedBaseMediaDecodeTime);
  });

  it('parses ESDS box for xHE-AAC segment', () => {
    let channelCount;
    let sampleRate;
    let codec;

    const Mp4Parser = shaka.util.Mp4Parser;
    new Mp4Parser()
        .boxes([
          'moov',
          'trak',
          'mdia',
          'minf',
          'stbl',
        ], Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('mp4a', (box) => {
          const parsedAudioSampleEntryBox =
              shaka.util.Mp4BoxParsers.audioSampleEntry(box.reader);
          channelCount = parsedAudioSampleEntryBox.channelCount;
          sampleRate = parsedAudioSampleEntryBox.sampleRate;
          if (box.reader.hasMoreData()) {
            Mp4Parser.children(box);
          }
        })
        .box('esds', (box) => {
          const parsedESDSBox = shaka.util.Mp4BoxParsers.parseESDS(box.reader);
          codec = parsedESDSBox.codec;
        }).parse(audioInitSegmentXheAac, /* partialOkay= */ false);
    expect(channelCount).toBe(2);
    expect(sampleRate).toBe(48000);
    expect(codec).toBe('mp4a.40.42');
  });

  it('parses ac-4 box for ac-4 segment', () => {
    let channelCount;
    let sampleRate;

    const Mp4Parser = shaka.util.Mp4Parser;
    new Mp4Parser()
        .boxes([
          'moov',
          'trak',
          'mdia',
          'minf',
          'stbl',
        ], Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('ac-4', (box) => {
          const parsedAudioSampleEntryBox =
              shaka.util.Mp4BoxParsers.audioSampleEntry(box.reader);
          channelCount = parsedAudioSampleEntryBox.channelCount;
          sampleRate = parsedAudioSampleEntryBox.sampleRate;
        }).parse(audioInitSegmentAC4, /* partialOkay= */ false);
    expect(channelCount).toBe(10);
    expect(sampleRate).toBe(48000);
  });

  /**
   *
   * Explanation on the Uint8Array:
   * [
   * <creation_time, 8 bytes>,
   * <modification_time, 8 bytes>,
   * <track_id, 4 bytes>,
   * <reserved, 8 bytes>,
   * <duration, 4 bytes>,
   * <reserved, 8 bytes>,
   * <layer, 2 bytes>,
   * <alternate_group, 2 bytes>,
   * <volume, 2 bytes>,
   * <reserved, 2 bytes>,
   * <matrix_structure, 36 bytes>,
   * <width, 4 bytes>,
   * <height, 4 bytes>
   * ]
   *
   * Time is a 32B integer expressed in seconds since Jan 1, 1904, 0000 UTC
   *
   */
  it('parses TKHD v1 box', () => {
    const tkhdBox = new Uint8Array([
      0x00, 0x00, 0x00, 0x00, 0xDC, 0xBF, 0x0F, 0xD7, // Creation time
      0x00, 0x00, 0x00, 0x00, 0xDC, 0xBF, 0x0F, 0xD7, // Modification time
      0x00, 0x00, 0x00, 0x01, // Track ID
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
      0x00, 0x00, 0x00, 0x00, // Duration
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Reserved
      0x00, 0x00, // Layer
      0x00, 0x00, // Alternate Group
      0x00, 0x00, // Volume
      0x00, 0x00, // Reserved
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Matrix Structure
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Matrix Structure
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Matrix Structure
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Matrix Structure
      0x00, 0x00, 0x00, 0x00, // Matrix Structure
      0x00, 0x40, 0x00, 0x00, // Width
      0x00, 0x40, 0x00, 0x00, // Height
    ]);
    const reader = new shaka.util.DataViewReader(
        tkhdBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
    const parsedTkhd = shaka.util.Mp4BoxParsers
        .parseTKHD(reader, /* version= */ 1);
    expect(parsedTkhd.trackId).toBe(1);
    expect(parsedTkhd.width).toBe(64);
    expect(parsedTkhd.height).toBe(64);
  });

  it('parses SCHM box', () => {
    let encryptionScheme;

    const Mp4Parser = shaka.util.Mp4Parser;
    new Mp4Parser()
        .boxes([
          'moov',
          'trak',
          'mdia',
          'minf',
          'stbl',
        ], Mp4Parser.children)
        .fullBox('stsd', Mp4Parser.sampleDescription)
        .box('encv', Mp4Parser.visualSampleEntry)
        .box('sinf', Mp4Parser.children)
        .fullBox('schm', (box) => {
          const parsedSCHMBox =
              shaka.util.Mp4BoxParsers.parseSCHM(box.reader);
          encryptionScheme = parsedSCHMBox.encryptionScheme;
        })
        .parse(multidrmVideoInitSegment, /* partialOkay= */ false);
    expect(encryptionScheme).toBe('cenc');
  });

  /**
   * Tests for parseHDLR box parsing.
   *
   * HDLR box structure (after version/flags):
   * - 4 bytes: pre_defined (ISO) / component_type (QuickTime)
   * - 4 bytes: handler_type (e.g. 'soun', 'vide')
   * - 12 bytes: reserved (ISO) / manufacturer + flags (QuickTime)
   * - variable: name string
   */
  describe('parseHDLR', () => {
    it('parses ISO BMFF hdlr box', () => {
      // ISO BMFF format: pre_defined=0, handler_type='soun', reserved=0
      const hdlrBox = new Uint8Array([
        0x00, 0x00, 0x00, 0x00, // pre_defined (zeros)
        0x73, 0x6F, 0x75, 0x6E, // handler_type 'soun'
        0x00, 0x00, 0x00, 0x00, // reserved (zeros)
        0x00, 0x00, 0x00, 0x00, // reserved (zeros)
        0x00, 0x00, 0x00, 0x00, // reserved (zeros)
        0x00, // name (empty, null-terminated)
      ]);
      const reader = new shaka.util.DataViewReader(
          hdlrBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
      const parsedHdlr = shaka.util.Mp4BoxParsers.parseHDLR(reader);
      expect(parsedHdlr.handlerType).toBe('soun');
    });

    it('parses Apple QuickTime hdlr box', () => {
      // Apple QuickTime format: component_type='mhlr', handler_type='soun',
      // manufacturer='appl'
      const hdlrBox = new Uint8Array([
        0x6D, 0x68, 0x6C, 0x72, // component_type 'mhlr'
        0x73, 0x6F, 0x75, 0x6E, // handler_type 'soun'
        0x61, 0x70, 0x70, 0x6C, // manufacturer 'appl'
        0x00, 0x00, 0x00, 0x00, // component_flags
        0x00, 0x00, 0x00, 0x00, // component_flags_mask
        0x00, // name (empty, null-terminated)
      ]);
      const reader = new shaka.util.DataViewReader(
          hdlrBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
      const parsedHdlr = shaka.util.Mp4BoxParsers.parseHDLR(reader);
      expect(parsedHdlr.handlerType).toBe('soun');
    });

    it('parses video handler type', () => {
      // ISO BMFF format with 'vide' handler
      const hdlrBox = new Uint8Array([
        0x00, 0x00, 0x00, 0x00, // pre_defined (zeros)
        0x76, 0x69, 0x64, 0x65, // handler_type 'vide'
        0x00, 0x00, 0x00, 0x00, // reserved
        0x00, 0x00, 0x00, 0x00, // reserved
        0x00, 0x00, 0x00, 0x00, // reserved
        0x00, // name
      ]);
      const reader = new shaka.util.DataViewReader(
          hdlrBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
      const parsedHdlr = shaka.util.Mp4BoxParsers.parseHDLR(reader);
      expect(parsedHdlr.handlerType).toBe('vide');
    });
  });

  describe('parseTENC', () => {
    it('parses version 0 tenc box with per-sample IV', () => {
      const tencBox = new Uint8Array([
        0x00, // reserved
        0x00, // patternByte
        0x01, // defaultIsProtected
        0x08, // defaultPerSampleIVSize
        // defaultKID (16 bytes)
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
      ]);
      const reader = new shaka.util.DataViewReader(
          tencBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
      const parsed =
          shaka.util.Mp4BoxParsers.parseTENC(reader, /* version= */ 0);

      expect(parsed.defaultCryptByteBlock).toBe(0);
      expect(parsed.defaultSkipByteBlock).toBe(0);
      expect(parsed.defaultIsProtected).toBe(1);
      expect(parsed.defaultPerSampleIVSize).toBe(8);
      expect(parsed.defaultKID).toBe('0102030405060708090a0b0c0d0e0f10');
      expect(parsed.defaultConstantIV).toBeNull();
    });

    // eslint-disable-next-line @stylistic/max-len
    it('parses version 1 tenc box with pattern encryption and constant IV', () => {
      const tencBox = new Uint8Array([
        0x00, // reserved
        0x12, // patternByte (crypt = 1 [0x1-], skip = 2 [-0x2])
        0x01, // defaultIsProtected
        0x00, // defaultPerSampleIVSize
        // defaultKID (16 bytes)
        0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa,
        0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa, 0xaa,
        0x04, // ivSize
        0x55, 0x66, 0x77, 0x88, // defaultConstantIV
      ]);
      const reader = new shaka.util.DataViewReader(
          tencBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);
      const parsed =
          shaka.util.Mp4BoxParsers.parseTENC(reader, /* version= */ 1);

      expect(parsed.defaultCryptByteBlock).toBe(1);
      expect(parsed.defaultSkipByteBlock).toBe(2);
      expect(parsed.defaultIsProtected).toBe(1);
      expect(parsed.defaultPerSampleIVSize).toBe(0);
      expect(parsed.defaultKID).toBe('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
      expect(parsed.defaultConstantIV)
          .toEqual(new Uint8Array([0x55, 0x66, 0x77, 0x88]));
    });
  });

  describe('parseSENC', () => {
    it('parses senc box without subsamples or parameter overrides', () => {
      const sencBox = new Uint8Array([
        0x00, 0x00, 0x00, 0x01, // sampleCount
        // IV del sample (8 bytes)
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
      ]);
      const reader = new shaka.util.DataViewReader(
          sencBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

      const parsed = shaka.util.Mp4BoxParsers.parseSENC(
          reader, /* flags= */ 0, /* perSampleIVSize= */ 8,
          /* defaultConstantIV= */ null);

      expect(parsed.samples.length).toBe(1);
      expect(parsed.samples[0].subsamples).toBeNull();

      const expectedIv = new Uint8Array(16);
      expectedIv.set([0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08], 0);
      expect(parsed.samples[0].iv).toEqual(expectedIv);
    });

    it('parses senc box with subsamples', () => {
      const sencBox = new Uint8Array([
        0x00, 0x00, 0x00, 0x01, // sampleCount
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x00, 0x01, // subsample count
        0x00, 0x05, // clearBytes
        0x00, 0x00, 0x00, 0x0a, // encryptedBytes
      ]);
      const reader = new shaka.util.DataViewReader(
          sencBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

      const parsed = shaka.util.Mp4BoxParsers.parseSENC(
          reader, /* flags= */ 0x000002, /* perSampleIVSize= */ 8,
          /* defaultConstantIV= */ null);

      expect(parsed.samples.length).toBe(1);
      expect(parsed.samples[0].subsamples).toEqual([
        {clearBytes: 5, encryptedBytes: 10},
      ]);
    });

    it('parses senc box and overrides track encryption parameters', () => {
      const sencBox = new Uint8Array([
        0x00, 0x00, 0x00, // AlgorithmID
        0x00, // ivSize
        // KID
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff,
        0x04, // constantIVSize
        0x11, 0x22, 0x33, 0x44, // constantIV
        0x00, 0x00, 0x00, 0x01, // sampleCount
      ]);
      const reader = new shaka.util.DataViewReader(
          sencBox, shaka.util.DataViewReader.Endianness.BIG_ENDIAN);

      const parsed = shaka.util.Mp4BoxParsers.parseSENC(
          reader, /* flags= */ 0x000001, /* perSampleIVSize= */ 8,
          /* defaultConstantIV= */ null);

      expect(parsed.samples.length).toBe(1);

      const expectedIv = new Uint8Array(16);
      expectedIv.set([0x11, 0x22, 0x33, 0x44], 0);
      expect(parsed.samples[0].iv).toEqual(expectedIv);
    });
  });
});
