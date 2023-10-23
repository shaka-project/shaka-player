/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TransmuxerEngine', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  const mp4MimeType = 'video/mp4; codecs="avc1.42E01E"';
  const transportStreamVideoMimeType = 'video/mp2t; codecs="avc1.42E01E"';
  const transportStreamAudioMimeType = 'video/mp2t; codecs="mp4a.40.2"';
  const aacAudioMimeType = 'audio/aac';

  describe('isSupported', () => {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;

    it('returns whether the content type is supported', () => {
      expect(TransmuxerEngine.isSupported(
          mp4MimeType, ContentType.VIDEO)).toBe(false);
      expect(TransmuxerEngine.isSupported(
          transportStreamVideoMimeType, ContentType.VIDEO)).toBe(true);
    });

    // Issue #1991
    it('handles upper-case MIME types', () => {
      const mimeType = transportStreamVideoMimeType.replace('mp2t', 'MP2T');
      expect(TransmuxerEngine.isSupported(
          mimeType, ContentType.VIDEO)).toBe(true);
    });
  });

  describe('convertCodecs', () => {
    const TransmuxerEngine = shaka.transmuxer.TransmuxerEngine;
    const convertCodecs =
        (type, codecs) => TransmuxerEngine.convertCodecs(type, codecs);

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

    // Issue #1991
    it('handles upper-case MIME types', () => {
      expect(convertCodecs(
          ContentType.VIDEO, 'video/MP2T; codecs="avc1.420001"'))
          .toBe('video/mp4; codecs="avc1.420001"');
    });

    it('converts legacy avc1 codec strings', () => {
      expect(convertCodecs(
          ContentType.VIDEO, 'video/mp2t; codecs="avc1.100.42"'))
          .toBe('video/mp4; codecs="avc1.64002a"');
      expect(convertCodecs(
          ContentType.VIDEO, 'video/mp2t; codecs="avc1.66.1"'))
          .toBe('video/mp4; codecs="avc1.420001"');
    });
  });
});
