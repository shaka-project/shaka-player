/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialAdManager');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.ads.InterstitialAd');
goog.require('shaka.ads.Utils');
goog.require('shaka.log');
goog.require('shaka.media.PreloadManager');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.util.Dom');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Platform');
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
   * @param {shaka.Player} basePlayer
   * @param {HTMLMediaElement} baseVideo
   * @param {function(!shaka.util.FakeEvent)} onEvent
   */
  constructor(adContainer, basePlayer, baseVideo, onEvent) {
    /** @private {?shaka.extern.AdsConfiguration} */
    this.config_ = null;

    /** @private {HTMLElement} */
    this.adContainer_ = adContainer;

    /** @private {shaka.Player} */
    this.basePlayer_ = basePlayer;

    /** @private {HTMLMediaElement} */
    this.baseVideo_ = baseVideo;

    /** @private {?HTMLMediaElement} */
    this.adVideo_ = null;

    /** @private {boolean} */
    this.usingBaseVideo_ = true;

    /** @private {HTMLMediaElement} */
    this.video_ = this.baseVideo_;

    /** @private {function(!shaka.util.FakeEvent)} */
    this.onEvent_ = onEvent;

    /** @private {!Set.<string>} */
    this.interstitialIds_ = new Set();

    /** @private {!Set.<shaka.extern.AdInterstitial>} */
    this.interstitials_ = new Set();

    /**
     * @private {!Map.<shaka.extern.AdInterstitial,
     *                 Promise<?shaka.media.PreloadManager>>}
     */
    this.preloadManagerInterstitials_ = new Map();

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

    this.eventManager_.listen(this.baseVideo_, 'timeupdate', () => {
      if (this.playingAd_ || this.lastTime_ ||
          this.basePlayer_.isRemotePlayback()) {
        return;
      }
      this.lastTime_ = this.baseVideo_.currentTime;
      const currentInterstitial = this.getCurrentInterstitial_(
          /* needPreRoll= */ true, /* numberToSkip= */ 0, this.lastPlayedAd_);
      if (currentInterstitial) {
        this.setupAd_(currentInterstitial, /* sequenceLength= */ 1,
            /* adPosition= */ 1, /* initialTime= */ Date.now());
      }
    });

    const checkForInterstitials = () => {
      if (this.playingAd_ || !this.lastTime_ ||
          this.basePlayer_.isRemotePlayback()) {
        return;
      }
      this.lastTime_ = this.baseVideo_.currentTime;
      // Remove last played add when the new time is before to the ad time.
      if (this.lastPlayedAd_ &&
          !this.lastPlayedAd_.pre && !this.lastPlayedAd_.post &&
          this.lastTime_ < this.lastPlayedAd_.startTime) {
        this.lastPlayedAd_ = null;
      }
      const currentInterstitial = this.getCurrentInterstitial_(
          /* needPreRoll= */ false, /* numberToSkip= */ 0, this.lastPlayedAd_);
      if (currentInterstitial) {
        this.setupAd_(currentInterstitial, /* sequenceLength= */ 1,
            /* adPosition= */ 1, /* initialTime= */ Date.now());
      }
    };

    /** @private {shaka.util.Timer} */
    this.timeUpdateTimer_ = new shaka.util.Timer(checkForInterstitials);

    if ('requestVideoFrameCallback' in this.baseVideo_ &&
        !shaka.util.Platform.isSmartTV()) {
      const baseVideo = /** @type {!HTMLVideoElement} */ (this.baseVideo_);
      const videoFrameCallback = () => {
        checkForInterstitials();
        baseVideo.requestVideoFrameCallback(videoFrameCallback);
      };
      baseVideo.requestVideoFrameCallback(videoFrameCallback);
    } else {
      this.timeUpdateTimer_.tickEvery(/* seconds= */ 0.025);
    }

    /** @private {shaka.util.Timer} */
    this.pollTimer_ = new shaka.util.Timer(async () => {
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
            if (this.preloadManagerInterstitials_.has(interstitial)) {
              const preloadManager =
                  // eslint-disable-next-line no-await-in-loop
                  await this.preloadManagerInterstitials_.get(interstitial);
              if (preloadManager) {
                preloadManager.destroy();
              }
              this.preloadManagerInterstitials_.delete(interstitial);
            }
            const interstitialId = JSON.stringify(interstitial);
            if (this.interstitialIds_.has(interstitialId)) {
              this.interstitialIds_.delete(interstitialId);
            }
            this.interstitials_.delete(interstitial);
            cuepointsChanged = true;
          } else {
            const difference = interstitial.startTime - this.lastTime_;
            if (difference > 0 && difference <= 10) {
              if (!this.preloadManagerInterstitials_.has(interstitial)) {
                this.preloadManagerInterstitials_.set(
                    interstitial, this.player_.preload(interstitial.uri));
              }
            }
          }
        }
        if (cuepointsChanged) {
          this.cuepointsChanged_();
        }
      }
    }).tickEvery(/* seconds= */ 1);
  }

  /**
   * Called by the AdManager to provide an updated configuration any time it
   * changes.
   *
   * @param {shaka.extern.AdsConfiguration} config
   */
  configure(config) {
    this.config_ = config;
    this.determineIfUsingBaseVideo_();
  }

  /**
   * @private
   */
  determineIfUsingBaseVideo_() {
    if (!this.adContainer_ || !this.config_ || this.playingAd_) {
      return;
    }
    let supportsMultipleMediaElements =
        this.config_.supportsMultipleMediaElements;
    const video = /** @type {HTMLVideoElement} */(this.baseVideo_);
    if (video.webkitSupportsFullscreen && video.webkitDisplayingFullscreen) {
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
    this.interstitialIds_.clear();
    this.interstitials_.clear();
    this.player_.destroyAllPreloads();
    this.preloadManagerInterstitials_.clear();
    this.player_.detach();
    this.playingAd_ = false;
    this.lastTime_ = null;
    this.lastPlayedAd_ = null;
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
    if (this.adContainer_) {
      shaka.util.Dom.removeAllChildren(this.adContainer_);
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
   * @param {shaka.extern.HLSInterstitial} hlsInterstitial
   */
  async addMetadata(hlsInterstitial) {
    this.updatePlayerConfig_();
    const adInterstitials = await this.getInterstitialsInfo_(hlsInterstitial);
    if (adInterstitials.length) {
      this.addInterstitials(adInterstitials);
    } else {
      shaka.log.alwaysWarn('Unsupported HLS interstitial', hlsInterstitial);
    }
  }

  /**
   * @param {shaka.extern.TimelineRegionInfo} region
   */
  addRegion(region) {
    let alternativeMPDUri;
    let alternativeMPDmode;
    for (const node of region.eventNode.children) {
      if (node.tagName == 'AlternativeMPD') {
        const uri = node.attributes['uri'];
        const mode = node.attributes['mode'];
        if (uri) {
          alternativeMPDUri = uri;
          alternativeMPDmode = mode;
          break;
        }
      }
    }
    if (!alternativeMPDUri) {
      shaka.log.alwaysWarn('Unsupported MPD alternate', region);
      return;
    }
    const isReplace = alternativeMPDmode == 'replace';
    const isInsert = alternativeMPDmode == 'insert';
    if (!isReplace && !isInsert) {
      shaka.log.warning('Unsupported MPD alternate', region);
      return;
    }

    /** @type {!shaka.extern.AdInterstitial} */
    const interstitial = {
      id: null,
      startTime: region.startTime,
      endTime: region.endTime,
      uri: alternativeMPDUri,
      isSkippable: false,
      skipOffset: null,
      skipFor: null,
      canJump: true,
      resumeOffset: isInsert ? 0 : null,
      playoutLimit: null,
      once: false,
      pre: false,
      post: false,
      timelineRange: isReplace && !isInsert,
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
    let interstitials = [];
    if (data.tagName == 'VAST') {
      interstitials = shaka.ads.Utils.parseVastToInterstitials(
          data, this.lastTime_);
    } else if (data.tagName == 'vmap:VMAP') {
      for (const ad of shaka.ads.Utils.parseVMAP(data)) {
        // eslint-disable-next-line no-await-in-loop
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
      }
    }
    this.addInterstitials(interstitials);
  }


  /**
   * @param {!Array.<shaka.extern.AdInterstitial>} interstitials
   */
  addInterstitials(interstitials) {
    let cuepointsChanged = false;
    for (const interstitial of interstitials) {
      const interstitialId = interstitial.id || JSON.stringify(interstitial);
      if (this.interstitialIds_.has(interstitialId)) {
        continue;
      }
      cuepointsChanged = true;
      this.interstitialIds_.add(interstitialId);
      this.interstitials_.add(interstitial);
      let shouldPreload = false;
      if (interstitial.pre && this.lastTime_ == null) {
        shouldPreload = true;
      } else if (interstitial.startTime == 0 && !interstitial.canJump) {
        shouldPreload = true;
      } else if (this.lastTime_ != null) {
        const difference = interstitial.startTime - this.lastTime_;
        if (difference > 0 && difference <= 10) {
          shouldPreload = true;
        }
      }
      if (shouldPreload) {
        if (!this.preloadManagerInterstitials_.has(interstitial)) {
          this.preloadManagerInterstitials_.set(
              interstitial, this.player_.preload(interstitial.uri));
        }
      }
    }
    if (cuepointsChanged) {
      this.cuepointsChanged_();
    }
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
    video.style.backgroundColor = 'rgb(0, 0, 0)';
    video.setAttribute('playsinline', '');
    return video;
  }


  /**
   * @param {boolean} needPreRoll
   * @param {number} numberToSkip
   * @param {?shaka.extern.AdInterstitial=} lastPlayedAd
   * @return {?shaka.extern.AdInterstitial}
   * @private
   */
  getCurrentInterstitial_(needPreRoll, numberToSkip, lastPlayedAd) {
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
      for (const interstitial of interstitials) {
        let isValid = false;
        if (needPreRoll) {
          isValid = interstitial.pre;
        } else if (isEnded) {
          isValid = interstitial.post;
        } else if (!interstitial.pre && !interstitial.post) {
          const difference =
              this.lastTime_ - roundDecimals(interstitial.startTime);
          if (difference > 0 &&
              (difference <= 1 || !interstitial.canJump)) {
            if (lastPlayedAd && !lastPlayedAd.pre && !lastPlayedAd.post &&
                lastPlayedAd.startTime >= interstitial.startTime) {
              isValid = false;
            } else {
              isValid = true;
            }
          }
        }
        if (isValid) {
          if (skipped == numberToSkip) {
            currentInterstitial = interstitial;
            break;
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
  async setupAd_(interstitial, sequenceLength, adPosition, initialTime,
      oncePlayed = 0) {
    this.determineIfUsingBaseVideo_();
    goog.asserts.assert(this.video_, 'Must have video');

    this.lastPlayedAd_ = interstitial;

    shaka.log.info('Starting interstitial',
        interstitial.startTime, 'at', this.lastTime_);

    const startTime = Date.now();

    if (!this.video_.parentElement && this.adContainer_) {
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

    if (interstitial.once || interstitial.pre) {
      oncePlayed++;
      this.interstitials_.delete(interstitial);
      this.cuepointsChanged_();
    }
    this.playingAd_ = true;

    if (this.usingBaseVideo_ && adPosition == 1) {
      this.onEvent_(new shaka.util.FakeEvent(
          shaka.ads.Utils.AD_CONTENT_PAUSE_REQUESTED,
          (new Map()).set('saveLivePosition', true)));
      const detachBasePlayerPromise = new shaka.util.PublicPromise();
      const checkState = async (e) => {
        if (e['state'] == 'detach') {
          if (shaka.util.Platform.isSmartTV()) {
            await new Promise(
                (resolve) => new shaka.util.Timer(resolve).tickAfter(0.1));
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
    if (!this.usingBaseVideo_) {
      this.baseVideo_.pause();
      if (interstitial.resumeOffset != null &&
          interstitial.resumeOffset != 0) {
        this.baseVideo_.currentTime += interstitial.resumeOffset;
      }
    }

    let unloadingInterstitial = false;
    /** @type {?shaka.util.Timer} */
    let playoutLimitTimer = null;

    const updateBaseVideoTime = () => {
      if (!this.usingBaseVideo_) {
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

    const basicTask = async () => {
      updateBaseVideoTime();
      if (playoutLimitTimer) {
        playoutLimitTimer.stop();
      }
      goog.asserts.assert(typeof(oncePlayed) == 'number',
          'Should be an number!');
      // Optimization to avoid returning to main content when there is another
      // interstitial below.
      const nextCurrentInterstitial = this.getCurrentInterstitial_(
          interstitial.pre, adPosition - oncePlayed);
      if (nextCurrentInterstitial) {
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.Utils.AD_STOPPED));
        this.adEventManager_.removeAll();
        this.setupAd_(nextCurrentInterstitial, sequenceLength,
            ++adPosition, initialTime, oncePlayed);
      } else {
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
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.Utils.AD_CONTENT_RESUME_REQUESTED,
              (new Map()).set('offset', offset)));
        }
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.Utils.AD_STOPPED));
        this.adEventManager_.removeAll();
        this.playingAd_ = false;
        if (!this.usingBaseVideo_) {
          updateBaseVideoTime();
          if (!this.baseVideo_.ended) {
            this.baseVideo_.play();
          }
        } else {
          this.cuepointsChanged_();
        }
        this.determineIfUsingBaseVideo_();
      }
    };
    const error = async (e) => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.onEvent_(new shaka.util.FakeEvent(shaka.ads.Utils.AD_ERROR,
          (new Map()).set('originalEvent', e)));
      await basicTask();
    };
    const complete = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      await basicTask();
      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.Utils.AD_COMPLETE));
    };
    const onSkip = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.onEvent_(new shaka.util.FakeEvent(shaka.ads.Utils.AD_SKIPPED));
      await basicTask();
    };

    const ad = new shaka.ads.InterstitialAd(this.video_,
        interstitial.isSkippable, interstitial.skipOffset,
        interstitial.skipFor, onSkip, sequenceLength, adPosition,
        !this.usingBaseVideo_);
    if (!this.usingBaseVideo_) {
      ad.setMuted(this.baseVideo_.muted);
      ad.setVolume(this.baseVideo_.volume);
    }

    this.onEvent_(
        new shaka.util.FakeEvent(shaka.ads.Utils.AD_STARTED,
            (new Map()).set('ad', ad)));

    let prevCanSkipNow = ad.canSkipNow();
    if (prevCanSkipNow) {
      this.onEvent_(new shaka.util.FakeEvent(
          shaka.ads.Utils.AD_SKIP_STATE_CHANGED));
    }
    const eventsSent = new Set();
    this.adEventManager_.listenOnce(this.player_, 'error', error);
    this.adEventManager_.listen(this.video_, 'timeupdate', () => {
      const duration = this.video_.duration;
      if (!duration) {
        return;
      }
      const currentCanSkipNow = ad.canSkipNow();
      if (prevCanSkipNow != currentCanSkipNow &&
          ad.getRemainingTime() > 0 && ad.getDuration() > 0) {
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.Utils.AD_SKIP_STATE_CHANGED));
      }
      prevCanSkipNow = currentCanSkipNow;
      const currentPercent = 100 * this.video_.currentTime / duration;
      if (currentPercent >= 25 && !eventsSent.has('firstquartile')) {
        updateBaseVideoTime();
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.Utils.AD_FIRST_QUARTILE));
        eventsSent.add('firstquartile');
      } else if (currentPercent >= 50 && !eventsSent.has('midpoint')) {
        updateBaseVideoTime();
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.Utils.AD_MIDPOINT));
        eventsSent.add('midpoint');
      } else if (currentPercent >= 75 && !eventsSent.has('thirdquartile')) {
        updateBaseVideoTime();
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.Utils.AD_THIRD_QUARTILE));
        eventsSent.add('thirdquartile');
      }
    });
    this.adEventManager_.listenOnce(this.player_, 'complete', complete);
    this.adEventManager_.listen(this.video_, 'play', () => {
      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.Utils.AD_RESUMED));
    });
    this.adEventManager_.listen(this.video_, 'pause', () => {
      // playRangeEnd in src= causes the ended event not to be fired when that
      // position is reached, instead pause event is fired.
      const currentConfig = this.player_.getConfiguration();
      if (this.video_.currentTime >= currentConfig.playRangeEnd) {
        complete();
        return;
      }
      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.Utils.AD_PAUSED));
    });
    this.adEventManager_.listen(this.video_, 'volumechange', () => {
      if (this.video_.muted) {
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.Utils.AD_MUTED));
      } else {
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.Utils.AD_VOLUME_CHANGED));
      }
    });
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
      if (interstitial.playoutLimit) {
        playoutLimitTimer = new shaka.util.Timer(() => {
          ad.skip();
        }).tickAfter(interstitial.playoutLimit);
        this.player_.configure('playRangeEnd', interstitial.playoutLimit);
      }
      await this.player_.attach(this.video_);
      if (this.preloadManagerInterstitials_.has(interstitial)) {
        const preloadManager =
            await this.preloadManagerInterstitials_.get(interstitial);
        this.preloadManagerInterstitials_.delete(interstitial);
        if (preloadManager) {
          await this.player_.load(preloadManager);
        } else {
          await this.player_.load(interstitial.uri);
        }
      } else {
        await this.player_.load(interstitial.uri);
      }
      if (interstitial.playoutLimit) {
        if (playoutLimitTimer) {
          playoutLimitTimer.stop();
        }
        playoutLimitTimer = new shaka.util.Timer(() => {
          ad.skip();
        }).tickAfter(interstitial.playoutLimit);
      }
      const loadTime = (Date.now() - startTime) / 1000;
      this.onEvent_(new shaka.util.FakeEvent(shaka.ads.Utils.ADS_LOADED,
          (new Map()).set('loadTime', loadTime)));
      if (this.usingBaseVideo_) {
        this.baseVideo_.play();
      }
    } catch (e) {
      error(e);
    }
  }


  /**
   * @param {shaka.extern.HLSInterstitial} hlsInterstitial
   * @return {!Promise.<!Array.<shaka.extern.AdInterstitial>>}
   * @private
   */
  async getInterstitialsInfo_(hlsInterstitial) {
    const interstitialsAd = [];
    if (!hlsInterstitial) {
      return interstitialsAd;
    }
    const assetUri = hlsInterstitial.values.find((v) => v.key == 'X-ASSET-URI');
    const assetList =
        hlsInterstitial.values.find((v) => v.key == 'X-ASSET-LIST');
    if (!assetUri && !assetList) {
      return interstitialsAd;
    }
    let id = null;
    const hlsInterstitialId = hlsInterstitial.values.find((v) => v.key == 'ID');
    if (hlsInterstitialId) {
      id = /** @type {string} */(hlsInterstitialId.data);
    }
    const startTime = id == null ?
        Math.floor(hlsInterstitial.startTime * 10) / 10:
        hlsInterstitial.startTime;
    let endTime = hlsInterstitial.endTime;
    if (hlsInterstitial.endTime && hlsInterstitial.endTime != Infinity &&
        typeof(hlsInterstitial.endTime) == 'number') {
      endTime = id == null ?
          Math.floor(hlsInterstitial.endTime * 10) / 10:
          hlsInterstitial.endTime;
    }
    const restrict = hlsInterstitial.values.find((v) => v.key == 'X-RESTRICT');
    let isSkippable = true;
    let canJump = true;
    if (restrict && restrict.data) {
      const data = /** @type {string} */(restrict.data);
      isSkippable = !data.includes('SKIP');
      canJump = !data.includes('JUMP');
    }
    let skipOffset = isSkippable ? 0 : null;
    const enableSkipAfter =
        hlsInterstitial.values.find((v) => v.key == 'X-ENABLE-SKIP-AFTER');
    if (enableSkipAfter) {
      const enableSkipAfterString = /** @type {string} */(enableSkipAfter.data);
      skipOffset = parseFloat(enableSkipAfterString);
      if (isNaN(skipOffset)) {
        skipOffset = isSkippable ? 0 : null;
      }
    }
    let skipFor = null;
    const enableSkipFor =
        hlsInterstitial.values.find((v) => v.key == 'X-ENABLE-SKIP-FOR');
    if (enableSkipFor) {
      const enableSkipForString = /** @type {string} */(enableSkipFor.data);
      skipFor = parseFloat(enableSkipForString);
      if (isNaN(skipOffset)) {
        skipFor = null;
      }
    }
    let resumeOffset = null;
    const resume =
        hlsInterstitial.values.find((v) => v.key == 'X-RESUME-OFFSET');
    if (resume) {
      const resumeOffsetString = /** @type {string} */(resume.data);
      resumeOffset = parseFloat(resumeOffsetString);
      if (isNaN(resumeOffset)) {
        resumeOffset = null;
      }
    }
    let playoutLimit = null;
    const playout =
        hlsInterstitial.values.find((v) => v.key == 'X-PLAYOUT-LIMIT');
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
    const cue = hlsInterstitial.values.find((v) => v.key == 'CUE');
    if (cue) {
      const data = /** @type {string} */(cue.data);
      once = data.includes('ONCE');
      pre = data.includes('PRE');
      post = data.includes('POST');
    }
    let timelineRange = false;
    const timelineOccupies =
        hlsInterstitial.values.find((v) => v.key == 'X-TIMELINE-OCCUPIES');
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
        startTime,
        endTime,
        uri,
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
        const responseData = await this.makeAdRequest_(uri, context);
        const data = shaka.util.StringUtils.fromUTF8(responseData);
        const dataAsJson =
        /** @type {!shaka.ads.InterstitialAdManager.AssetsList} */ (
            JSON.parse(data));
        const skipControl = dataAsJson['SKIP-CONTROL'];
        if (skipControl) {
          const enableSkipAfterValue = skipControl['ENABLE-SKIP-AFTER'];
          if (enableSkipAfterValue instanceof Number) {
            skipOffset = parseFloat(enableSkipAfterValue);
            if (isNaN(enableSkipAfterValue)) {
              skipOffset = isSkippable ? 0 : null;
            }
          }
          const enableSkipForValue = skipControl['X-ENABLE-SKIP-FOR'];
          if (enableSkipForValue instanceof Number) {
            skipFor = parseFloat(enableSkipForValue);
            if (isNaN(enableSkipForValue)) {
              skipFor = null;
            }
          }
        }
        for (const asset of dataAsJson['ASSETS']) {
          if (asset['URI']) {
            interstitialsAd.push({
              id,
              startTime,
              endTime,
              uri: asset['URI'],
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
            });
          }
        }
      } catch (e) {
        // Ignore errors
      }
    }
    return interstitialsAd;
  }


  /**
   * @private
   */
  cuepointsChanged_() {
    /** @type {!Array.<!shaka.extern.AdCuePoint>} */
    const cuePoints = [];
    for (const interstitial of this.interstitials_) {
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

    this.onEvent_(new shaka.util.FakeEvent(
        shaka.ads.Utils.CUEPOINTS_CHANGED,
        (new Map()).set('cuepoints', cuePoints)));
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
    const netEngine = this.player_.getNetworkingEngine();
    goog.asserts.assert(netEngine, 'Need networking engine');
    netEngine.clearAllRequestFilters();
    netEngine.clearAllResponseFilters();
    this.basePlayer_.getNetworkingEngine().copyFiltersInto(netEngine);
  }

  /**
   * @param {string} url
   * @param {shaka.extern.RequestContext=} context
   * @return {!Promise.<BufferSource>}
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
};


/**
 * @typedef {{
 *   ASSETS: !Array.<shaka.ads.InterstitialAdManager.Asset>,
 *   SKIP-CONTROL: ?shaka.ads.InterstitialAdManager.SkipControl
 * }}
 *
 * @property {!Array.<shaka.ads.InterstitialAdManager.Asset>} ASSETS
 * @property {shaka.ads.InterstitialAdManager.SkipControl} SKIP-CONTROL
 */
shaka.ads.InterstitialAdManager.AssetsList;


/**
 * @typedef {{
 *   URI: string
 * }}
 *
 * @property {string} URI
 */
shaka.ads.InterstitialAdManager.Asset;


/**
 * @typedef {{
 *   ENABLE-SKIP-AFTER: number,
 *   ENABLE-SKIP-FOR: number
 * }}
 *
 * @property {number} ENABLE-SKIP-AFTER
 * @property {number} ENABLE-SKIP-FOR
 */
shaka.ads.InterstitialAdManager.SkipControl;
