/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.VastInterstitialParser');

goog.require('shaka.ads.Utils');
goog.require('shaka.util.TextParser');
goog.require('shaka.util.TXml');


/**
 * A class responsible for parsing VAST/VMAP ad manifests into interstitials.
 */
shaka.ads.VastInterstitialParser = class {
  /**
   * @param {!shaka.extern.xml.Node} vast
   * @param {?number} currentTime
   * @return {!Array<shaka.extern.AdInterstitial>}
   */
  static parseVastToInterstitials(vast, currentTime) {
    const TXml = shaka.util.TXml;
    /** @type {!Array<shaka.extern.AdInterstitial>} */
    const interstitials = [];

    for (const ad of TXml.findChildren(vast, 'Ad')) {
      const adId = ad.attributes['id'] || null;
      const inline = TXml.findChild(ad, 'InLine');
      if (!inline) {
        continue;
      }
      const creatives = TXml.findChild(inline, 'Creatives');
      if (!creatives) {
        continue;
      }
      for (const creative of TXml.findChildren(creatives, 'Creative')) {
        const linear = TXml.findChild(creative, 'Linear');
        if (linear) {
          const tracking = shaka.ads.Utils.createTrackingFromInline(inline);
          shaka.ads.VastInterstitialParser.processLinearAd_(
              interstitials, currentTime, linear, tracking, adId);
        }
        const nonLinearAds = TXml.findChild(creative, 'NonLinearAds');
        if (nonLinearAds) {
          const nonLinears = TXml.findChildren(nonLinearAds, 'NonLinear');
          for (const nonLinear of nonLinears) {
            const tracking = shaka.ads.Utils.createTrackingFromInline(inline);
            const trackingEvents =
                TXml.findChild(nonLinearAds, 'TrackingEvents');
            if (trackingEvents) {
              shaka.ads.Utils.processTrackingEvents(
                  TXml.getChildNodes(trackingEvents), tracking);
            }
            shaka.ads.VastInterstitialParser.processNonLinearAd_(
                interstitials, currentTime, nonLinear, tracking, adId);
          }
        }
      }
    }
    return interstitials;
  }

  /**
   * @param {!Array<shaka.extern.AdInterstitial>} interstitials
   * @param {?number} currentTime
   * @param {!shaka.extern.xml.Node} linear
   * @param {!shaka.extern.AdTrackingEvent} tracking
   * @param {?string} adId
   * @private
   */
  static processLinearAd_(interstitials, currentTime, linear, tracking, adId) {
    const TXml = shaka.util.TXml;
    let startTime = 0;
    if (currentTime != null) {
      startTime = currentTime;
    }
    let skipOffset = null;
    if (linear.attributes['skipoffset']) {
      skipOffset = shaka.util.TextParser.parseTime(
          linear.attributes['skipoffset']);
      if (isNaN(skipOffset)) {
        skipOffset = null;
      }
    }
    const mediaFiles = TXml.findChild(linear, 'MediaFiles');
    if (!mediaFiles) {
      return;
    }
    let clickThroughUrl = null;
    const videoClicks = TXml.findChild(linear, 'VideoClicks');
    if (videoClicks) {
      const clickThroughElement = TXml.findChild(videoClicks, 'ClickThrough');
      if (clickThroughElement) {
        const clickUrl = TXml.getContents(clickThroughElement);
        if (clickUrl) {
          clickThroughUrl = clickUrl;
        }
      }
      for (const element of TXml.findChildren(videoClicks, 'ClickTracking')) {
        const url = TXml.getTextContents(element);
        if (url) {
          if (!tracking.clickTracking) {
            tracking.clickTracking = [];
          }
          tracking.clickTracking.push(url);
        }
      }
    }
    const trackingEvents =
        TXml.findChild(linear, 'TrackingEvents');
    if (trackingEvents) {
      shaka.ads.Utils.processTrackingEvents(
          TXml.getChildNodes(trackingEvents), tracking);
    }
    const medias = TXml.findChildren(mediaFiles, 'MediaFile');
    let checkMedias = medias;
    const streamingMedias = medias.filter((media) => {
      return media.attributes['delivery'] == 'streaming';
    });
    if (streamingMedias.length) {
      checkMedias = streamingMedias;
    }
    const sortedMedias = checkMedias.sort((a, b) => {
      const aHeight = parseInt(a.attributes['height'], 10) || 0;
      const bHeight = parseInt(b.attributes['height'], 10) || 0;
      return bHeight - aHeight;
    });
    for (const media of sortedMedias) {
      if (media.attributes['apiFramework']) {
        continue;
      }
      const adUrl = TXml.getContents(media);
      if (!adUrl) {
        continue;
      }
      interstitials.push({
        id: adId,
        groupId: null,
        startTime: startTime,
        endTime: null,
        uri: adUrl,
        mimeType: media.attributes['type'] || null,
        isSkippable: skipOffset != null,
        skipOffset,
        skipFor: null,
        canJump: false,
        resumeOffset: 0,
        playoutLimit: null,
        once: true,
        pre: currentTime == null,
        post: currentTime == Infinity,
        timelineRange: false,
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: clickThroughUrl,
        tracking: tracking,
      });
      break;
    }
  }

  /**
   * @param {!Array<shaka.extern.AdInterstitial>} interstitials
   * @param {?number} currentTime
   * @param {!shaka.extern.xml.Node} nonLinear
   * @param {!shaka.extern.AdTrackingEvent} tracking
   * @param {?string} adId
   * @private
   */
  static processNonLinearAd_(interstitials, currentTime, nonLinear, tracking,
      adId) {
    const TXml = shaka.util.TXml;
    let mimeType = null;
    let resource = TXml.findChild(nonLinear, 'StaticResource');
    if (resource) {
      mimeType = resource.attributes['creativeType'];
    } else {
      resource = TXml.findChild(nonLinear, 'HTMLResource');
      if (!resource) {
        return;
      }
      mimeType = 'text/html';
    }
    let adUrl = TXml.getContents(resource);
    if (!adUrl) {
      return;
    }
    if (mimeType === 'text/html') {
      adUrl = 'data:text/html;charset=UTF-8,' + encodeURIComponent(adUrl);
    }
    const width = TXml.parseAttr(nonLinear, 'width', TXml.parseInt) ||
        TXml.parseAttr(nonLinear, 'expandedWidth', TXml.parseInt);
    const height = TXml.parseAttr(nonLinear, 'height', TXml.parseInt) ||
        TXml.parseAttr(nonLinear, 'expandedHeight', TXml.parseInt);
    if (!width && !height) {
      return;
    }
    let clickThroughUrl = null;
    const nonLinearClickThrough =
        TXml.findChild(nonLinear, 'NonLinearClickThrough');
    if (nonLinearClickThrough) {
      const clickUrl = TXml.getContents(nonLinearClickThrough);
      if (clickUrl) {
        clickThroughUrl = clickUrl;
      }
    }
    for (const elm of TXml.findChildren(nonLinear, 'NonLinearClickTracking')) {
      const url = TXml.getTextContents(elm);
      if (url) {
        if (!tracking.clickTracking) {
          tracking.clickTracking = [];
        }
        tracking.clickTracking.push(url);
      }
    }
    let playoutLimit = null;
    const minSuggestedDuration =
        nonLinear.attributes['minSuggestedDuration'];
    if (minSuggestedDuration) {
      playoutLimit = shaka.util.TextParser.parseTime(minSuggestedDuration);
    }
    let startTime = 0;
    if (currentTime != null) {
      startTime = currentTime;
    }
    interstitials.push({
      id: adId,
      groupId: null,
      startTime: startTime,
      endTime: null,
      uri: adUrl,
      mimeType,
      isSkippable: false,
      skipOffset: null,
      skipFor: null,
      canJump: false,
      resumeOffset: 0,
      playoutLimit,
      once: true,
      pre: currentTime == null,
      post: currentTime == Infinity,
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
          x: width || 0,
          y: height || 0,
        },
      },
      displayOnBackground: false,
      currentVideo: null,
      background: null,
      clickThroughUrl: clickThroughUrl,
      tracking: tracking,
    });
  }

  /**
   * @param {!shaka.extern.xml.Node} vmap
   * @return {!Array<{time: ?number, uri: string}>}
   */
  static parseVMAP(vmap) {
    const TXml = shaka.util.TXml;
    /** @type {!Array<{time: ?number, uri: string}>} */
    const ads = [];
    for (const adBreak of TXml.findChildren(vmap, 'vmap:AdBreak')) {
      const timeOffset = adBreak.attributes['timeOffset'];
      if (!timeOffset) {
        continue;
      }
      let time = null;
      if (timeOffset == 'start') {
        time = null;
      } else if (timeOffset == 'end') {
        time = Infinity;
      } else {
        time = shaka.util.TextParser.parseTime(timeOffset);
      }
      const adSource = TXml.findChild(adBreak, 'vmap:AdSource');
      if (!adSource) {
        continue;
      }
      const adTagURI = TXml.findChild(adSource, 'vmap:AdTagURI');
      if (!adTagURI) {
        continue;
      }
      const uri = TXml.getTextContents(adTagURI);
      if (!uri) {
        continue;
      }
      ads.push({
        time,
        uri,
      });
    }
    return ads;
  }
};
