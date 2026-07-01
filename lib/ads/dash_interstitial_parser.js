/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.DashInterstitialParser');

goog.require('goog.asserts');
goog.require('shaka.log');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.URL');


/**
 * A class responsible for parsing DASH alternative MPD and overlay event
 * regions into interstitials.
 */
shaka.ads.DashInterstitialParser = class {
  /**
   * Whether the given DASH region is an interstitial handled by this parser:
   * an alternative-MPD insert/replace event, or an overlay event.
   *
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {boolean}
   */
  static isInterstitialRegion(region) {
    if (shaka.ads.DashInterstitialParser.isAlternativeMpd_(region)) {
      return true;
    }
    const schemeIdUri = region.schemeIdUri;
    return (schemeIdUri == 'urn:mpeg:dash:event:2012' ||
        schemeIdUri == 'urn:scte:dash:scte214-events') &&
        !!region.eventNode &&
        !!shaka.util.TXml.findChild(region.eventNode, 'OverlayEvent');
  }

  /**
   * Parses a DASH interstitial region (alternative MPD or overlay event) into
   * an interstitial. Returns null if the region is not a valid interstitial.
   * Callers should gate this with isInterstitialRegion.
   *
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {?shaka.extern.AdInterstitial}
   */
  static parseRegion(region) {
    if (shaka.ads.DashInterstitialParser.isAlternativeMpd_(region)) {
      return shaka.ads.DashInterstitialParser.parseAlternativeMpd_(region);
    }
    return shaka.ads.DashInterstitialParser.parseOverlay_(region);
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {boolean}
   * @private
   */
  static isAlternativeMpd_(region) {
    return region.schemeIdUri ==
            'urn:mpeg:dash:event:alternativeMPD:insert:2025' ||
        region.schemeIdUri ==
            'urn:mpeg:dash:event:alternativeMPD:replace:2025';
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

    /** @type {!shaka.extern.AdInterstitial} */
    const interstitial = {
      id: region.id,
      groupId: null,
      startTime,
      endTime,
      uri: interstitialUri,
      mimeType: null,
      isSkippable: skipOffset != null,
      skipOffset: skipOffset,
      skipFor: null,
      canJump: canJump,
      resumeOffset: isInsert ? resumeOffset : null,
      playoutLimit,
      once: false,
      pre: false,
      post: false,
      timelineRange: isReplace && !isInsert,
      loop: false,
      overlay: null,
      displayOnBackground: false,
      currentVideo: null,
      background: null,
      clickThroughUrl: null,
      tracking: null,
    };
    if (resolutionTimeOffset != null) {
      interstitial.resolutionTimeOffset = resolutionTimeOffset;
    }
    return interstitial;
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {?shaka.extern.AdInterstitial}
   * @private
   */
  static parseOverlay_(region) {
    const TXml = shaka.util.TXml;

    goog.asserts.assert(region.eventNode, 'Need a region eventNode');
    const overlayEvent = TXml.findChild(region.eventNode, 'OverlayEvent');
    const uri = overlayEvent.attributes['uri'];
    const mimeType = overlayEvent.attributes['mimeType'];
    const loop = overlayEvent.attributes['loop'] == 'true';
    const z = TXml.parseAttr(overlayEvent, 'z', TXml.parseInt);
    if (!uri || z == 0) {
      shaka.log.warning('Unsupported OverlayEvent', region);
      return null;
    }

    let background = null;
    const backgroundElement = TXml.findChild(overlayEvent, 'Background');
    if (backgroundElement) {
      const backgroundUri = backgroundElement.attributes['uri'];
      if (backgroundUri) {
        background = `center / contain no-repeat url('${backgroundUri}')`;
      } else {
        background = TXml.getContents(backgroundElement);
      }
    }

    const viewport = {
      x: 1920,
      y: 1080,
    };

    const viewportElement = TXml.findChild(overlayEvent, 'Viewport');
    if (viewportElement) {
      const viewportX = TXml.parseAttr(viewportElement, 'x', TXml.parseInt);
      if (viewportX == null) {
        shaka.log.warning('Unsupported OverlayEvent', region);
        return null;
      }
      const viewportY = TXml.parseAttr(viewportElement, 'y', TXml.parseInt);
      if (viewportY == null) {
        shaka.log.warning('Unsupported OverlayEvent', region);
        return null;
      }
      viewport.x = viewportX;
      viewport.y = viewportY;
    }

    /** @type {!shaka.extern.AdPositionInfo} */
    const overlay = {
      viewport: {
        x: viewport.x,
        y: viewport.y,
      },
      topLeft: {
        x: 0,
        y: 0,
      },
      size: {
        x: viewport.x,
        y: viewport.y,
      },
    };

    const overlayElement = TXml.findChild(overlayEvent, 'Overlay');
    if (viewportElement && overlayElement) {
      const topLeft = TXml.findChild(overlayElement, 'TopLeft');
      const size = TXml.findChild(overlayElement, 'Size');
      if (topLeft && size) {
        const parsed =
            shaka.ads.DashInterstitialParser.parseTopLeftSize_(topLeft, size);
        if (!parsed) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return null;
        }
        overlay.topLeft = parsed.topLeft;
        overlay.size = parsed.size;
      }
    }
    let currentVideo = null;
    const squeezeElement = TXml.findChild(overlayEvent, 'Squeeze');
    if (viewportElement && squeezeElement) {
      const topLeft = TXml.findChild(squeezeElement, 'TopLeft');
      const size = TXml.findChild(squeezeElement, 'Size');
      if (topLeft && size) {
        const parsed =
            shaka.ads.DashInterstitialParser.parseTopLeftSize_(topLeft, size);
        if (!parsed) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return null;
        }
        currentVideo = {
          viewport: {
            x: viewport.x,
            y: viewport.y,
          },
          topLeft: parsed.topLeft,
          size: parsed.size,
        };
      }
    }

    /** @type {!shaka.extern.AdInterstitial} */
    const interstitial = {
      id: region.id,
      groupId: null,
      startTime: region.startTime,
      endTime: region.endTime,
      uri,
      mimeType,
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
      loop,
      overlay,
      displayOnBackground: z == -1,
      currentVideo,
      background,
      clickThroughUrl: null,
      tracking: null,
    };
    return interstitial;
  }

  /**
   * Parses the integer x/y attributes of TopLeft and Size nodes (used by DASH
   * overlay events). Returns null if any coordinate is missing or invalid.
   *
   * @param {!shaka.extern.xml.Node} topLeft
   * @param {!shaka.extern.xml.Node} size
   * @return {?{topLeft: {x: number, y: number}, size: {x: number, y: number}}}
   * @private
   */
  static parseTopLeftSize_(topLeft, size) {
    const TXml = shaka.util.TXml;
    const topLeftX = TXml.parseAttr(topLeft, 'x', TXml.parseInt);
    const topLeftY = TXml.parseAttr(topLeft, 'y', TXml.parseInt);
    const sizeX = TXml.parseAttr(size, 'x', TXml.parseInt);
    const sizeY = TXml.parseAttr(size, 'y', TXml.parseInt);
    if (topLeftX == null || topLeftY == null ||
        sizeX == null || sizeY == null) {
      return null;
    }
    return {
      topLeft: {x: topLeftX, y: topLeftY},
      size: {x: sizeX, y: sizeY},
    };
  }
};
