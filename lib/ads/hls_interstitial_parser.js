/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.HlsInterstitialParser');

goog.require('shaka.ads.SvtaInterstitialParser');
goog.require('shaka.ads.Utils');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.NumberUtils');
goog.require('shaka.util.URL');


/**
 * Interprets HLS interstitial metadata without playing media. The static
 * methods are pure; an instance holds the state of the current asset (the
 * playback session ID and the Date Ranges already seen).
 */
shaka.ads.HlsInterstitialParser = class {
  constructor() {
    /** @private {?string} */
    this.sessionId_ = null;
    /** @private {!Set<string>} */
    this.metadataIds_ = new Set();
  }

  /**
   * Converts a metadata frame into what the interstitial manager must
   * schedule or update. Insertion (HLS interstitials) and measurement (SVTA)
   * can be enabled independently.
   *
   * @param {shaka.extern.HLSMetadata} metadata
   * @param {boolean} isLive
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @param {boolean} insertion Whether HLS interstitials are enabled.
   * @param {boolean} measurement Whether SVTA signaling is enabled.
   * @return {!shaka.ads.HlsInterstitialParser.Result}
   */
  parse(metadata, isLive, networkingEngine, insertion, measurement) {
    const Parser = shaka.ads.HlsInterstitialParser;
    const SvtaParser = shaka.ads.SvtaInterstitialParser;
    /** @type {!shaka.ads.HlsInterstitialParser.Result} */
    const result = {
      interstitials: [],
      deferred: [],
      playoutLimitUpdate: null,
      preloadHint: null,
    };
    const svta = measurement && SvtaParser.isValidMetadata(metadata);
    const parseSvta = () => {
      const parsed = SvtaParser.parseMetadata(metadata, networkingEngine);
      result.interstitials = parsed.interstitials;
      result.deferred = parsed.deferred;
      return result;
    };
    if (metadata.type == 'com.apple.hls.preload') {
      // RFC 8216bis Appendix F: the target's resources may be resolved from
      // the start of this Date Range on.
      const targetId = Parser.getMetadataValue(metadata, 'X-TARGET-ID');
      if (insertion && targetId) {
        result.preloadHint = {targetId, startTime: metadata.startTime};
      }
      return result;
    }
    if (!insertion || !Parser.isInterstitialMetadata(metadata)) {
      // Embedded measurement is independent of disabling insertions.
      return svta ? parseSvta() : result;
    }
    const id = Parser.getMetadataValue(metadata, 'ID');
    // A subsequent EXT-X-DATERANGE with the same ID augments the existing
    // Date Range with additional attributes (RFC 8216bis Section 4.4.5.1).
    const limit = parseFloat(
        Parser.getMetadataValue(metadata, 'X-PLAYOUT-LIMIT') || '');
    if (id && Number.isFinite(limit)) {
      result.playoutLimitUpdate = {id, playoutLimit: limit};
    }
    if (id && this.metadataIds_.has(id)) {
      return result;
    }
    const parsed = Parser.parseMetadata(metadata, isLive);
    if (!parsed.interstitials.length && !parsed.assetList) {
      // Native HLS groups date-range attributes under its legacy metadata
      // type, including SVTA slots already embedded in the stream.
      return svta ? parseSvta() : result;
    }
    if (id) {
      this.metadataIds_.add(id);
    }
    if (!this.sessionId_) {
      this.sessionId_ = window.crypto.randomUUID();
    }
    const sessionId = this.sessionId_;
    const signaling = svta ? SvtaParser.decodeMetadata(metadata) : null;
    for (const interstitial of parsed.interstitials) {
      interstitial.uri = Parser.getUriWithParams(
          interstitial.uri || '', sessionId);
      SvtaParser.decorateInterstitial(interstitial, signaling);
    }
    result.interstitials = parsed.interstitials;
    if (parsed.assetList) {
      result.deferred.push(Parser.createDeferredInterstitial(
          parsed.assetList, networkingEngine, sessionId));
    }
    return result;
  }

  /**
   * @param {shaka.extern.HLSMetadata} metadata
   * @return {boolean}
   */
  static isInterstitialMetadata(metadata) {
    const Parser = shaka.ads.HlsInterstitialParser;
    const hasAsset = Parser.getMetadataValue(metadata, 'X-ASSET-URI') != null ||
        Parser.getMetadataValue(metadata, 'X-ASSET-LIST') != null;
    return metadata.type == 'com.apple.hls.interstitial' ||
        metadata.type == 'com.apple.quicktime.HLS' ||
        (hasAsset &&
        shaka.ads.SvtaInterstitialParser.isValidMetadata(metadata));
  }

  /**
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @param {boolean} isLive
   * @return {!shaka.ads.HlsInterstitialParser.ParsedMetadata}
   */
  static parseMetadata(hlsMetadata, isLive) {
    const Parser = shaka.ads.HlsInterstitialParser;
    const NumberUtils = shaka.util.NumberUtils;

    const interstitialsAd = [];
    const result = {interstitials: interstitialsAd, assetList: null};
    if (Parser.getMetadataValue(hlsMetadata, 'X-OVERLAY-ID') != null) {
      result.interstitials = Parser.parseOverlay_(hlsMetadata);
      return result;
    }
    if (!hlsMetadata) {
      return result;
    }
    const assetUri = Parser.getMetadataValue(hlsMetadata, 'X-ASSET-URI');
    const assetList = Parser.getMetadataValue(hlsMetadata, 'X-ASSET-LIST');
    if (!assetUri && !assetList) {
      return result;
    }
    const id = Parser.getMetadataValue(hlsMetadata, 'ID');
    const {startTime, endTime} = Parser.getInterstitialTimes_(hlsMetadata, id);
    const restrict = Parser.getMetadataValue(hlsMetadata, 'X-RESTRICT');
    let isSkippable = true;
    let canJump = true;
    if (restrict != null) {
      isSkippable = !restrict.includes('SKIP');
      canJump = !restrict.includes('JUMP');
    }
    let skipOffset = isSkippable ? 0 : null;
    const skipControlOffset =
        Parser.getMetadataValue(hlsMetadata, 'X-SKIP-CONTROL-OFFSET');
    if (skipControlOffset != null) {
      skipOffset = parseFloat(skipControlOffset);
      if (isNaN(skipOffset)) {
        skipOffset = isSkippable ? 0 : null;
      }
    }
    let skipFor = null;
    const skipControlDuration =
        Parser.getMetadataValue(hlsMetadata, 'X-SKIP-CONTROL-DURATION');
    if (skipControlDuration != null) {
      skipFor = parseFloat(skipControlDuration);
      if (isNaN(skipFor)) {
        skipFor = null;
      }
    }
    let resumeOffset = null;
    const resume = Parser.getMetadataValue(hlsMetadata, 'X-RESUME-OFFSET');
    if (resume != null) {
      resumeOffset = parseFloat(resume);
      if (isNaN(resumeOffset)) {
        resumeOffset = null;
      }
    }
    if (resumeOffset != null && resumeOffset != 0 && endTime &&
        endTime != Infinity &&
        NumberUtils.isFloatEqual(startTime + resumeOffset, endTime)) {
      resumeOffset = null;
    }
    let playoutLimit = null;
    const playout = Parser.getMetadataValue(hlsMetadata, 'X-PLAYOUT-LIMIT');
    if (playout != null) {
      playoutLimit = parseFloat(playout);
      if (isNaN(playoutLimit)) {
        playoutLimit = null;
      }
    }
    const {once, pre, post} = Parser.parseCue_(hlsMetadata);
    let timelineRange = false;
    const timelineOccupies =
        Parser.getMetadataValue(hlsMetadata, 'X-TIMELINE-OCCUPIES');
    if (timelineOccupies != null) {
      timelineRange = timelineOccupies.includes('RANGE');
    } else if (resume == null && isLive) {
      timelineRange = !pre && !post;
    }
    if (assetUri != null) {
      if (!assetUri) {
        return result;
      }
      interstitialsAd.push(shaka.ads.Utils.createInterstitial({
        id,
        startTime,
        endTime,
        uri: assetUri,
        isSkippable,
        skipOffset,
        skipFor,
        canJump,
        resumeOffset,
        playoutLimit,
        once,
        pre,
        post,
        timelineRange,
      }));
    } else if (assetList != null) {
      if (!assetList) {
        return result;
      }
      /** @type {shaka.ads.HlsInterstitialParser.AssetListDescriptor} */
      const descriptor = {
        id,
        groupId: null,
        startTime,
        endTime,
        assetListUri: assetList,
        isSkippable,
        skipOffset,
        skipFor,
        canJump,
        resumeOffset,
        playoutLimit,
        once,
        pre,
        post,
        timelineRange,
        resolving: false,
        resolved: false,
      };
      result.assetList = descriptor;
    }
    return result;
  }

  /**
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @return {!Array<shaka.extern.AdInterstitial>}
   * @private
   */
  static parseOverlay_(hlsMetadata) {
    const Parser = shaka.ads.HlsInterstitialParser;
    const interstitialsAd = [];
    if (!hlsMetadata) {
      return interstitialsAd;
    }
    const uri = Parser.getMetadataValue(hlsMetadata, 'X-ASSET-URI');
    if (!uri) {
      return interstitialsAd;
    }
    const id = Parser.getMetadataValue(hlsMetadata, 'X-OVERLAY-ID');
    const {startTime, endTime} = Parser.getInterstitialTimes_(hlsMetadata, id);
    const {once, pre, post} = Parser.parseCue_(hlsMetadata);
    const mimeType = Parser.getMetadataValue(hlsMetadata, 'X-ASSET-MIMETYPE');
    const loop = Parser.getMetadataValue(hlsMetadata, 'X-LOOP') == 'YES';
    let z = 1;
    const depth = Parser.getMetadataValue(hlsMetadata, 'X-DEPTH');
    if (depth != null) {
      z = parseFloat(depth);
      if (isNaN(z)) {
        z = 1;
      }
    }
    const background = Parser.getMetadataValue(hlsMetadata, 'X-BACKGROUND');

    const viewport = {
      x: 1920,
      y: 1080,
    };

    const viewportValue = Parser.getMetadataValue(hlsMetadata, 'X-VIEWPORT');
    if (viewportValue != null) {
      const size = viewportValue.split('x');
      if (size.length != 2) {
        return interstitialsAd;
      }
      viewport.x = parseFloat(size[0]);
      viewport.y = parseFloat(size[1]);
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

    const overlayPosition =
        Parser.getMetadataValue(hlsMetadata, 'X-OVERLAY-POSITION');
    if (overlayPosition != null) {
      const position = overlayPosition.split('x');
      if (position.length != 2) {
        return interstitialsAd;
      }
      overlay.topLeft.x = parseFloat(position[0]);
      overlay.topLeft.y = parseFloat(position[1]);
    }

    const overlaySize = Parser.getMetadataValue(hlsMetadata, 'X-OVERLAY-SIZE');
    if (overlaySize != null) {
      const size = overlaySize.split('x');
      if (size.length != 2) {
        return interstitialsAd;
      }
      overlay.size.x = parseFloat(size[0]);
      overlay.size.y = parseFloat(size[1]);
    }

    /** @type {?shaka.extern.AdPositionInfo} */
    let currentVideo = null;
    const squeezeCurrent =
        Parser.getMetadataValue(hlsMetadata, 'X-SQUEEZECURRENT');
    if (squeezeCurrent != null) {
      let percentage = parseFloat(squeezeCurrent);
      if (isNaN(percentage)) {
        percentage = 1;
      }
      currentVideo = {
        viewport: {
          x: 1920,
          y: 1080,
        },
        topLeft: {
          x: 0,
          y: 0,
        },
        size: {
          x: 1920 * percentage,
          y: 1080 * percentage,
        },
      };
      const squeezeCurrentPosition =
          Parser.getMetadataValue(hlsMetadata, 'X-SQUEEZECURRENT-POSITION');
      if (squeezeCurrentPosition != null) {
        const position = squeezeCurrentPosition.split('x');
        if (position.length != 2) {
          return interstitialsAd;
        }
        currentVideo.topLeft.x = parseFloat(position[0]);
        currentVideo.topLeft.y = parseFloat(position[1]);
      }
    }

    interstitialsAd.push(shaka.ads.Utils.createInterstitial({
      id,
      startTime,
      endTime,
      uri,
      mimeType,
      once,
      pre,
      post,
      timelineRange: true,
      loop,
      overlay,
      displayOnBackground: z == -1,
      currentVideo,
      background,
    }));
    return interstitialsAd;
  }

  /**
   * Parses a fetched asset list without performing requests. URI resolution
   * uses the response URI, including redirects. Assets skipped on a live
   * start retain their original indexes and offsets.
   *
   * @param {!shaka.ads.HlsInterstitialParser.AssetsList} data
   * @param {!shaka.ads.HlsInterstitialParser.AssetListDescriptor} descriptor
   * @param {string} responseUri
   * @param {number=} startOffset
   * @return {!Array<shaka.extern.AdInterstitial>}
   */
  static parseAssetList(data, descriptor, responseUri, startOffset = 0) {
    if (!data || !Array.isArray(data['ASSETS'])) {
      throw new Error('Invalid HLS asset list');
    }
    const control = data['SKIP-CONTROL'] || {};
    const skipOffset = Number.isFinite(control['OFFSET']) ?
        control['OFFSET'] : descriptor.skipOffset;
    const skipFor = Number.isFinite(control['DURATION']) ?
        control['DURATION'] : descriptor.skipFor;
    const SvtaParser = shaka.ads.SvtaInterstitialParser;
    const podEnvelope = SvtaParser.parseEnvelope(
        data[SvtaParser.KEY], 'pod');
    const pod = podEnvelope ?
        /** @type {!shaka.extern.AdCreativeSignaling.Pod} */
        (podEnvelope.payload[0]) : null;
    const slotEnvelopes = data['ASSETS'].map((asset) =>
      asset && SvtaParser.parseEnvelope(
          asset[SvtaParser.KEY], 'slot'));
    const sequenceLength = slotEnvelopes.filter((slot) => slot != null).length;
    const interstitials = [];
    let position = 0;
    let cumulativeDuration = 0;
    for (let i = 0; i < data['ASSETS'].length; i++) {
      const asset = data['ASSETS'][i];
      if (slotEnvelopes[i]) {
        position++;
      }
      if (!asset || typeof asset['URI'] != 'string' ||
          asset['DURATION'] < 0) {
        throw new Error('Invalid HLS asset description');
      }
      const duration = parseFloat(asset['DURATION']) || 0;
      const assetOffset = cumulativeDuration;
      cumulativeDuration += duration;
      if (!asset['URI'] || (duration > 0 &&
          cumulativeDuration <= startOffset)) {
        continue;
      }
      const interstitial = shaka.ads.Utils.createInterstitial({
        id: descriptor.id + '_shaka_asset_' + i,
        groupId: descriptor.id,
        startTime: descriptor.startTime,
        endTime: descriptor.endTime,
        uri: shaka.util.URL.resolve(responseUri, asset['URI']),
        isSkippable: descriptor.isSkippable,
        skipOffset,
        skipFor,
        canJump: descriptor.canJump,
        resumeOffset: descriptor.resumeOffset,
        playoutLimit: descriptor.playoutLimit,
        once: descriptor.once,
        pre: descriptor.pre,
        post: descriptor.post,
        timelineRange: descriptor.timelineRange,
      });
      SvtaParser.decorateInterstitial(interstitial, slotEnvelopes[i], pod);
      if (interstitial.adCreativeSignaling) {
        interstitial.sequenceLength = sequenceLength;
        interstitial.position = position;
      }
      // Playback offsets are execution context, separate from the slot's
      // offset in its pod. The manager uses this to start within an asset.
      if (startOffset > assetOffset) {
        interstitial.startOffset = startOffset - assetOffset;
      }
      interstitials.push(interstitial);
    }
    return interstitials;
  }

  /**
   * Creates a deferred resolver for an HLS asset list. Parsing remains pure;
   * only invoking resolve performs the request. The common manager controls
   * when to invoke it and can abort it without knowing the resource format.
   *
   * @param {!shaka.ads.HlsInterstitialParser.AssetListDescriptor} descriptor
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @param {string} sessionId
   * @return {!shaka.extern.DeferredInterstitial}
   */
  static createDeferredInterstitial(descriptor, networkingEngine, sessionId) {
    const Parser = shaka.ads.HlsInterstitialParser;
    // The resource holds all the descriptor attributes, including updates
    // of its playout limit received while it is unresolved.
    return shaka.ads.Utils.createDeferredInterstitial(descriptor,
        networkingEngine,
        (offset) => Parser.getUriWithParams(
            descriptor.assetListUri, sessionId, offset),
        (data, uri, offset, resource) => {
          const interstitials = Parser.parseAssetList(
              /** @type {!shaka.ads.HlsInterstitialParser.AssetsList} */ (data),
              /** @type {?} */ (resource), uri, offset);
          for (const interstitial of interstitials) {
            interstitial.uri = Parser.getUriWithParams(
                interstitial.uri || '', sessionId);
          }
          return interstitials;
        }, {
          type: shaka.net.NetworkingEngine.AdvancedRequestType
              .INTERSTITIAL_ASSET_LIST,
        });
  }

  /**
   * @param {string} uri
   * @param {string} sessionId
   * @param {number=} offset
   * @return {string}
   */
  static getUriWithParams(uri, sessionId, offset = 0) {
    if (uri.startsWith('data:')) {
      return uri;
    }
    const params = new Map();
    params.set('_HLS_primary_id', sessionId);
    if (offset > 0) {
      params.set('_HLS_start_offset',
          String(Math.round(offset * 1000) / 1000));
    }
    return shaka.util.URL.appendParams(uri, params);
  }

  /**
   * Returns the string data of the HLS metadata frame with the given key, or
   * null if there is no such frame.
   *
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @param {string} key
   * @return {?string}
   */
  static getMetadataValue(hlsMetadata, key) {
    const frame = hlsMetadata.values.find((v) => v.key == key);
    return frame ? /** @type {string} */ (frame.data) : null;
  }

  /**
   * Computes the start/end times of an interstitial from its HLS metadata. When
   * the Date Range has no ID, the times are floored to a tenth of a second.
   *
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @param {?string} id
   * @return {{startTime: number, endTime: ?number}}
   * @private
   */
  static getInterstitialTimes_(hlsMetadata, id) {
    const startTime = id == null ?
        Math.floor(hlsMetadata.startTime * 10) / 10 :
        hlsMetadata.startTime;
    let endTime = hlsMetadata.endTime;
    if (hlsMetadata.endTime && hlsMetadata.endTime != Infinity &&
        typeof(hlsMetadata.endTime) == 'number') {
      endTime = id == null ?
          Math.floor(hlsMetadata.endTime * 10) / 10 :
          hlsMetadata.endTime;
    }
    return {startTime, endTime};
  }

  /**
   * Parses the CUE attribute (ONCE/PRE/POST) from HLS metadata. X-CUE was
   * the provisional name and is supported as a fallback for compatibility.
   *
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @return {{once: boolean, pre: boolean, post: boolean}}
   * @private
   */
  static parseCue_(hlsMetadata) {
    const Parser = shaka.ads.HlsInterstitialParser;
    const cue = Parser.getMetadataValue(hlsMetadata, 'CUE') ||
        Parser.getMetadataValue(hlsMetadata, 'X-CUE');
    return {
      once: cue != null && cue.includes('ONCE'),
      pre: cue != null && cue.includes('PRE'),
      post: cue != null && cue.includes('POST'),
    };
  }
};


/**
 * @typedef {{
 *   interstitials: !Array<shaka.extern.AdInterstitial>,
 *   assetList: ?shaka.ads.HlsInterstitialParser.AssetListDescriptor,
 * }}
 */
shaka.ads.HlsInterstitialParser.ParsedMetadata;


/**
 * @typedef {{
 *   interstitials: !Array<shaka.extern.AdInterstitial>,
 *   deferred: !Array<!shaka.extern.DeferredInterstitial>,
 *   playoutLimitUpdate: ?{id: string, playoutLimit: number},
 *   preloadHint: ?{targetId: string, startTime: number},
 * }}
 *
 * @property {!Array<shaka.extern.AdInterstitial>} interstitials
 *   Interstitials ready to be scheduled.
 * @property {!Array<!shaka.extern.DeferredInterstitial>} deferred
 *   Resources (asset lists, remote pods) to be resolved before scheduling.
 * @property {?{id: string, playoutLimit: number}} playoutLimitUpdate
 *   A playout limit for an interstitial or resource that may already exist.
 * @property {?{targetId: string, startTime: number}} preloadHint
 *   The time from which the target's resources may be resolved.
 */
shaka.ads.HlsInterstitialParser.Result;


/**
 * Holds the parsed metadata of an HLS X-ASSET-LIST interstitial whose
 * resolution has been deferred until playback approaches it.
 *
 * @typedef {{
 *   id: ?string,
 *   groupId: ?string,
 *   startTime: number,
 *   endTime: ?number,
 *   assetListUri: string,
 *   isSkippable: boolean,
 *   skipOffset: ?number,
 *   skipFor: ?number,
 *   canJump: boolean,
 *   resumeOffset: ?number,
 *   playoutLimit: ?number,
 *   once: boolean,
 *   pre: boolean,
 *   post: boolean,
 *   timelineRange: boolean,
 *   resolutionTimeOffset: (number|undefined),
 *   resolving: boolean,
 *   resolved: boolean,
 * }}
 *
 * @property {?string} id
 * @property {?string} groupId
 * @property {number} startTime
 * @property {?number} endTime
 * @property {string} assetListUri
 * @property {boolean} isSkippable
 * @property {?number} skipOffset
 * @property {?number} skipFor
 * @property {boolean} canJump
 * @property {?number} resumeOffset
 * @property {?number} playoutLimit
 * @property {boolean} once
 * @property {boolean} pre
 * @property {boolean} post
 * @property {boolean} timelineRange
 * @property {(number|undefined)} resolutionTimeOffset
 *   The offset in seconds before startTime at which the asset list may be
 *   resolved. Undefined or 0 means use the interstitialPreloadAheadTime
 *   default.
 * @property {boolean} resolving
 *   Whether a deferred resolution request is already in flight.
 * @property {boolean} resolved
 *   Whether the asset list has already been resolved. Retained (only for live
 *   streams that allow starting mid-interstitial) so that seeking back into the
 *   break can re-request the asset list with an updated _HLS_start_offset.
 */
shaka.ads.HlsInterstitialParser.AssetListDescriptor;


/* eslint-disable @stylistic/max-len */
/**
 * @typedef {{
 *   ASSETS: !Array<shaka.ads.HlsInterstitialParser.Asset>,
 *   SKIP-CONTROL: (shaka.ads.HlsInterstitialParser.SkipControl|undefined),
 *   X-AD-CREATIVE-SIGNALING: (shaka.extern.AdCreativeSignaling.CarriageEnvelope|undefined),
 * }}
 *
 * @property {!Array<shaka.ads.HlsInterstitialParser.Asset>} ASSETS
 * @property {?shaka.ads.HlsInterstitialParser.SkipControl} SKIP-CONTROL
 * @property {?shaka.extern.AdCreativeSignaling.CarriageEnvelope} X-AD-CREATIVE-SIGNALING
 */
shaka.ads.HlsInterstitialParser.AssetsList;
/* eslint-enable @stylistic/max-len */


/* eslint-disable @stylistic/max-len */
/**
 * @typedef {{
 *   URI: string,
 *   DURATION: number,
 *   X-AD-CREATIVE-SIGNALING: (shaka.extern.AdCreativeSignaling.CarriageEnvelope|undefined),
 * }}
 *
 * @property {string} URI
 * @property {number} DURATION
 * @property {?shaka.extern.AdCreativeSignaling.CarriageEnvelope} X-AD-CREATIVE-SIGNALING
 */
shaka.ads.HlsInterstitialParser.Asset;
/* eslint-enable @stylistic/max-len */


/**
 * @typedef {{
 *   OFFSET: (number|undefined),
 *   DURATION: (number|undefined),
 * }}
 *
 * @property {number} OFFSET
 * @property {number} DURATION
 */
shaka.ads.HlsInterstitialParser.SkipControl;
