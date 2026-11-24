/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DashInterstitialParser', () => {
  const TXml = shaka.util.TXml;
  const DashInterstitialParser = shaka.ads.DashInterstitialParser;

  /**
   * @param {string} schemeIdUri
   * @param {string} eventString
   * @param {number=} startTime
   * @param {number=} endTime
   * @param {number=} timescale
   * @param {string=} id
   * @return {shaka.extern.TimelineRegionInfo}
   */
  function makeRegion(schemeIdUri, eventString, startTime = 0, endTime = 1,
      timescale = 1, id = 'TEST') {
    const eventNode = TXml.parseXmlString(eventString);
    goog.asserts.assert(eventNode, 'Should have an event node!');
    return {
      startTime,
      endTime,
      id,
      schemeIdUri,
      eventNode,
      value: '',
      timescale,
    };
  }

  describe('isInterstitialRegion', () => {
    it('accepts alternative MPD insert/replace events', () => {
      const insert = makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation uri="test.mpd"/></Event>');
      expect(DashInterstitialParser.isInterstitialRegion(insert)).toBe(true);

      const replace = makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:replace:2025',
          '<Event><ReplacePresentation uri="test.mpd"/></Event>');
      expect(DashInterstitialParser.isInterstitialRegion(replace)).toBe(true);
    });

    it('rejects overlay events', () => {
      const eventString = [
        '<Event>',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd"/>',
        '</Event>',
      ].join('');
      const dashEvent =
          makeRegion('urn:mpeg:dash:event:2012', eventString);
      expect(DashInterstitialParser.isInterstitialRegion(dashEvent))
          .toBe(false);

      const scteEvent =
          makeRegion('urn:scte:dash:scte214-events', eventString);
      expect(DashInterstitialParser.isInterstitialRegion(scteEvent))
          .toBe(false);
    });

    it('rejects unrelated schemes', () => {
      const region = makeRegion(
          'urn:svta:advertising-wg:ad-creative-signaling',
          '<Event><Other/></Event>');
      expect(DashInterstitialParser.isInterstitialRegion(region)).toBe(false);
    });
  });

  describe('parseRegion', () => {
    it('parses a basic alternative MPD insert event', () => {
      const region = makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation uri="test.mpd"/></Event>',
          /* startTime= */ 0, /* endTime= */ 1, /* timescale= */ 1,
          /* id= */ 'PREROLL');

      const interstitial = DashInterstitialParser.parseRegion(region);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'PREROLL',
        groupId: null,
        startTime: 0,
        endTime: 1,
        uri: 'test.mpd',
        mimeType: 'application/dash+xml',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: true,
        resumeOffset: 0,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitial).toEqual(expectedInterstitial);
    });

    it('parses alternative MPD with noJump and skipAfter', () => {
      const region = makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation uri="test.mpd" noJump="1" ' +
              'skipAfter="PT0S"/></Event>',
          /* startTime= */ 1, /* endTime= */ 2);

      const interstitial = DashInterstitialParser.parseRegion(region);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'TEST',
        groupId: null,
        startTime: 1,
        endTime: 2,
        uri: 'test.mpd',
        mimeType: 'application/dash+xml',
        isSkippable: true,
        skipOffset: 0,
        skipFor: null,
        canJump: false,
        resumeOffset: 0,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitial).toEqual(expectedInterstitial);
    });

    it('parses alternative MPD replace event with returnOffset', () => {
      const region = makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:replace:2025',
          '<Event><ReplacePresentation uri="test.mpd" returnOffset="1"/>' +
              '</Event>');

      const interstitial = DashInterstitialParser.parseRegion(region);
      goog.asserts.assert(interstitial, 'Should parse an interstitial!');
      expect(interstitial.uri).toBe('test.mpd');
      // For replace events resumeOffset is null and the range occupies the
      // timeline; the end time is shifted by the return offset.
      expect(interstitial.resumeOffset).toBe(null);
      expect(interstitial.timelineRange).toBe(true);
      expect(interstitial.endTime).toBe(1);
    });

    it('parses clip and startWithOffset of a replace event', () => {
      const defaults = DashInterstitialParser.parseRegion(makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:replace:2025',
          '<Event><ReplacePresentation uri="test.mpd"/></Event>'));
      goog.asserts.assert(defaults, 'Should parse an interstitial!');
      expect(defaults.clip).toBe(true);
      expect(defaults.startWithOffset).toBe(false);

      const explicit = DashInterstitialParser.parseRegion(makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:replace:2025',
          '<Event><ReplacePresentation uri="test.mpd" clip="false" ' +
              'startWithOffset="true"/></Event>'));
      goog.asserts.assert(explicit, 'Should parse an interstitial!');
      expect(explicit.clip).toBe(false);
      expect(explicit.startWithOffset).toBe(true);
    });

    it('parses executeOnce of alternative MPD events', () => {
      const byDefault = DashInterstitialParser.parseRegion(makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:replace:2025',
          '<Event><ReplacePresentation uri="test.mpd"/></Event>'));
      goog.asserts.assert(byDefault, 'Should parse an interstitial!');
      expect(byDefault.once).toBe(false);

      const replace = DashInterstitialParser.parseRegion(makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:replace:2025',
          '<Event><ReplacePresentation uri="test.mpd" executeOnce="true"/>' +
              '</Event>'));
      goog.asserts.assert(replace, 'Should parse an interstitial!');
      expect(replace.once).toBe(true);

      const insert = DashInterstitialParser.parseRegion(makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation uri="test.mpd" executeOnce="true"/>' +
              '</Event>'));
      goog.asserts.assert(insert, 'Should parse an interstitial!');
      expect(insert.once).toBe(true);
    });

    it('leaves clip and startWithOffset unset for an insert event', () => {
      const interstitial = DashInterstitialParser.parseRegion(makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation uri="test.mpd"/></Event>'));
      goog.asserts.assert(interstitial, 'Should parse an interstitial!');
      expect(interstitial.clip).toBeUndefined();
      expect(interstitial.startWithOffset).toBeUndefined();
    });

    it('parses earliestResolutionTimeOffset scaled by the timescale', () => {
      const region = makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation uri="test.mpd" ' +
              'earliestResolutionTimeOffset="20"/></Event>',
          /* startTime= */ 10, /* endTime= */ 12, /* timescale= */ 2);

      const interstitial = DashInterstitialParser.parseRegion(region);
      goog.asserts.assert(interstitial, 'Should parse an interstitial!');
      // 20 (in timescale units) / timescale(2) = 10 seconds.
      expect(interstitial.resolutionTimeOffset).toBe(10);
    });

    it('assumes an MPD for an alternative MPD URI without extension', () => {
      const interstitial = DashInterstitialParser.parseRegion(makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:replace:2025',
          '<Event><ReplacePresentation uri="https://ads.test/sgai/ads?b=1"/>' +
              '</Event>'));
      goog.asserts.assert(interstitial, 'Should parse an interstitial!');
      expect(interstitial.mimeType).toBe('application/dash+xml');
    });

    it('takes the MIME type of a known alternative MPD URI extension', () => {
      const interstitial = DashInterstitialParser.parseRegion(makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation uri="https://ads.test/ad.m3u8"/>' +
              '</Event>'));
      goog.asserts.assert(interstitial, 'Should parse an interstitial!');
      expect(interstitial.mimeType).toBe('application/x-mpegurl');
    });

    it('returns null for an alternative MPD without a URI', () => {
      const region = makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation/></Event>');
      expect(DashInterstitialParser.parseRegion(region)).toBe(null);
    });
  });
});
