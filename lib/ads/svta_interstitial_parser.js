/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.SvtaInterstitialParser');

goog.require('shaka.ads.Utils');
goog.require('shaka.log');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.TXml');
goog.require('shaka.util.Uint8ArrayUtils');


/** Parses SVTA2053 version 2 creative signaling, without loading resources. */
shaka.ads.SvtaInterstitialParser = class {
  /**
   * @param {shaka.extern.HLSMetadata} metadata
   * @return {boolean}
   */
  static isValidMetadata(metadata) {
    return metadata.values.some((value) =>
      value.key == shaka.ads.SvtaInterstitialParser.KEY_);
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   * @return {boolean}
   */
  static isValidRegion(region) {
    return !!region.eventNode &&
        (region.schemeIdUri ==
            'urn:svta:advertising-wg:ad-creative-signaling' ||
        region.schemeIdUri == 'urn:svta:advertising-wg:ad-id-signaling');
  }

  /**
   * @param {shaka.extern.HLSMetadata} metadata
   * @param {?shaka.net.NetworkingEngine=} networkingEngine Used to resolve
   *   remote pod slots. Without it, pods with remote slots are ignored.
   * @return {!shaka.ads.SvtaInterstitialParser.Result}
   */
  static parseMetadata(metadata, networkingEngine = null) {
    const id = metadata.values.find((value) => value.key == 'ID');
    return shaka.ads.SvtaInterstitialParser.parseInterstitials(
        shaka.ads.SvtaInterstitialParser.decodeMetadata(metadata),
        metadata.startTime, id ? String(id.data) : 'hls_' + metadata.startTime,
        networkingEngine);
  }

  /**
   * @param {shaka.extern.HLSMetadata} metadata
   * @return {*} The decoded signaling, or null if there is none.
   */
  static decodeMetadata(metadata) {
    const frame = metadata.values.find((value) =>
      value.key == shaka.ads.SvtaInterstitialParser.KEY_);
    try {
      return JSON.parse(shaka.util.StringUtils.fromUTF8(
          shaka.util.Uint8ArrayUtils.fromBase64(
              /** @type {string} */ (frame.data))));
    } catch (error) {
      shaka.log.warning('Invalid SVTA HLS signaling', error);
      return null;
    }
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   * @param {?shaka.net.NetworkingEngine=} networkingEngine Used to resolve
   *   remote pod slots. Without it, pods with remote slots are ignored.
   * @return {!shaka.ads.SvtaInterstitialParser.Result}
   */
  static parseRegion(region, networkingEngine = null) {
    const Parser = shaka.ads.SvtaInterstitialParser;
    if (!region.eventNode || !Parser.isValidRegion(region)) {
      return {interstitials: [], deferred: [], pods: []};
    }
    try {
      const envelope = JSON.parse(
          shaka.util.TXml.getTextContents(region.eventNode) || 'null');
      return Parser.parseInterstitials(envelope, region.startTime,
          region.id || 'dash_' + region.startTime, networkingEngine);
    } catch (error) {
      shaka.log.warning('Invalid SVTA DASH signaling', error);
      return {interstitials: [], deferred: [], pods: []};
    }
  }

  /**
   * Validates an envelope before any of its payload is used. The version is
   * not checked, so earlier signaling without version, envelope type, slot
   * type or identifiers is accepted.
   *
   * @param {*} data
   * @param {string=} expectedType
   * @return {?shaka.extern.AdCreativeSignaling.CarriageEnvelope}
   */
  static parseEnvelope(data, expectedType = '') {
    const Parser = shaka.ads.SvtaInterstitialParser;
    if (!data || typeof data != 'object' ||
        !Array.isArray(data['payload']) || !data['payload'].length) {
      return null;
    }
    // Without a type, the payload is what the caller expects (slots for
    // carriage, the requested field for remote responses).
    const type = data['type'] || expectedType || 'slot';
    if (expectedType && type != expectedType) {
      return null;
    }
    const features = data['features'] || {};
    for (const key in features) {
      if (features[key] && key != 'remoteFields') {
        shaka.log.warning('Unsupported SVTA feature', key);
        return null;
      }
    }
    const remoteFields = !!features['remoteFields'];
    const validators = {
      'slot': (value) => Parser.isSlot_(value, remoteFields),
      'pod': (value) => Parser.isPod_(value, remoteFields),
      'trackingEvent': (value) => Parser.isTrackingEvent_(value),
    };
    const validate = validators[type];
    const payload = /** @type {!Array<*>} */ (data['payload']);
    if (!validate || !payload.every(validate)) {
      return null;
    }
    return /** @type {!shaka.extern.AdCreativeSignaling.CarriageEnvelope} */ (
      data);
  }

  /**
   * @param {*} data
   * @param {number} anchor
   * @param {string} id
   * @param {?shaka.net.NetworkingEngine=} networkingEngine Used to resolve
   *   remote pod slots. Without it, pods with remote slots are ignored.
   * @return {!shaka.ads.SvtaInterstitialParser.Result}
   */
  static parseInterstitials(data, anchor, id, networkingEngine = null) {
    const Parser = shaka.ads.SvtaInterstitialParser;
    /** @type {!shaka.ads.SvtaInterstitialParser.Result} */
    const result = {interstitials: [], deferred: [], pods: []};
    const envelope = Parser.parseEnvelope(data);
    if (!envelope || !Number.isFinite(anchor)) {
      return result;
    }
    const interstitials = result.interstitials;
    const type = envelope.type || 'slot';
    if (type == 'slot') {
      const slots = /** @type {!Array<shaka.extern.AdCreativeSignaling.Slot>} */
        (envelope.payload);
      interstitials.push(...Parser.createInterstitials_(
          Parser.resolvePod(null, slots, anchor, id)));
    } else if (type == 'pod') {
      const pods = /** @type {!Array<shaka.extern.AdCreativeSignaling.Pod>} */
        (envelope.payload);
      for (let i = 0; i < pods.length; i++) {
        const pod = pods[i];
        const podId = id + '_pod_' + i;
        const start = anchor + (pod.start || 0);
        if (pod.$remote && pod.$remote.slots) {
          // A pod with remote slots is not playable until they are resolved,
          // which the manager schedules like any other deferred resource.
          if (networkingEngine) {
            result.deferred.push(Parser.createDeferredPod_(
                pod, start, podId, networkingEngine));
          }
        } else if (!pod.slots.length) {
          // The slots of the pod are carried separately (SVTA2053 section
          // 5.2.2), so they are linked to it once both are known.
          result.pods.push({id: podId, pod, startTime: start,
            endTime: start + pod.duration});
        } else {
          interstitials.push(...Parser.createInterstitials_(
              Parser.resolvePod(pod, pod.slots, start, podId)));
        }
      }
    }
    return result;
  }

  /**
   * @param {!shaka.extern.AdCreativeSignaling.Pod} pod
   * @param {number} startTime
   * @param {string} id
   * @param {!shaka.net.NetworkingEngine} networkingEngine
   * @return {!shaka.extern.DeferredInterstitial}
   * @private
   */
  static createDeferredPod_(pod, startTime, id, networkingEngine) {
    const Parser = shaka.ads.SvtaInterstitialParser;
    const uri = /** @type {string} */ (pod.$remote.slots);
    return shaka.ads.Utils.createDeferredInterstitial({
      id,
      startTime,
      endTime: startTime + pod.duration,
      pre: false,
      post: false,
      canJump: true,
      timelineRange: true,
      playoutLimit: null,
    }, networkingEngine, () => uri, (data) => {
      const envelope = Parser.parseEnvelope(data, 'slot');
      if (!envelope) {
        throw new Error('Invalid SVTA remote slots');
      }
      // Remote slots replace the inline ones.
      const slots =
      /** @type {!Array<!shaka.extern.AdCreativeSignaling.Slot>} */ (
          envelope.payload);
      const $remote = {tracking: pod.$remote.tracking};
      const resolved = /** @type {!shaka.extern.AdCreativeSignaling.Pod} */ (
        Object.assign({}, pod, {slots, $remote}));
      return Parser.createInterstitials_(
          Parser.resolvePod(resolved, slots, startTime, id));
    });
  }

  /**
   * Places the slots of a pod in it. This is the first phase of parsing,
   * shared by every carriage of slots (a payload of slots, a pod with its
   * slots, the remote slots of a pod and the assets of an ASSET-LIST), before
   * the slots are turned into interstitials or decorate them.
   *
   * @param {?shaka.extern.AdCreativeSignaling.Pod} pod The pod, or null for
   *   slots carried without one.
   * @param {!Array<?shaka.extern.AdCreativeSignaling.Slot>} slots The slots,
   *   in the order they are carried. A null entry is a position that carries
   *   no slot, like an asset of an ASSET-LIST without signaling.
   * @param {number} startTime The start of the pod in the presentation
   *   timeline.
   * @param {string} id Identifies the pod across manifest updates.
   * @return {!shaka.ads.SvtaInterstitialParser.ParsedPod}
   */
  static resolvePod(pod, slots, startTime, id) {
    /** @type {!Array<!shaka.ads.SvtaInterstitialParser.ParsedSlot>} */
    const parsed = [];
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (slot) {
        parsed.push({
          id: id + '_slot_' + i,
          index: i,
          slot,
          podPosition: parsed.length + 1,
        });
      }
    }
    return {
      id,
      pod,
      startTime,
      slots: parsed,
    };
  }

  /**
   * Reads the signaling of an ASSET-LIST: the pod at its top level and the
   * slot of each of its assets. The assets must have been validated.
   *
   * @param {!Object} data The ASSET-LIST.
   * @param {number} startTime The start of the interstitial in the
   *   presentation timeline.
   * @param {string} id Identifies the interstitial.
   * @return {!shaka.ads.SvtaInterstitialParser.ParsedPod} The pod, whose
   *   slots are indexed by the position of their asset.
   */
  static parseAssetList(data, startTime, id) {
    const Parser = shaka.ads.SvtaInterstitialParser;
    const podEnvelope = Parser.parseEnvelope(data[Parser.KEY_], 'pod');
    const pod = podEnvelope ?
        /** @type {!shaka.extern.AdCreativeSignaling.Pod} */
        (podEnvelope.payload[0]) : null;
    const assets = /** @type {!Array<!Object>} */ (data['ASSETS']);
    const slots = assets.map((asset) => {
      // An asset carries a single slot.
      const envelope = Parser.parseEnvelope(asset[Parser.KEY_], 'slot');
      return envelope && envelope.payload.length == 1 ?
          /** @type {!shaka.extern.AdCreativeSignaling.Slot} */ (
            envelope.payload[0]) : null;
    });
    return Parser.resolvePod(pod, slots, startTime, id);
  }

  /**
   * Turns the slots of a pod into interstitials embedded in the primary
   * content.
   *
   * @param {!shaka.ads.SvtaInterstitialParser.ParsedPod} pod
   * @return {!Array<!shaka.extern.AdInterstitial>}
   * @private
   */
  static createInterstitials_(pod) {
    return pod.slots.map((slot) =>
      shaka.ads.SvtaInterstitialParser.makeInterstitial_(slot, pod));
  }

  /**
   * Attaches validated slot metadata to media identified by another format,
   * if the signaling describes a single slot. SVTA does not supply the URI or
   * change stitching decisions.
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {*} data
   * @param {?shaka.extern.AdCreativeSignaling.Pod=} pod
   */
  static decorateInterstitial(interstitial, data, pod = null) {
    const Parser = shaka.ads.SvtaInterstitialParser;
    const envelope = Parser.parseEnvelope(data, 'slot');
    if (!envelope || envelope.payload.length != 1) {
      return;
    }
    shaka.ads.SvtaInterstitialParser.decorateWithSlot(interstitial,
        /** @type {!shaka.extern.AdCreativeSignaling.Slot} */ (
          envelope.payload[0]), pod);
  }

  /**
   * Attaches a validated slot to media identified by another format, like
   * decorateInterstitial().
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {!shaka.extern.AdCreativeSignaling.Slot} slot
   * @param {?shaka.extern.AdCreativeSignaling.Pod=} pod
   */
  static decorateWithSlot(interstitial, slot, pod = null) {
    interstitial.adCreativeSignaling = slot;
    interstitial.pod = pod;
    interstitial.podOffset = slot.start;
    interstitial.clickThroughUrl = slot.clickThrough || null;
    if (slot.skipOffset != null && interstitial.isSkippable) {
      interstitial.skipOffset = slot.skipOffset;
    }
  }

  /**
   * Attaches a slot placed in its pod to media identified by another format,
   * like decorateWithSlot(), along with its position in the pod.
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {!shaka.ads.SvtaInterstitialParser.ParsedSlot} slot
   * @param {!shaka.ads.SvtaInterstitialParser.ParsedPod} pod
   */
  static decorateWithParsedSlot(interstitial, slot, pod) {
    shaka.ads.SvtaInterstitialParser.decorateWithSlot(
        interstitial, slot.slot, pod.pod);
    interstitial.podSize = pod.slots.length;
    interstitial.podPosition = slot.podPosition;
  }

  /**
   * @param {!shaka.ads.SvtaInterstitialParser.ParsedSlot} parsed
   * @param {!shaka.ads.SvtaInterstitialParser.ParsedPod} pod
   * @return {!shaka.extern.AdInterstitial}
   * @private
   */
  static makeInterstitial_(parsed, pod) {
    const slot = parsed.slot;
    const startTime = pod.startTime + slot.start;
    return shaka.ads.Utils.createInterstitial({
      id: parsed.id,
      groupId: pod.id,
      startTime,
      endTime: startTime + slot.duration,
      playbackMode: shaka.ads.Utils.EMBEDDED,
      isSkippable: slot.skipOffset != null,
      skipOffset: slot.skipOffset ?? null,
      timelineRange: true,
      clickThroughUrl: slot.clickThrough || null,
      adCreativeSignaling: slot,
      pod: pod.pod,
      podOffset: slot.start,
      podSize: pod.slots.length,
      podPosition: parsed.podPosition,
    });
  }

  /**
   * @param {?Object} value
   * @param {boolean} remoteFields
   * @return {boolean}
   * @private
   */
  static isSlot_(value, remoteFields) {
    const Parser = shaka.ads.SvtaInterstitialParser;
    // Only what playback and measurement use is validated. Verifications
    // are not used.
    const valid = !!value &&
        (value['type'] == null || value['type'] == 'linear') &&
        Parser.isTime_(value['start']) && value['duration'] > 0 &&
        Parser.isTime_(value['duration']) &&
        Parser.isArray_(value['identifiers'], (id) => !!id) &&
        (value['skipOffset'] == null || Parser.isTime_(value['skipOffset'])) &&
        (value['clickThrough'] == null ||
          typeof value['clickThrough'] == 'string') &&
        Parser.isArray_(value['tracking'], Parser.isTrackingEvent_) &&
        Parser.isRemote_(value['$remote'], remoteFields);
    if (valid) {
      // Defaults to an empty array, so users of the slot need no checks.
      value['identifiers'] = value['identifiers'] || [];
    }
    return valid;
  }

  /**
   * @param {?Object} value
   * @param {boolean} remoteFields
   * @return {boolean}
   * @private
   */
  static isPod_(value, remoteFields) {
    const Parser = shaka.ads.SvtaInterstitialParser;
    const valid = !!value && value['duration'] > 0 &&
        Parser.isTime_(value['duration']) &&
        (value['start'] == null || Parser.isTime_(value['start'])) &&
        Parser.isArray_(value['slots'], (slot) =>
          Parser.isSlot_(slot, remoteFields)) &&
        Parser.isArray_(value['tracking'], Parser.isTrackingEvent_) &&
        Parser.isRemote_(value['$remote'], remoteFields);
    if (valid) {
      // Defaults to an empty array, so users of the pod need no checks.
      // Remote slots, if any, are resolved later.
      value['slots'] = value['slots'] || [];
    }
    return valid;
  }

  /**
   * @param {?Object} value
   * @return {boolean}
   * @private
   */
  static isTrackingEvent_(value) {
    return !!value && typeof value['type'] == 'string' &&
        shaka.ads.SvtaInterstitialParser.isArray_(value['urls'],
            (url) => typeof url == 'string') &&
        (value['offset'] == null ||
          shaka.ads.SvtaInterstitialParser.isTime_(value['offset']));
  }

  /**
   * Remote fields are URLs, only allowed when the envelope declares them.
   *
   * @param {?Object} value
   * @param {boolean} enabled
   * @return {boolean}
   * @private
   */
  static isRemote_(value, enabled) {
    return value == null || (enabled && typeof value == 'object' &&
        Object.keys(value).every((key) => typeof value[key] == 'string'));
  }

  /**
   * @param {*} value
   * @return {boolean}
   * @private
   */
  static isTime_(value) {
    return typeof value == 'number' && Number.isFinite(value) && value >= 0;
  }

  /**
   * @param {*} value
   * @param {function(?Object):boolean} validate
   * @return {boolean}
   * @private
   */
  static isArray_(value, validate) {
    return value == null || (Array.isArray(value) && value.every(validate));
  }
};


/**
 * The HLS attribute, and asset list field, that carries the signaling.
 *
 * @const {string}
 * @noinline
 * @private
 */
shaka.ads.SvtaInterstitialParser.KEY_ = 'X-AD-CREATIVE-SIGNALING';

/**
 * @typedef {{
 *   interstitials: !Array<shaka.extern.AdInterstitial>,
 *   deferred: !Array<!shaka.extern.DeferredInterstitial>,
 *   pods: !Array<!shaka.ads.SvtaInterstitialParser.StandalonePod>,
 * }}
 *
 * @property {!Array<shaka.extern.AdInterstitial>} interstitials
 *   Interstitials ready to be scheduled.
 * @property {!Array<!shaka.extern.DeferredInterstitial>} deferred
 *   Pods whose slots must be resolved before they can be scheduled.
 * @property {!Array<!shaka.ads.SvtaInterstitialParser.StandalonePod>} pods
 *   Pods whose slots are carried separately.
 */
shaka.ads.SvtaInterstitialParser.Result;

/**
 * @typedef {{
 *   id: string,
 *   pod: !shaka.extern.AdCreativeSignaling.Pod,
 *   startTime: number,
 *   endTime: number,
 * }}
 *
 * @property {string} id
 *   Identifies the pod across manifest updates.
 * @property {!shaka.extern.AdCreativeSignaling.Pod} pod
 * @property {number} startTime
 *   The pod start in the presentation timeline.
 * @property {number} endTime
 *   The pod end in the presentation timeline.
 */
shaka.ads.SvtaInterstitialParser.StandalonePod;


/**
 * A pod with its slots placed in it.
 *
 * @typedef {{
 *   id: string,
 *   pod: ?shaka.extern.AdCreativeSignaling.Pod,
 *   startTime: number,
 *   slots: !Array<!shaka.ads.SvtaInterstitialParser.ParsedSlot>,
 * }}
 *
 * @property {string} id
 *   Identifies the pod across manifest updates.
 * @property {?shaka.extern.AdCreativeSignaling.Pod} pod
 *   The pod, or null for slots carried without one.
 * @property {number} startTime
 *   The pod start in the presentation timeline.
 * @property {!Array<!shaka.ads.SvtaInterstitialParser.ParsedSlot>} slots
 *   The slots of the pod, in order.
 */
shaka.ads.SvtaInterstitialParser.ParsedPod;

/**
 * A slot placed in its pod.
 *
 * @typedef {{
 *   id: string,
 *   index: number,
 *   slot: !shaka.extern.AdCreativeSignaling.Slot,
 *   podPosition: number,
 * }}
 *
 * @property {string} id
 *   Identifies the slot across manifest updates.
 * @property {number} index
 *   The position of the slot in what carries it: its payload, its pod, or
 *   the ASSETS of an ASSET-LIST.
 * @property {!shaka.extern.AdCreativeSignaling.Slot} slot
 * @property {number} podPosition
 *   The position of the slot among the slots of its pod, starting at 1.
 */
shaka.ads.SvtaInterstitialParser.ParsedSlot;
