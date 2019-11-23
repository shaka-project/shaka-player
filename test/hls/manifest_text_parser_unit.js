/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('ManifestTextParser', () => {
  /** @type {!shaka.hls.ManifestTextParser} */
  let parser;

  beforeEach(() => {
    parser = new shaka.hls.ManifestTextParser();
  });

  describe('parsePlaylist', () => {
    it('rejects invalid playlists', () => {
      verifyError('invalid playlist',
          shaka.util.Error.Code.HLS_PLAYLIST_HEADER_MISSING);

      // This Master playlist is invalid cause it contains a segment tag.
      // All segment information should be in a Media playlist.
      verifyError('#EXTM3U\n' +
                  '#EXT-X-MEDIA:TYPE=AUDIO\n' +
                  '#EXTINF:6.00600',
      shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    });

    it('parses a Media Playlist', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-TARGETDURATION:6\n',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('parses a Master Playlist', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
              new shaka.hls.Tag(/* id */ 1, 'EXT-X-STREAM-INF',
                  [
                    new shaka.hls.Attribute('BANDWIDTH', '2165224'),
                    new shaka.hls.Attribute('URI', 'prog_index.m3u8'),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-TARGETDURATION:6\n' +
          '#EXT-X-STREAM-INF:BANDWIDTH=2165224\n' +
          'prog_index.m3u8',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('ignores comments', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#Comment\n' +
          '#EXT-X-TARGETDURATION:6',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    /**
     * @param {string} string
     * @param {shaka.util.Error.Code} code
     */
    function verifyError(string, code) {
      const data = shaka.util.StringUtils.toUTF8(string);
      const error = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          code));
      expect(() => parser.parsePlaylist(data, /* uri */ '')).toThrow(error);
    }
  });

  describe('parseTag', () => {
    it('parses tags with no attributes', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-INDEPENDENT-SEGMENTS', []),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-INDEPENDENT-SEGMENTS',

          // manifest URI:
          'https://test/manifest.m3u8');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 1, 'EXT-X-PLAYLIST-TYPE', [], 'VOD'),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-PLAYLIST-TYPE:VOD',

          // manifest URI:
          'https://test/manifest.m3u8');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 2, 'EXT-X-MEDIA-SEQUENCE', [], '1'),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA-SEQUENCE:1',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('parses tags with attributes', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-MEDIA',
                  [new shaka.hls.Attribute('TYPE', 'CLOSED-CAPTIONS')]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS',

          // manifest URI:
          'https://test/manifest.m3u8');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag(/* id */ 1, 'EXT-X-MEDIA',
                  [
                    new shaka.hls.Attribute('URI', 'main.mp4'),
                    new shaka.hls.Attribute('BYTERANGE', '720@0'),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:URI="main.mp4",BYTERANGE="720@0"',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('parses tags with commas in attribute values', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-MEDIA',
                  [
                    new shaka.hls.Attribute('CODECS', 'avc1.64002a,mp4a.40.2'),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2"',

          // manifest URI:
          'https://test/manifest.m3u8');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag(/* id */ 1, 'EXT-X-MEDIA',
                  [
                    new shaka.hls.Attribute('CODECS',
                        'avc1.64002a,mp4a.40.2,avc2.64000'),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2,avc2.64000"',

          // manifest URI:
          'https://test/manifest.m3u8');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag(/* id */ 2, 'EXT-X-MEDIA',
                  [
                    new shaka.hls.Attribute('CODECS',
                        'avc1.64002a,mp4a.40.2'),
                    new shaka.hls.Attribute('AUDIO', 'a1,a2'),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2",AUDIO="a1,a2"',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('rejects invalid tags', () => {
      const error = shaka.test.Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.INVALID_HLS_TAG,
          'invalid tag'));
      const text = shaka.util.StringUtils.toUTF8('#EXTM3U\ninvalid tag');
      expect(() => parser.parsePlaylist(text, /* uri */ '')).toThrow(error);
    });
  });

  describe('tag.toString', () => {
    it('recreates valid tag with attributes', () => {
      const text = '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2",AUDIO="a1,a2"';
      const tag = shaka.hls.ManifestTextParser.parseTag(0, text);
      expect(text).toBe(tag.toString());
    });

    it('recreates valid tag with value', () => {
      const text = '#EXT-X-PLAYLIST-TYPE:VOD';
      const tag = shaka.hls.ManifestTextParser.parseTag(0, text);
      expect(text).toBe(tag.toString());
    });

    it('recreates valid tag with no value', () => {
      const text = '#EXTM3U';
      const tag = shaka.hls.ManifestTextParser.parseTag(0, text);
      expect(text).toBe(tag.toString());
    });

    it('recreates valid tag with both value and attributes', () => {
      const text = '#EXTINF:5.99467,pid=180';
      const tag = shaka.hls.ManifestTextParser.parseTag(0, text);
      expect(text).toBe(tag.toString());
    });
  });

  describe('parseSegments', () => {
    it('parses segments', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-MEDIA-SEQUENCE', [], '1'),
            ],
            segments: [
              new shaka.hls.Segment('https://test/test.mp4',
                  [
                    new shaka.hls.Tag(/* id */ 2, 'EXTINF', [], '5.99467'),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA-SEQUENCE:1\n' +
          '#EXTINF:5.99467\n' +
          'https://test/test.mp4\n',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('handles tags with both value and attributes', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-MEDIA-SEQUENCE', [], '1'),
            ],
            segments: [
              new shaka.hls.Segment('https://test/test.mp4',
                  [
                    new shaka.hls.Tag(
                        /* id */ 2,
                        'EXTINF',
                        [new shaka.hls.Attribute('pid', '180')],
                        '5.99467'
                    ),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA-SEQUENCE:1\n' +
          '#EXTINF:5.99467,pid=180\n' +
          'https://test/test.mp4\n',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('handles manifests with a segment tag before a playlist tag', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 2, 'EXT-X-TARGETDURATION', [], '6'),
            ],
            segments: [
              new shaka.hls.Segment('https://test/test.mp4',
                  [
                    new shaka.hls.Tag(/* id */ 1, 'EXT-X-KEY',
                        [
                          new shaka.hls.Attribute('METHOD', 'AES-128'),
                          new shaka.hls.Attribute('URI', 'http://key.com'),
                          new shaka.hls.Attribute('IV', '123'),
                        ]),
                    new shaka.hls.Tag(/* id */ 3, 'EXTINF', [], '5.99467'),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-KEY:METHOD="AES-128",URI="http://key.com",IV="123"\n' +
          '#EXT-X-TARGETDURATION:6\n' +
          '#EXTINF:5.99467\n' +
          'https://test/test.mp4\n',

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('tracks playlist URI', () => {
      verifyPlaylist(
          {
            absoluteUri: 'https://test/manifest.m3u8',
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-MEDIA-SEQUENCE', [], '1'),
            ],
            segments: [
              new shaka.hls.Segment('https://test/test.mp4',
                  [
                    new shaka.hls.Tag(/* id */ 2, 'EXTINF', [], '5.99467'),
                  ]),
            ],
          },

          // playlist text:
          '#EXTM3U\n' +
          '#EXT-X-MEDIA-SEQUENCE:1\n' +
          '#EXTINF:5.99467\n' +
          'test.mp4\n',

          // manifest URI:
          'https://test/manifest.m3u8');
    });
  });

  describe('parseSegments', () => {
    const manifestText = '#EXTM3U\n' +
        '#EXT-X-TARGETDURATION:6\n' +
        '#EXTINF:5\n' +
        'uri\n' +
        '#EXTINF:4\n' +
        'uri2\n';

    it('parses segments', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
            ],
            segments: [
              new shaka.hls.Segment('https://test/uri',
                  [new shaka.hls.Tag(2, 'EXTINF', [], '5')]),
              new shaka.hls.Segment('https://test/uri2',
                  [new shaka.hls.Tag(3, 'EXTINF', [], '4')]),
            ],
          },

          manifestText,

          // manifest URI:
          'https://test/manifest.m3u8');
    });

    it('identifies playlist tags', () => {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
              new shaka.hls.Tag(/* id */ 4, 'EXT-X-ENDLIST', []),
            ],
            segments: [
              new shaka.hls.Segment('https://test/uri',
                  [new shaka.hls.Tag(2, 'EXTINF', [], '5')]),
              new shaka.hls.Segment('https://test/uri2',
                  [new shaka.hls.Tag(3, 'EXTINF', [], '4')]),
            ],
          },

          // Append a playlist tag to the manifest text so it appears after
          // segment-related tags.
          manifestText + '#EXT-X-ENDLIST',

          // manifest URI:
          'https://test/manifest.m3u8');
    });
  });

  // TODO(#1672): Get a better type than "Object" here.
  /**
   * @param {!Object} expectedPlaylist
   * @param {string} playlistText
   * @param {string} absoluteManifestUri
   */
  function verifyPlaylist(expectedPlaylist, playlistText, absoluteManifestUri) {
    const playlistBuffer = shaka.util.StringUtils.toUTF8(playlistText);
    const actualPlaylist =
        parser.parsePlaylist(playlistBuffer, absoluteManifestUri);

    expect(actualPlaylist).toEqual(jasmine.objectContaining(expectedPlaylist));
  }
});
