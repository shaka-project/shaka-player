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

describe('ManifestParserUtils', function() {
  var ManifestParserUtils;

  beforeAll(function() {
    ManifestParserUtils = shaka.util.ManifestParserUtils;
  });
  describe('resolveUris', function() {
    it('resolves relative URIs', function() {
      var base = ['http://example.com/'];
      var relative = ['page.html'];
      var expected = ['http://example.com/page.html'];
      var actual = ManifestParserUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });

    it('resolves URIs multiplicatively', function() {
      var base = ['http://example.com/', 'http://example.org'];
      var relative = ['page.html', 'site.css'];
      var expected = [
        'http://example.com/page.html',
        'http://example.com/site.css',
        'http://example.org/page.html',
        'http://example.org/site.css'
      ];
      var actual = ManifestParserUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });

    it('returns base if no relative URIs', function() {
      var base = ['http://example.com'];
      var relative = [];
      var actual = ManifestParserUtils.resolveUris(base, relative);
      expect(actual).toEqual(base);
    });

    it('handles manifest file as base URI', function() {
      var base = [
        'http://example.com/manifest.mpd',
        'http://example.org/path/to/manifest.mpd'
      ];
      var relative = ['segment.mp4', 'other/location/segment.webm'];
      var expected = [
        'http://example.com/segment.mp4',
        'http://example.com/other/location/segment.webm',
        'http://example.org/path/to/segment.mp4',
        'http://example.org/path/to/other/location/segment.webm'
      ];
      var actual = ManifestParserUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });
  });
});
