/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ServiceDescriptionParser', () => {
  // The parser class is not aliased to a local const: it is looked up at
  // call time inside parse(), which only ever runs from an it(), so the
  // order in which this file and the app dependency graph are evaluated
  // does not matter.
  const TXml = shaka.util.TXml;

  /**
   * What DashParser hands the parser: the MPD-level BaseURL and Location
   * elements that carry a serviceLocation, already resolved to absolute
   * URIs the same way DashParser resolves request URIs.
   *
   * @type {!Array<shaka.extern.ServiceLocationBaseUri>}
   */
  const SERVICE_LOCATION_BASE_URIS = [
    {serviceLocation: 'alpha', uri: 'https://cdn1.example.com/'},
    {serviceLocation: 'beta', uri: 'https://example.com/dash/media/'},
  ];

  /**
   * @param {!Array<string>} lines MPD children.
   * @return {!shaka.extern.xml.Node}
   */
  function makeMpd(lines) {
    const xml = [
      '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static">',
      ...lines,
      '</MPD>',
    ].join('\n');
    const node = TXml.parseXmlString(xml, 'MPD');
    goog.asserts.assert(node, 'The test MPD must parse');
    return node;
  }

  /**
   * @param {!Array<string>} lines MPD children.
   * @return {?shaka.extern.ServiceDescription}
   */
  function parse(lines) {
    return shaka.dash.ServiceDescriptionParser.parse(
        makeMpd(lines), SERVICE_LOCATION_BASE_URIS);
  }

  it('returns null when there is no ServiceDescription', () => {
    expect(parse(['<Period id="0"/>'])).toBeNull();
  });

  it('parses Latency and PlaybackRate', () => {
    const description = parse([
      '<ServiceDescription id="0">',
      '  <Latency max="4000" min="1000" referenceId="0" target="2000"/>',
      '  <PlaybackRate max="1.10" min="0.95"/>',
      '</ServiceDescription>',
    ]);
    expect(description.targetLatency).toBe(2);
    expect(description.maxLatency).toBe(4);
    expect(description.minLatency).toBe(1);
    expect(description.maxPlaybackRate).toBe(1.1);
    expect(description.minPlaybackRate).toBe(0.95);
    expect(description.clientDataReporting).toBeNull();
  });

  it('leaves absent latency attributes undefined', () => {
    const description = parse([
      '<ServiceDescription id="0">',
      '  <Latency referenceId="0" target="2000"/>',
      '</ServiceDescription>',
    ]);
    expect(description.targetLatency).toBe(2);
    expect(description.maxLatency).toBeUndefined();
    expect(description.minLatency).toBeUndefined();
    expect(description.maxPlaybackRate).toBeUndefined();
    expect(description.minPlaybackRate).toBeUndefined();
  });

  it('ignores a ServiceDescription that carries a Scope', () => {
    const description = parse([
      '<ServiceDescription id="1250">',
      '  <Scope schemeIdUri="urn:mpeg:dash:event:service-description:2024"/>',
      '  <Latency target="1250"/>',
      '</ServiceDescription>',
    ]);
    expect(description).toBeNull();
  });

  it('applies a description scoped to DVB low latency', () => {
    const description = parse([
      '<ServiceDescription id="1">',
      '  <Scope schemeIdUri="urn:dvb:dash:lowlatency:scope:2019"/>',
      '  <Latency target="1250"/>',
      '  <PlaybackRate max="1.10" min="0.95"/>',
      '</ServiceDescription>',
    ]);
    expect(description.targetLatency).toBe(1.25);
    expect(description.maxPlaybackRate).toBe(1.1);
  });

  it('applies a description with a recognized and an unknown scope', () => {
    const description = parse([
      '<ServiceDescription id="1">',
      '  <Scope schemeIdUri="urn:example:some-client-scope"/>',
      '  <Scope schemeIdUri="urn:dvb:dash:lowlatency:scope:2019"/>',
      '  <Latency target="1250"/>',
      '</ServiceDescription>',
    ]);
    expect(description.targetLatency).toBe(1.25);
  });

  it('takes latency from the first unscoped description', () => {
    const description = parse([
      '<ServiceDescription id="1">',
      '  <Scope schemeIdUri="urn:example:some-client-scope"/>',
      '  <Latency target="1000"/>',
      '</ServiceDescription>',
      '<ServiceDescription id="2">',
      '  <Latency target="2000"/>',
      '</ServiceDescription>',
      '<ServiceDescription id="3">',
      '  <Latency target="3000"/>',
      '</ServiceDescription>',
    ]);
    expect(description.targetLatency).toBe(2);
  });

  describe('ClientDataReporting', () => {
    const SCHEME = 'urn:mpeg:dash:cta-5004:2023';

    /**
     * @param {!Array<string>} reportingLines
     * @return {?shaka.extern.ClientDataReporting}
     */
    function parseReporting(reportingLines) {
      const description = parse([
        '<ServiceDescription id="1">',
        ...reportingLines,
        '</ServiceDescription>',
      ]);
      return description ? description.clientDataReporting : null;
    }

    /**
     * @param {string} attributes CMCDParameters attributes.
     * @return {shaka.extern.CmcdParameters}
     */
    function parseParameters(attributes) {
      const reporting = parseReporting([
        `<ClientDataReporting schemeIdUri="${SCHEME}">`,
        `  <CMCDParameters ${attributes}/>`,
        '</ClientDataReporting>',
      ]);
      goog.asserts.assert(reporting, 'reporting must parse');
      goog.asserts.assert(
          reporting.cmcdParameters, 'cmcdParameters must parse');
      return reporting.cmcdParameters;
    }

    it('parses every attribute', () => {
      const reporting = parseReporting([
        `<ClientDataReporting schemeIdUri="${SCHEME}"`,
        '    serviceLocations="beta gamma" adaptationSets="1 2">',
        '  <CMCDParameters version="2" mode="header"',
        '      includeInRequests="segment mpd steering"',
        '      keys="br bl cid sid v" contentID="movie-42"',
        '      sessionID="session-7"/>',
        '</ClientDataReporting>',
      ]);
      expect(reporting.schemeIdUri).toBe(SCHEME);
      expect(reporting.serviceLocations).toEqual(['beta', 'gamma']);
      expect(reporting.adaptationSets).toEqual(['1', '2']);
      expect(reporting.cmcdParameters).toEqual({
        version: 2,
        mode: 'header',
        includeInRequests: ['segment', 'mpd', 'steering'],
        keys: ['br', 'bl', 'cid', 'sid', 'v'],
        contentId: 'movie-42',
        sessionId: 'session-7',
      });
    });

    it('applies the spec defaults for absent attributes', () => {
      const reporting = parseReporting([
        `<ClientDataReporting schemeIdUri="${SCHEME}">`,
        '  <CMCDParameters keys="br"/>',
        '</ClientDataReporting>',
      ]);
      expect(reporting.serviceLocations).toBeNull();
      expect(reporting.adaptationSets).toBeNull();
      expect(reporting.cmcdParameters).toEqual({
        version: 1,
        mode: 'query',
        includeInRequests: ['segment'],
        keys: ['br'],
        contentId: null,
        sessionId: null,
      });
    });

    it('clamps unsupported versions and recovers from invalid ones', () => {
      expect(parseParameters('version="3" keys="br"').version).toBe(2);
      expect(parseParameters('version="abc" keys="br"').version).toBe(1);
      expect(parseParameters('version="0" keys="br"').version).toBe(1);
    });

    it('falls back to query mode on an unknown mode', () => {
      expect(parseParameters('mode="json" keys="br"').mode).toBe('query');
      expect(parseParameters('mode="header" keys="br"').mode).toBe('header');
    });

    it('drops URN and unknown includeInRequests tokens', () => {
      const params = parseParameters(
          'includeInRequests="segment urn:example:foo bogus *" keys="br"');
      expect(params.includeInRequests).toEqual(['segment', '*']);
      const empty = parseParameters(
          'includeInRequests="urn:example:foo" keys="br"');
      expect(empty.includeInRequests).toEqual([]);
    });

    it('keeps keys verbatim and reports absent keys as null', () => {
      expect(parseParameters('keys="br  foo-bar bogus"').keys)
          .toEqual(['br', 'foo-bar', 'bogus']);
      expect(parseParameters('version="1"').keys).toBeNull();
    });

    it('treats an empty keys list as an absent attribute', () => {
      expect(parseParameters('keys=""').keys).toBeNull();
      expect(parseParameters('keys="   "').keys).toBeNull();
    });

    it('ignores contentID and sessionID outside 1..64 characters', () => {
      const long = 'x'.repeat(65);
      const max = 'y'.repeat(64);
      const params = parseParameters(
          `keys="cid sid" contentID="${long}" sessionID="${max}"`);
      expect(params.contentId).toBeNull();
      expect(params.sessionId).toBe(max);
      expect(parseParameters('keys="cid" contentID=""').contentId).toBeNull();
    });

    it('accepts the scheme on CMCDParameters', () => {
      const reporting = parseReporting([
        '<ClientDataReporting>',
        `  <CMCDParameters schemeIdUri="${SCHEME}" keys="br"/>`,
        '</ClientDataReporting>',
      ]);
      expect(reporting.schemeIdUri).toBe(SCHEME);
      expect(reporting.cmcdParameters.keys).toEqual(['br']);
    });

    it('ignores the dash.js urn:dashif:cta-5004:2025 alias', () => {
      const description = parse([
        '<ServiceDescription id="1">',
        '  <ClientDataReporting schemeIdUri="urn:dashif:cta-5004:2025">',
        '    <CMCDParameters keys="br"/>',
        '  </ClientDataReporting>',
        '</ServiceDescription>',
      ]);
      expect(description).toBeNull();
    });

    it('ignores ClientDataReporting with an unsupported scheme', () => {
      const description = parse([
        '<ServiceDescription id="1">',
        '  <ClientDataReporting schemeIdUri="urn:example:other-reporting">',
        '    <CMCDParameters keys="br"/>',
        '  </ClientDataReporting>',
        '</ServiceDescription>',
      ]);
      expect(description).toBeNull();
    });

    it('returns a reporting element without CMCDParameters as null params',
        () => {
          const reporting = parseReporting([
            `<ClientDataReporting schemeIdUri="${SCHEME}"`,
            '    serviceLocations="beta"/>',
          ]);
          expect(reporting.serviceLocations).toEqual(['beta']);
          expect(reporting.cmcdParameters).toBeNull();
        });

    it('combines latency and CMCD from different descriptions', () => {
      const description = parse([
        '<ServiceDescription id="1">',
        '  <Latency target="2000"/>',
        '</ServiceDescription>',
        '<ServiceDescription id="2">',
        `  <ClientDataReporting schemeIdUri="${SCHEME}">`,
        '    <CMCDParameters keys="br" contentID="second"/>',
        '  </ClientDataReporting>',
        '</ServiceDescription>',
        '<ServiceDescription id="3">',
        `  <ClientDataReporting schemeIdUri="${SCHEME}">`,
        '    <CMCDParameters keys="br" contentID="third"/>',
        '  </ClientDataReporting>',
        '</ServiceDescription>',
      ]);
      expect(description.targetLatency).toBe(2);
      expect(description.clientDataReporting.cmcdParameters.contentId)
          .toBe('second');
    });

    it('attaches the caller-resolved serviceLocationBaseUris unchanged', () => {
      // BaseURL and Location elements in the MPD itself are not read here:
      // DashParser resolves them (Location against the manifest URI, BaseURL
      // against the updated manifest location) and passes the result in, so
      // relative values are never resolved a second time.
      const reporting = parseReporting([
        `<ClientDataReporting schemeIdUri="${SCHEME}">`,
        '  <CMCDParameters keys="br"/>',
        '</ClientDataReporting>',
      ]);
      expect(reporting.serviceLocationBaseUris)
          .toEqual(SERVICE_LOCATION_BASE_URIS);
    });
  });
});
