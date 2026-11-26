/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.VastInterstitialParser');

goog.require('shaka.ads.Utils');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.media.ManifestParser');
goog.require('shaka.util.MimeUtils');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.TextParser');
goog.require('shaka.util.TXml');


/**
 * A class responsible for parsing VAST/VMAP ad manifests into interstitials.
 */
shaka.ads.VastInterstitialParser = class {
  /**
   * @param {!shaka.extern.xml.Node} vast
   * @param {?number} currentTime
   * @return {!Promise<!Array<shaka.extern.AdInterstitial>>}
   */
  static async parseVastToInterstitials(vast, currentTime) {
    /** @type {!Array<shaka.extern.AdInterstitial>} */
    const interstitials = [];

    for (const ad of shaka.util.TXml.findChildren(vast, 'Ad')) {
      const adId = ad.attributes['id'] || null;
      const inline = shaka.util.TXml.findChild(ad, 'InLine');
      if (!inline) {
        continue;
      }
      const creatives = shaka.util.TXml.findChild(inline, 'Creatives');
      if (!creatives) {
        continue;
      }
      for (const creative of shaka.util.TXml.findChildren(creatives,
          'Creative')) {
        const linear = shaka.util.TXml.findChild(creative, 'Linear');
        if (linear) {
          const tracking = shaka.ads.Utils.createTrackingFromInline(inline);
          shaka.ads.VastInterstitialParser.processLinearAd_(
              interstitials, currentTime, linear, tracking, adId);
        }
        const nonLinearAds = shaka.util.TXml.findChild(creative,
            'NonLinearAds');
        if (nonLinearAds) {
          const nonLinears = shaka.util.TXml.findChildren(nonLinearAds,
              'NonLinear');
          for (const nonLinear of nonLinears) {
            // Keep interstitials in creative order.
            // eslint-disable-next-line no-await-in-loop
            const resource = await shaka.ads.VastInterstitialParser
                .selectNonLinearResource_(nonLinear);
            if (!resource) {
              continue;
            }
            const tracking = shaka.ads.Utils.createTrackingFromInline(inline);
            const trackingEvents =
                shaka.util.TXml.findChild(nonLinearAds, 'TrackingEvents');
            if (trackingEvents) {
              shaka.ads.Utils.processTrackingEvents(
                  shaka.util.TXml.getChildNodes(trackingEvents), tracking);
            }
            shaka.ads.VastInterstitialParser.processNonLinearAd_(
                interstitials, currentTime, nonLinear, resource, tracking,
                adId);
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
      interstitials.push(shaka.ads.Utils.createInterstitial({
        id: adId,
        startTime: startTime,
        uri: adUrl,
        mimeType: media.attributes['type'] || null,
        isSkippable: skipOffset != null,
        skipOffset,
        canJump: false,
        resumeOffset: 0,
        once: true,
        pre: currentTime == null,
        post: currentTime == Infinity,
        clickThroughUrl: clickThroughUrl,
        tracking: tracking,
      }));
      break;
    }
  }

  /**
   * @param {!Array<shaka.extern.AdInterstitial>} interstitials
   * @param {?number} currentTime
   * @param {!shaka.extern.xml.Node} nonLinear
   * @param {{uri: string, mimeType: string}} resource
   * @param {!shaka.extern.AdTrackingEvent} tracking
   * @param {?string} adId
   * @private
   */
  static processNonLinearAd_(interstitials, currentTime, nonLinear, resource,
      tracking, adId) {
    const TXml = shaka.util.TXml;
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
    interstitials.push(shaka.ads.Utils.createInterstitial({
      id: adId,
      startTime: startTime,
      uri: resource.uri,
      mimeType: resource.mimeType,
      canJump: false,
      resumeOffset: 0,
      playoutLimit,
      once: true,
      pre: currentTime == null,
      post: currentTime == Infinity,
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
      clickThroughUrl: clickThroughUrl,
      tracking: tracking,
    }));
  }

  /**
   * Selects one resource per creative, in document order within each type.
   * @param {!shaka.extern.xml.Node} nonLinear
   * @return {!Promise<?{uri: string, mimeType: string}>}
   * @private
   */
  static async selectNonLinearResource_(nonLinear) {
    const types = ['StaticResource', 'HTMLResource', 'IFrameResource'];
    for (const type of types) {
      for (const node of shaka.util.TXml.findChildren(nonLinear, type)) {
        const contents = shaka.util.TXml.getContents(node);
        if (!contents) {
          continue;
        }
        if (type == 'IFrameResource') {
          if (shaka.ads.Utils.isHttpOrRelativeUri(contents)) {
            return {uri: contents, mimeType: 'text/html'};
          }
          continue;
        }
        const creativeType = node.attributes['creativeType'] || '';
        const mimeType = shaka.util.MimeUtils.getBasicType(creativeType)
            .trim().toLowerCase();
        if (type == 'HTMLResource' || mimeType == 'text/html') {
          const uri = 'data:text/html;charset=UTF-8,' +
              encodeURIComponent(contents);
          return {uri, mimeType: 'text/html'};
        }
        if (mimeType.startsWith('image/')) {
          // eslint-disable-next-line no-await-in-loop
          if (await shaka.util.StreamUtils.isImageTypeSupported(mimeType)) {
            return {uri: contents, mimeType};
          }
        } else if (creativeType) {
          const device = shaka.device.DeviceFactory.getDevice();
          if (device.supportsMediaType(creativeType) ||
              shaka.media.ManifestParser.isSupported(mimeType)) {
            return {uri: contents, mimeType: creativeType};
          }
        }
      }
    }
    return null;
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
