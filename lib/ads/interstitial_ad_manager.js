/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialAdManager');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.ads.InterstitialAd');
goog.require('shaka.ads.InterstitialStaticAd');
goog.require('shaka.ads.Utils');
goog.require('shaka.ads.VastInterstitialParser');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');
goog.require('shaka.media.PreloadManager');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.net.NetworkingUtils');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.Functional');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.NumberUtils');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.TXml');
goog.require('shaka.util.URL');
goog.require('shaka.util.VideoFrameCallbackHandler');


/**
 * A class responsible for Interstitial ad interactions.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.InterstitialAdManager = class {
  /**
   * @param {HTMLElement} adContainer
   * @param {shaka.Player} player
   * @param {function(!shaka.util.FakeEvent)} onEvent
   */
  constructor(adContainer, player, onEvent) {
    /** @private {?shaka.extern.AdsConfiguration} */
    this.config_ = null;

    /** @private {HTMLElement} */
    this.adContainer_ = adContainer;

    /** @private {shaka.Player} */
    this.basePlayer_ = player;

    /** @private {HTMLMediaElement} */
    this.baseVideo_ = player.getMediaElement();

    /** @private {?HTMLMediaElement} */
    this.adVideo_ = null;

    /** @private {boolean} */
    this.usingBaseVideo_ = true;

    /** @private {HTMLMediaElement} */
    this.video_ = this.baseVideo_;

    /** @private {function(!shaka.util.FakeEvent)} */
    this.onEvent_ = onEvent;

    /** @private {!Set<string>} */
    this.hlsMetadataIds_ = new Set();

    /** @private {!Set<string>} */
    this.interstitialIds_ = new Set();

    /** @private {!Set<shaka.extern.AdInterstitial>} */
    this.interstitials_ = new Set();

    /**
     * Cache of interstitials_ sorted by descending start time, invalidated
     * (set to null) whenever interstitials_ changes. Avoids re-sorting on every
     * getCurrentInterstitial_ call (which runs per frame).
     * @private {?Array<shaka.extern.AdInterstitial>}
     */
    this.sortedInterstitials_ = null;

    /**
     * Asset lists (HLS X-ASSET-LIST) whose resolution has been deferred until
     * playback approaches them. This avoids resolving every ad decision at
     * parse time, which would otherwise create a burst of concurrent requests.
     * See https://github.com/shaka-project/shaka-player/issues/10191
     * @private {!Set<shaka.ads.InterstitialAdManager.AssetListDescriptor>}
     */
    this.unresolvedAssetLists_ = new Set();

    /**
     * HLS preload hints (RFC 8216bis Appendix F): maps the target Date Range ID
     * to the start time of its "com.apple.hls.preload" Date Range, which tells
     * us how early the target's resources may be resolved.
     * @private {!Map<string, number>}
     */
    this.preloadOffsets_ = new Map();

    /**
     * @private {!Map<shaka.extern.AdInterstitial,
                      shaka.ads.InterstitialPreloadTask>} */
    this.preloadTasks_ = new Map();

    /**
     * @private {!Map<shaka.extern.AdInterstitial, !Array<!HTMLLinkElement>>}
     */
    this.preloadOnDomElements_ = new Map();

    /** @private {shaka.Player} */
    this.player_ = new shaka.Player();

    this.updatePlayerConfig_();

    /** @private {shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {shaka.util.EventManager} */
    this.adEventManager_ = new shaka.util.EventManager();

    /** @private {boolean} */
    this.isEnded_ = false;

    /** @private {boolean} */
    this.playingAd_ = false;

    /** @private {?number} */
    this.lastTime_ = null;

    /** @private {?shaka.extern.AdInterstitial} */
    this.lastPlayedAd_ = null;

    /**
     * Wall-clock time (ms) when the current ad break started playing. Used to
     * re-arm the playout-limit timer when a live EXT-X-DATERANGE update
     * shortens an interstitial that is already playing.
     * @private {?number}
     */
    this.playingAdStartTime_ = null;

    /** @private {?shaka.util.Timer} */
    this.playoutLimitTimer_ = null;

    /** @private {?function()} */
    this.lastOnSkip_ = null;

    /** @private {boolean} */
    this.usingListeners_ = false;

    /** @private {number} */
    this.videoCallbackId_ = -1;

    /** @private {?shaka.util.VideoFrameCallbackHandler} */
    this.videoFrameCallbackHandler_ = null;

    /** @private {?string} */
    this.sessionId_ = null;

    /**
     * Stores the intra-asset seek offset for interstitials that start
     * mid-asset due to _HLS_start_offset. Maps interstitial ID to the
     * number of seconds to seek into that asset.
     * @private {!Map<string, number>}
     */
    this.assetStartOffsets_ = new Map();

    // Note: checkForInterstitials_ and onTimeUpdate_ are defined here because
    // we use it on listener callback, and for unlisten is necessary use the
    // same callback.

    const allowPlayInterstitialNow = (interstitial) => {
      if (!interstitial) {
        return false;
      }
      if (interstitial.overlay) {
        return true;
      }
      if (this.isEnded_) {
        return interstitial.post;
      }
      if (this.baseVideo_.paused) {
        return false;
      }
      return true;
    };

    /** @private {function()} */
    this.checkForInterstitials_ = () => {
      if (this.playingAd_ || !this.lastTime_ ||
          this.basePlayer_.isRemotePlayback()) {
        return;
      }
      this.isEnded_ = this.baseVideo_.ended;
      this.lastTime_ = this.baseVideo_.currentTime;
      const currentInterstitial = this.getCurrentInterstitial_();
      if (currentInterstitial &&
          allowPlayInterstitialNow(currentInterstitial)) {
        this.setupAd_(currentInterstitial, /* sequenceLength= */ 1,
            /* adPosition= */ 1, /* initialTime= */ Date.now());
      }
    };

    /** @private {function()} */
    this.onTimeUpdate_ = () => {
      if (this.playingAd_ || this.lastTime_ ||
          this.basePlayer_.isRemotePlayback()) {
        return;
      }
      this.isEnded_ = this.baseVideo_.ended;
      if (!this.baseVideo_.paused) {
        this.lastTime_ = this.baseVideo_.currentTime;
      }
      let currentInterstitial;
      if (!this.lastPlayedAd_) {
        currentInterstitial =
            this.getCurrentInterstitial_(/* needPreRoll= */ true);
      }
      if (!currentInterstitial) {
        currentInterstitial = this.getCurrentInterstitial_();
      }
      if (currentInterstitial &&
          allowPlayInterstitialNow(currentInterstitial)) {
        this.setupAd_(currentInterstitial, /* sequenceLength= */ 1,
            /* adPosition= */ 1, /* initialTime= */ Date.now());
      }
    };

    /** @private {function()} */
    this.onSeeked_ = () => {
      if (this.playingAd_ || !this.lastTime_ ||
          this.basePlayer_.isRemotePlayback()) {
        return;
      }
      this.isEnded_ = this.baseVideo_.ended;
      const currentTime = this.baseVideo_.currentTime;
      // Remove last played ad when the new time is before the ad time.
      if (this.lastPlayedAd_ &&
          !this.lastPlayedAd_.pre && !this.lastPlayedAd_.post &&
          currentTime < this.lastPlayedAd_.startTime) {
        this.lastPlayedAd_ = null;
      }
      this.maybeResetAssetListsOnSeek_(currentTime);
    };

    /** @private {shaka.util.Timer} */
    this.timeUpdateTimer_ = new shaka.util.Timer(this.checkForInterstitials_);


    /** @private {shaka.util.Timer} */
    this.pollTimer_ = new shaka.util.Timer(() => {
      if (!this.playingAd_ && this.lastTime_ != null &&
          (this.interstitials_.size || this.unresolvedAssetLists_.size)) {
        const currentLoadMode = this.basePlayer_.getLoadMode();
        if (currentLoadMode == shaka.Player.LoadMode.DESTROYED ||
            currentLoadMode == shaka.Player.LoadMode.NOT_LOADED) {
          return;
        }
        let cuepointsChanged = false;
        const seekRange = this.basePlayer_.seekRange();
        for (const descriptor of Array.from(this.unresolvedAssetLists_)) {
          const comparisonTime = descriptor.endTime || descriptor.startTime;
          if ((seekRange.start - comparisonTime) >= 1) {
            // The ad break has fallen out of the seekable window; drop it.
            this.unresolvedAssetLists_.delete(descriptor);
            this.removeEventListeners_();
            cuepointsChanged = true;
          } else if (!descriptor.resolving && !descriptor.resolved &&
              this.shouldResolveAssetListNow_(descriptor)) {
            descriptor.resolving = true;
            this.resolveAssetListDescriptor_(descriptor);
          }
        }
        const interstitials = Array.from(this.interstitials_);
        for (const interstitial of interstitials) {
          if (interstitial == this.lastPlayedAd_) {
            continue;
          }
          const comparisonTime = interstitial.endTime || interstitial.startTime;
          if ((seekRange.start - comparisonTime) >= 1) {
            this.removeInterstitial_(interstitial);
            this.removeEventListeners_();
            if (!interstitial.overlay) {
              cuepointsChanged = true;
            }
          } else {
            if (this.isWithinPreloadWindow_(interstitial)) {
              if (!this.preloadTasks_.has(interstitial) &&
                  this.isPreloadAllowed_(interstitial)) {
                goog.asserts.assert(this.player_, 'Need a player');
                const task = new shaka.ads.InterstitialPreloadTask(
                    this.player_, interstitial, (type, dict) => {
                      this.sendEvent_(type, dict);
                    });
                this.preloadTasks_.set(interstitial, task);
              }
              this.checkPreloadOnDomElements_(interstitial);
            }
          }
        }
        if (cuepointsChanged) {
          this.cuepointsChanged_();
        }
      }
    });

    this.configure(this.basePlayer_.getConfiguration().ads);
  }

  /**
   * Called by the AdManager to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.AdsConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    if (!this.playingAd_) {
      this.determineIfUsingBaseVideo_();
    }
  }

  /**
   * @private
   */
  addEventListeners_() {
    if (this.usingListeners_ ||
        (!this.interstitials_.size && !this.unresolvedAssetLists_.size)) {
      return;
    }
    this.eventManager_.listenMulti(
        this.baseVideo_, ['playing', 'timeupdate'], this.onTimeUpdate_);
    this.eventManager_.listen(
        this.baseVideo_, 'seeked', this.onSeeked_);
    this.eventManager_.listen(
        this.baseVideo_, 'ended', this.checkForInterstitials_);
    let useTimer = true;
    if (!this.isSmartTV_()) {
      this.videoFrameCallbackHandler_?.release();
      const baseVideo = /** @type {!HTMLVideoElement} */ (this.baseVideo_);
      this.videoFrameCallbackHandler_ =
          new shaka.util.VideoFrameCallbackHandler(baseVideo);
      const ret = this.videoFrameCallbackHandler_.start(() => {
        this.checkForInterstitials_();
      });
      useTimer = !ret;
    }
    if (useTimer) {
      this.timeUpdateTimer_.tickEvery(/* seconds= */ 0.025);
    }

    if (this.pollTimer_) {
      this.pollTimer_.tickEvery(/* seconds= */ 1); ;
    }
    this.usingListeners_ = true;
  }

  /**
   * @private
   */
  removeEventListeners_() {
    if (!this.usingListeners_ ||
        this.interstitials_.size || this.unresolvedAssetLists_.size) {
      return;
    }
    this.eventManager_.unlisten(
        this.baseVideo_, 'playing', this.onTimeUpdate_);
    this.eventManager_.unlisten(
        this.baseVideo_, 'timeupdate', this.onTimeUpdate_);
    this.eventManager_.unlisten(
        this.baseVideo_, 'seeked', this.onSeeked_);
    this.eventManager_.unlisten(
        this.baseVideo_, 'ended', this.checkForInterstitials_);
    this.videoFrameCallbackHandler_?.release();
    this.videoFrameCallbackHandler_ = null;
    this.timeUpdateTimer_?.stop();
    this.pollTimer_?.stop();
    this.usingListeners_ = false;
  }

  /**
   * Sets usingBaseVideo_ to true if the ad can be played with the base
   * video. Then, it either creates or destroys the adVideo_, as
   * appropriate.
   * @param {boolean=} force If true, re-create the adVideo_ if it is
   *   appropriate for playback.
   * @private
   */
  determineIfUsingBaseVideo_(force = false) {
    if (!this.adContainer_ || !this.config_) {
      this.usingBaseVideo_ = true;
      return;
    }
    let supportsMultipleMediaElements =
        this.config_.supportsMultipleMediaElements;
    const video = /** @type {HTMLVideoElement} */(this.baseVideo_);
    if (video.controls) {
      supportsMultipleMediaElements = false;
    } else if (video.webkitPresentationMode &&
        video.webkitPresentationMode !== 'inline') {
      supportsMultipleMediaElements = false;
    } else if (video.webkitDisplayingFullscreen) {
      supportsMultipleMediaElements = false;
    }
    if (!force && this.usingBaseVideo_ != supportsMultipleMediaElements) {
      return;
    }
    this.usingBaseVideo_ = !supportsMultipleMediaElements;
    if (this.usingBaseVideo_) {
      this.video_ = this.baseVideo_;
      if (this.adVideo_) {
        if (this.adVideo_.parentElement) {
          this.adContainer_.removeChild(this.adVideo_);
        }
        this.adVideo_ = null;
      }
    } else {
      if (force && this.adVideo_) {
        if (this.adVideo_.parentElement) {
          this.adContainer_.removeChild(this.adVideo_);
        }
        this.adVideo_ = null;
      }
      if (!this.adVideo_) {
        this.adVideo_ = this.createMediaElement_();
      }
      this.video_ = this.adVideo_;
    }
  }


  /**
   * Resets the Interstitial manager and removes any continuous polling.
   */
  stop() {
    if (this.adEventManager_) {
      this.adEventManager_.removeAll();
    }
    this.hlsMetadataIds_.clear();
    this.interstitialIds_.clear();
    this.interstitials_.clear();
    this.sortedInterstitials_ = null;
    this.unresolvedAssetLists_.clear();
    this.preloadOffsets_.clear();
    this.player_.destroyAllPreloads();
    const tasks = Array.from(this.preloadTasks_.values());
    for (const task of tasks) {
      task.release();
    }
    this.preloadTasks_.clear();
    if (this.preloadOnDomElements_.size) {
      const interstitials = Array.from(this.preloadOnDomElements_.keys());
      for (const interstitial of interstitials) {
        this.removePreloadOnDomElements_(interstitial);
      }
    }
    this.preloadOnDomElements_.clear();
    this.assetStartOffsets_.clear();
    this.player_.detach();
    this.isEnded_ = false;
    this.playingAd_ = false;
    this.lastTime_ = null;
    this.lastPlayedAd_ = null;
    this.playingAdStartTime_ = null;
    this.usingBaseVideo_ = true;
    this.video_ = this.baseVideo_;
    this.adVideo_ = null;
    this.sessionId_ = null;
    this.removeBaseStyles_();
    this.removeEventListeners_();
    if (this.adContainer_) {
      shaka.util.Dom.removeAllChildren(this.adContainer_);
    }
    if (this.playoutLimitTimer_) {
      this.playoutLimitTimer_.stop();
      this.playoutLimitTimer_ = null;
    }
  }

  /** @override */
  release() {
    this.stop();
    if (this.eventManager_) {
      this.eventManager_.release();
    }
    if (this.adEventManager_) {
      this.adEventManager_.release();
    }
    if (this.timeUpdateTimer_) {
      this.timeUpdateTimer_.stop();
      this.timeUpdateTimer_ = null;
    }
    if (this.pollTimer_) {
      this.pollTimer_.stop();
      this.pollTimer_ = null;
    }
    this.player_.destroy();
  }

  /**
   * @return {shaka.Player}
   */
  getPlayer() {
    return this.player_;
  }

  /**
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   */
  async addMetadata(hlsMetadata) {
    const id = this.getMetadataValue_(hlsMetadata, 'ID');
    if (id) {
      if (this.hlsMetadataIds_.has(id)) {
        // A subsequent EXT-X-DATERANGE with the same ID augments the existing
        // Date Range with additional attributes (RFC 8216bis Section 4.4.5.1).
        // Consolidate the newly added attributes onto the known interstitial.
        this.updateInterstitials_(hlsMetadata, id);
        return;
      }
      this.hlsMetadataIds_.add(id);
    }
    this.updatePlayerConfig_();
    let adInterstitials = [];
    if (this.getMetadataValue_(hlsMetadata, 'X-OVERLAY-ID') != null) {
      adInterstitials = this.getOverlaysInfo_(hlsMetadata);
    } else {
      adInterstitials = await this.getInterstitialsInfo_(hlsMetadata);
    }
    if (adInterstitials.length) {
      await this.addInterstitials(adInterstitials);
    }
  }

  /**
   * Consolidates a subsequent EXT-X-DATERANGE that shares its ID with an
   * already-known interstitial by augmenting it with newly added attributes,
   * as permitted by RFC 8216bis Section 4.4.5.1. Per the spec, attributes that
   * were already present are left unchanged; only attributes that are newly
   * introduced are applied. This currently supports X-PLAYOUT-LIMIT, which is
   * used to shorten (early-return from) an interstitial in live streams.
   *
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @param {string} id
   * @private
   */
  updateInterstitials_(hlsMetadata, id) {
    const playout = this.getMetadataValue_(hlsMetadata, 'X-PLAYOUT-LIMIT');
    if (playout == null) {
      return;
    }
    const playoutLimit = parseFloat(playout);
    if (isNaN(playoutLimit)) {
      return;
    }
    for (const interstitial of this.interstitials_) {
      if (interstitial.id === id || interstitial.groupId === id) {
        this.applyUpdatedPlayoutLimit_(interstitial, playoutLimit);
      }
    }
    // The asset list may not have been resolved yet; update the descriptor so
    // the resolved interstitials inherit the new playout limit.
    for (const descriptor of this.unresolvedAssetLists_) {
      if (descriptor.id === id && descriptor.playoutLimit == null) {
        descriptor.playoutLimit = playoutLimit;
      }
    }
  }

  /**
   * Applies a newly introduced X-PLAYOUT-LIMIT to an interstitial. If the
   * interstitial is currently playing as a video ad, the playout-limit timer is
   * re-armed so the running ad is truncated.
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {number} playoutLimit
   * @private
   */
  applyUpdatedPlayoutLimit_(interstitial, playoutLimit) {
    // The spec requires attributes present in both tags to keep the same value,
    // so we only set a playout limit that was not previously defined.
    if (interstitial.playoutLimit != null) {
      return;
    }
    interstitial.playoutLimit = playoutLimit;

    const isPlaying = this.playingAd_ && this.lastPlayedAd_ != null &&
        (this.lastPlayedAd_ === interstitial ||
        (interstitial.groupId != null &&
         this.lastPlayedAd_.groupId === interstitial.groupId));
    // Static/overlay ads read interstitial.playoutLimit live on each timer
    // tick, so updating the value above is enough for them. Video ads use a
    // one-shot timer that must be re-armed.
    const isVideoAd = !interstitial.overlay &&
        !(interstitial.mimeType &&
          (interstitial.mimeType.startsWith('image/') ||
           interstitial.mimeType === 'text/html'));
    if (!isPlaying || !isVideoAd || this.playingAdStartTime_ == null) {
      return;
    }
    const elapsed = (Date.now() - this.playingAdStartTime_) / 1000;
    const remaining = playoutLimit - elapsed;
    this.playoutLimitTimer_?.stop();
    this.playoutLimitTimer_ = null;
    if (remaining <= 0) {
      if (this.lastOnSkip_) {
        this.lastOnSkip_();
      }
    } else {
      this.playoutLimitTimer_ = new shaka.util.Timer(() => {
        if (this.lastOnSkip_) {
          this.lastOnSkip_();
        }
      }).tickAfter(remaining);
      this.player_.configure('playRangeEnd', playoutLimit);
    }
  }

  /**
   * Handles a "com.apple.hls.preload" EXT-X-DATERANGE (RFC 8216bis Appendix F),
   * which advises the client to preload another Date Range's resources early.
   * We translate it into a per-interstitial resolutionTimeOffset, computed as
   * the gap between the target's start time and the preload Date Range's start
   * time.
   *
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   */
  addPreloadMetadata(hlsMetadata) {
    const id = this.getMetadataValue_(hlsMetadata, 'ID');
    if (id) {
      if (this.hlsMetadataIds_.has(id)) {
        return;
      }
      this.hlsMetadataIds_.add(id);
    }
    const targetId = this.getMetadataValue_(hlsMetadata, 'X-TARGET-ID');
    if (!targetId) {
      return;
    }
    this.preloadOffsets_.set(targetId, hlsMetadata.startTime);
    // Apply the hint to interstitials and asset lists that are already known.
    for (const interstitial of this.interstitials_) {
      this.applyPreloadOffset_(interstitial);
    }
    for (const descriptor of this.unresolvedAssetLists_) {
      this.applyPreloadOffset_(descriptor);
    }
  }

  /**
   * Sets resolutionTimeOffset from a matching HLS preload hint, if any.
   *
   * @param {{id: ?string, groupId: ?string,
   *          startTime: number,
   *          resolutionTimeOffset: (number|undefined)}} item
   * @private
   */
  applyPreloadOffset_(item) {
    let preloadStart = null;
    if (item.id != null && this.preloadOffsets_.has(item.id)) {
      preloadStart = this.preloadOffsets_.get(item.id);
    } else if (item.groupId != null && this.preloadOffsets_.has(item.groupId)) {
      preloadStart = this.preloadOffsets_.get(item.groupId);
    }
    if (preloadStart != null) {
      item.resolutionTimeOffset = Math.max(0, item.startTime - preloadStart);
    }
  }

  /**
   * @param {string} url
   * @return {!Promise}
   */
  async addAdUrlInterstitial(url) {
    const NetworkingEngine = shaka.net.NetworkingEngine;
    const context = {
      type: NetworkingEngine.AdvancedRequestType.INTERSTITIAL_AD_URL,
    };
    const response = await this.makeAdRequest_(url, context).promise;
    const data = shaka.util.TXml.parseXml(response.data, 'VAST,vmap:VMAP');
    if (!data) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.VAST_INVALID_XML);
    }
    /** @type {!Array<shaka.extern.AdInterstitial>} */
    let interstitials = [];
    if (data.tagName == 'VAST') {
      interstitials = shaka.ads.VastInterstitialParser.parseVastToInterstitials(
          data, this.lastTime_);
    } else if (data.tagName == 'vmap:VMAP') {
      const vastProcessing = async (ad) => {
        const vastResponse = await this.makeAdRequest_(ad.uri, context).promise;
        const vast = shaka.util.TXml.parseXml(vastResponse.data, 'VAST');
        if (!vast) {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.ADS,
              shaka.util.Error.Code.VAST_INVALID_XML);
        }
        interstitials.push(
            ...shaka.ads.VastInterstitialParser.parseVastToInterstitials(
                vast, ad.time));
      };
      const promises = [];
      for (const ad of shaka.ads.VastInterstitialParser.parseVMAP(data)) {
        promises.push(vastProcessing(ad));
      }
      if (promises.length) {
        await Promise.all(promises);
      }
    }
    this.addInterstitials(interstitials);
  }


  /**
   * @param {!Array<shaka.extern.AdInterstitial>} interstitials
   */
  async addInterstitials(interstitials) {
    let cuepointsChanged = false;
    for (const interstitial of interstitials) {
      if (!interstitial.uri) {
        shaka.log.alwaysWarn('Missing URL in interstitial', interstitial);
        continue;
      }
      if (!interstitial.mimeType) {
        try {
          const netEngine = this.player_.getNetworkingEngine();
          goog.asserts.assert(netEngine, 'Need networking engine');
          // eslint-disable-next-line no-await-in-loop
          interstitial.mimeType = await shaka.net.NetworkingUtils.getMimeType(
              interstitial.uri, netEngine,
              this.basePlayer_.getConfiguration().streaming.retryParameters);
        } catch (error) {}
      }
      const interstitialId = this.interstitialId_(interstitial);
      if (this.interstitialIds_.has(interstitialId)) {
        continue;
      }
      if (interstitial.loop && !interstitial.overlay) {
        shaka.log.alwaysWarn('Loop is only supported in overlay interstitials',
            interstitial);
      }
      if (!interstitial.overlay) {
        cuepointsChanged = true;
      }
      this.interstitialIds_.add(interstitialId);
      this.interstitials_.add(interstitial);
      this.sortedInterstitials_ = null;
      this.applyPreloadOffset_(interstitial);
      if (this.isWithinPreloadWindow_(interstitial)) {
        if (!this.preloadTasks_.has(interstitial) &&
            this.isPreloadAllowed_(interstitial)) {
          goog.asserts.assert(this.player_, 'Need a player');
          const task = new shaka.ads.InterstitialPreloadTask(
              this.player_, interstitial, (type, dict) => {
                this.sendEvent_(type, dict);
              });
          this.preloadTasks_.set(interstitial, task);
        }
        this.checkPreloadOnDomElements_(interstitial);
      }
    }
    if (cuepointsChanged) {
      this.cuepointsChanged_();
    }
    this.addEventListeners_();
  }

  /**
   * @return {!HTMLMediaElement}
   * @private
   */
  createMediaElement_() {
    const video = /** @type {!HTMLMediaElement} */(
      document.createElement(this.baseVideo_.tagName));
    video.autoplay = true;
    video.style.position = 'absolute';
    video.style.top = '0';
    video.style.left = '0';
    video.style.width = '100%';
    video.style.height = '100%';
    video.style.display = 'none';
    video.setAttribute('playsinline', '');
    return video;
  }


  /**
   * Returns interstitials_ sorted by descending start time, using a cache that
   * is invalidated whenever interstitials_ changes.
   *
   * @return {!Array<shaka.extern.AdInterstitial>}
   * @private
   */
  getSortedInterstitials_() {
    if (!this.sortedInterstitials_) {
      this.sortedInterstitials_ = Array.from(this.interstitials_).sort(
          (a, b) => b.startTime - a.startTime);
    }
    return this.sortedInterstitials_;
  }

  /**
   * @param {boolean=} needPreRoll
   * @param {?number=} numberToSkip
   * @return {?shaka.extern.AdInterstitial}
   * @private
   */
  getCurrentInterstitial_(needPreRoll = false, numberToSkip = null) {
    let skipped = 0;
    let currentInterstitial = null;
    if (this.interstitials_.size && this.lastTime_ != null) {
      const interstitials = this.getSortedInterstitials_();
      const roundDecimals = (number) => {
        return Math.round(number * 1000) / 1000;
      };
      let interstitialsToCheck = interstitials;
      if (needPreRoll) {
        interstitialsToCheck = interstitials.filter((i) => i.pre);
      } else if (this.isEnded_) {
        interstitialsToCheck = interstitials.filter((i) => i.post);
      } else {
        interstitialsToCheck = interstitials.filter((i) => !i.pre && !i.post);
      }
      for (const interstitial of interstitialsToCheck) {
        let isValid = false;
        if (needPreRoll) {
          isValid = interstitial.pre;
        } else if (this.isEnded_) {
          isValid = interstitial.post;
        } else if (!interstitial.pre && !interstitial.post) {
          const difference =
              this.lastTime_ - roundDecimals(interstitial.startTime);
          let maxDifference = 1;
          if (this.config_.allowStartInMiddleOfInterstitial &&
              interstitial.endTime && interstitial.endTime != Infinity) {
            maxDifference = interstitial.endTime - interstitial.startTime;
          }
          if ((difference > 0 || (difference == 0 && this.lastTime_ == 0)) &&
              (difference <= maxDifference || !interstitial.canJump)) {
            if (numberToSkip == null && this.lastPlayedAd_ &&
                !this.lastPlayedAd_.pre && !this.lastPlayedAd_.post &&
                this.lastPlayedAd_.startTime >= interstitial.startTime) {
              isValid = false;
            } else {
              isValid = true;
            }
          }
        }
        if (isValid && (!this.lastPlayedAd_ ||
            interstitial.startTime >= this.lastPlayedAd_.startTime)) {
          if (skipped == (numberToSkip || 0)) {
            currentInterstitial = interstitial;
          } else if (currentInterstitial && !interstitial.canJump) {
            const currentStartTime =
                roundDecimals(currentInterstitial.startTime);
            const newStartTime =
                roundDecimals(interstitial.startTime);
            if (newStartTime - currentStartTime > 0.001) {
              currentInterstitial = interstitial;
              skipped = 0;
            }
          }
          skipped++;
        }
      }
    }
    return currentInterstitial;
  }


  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} initialTime the clock time the ad started at
   * @param {number=} oncePlayed
   * @private
   */
  setupAd_(interstitial, sequenceLength, adPosition, initialTime,
      oncePlayed = 0) {
    shaka.log.info('Starting interstitial',
        interstitial.startTime, 'at', this.lastTime_);

    this.lastPlayedAd_ = interstitial;

    this.determineIfUsingBaseVideo_();
    goog.asserts.assert(this.video_, 'Must have video');

    if (!this.usingBaseVideo_ && this.adContainer_ &&
        !this.video_.parentElement) {
      this.adContainer_.appendChild(this.video_);
    }

    if (adPosition == 1 && sequenceLength == 1) {
      sequenceLength = Array.from(this.interstitials_).filter((i) => {
        if (interstitial.pre) {
          return i.pre == interstitial.pre;
        } else if (interstitial.post) {
          return i.post == interstitial.post;
        }
        return Math.abs(i.startTime - interstitial.startTime) < 0.001;
      }).length;
    }

    if (interstitial.once) {
      oncePlayed++;
      this.interstitials_.delete(interstitial);
      this.sortedInterstitials_ = null;
      this.removeEventListeners_();
      if (!interstitial.overlay) {
        this.cuepointsChanged_();
      }
    }

    if (interstitial.mimeType) {
      if (interstitial.mimeType.startsWith('image/') ||
          interstitial.mimeType === 'text/html') {
        if (!interstitial.overlay) {
          shaka.log.alwaysWarn('Unsupported interstitial', interstitial);
          return;
        }
        shaka.log.info('Starting interstitial', interstitial);
        this.setupStaticAd_(interstitial, sequenceLength, adPosition,
            oncePlayed);
        return;
      }
    }
    if (this.usingBaseVideo_ && interstitial.overlay) {
      shaka.log.alwaysWarn('Unsupported interstitial', interstitial);
      return;
    }
    shaka.log.info('Starting interstitial', interstitial);
    this.setupVideoAd_(interstitial, sequenceLength, adPosition, initialTime,
        oncePlayed);
  }


  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} oncePlayed
   * @private
   */
  setupStaticAd_(interstitial, sequenceLength, adPosition, oncePlayed) {
    const timeOffset = this.getTimeOffset_(interstitial);

    if (!this.playingAd_) {
      this.playingAdStartTime_ = Date.now();
      const data = (new Map())
          .set('timeOffset', timeOffset)
          .set('startedAt', this.lastTime_);
      this.sendEvent_(shaka.ads.Utils.AD_BREAK_STARTED, data);
    }

    this.playingAd_ = true;

    const overlay = interstitial.overlay;
    goog.asserts.assert(overlay, 'Must have overlay');

    const tagName = interstitial.mimeType == 'text/html' ? 'iframe' : 'img';

    const htmlElement = /** @type {!(HTMLImageElement|HTMLIFrameElement)} */ (
      document.createElement(tagName));
    htmlElement.style.objectFit = 'contain';
    htmlElement.style.position = 'absolute';
    htmlElement.style.border = 'none';

    this.setBaseStyles_(interstitial);

    const basicTask = () => {
      if (this.playoutLimitTimer_) {
        this.playoutLimitTimer_.stop();
        this.playoutLimitTimer_ = null;
      }
      this.adContainer_.removeChild(htmlElement);
      this.removeBaseStyles_(interstitial);
      this.sendEvent_(shaka.ads.Utils.AD_STOPPED);
      this.adEventManager_.removeAll();
      const nextCurrentInterstitial = this.getCurrentInterstitial_(
          interstitial.pre, adPosition - oncePlayed);
      if (nextCurrentInterstitial) {
        this.setupAd_(nextCurrentInterstitial, sequenceLength,
            ++adPosition, /* initialTime= */ Date.now(), oncePlayed);
      } else {
        this.playingAd_ = false;
      }

      if (!this.playingAd_) {
        this.sendEvent_(shaka.ads.Utils.AD_BREAK_ENDED,
            (new Map()).set('timeOffset', timeOffset));
      }
    };

    const ad = new shaka.ads.InterstitialStaticAd(
        interstitial, sequenceLength, adPosition);

    this.sendEvent_(shaka.ads.Utils.AD_IMPRESSION);
    this.sendEvent_(shaka.ads.Utils.AD_STARTED, (new Map()).set('ad', ad));

    if (tagName == 'iframe') {
      htmlElement.src = interstitial.uri;
    } else {
      htmlElement.src = interstitial.uri;
      htmlElement.onerror = (e) => {
        this.sendEvent_(
            shaka.ads.Utils.AD_ERROR, (new Map()).set('originalEvent', e));
        basicTask();
      };
    }

    // Special case for VAST non-linear ads
    if (overlay.viewport.x == 0 && overlay.viewport.y == 0) {
      htmlElement.width = overlay.size.x;
      htmlElement.height = overlay.size.y;
      htmlElement.style.bottom = '10%';
      htmlElement.style.left = '0';
      htmlElement.style.right = '0';
      htmlElement.style.width = '100%';
      if (!overlay.size.y && tagName == 'iframe') {
        htmlElement.style.height = 'auto';
      }
    } else {
      this.applyOverlayPosition_(htmlElement, overlay);
    }
    this.adContainer_.appendChild(htmlElement);

    const startTime = Date.now();
    if (this.playoutLimitTimer_) {
      this.playoutLimitTimer_.stop();
    }
    this.playoutLimitTimer_ = new shaka.util.Timer(() => {
      if (interstitial.playoutLimit &&
          (Date.now() - startTime) / 1000 > interstitial.playoutLimit) {
        this.sendEvent_(shaka.ads.Utils.AD_COMPLETE);
        basicTask();
      } else if (interstitial.endTime &&
          this.baseVideo_.currentTime > interstitial.endTime) {
        this.sendEvent_(shaka.ads.Utils.AD_COMPLETE);
        basicTask();
      } else if (this.baseVideo_.currentTime < interstitial.startTime) {
        this.sendEvent_(shaka.ads.Utils.AD_SKIPPED);
        basicTask();
      }
    });
    if (interstitial.playoutLimit && !interstitial.endTime) {
      this.playoutLimitTimer_.tickAfter(interstitial.playoutLimit);
    } else if (interstitial.endTime) {
      this.playoutLimitTimer_.tickEvery(/* seconds= */ 0.025);
    }
    this.adEventManager_.listen(this.baseVideo_, 'seeked', () => {
      const currentTime = this.baseVideo_.currentTime;
      if (currentTime < interstitial.startTime ||
          (interstitial.endTime && currentTime > interstitial.endTime)) {
        if (this.playoutLimitTimer_) {
          this.playoutLimitTimer_.stop();
        }
        this.sendEvent_(shaka.ads.Utils.AD_SKIPPED);
        basicTask();
      }
    });
    if (interstitial.clickThroughUrl) {
      this.adEventManager_.listen(htmlElement, 'click', (e) => {
        if (!interstitial.clickThroughUrl) {
          return;
        }
        this.sendEvent_(shaka.ads.Utils.AD_CLICKED);
        window.open(interstitial.clickThroughUrl, '_blank');
      });
    }
  }


  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} initialTime the clock time the ad started at
   * @param {number} oncePlayed
   * @private
   */
  async setupVideoAd_(interstitial, sequenceLength, adPosition, initialTime,
      oncePlayed) {
    goog.asserts.assert(this.video_, 'Must have video');
    const startTime = Date.now();

    const timeOffset = this.getTimeOffset_(interstitial);

    if (!this.playingAd_) {
      this.playingAdStartTime_ = Date.now();
      const data = (new Map())
          .set('timeOffset', timeOffset)
          .set('startedAt', this.lastTime_);
      this.sendEvent_(shaka.ads.Utils.AD_BREAK_STARTED, data);
    }

    this.playingAd_ = true;

    let unloadingInterstitial = false;

    const updateBaseVideoTime = () => {
      if (!this.usingBaseVideo_ && !interstitial.overlay) {
        if (interstitial.resumeOffset == null) {
          if (interstitial.timelineRange && interstitial.endTime &&
              interstitial.endTime != Infinity) {
            if (this.baseVideo_.currentTime != interstitial.endTime) {
              this.baseVideo_.currentTime = interstitial.endTime;
            }
          } else {
            const now = Date.now();
            this.baseVideo_.currentTime += (now - initialTime) / 1000;
            initialTime = now;
          }
        }
      }
    };

    const basicTask = async (isSkip, isBadHttpStatus) => {
      if (!isBadHttpStatus) {
        updateBaseVideoTime();
      }
      // Optimization to avoid returning to main content when there is another
      // interstitial below.
      let nextCurrentInterstitial = this.getCurrentInterstitial_(
          interstitial.pre, adPosition - oncePlayed);
      if (isSkip && interstitial.groupId) {
        while (nextCurrentInterstitial &&
            nextCurrentInterstitial.groupId == interstitial.groupId) {
          adPosition++;
          nextCurrentInterstitial = this.getCurrentInterstitial_(
              interstitial.pre, adPosition - oncePlayed);
        }
      }
      if (this.playoutLimitTimer_ && (!interstitial.groupId ||
          (nextCurrentInterstitial &&
            nextCurrentInterstitial.groupId != interstitial.groupId))) {
        this.playoutLimitTimer_.stop();
        this.playoutLimitTimer_ = null;
      }
      this.removeBaseStyles_(interstitial);
      if (!nextCurrentInterstitial || nextCurrentInterstitial.overlay) {
        if (interstitial.post) {
          this.lastTime_ = null;
          this.lastPlayedAd_ = null;
        }
        if (this.usingBaseVideo_) {
          await this.player_.detach();
        } else {
          await this.player_.unload();
        }
        if (this.usingBaseVideo_) {
          let offset = interstitial.resumeOffset;
          if (offset == null) {
            if (interstitial.timelineRange && interstitial.endTime &&
                interstitial.endTime != Infinity) {
              offset = interstitial.endTime - (this.lastTime_ || 0);
            } else {
              offset = (Date.now() - initialTime) / 1000;
            }
          }
          this.sendEvent_(
              shaka.ads.Utils.AD_CONTENT_RESUME_REQUESTED,
              (new Map()).set('offset', offset));
        } else if (this.basePlayer_.isLive()) {
          if (interstitial.resumeOffset != null &&
              interstitial.resumeOffset != 0) {
            this.baseVideo_.currentTime += interstitial.resumeOffset;
          }
        }
        this.sendEvent_(shaka.ads.Utils.AD_STOPPED);
        this.adEventManager_.removeAll();
        this.playingAd_ = false;
        if (!this.usingBaseVideo_) {
          this.video_.style.display = 'none';
          if (!isBadHttpStatus) {
            updateBaseVideoTime();
          }
          if (!this.isEnded_) {
            this.baseVideo_.play();
          }
        } else {
          this.cuepointsChanged_();
        }
      }
      if (nextCurrentInterstitial &&
          this.usingBaseVideo_ && this.isSmartTV_()) {
        await this.player_.detach();
        this.determineIfUsingBaseVideo_(/* force= */ true);
      } else {
        this.determineIfUsingBaseVideo_();
      }
      if (nextCurrentInterstitial) {
        this.sendEvent_(shaka.ads.Utils.AD_STOPPED);
        this.adEventManager_.removeAll();
        this.setupAd_(nextCurrentInterstitial, sequenceLength,
            ++adPosition, initialTime, oncePlayed);
      }
      if (!this.playingAd_) {
        this.sendEvent_(shaka.ads.Utils.AD_BREAK_ENDED,
            (new Map()).set('timeOffset', timeOffset));
        this.playoutLimitTimer_?.stop();
        this.playoutLimitTimer_ = null;
      }
    };

    /**
     * @param {!shaka.util.Error} e
     * @param {boolean} initial Indicate whether the error is from the initial
     *                          load or in the middle of the stream.
     */
    const error = async (e, initial) => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      const isBadHttpStatus =
          initial && e.code === shaka.util.Error.Code.BAD_HTTP_STATUS;
      this.sendEvent_(shaka.ads.Utils.AD_ERROR,
          (new Map()).set('originalEvent', e));
      await basicTask(/* isSkip= */ false, isBadHttpStatus);
    };
    const complete = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      await basicTask(/* isSkip= */ false, /* isBadHttpStatus= */ false);
      this.sendEvent_(shaka.ads.Utils.AD_COMPLETE);
    };
    this.lastOnSkip_ = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.sendEvent_(shaka.ads.Utils.AD_SKIPPED);
      await basicTask(/* isSkip= */ true, /* isBadHttpStatus= */ false);
    };

    const ad = new shaka.ads.InterstitialAd(this.video_,
        interstitial, this.lastOnSkip_, sequenceLength, adPosition,
        !this.usingBaseVideo_);
    if (!this.usingBaseVideo_) {
      ad.setMuted(this.baseVideo_.muted);
      ad.setVolume(this.baseVideo_.volume);
    }

    this.sendEvent_(shaka.ads.Utils.AD_IMPRESSION);
    this.sendEvent_(shaka.ads.Utils.AD_STARTED, (new Map()).set('ad', ad));

    let prevCanSkipNow = ad.canSkipNow();
    if (prevCanSkipNow) {
      this.sendEvent_(shaka.ads.Utils.AD_SKIP_STATE_CHANGED);
    }
    if (this.preloadTasks_.has(interstitial)) {
      const task = this.preloadTasks_.get(interstitial);
      const initialError = task.getInitialError();
      if (initialError) {
        this.preloadTasks_.delete(interstitial);
        error(initialError, /* initial= */ true);
        return;
      }
    }
    this.adEventManager_.listenOnce(this.player_, 'error', (e) => {
      error(e['detail'], /* initial= */ false);
    });
    this.adEventManager_.listen(this.video_, 'timeupdate', () => {
      const duration = this.video_.duration;
      if (!duration) {
        return;
      }
      const currentCanSkipNow = ad.canSkipNow();
      if (prevCanSkipNow != currentCanSkipNow &&
          ad.getRemainingTime() > 0 && ad.getDuration() > 0) {
        this.sendEvent_(shaka.ads.Utils.AD_SKIP_STATE_CHANGED);
      }
      prevCanSkipNow = currentCanSkipNow;
      if (!this.usingBaseVideo_ && !interstitial.overlay &&
          interstitial.resumeOffset == null && interstitial.timelineRange &&
          interstitial.endTime && interstitial.endTime != Infinity &&
          this.baseVideo_.currentTime != interstitial.endTime) {
        const baseSeekRange = this.basePlayer_.seekRange();
        if (baseSeekRange.end >= interstitial.endTime) {
          this.baseVideo_.currentTime = interstitial.endTime;
        }
      }
    });
    this.adEventManager_.listenOnce(this.player_, 'firstquartile', () => {
      updateBaseVideoTime();
      this.sendEvent_(shaka.ads.Utils.AD_FIRST_QUARTILE);
    });
    this.adEventManager_.listenOnce(this.player_, 'midpoint', () => {
      updateBaseVideoTime();
      this.sendEvent_(shaka.ads.Utils.AD_MIDPOINT);
    });
    this.adEventManager_.listenOnce(this.player_, 'thirdquartile', () => {
      updateBaseVideoTime();
      this.sendEvent_(shaka.ads.Utils.AD_THIRD_QUARTILE);
    });
    this.adEventManager_.listenOnce(this.player_, 'complete', complete);
    let adPlayingFired = false;
    this.adEventManager_.listen(this.video_, 'play', () => {
      if (!adPlayingFired) {
        adPlayingFired = true;
        this.sendEvent_(shaka.ads.Utils.AD_PLAYING,
            (new Map()).set('ad', ad));
      } else {
        this.sendEvent_(shaka.ads.Utils.AD_RESUMED);
      }
    });
    this.adEventManager_.listen(this.video_, 'pause', () => {
      // playRangeEnd in src= causes the ended event not to be fired when that
      // position is reached, instead pause event is fired.
      const currentConfig = this.player_.getConfiguration();
      if (this.video_.currentTime >= currentConfig.playRangeEnd) {
        complete();
        return;
      }
      this.sendEvent_(shaka.ads.Utils.AD_PAUSED);
    });
    this.adEventManager_.listen(this.video_, 'volumechange', () => {
      if (this.video_.muted) {
        this.sendEvent_(shaka.ads.Utils.AD_MUTED);
      } else {
        this.sendEvent_(shaka.ads.Utils.AD_VOLUME_CHANGED);
      }
      if (!this.usingBaseVideo_) {
        this.baseVideo_.volume = this.video_.volume;
        this.baseVideo_.muted = this.video_.muted;
      }
    });
    if (interstitial.clickThroughUrl) {
      const adContainer = this.adContainer_ || this.video_;
      this.adEventManager_.listen(adContainer, 'click', (e) => {
        if (!interstitial.clickThroughUrl) {
          return;
        }
        if (!ad.isPaused()) {
          ad.pause();
        }
        window.open(interstitial.clickThroughUrl, '_blank');
      });
    }

    if (this.usingBaseVideo_ && adPosition == 1) {
      this.sendEvent_(shaka.ads.Utils.AD_CONTENT_PAUSE_REQUESTED,
          (new Map()).set('saveLivePosition', true));
      const detachBasePlayerPromise = Promise.withResolvers();
      const checkState = async (e) => {
        if (e['state'] == 'detach') {
          if (this.isSmartTV_()) {
            await shaka.util.Functional.delay(0.1);
          }
          detachBasePlayerPromise.resolve();
          this.adEventManager_.unlisten(
              this.basePlayer_, 'onstatechange', checkState);
        }
      };
      this.adEventManager_.listen(
          this.basePlayer_, 'onstatechange', checkState);
      await detachBasePlayerPromise.promise;
    }
    this.setBaseStyles_(interstitial);
    if (!this.usingBaseVideo_) {
      this.video_.style.display = '';
      if (interstitial.overlay) {
        this.video_.loop = interstitial.loop;
        this.applyOverlayPosition_(
            /** @type {!HTMLElement} */ (this.video_), interstitial.overlay);
      } else {
        this.baseVideo_.pause();
        if (!this.basePlayer_.isLive()) {
          if (interstitial.resumeOffset != null &&
              interstitial.resumeOffset != 0) {
            this.baseVideo_.currentTime += interstitial.resumeOffset;
          }
        }
        this.video_.loop = false;
        this.video_.style.height = '100%';
        this.video_.style.left = '0';
        this.video_.style.top = '0';
        this.video_.style.width = '100%';
      }
    }

    try {
      this.updatePlayerConfig_();
      if (interstitial.startTime && interstitial.endTime &&
          interstitial.endTime != Infinity &&
          interstitial.startTime != interstitial.endTime) {
        const duration = interstitial.endTime - interstitial.startTime;
        if (duration > 0) {
          this.player_.configure('playRangeEnd', duration);
        }
      }
      let playerStartTime = null;
      if (adPosition == 1 && !interstitial.pre && !interstitial.post &&
          this.config_.allowStartInMiddleOfInterstitial &&
          this.lastTime_ != null &&
          interstitial.startTime <= this.lastTime_ &&
          (!interstitial.endTime || interstitial.endTime > this.lastTime_)) {
        if (interstitial.id &&
            this.assetStartOffsets_.has(interstitial.id)) {
          const offset = this.assetStartOffsets_.get(interstitial.id);
          this.assetStartOffsets_.delete(interstitial.id);
          if (Math.abs(offset) > 0.25) {
            playerStartTime = offset;
          }
        } else {
          const newPosition = this.lastTime_ - interstitial.startTime;
          if (Math.abs(newPosition) > 0.25) {
            playerStartTime = newPosition;
          }
        }
      }
      if (adPosition == 1) {
        this.playoutLimitTimer_?.stop();
        this.playoutLimitTimer_ = null;
      }
      let playoutLimit = interstitial.playoutLimit;
      if (playoutLimit && !this.playoutLimitTimer_) {
        if (playerStartTime) {
          playoutLimit -= playerStartTime;
        }
        this.playoutLimitTimer_ = new shaka.util.Timer(() => {
          this.lastOnSkip_();
        }).tickAfter(playoutLimit);
        this.player_.configure('playRangeEnd', playoutLimit);
      }
      if (this.player_.getMediaElement() !== this.video_) {
        await this.player_.attach(this.video_);
      }
      if (this.preloadTasks_.has(interstitial)) {
        const task = this.preloadTasks_.get(interstitial);
        this.preloadTasks_.delete(interstitial);
        const error = task.getInitialError();
        if (error) {
          throw error;
        }
        const preloadManager = task.getPreloadManager();
        if (preloadManager) {
          await this.player_.load(
              preloadManager,
              playerStartTime);
        } else {
          await this.player_.load(
              interstitial.uri,
              playerStartTime,
              interstitial.mimeType || undefined);
        }
      } else {
        await this.player_.load(
            interstitial.uri,
            playerStartTime,
            interstitial.mimeType || undefined);
      }
      if (!interstitial.overlay || !this.baseVideo_.paused) {
        this.video_.play();
      } else {
        this.video_.pause();
      }
      const loadTime = (Date.now() - startTime) / 1000;
      this.sendEvent_(shaka.ads.Utils.ADS_LOADED,
          (new Map()).set('loadTime', loadTime));
      if (this.usingBaseVideo_) {
        this.baseVideo_.play();
      }
      if (interstitial.overlay) {
        if (!interstitial.pre && !interstitial.post &&
            (!this.basePlayer_.isLive() || interstitial.startTime > 0)) {
          const setPosition = () => {
            const newPosition =
                this.baseVideo_.currentTime - interstitial.startTime;
            if (Math.abs(newPosition - this.video_.currentTime) > 0.1) {
              this.video_.currentTime = newPosition;
            }
          };
          this.adEventManager_.listenOnce(this.video_, 'playing', setPosition);
          this.adEventManager_.listen(this.baseVideo_, 'seeking', setPosition);
        }
        this.adEventManager_.listen(this.baseVideo_, 'seeked', () => {
          const currentTime = this.baseVideo_.currentTime;
          if (currentTime < interstitial.startTime ||
              (interstitial.endTime && currentTime > interstitial.endTime)) {
            this.lastOnSkip_();
          }
        });
      }
    } catch (e) {
      if (!this.playingAd_) {
        return;
      }
      error(e, /* initial= */ true);
    }
  }

  /**
   * Positions an element within the ad container according to an overlay's
   * viewport/topLeft/size, expressed as CSS percentages.
   *
   * @param {!HTMLElement} element
   * @param {!shaka.extern.AdPositionInfo} overlay
   * @private
   */
  applyOverlayPosition_(element, overlay) {
    const viewport = overlay.viewport;
    const topLeft = overlay.topLeft;
    const size = overlay.size;
    element.style.height = (size.y / viewport.y * 100) + '%';
    element.style.left = (topLeft.x / viewport.x * 100) + '%';
    element.style.top = (topLeft.y / viewport.y * 100) + '%';
    element.style.width = (size.x / viewport.x * 100) + '%';
  }

  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @private
   */
  setBaseStyles_(interstitial) {
    if (interstitial.displayOnBackground) {
      this.baseVideo_.style.zIndex = '1';
    }
    if (interstitial.currentVideo != null) {
      const currentVideo = interstitial.currentVideo;
      this.baseVideo_.style.transformOrigin = 'top left';
      let addTransition = true;
      const transforms = [];
      const translateX = currentVideo.topLeft.x / currentVideo.viewport.x * 100;
      if (translateX > 0 && translateX <= 100) {
        transforms.push(`translateX(${translateX}%)`);
        // In the case of double box ads we do not want transitions.
        addTransition = false;
      }
      const translateY = currentVideo.topLeft.y / currentVideo.viewport.y * 100;
      if (translateY > 0 && translateY <= 100) {
        transforms.push(`translateY(${translateY}%)`);
        // In the case of double box ads we do not want transitions.
        addTransition = false;
      }
      const scaleX = currentVideo.size.x / currentVideo.viewport.x;
      if (scaleX < 1) {
        transforms.push(`scaleX(${scaleX})`);
      }
      const scaleY = currentVideo.size.y / currentVideo.viewport.y;
      if (scaleX < 1) {
        transforms.push(`scaleY(${scaleY})`);
      }
      if (transforms.length) {
        this.baseVideo_.style.transform = transforms.join(' ');
      }
      if (addTransition) {
        this.baseVideo_.style.transition = 'transform 250ms';
      }
    }
    if (this.adContainer_) {
      if (interstitial.clickThroughUrl) {
        this.adContainer_.setAttribute('ad-active', 'true');
        this.adContainer_.style.pointerEvents = '';
      } else {
        this.adContainer_.style.pointerEvents = 'none';
      }
      if (interstitial.background) {
        this.adContainer_.style.background = interstitial.background;
      }
    }
    if (this.adVideo_) {
      if (interstitial.overlay) {
        this.adVideo_.style.background = '';
      } else {
        this.adVideo_.style.background = 'rgb(0, 0, 0)';
      }
    }
  }

  /**
   * @param {?shaka.extern.AdInterstitial=} interstitial
   * @private
   */
  removeBaseStyles_(interstitial) {
    if (!interstitial || interstitial.displayOnBackground) {
      this.baseVideo_.style.zIndex = '';
    }
    if (!interstitial || interstitial.currentVideo != null) {
      this.baseVideo_.style.transformOrigin = '';
      this.baseVideo_.style.transition = '';
      this.baseVideo_.style.transform = '';
    }
    if (this.adContainer_) {
      this.adContainer_.removeAttribute('ad-active');
      this.adContainer_.style.pointerEvents = '';
      if (!interstitial || interstitial.background) {
        this.adContainer_.style.background = '';
      }
    }
    if (this.adVideo_) {
      this.adVideo_.style.background = '';
    }
  }

  /**
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @return {!Promise<!Array<shaka.extern.AdInterstitial>>}
   * @private
   */
  async getInterstitialsInfo_(hlsMetadata) {
    const NumberUtils = shaka.util.NumberUtils;

    const interstitialsAd = [];
    if (!hlsMetadata) {
      return interstitialsAd;
    }
    const assetUri = this.getMetadataValue_(hlsMetadata, 'X-ASSET-URI');
    const assetList = this.getMetadataValue_(hlsMetadata, 'X-ASSET-LIST');
    if (!assetUri && !assetList) {
      return interstitialsAd;
    }
    const id = this.getMetadataValue_(hlsMetadata, 'ID');
    const {startTime, endTime} = this.getInterstitialTimes_(hlsMetadata, id);
    const restrict = this.getMetadataValue_(hlsMetadata, 'X-RESTRICT');
    let isSkippable = true;
    let canJump = true;
    if (restrict != null) {
      isSkippable = !restrict.includes('SKIP');
      canJump = !restrict.includes('JUMP');
    }
    let skipOffset = isSkippable ? 0 : null;
    const skipControlOffset =
        this.getMetadataValue_(hlsMetadata, 'X-SKIP-CONTROL-OFFSET');
    if (skipControlOffset != null) {
      skipOffset = parseFloat(skipControlOffset);
      if (isNaN(skipOffset)) {
        skipOffset = isSkippable ? 0 : null;
      }
    }
    let skipFor = null;
    const skipControlDuration =
        this.getMetadataValue_(hlsMetadata, 'X-SKIP-CONTROL-DURATION');
    if (skipControlDuration != null) {
      skipFor = parseFloat(skipControlDuration);
      if (isNaN(skipOffset)) {
        skipFor = null;
      }
    }
    let resumeOffset = null;
    const resume = this.getMetadataValue_(hlsMetadata, 'X-RESUME-OFFSET');
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
    const playout = this.getMetadataValue_(hlsMetadata, 'X-PLAYOUT-LIMIT');
    if (playout != null) {
      playoutLimit = parseFloat(playout);
      if (isNaN(playoutLimit)) {
        playoutLimit = null;
      }
    }
    const {once, pre, post} = this.parseCue_(hlsMetadata);
    let timelineRange = false;
    const timelineOccupies =
        this.getMetadataValue_(hlsMetadata, 'X-TIMELINE-OCCUPIES');
    if (timelineOccupies != null) {
      timelineRange = timelineOccupies.includes('RANGE');
    } else if (resume == null && this.basePlayer_.isLive()) {
      timelineRange = !pre && !post;
    }
    if (assetUri != null) {
      if (!assetUri) {
        return interstitialsAd;
      }
      interstitialsAd.push({
        id,
        groupId: null,
        startTime,
        endTime,
        uri: this.getUriWithHlsParams_(assetUri),
        mimeType: null,
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
        loop: false,
        overlay: null,
        displayOnBackground: false,
        currentVideo: null,
        background: null,
        clickThroughUrl: null,
        tracking: null,
      });
    } else if (assetList != null) {
      if (!assetList) {
        return interstitialsAd;
      }
      /** @type {shaka.ads.InterstitialAdManager.AssetListDescriptor} */
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
      // A matching HLS preload Date Range may already tell us how early to
      // resolve this asset list.
      this.applyPreloadOffset_(descriptor);
      // Defer resolving the asset list (and therefore the ad decision request)
      // until playback approaches the interstitial. Pre/post-rolls are resolved
      // eagerly because they play at the content boundaries with no lead time.
      // This avoids a burst of concurrent requests at parse time.
      // See https://github.com/shaka-project/shaka-player/issues/10191
      if (this.shouldResolveAssetListNow_(descriptor)) {
        const resolved = await this.resolveAssetList_(descriptor);
        if (resolved.length) {
          // The cue point is emitted by addInterstitials, not here.
          this.maybeRetainResolvedAssetList_(descriptor);
        }
        return resolved;
      }
      this.addUnresolvedAssetList_(descriptor);
    }
    return interstitialsAd;
  }

  /**
   * Resolves an HLS X-ASSET-LIST: performs the ad decision request and expands
   * it into the individual interstitials it contains.
   *
   * @param {shaka.ads.InterstitialAdManager.AssetListDescriptor} descriptor
   * @return {!Promise<!Array<shaka.extern.AdInterstitial>>}
   * @private
   */
  async resolveAssetList_(descriptor) {
    /** @type {!Array<shaka.extern.AdInterstitial>} */
    const interstitialsAd = [];
    // skipOffset and skipFor may be overridden by the SKIP-CONTROL block below;
    // the rest of the metadata is read directly from the descriptor.
    let skipOffset = descriptor.skipOffset;
    let skipFor = descriptor.skipFor;
    try {
      const NetworkingEngine = shaka.net.NetworkingEngine;
      const context = {
        type: NetworkingEngine.AdvancedRequestType.INTERSTITIAL_ASSET_LIST,
      };
      let hlsStartOffset = 0;
      if (!descriptor.pre && !descriptor.post &&
          this.config_.allowStartInMiddleOfInterstitial &&
          this.basePlayer_.isLive()) {
        const currentTime = this.lastTime_ ?? this.baseVideo_.currentTime;
        hlsStartOffset = currentTime - descriptor.startTime;
      }
      const assetListUri =
          this.getUriWithHlsParams_(descriptor.assetListUri, hlsStartOffset);
      const response = await this.makeAdRequest_(
          assetListUri, context).promise;
      const data = shaka.util.StringUtils.fromUTF8(response.data);
      /** @type {!shaka.ads.InterstitialAdManager.AssetsList} */
      const dataAsJson =
      /** @type {!shaka.ads.InterstitialAdManager.AssetsList} */ (
          JSON.parse(data));
      const skipControl = dataAsJson['SKIP-CONTROL'];
      if (skipControl) {
        const skipControlOffsetList = skipControl['OFFSET'];
        if ((typeof skipControlOffsetList) == 'number') {
          skipOffset = parseFloat(skipControlOffsetList);
          if (isNaN(skipControlOffsetList)) {
            skipOffset = descriptor.isSkippable ? 0 : null;
          }
        }
        const skipControlDurationList = skipControl['DURATION'];
        if ((typeof skipControlDurationList) == 'number') {
          skipFor = parseFloat(skipControlDurationList);
          if (isNaN(skipFor)) {
            skipFor = null;
          }
        }
      }
      let cumulativeDuration = 0;
      for (let i = 0; i < dataAsJson['ASSETS'].length; i++) {
        const asset = dataAsJson['ASSETS'][i];
        const assetUri = asset['URI'];
        const assetDuration = parseFloat(asset['DURATION']) || 0;
        if (hlsStartOffset > 0 && assetDuration > 0) {
          const assetEnd = cumulativeDuration + assetDuration;
          if (assetEnd <= hlsStartOffset) {
            cumulativeDuration = assetEnd;
            continue;
          }
        }
        if (assetUri) {
          const resolvedUri = shaka.util.URL.resolve(response.uri, assetUri);
          const interstitial = {
            id: descriptor.id + '_shaka_asset_' + i,
            groupId: descriptor.id,
            startTime: descriptor.startTime,
            endTime: descriptor.endTime,
            uri: this.getUriWithHlsParams_(resolvedUri),
            mimeType: null,
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
            loop: false,
            overlay: null,
            displayOnBackground: false,
            currentVideo: null,
            background: null,
            clickThroughUrl: null,
            tracking: null,
          };
          const adCreativeSignaling = asset['X-AD-CREATIVE-SIGNALING'];
          if (adCreativeSignaling) {
            const payloadSlot =
                adCreativeSignaling.payload && adCreativeSignaling.payload[0];
            if (payloadSlot) {
              interstitial.clickThroughUrl = payloadSlot.clickThrough;
              if (payloadSlot.tracking) {
                const Utils = shaka.ads.Utils;
                interstitial.tracking =
                    Utils.createTrackingFromEvents(payloadSlot.tracking);
              }
            }
          }
          if (hlsStartOffset > 0 &&
              cumulativeDuration < hlsStartOffset) {
            const intraAssetOffset =
                hlsStartOffset - cumulativeDuration;
            this.assetStartOffsets_.set(
                interstitial.id, intraAssetOffset);
          }
          interstitialsAd.push(interstitial);
        }
        cumulativeDuration += assetDuration;
      }
    } catch (e) {
      // The request failed (network error, non-2xx response, or invalid JSON).
      // A successful response with an empty ASSETS array does not reach here;
      // it simply yields an empty interstitial list. Log so failed resolutions
      // are distinguishable from legitimately empty asset lists.
      shaka.log.warning(
          'Failed to resolve interstitial asset list',
          descriptor.assetListUri, e);
    }
    return interstitialsAd;
  }

  /**
   * Stores an asset list descriptor whose resolution has been deferred, and
   * ensures the polling that will eventually resolve it is running.
   *
   * @param {shaka.ads.InterstitialAdManager.AssetListDescriptor} descriptor
   * @private
   */
  addUnresolvedAssetList_(descriptor) {
    this.unresolvedAssetLists_.add(descriptor);
    // Asset list interstitials are never overlays, so they always contribute a
    // cue point. Surface it now so the timeline UI is not delayed.
    this.cuepointsChanged_();
    this.addEventListeners_();
  }

  /**
   * Resolves a deferred asset list descriptor and adds the resulting
   * interstitials. Invoked from the poll timer; not awaited.
   *
   * @param {shaka.ads.InterstitialAdManager.AssetListDescriptor} descriptor
   * @private
   */
  async resolveAssetListDescriptor_(descriptor) {
    const interstitials = await this.resolveAssetList_(descriptor);
    descriptor.resolving = false;
    if (interstitials.length) {
      this.maybeRetainResolvedAssetList_(descriptor);
      await this.addInterstitials(interstitials);
    } else {
      // The asset list yielded nothing (empty or failed). Drop its cue point
      // and stop listening if there is nothing left to do.
      this.unresolvedAssetLists_.delete(descriptor);
      this.cuepointsChanged_();
      this.removeEventListeners_();
    }
  }

  /**
   * After an asset list resolves, either retain its descriptor (so a later seek
   * back into a live break can re-request it with an updated _HLS_start_offset)
   * or drop it. Retaining is only useful for live streams that allow starting
   * in the middle of an interstitial.
   *
   * @param {shaka.ads.InterstitialAdManager.AssetListDescriptor} descriptor
   * @private
   */
  maybeRetainResolvedAssetList_(descriptor) {
    if (this.shouldRetainAssetList_()) {
      descriptor.resolved = true;
      this.unresolvedAssetLists_.add(descriptor);
    } else {
      this.unresolvedAssetLists_.delete(descriptor);
    }
  }

  /**
   * Whether resolved asset lists should be retained so they can be re-requested
   * after a seek. Only meaningful for live streams that allow starting in the
   * middle of an interstitial, where the _HLS_start_offset would differ.
   *
   * @return {boolean}
   * @private
   */
  shouldRetainAssetList_() {
    return !!this.config_ && this.config_.allowStartInMiddleOfInterstitial &&
        this.basePlayer_.isLive();
  }

  /**
   * On a seek into a live break, an already-resolved asset list must be
   * re-requested with an updated _HLS_start_offset that reflects the new
   * playhead position. Reset the cache of any resolved asset list whose range
   * now contains the playhead so the poll resolves it again.
   *
   * @param {number} currentTime
   * @private
   */
  maybeResetAssetListsOnSeek_(currentTime) {
    if (!this.shouldRetainAssetList_()) {
      return;
    }
    for (const descriptor of this.unresolvedAssetLists_) {
      if (!descriptor.resolved) {
        continue;
      }
      const endTime = descriptor.endTime;
      const inRange = currentTime >= descriptor.startTime &&
          (endTime == null || endTime == Infinity || currentTime < endTime);
      if (!inRange) {
        continue;
      }
      // Allow the asset list to be resolved again with the new offset.
      descriptor.resolved = false;
      this.removeResolvedAssetListGroup_(descriptor.id);
    }
  }

  /**
   * Removes the interstitials previously resolved from the asset list with the
   * given group id, so the asset list can be resolved again.
   *
   * @param {?string} groupId
   * @private
   */
  removeResolvedAssetListGroup_(groupId) {
    if (groupId == null) {
      return;
    }
    for (const interstitial of Array.from(this.interstitials_)) {
      if (interstitial.groupId === groupId) {
        this.removeInterstitial_(interstitial);
      }
    }
  }

  /**
   * Removes an interstitial and releases any resources associated with it
   * (preload tasks, preload-on-DOM link elements and bookkeeping sets).
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @private
   */
  removeInterstitial_(interstitial) {
    if (this.preloadTasks_.has(interstitial)) {
      this.preloadTasks_.get(interstitial).release();
      this.preloadTasks_.delete(interstitial);
    }
    this.removePreloadOnDomElements_(interstitial);
    const interstitialId = this.interstitialId_(interstitial);
    this.interstitialIds_.delete(interstitialId);
    this.interstitials_.delete(interstitial);
    this.sortedInterstitials_ = null;
    if (this.lastPlayedAd_ === interstitial) {
      this.lastPlayedAd_ = null;
    }
  }

  /**
   * The look-ahead time (in seconds) used to decide how early an interstitial
   * is resolved/preloaded: the per-interstitial resolutionTimeOffset (DASH
   * earliestResolutionTimeOffset / HLS preload Date Range) when set, otherwise
   * the configured default.
   *
   * @param {{resolutionTimeOffset: (number|undefined)}} item
   * @return {number}
   * @private
   */
  resolutionAheadTime_(item) {
    return item.resolutionTimeOffset ||
        this.config_.interstitialPreloadAheadTime;
  }

  /**
   * Whether the given asset list should be resolved immediately rather than
   * deferred until playback approaches it.
   *
   * @param {shaka.ads.InterstitialAdManager.AssetListDescriptor} descriptor
   * @return {boolean}
   * @private
   */
  shouldResolveAssetListNow_(descriptor) {
    // Pre/post-rolls play at the content boundaries with no look-ahead, and are
    // singular, so they are resolved eagerly without causing request bursts.
    if (descriptor.pre || descriptor.post) {
      return true;
    }
    // Forced ad at the very start.
    if (descriptor.startTime == 0 && !descriptor.canJump) {
      return true;
    }
    // Compare against the current playhead. Before the first time update
    // lastTime_ is null, in which case the media element's currentTime is a
    // good enough proxy (typically 0 at load, so only imminent ad breaks
    // resolve eagerly and the rest stay deferred).
    const currentTime =
        this.lastTime_ != null ? this.lastTime_ : this.baseVideo_.currentTime;
    let baseVideoDuration = Infinity;
    if (!this.playingAd_ && this.baseVideo_.duration) {
      baseVideoDuration = this.baseVideo_.duration;
    }
    const startTime = Math.min(descriptor.startTime, baseVideoDuration);
    // Still further ahead than the look-ahead window: keep deferring.
    if (startTime - currentTime > this.resolutionAheadTime_(descriptor)) {
      return false;
    }
    // Already past the end of a finite range, e.g. we joined a live stream
    // after the ad break ended: it can no longer be played.
    const endTime = descriptor.endTime;
    if (endTime != null && endTime != Infinity && currentTime >= endTime) {
      return false;
    }
    return true;
  }

  /**
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @return {!Array<shaka.extern.AdInterstitial>}
   * @private
   */
  getOverlaysInfo_(hlsMetadata) {
    const interstitialsAd = [];
    if (!hlsMetadata) {
      return interstitialsAd;
    }
    const uri = this.getMetadataValue_(hlsMetadata, 'X-ASSET-URI');
    if (!uri) {
      return interstitialsAd;
    }
    const id = this.getMetadataValue_(hlsMetadata, 'X-OVERLAY-ID');
    const {startTime, endTime} = this.getInterstitialTimes_(hlsMetadata, id);
    const {once, pre, post} = this.parseCue_(hlsMetadata);
    const mimeType = this.getMetadataValue_(hlsMetadata, 'X-ASSET-MIMETYPE');
    const loop = this.getMetadataValue_(hlsMetadata, 'X-LOOP') == 'YES';
    let z = 1;
    const depth = this.getMetadataValue_(hlsMetadata, 'X-DEPTH');
    if (depth != null) {
      z = parseFloat(depth);
      if (isNaN(z)) {
        z = 1;
      }
    }
    const background = this.getMetadataValue_(hlsMetadata, 'X-BACKGROUND');

    const viewport = {
      x: 1920,
      y: 1080,
    };

    const viewportValue = this.getMetadataValue_(hlsMetadata, 'X-VIEWPORT');
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
        this.getMetadataValue_(hlsMetadata, 'X-OVERLAY-POSITION');
    if (overlayPosition != null) {
      const position = overlayPosition.split('x');
      if (position.length != 2) {
        return interstitialsAd;
      }
      overlay.topLeft.x = parseFloat(position[0]);
      overlay.topLeft.y = parseFloat(position[1]);
    }

    const overlaySize = this.getMetadataValue_(hlsMetadata, 'X-OVERLAY-SIZE');
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
        this.getMetadataValue_(hlsMetadata, 'X-SQUEEZECURRENT');
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
          this.getMetadataValue_(hlsMetadata, 'X-SQUEEZECURRENT-POSITION');
      if (squeezeCurrentPosition != null) {
        const position = squeezeCurrentPosition.split('x');
        if (position.length != 2) {
          return interstitialsAd;
        }
        currentVideo.topLeft.x = parseFloat(position[0]);
        currentVideo.topLeft.y = parseFloat(position[1]);
      }
    }

    interstitialsAd.push({
      id,
      groupId: null,
      startTime,
      endTime,
      uri: this.getUriWithHlsParams_(uri),
      mimeType,
      isSkippable: false,
      skipOffset: null,
      skipFor: null,
      canJump: true,
      resumeOffset: null,
      playoutLimit: null,
      once,
      pre,
      post,
      timelineRange: true,
      loop,
      overlay,
      displayOnBackground: z == -1,
      currentVideo,
      background,
      clickThroughUrl: null,
      tracking: null,
    });
    return interstitialsAd;
  }

  /**
   * @param {string} uri
   * @param {number=} offset
   * @return {string}
   * @private
   */
  getUriWithHlsParams_(uri, offset = 0) {
    if (uri.startsWith('data:')) {
      return uri;
    }
    if (!this.sessionId_) {
      this.sessionId_ = window.crypto.randomUUID();
    }
    const params = new Map();
    params.set('_HLS_primary_id', this.sessionId_);
    if (offset > 0) {
      const roundOffset = Math.round(offset * 1000) / 1000;
      params.set('_HLS_start_offset', String(roundOffset));
    }
    return shaka.util.URL.appendParams(uri, params);
  }


  /**
   * @private
   */
  cuepointsChanged_() {
    /** @type {!Array<!shaka.extern.AdCuePoint>} */
    const cuePoints = [];
    /**
     * @param {number} start
     * @param {?number} end
     */
    const addCuepoint = (start, end) => {
      const isValid = !cuePoints.find((c) => {
        return start == c.start && end == c.end;
      });
      if (isValid) {
        cuePoints.push({start, end});
      }
    };
    for (const interstitial of this.interstitials_) {
      if (interstitial.overlay) {
        continue;
      }
      if (interstitial.pre) {
        addCuepoint(0, null);
      } else if (interstitial.post) {
        addCuepoint(-1, null);
      } else if (interstitial.timelineRange) {
        addCuepoint(interstitial.startTime, interstitial.endTime);
      } else {
        addCuepoint(interstitial.startTime, null);
      }
    }
    // Include asset lists that have not been resolved yet, so the timeline UI
    // shows the upcoming ad breaks without waiting for their deferred
    // resolution.
    for (const descriptor of this.unresolvedAssetLists_) {
      if (descriptor.pre) {
        addCuepoint(0, null);
      } else if (descriptor.post) {
        addCuepoint(-1, null);
      } else if (descriptor.timelineRange) {
        addCuepoint(descriptor.startTime, descriptor.endTime);
      } else {
        addCuepoint(descriptor.startTime, null);
      }
    }

    this.sendEvent_(shaka.ads.Utils.CUEPOINTS_CHANGED,
        (new Map()).set('cuepoints', cuePoints));
  }


  /**
   * @private
   */
  updatePlayerConfig_() {
    goog.asserts.assert(this.player_, 'Must have player');
    goog.asserts.assert(this.basePlayer_, 'Must have base player');
    this.player_.configure(this.basePlayer_.getNonDefaultConfiguration());
    this.player_.configure('ads.disableHLSInterstitial', true);
    this.player_.configure('ads.disableDASHInterstitial', true);
    this.player_.configure('playRangeEnd', Infinity);
    const netEngine = this.player_.getNetworkingEngine();
    goog.asserts.assert(netEngine, 'Need networking engine');
    this.basePlayer_.getNetworkingEngine().copyFiltersInto(netEngine);
  }

  /**
   * @param {string} url
   * @param {shaka.extern.RequestContext=} context
   * @return {!shaka.net.NetworkingEngine.PendingRequest}
   * @private
   */
  makeAdRequest_(url, context) {
    const type = shaka.net.NetworkingEngine.RequestType.ADS;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [url],
        shaka.net.NetworkingEngine.defaultRetryParameters());
    return this.basePlayer_.getNetworkingEngine()
        .request(type, request, context);
  }

  /**
   * Returns the string data of the HLS metadata frame with the given key, or
   * null if there is no such frame.
   *
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @param {string} key
   * @return {?string}
   * @private
   */
  getMetadataValue_(hlsMetadata, key) {
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
  getInterstitialTimes_(hlsMetadata, id) {
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
   * Parses the CUE attribute (ONCE/PRE/POST) from HLS metadata.
   *
   * @param {shaka.extern.HLSMetadata} hlsMetadata
   * @return {{once: boolean, pre: boolean, post: boolean}}
   * @private
   */
  parseCue_(hlsMetadata) {
    const cue = this.getMetadataValue_(hlsMetadata, 'CUE');
    return {
      once: cue != null && cue.includes('ONCE'),
      pre: cue != null && cue.includes('PRE'),
      post: cue != null && cue.includes('POST'),
    };
  }

  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @return {string}
   * @private
   */
  interstitialId_(interstitial) {
    return interstitial.id || JSON.stringify(interstitial);
  }

  /**
   * The AD_BREAK_STARTED/ENDED time offset for an interstitial: 0 for pre-roll,
   * -1 for post-roll, otherwise its start time.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @return {number}
   * @private
   */
  getTimeOffset_(interstitial) {
    if (interstitial.pre) {
      return 0;
    }
    if (interstitial.post) {
      return -1;
    }
    return interstitial.startTime;
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @return {boolean}
   * @private
   */
  isPreloadAllowed_(interstitial) {
    const interstitialMimeType = interstitial.mimeType;
    if (!interstitialMimeType) {
      return true;
    }
    return !interstitialMimeType.startsWith('image/') &&
        interstitialMimeType !== 'text/html';
  }


  /**
   * Only for testing
   *
   * @return {!Array<shaka.extern.AdInterstitial>}
   */
  getInterstitials() {
    return Array.from(this.interstitials_);
  }

  /**
   * @return {boolean}
   * @private
   */
  isSmartTV_() {
    const device = shaka.device.DeviceFactory.getDevice();
    const deviceType = device.getDeviceType();
    if (deviceType == shaka.device.IDevice.DeviceType.TV ||
        deviceType == shaka.device.IDevice.DeviceType.CONSOLE ||
        deviceType == shaka.device.IDevice.DeviceType.CAST) {
      return true;
    }
    return false;
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @private
   */
  checkPreloadOnDomElements_(interstitial) {
    if (this.preloadOnDomElements_.has(interstitial) ||
        (this.config_ && !this.config_.allowPreloadOnDomElements)) {
      return;
    }
    const createAndAddLink = (url) => {
      const link = /** @type {HTMLLinkElement} */(
        document.createElement('link'));
      link.rel = 'preload';
      link.href = url;
      link.as = 'image';
      document.head.appendChild(link);
      return link;
    };
    const links = [];
    if (interstitial.background) {
      const urlRegExp = /url\(('|")?([^'"()]+)('|")\)?/;
      const match = interstitial.background.match(urlRegExp);
      if (match) {
        links.push(createAndAddLink(match[2]));
      }
    }
    if (interstitial.mimeType &&
        interstitial.mimeType.startsWith('image/')) {
      links.push(createAndAddLink(interstitial.uri));
    }
    this.preloadOnDomElements_.set(interstitial, links);
  }


  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @private
   */
  removePreloadOnDomElements_(interstitial) {
    if (!this.preloadOnDomElements_.has(interstitial)) {
      return;
    }
    const links = this.preloadOnDomElements_.get(interstitial);
    for (const link of links) {
      link.parentNode.removeChild(link);
    }
    this.preloadOnDomElements_.delete(interstitial);
  }


  /**
   * @param {string} type
   * @param {Map<string, Object>=} dict
   * @private
   */
  sendEvent_(type, dict) {
    shaka.log.info('Interstitial event', type, dict);
    this.onEvent_(new shaka.util.FakeEvent(type, dict));
    this.processTrackingEvent_(type);
  }

  /**
   * @param {string} type
   * @private
   */
  processTrackingEvent_(type) {
    if (this.config_.disableTrackingEvents) {
      return;
    }
    const tracking = this.lastPlayedAd_ && this.lastPlayedAd_.tracking;
    shaka.ads.Utils.fireTrackingEvents(
        tracking, type, this.basePlayer_.getNetworkingEngine());
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @return {boolean}
   * @private
   */
  isWithinPreloadWindow_(interstitial) {
    if (interstitial.pre && this.lastTime_ == null) {
      return true;
    } else if (interstitial.startTime == 0 && !interstitial.canJump) {
      return true;
    } else if (this.lastTime_ != null) {
      let baseVideoDuration = Infinity;
      if (!this.playingAd_ && this.baseVideo_.duration) {
        baseVideoDuration = this.baseVideo_.duration;
      }
      const difference =
          Math.min(interstitial.startTime, baseVideoDuration) - this.lastTime_;
      if (difference > 0 &&
          difference <= this.resolutionAheadTime_(interstitial)) {
        return true;
      }
    }
    return false;
  }
};


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
shaka.ads.InterstitialAdManager.AssetListDescriptor;


/* eslint-disable @stylistic/max-len */
/**
 * @typedef {{
 *   ASSETS: !Array<shaka.ads.InterstitialAdManager.Asset>,
 *   SKIP-CONTROL: ?shaka.ads.InterstitialAdManager.SkipControl,
 *   X-AD-CREATIVE-SIGNALING: ?shaka.extern.AdCreativeSignaling.CarriageEnvelope,
 * }}
 *
 * @property {!Array<shaka.ads.InterstitialAdManager.Asset>} ASSETS
 * @property {?shaka.ads.InterstitialAdManager.SkipControl} SKIP-CONTROL
 * @property {?shaka.extern.AdCreativeSignaling.CarriageEnvelope} X-AD-CREATIVE-SIGNALING
 */
shaka.ads.InterstitialAdManager.AssetsList;
/* eslint-enable @stylistic/max-len */


/* eslint-disable @stylistic/max-len */
/**
 * @typedef {{
 *   URI: string,
 *   DURATION: number,
 *   X-AD-CREATIVE-SIGNALING: ?shaka.extern.AdCreativeSignaling.CarriageEnvelope,
 * }}
 *
 * @property {string} URI
 * @property {number} DURATION
 * @property {?shaka.extern.AdCreativeSignaling.CarriageEnvelope} X-AD-CREATIVE-SIGNALING
 */
shaka.ads.InterstitialAdManager.Asset;
/* eslint-enable @stylistic/max-len */


/**
 * @typedef {{
 *   OFFSET: number,
 *   DURATION: number,
 * }}
 *
 * @property {number} OFFSET
 * @property {number} DURATION
 */
shaka.ads.InterstitialAdManager.SkipControl;


/**
 * Helper class to manage a single interstitial preload operation.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.InterstitialPreloadTask = class {
  /**
   * @param {!shaka.Player} player
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {?function(string, Map<string, Object>=)=} sendEvent
   */
  constructor(player, interstitial, sendEvent = null) {
    /** @private {!shaka.Player} */
    this.player_ = player;

    /** @private {?shaka.media.PreloadManager} */
    this.preloadManager_ = null;

    /** @private {?shaka.util.Error} */
    this.initialError_ = null;

    /** @private {boolean} */
    this.released_ = false;

    /** @private {?function(string, Map<string, Object>=)} */
    this.sendEvent_ = sendEvent;

    this.start_(interstitial);
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @private
   */
  async start_(interstitial) {
    try {
      if (this.sendEvent_) {
        this.sendEvent_(shaka.ads.Utils.AD_INTERSTITIAL_PRELOAD,
            (new Map()).set('interstitial', interstitial));
      }

      const preloadManager = await this.player_.preload(
          interstitial.uri,
          /* startTime= */ null,
          interstitial.mimeType || undefined);

      if (this.released_) {
        // Preload finished after destroy: clean immediately
        if (preloadManager) {
          try {
            await preloadManager.destroy();
          } catch (err) {
            shaka.log.error('Error destroying preloadManager', err);
          }
        }
        return;
      }

      this.preloadManager_ = preloadManager;
      if (preloadManager && this.sendEvent_) {
        this.sendEvent_(shaka.ads.Utils.AD_INTERSTITIAL_PRELOADED,
            (new Map()).set('interstitial', interstitial));
      }
    } catch (e) {
      // Store only the initial error
      this.initialError_ =
          e instanceof shaka.util.Error ? e : null;
    }
  }

  /**
   * Returns the PreloadManager if preload succeeded.
   *
   * @return {?shaka.media.PreloadManager}
   */
  getPreloadManager() {
    return this.preloadManager_;
  }

  /**
   * Returns the initial preload error, if any.
   *
   * @return {?shaka.util.Error}
   */
  getInitialError() {
    return this.initialError_;
  }

  /** @override */
  release() {
    this.released_ = true;

    if (this.preloadManager_) {
      this.preloadManager_.destroy();
      this.preloadManager_ = null;
    }
  }
};
