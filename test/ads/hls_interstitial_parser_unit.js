/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('HlsInterstitialParser', () => {
  const Parser = shaka.ads.HlsInterstitialParser;

  function metadata(values, type = 'com.apple.hls.interstitial') {
    return {type, startTime: 100, endTime: 130,
      values: Object.keys(values).map((key) => ({key, data: values[key]}))};
  }

  it('recognizes canonical and legacy HLS interstitial metadata', () => {
    expect(Parser.isInterstitialMetadata(
        metadata({'X-ASSET-URI': 'ad'}))).toBe(true);
    expect(Parser.isInterstitialMetadata(metadata({'X-ASSET-URI': 'ad'},
        'com.apple.quicktime.HLS'))).toBe(true);
    expect(Parser.isInterstitialMetadata(
        metadata({}, 'unrelated'))).toBe(false);
  });

  it('parses attributes without fetching or decorating request URLs', () => {
    const parsed = Parser.parseMetadata(metadata({
      'ID': 'ad', 'X-ASSET-URI': 'uri',
      'CUE': 'ONCE', 'X-RESTRICT': 'JUMP', 'X-SKIP-CONTROL-OFFSET': '5',
      'X-SKIP-CONTROL-DURATION': 'bad'}), false);
    expect(parsed.assetList).toBeNull();
    expect(parsed.interstitials[0]).toEqual(jasmine.objectContaining({
      uri: 'uri', once: true, canJump: false, isSkippable: true,
      skipOffset: 5, skipFor: null, startTime: 100, endTime: 130,
    }));
  });

  it('returns an unresolved asset list descriptor', () => {
    const parsed = Parser.parseMetadata(metadata({'ID': 'ad',
      'X-ASSET-LIST': 'list.json', 'X-CUE': 'PRE'}), false);
    expect(parsed.interstitials).toEqual([]);
    expect(parsed.assetList).toEqual(jasmine.objectContaining({
      assetListUri: 'list.json', pre: true, resolving: false, resolved: false,
    }));
  });

  it('resolves relative assets against the final response URI', () => {
    const descriptor = Parser.parseMetadata(metadata({'ID': 'ad',
      'X-ASSET-LIST': 'list'}), false).assetList;
    goog.asserts.assert(descriptor, 'Asset list must be present');
    const assets = Parser.parseAssetList({'ASSETS': [
      {URI: 'first.m3u8', DURATION: 10},
      {URI: 'second.m3u8', DURATION: 20},
    ], 'SKIP-CONTROL': {OFFSET: 4}},
    descriptor, 'https://example.com/redirect/list.json', 15);
    expect(assets.length).toBe(1);
    expect(assets[0]).toEqual(jasmine.objectContaining({
      id: 'ad_shaka_asset_1', uri: 'https://example.com/redirect/second.m3u8',
      startOffset: 5, skipOffset: 4,
    }));
  });

  it('combines HLS media and SVTA pod and slot metadata', () => {
    const descriptor = Parser.parseMetadata(metadata({'ID': 'ad',
      'X-ASSET-LIST': 'list'}), false).assetList;
    goog.asserts.assert(descriptor, 'Asset list must be present');
    const slot = {type: 'linear', start: 0, duration: 10,
      identifiers: [{scheme: 'test', value: 'creative'}],
      tracking: [{type: 'progress', offset: 3, urls: ['progress']}]};
    const pod = {start: 5, duration: 10,
      tracking: [{type: 'podStart', urls: ['pod-start']}]};
    const assets = Parser.parseAssetList({'ASSETS': [
      {URI: 'intro', DURATION: 5}, {'URI': 'ad', 'DURATION': 10,
        'X-AD-CREATIVE-SIGNALING': {version: 2, type: 'slot', payload: [slot]}},
    ],
    'X-AD-CREATIVE-SIGNALING': {version: 2, type: 'pod', payload: [pod]}},
    descriptor, 'https://example.com/list');
    expect(assets[0].adCreativeSignaling).toBeUndefined();
    expect(assets[1].adCreativeSignaling).toBe(slot);
    expect(assets[1].pod).toBe(pod);
    expect(assets[1].sequenceLength).toBe(1);
    expect(assets[1].tracking).toBeNull();
  });

  it('rejects malformed lists and keeps empty successful lists empty', () => {
    const descriptor = Parser.parseMetadata(metadata({'ID': 'ad',
      'X-ASSET-LIST': 'list'}), false).assetList;
    goog.asserts.assert(descriptor, 'Asset list must be present');
    expect(Parser.parseAssetList({ASSETS: []}, descriptor, 'uri')).toEqual([]);
    expect(() => {
      goog.asserts.assert(descriptor, 'Asset list must be present');
      Parser.parseAssetList(/** @type {?} */ ({}), descriptor, 'uri');
    }).toThrow();
  });
});
