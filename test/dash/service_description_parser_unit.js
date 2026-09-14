/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// ServiceDescriptionParser is not yet required by DashParser (that lands in
// a later task), so it is not part of the main app dependency graph.
// Require it explicitly to load it in the test bundle.
goog.require('shaka.dash.ServiceDescriptionParser');

describe('ServiceDescriptionParser', () => {
  // Not aliased to a local const: unlike the rest of this file's
  // dependencies, this class is loaded by the explicit goog.require above
  // rather than the main app dependency graph, so it is not guaranteed to
  // be defined yet when this describe body runs. Looking it up at call
  // time (inside parse(), which only ever runs from an it()) is safe.
  const TXml = shaka.util.TXml;
  const MANIFEST_BASE_URIS = ['https://example.com/dash/manifest.mpd'];

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
        makeMpd(lines), MANIFEST_BASE_URIS);
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
});
