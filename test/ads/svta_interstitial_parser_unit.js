/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('SvtaInterstitialParser', () => {
  const Parser = shaka.ads.SvtaInterstitialParser;

  function slot(start = 0, duration = 10) {
    return {
      type: 'linear', start, duration,
      identifiers: [{scheme: 'test', value: 'creative ñ'}],
    };
  }

  function envelope(payload, type = 'slot') {
    return {version: 2, type, payload};
  }

  it('keeps slots without optional tracking and computes their full interval',
      () => {
        const ads = Parser.parseInterstitials(
            envelope([slot(10, 20)]), 100, 'id').interstitials;
        expect(ads.length).toBe(1);
        expect(ads[0]).toEqual(jasmine.objectContaining({
          startTime: 110, endTime: 130, uri: null, playbackMode: 'embedded',
          tracking: null,
        }));
      });

  it('decodes UTF-8 HLS signaling', () => {
    const bytes = shaka.util.StringUtils.toUTF8(
        JSON.stringify(envelope([slot()])));
    const metadata = {
      type: 'urn:svta:advertising-wg:ad-creative-signaling',
      startTime: 100, endTime: 120,
      values: [{key: 'X-AD-CREATIVE-SIGNALING',
        data: shaka.util.Uint8ArrayUtils.toStandardBase64(bytes)}],
    };
    const ads = Parser.parseMetadata(metadata).interstitials;
    expect(ads[0].adCreativeSignaling.identifiers[0].value).toBe('creative ñ');
  });

  it('parses DASH signaling with the same timeline semantics', () => {
    const region = {
      schemeIdUri: 'urn:svta:advertising-wg:ad-creative-signaling',
      value: '', startTime: 100, endTime: 200, id: 'id', timescale: 1,
      eventNode: shaka.util.TXml.parseXmlString(
          '<Event>' + JSON.stringify(envelope([slot(10, 20)])) + '</Event>',
          'Event'),
    };
    expect(Parser.parseRegion(region).interstitials[0].endTime).toBe(130);
  });

  it('keeps explicit pod membership and slot positions', () => {
    const pod = {start: 5, duration: 20, slots: [slot(), slot(10)],
      tracking: [{type: 'podStart', urls: ['pod-start']}]};
    const ads = Parser.parseInterstitials(envelope([pod], 'pod'), 100, 'id')
        .interstitials;
    expect(ads.length).toBe(2);
    expect(ads[0].startTime).toBe(105);
    expect(ads[1].startTime).toBe(115);
    expect(ads[0].pod).toBe(ads[1].pod);
    expect(ads[1].position).toBe(2);
    expect(ads[1].sequenceLength).toBe(2);
    expect(ads[1].podOffset).toBe(10);
  });

  it('preserves progress offsets, verification data and skip controls', () => {
    const data = slot();
    data.tracking = [{type: 'progress', offset: 1.234, urls: ['progress']}];
    data.verifications = [
      {vendor: 'test', resource: 'sdk', parameters: 'value'},
    ];
    data.skipOffset = 4;
    data.clickThrough = 'click';
    const ad = Parser.parseInterstitials(envelope([data]), 0, 'id')
        .interstitials[0];
    expect(ad.adCreativeSignaling.tracking[0].offset).toBe(1.234);
    expect(ad.adCreativeSignaling.verifications[0].vendor).toBe('test');
    expect(ad.skipOffset).toBe(4);
    expect(ad.clickThroughUrl).toBe('click');
  });

  it('rejects malformed and unsupported envelopes', () => {
    for (const data of [null, [], {}, envelope([], 'slot'),
      envelope([slot()], 'unknown'),
      envelope([{type: 'nonlinear', start: 0, duration: 10}]),
      envelope([{start: 0, duration: 0}])]) {
      expect(Parser.parseEnvelope(data)).toBeNull();
    }
  });

  it('accepts signaling without version, types or identifiers', () => {
    for (const version of [undefined, 1, 3]) {
      const ads = Parser.parseInterstitials({version, payload: [
        {start: 0, duration: 5,
          tracking: [{type: 'impression', urls: ['impression']}]},
      ]}, 100, 'id').interstitials;
      expect(ads.length).toBe(1);
      expect(ads[0].startTime).toBe(100);
      expect(ads[0].endTime).toBe(105);
    }
  });

  it('rejects missing remote feature declarations and unsupported features',
      () => {
        const data = slot();
        data.$remote = {tracking: 'remote'};
        expect(Parser.parseEnvelope(envelope([data]))).toBeNull();
        const valid = {...envelope([data]), features: {remoteFields: true}};
        expect(Parser.parseEnvelope(valid)).not.toBeNull();
        expect(Parser.parseEnvelope({...valid,
          features: {remoteFields: true, unknown: true}})).toBeNull();
      });

  it('turns pods with remote slots into deferred resources', () => {
    const pod = {duration: 10, $remote: {slots: 'remote'}};
    const result = Parser.parseInterstitials({...envelope([pod], 'pod'),
      features: {remoteFields: true}}, 100, 'id',
    new shaka.test.FakeNetworkingEngine());
    expect(result.interstitials).toEqual([]);
    expect(result.deferred.length).toBe(1);
    expect(result.deferred[0].startTime).toBe(100);
    expect(result.deferred[0].endTime).toBe(110);
  });

  it('validates independently delivered tracking envelopes', () => {
    const tracking = envelope([
      {type: 'progress', offset: 0, urls: ['start']},
    ], 'trackingEvent');
    expect(Parser.parseEnvelope(tracking, 'trackingEvent')).not.toBeNull();
    expect(Parser.parseEnvelope({payload: tracking.payload}, 'trackingEvent'))
        .not.toBeNull();
    expect(Parser.parseEnvelope(envelope([slot()]), 'trackingEvent'))
        .toBeNull();
    expect(Parser.parseEnvelope(envelope([{type: 'start', urls: [1]}],
        'trackingEvent'), 'trackingEvent')).toBeNull();
  });

  it('ignores invalid base64 and JSON null without throwing', () => {
    for (const data of ['!', btoa('null')]) {
      expect(Parser.parseMetadata({type: 'svta', startTime: 0, endTime: 10,
        values: [{key: 'X-AD-CREATIVE-SIGNALING', data}]})).toEqual(
          {interstitials: [], deferred: []});
    }
  });
});
