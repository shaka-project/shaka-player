/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.SvtaInterstitialTracker');

goog.require('shaka.ads.InterstitialAdSession');
goog.require('shaka.ads.InterstitialTracker');
goog.require('shaka.ads.SvtaInterstitialParser');
goog.require('shaka.ads.Utils');
goog.require('shaka.log');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.StringUtils');

goog.requireType('shaka.net.NetworkingEngine');


/**
 * Measures interstitials described by SVTA2053 version 2 creative signaling.
 * Holds the state shared by the slots of a pod and by remote fields, which
 * lives as long as the asset; each interstitial gets its own tracker.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.SvtaInterstitialTracker = class {
  constructor() {
    /**
     * @private {!WeakMap<shaka.extern.AdCreativeSignaling.Pod,
     *                    shaka.ads.SvtaInterstitialTracker.PodState>}
     */
    this.podStates_ = new WeakMap();
    /**
     * Tracking events already sent for embedded slots. Watching an embedded
     * slot again (e.g. after seeking back) is not a new ad view.
     * @private {!WeakMap<shaka.extern.AdCreativeSignaling.Slot,
     *                    !Set<shaka.ads.InterstitialTracker.Event>>}
     */
    this.slotFired_ = new WeakMap();
    /** @private {!WeakMap<Object, !Promise>} */
    this.remoteFields_ = new WeakMap();
    /** @private {!Set<shaka.net.NetworkingEngine.PendingRequest>} */
    this.requests_ = new Set();
    /** @private {number} */
    this.generation_ = 0;
  }

  /**
   * Forgets the state of the current asset. Pending responses are discarded,
   * even if the network abort arrives late.
   */
  reset() {
    this.generation_++;
    this.podStates_ = new WeakMap();
    this.slotFired_ = new WeakMap();
    this.remoteFields_ = new WeakMap();
    for (const request of this.requests_) {
      request.abort();
    }
    this.requests_.clear();
  }

  /** @override */
  release() {
    this.reset();
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {!shaka.ads.InterstitialAdSession} session
   * @param {function(string)} sendBeacon
   * @param {function(string):!shaka.net.NetworkingEngine.PendingRequest} fetch
   * @return {?shaka.ads.InterstitialAdSession.Tracker}
   */
  create(interstitial, session, sendBeacon, fetch) {
    if (!interstitial.adCreativeSignaling) {
      return null;
    }
    /** @type {!shaka.extern.AdCreativeSignaling.Slot} */
    const slot = interstitial.adCreativeSignaling;
    const Tracker = shaka.ads.SvtaInterstitialTracker;
    const pod = interstitial.pod || null;
    let podTracker = null;
    let podState = null;
    if (pod) {
      /** @type {!shaka.extern.AdCreativeSignaling.Pod} */
      const nonNullPod = pod;
      podState = this.podStates_.getOrInsertComputed(pod,
          () => ({fired: new Set(), started: false, ended: false}));
      podTracker = new shaka.ads.InterstitialTracker(
          () => Tracker.getTracking_(nonNullPod), sendBeacon, podState.fired);
    }
    // A new playback of an external asset is a new ad view.
    const fired = interstitial.playbackMode == shaka.ads.Utils.EMBEDDED ?
        this.slotFired_.getOrInsertComputed(slot, () => new Set()) :
        new Set();
    return new Tracker.SlotTracker(
        new shaka.ads.InterstitialTracker(
            () => Tracker.getTracking_(slot), sendBeacon, fired),
        pod, podTracker, podState, interstitial.podOffset || 0,
        () => session.getPosition(),
        () => Promise.all([pod, slot].filter((item) => item != null).map(
            (item) => this.resolveContainer_(item, session, fetch))));
  }

  /**
   * @param {!(shaka.extern.AdCreativeSignaling.Slot|
   *           shaka.extern.AdCreativeSignaling.Pod)} container
   * @return {!Array<shaka.extern.AdCreativeSignaling.TrackingEvent>}
   * @private
   */
  static getTracking_(container) {
    // Remote tracking replaces the inline one, so wait until it is resolved.
    return container.$remote?.tracking ? [] : container.tracking || [];
  }

  /**
   * Resolves each remote container once, when its media is needed. Responses
   * replace the field rather than appending to its inline fallback.
   *
   * @param {!(shaka.extern.AdCreativeSignaling.Pod|
   *           shaka.extern.AdCreativeSignaling.Slot)} container
   * @param {!shaka.ads.InterstitialAdSession} session
   * @param {function(string):!shaka.net.NetworkingEngine.PendingRequest} fetch
   * @return {!Promise}
   * @private
   */
  resolveContainer_(container, session, fetch) {
    return this.remoteFields_.getOrInsertComputed(container, async () => {
      // Remote pod slots are resolved by the parser before scheduling, and
      // verifications are not used, so only tracking is needed here.
      const remote = container.$remote;
      if (!remote || !remote.tracking) {
        return;
      }
      const generation = this.generation_;
      const request = fetch(session.expandUri(remote.tracking));
      this.requests_.add(request);
      try {
        const response = await request.promise;
        const envelope = shaka.ads.SvtaInterstitialParser.parseEnvelope(
            JSON.parse(shaka.util.StringUtils.fromUTF8(response.data)),
            'trackingEvent');
        if (generation == this.generation_ && envelope) {
          // The envelope type guarantees the payload holds tracking events.
          container.tracking = /** @type {?} */ (envelope.payload);
        }
      } catch (error) {
        shaka.log.warning('Failed to resolve SVTA remote tracking', error);
      } finally {
        this.requests_.delete(request);
        if (generation == this.generation_) {
          delete remote.tracking;
        }
      }
    });
  }
};


