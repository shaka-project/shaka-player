/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VastInterstitialParser', () => {
  const TXml = shaka.util.TXml;
  const VastInterstitialParser = shaka.ads.VastInterstitialParser;

  const linearVast = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<VAST version="3.0">',
    '<Ad id="5925573263">',
    '<InLine>',
    '<Error>error_url</Error>',
    '<Error>error_url2</Error>',
    '<Impression>impression_url</Impression>',
    '<Impression>impression_url2</Impression>',
    '<Creatives>',
    '<Creative id="138381721867" sequence="1">',
    '<Linear>',
    '<Duration>00:00:10</Duration>',
    '<TrackingEvents>',
    '<Tracking event="start">start_url</Tracking>',
    '<Tracking event="start">start_url2</Tracking>',
    '<Tracking event="firstQuartile">firstQuartile_url</Tracking>',
    '<Tracking event="midpoint">midpoint_url</Tracking>',
    '<Tracking event="thirdQuartile">thirdQuartile_url</Tracking>',
    '<Tracking event="complete">complete_url</Tracking>',
    '<Tracking event="skip">skip_url</Tracking>',
    '<Tracking event="resume">resume_url</Tracking>',
    '<Tracking event="pause">pause_url</Tracking>',
    '<Tracking event="mute">mute_url</Tracking>',
    '<Tracking event="unmute">unmute_url</Tracking>',
    '</TrackingEvents>',
    '<VideoClicks>',
    '<ClickThrough id="1">',
    '<![CDATA[ foo.bar ]]>',
    '</ClickThrough>',
    '<ClickTracking id="1">click_tracking</ClickTracking>',
    '</VideoClicks>',
    '<MediaFiles>',
    '<MediaFile bitrate="140" delivery="progressive" ',
    'height="360" type="video/mp4" width="640">',
    '<![CDATA[test.mp4]]>',
    '</MediaFile>',
    '</MediaFiles>',
    '</Linear>',
    '</Creative>',
    '</Creatives>',
    '</InLine>',
    '</Ad>',
    '</VAST>',
  ].join('');

  /**
   * @param {string} xmlString
   * @return {!shaka.extern.xml.Node}
   */
  function parseVast(xmlString) {
    const node = TXml.parseXmlString(xmlString, 'VAST');
    goog.asserts.assert(node, 'Should have a VAST node!');
    return node;
  }

  describe('parseVastToInterstitials', () => {
    it('parses a linear ad as a pre-roll when currentTime is null', () => {
      const interstitials = VastInterstitialParser.parseVastToInterstitials(
          parseVast(linearVast), /* currentTime= */ null);

      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: '5925573263',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'test.mp4',
        mimeType: 'video/mp4',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: false,
        resumeOffset: 0,
        playoutLimit: null,
        once: true,
        pre: true,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: 'foo.bar',
        tracking: {
          impression: ['impression_url', 'impression_url2'],
          clickTracking: ['click_tracking'],
          start: ['start_url', 'start_url2'],
          firstQuartile: ['firstQuartile_url'],
          midpoint: ['midpoint_url'],
          thirdQuartile: ['thirdQuartile_url'],
          complete: ['complete_url'],
          skip: ['skip_url'],
          error: ['error_url', 'error_url2'],
          resume: ['resume_url'],
          pause: ['pause_url'],
          mute: ['mute_url'],
          unmute: ['unmute_url'],
        },
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('uses currentTime as the start time for a mid-roll', () => {
      const interstitials = VastInterstitialParser.parseVastToInterstitials(
          parseVast(linearVast), /* currentTime= */ 5);

      expect(interstitials.length).toBe(1);
      expect(interstitials[0].startTime).toBe(5);
      expect(interstitials[0].pre).toBe(false);
      expect(interstitials[0].post).toBe(false);
    });

    it('parses a linear ad as a post-roll when currentTime is Infinity', () => {
      const interstitials = VastInterstitialParser.parseVastToInterstitials(
          parseVast(linearVast), /* currentTime= */ Infinity);

      expect(interstitials.length).toBe(1);
      expect(interstitials[0].pre).toBe(false);
      expect(interstitials[0].post).toBe(true);
    });

    it('parses a non-linear ad as an overlay', () => {
      const vast = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="3.0">',
        '<Ad id="5925573263">',
        '<InLine>',
        '<Error>error_url</Error>',
        '<Impression>impression_url</Impression>',
        '<Creatives>',
        '<Creative id="138381721867" sequence="1">',
        '<NonLinearAds>',
        '<TrackingEvents>',
        '<Tracking event="start">start_url</Tracking>',
        '<Tracking event="firstQuartile">firstQuartile_url</Tracking>',
        '<Tracking event="midpoint">midpoint_url</Tracking>',
        '<Tracking event="thirdQuartile">thirdQuartile_url</Tracking>',
        '<Tracking event="complete">complete_url</Tracking>',
        '<Tracking event="skip">skip_url</Tracking>',
        '<Tracking event="resume">resume_url</Tracking>',
        '<Tracking event="pause">pause_url</Tracking>',
        '<Tracking event="mute">mute_url</Tracking>',
        '<Tracking event="unmute">unmute_url</Tracking>',
        '</TrackingEvents>',
        '<NonLinear width="535" height="80" minSuggestedDuration="00:00:05">',
        '<StaticResource creativeType="image/png">',
        '<![CDATA[test.png]]>',
        '</StaticResource>',
        '<NonLinearClickThrough>',
        '<![CDATA[foo.bar]]>',
        '</NonLinearClickThrough>',
        '<NonLinearClickTracking>click_tracking</NonLinearClickTracking>',
        '</NonLinear>',
        '</NonLinearAds>',
        '</Creative>',
        '</Creatives>',
        '</InLine>',
        '</Ad>',
        '</VAST>',
      ].join('');

      const interstitials = VastInterstitialParser.parseVastToInterstitials(
          parseVast(vast), /* currentTime= */ null);

      expect(interstitials.length).toBe(1);
      /** @type {!shaka.extern.AdInterstitial} */
      const expectedInterstitial = {
        id: '5925573263',
        groupId: null,
        startTime: 0,
        endTime: null,
        uri: 'test.png',
        mimeType: 'image/png',
        isSkippable: false,
        skipOffset: null,
        skipFor: null,
        canJump: false,
        resumeOffset: 0,
        playoutLimit: 5,
        once: true,
        pre: true,
        post: false,
        timelineRange: false,
        loop: false,
        overlay: {
          viewport: {
            x: 0,
            y: 0,
          },
          topLeft: {
            x: 0,
            y: 0,
          },
          size: {
            x: 535,
            y: 80,
          },
        },
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: 'foo.bar',
        tracking: {
          impression: ['impression_url'],
          clickTracking: ['click_tracking'],
          start: ['start_url'],
          firstQuartile: ['firstQuartile_url'],
          midpoint: ['midpoint_url'],
          thirdQuartile: ['thirdQuartile_url'],
          complete: ['complete_url'],
          skip: ['skip_url'],
          error: ['error_url'],
          resume: ['resume_url'],
          pause: ['pause_url'],
          mute: ['mute_url'],
          unmute: ['unmute_url'],
        },
      };
      expect(interstitials[0]).toEqual(expectedInterstitial);
    });

    it('returns an empty array for an empty VAST', () => {
      const vast = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<VAST version="3.0">',
        '</VAST>',
      ].join('');

      const interstitials = VastInterstitialParser.parseVastToInterstitials(
          parseVast(vast), /* currentTime= */ null);
      expect(interstitials).toEqual([]);
    });
  });

  describe('parseVMAP', () => {
    it('parses ad breaks with start, mid and end offsets', () => {
      const vmap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap"',
        ' version="1.0">',
        '<vmap:AdBreak timeOffset="start" breakType="linear"',
        ' breakId="preroll">',
        '<vmap:AdSource id="preroll-ad-1" allowMultipleAds="false"',
        ' followRedirects="true">',
        '<vmap:AdTagURI templateType="vast3"><![CDATA[test:/preroll]]>',
        '</vmap:AdTagURI>',
        '</vmap:AdSource>',
        '</vmap:AdBreak>',
        '<vmap:AdBreak timeOffset="00:00:15.000" breakType="linear"',
        ' breakId="midroll-1">',
        '<vmap:AdSource id="midroll-1-ad-1" allowMultipleAds="false"',
        ' followRedirects="true">',
        '<vmap:AdTagURI templateType="vast3"><![CDATA[test:/midroll]]>',
        '</vmap:AdTagURI>',
        '</vmap:AdSource>',
        '</vmap:AdBreak>',
        '<vmap:AdBreak timeOffset="end" breakType="linear"',
        ' breakId="postroll">',
        '<vmap:AdSource id="postroll-ad-1" allowMultipleAds="false"',
        ' followRedirects="true">',
        '<vmap:AdTagURI templateType="vast3"><![CDATA[test:/postroll]]>',
        '</vmap:AdTagURI>',
        '</vmap:AdSource>',
        '</vmap:AdBreak>',
        '</vmap:VMAP>',
      ].join('');

      const node = TXml.parseXmlString(vmap, 'vmap:VMAP');
      goog.asserts.assert(node, 'Should have a VMAP node!');
      const ads = VastInterstitialParser.parseVMAP(node);
      expect(ads).toEqual([
        {time: null, uri: 'test:/preroll'},
        {time: 15, uri: 'test:/midroll'},
        {time: Infinity, uri: 'test:/postroll'},
      ]);
    });

    it('skips ad breaks without a time offset or ad tag URI', () => {
      const vmap = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<vmap:VMAP xmlns:vmap="http://www.iab.net/videosuite/vmap"',
        ' version="1.0">',
        '<vmap:AdBreak breakType="linear" breakId="no-offset">',
        '<vmap:AdSource>',
        '<vmap:AdTagURI templateType="vast3"><![CDATA[test:/vast]]>',
        '</vmap:AdTagURI>',
        '</vmap:AdSource>',
        '</vmap:AdBreak>',
        '<vmap:AdBreak timeOffset="start" breakType="linear"',
        ' breakId="no-source"/>',
        '</vmap:VMAP>',
      ].join('');

      const node = TXml.parseXmlString(vmap, 'vmap:VMAP');
      goog.asserts.assert(node, 'Should have a VMAP node!');
      expect(VastInterstitialParser.parseVMAP(node)).toEqual([]);
    });
  });
});
