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

describe('ManifestParserUtils', () => {
  const ManifestParserUtils = shaka.util.ManifestParserUtils;

  describe('resolveUris', () => {
    it('resolves relative URIs', () => {
      const base = ['http://example.com/'];
      const relative = ['page.html'];
      const expected = ['http://example.com/page.html'];
      const actual = ManifestParserUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });

    it('resolves URIs multiplicatively', () => {
      const base = ['http://example.com/', 'http://example.org'];
      const relative = ['page.html', 'site.css'];
      const expected = [
        'http://example.com/page.html',
        'http://example.com/site.css',
        'http://example.org/page.html',
        'http://example.org/site.css',
      ];
      const actual = ManifestParserUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });

    it('returns base if no relative URIs', () => {
      const base = ['http://example.com'];
      const relative = [];
      const actual = ManifestParserUtils.resolveUris(base, relative);
      expect(actual).toEqual(base);
    });

    it('handles manifest file as base URI', () => {
      const base = [
        'http://example.com/manifest.mpd',
        'http://example.org/path/to/manifest.mpd',
      ];
      const relative = ['segment.mp4', 'other/location/segment.webm'];
      const expected = [
        'http://example.com/segment.mp4',
        'http://example.com/other/location/segment.webm',
        'http://example.org/path/to/segment.mp4',
        'http://example.org/path/to/other/location/segment.webm',
      ];
      const actual = ManifestParserUtils.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });
  });
});
