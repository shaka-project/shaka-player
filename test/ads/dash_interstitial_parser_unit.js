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

    it('accepts overlay events with an OverlayEvent child', () => {
      const eventString = [
        '<Event>',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd"/>',
        '</Event>',
      ].join('');
      const dashEvent =
          makeRegion('urn:mpeg:dash:event:2012', eventString);
      expect(DashInterstitialParser.isInterstitialRegion(dashEvent)).toBe(true);

      const scteEvent =
          makeRegion('urn:scte:dash:scte214-events', eventString);
      expect(DashInterstitialParser.isInterstitialRegion(scteEvent)).toBe(true);
    });

    it('rejects overlay schemes without an OverlayEvent child', () => {
      const region = makeRegion(
          'urn:mpeg:dash:event:2012', '<Event><Other/></Event>');
      expect(DashInterstitialParser.isInterstitialRegion(region)).toBe(false);
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
      // The parser leaves mimeType null; the manager resolves it later.
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'PREROLL',
        groupId: null,
        startTime: 0,
        endTime: 1,
        uri: 'test.mpd',
        mimeType: null,
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
        mimeType: null,
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

    it('returns null for an alternative MPD without a URI', () => {
      const region = makeRegion(
          'urn:mpeg:dash:event:alternativeMPD:insert:2025',
          '<Event><InsertPresentation/></Event>');
      expect(DashInterstitialParser.parseRegion(region)).toBe(null);
    });

    it('parses a basic overlay event', () => {
      const eventString = [
        '<Event>',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd">',
        '<Viewport x="1920" y="1080"/>',
        '<Overlay>',
        '<TopLeft x="0" y="720"/>',
        '<Size x="480" y="360"/>',
        '</Overlay>',
        '</OverlayEvent>',
        '</Event>',
      ].join('');
      const region = makeRegion(
          'urn:mpeg:dash:event:2012', eventString, 0, 1, 1, 'OVERLAY');

      const interstitial = DashInterstitialParser.parseRegion(region);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: 'OVERLAY',
        groupId: null,
        startTime: 0,
        endTime: 1,
        uri: 'test.mpd',
        mimeType: 'application/dash+xml',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: true,
        resumeOffset: null,
        playoutLimit: null,
        once: false,
        pre: false,
        post: false,
        timelineRange: true,
        loop: false,
        overlay: {
          viewport: {
            x: 1920,
            y: 1080,
          },
          topLeft: {
            x: 0,
            y: 720,
          },
          size: {
            x: 480,
            y: 360,
          },
        },
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      };
      expect(interstitial).toEqual(expectedInterstitial);
    });

    it('parses an L-Shape overlay event (squeeze, z=-1)', () => {
      const eventString = [
        '<Event>',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd" z="-1">',
        '<Viewport x="1920" y="1080"/>',
        '<Squeeze>',
        '<TopLeft x="0" y="0"/>',
        '<Size x="960" y="540"/>',
        '</Squeeze>',
        '</OverlayEvent>',
        '</Event>',
      ].join('');
      const region = makeRegion(
          'urn:scte:dash:scte214-events', eventString, 0, 1, 1, 'OVERLAY');

      const interstitial = DashInterstitialParser.parseRegion(region);
      goog.asserts.assert(interstitial, 'Should parse an interstitial!');
      expect(interstitial.displayOnBackground).toBe(true);
      expect(interstitial.currentVideo).toEqual({
        viewport: {
          x: 1920,
          y: 1080,
        },
        topLeft: {
          x: 0,
          y: 0,
        },
        size: {
          x: 960,
          y: 540,
        },
      });
    });

    it('parses a double box overlay event (overlay, squeeze, background)',
        () => {
          const eventString = [
            '<Event>',
            '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd" ' +
                'z="-1">',
            '<Background>red</Background>',
            '<Viewport x="1920" y="1080"/>',
            '<Overlay>',
            '<TopLeft x="0" y="720"/>',
            '<Size x="480" y="360"/>',
            '</Overlay>',
            '<Squeeze>',
            '<TopLeft x="0" y="0"/>',
            '<Size x="960" y="540"/>',
            '</Squeeze>',
            '</OverlayEvent>',
            '</Event>',
          ].join('');
          const region = makeRegion(
              'urn:scte:dash:scte214-events', eventString, 0, 1, 1, 'OVERLAY');

          const interstitial = DashInterstitialParser.parseRegion(region);
          goog.asserts.assert(interstitial, 'Should parse an interstitial!');
          expect(interstitial.background).toBe('red');
          expect(interstitial.displayOnBackground).toBe(true);
          expect(interstitial.overlay).toEqual({
            viewport: {x: 1920, y: 1080},
            topLeft: {x: 0, y: 720},
            size: {x: 480, y: 360},
          });
          expect(interstitial.currentVideo).toEqual({
            viewport: {x: 1920, y: 1080},
            topLeft: {x: 0, y: 0},
            size: {x: 960, y: 540},
          });
        });

    it('returns null for an overlay event with z=0', () => {
      const eventString = [
        '<Event>',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd" z="0">',
        '<Viewport x="1920" y="1080"/>',
        '</OverlayEvent>',
        '</Event>',
      ].join('');
      const region = makeRegion(
          'urn:mpeg:dash:event:2012', eventString, 0, 1, 1, 'OVERLAY');
      expect(DashInterstitialParser.parseRegion(region)).toBe(null);
    });

    it('returns null for an overlay event with an invalid viewport', () => {
      const eventString = [
        '<Event>',
        '<OverlayEvent mimeType="application/dash+xml" uri="test.mpd">',
        '<Viewport y="1080"/>',
        '</OverlayEvent>',
        '</Event>',
      ].join('');
      const region = makeRegion(
          'urn:mpeg:dash:event:2012', eventString, 0, 1, 1, 'OVERLAY');
      expect(DashInterstitialParser.parseRegion(region)).toBe(null);
    });
  });
});
