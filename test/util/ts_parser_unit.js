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
    expect(firstMetadata.frames.length).toBe(2);
    const secondMetadata = metadata[1];
    expect(secondMetadata.frames.length).toBe(2);
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
});
