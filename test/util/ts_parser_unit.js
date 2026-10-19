/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TsParser', () => {
  const Util = shaka.test.Util;
  const BufferUtils = shaka.util.BufferUtils;
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  it('probes a TS segment', async () => {
    const responses = await Promise.all([
      Util.fetch('/base/test/test/assets/video.ts'),
      Util.fetch('/base/test/test/assets/audio.ts'),
    ]);
    const videoSegment = BufferUtils.toUint8(responses[0]);
    const audioSegment = BufferUtils.toUint8(responses[1]);
    expect(shaka.util.TsParser.probe(videoSegment)).toBeTruthy();
    expect(shaka.util.TsParser.probe(audioSegment)).toBeTruthy();
  });

  it('probes a non TS segment', async () => {
    const responses = await Promise.all([
      Util.fetch('/base/test/test/assets/small.mp4'),
    ]);
    const nonTsSegment = BufferUtils.toUint8(responses[0]);
    expect(shaka.util.TsParser.probe(nonTsSegment)).toBeFalsy();
  });

  it('parses a TS segment', async () => {
    const responses = await Promise.all([
      Util.fetch('/base/test/test/assets/video.ts'),
      Util.fetch('/base/test/test/assets/audio.ts'),
    ]);
    const videoSegment = BufferUtils.toUint8(responses[0]);
    const audioSegment = BufferUtils.toUint8(responses[1]);
    expect(new shaka.util.TsParser().parse(videoSegment)).toBeDefined();
    expect(new shaka.util.TsParser().parse(audioSegment)).toBeDefined();
  });

  it('parses a TS segment with metadata', async () => {
    const responses = await Promise.all([
      Util.fetch('/base/test/test/assets/id3-metadata.ts'),
    ]);
    const tsSegment = BufferUtils.toUint8(responses[0]);
    const metadata = new shaka.util.TsParser().parse(tsSegment)
        .getMetadata();
    expect(metadata).toBeTruthy();
    expect(metadata.length).toBe(2);
    const firstMetadata = metadata[0];
    expect(firstMetadata.frames.length).toBe(3);
    const secondMetadata = metadata[1];
    expect(secondMetadata.frames.length).toBe(3);
  });

  it('get the start time from a TS segment', async () => {
    const responses = await Promise.all([
      Util.fetch('/base/test/test/assets/id3-metadata.ts'),
    ]);
    const tsSegment = BufferUtils.toUint8(responses[0]);
    const starttime = new shaka.util.TsParser().parse(tsSegment)
        .getStartTime(ContentType.AUDIO);
    expect(starttime).toBeCloseTo(90019.586, 3);
  });

  it('gets the start time from TS PES headers', async () => {
    const responses = await Promise.all([
      Util.fetch('/base/test/test/assets/video.ts'),
      Util.fetch('/base/test/test/assets/audio.ts'),
    ]);
    const videoSegment = BufferUtils.toUint8(responses[0]);
    const audioSegment = BufferUtils.toUint8(responses[1]);

    const videoStartTime = new shaka.util.TsParser().parse(videoSegment)
        .getStartTime(ContentType.VIDEO);
    const headerVideoStartTime = new shaka.util.TsParser().parse(videoSegment)
        .getStartTimeFromPesHeaders(ContentType.VIDEO);
    expect(headerVideoStartTime).toBe(videoStartTime);

    const audioStartTime = new shaka.util.TsParser().parse(audioSegment)
        .getStartTime(ContentType.AUDIO);
    const headerAudioStartTime = new shaka.util.TsParser().parse(audioSegment)
        .getStartTimeFromPesHeaders(ContentType.AUDIO);
    expect(headerAudioStartTime).toBe(audioStartTime);
  });

  it('get the codecs from a TS segment', async () => {
    const responses = await Promise.all([
      Util.fetch('/base/test/test/assets/id3-metadata.ts'),
    ]);
    const tsSegment = BufferUtils.toUint8(responses[0]);
    const codecs = new shaka.util.TsParser().parse(tsSegment)
        .getCodecs();
    expect(codecs.audio).toBe('aac');
    expect(codecs.video).toBe(null);
  });

  it('forgets a stale PID reused by a different track type', async () => {
    // Both segments use PID 0x50: for video in one and audio in the other.
    // This happens when a transmuxer is reused after switching from audio
    // muxed in video to a separate audio rendition.
    const responses = await Promise.all([
      Util.fetch('/base/test/test/assets/video.ts'),
      Util.fetch('/base/test/test/assets/audio.ts'),
    ]);
    const videoSegment = BufferUtils.toUint8(responses[0]);
    const audioSegment = BufferUtils.toUint8(responses[1]);

    const tsParser = new shaka.util.TsParser();
    tsParser.parse(videoSegment);
    expect(tsParser.getCodecs().video).toBe('avc');

    tsParser.clearData();
    tsParser.parse(audioSegment);
    const codecs = tsParser.getCodecs();
    expect(codecs.audio).toBe('aac');
    expect(codecs.video).toBe(null);
    expect(tsParser.getAudioData().length).toBeGreaterThan(0);
    expect(tsParser.getVideoData().length).toBe(0);
  });

  describe('SCTE-35', () => {
    const Scte35 = shaka.test.Scte35;
    const pid = 500;
    /** 2^33, where 33-bit timestamps wrap. */
    const maxTs = 8589934592;

    /** @type {!BufferSource} */
    let videoSegment;

    beforeAll(async () => {
      videoSegment = await Util.fetch('/base/test/test/assets/video.ts');
    });

    /**
     * @param {!Array<!Uint8Array>} sections
     * @return {!Array<shaka.util.TsParser.Scte35Section>}
     */
    const parseSections = (sections) => {
      const tsParser = new shaka.util.TsParser();
      tsParser.parse(Scte35.addToTs(videoSegment, pid, sections));
      return tsParser.getScte35Sections();
    };

    it('reads the splice time of a splice_insert', () => {
      const section = Scte35.spliceInsert(60 * 90000);
      const sections = parseSections([section]);
      expect(sections.length).toBe(1);
      expect(sections[0].pid).toBe(pid);
      expect(sections[0].section).toEqual(section);
      expect(sections[0].commandType).toBe(0x05);
      expect(sections[0].pts).toBe(60 * 90000);
      const view = BufferUtils.toDataView(section);
      expect(sections[0].crc).toBe(view.getUint32(section.length - 4));
    });

    it('reads the splice time of a time_signal', () => {
      const sections = parseSections([Scte35.timeSignal(60 * 90000)]);
      expect(sections.length).toBe(1);
      expect(sections[0].commandType).toBe(0x06);
      expect(sections[0].pts).toBe(60 * 90000);
    });

    it('applies pts_adjustment and wraps to 33 bits', () => {
      const sections = parseSections([
        Scte35.spliceInsert(maxTs - 90000, {ptsAdjustment: 61 * 90000}),
      ]);
      expect(sections.length).toBe(1);
      expect(sections[0].pts).toBe(60 * 90000);
    });

    it('has no splice time for an immediate splice_insert', () => {
      const sections = parseSections([Scte35.spliceInsert(null)]);
      expect(sections.length).toBe(1);
      expect(sections[0].pts).toBeNull();
    });

    it('has no splice time for an encrypted section', () => {
      const sections = parseSections([
        Scte35.spliceInsert(60 * 90000, {encrypted: true}),
      ]);
      expect(sections.length).toBe(1);
      expect(sections[0].pts).toBeNull();
    });

    it('reports a splice_null', () => {
      const sections = parseSections([Scte35.spliceNull()]);
      expect(sections.length).toBe(1);
      expect(sections[0].commandType).toBe(0x00);
      expect(sections[0].pts).toBeNull();
    });

    it('reassembles a section spanning several packets', () => {
      const descriptors = new Array(400).fill(0x42);
      const section = Scte35.spliceInsert(60 * 90000, {descriptors});
      expect(section.length).toBeGreaterThan(2 * 184);
      const sections = parseSections([section, Scte35.timeSignal(90000)]);
      expect(sections.length).toBe(2);
      expect(sections[0].section).toEqual(section);
      expect(sections[0].pts).toBe(60 * 90000);
      expect(sections[1].pts).toBe(90000);
    });

    it('ignores a section with a bad CRC', () => {
      const section = Scte35.spliceInsert(60 * 90000);
      section[section.length - 1] ^= 0xff;
      expect(parseSections([section]).length).toBe(0);
    });

    it('ignores sections on PIDs the PMT does not list', () => {
      const tsParser = new shaka.util.TsParser();
      const segment = Scte35.addToTs(
          videoSegment, pid, [Scte35.spliceInsert(60 * 90000)]);
      // Move the SCTE-35 packet to another PID.
      const packet = 2 * 188;
      expect(((segment[packet + 1] & 0x1f) << 8) | segment[packet + 2])
          .toBe(pid);
      segment[packet + 2] = (pid + 1) & 0xff;
      tsParser.parse(segment);
      expect(tsParser.getScte35Sections().length).toBe(0);
    });

    it('clears the sections with the rest of the data', () => {
      const tsParser = new shaka.util.TsParser();
      tsParser.parse(Scte35.addToTs(
          videoSegment, pid, [Scte35.spliceInsert(60 * 90000)]));
      expect(tsParser.getScte35Sections().length).toBe(1);
      tsParser.clearData();
      expect(tsParser.getScte35Sections().length).toBe(0);
    });
  });

  it('skips the network information table in the PAT', async () => {
    // DVB streams commonly list program 0 first, which points at the NIT on
    // PID 0x10 rather than at a PMT.
    const response = await Util.fetch('/base/test/test/assets/video.ts');
    const segment = BufferUtils.toUint8(response).slice();

    const section = [
      0x00, 0xb0, 0x11, 0x00, 0x01, 0xc1, 0x00, 0x00,
      // Program 0, the NIT on PID 0x10.
      0x00, 0x00, 0xe0, 0x10,
      // Program 1, its PMT on PID 32, as in the original PAT.
      0x00, 0x01, 0xe0, 0x20,
    ];
    const crc = shaka.util.TsParser.crc32(new Uint8Array(section));
    section.push(crc >>> 24, (crc >>> 16) & 0xff, (crc >>> 8) & 0xff,
        crc & 0xff);
    const pat = new Uint8Array(188).fill(0xff);
    pat.set([0x47, 0x40, 0x00, 0x10, 0x00, ...section]);
    segment.set(pat, 0);

    const tsParser = new shaka.util.TsParser().parse(segment);
    expect(tsParser.getCodecs().video).toBe('avc');
    expect(tsParser.getVideoData().length).toBeGreaterThan(0);
  });
});
