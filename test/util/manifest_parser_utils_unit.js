/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ManifestParserUtils', () => {
  const ManifestParserUtils = shaka.util.ManifestParserUtils;

  describe('guessCodecsSafe', () => {
    it('recognizes MPEG-2 video codec (mp2v)', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'video', ['mp2v']);
      expect(result).toBe('mp2v');
    });

    it('returns mp2v from mixed codec list', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'video', ['mp4a.40.2', 'mp2v']);
      expect(result).toBe('mp2v');
    });

    it('does not match mp2v as audio', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'audio', ['mp2v']);
      expect(result).toBeNull();
    });

    it('recognizes DTS audio codec', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'audio', ['dts']);
      expect(result).toBe('dts');
    });

    it('recognizes DTS-HD (dtsh) audio codec', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'audio', ['dtsh']);
      expect(result).toBe('dtsh');
    });

    it('recognizes DTS Digital Surround (dtsc)', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'audio', ['dtsc']);
      expect(result).toBe('dtsc');
    });

    it('recognizes DTS Express (dtse)', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'audio', ['dtse']);
      expect(result).toBe('dtse');
    });

    it('recognizes DTS:X (dtsx)', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'audio', ['dtsx']);
      expect(result).toBe('dtsx');
    });

    it('returns DTS variant from mixed codec list', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'audio', ['avc1.42E01E', 'dtsh']);
      expect(result).toBe('dtsh');
    });

    it('does not match DTS codecs as video', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'video', ['dts']);
      expect(result).toBeNull();
    });

    it('does not match invalid DTS-like strings', () => {
      const result = ManifestParserUtils.guessCodecsSafe(
          'audio', ['dtsz']);
      expect(result).toBeNull();
    });
  });

  // Shorthand so expected values read as cleanly as the real output.
  const norm = (lang) => shaka.util.LanguageUtils.normalize(lang);

  describe('parseCEA608Captions', () => {
    /**
     * @param {?string} value
     * @return {!Map<string, string>}
     */
    const parse = (value) => {
      const map = new Map();
      ManifestParserUtils.parseCEA608Captions(value, map);
      return map;
    };

    it('falls back to CC1/und when value is null', () => {
      expect(parse(null)).toEqual(new Map([['CC1', 'und']]));
    });

    it('parses explicit CC-prefixed channel ids', () => {
      // "CC1=eng;CC3=swe" – the canonical SCTE format.
      expect(parse('CC1=eng;CC3=swe')).toEqual(new Map([
        ['CC1', norm('eng')],
        ['CC3', norm('swe')],
      ]));
    });

    it('parses explicit bare-number channel ids', () => {
      // Some encoders omit the "CC" prefix: "1=eng;3=swe".
      expect(parse('1=eng;3=swe')).toEqual(new Map([
        ['CC1', norm('eng')],
        ['CC3', norm('swe')],
      ]));
    });

    it('assigns CC1/CC3 when exactly 2 implicit entries are given', () => {
      // The two-entry heuristic: most common pair is CC1 (field 1) + CC3
      // (field 2).  "eng;swe" must therefore map to CC1 and CC3, not CC1/CC2.
      expect(parse('eng;swe')).toEqual(new Map([
        ['CC1', norm('eng')],
        ['CC3', norm('swe')],
      ]));
    });

    it('assigns CC1–CC4 sequentially when more than 2 implicit entries', () => {
      expect(parse('eng;swe;fre;pol')).toEqual(new Map([
        ['CC1', norm('eng')],
        ['CC2', norm('swe')],
        ['CC3', norm('fre')],
        ['CC4', norm('pol')],
      ]));
    });

    it('defaults blank language to "und" (b/187442669)', () => {
      // Encoders sometimes emit "CC2=;CC3=" with no language code.
      expect(parse('CC2=;CC3=')).toEqual(new Map([
        ['CC2', 'und'],
        ['CC3', 'und'],
      ]));
    });

    it('accumulates entries across multiple calls on the same map', () => {
      // parseCEA608Captions mutates the map in-place, allowing the caller to
      // merge multiple accessibility descriptors into one stream object.
      const map = new Map();
      ManifestParserUtils.parseCEA608Captions('CC1=eng', map);
      ManifestParserUtils.parseCEA608Captions('CC3=swe', map);
      expect(map).toEqual(new Map([
        ['CC1', norm('eng')],
        ['CC3', norm('swe')],
      ]));
    });
  });


  describe('parseCEA708Captions', () => {
    /**
     * @param {?string} value
     * @return {!Map<string, string>}
     */
    const parse = (value) => {
      const map = new Map();
      ManifestParserUtils.parseCEA708Captions(value, map);
      return map;
    };

    it('falls back to svc1/und when value is null', () => {
      expect(parse(null)).toEqual(new Map([['svc1', 'und']]));
    });

    it('parses explicit service numbers with language', () => {
      // "1=lang:eng;3=lang:swe" – canonical CEA-708 SCTE format.
      expect(parse('1=lang:eng;3=lang:swe')).toEqual(new Map([
        ['svc1', norm('eng')],
        ['svc3', norm('swe')],
      ]));
    });

    it('ignores extra comma-separated parameters after the language', () => {
      // "1=lang:bos;3=lang:cze,war:1,er:1" – war and er params are discarded.
      expect(parse('1=lang:bos;3=lang:cze,war:1,er:1')).toEqual(new Map([
        ['svc1', norm('bos')],
        ['svc3', norm('cze')],
      ]));
    });

    it('assigns svc1, svc2,… sequentially for implicit service numbers', () => {
      expect(parse('eng;swe')).toEqual(new Map([
        ['svc1', norm('eng')],
        ['svc2', norm('swe')],
      ]));
    });

    it('handles three implicit services', () => {
      expect(parse('eng;swe;deu')).toEqual(new Map([
        ['svc1', norm('eng')],
        ['svc2', norm('swe')],
        ['svc3', norm('deu')],
      ]));
    });

    it('accumulates entries across multiple calls on the same map', () => {
      const map = new Map();
      ManifestParserUtils.parseCEA708Captions('1=lang:eng', map);
      ManifestParserUtils.parseCEA708Captions('3=lang:swe', map);
      expect(map).toEqual(new Map([
        ['svc1', norm('eng')],
        ['svc3', norm('swe')],
      ]));
    });
  });


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
