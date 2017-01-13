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


describe('HlsParser', function() {
  var parser;

  beforeEach(function() {
    parser = new shaka.hls.HlsParser();
  });

  describe('parsePlaylist', function() {
    it('rejects invalid playlists', function() {
      verifyError('invalid playlist',
                  shaka.util.Error.Code.HLS_PLAYLIST_HEADER_MISSING);

      // This Master playlist is invalid cause it contains a segment tag.
      // All segmnent information should be in a Media playlist.
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
              new shaka.hls.Tag('EXT-X-TARGETDURATION', [], '6')
            ],
            segmentsData: ['#EXTINF:6.00600,', 'main.mp4']
          },
          '#EXTM3U\n' +
          '#EXT-X-TARGETDURATION:6\n' +
          '#EXTINF:6.00600,\n' +
          'main.mp4');
    });

    it('parses a Master Playlist', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag('EXT-X-TARGETDURATION', [], '6'),
              new shaka.hls.Tag('EXT-X-STREAM-INF',
                  [
                    new shaka.hls.Attribute('BANDWIDTH', '2165224'),
                    new shaka.hls.Attribute('URI', 'prog_index.m3u8')
                  ])
            ]
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
              new shaka.hls.Tag('EXT-X-TARGETDURATION', [], '6')
            ],
            segmentsData: ['#EXTINF:6.00600,', 'main.mp4']
          },
          '#EXTM3U\n' +
          '#Comment\n' +
          '#EXT-X-TARGETDURATION:6\n' +
          '#EXTINF:6.00600,\n' +
          'main.mp4');
    });

    /**
     * @param {!string} string
     * @param {shaka.util.Error.Code} code
     */
    function verifyError(string, code) {
      var data = shaka.util.StringUtils.toUTF8(string);
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          code);
      try {
        parser.parsePlaylist(data);
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
              new shaka.hls.Tag('EXT-X-INDEPENDENT-SEGMENTS', [])
            ]
          },
          '#EXTM3U\n' +
          '#EXT-X-INDEPENDENT-SEGMENTS');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag('EXT-X-PLAYLIST-TYPE', [], 'VOD')
            ]
          },
          '#EXTM3U\n' +
          '#EXT-X-PLAYLIST-TYPE:VOD');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MEDIA,
            tags: [
              new shaka.hls.Tag('EXT-X-MEDIA-SEQUENCE', [], '1')
            ]
          },
          '#EXTM3U\n' +
          '#EXT-X-MEDIA-SEQUENCE:1');
    });

    it('parses tags with attributes', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag('EXT-X-MEDIA',
                  [new shaka.hls.Attribute('TYPE', 'CLOSED-CAPTIONS')])
            ]
          },
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag('EXT-X-MEDIA',
                  [
                    new shaka.hls.Attribute('URI', 'main.mp4'),
                    new shaka.hls.Attribute('BYTERANGE', '720@0')
                  ])
            ]
          },
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:URI="main.mp4",BYTERANGE="720@0"');
    });

    it('parses tags with commas in attribute values', function() {
      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag('EXT-X-MEDIA',
                  [
                    new shaka.hls.Attribute('CODECS', 'avc1.64002a,mp4a.40.2')
                  ])
            ]
          },
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2"');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag('EXT-X-MEDIA',
                  [
                    new shaka.hls.Attribute('CODECS',
                                            'avc1.64002a,mp4a.40.2,avc2.64000')
                  ])
            ]
          },
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2,avc2.64000"');

      verifyPlaylist(
          {
            type: shaka.hls.PlaylistType.MASTER,
            tags: [
              new shaka.hls.Tag('EXT-X-MEDIA',
                  [
                    new shaka.hls.Attribute('CODECS',
                                            'avc1.64002a,mp4a.40.2'),
                    new shaka.hls.Attribute('AUDIO', 'a1,a2')
                  ])
            ]
          },
          '#EXTM3U\n' +
          '#EXT-X-MEDIA:CODECS="avc1.64002a,mp4a.40.2",AUDIO="a1,a2"');
    });

    it('rejects invalid tags', function() {
      var error = new shaka.util.Error(
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.INVALID_HLS_TAG);
      var text = shaka.util.StringUtils.toUTF8('#EXTM3U\ninvalid tag');
      try {
        parser.parsePlaylist(text);
        fail('Invalid HLS tags should not be supported!');
      } catch (e) {
        shaka.test.Util.expectToEqualError(e, error);
      }
    });
  });


  /**
     * @param {Object} expected
     * @param {!string} string
     */
  function verifyPlaylist(expected, string) {
    var data = shaka.util.StringUtils.toUTF8(string);
    var actual = parser.parsePlaylist(data);

    expect(actual).toBeTruthy();
    expect(actual.type).toEqual(expected.type);
    expect(actual.tags).toEqual(expected.tags);

    if (expected.segmentsData)
      expect(actual.segmentsData).toEqual(expected.segmentsData);
  }
});