/**
 * Tracks a slot and, at its boundaries, the pod that contains it.
 *
 * @implements {shaka.ads.InterstitialAdSession.Tracker}
 */
shaka.ads.SvtaInterstitialTracker.SlotTracker = class {
  /**
   * @param {!shaka.ads.InterstitialTracker} slotTracker
   * @param {?shaka.extern.AdCreativeSignaling.Pod} pod
   * @param {?shaka.ads.InterstitialTracker} podTracker
   * @param {?shaka.ads.SvtaInterstitialTracker.PodState} podState
   * @param {number} podOffset The slot start relative to its pod.
   * @param {function():number} getPosition The slot playhead position.
   * @param {function():!Promise} resolve
   */
  constructor(slotTracker, pod, podTracker, podState, podOffset, getPosition,
      resolve) {
    /** @private {!shaka.ads.InterstitialTracker} */
    this.slot_ = slotTracker;
    /** @private {?shaka.extern.AdCreativeSignaling.Pod} */
    this.pod_ = pod;
    /** @private {?shaka.ads.InterstitialTracker} */
    this.podTracker_ = podTracker;
    /** @private {?shaka.ads.SvtaInterstitialTracker.PodState} */
    this.podState_ = podState;
    /** @private {number} */
    this.podOffset_ = podOffset;
    /** @private {function():number} */
    this.getPosition_ = getPosition;
    /** @private {function():!Promise} */
    this.resolve_ = resolve;
  }

  /** @override */
  release() {
    this.slot_.release();
    if (this.podTracker_) {
      this.podTracker_.release();
    }
  }

  /** @override */
  resolve() {
    return this.resolve_();
  }

  /** @override */
  onEvent(type) {
    const name = shaka.ads.InterstitialTracker.getName(type);
    const pod = this.pod_;
    const podTracker = this.podTracker_;
    const podState = this.podState_;
    if (!name || !pod || !podTracker || !podState) {
      this.slot_.onEvent(type);
      return;
    }
    const podPosition = this.podOffset_ + this.getPosition_();
    const isStart =
        name == 'start' || name == 'impression' || name == 'loaded';
    if (isStart && (podPosition < 0.1 || podState.started)) {
      podState.started = true;
      podTracker.fire('podStart');
    }
    this.slot_.onEvent(type);
    // Only actions, and the start of the first slot, apply to the pod.
    if ((isStart && podPosition < 0.1) ||
        shaka.ads.InterstitialTracker.isRepeated(name)) {
      podTracker.fire(name);
    }
    // Pod end follows slot completion and all other slot tracking.
    if (name == 'complete' && podPosition >= pod.duration && !podState.ended) {
      podState.ended = true;
      podTracker.fire('complete');
      podTracker.fire('podEnd');
    }
  }

  /** @override */
  onProgress(previous, position) {
    this.slot_.onProgress(previous, position);
    const pod = this.pod_;
    const podTracker = this.podTracker_;
    if (!pod || !podTracker) {
      return;
    }
    const podPrevious = this.podOffset_ + previous;
    const podPosition = this.podOffset_ + position;
    podTracker.onProgress(podPrevious, podPosition);
    const names = ['firstQuartile', 'midpoint', 'thirdQuartile'];
    for (let i = 0; i < names.length; i++) {
      const threshold = pod.duration * (i + 1) / 4;
      if (podPrevious <= threshold && podPosition >= threshold) {
        podTracker.fire(names[i]);
      }
    }
  }
};


/**
 * @typedef {{
 *   fired: !Set<shaka.extern.AdCreativeSignaling.TrackingEvent>,
 *   started: boolean,
 *   ended: boolean,
 * }}
 */
shaka.ads.SvtaInterstitialTracker.PodState;
