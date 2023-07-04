/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MuxjsTransmuxer', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const videoSegmentUri = '/base/test/test/assets/video.ts';
  const audioSegmentUri = '/base/test/test/assets/audio.ts';
  const mp4MimeType = 'video/mp4; codecs="avc1.42E01E"';
  const transportStreamVideoMimeType = 'video/mp2t; codecs="avc1.42E01E"';
  const transportStreamAudioMimeType = 'video/mp2t; codecs="mp4a.40.2"';

  /** @type {!ArrayBuffer} */
  let videoSegment;
  /** @type {!ArrayBuffer} */
  let audioSegment;
  /** @type {!ArrayBuffer} */
  let emptySegment;

  /** @type {?shaka.transmuxer.MuxjsTransmuxer} */
  let transmuxer;

  function useTsTransmuxer() {
    transmuxer = new shaka.transmuxer.MuxjsTransmuxer('video/mp2t');
  }

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
    transmuxer = null;
  });

  afterEach(async () => {
    await transmuxer.destroy();
  });

  describe('isSupported', () => {
    it('returns whether the content type is supported', () => {
      useTsTransmuxer();
      expect(transmuxer.isSupported(
          mp4MimeType, ContentType.VIDEO)).toBe(false);
      expect(transmuxer.isSupported(
          transportStreamVideoMimeType, ContentType.VIDEO)).toBe(true);
    });

    // Issue #1991
    it('handles upper-case MIME types', () => {
      useTsTransmuxer();
      const mimeType = transportStreamVideoMimeType.replace('mp2t', 'MP2T');
      expect(transmuxer.isSupported(
          mimeType, ContentType.VIDEO)).toBe(true);
    });
  });

  describe('convertCodecs', () => {
    const convertCodecs =
        (type, codecs) => transmuxer.convertCodecs(type, codecs);

    it('returns converted codecs for TS', () => {
      useTsTransmuxer();
      const convertedVideoCodecs =
          convertCodecs(ContentType.VIDEO, transportStreamVideoMimeType);
      const convertedAudioCodecs =
          convertCodecs(ContentType.AUDIO, transportStreamAudioMimeType);
      const expectedVideoCodecs = 'video/mp4; codecs="avc1.42E01E"';
      const expectedAudioCodecs = 'audio/mp4; codecs="mp4a.40.2"';
      expect(convertedVideoCodecs).toBe(expectedVideoCodecs);
      expect(convertedAudioCodecs).toBe(expectedAudioCodecs);
    });

    it('converts legacy avc1 codec strings', () => {
      useTsTransmuxer();
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
      useTsTransmuxer();
      expect(convertCodecs(
          ContentType.VIDEO, 'video/MP2T; codecs="avc1.420001"'))
          .toBe('video/mp4; codecs="avc1.420001"');
    });
  });

  describe('transmuxing', () => {
    it('transmux video from TS to MP4', async () => {
      useTsTransmuxer();
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
      useTsTransmuxer();
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
      useTsTransmuxer();
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
      useTsTransmuxer();
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
