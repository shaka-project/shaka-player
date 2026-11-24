/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.DashInterstitialParser');

goog.require('shaka.ads.Utils');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.URL');


/**
 * A class responsible for parsing DASH alternative MPD event regions into
 * interstitials.
 */
shaka.ads.DashInterstitialParser = class {
  /**
   * Whether the given DASH region is an interstitial handled by this parser:
   * an alternative-MPD insert/replace event.
   *
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {boolean}
   */
  static isInterstitialRegion(region) {
    return region.schemeIdUri ==
            'urn:mpeg:dash:event:alternativeMPD:insert:2025' ||
        region.schemeIdUri ==
            'urn:mpeg:dash:event:alternativeMPD:replace:2025';
  }

  /**
   * Parses a DASH interstitial region (alternative MPD) into an interstitial.
   * Returns null if the region is not a valid interstitial. Callers should
   * gate this with isInterstitialRegion.
   *
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {?shaka.extern.AdInterstitial}
   */
  static parseRegion(region) {
    return shaka.ads.DashInterstitialParser.parseAlternativeMpd_(region);
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {?shaka.extern.AdInterstitial}
   * @private
   */
  static parseAlternativeMpd_(region) {
    const TXml = shaka.util.TXml;
    const isReplace =
        region.schemeIdUri == 'urn:mpeg:dash:event:alternativeMPD:replace:2025';
    const isInsert =
        region.schemeIdUri == 'urn:mpeg:dash:event:alternativeMPD:insert:2025';
    if (!isReplace && !isInsert) {
      shaka.log.warning('Unsupported alternative media presentation', region);
      return null;
    }

    const startTime = region.startTime;
    let endTime = region.endTime;
    let playoutLimit = null;
    let resumeOffset = 0;
    let interstitialUri;
    let canJump = true;
    let skipOffset = null;
    let resolutionTimeOffset = null;
    // AlternativeMPDEventType@executeOnce: once it has started playing, the
    // event is never executed again (ISO/IEC 23009-1:2026, 5.16.2.2.3).
    let once = false;
    // ReplacePresentation@clip and @startWithOffset (ISO/IEC 23009-1:2026,
    // 5.16.2.2.6), with the defaults of the schema.
    let clip = true;
    let startWithOffset = false;
    for (const node of region.eventNode.children) {
      if (node.tagName == 'AlternativeMPD') {
        const uri = node.attributes['uri'];
        if (uri) {
          interstitialUri = uri;
          break;
        }
      } else if (node.tagName == 'InsertPresentation' ||
          node.tagName == 'ReplacePresentation') {
        const uri = node.attributes['uri'] || node.attributes['url'];
        if (uri) {
          interstitialUri = shaka.util.StringUtils.htmlUnescape(uri);
          const unscaledMaxDuration =
              TXml.parseAttr(node, 'maxDuration', TXml.parseInt);
          if (unscaledMaxDuration) {
            playoutLimit = unscaledMaxDuration / region.timescale;
          }
          const unscaledReturnOffset =
              TXml.parseAttr(node, 'returnOffset', TXml.parseInt);
          if (unscaledReturnOffset) {
            resumeOffset = unscaledReturnOffset / region.timescale;
          }
          if (isReplace && resumeOffset) {
            endTime = startTime + resumeOffset;
          }
          if (isReplace) {
            clip = TXml.parseAttr(node, 'clip', TXml.parseBoolean) !== false;
            startWithOffset =
                !!TXml.parseAttr(node, 'startWithOffset', TXml.parseBoolean);
          }
          once = !!TXml.parseAttr(node, 'executeOnce', TXml.parseBoolean);
          const noJump = TXml.parseAttr(node, 'noJump', TXml.parseInt);
          if (noJump) {
            canJump = false;
          }
          const skipAfter =
              TXml.parseAttr(node, 'skipAfter', TXml.parseDuration);
          if (typeof skipAfter == 'number') {
            skipOffset = skipAfter;
          }
          const unscaledResolutionOffset = TXml.parseAttr(
              node, 'earliestResolutionTimeOffset', TXml.parseFloat);
          if (unscaledResolutionOffset) {
            resolutionTimeOffset = unscaledResolutionOffset / region.timescale;
          }
          break;
        }
      }
    }
    if (!interstitialUri) {
      shaka.log.warning('Unsupported alternative media presentation', region);
      return null;
    }

    interstitialUri =
        shaka.util.URL.applyUrlParams(interstitialUri, region.urlParams);
    // An alternative MPD is an MPD, whatever its URI looks like, so there is no
    // need to ask the server (e.g. an ad decision endpoint without a file
    // extension). A known extension still wins.
    const mimeType =
        shaka.net.NetworkingUtils.getMimeTypeFromUri(interstitialUri) ||
        'application/dash+xml';

    /** @type {!shaka.extern.AdInterstitial} */
    const interstitial = shaka.ads.Utils.createInterstitial({
      id: region.id,
      startTime,
      endTime,
      uri: interstitialUri,
      mimeType,
      isSkippable: skipOffset != null,
      skipOffset: skipOffset,
      canJump: canJump,
      resumeOffset: isInsert ? resumeOffset : null,
      playoutLimit,
      once,
      timelineRange: isReplace && !isInsert,
    });
    if (resolutionTimeOffset != null) {
      interstitial.resolutionTimeOffset = resolutionTimeOffset;
    }
    if (isReplace) {
      interstitial.clip = clip;
      interstitial.startWithOffset = startWithOffset;
    }
    if (region.urlParams) {
      // The player state parameters of the request are only known when the
      // event is executed, so the URI is requested with its parameters built
      // again at that time.
      interstitial.urlParams = region.urlParams;
    }
    return interstitial;
  }
};
