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


describe('ManifestTextParser', function() {
  /** @type {!shaka.hls.ManifestTextParser} */
  let parser;

  beforeEach(function() {
    parser = new shaka.hls.ManifestTextParser();
  });

  describe('parsePlaylist', function() {
    it('rejects invalid playlists', function() {
      verifyError('invalid playlist',
                  shaka.util.Error.Code.HLS_PLAYLIST_HEADER_MISSING);

      // This Master playlist is invalid cause it contains a segment tag.
      // All segment information should be in a Media playlist.
      verifyError('#EXTM3U\n' +
                  '#EXT-X-MEDIA:TYPE=AUDIO\n' +
                  '#EXTINF:6.00600',
                  shaka.util.Error.Code.HLS_INVALID_PLAYLIST_HIERARCHY);
    });

    it('parses a Media Playlist', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
            ],
          },
          '#EXTM3U\n' +
          '#EXT-X-TARGETDURATION:6\n');
    });

    it('parses a Master Playlist', function() {
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
          '#EXTM3U\n' +
          '#EXT-X-TARGETDURATION:6\n' +
          '#EXT-X-STREAM-INF:BANDWIDTH=2165224\n' +
          'prog_index.m3u8');
    });

    it('ignores comments', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
            ],
          },
          '#EXTM3U\n' +
          '#Comment\n' +
          '#EXT-X-TARGETDURATION:6');
    });

    /**
     * @param {string} string
     * @param {shaka.util.Error.Code} code
     */
    function verifyError(string, code) {
      let data = shaka.util.StringUtils.toUTF8(string);
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          code);
      try {
        parser.parsePlaylist(data, /* uri */ '');
        fail('Invalid HLS playlist should not be supported!');
      } catch (e) {
        shaka.test.Util.expectToEqualError(e, error);
      }
    }
  });

  describe('parseTag', function() {
    it('parses tags with no attributes', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-INDEPENDENT-SEGMENTS', []),
            ],
          },
          '#EXTM3U\n' +
          '#EXT-X-INDEPENDENT-SEGMENTS');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 1, 'EXT-X-PLAYLIST-TYPE', [], 'VOD'),
            ],
          },
          '#EXTM3U\n' +
          '#EXT-X-PLAYLIST-TYPE:VOD');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 2, 'EXT-X-MEDIA-SEQUENCE', [], '1'),
            ],
          },
          '#EXTM3U\n' +
          '#EXT-X-MEDIA-SEQUENCE:1');
    });

    it('parses tags with attributes', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-MEDIA',
                  [new shaka.hls.Attribute('TYPE', 'CLOSED-CAPTIONS')]),
            ],
          },
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS');

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
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:URI="main.mp4",BYTERANGE="720@0"');
    });

    it('parses tags with commas in attribute values', function() {
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
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2"');

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
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2,avc2.64000"');

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
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2",AUDIO="a1,a2"');
    });

    it('rejects invalid tags', function() {
      let error = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.INVALID_HLS_TAG,
          'invalid tag');
      let text = shaka.util.StringUtils.toUTF8('#EXTM3U\ninvalid tag');
      try {
        parser.parsePlaylist(text, /* uri */ '');
        fail('Invalid HLS tags should not be supported!');
      } catch (e) {
        shaka.test.Util.expectToEqualError(e, error);
      }
    });
  });

  describe('tag.toString', function() {
    it('recreates valid tag with attributes', function() {
      const text = '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2",AUDIO="a1,a2"';
      let tag = shaka.hls.ManifestTextParser.parseTag(0, text);
      expect(text).toEqual(tag.toString());
    });

    it('recreates valid tag with value', function() {
      const text = '#EXT-X-PLAYLIST-TYPE:VOD';
      let tag = shaka.hls.ManifestTextParser.parseTag(0, text);
      expect(text).toEqual(tag.toString());
    });

    it('recreates valid tag with no value', function() {
      const text = '#EXTM3U';
      let tag = shaka.hls.ManifestTextParser.parseTag(0, text);
      expect(text).toEqual(tag.toString());
    });
  });

  describe('parseSegments', function() {
    it('parses segments', function() {
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
          '#EXTM3U\n' +
          '#EXT-X-MEDIA-SEQUENCE:1\n' +
          '#EXTINF:5.99467\n' +
          'https://test/test.mp4\n');
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
          '#EXTM3U\n' +
          '#EXT-X-KEY:METHOD="AES-128",URI="http://key.com",IV="123"\n' +
          '#EXT-X-TARGETDURATION:6\n' +
          '#EXTINF:5.99467\n' +
          'https://test/test.mp4\n');
    });

    it('tracks playlist URI', function() {
      verifyPlaylist(
          {
            uri: 'https://test/manifest.m3u8',
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-MEDIA-SEQUENCE', [], '1'),
            ],
            segments: [
              new shaka.hls.Segment('test.mp4',
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

  describe('parseSegments', function() {
    const manifestText = '#EXTM3U\n' +
        '#EXT-X-TARGETDURATION:6\n' +
        '#EXTINF:5\n' +
        'uri\n' +
        '#EXTINF:4\n' +
        'uri2\n';

    it('parses segments', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
            ],
            segments: [
              new shaka.hls.Segment('uri',
                                    [new shaka.hls.Tag(2, 'EXTINF', [], '5')]),
              new shaka.hls.Segment('uri2',
                                    [new shaka.hls.Tag(3, 'EXTINF', [], '4')]),
            ],
          },
          manifestText);
    });
    it('identifies playlist tags', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag(/* id */ 0, 'EXT-X-TARGETDURATION', [], '6'),
              new shaka.hls.Tag(/* id */ 4, 'EXT-X-ENDLIST', []),
            ],
            segments: [
              new shaka.hls.Segment('uri',
                                    [new shaka.hls.Tag(2, 'EXTINF', [], '5')]),
              new shaka.hls.Segment('uri2',
                                    [new shaka.hls.Tag(3, 'EXTINF', [], '4')]),
            ],
          },
          // Append a playlist tag to the manifest text so it appears after
          // segment-related tags.
          manifestText + '#EXT-X-ENDLIST');
    });
  });


  /**
   * @param {Object} expectedPlaylist
   * @param {string} playlistText
   * @param {string=} manifestUri
   */
  function verifyPlaylist(expectedPlaylist, playlistText, manifestUri = '') {
    let playlistBuffer = shaka.util.StringUtils.toUTF8(playlistText);
    let actualPlaylist = parser.parsePlaylist(playlistBuffer, manifestUri);

    expect(actualPlaylist).toBeTruthy();
    expect(actualPlaylist.type).toEqual(expectedPlaylist.type);
    expect(actualPlaylist.tags).toEqual(expectedPlaylist.tags);

    if (expectedPlaylist.segments) {
      expect(actualPlaylist.segments).toEqual(expectedPlaylist.segments);
    }

    if (expectedPlaylist.uri) {
      expect(actualPlaylist.uri).toEqual(expectedPlaylist.uri);
    }
  }
});
