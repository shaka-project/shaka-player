/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialAdManager');

goog.require('goog.asserts');
goog.require('goog.Uri');
goog.require('shaka.Player');
goog.require('shaka.ads.InterstitialAd');
goog.require('shaka.ads.InterstitialStaticAd');
goog.require('shaka.ads.Utils');
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
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Timer');
goog.require('shaka.util.TXml');


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
    this.playingAd_ = false;

    /** @private {?number} */
    this.lastTime_ = null;

    /** @private {?shaka.extern.AdInterstitial} */
    this.lastPlayedAd_ = null;

    /** @private {?shaka.util.Timer} */
    this.playoutLimitTimer_ = null;

    /** @private {?function()} */
    this.lastOnSkip_ = null;

    /** @private {boolean} */
    this.usingListeners_ = false;

    /** @private {number} */
    this.videoCallbackId_ = -1;

    /** @private {?string} */
    this.sessionId_ = null;

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
      if (this.baseVideo_.ended) {
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
      if (!this.baseVideo_.paused) {
        this.lastTime_ = this.baseVideo_.currentTime;
      }
      let currentInterstitial = this.getCurrentInterstitial_(
          /* needPreRoll= */ true);
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
      const currentTime = this.baseVideo_.currentTime;
      // Remove last played ad when the new time is before the ad time.
      if (this.lastPlayedAd_ &&
          !this.lastPlayedAd_.pre && !this.lastPlayedAd_.post &&
          currentTime < this.lastPlayedAd_.startTime) {
        this.lastPlayedAd_ = null;
      }
    };

    /** @private {shaka.util.Timer} */
    this.timeUpdateTimer_ = new shaka.util.Timer(this.checkForInterstitials_);


    /** @private {shaka.util.Timer} */
    this.pollTimer_ = new shaka.util.Timer(() => {
      if (this.interstitials_.size && this.lastTime_ != null) {
        const currentLoadMode = this.basePlayer_.getLoadMode();
        if (currentLoadMode == shaka.Player.LoadMode.DESTROYED ||
            currentLoadMode == shaka.Player.LoadMode.NOT_LOADED) {
          return;
        }
        let cuepointsChanged = false;
        const interstitials = Array.from(this.interstitials_);
        const seekRange = this.basePlayer_.seekRange();
        for (const interstitial of interstitials) {
          if (interstitial == this.lastPlayedAd_) {
            continue;
          }
          const comparisonTime = interstitial.endTime || interstitial.startTime;
          if ((seekRange.start - comparisonTime) >= 1) {
            if (this.preloadTasks_.has(interstitial)) {
              const task = this.preloadTasks_.get(interstitial);
              task.release();
              this.preloadTasks_.delete(interstitial);
            }
            this.removePreloadOnDomElements_(interstitial);
            const interstitialId =
                interstitial.id || JSON.stringify(interstitial);
            if (this.interstitialIds_.has(interstitialId)) {
              this.interstitialIds_.delete(interstitialId);
            }
            this.interstitials_.delete(interstitial);
            this.removeEventListeners_();
            if (!interstitial.overlay) {
              cuepointsChanged = true;
            }
          } else {
            if (this.isWithinPreloadWindow_(interstitial)) {
              if (!this.preloadTasks_.has(interstitial) &&
                  this.isPreloadAllowed_(interstitial)) {
                this.sendEvent_(shaka.ads.Utils.AD_INTERSTITIAL_PRELOAD,
                    (new Map()).set('interstitial', interstitial));
                goog.asserts.assert(this.player_, 'Need a player');
                const task = new shaka.ads.InterstitialPreloadTask(
                    this.player_,
                    interstitial.uri,
                    interstitial.mimeType);

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
    if (this.usingListeners_ || !this.interstitials_.size) {
      return;
    }
    this.eventManager_.listen(
        this.baseVideo_, 'playing', this.onTimeUpdate_);
    this.eventManager_.listen(
        this.baseVideo_, 'timeupdate', this.onTimeUpdate_);
    this.eventManager_.listen(
        this.baseVideo_, 'seeked', this.onSeeked_);
    this.eventManager_.listen(
        this.baseVideo_, 'ended', this.checkForInterstitials_);
    if ('requestVideoFrameCallback' in this.baseVideo_ && !this.isSmartTV_()) {
      const baseVideo = /** @type {!HTMLVideoElement} */ (this.baseVideo_);
      const videoFrameCallback = (now, metadata) => {
        if (this.videoCallbackId_ == -1) {
          return;
        }
        this.checkForInterstitials_();
        // It is necessary to check this again because this callback can be
        // executed in another thread by the browser and we have to be sure
        // again here that we have not cancelled it in the middle of an
        // execution.
        if (this.videoCallbackId_ == -1) {
          return;
        }
        this.videoCallbackId_ =
            baseVideo.requestVideoFrameCallback(videoFrameCallback);
      };
      this.videoCallbackId_ =
          baseVideo.requestVideoFrameCallback(videoFrameCallback);
    } else {
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
    if (!this.usingListeners_ || this.interstitials_.size) {
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
    if (this.videoCallbackId_ != -1) {
      const baseVideo = /** @type {!HTMLVideoElement} */ (this.baseVideo_);
      baseVideo.cancelVideoFrameCallback(this.videoCallbackId_);
      this.videoCallbackId_ = -1;
    }
    if (this.timeUpdateTimer_) {
      this.timeUpdateTimer_.stop();
    }
    if (this.pollTimer_) {
      this.pollTimer_.stop();
    }
    this.usingListeners_ = false;
  }

  /**
   * @private
   */
  determineIfUsingBaseVideo_() {
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
    if (this.usingBaseVideo_ != supportsMultipleMediaElements) {
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
    this.player_.detach();
    this.playingAd_ = false;
    this.lastTime_ = null;
    this.lastPlayedAd_ = null;
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
    let id = null;
    const hlsMetadataId = hlsMetadata.values.find((v) => v.key == 'ID');
    if (hlsMetadataId) {
      id = /** @type {string} */(hlsMetadataId.data);
    }
    if (id) {
      if (this.hlsMetadataIds_.has(id)) {
        return;
      }
      this.hlsMetadataIds_.add(id);
    }
    this.updatePlayerConfig_();
    let adInterstitials = [];
    if (hlsMetadata &&
        hlsMetadata.values.find((v) => v.key == 'X-OVERLAY-ID')) {
      adInterstitials = this.getOverlaysInfo_(hlsMetadata);
    } else {
      adInterstitials = await this.getInterstitialsInfo_(hlsMetadata);
    }
    if (adInterstitials.length) {
      this.addInterstitials(adInterstitials);
    }
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   */
  addRegion(region) {
    const TXml = shaka.util.TXml;
    const isReplace =
        region.schemeIdUri == 'urn:mpeg:dash:event:alternativeMPD:replace:2025';
    const isInsert =
        region.schemeIdUri == 'urn:mpeg:dash:event:alternativeMPD:insert:2025';
    if (!isReplace && !isInsert) {
      shaka.log.warning('Unsupported alternative media presentation', region);
      return;
    }

    const startTime = region.startTime;
    let endTime = region.endTime;
    let playoutLimit = null;
    let resumeOffset = 0;
    let interstitialUri;
    let canJump = true;
    let skipOffset = null;
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
          break;
        }
      }
    }
    if (!interstitialUri) {
      shaka.log.warning('Unsupported alternative media presentation', region);
      return;
    }

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
    this.addInterstitials([interstitial]);
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   */
  addOverlayRegion(region) {
    const TXml = shaka.util.TXml;

    goog.asserts.assert(region.eventNode, 'Need a region eventNode');
    const overlayEvent = TXml.findChild(region.eventNode, 'OverlayEvent');
    const uri = overlayEvent.attributes['uri'];
    const mimeType = overlayEvent.attributes['mimeType'];
    const loop = overlayEvent.attributes['loop'] == 'true';
    const z = TXml.parseAttr(overlayEvent, 'z', TXml.parseInt);
    if (!uri || z == 0) {
      shaka.log.warning('Unsupported OverlayEvent', region);
      return;
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
        return;
      }
      const viewportY = TXml.parseAttr(viewportElement, 'y', TXml.parseInt);
      if (viewportY == null) {
        shaka.log.warning('Unsupported OverlayEvent', region);
        return;
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
        const topLeftX = TXml.parseAttr(topLeft, 'x', TXml.parseInt);
        if (topLeftX == null) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return;
        }
        const topLeftY = TXml.parseAttr(topLeft, 'y', TXml.parseInt);
        if (topLeftY == null) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return;
        }
        const sizeX = TXml.parseAttr(size, 'x', TXml.parseInt);
        if (sizeX == null) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return;
        }
        const sizeY = TXml.parseAttr(size, 'y', TXml.parseInt);
        if (sizeY == null) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return;
        }
        overlay.topLeft.x = topLeftX;
        overlay.topLeft.y = topLeftY;
        overlay.size.x = sizeX;
        overlay.size.y = sizeY;
      }
    }
    let currentVideo = null;
    const squeezeElement = TXml.findChild(overlayEvent, 'Squeeze');
    if (viewportElement && squeezeElement) {
      const topLeft = TXml.findChild(squeezeElement, 'TopLeft');
      const size = TXml.findChild(squeezeElement, 'Size');
      if (topLeft && size) {
        const topLeftX = TXml.parseAttr(topLeft, 'x', TXml.parseInt);
        if (topLeftX == null) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return;
        }
        const topLeftY = TXml.parseAttr(topLeft, 'y', TXml.parseInt);
        if (topLeftY == null) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return;
        }
        const sizeX = TXml.parseAttr(size, 'x', TXml.parseInt);
        if (sizeX == null) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return;
        }
        const sizeY = TXml.parseAttr(size, 'y', TXml.parseInt);
        if (sizeY == null) {
          shaka.log.warning('Unsupported OverlayEvent', region);
          return;
        }
        currentVideo = {
          viewport: {
            x: viewport.x,
            y: viewport.y,
          },
          topLeft: {
            x: topLeftX,
            y: topLeftY,
          },
          size: {
            x: sizeX,
            y: sizeY,
          },
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
    this.addInterstitials([interstitial]);
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
    const responseData = await this.makeAdRequest_(url, context);
    const data = shaka.util.TXml.parseXml(responseData, 'VAST,vmap:VMAP');
    if (!data) {
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.ADS,
          shaka.util.Error.Code.VAST_INVALID_XML);
    }
    /** @type {!Array<shaka.extern.AdInterstitial>} */
    let interstitials = [];
    if (data.tagName == 'VAST') {
      interstitials = shaka.ads.Utils.parseVastToInterstitials(
          data, this.lastTime_);
    } else if (data.tagName == 'vmap:VMAP') {
      const vastProcessing = async (ad) => {
        const vastResponseData = await this.makeAdRequest_(ad.uri, context);
        const vast = shaka.util.TXml.parseXml(vastResponseData, 'VAST');
        if (!vast) {
          throw new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.ADS,
              shaka.util.Error.Code.VAST_INVALID_XML);
        }
        interstitials.push(...shaka.ads.Utils.parseVastToInterstitials(
            vast, ad.time));
      };
      const promises = [];
      for (const ad of shaka.ads.Utils.parseVMAP(data)) {
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
      const interstitialId = interstitial.id || JSON.stringify(interstitial);
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
      if (this.isWithinPreloadWindow_(interstitial)) {
        if (!this.preloadTasks_.has(interstitial) &&
            this.isPreloadAllowed_(interstitial)) {
          this.sendEvent_(shaka.ads.Utils.AD_INTERSTITIAL_PRELOAD,
              (new Map()).set('interstitial', interstitial));
          goog.asserts.assert(this.player_, 'Need a player');
          const task = new shaka.ads.InterstitialPreloadTask(
              this.player_,
              interstitial.uri,
              interstitial.mimeType);

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
   * @param {boolean=} needPreRoll
   * @param {?number=} numberToSkip
   * @return {?shaka.extern.AdInterstitial}
   * @private
   */
  getCurrentInterstitial_(needPreRoll = false, numberToSkip = null) {
    let skipped = 0;
    let currentInterstitial = null;
    if (this.interstitials_.size && this.lastTime_ != null) {
      const isEnded = this.baseVideo_.ended;
      const interstitials = Array.from(this.interstitials_).sort((a, b) => {
        return b.startTime - a.startTime;
      });
      const roundDecimals = (number) => {
        return Math.round(number * 1000) / 1000;
      };
      let interstitialsToCheck = interstitials;
      if (needPreRoll) {
        interstitialsToCheck = interstitials.filter((i) => i.pre);
      } else if (isEnded) {
        interstitialsToCheck = interstitials.filter((i) => i.post);
      } else {
        interstitialsToCheck = interstitials.filter((i) => !i.pre && !i.post);
      }
      for (const interstitial of interstitialsToCheck) {
        let isValid = false;
        if (needPreRoll) {
          isValid = interstitial.pre;
        } else if (isEnded) {
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
    let timeOffset = interstitial.startTime;
    if (interstitial.pre) {
      timeOffset = 0;
    } else if (interstitial.post) {
      timeOffset = -1;
    }

    if (!this.playingAd_) {
      this.sendEvent_(shaka.ads.Utils.AD_BREAK_STARTED,
          (new Map()).set('timeOffset', timeOffset));
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

    const viewport = overlay.viewport;
    const topLeft = overlay.topLeft;
    const size = overlay.size;
    // Special case for VAST non-linear ads
    if (viewport.x == 0 && viewport.y == 0) {
      htmlElement.width = interstitial.overlay.size.x;
      htmlElement.height = interstitial.overlay.size.y;
      htmlElement.style.bottom = '10%';
      htmlElement.style.left = '0';
      htmlElement.style.right = '0';
      htmlElement.style.width = '100%';
      if (!interstitial.overlay.size.y && tagName == 'iframe') {
        htmlElement.style.height = 'auto';
      }
    } else {
      htmlElement.style.height = (size.y / viewport.y * 100) + '%';
      htmlElement.style.left = (topLeft.x / viewport.x * 100) + '%';
      htmlElement.style.top = (topLeft.y / viewport.y * 100) + '%';
      htmlElement.style.width = (size.x / viewport.x * 100) + '%';
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

    let timeOffset = interstitial.startTime;
    if (interstitial.pre) {
      timeOffset = 0;
    } else if (interstitial.post) {
      timeOffset = -1;
    }

    if (!this.playingAd_) {
      this.sendEvent_(shaka.ads.Utils.AD_BREAK_STARTED,
          (new Map()).set('timeOffset', timeOffset));
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
          if (!this.baseVideo_.ended) {
            this.baseVideo_.play();
          }
        } else {
          this.cuepointsChanged_();
        }
      }
      this.determineIfUsingBaseVideo_();
      if (nextCurrentInterstitial) {
        this.sendEvent_(shaka.ads.Utils.AD_STOPPED);
        this.adEventManager_.removeAll();
        this.setupAd_(nextCurrentInterstitial, sequenceLength,
            ++adPosition, initialTime, oncePlayed);
      }
      if (!this.playingAd_) {
        this.sendEvent_(shaka.ads.Utils.AD_BREAK_ENDED,
            (new Map()).set('timeOffset', timeOffset));
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
    this.adEventManager_.listen(this.video_, 'play', () => {
      this.sendEvent_(shaka.ads.Utils.AD_RESUMED);
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
      const detachBasePlayerPromise = new shaka.util.PublicPromise();
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
      await detachBasePlayerPromise;
    }
    this.setBaseStyles_(interstitial);
    if (!this.usingBaseVideo_) {
      this.video_.style.display = '';
      if (interstitial.overlay) {
        this.video_.loop = interstitial.loop;
        const viewport = interstitial.overlay.viewport;
        const topLeft = interstitial.overlay.topLeft;
        const size = interstitial.overlay.size;
        this.video_.style.height = (size.y / viewport.y * 100) + '%';
        this.video_.style.left = (topLeft.x / viewport.x * 100) + '%';
        this.video_.style.top = (topLeft.y / viewport.y * 100) + '%';
        this.video_.style.width = (size.x / viewport.x * 100) + '%';
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
      if (interstitial.playoutLimit && !this.playoutLimitTimer_) {
        this.playoutLimitTimer_ = new shaka.util.Timer(() => {
          this.lastOnSkip_();
        }).tickAfter(interstitial.playoutLimit);
        this.player_.configure('playRangeEnd', interstitial.playoutLimit);
      }
      await this.player_.attach(this.video_);
      let playerStartTime = null;
      if (!interstitial.pre && !interstitial.post &&
          this.config_.allowStartInMiddleOfInterstitial &&
          this.lastTime_ != null) {
        const newPosition = this.lastTime_ - interstitial.startTime;
        if (Math.abs(newPosition) > 0.25) {
          playerStartTime = newPosition;
        }
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
          await this.player_.load(preloadManager);
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
    const assetUri = hlsMetadata.values.find((v) => v.key == 'X-ASSET-URI');
    const assetList =
        hlsMetadata.values.find((v) => v.key == 'X-ASSET-LIST');
    if (!assetUri && !assetList) {
      return interstitialsAd;
    }
    let id = null;
    const hlsMetadataId = hlsMetadata.values.find((v) => v.key == 'ID');
    if (hlsMetadataId) {
      id = /** @type {string} */(hlsMetadataId.data);
    }
    const startTime = id == null ?
        Math.floor(hlsMetadata.startTime * 10) / 10:
        hlsMetadata.startTime;
    let endTime = hlsMetadata.endTime;
    if (hlsMetadata.endTime && hlsMetadata.endTime != Infinity &&
        typeof(hlsMetadata.endTime) == 'number') {
      endTime = id == null ?
          Math.floor(hlsMetadata.endTime * 10) / 10:
          hlsMetadata.endTime;
    }
    const restrict = hlsMetadata.values.find((v) => v.key == 'X-RESTRICT');
    let isSkippable = true;
    let canJump = true;
    if (restrict && restrict.data) {
      const data = /** @type {string} */(restrict.data);
      isSkippable = !data.includes('SKIP');
      canJump = !data.includes('JUMP');
    }
    let skipOffset = isSkippable ? 0 : null;
    const skipControlOffset =
        hlsMetadata.values.find((v) => v.key == 'X-SKIP-CONTROL-OFFSET');
    if (skipControlOffset) {
      const skipControlOffsetString =
      /** @type {string} */(skipControlOffset.data);
      skipOffset = parseFloat(skipControlOffsetString);
      if (isNaN(skipOffset)) {
        skipOffset = isSkippable ? 0 : null;
      }
    }
    let skipFor = null;
    const skipControlDuration =
        hlsMetadata.values.find((v) => v.key == 'X-SKIP-CONTROL-DURATION');
    if (skipControlDuration) {
      const skipControlDurationString =
      /** @type {string} */(skipControlDuration.data);
      skipFor = parseFloat(skipControlDurationString);
      if (isNaN(skipOffset)) {
        skipFor = null;
      }
    }
    let resumeOffset = null;
    const resume =
        hlsMetadata.values.find((v) => v.key == 'X-RESUME-OFFSET');
    if (resume) {
      const resumeOffsetString = /** @type {string} */(resume.data);
      resumeOffset = parseFloat(resumeOffsetString);
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
    const playout =
        hlsMetadata.values.find((v) => v.key == 'X-PLAYOUT-LIMIT');
    if (playout) {
      const playoutLimitString = /** @type {string} */(playout.data);
      playoutLimit = parseFloat(playoutLimitString);
      if (isNaN(playoutLimit)) {
        playoutLimit = null;
      }
    }
    let once = false;
    let pre = false;
    let post = false;
    const cue = hlsMetadata.values.find((v) => v.key == 'CUE');
    if (cue) {
      const data = /** @type {string} */(cue.data);
      once = data.includes('ONCE');
      pre = data.includes('PRE');
      post = data.includes('POST');
    }
    let timelineRange = false;
    const timelineOccupies =
        hlsMetadata.values.find((v) => v.key == 'X-TIMELINE-OCCUPIES');
    if (timelineOccupies) {
      const data = /** @type {string} */(timelineOccupies.data);
      timelineRange = data.includes('RANGE');
    } else if (!resume && this.basePlayer_.isLive()) {
      timelineRange = !pre && !post;
    }
    if (assetUri) {
      const uri = /** @type {string} */(assetUri.data);
      if (!uri) {
        return interstitialsAd;
      }
      interstitialsAd.push({
        id,
        groupId: null,
        startTime,
        endTime,
        uri: this.getUriWithHlsPrimaryId_(uri),
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
    } else if (assetList) {
      const uri = /** @type {string} */(assetList.data);
      if (!uri) {
        return interstitialsAd;
      }
      try {
        const NetworkingEngine = shaka.net.NetworkingEngine;
        const context = {
          type: NetworkingEngine.AdvancedRequestType.INTERSTITIAL_ASSET_LIST,
        };
        const responseData = await this.makeAdRequest_(
            this.getUriWithHlsPrimaryId_(uri), context);
        const data = shaka.util.StringUtils.fromUTF8(responseData);
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
              skipOffset = isSkippable ? 0 : null;
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
        for (let i = 0; i < dataAsJson['ASSETS'].length; i++) {
          const asset = dataAsJson['ASSETS'][i];
          const assetUri = asset['URI'];
          if (assetUri) {
            const interstitial = {
              id: id + '_shaka_asset_' + i,
              groupId: id,
              startTime,
              endTime,
              uri: this.getUriWithHlsPrimaryId_(assetUri),
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
            interstitialsAd.push(interstitial);
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    return interstitialsAd;
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
    const assetUri = hlsMetadata.values.find((v) => v.key == 'X-ASSET-URI');
    if (!assetUri) {
      return interstitialsAd;
    }
    const uri = /** @type {string} */(assetUri.data);
    if (!uri) {
      return interstitialsAd;
    }
    let id = null;
    const hlsMetadataId =
        hlsMetadata.values.find((v) => v.key == 'X-OVERLAY-ID');
    if (hlsMetadataId) {
      id = /** @type {string} */(hlsMetadataId.data);
    }
    const startTime = id == null ?
        Math.floor(hlsMetadata.startTime * 10) / 10:
        hlsMetadata.startTime;
    let endTime = hlsMetadata.endTime;
    if (hlsMetadata.endTime && hlsMetadata.endTime != Infinity &&
        typeof(hlsMetadata.endTime) == 'number') {
      endTime = id == null ?
          Math.floor(hlsMetadata.endTime * 10) / 10:
          hlsMetadata.endTime;
    }
    let once = false;
    let pre = false;
    let post = false;
    const cue = hlsMetadata.values.find((v) => v.key == 'CUE');
    if (cue) {
      const data = /** @type {string} */(cue.data);
      once = data.includes('ONCE');
      pre = data.includes('PRE');
      post = data.includes('POST');
    }
    let mimeType = null;
    const mimeTypeTag = hlsMetadata.values.find(
        (v) => v.key == 'X-ASSET-MIMETYPE');
    if (mimeTypeTag) {
      mimeType = /** @type {string} */(mimeTypeTag.data);
    }
    let loop = false;
    const loopTag = hlsMetadata.values.find((v) => v.key == 'X-LOOP');
    if (loopTag) {
      const data = /** @type {string} */(loopTag.data);
      loop = data == 'YES';
    }
    let z = 1;
    const depth = hlsMetadata.values.find((v) => v.key == 'X-DEPTH');
    if (depth) {
      const data = /** @type {string} */(depth.data);
      z = parseFloat(data);
      if (isNaN(z)) {
        z = 1;
      }
    }
    let background = null;
    const backgroundTag = hlsMetadata.values.find(
        (v) => v.key == 'X-BACKGROUND');
    if (backgroundTag) {
      background = /** @type {string} */(backgroundTag.data);
    }

    const viewport = {
      x: 1920,
      y: 1080,
    };

    const viewportElement = hlsMetadata.values.find(
        (v) => v.key == 'X-VIEWPORT');
    if (viewportElement) {
      const data = /** @type {string} */(viewportElement.data);
      const size = data.split('x');
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

    const overlayPosition = hlsMetadata.values.find(
        (v) => v.key == 'X-OVERLAY-POSITION');
    if (overlayPosition) {
      const data = /** @type {string} */(overlayPosition.data);
      const position = data.split('x');
      if (position.length != 2) {
        return interstitialsAd;
      }
      overlay.topLeft.x = parseFloat(position[0]);
      overlay.topLeft.y = parseFloat(position[1]);
    }

    const overlaySize = hlsMetadata.values.find(
        (v) => v.key == 'X-OVERLAY-SIZE');
    if (overlaySize) {
      const data = /** @type {string} */(overlaySize.data);
      const size = data.split('x');
      if (size.length != 2) {
        return interstitialsAd;
      }
      overlay.size.x = parseFloat(size[0]);
      overlay.size.y = parseFloat(size[1]);
    }

    /** @type {?shaka.extern.AdPositionInfo} */
    let currentVideo = null;
    const squeezeCurrent = hlsMetadata.values.find(
        (v) => v.key == 'X-SQUEEZECURRENT');
    if (squeezeCurrent) {
      const data = /** @type {string} */(squeezeCurrent.data);
      let percentage = parseFloat(data);
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
      const squeezeCurrentPosition = hlsMetadata.values.find(
          (v) => v.key == 'X-SQUEEZECURRENT-POSITION');
      if (squeezeCurrentPosition) {
        const squeezeCurrentPositionData =
        /** @type {string} */(squeezeCurrentPosition.data);
        const position = squeezeCurrentPositionData.split('x');
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
      uri: this.getUriWithHlsPrimaryId_(uri),
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
   * @return {string}
   * @private
   */
  getUriWithHlsPrimaryId_(uri) {
    if (!uri.startsWith('data:')) {
      if (!this.sessionId_) {
        this.sessionId_ = window.crypto.randomUUID();
      }
      const uriObj = new goog.Uri(uri);
      const queryData = uriObj.getQueryData();
      queryData.add('_HLS_primary_id', this.sessionId_);
      return uriObj.toString();
    }
    return uri;
  }


  /**
   * @private
   */
  cuepointsChanged_() {
    /** @type {!Array<!shaka.extern.AdCuePoint>} */
    const cuePoints = [];
    for (const interstitial of this.interstitials_) {
      if (interstitial.overlay) {
        continue;
      }
      /** @type {shaka.extern.AdCuePoint} */
      const shakaCuePoint = {
        start: interstitial.startTime,
        end: null,
      };
      if (interstitial.pre) {
        shakaCuePoint.start = 0;
        shakaCuePoint.end = null;
      } else if (interstitial.post) {
        shakaCuePoint.start = -1;
        shakaCuePoint.end = null;
      } else if (interstitial.timelineRange) {
        shakaCuePoint.end = interstitial.endTime;
      }
      const isValid = !cuePoints.find((c) => {
        return shakaCuePoint.start == c.start && shakaCuePoint.end == c.end;
      });
      if (isValid) {
        cuePoints.push(shakaCuePoint);
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
   * @return {!Promise<BufferSource>}
   * @private
   */
  async makeAdRequest_(url, context) {
    const type = shaka.net.NetworkingEngine.RequestType.ADS;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [url],
        shaka.net.NetworkingEngine.defaultRetryParameters());
    const op = this.basePlayer_.getNetworkingEngine()
        .request(type, request, context);
    const response = await op.promise;
    return response.data;
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
    if (tracking) {
      let urls;
      switch (type) {
        case shaka.ads.Utils.AD_IMPRESSION:
          urls = tracking.impression;
          break;
        case shaka.ads.Utils.AD_CLICKED:
          urls = tracking.clickTracking;
          break;
        case shaka.ads.Utils.AD_STARTED:
          urls = tracking.start;
          break;
        case shaka.ads.Utils.AD_FIRST_QUARTILE:
          urls = tracking.firstQuartile;
          break;
        case shaka.ads.Utils.AD_MIDPOINT:
          urls = tracking.midpoint;
          break;
        case shaka.ads.Utils.AD_THIRD_QUARTILE:
          urls = tracking.thirdQuartile;
          break;
        case shaka.ads.Utils.AD_COMPLETE:
          urls = tracking.complete;
          break;
        case shaka.ads.Utils.AD_SKIPPED:
          urls = tracking.skip;
          break;
        case shaka.ads.Utils.AD_ERROR:
          urls = tracking.error;
          break;
        case shaka.ads.Utils.AD_RESUMED:
          urls = tracking.resume;
          break;
        case shaka.ads.Utils.AD_PAUSED:
          urls = tracking.pause;
          break;
        case shaka.ads.Utils.AD_MUTED:
          urls = tracking.mute;
          break;
        case shaka.ads.Utils.AD_VOLUME_CHANGED:
          urls = tracking.unmute;
          break;
      }
      if (urls) {
        for (const url of urls) {
          this.sendTrackingEvent_(url);
        }
      }
    }
  }

  /**
   * @param {string} url
   * @private
   */
  sendTrackingEvent_(url) {
    const NetworkingEngine = shaka.net.NetworkingEngine;
    const context = {
      type: NetworkingEngine.AdvancedRequestType.TRACKING_EVENT,
    };
    const type = shaka.net.NetworkingEngine.RequestType.ADS;
    const request = shaka.net.NetworkingEngine.makeRequest(
        [url],
        shaka.net.NetworkingEngine.defaultRetryParameters());
    request.method = 'POST';
    this.basePlayer_.getNetworkingEngine().request(type, request, context);
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
          difference <= this.config_.interstitialPreloadAheadTime) {
        return true;
      }
    }
    return false;
  }
};


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
   * @param {string} uri
   * @param {?string=} mimeType
   */
  constructor(player, uri, mimeType = null) {
    /** @private {!shaka.Player} */
    this.player_ = player;

    /** @private {?shaka.media.PreloadManager} */
    this.preloadManager_ = null;

    /** @private {?shaka.util.Error} */
    this.initialError_ = null;

    /** @private {boolean} */
    this.released_ = false;

    this.start_(uri, mimeType);
  }

  /**
   * @param {string} uri
   * @param {?string} mimeType
   * @private
   */
  async start_(uri, mimeType) {
    try {
      const preloadManager = await this.player_.preload(
          uri,
          /* startTime= */ null,
          mimeType || undefined);

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
