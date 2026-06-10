/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('URL', () => {
  describe('resolve', () => {
    it('resolves relative URL against base URL', () => {
      const base = 'http://example.com/path/';
      const relative = 'file.html';

      expect(shaka.util.URL.resolve(base, relative))
          .toBe('http://example.com/path/file.html');
    });

    it('resolves absolute relative URL', () => {
      const base = 'http://example.com/';
      const relative = 'https://other.com/a';

      expect(shaka.util.URL.resolve(base, relative))
          .toBe('https://other.com/a');
    });
  });

  describe('resolveUris', () => {
    it('resolves relative URIs', () => {
      const base = ['http://example.com/'];
      const relative = ['page.html'];
      const expected = ['http://example.com/page.html'];
      const actual = shaka.util.URL.resolveUris(base, relative);
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
      const actual = shaka.util.URL.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });

    it('returns base if no relative URIs', () => {
      const base = ['http://example.com'];
      const relative = [];
      const actual = shaka.util.URL.resolveUris(base, relative);
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
      const actual = shaka.util.URL.resolveUris(base, relative);
      expect(actual).toEqual(expected);
    });

    it('applies extra query params', () => {
      const base = ['http://example.com/'];
      const relative = ['a'];

      const result = shaka.util.URL.resolveUris(
          base,
          relative,
          'x=1');

      expect(result).toEqual(['http://example.com/a?x=1']);
    });

    it('handles multiple bases and one relative', () => {
      const base = ['http://a.com/', 'http://b.com/'];
      const relative = ['x'];

      const result = shaka.util.URL.resolveUris(base, relative);

      expect(result).toEqual([
        'http://a.com/x',
        'http://b.com/x',
      ]);
    });

    it('handles empty base list', () => {
      const result = shaka.util.URL.resolveUris([], ['x']);
      expect(result).toEqual([]);
    });

    it('does not modify input arrays', () => {
      const base = ['http://a.com/'];
      const relative = ['x'];

      shaka.util.URL.resolveUris(base, relative);

      expect(base).toEqual(['http://a.com/']);
      expect(relative).toEqual(['x']);
    });
  });

  describe('getDomain', () => {
    it('extracts domain from URL', () => {
      expect(shaka.util.URL.getDomain('http://example.com/path'))
          .toBe('example.com');
    });

    it('handles HTTPS URLs', () => {
      expect(shaka.util.URL.getDomain('https://foo.bar.com/a/b'))
          .toBe('foo.bar.com');
    });

    it('extracts domain from skd:// FairPlay URL', () => {
      expect(shaka.util.URL.getDomain('skd://example.com/license/12345'))
          .toBe('example.com');
    });

    /* eslint-disable @stylistic/max-len */
    it('extracts full identifier from skd:// FairPlay URL with token suffix', () => {
      expect(
          shaka.util.URL.getDomain(
              'skd://4060a865-8878-4267-9cbf-91ae5bae1e72:34135A24EA5BEF6B12734748A88CF63F'))
          .toBe('4060a865-8878-4267-9cbf-91ae5bae1e72:34135A24EA5BEF6B12734748A88CF63F');
    });
    /* eslint-enable @stylistic/max-len */
  });

  describe('setDomain', () => {
    it('replaces domain in URL', () => {
      const result = shaka.util.URL.setDomain(
          'http://example.com/path',
          'foo.com');

      expect(result).toBe('http://foo.com/path');
    });

    it('preserves path and query', () => {
      const result = shaka.util.URL.setDomain(
          'http://example.com/path?a=1',
          'foo.com');

      expect(result).toBe('http://foo.com/path?a=1');
    });
  });

  describe('appendParams', () => {
    it('adds query parameters', () => {
      const uri = 'http://example.com';

      const params = new Map();
      params.set('a', '1');
      params.set('b', '2');

      const result = shaka.util.URL.appendParams(uri, params);

      expect(result).toBe('http://example.com/?a=1&b=2');
    });

    it('appends to existing query string', () => {
      const uri = 'http://example.com?x=9';

      const params = new Map();
      params.set('a', '1');

      const result = shaka.util.URL.appendParams(uri, params);

      expect(result).toBe('http://example.com/?x=9&a=1');
    });
  });
});
