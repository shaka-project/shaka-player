/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
describe('Transmuxer', function() {
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

  /** @type {!shaka.media.Transmuxer} */
  let transmuxer;


  beforeAll(async () => {
    let responses = await Promise.all([
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioSegmentUri),
    ]);
    videoSegment = responses[0];
    audioSegment = responses[1];
    emptySegment = new ArrayBuffer(0);
  });

  beforeEach(function() {
    transmuxer = new shaka.media.Transmuxer();
  });

  afterEach(async () => {
    await transmuxer.destroy();
  });

  describe('isSupported', function() {
    let isSupported = shaka.media.Transmuxer.isSupported;
    it('returns whether the content type is supported', function() {
      expect(isSupported(mp4MimeType, ContentType.VIDEO)).toBeFalsy();
      expect(isSupported(transportStreamVideoMimeType, ContentType.VIDEO))
          .toBe(true);
    });

    // Issue #1991
    it('handles upper-case MIME types', () => {
      const mimeType = transportStreamVideoMimeType.replace('mp2t', 'MP2T');
      expect(isSupported(mimeType, ContentType.VIDEO)).toBe(true);
    });
  });

  describe('convertTsCodecs', function() {
    let convertTsCodecs = shaka.media.Transmuxer.convertTsCodecs;

    it('returns converted codecs', function() {
      let convertedVideoCodecs =
          convertTsCodecs(ContentType.VIDEO, transportStreamVideoMimeType);
      let convertedAudioCodecs =
          convertTsCodecs(ContentType.AUDIO, transportStreamAudioMimeType);
      let expectedVideoCodecs = 'video/mp4; codecs="avc1.42E01E"';
      let expectedAudioCodecs = 'audio/mp4; codecs="mp4a.40.2"';
      expect(convertedVideoCodecs).toEqual(expectedVideoCodecs);
      expect(convertedAudioCodecs).toEqual(expectedAudioCodecs);
    });

    it('converts legacy avc1 codec strings', function() {
      expect(convertTsCodecs(ContentType.VIDEO,
          'video/mp2t; codecs="avc1.100.42"')).toEqual(
          'video/mp4; codecs="avc1.64002a"');
      expect(convertTsCodecs(ContentType.VIDEO,
          'video/mp2t; codecs="avc1.77.80"')).toEqual(
          'video/mp4; codecs="avc1.4d0050"');
      expect(convertTsCodecs(ContentType.VIDEO,
          'video/mp2t; codecs="avc1.66.1"')).toEqual(
          'video/mp4; codecs="avc1.420001"');
    });

    // Issue #1991
    it('handles upper-case MIME types', () => {
      expect(convertTsCodecs(
          ContentType.VIDEO, 'video/MP2T; codecs="avc1.420001"'))
          .toBe('video/mp4; codecs="avc1.420001"');
    });
  });

  describe('transmuxing', function() {
    it('transmux video from TS to MP4', async () => {
      let sawMDAT = false;

      let transmuxedData = await transmuxer.transmux(videoSegment);
      expect(transmuxedData.data).toEqual(jasmine.any(Uint8Array));
      expect(transmuxedData.data.length).toBeGreaterThan(0);
      expect(transmuxedData.captions).toEqual(jasmine.any(Array));
      new shaka.util.Mp4Parser()
          .box('mdat', shaka.util.Mp4Parser.allData(function(data) {
            sawMDAT = true;
            expect(data.buffer.byteLength).toBeGreaterThan(0);
          }))
          .parse(transmuxedData.data.buffer);
      expect(sawMDAT).toBeTruthy();
    });

    it('transmux audio from TS to MP4', async () => {
      let sawMDAT = false;
      let transmuxedData = await transmuxer.transmux(audioSegment);
      expect(transmuxedData.data).toEqual(jasmine.any(Uint8Array));
      expect(transmuxedData.data.length).toBeGreaterThan(0);
      expect(transmuxedData.captions).toEqual(jasmine.any(Array));
      new shaka.util.Mp4Parser()
          .box('mdat', shaka.util.Mp4Parser.allData(function(data) {
            sawMDAT = true;
            expect(data.buffer.byteLength).toBeGreaterThan(0);
          }))
          .parse(transmuxedData.data.buffer);
      expect(sawMDAT).toBeTruthy();
    });

    it('transmux empty video from TS to MP4', async () => {
      let sawMDAT = false;
      let transmuxedData = await transmuxer.transmux(emptySegment);
      expect(transmuxedData.data).toEqual(jasmine.any(Uint8Array));
      expect(transmuxedData.captions).toEqual([]);
      new shaka.util.Mp4Parser()
          .box('mdat', shaka.util.Mp4Parser.allData(function(data) {
            sawMDAT = true;
          }))
          .parse(transmuxedData.data.buffer);
      expect(sawMDAT).toBeFalsy();
    });

    it('passes through true timestamps', async () => {
      let parsed = false;
      let expectedMp4Timestamp = 5166000;  // in timescale units
      let mp4Timestamp;

      let transmuxedData = await transmuxer.transmux(videoSegment);
      let Mp4Parser = shaka.util.Mp4Parser;

      new Mp4Parser()
          .box('moof', Mp4Parser.children)
          .box('traf', Mp4Parser.children)
          .fullBox('tfdt', function(box) {
            goog.asserts.assert(
                box.version == 0 || box.version == 1,
                'TFDT version can only be 0 or 1');
            mp4Timestamp = (box.version == 0) ?
                box.reader.readUint32() :
                box.reader.readUint64();
            parsed = true;
          })
          .parse(transmuxedData.data.buffer);

      expect(parsed).toBe(true);
      expect(mp4Timestamp).toEqual(expectedMp4Timestamp);
    });
  });
});
