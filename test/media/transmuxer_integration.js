/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Transmuxer', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const videoSegmentUri = '/base/test/test/assets/video.ts';
  const audioSegmentUri = '/base/test/test/assets/audio.ts';
  const mp4MimeType = 'video/mp4; codecs="avc1.42E01E"';
  const transportStreamVideoMimeType = 'video/mp2t; codecs="avc1.42E01E"';
  const transportStreamAudioMimeType = 'video/mp2t; codecs="mp4a.40.2"';
  const aacAudioMimeType = 'audio/aac';

  const transmuxerMimeType = 'fake/mimeType';

  /** @type {!ArrayBuffer} */
  let videoSegment;
  /** @type {!ArrayBuffer} */
  let audioSegment;
  /** @type {!ArrayBuffer} */
  let emptySegment;

  /** @type {!shaka.media.Transmuxer} */
  let transmuxer;


  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioSegmentUri),
    ]);
    videoSegment = responses[0];
    audioSegment = responses[1];
    emptySegment = new ArrayBuffer(0);
  });

  beforeEach(() => {
    transmuxer = new shaka.media.Transmuxer(transmuxerMimeType);
  });

  afterEach(async () => {
    await transmuxer.destroy();
  });

  describe('isSupported', () => {
    const Transmuxer = shaka.media.Transmuxer;

    it('returns whether the content type is supported', () => {
      expect(Transmuxer.isSupported(
          mp4MimeType, ContentType.VIDEO)).toBe(false);
      expect(Transmuxer.isSupported(
          transportStreamVideoMimeType, ContentType.VIDEO)).toBe(true);
    });

    // Issue #1991
    it('handles upper-case MIME types', () => {
      const mimeType = transportStreamVideoMimeType.replace('mp2t', 'MP2T');
      expect(Transmuxer.isSupported(mimeType, ContentType.VIDEO)).toBe(true);
    });
  });

  describe('convertCodecs', () => {
    const convertCodecs =
        (type, codecs) => shaka.media.Transmuxer.convertCodecs(type, codecs);

    it('returns converted codecs', () => {
      const convertedVideoCodecs =
          convertCodecs(ContentType.VIDEO, transportStreamVideoMimeType);
      const convertedAudioCodecs =
          convertCodecs(ContentType.AUDIO, transportStreamAudioMimeType);
      const convertedAacCodecs =
          convertCodecs(ContentType.AUDIO, aacAudioMimeType);
      const expectedVideoCodecs = 'video/mp4; codecs="avc1.42E01E"';
      const expectedAudioCodecs = 'audio/mp4; codecs="mp4a.40.2"';
      const expectedAacCodecs = 'audio/mp4; codecs="mp4a.40.2"';
      expect(convertedVideoCodecs).toBe(expectedVideoCodecs);
      expect(convertedAudioCodecs).toBe(expectedAudioCodecs);
      expect(convertedAacCodecs).toBe(expectedAacCodecs);
    });

    it('converts legacy avc1 codec strings', () => {
      expect(
          convertCodecs(
              ContentType.VIDEO, 'video/mp2t; codecs="avc1.100.42"'))
          .toBe('video/mp4; codecs="avc1.64002a"');
      expect(
          convertCodecs(ContentType.VIDEO, 'video/mp2t; codecs="avc1.77.80"'))
          .toBe('video/mp4; codecs="avc1.4d0050"');
      expect(
          convertCodecs(ContentType.VIDEO, 'video/mp2t; codecs="avc1.66.1"'))
          .toBe('video/mp4; codecs="avc1.420001"');
    });

    // Issue #1991
    it('handles upper-case MIME types', () => {
      expect(convertCodecs(
          ContentType.VIDEO, 'video/MP2T; codecs="avc1.420001"'))
          .toBe('video/mp4; codecs="avc1.420001"');
    });
  });

  it('getOrginalMimeType returns the correct mimeType', () => {
    expect(transmuxer.getOrginalMimeType()).toBe(transmuxerMimeType);
  });

  describe('transmuxing', () => {
    it('transmux video from TS to MP4', async () => {
      let sawMDAT = false;

      const transmuxedData = await transmuxer.transmux(videoSegment);
      expect(transmuxedData).toEqual(jasmine.any(Uint8Array));
      expect(transmuxedData.length).toBeGreaterThan(0);
      new shaka.util.Mp4Parser()
          .box('mdat', shaka.util.Mp4Parser.allData((data) => {
            sawMDAT = true;
            expect(data.byteLength).toBeGreaterThan(0);
          }))
          .parse(transmuxedData);
      expect(sawMDAT).toBeTruthy();
    });

    it('transmux audio from TS to MP4', async () => {
      let sawMDAT = false;
      const transmuxedData = await transmuxer.transmux(audioSegment);
      expect(transmuxedData).toEqual(jasmine.any(Uint8Array));
      expect(transmuxedData.length).toBeGreaterThan(0);
      new shaka.util.Mp4Parser()
          .box('mdat', shaka.util.Mp4Parser.allData((data) => {
            sawMDAT = true;
            expect(data.byteLength).toBeGreaterThan(0);
          }))
          .parse(transmuxedData);
      expect(sawMDAT).toBeTruthy();
    });

    it('transmux empty video from TS to MP4', async () => {
      let sawMDAT = false;
      const transmuxedData = await transmuxer.transmux(emptySegment);
      expect(transmuxedData).toEqual(jasmine.any(Uint8Array));
      new shaka.util.Mp4Parser()
          .box('mdat', shaka.util.Mp4Parser.allData((data) => {
            sawMDAT = true;
          }))
          .parse(transmuxedData);
      expect(sawMDAT).toBeFalsy();
    });

    it('passes through true timestamps', async () => {
      let parsed = false;
      const expectedMp4Timestamp = 5166000;  // in timescale units
      let mp4Timestamp;

      const transmuxedData = await transmuxer.transmux(videoSegment);
      const Mp4Parser = shaka.util.Mp4Parser;

      new Mp4Parser()
          .box('moof', Mp4Parser.children)
          .box('traf', Mp4Parser.children)
          .fullBox('tfdt', (box) => {
            goog.asserts.assert(
                box.version == 0 || box.version == 1,
                'TFDT version can only be 0 or 1');
            const parsedTFDTBox = shaka.util.Mp4BoxParsers.parseTFDT(
                box.reader, box.version);
            mp4Timestamp = parsedTFDTBox.baseMediaDecodeTime;
            parsed = true;
          })
          .parse(transmuxedData);

      expect(parsed).toBe(true);
      expect(mp4Timestamp).toBe(expectedMp4Timestamp);
    });
  });
});
