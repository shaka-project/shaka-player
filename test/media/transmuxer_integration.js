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
  /** @const */
  var ContentType = shaka.util.ManifestParserUtils.ContentType;

  /** @type {!ArrayBuffer} */
  var videoSegment;
  /** @type {!ArrayBuffer} */
  var audioSegment;
  /** @type {!ArrayBuffer} */
  var emptySegment;
  /** @const */
  var videoSegmentUri = '/base/test/test/assets/video.ts';
  /** @const */
  var audioSegmentUri = '/base/test/test/assets/audio.ts';

  /** @type {!shaka.media.Transmuxer} */
  var transmuxer;

  /** @const {string} */
  var mp4MimeType = 'video/mp4; codecs="avc1.42E01E"';

  /** @const {string} */
  var transportStreamVideoMimeType = 'video/mp2t; codecs="avc1.42E01E"';

  /** @const {string} */
  var transportStreamAudioMimeType = 'video/mp2t; codecs="mp4a.40.2"';


  beforeAll(function(done) {
    Promise.all([
      shaka.test.Util.fetch(videoSegmentUri),
      shaka.test.Util.fetch(audioSegmentUri)
    ]).then(function(responses) {
      videoSegment = responses[0];
      audioSegment = responses[1];
      emptySegment = new ArrayBuffer(0);
    }).catch(fail).then(done);
  });

  beforeEach(function() {
    transmuxer = new shaka.media.Transmuxer();
  });

  afterEach(function(done) {
    transmuxer.destroy().catch(fail).then(done);
  });

  describe('isSupported', function() {
    var isSupported = shaka.media.Transmuxer.isSupported;
    it('returns whether the content type is supported', function() {
      expect(isSupported(mp4MimeType, ContentType.VIDEO)).toBeFalsy();
      expect(isSupported(transportStreamVideoMimeType, ContentType.VIDEO))
          .toBeTruthy();
    });
  });

  describe('convertTsCodecs', function() {
    var convertTsCodecs = shaka.media.Transmuxer.convertTsCodecs;

    it('returns converted codecs', function() {
      var convertedVideoCodecs =
          convertTsCodecs(ContentType.VIDEO, transportStreamVideoMimeType);
      var convertedAudioCodecs =
          convertTsCodecs(ContentType.AUDIO, transportStreamAudioMimeType);
      var expectedVideoCodecs = 'video/mp4; codecs="avc1.42E01E"';
      var expectedAudioCodecs = 'audio/mp4; codecs="mp4a.40.2"';
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
  });

  describe('transmuxing', function() {
    it('transmux video from TS to MP4', function(done) {
      var sawMDAT = false;
      transmuxer.transmux(videoSegment).then(function(transmuxedData) {
        expect(transmuxedData instanceof Uint8Array).toBe(true);
        expect(transmuxedData.length).toBeGreaterThan(0);
        new shaka.util.Mp4Parser()
            .box('mdat', shaka.util.Mp4Parser.allData(function(data) {
              sawMDAT = true;
              expect(data.buffer.byteLength).toBeGreaterThan(0);
            }))
            .parse(transmuxedData.buffer);
        expect(sawMDAT).toBeTruthy();
      }).catch(fail).then(done);
    });

    it('transmux audio from TS to MP4', function(done) {
      var sawMDAT = false;
      transmuxer.transmux(audioSegment).then(function(transmuxedData) {
        expect(transmuxedData instanceof Uint8Array).toBe(true);
        expect(transmuxedData.length).toBeGreaterThan(0);
        new shaka.util.Mp4Parser()
            .box('mdat', shaka.util.Mp4Parser.allData(function(data) {
              sawMDAT = true;
              expect(data.buffer.byteLength).toBeGreaterThan(0);
            }))
            .parse(transmuxedData.buffer);
        expect(sawMDAT).toBeTruthy();
      }).catch(fail).then(done);
    });

    it('transmux empty video from TS to MP4', function(done) {
      var sawMDAT = false;
      transmuxer.transmux(emptySegment).then(function(transmuxedData) {
        expect(transmuxedData instanceof Uint8Array).toBe(true);
        expect(transmuxedData.length).toBeGreaterThan(0);
        new shaka.util.Mp4Parser()
            .box('mdat', shaka.util.Mp4Parser.allData(function(data) {
              sawMDAT = true;
            }))
            .parse(transmuxedData.buffer);
        expect(sawMDAT).toBeFalsy();
      }).catch(fail).then(done);
    });

    it('passes through true timestamps', function(done) {
      var parsed = false;
      var expectedMp4Timestamp = 5166000;  // in timescale units
      var mp4Timestamp;

      transmuxer.transmux(videoSegment).then(function(transmuxedData) {
        var Mp4Parser = shaka.util.Mp4Parser;

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
            .parse(transmuxedData.buffer);

        expect(parsed).toBe(true);
        expect(mp4Timestamp).toEqual(expectedMp4Timestamp);
      }).catch(fail).then(done);
    });
  });
});
