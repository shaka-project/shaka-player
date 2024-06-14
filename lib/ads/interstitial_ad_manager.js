/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview
 * @suppress {missingRequire} TODO(b/152540451): this shouldn't be needed
 */

goog.provide('shaka.ads.InterstitialAdManager');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.ads.InterstitialAd');
goog.require('shaka.media.PreloadManager');
goog.require('shaka.util.Dom');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.FakeEvent');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Platform');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.Timer');


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

    /** @private {!Set.<shaka.ads.InterstitialAdManager.Interstitial>} */
    this.interstitials_ = new Set();

    /**
     * @private {!Map.<shaka.ads.InterstitialAdManager.Interstitial,
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

    this.eventManager_.listen(this.baseVideo_, 'timeupdate', () => {
      if (this.playingAd_) {
        return;
      }
      const needPreRoll = this.lastTime_ == null;
      this.lastTime_ = this.baseVideo_.currentTime;
      const currentInterstitial = this.getCurrentInterstitial_(needPreRoll);
      if (currentInterstitial) {
        this.setupAd_(currentInterstitial, /* sequenceLength= */ 1,
            /* adPosition= */ 1, /* initialTime= */ Date.now());
      }
    });

    /** @private {shaka.util.Timer} */
    this.pollTimer_ = new shaka.util.Timer(async () => {
      if (this.interstitials_.size && !this.playingAd_ &&
          this.lastTime_ != null) {
        let cuepointsChanged = false;
        const interstitials = Array.from(this.interstitials_);
        const seekRange = this.basePlayer_.seekRange();
        for (const interstitial of interstitials) {
          if ((seekRange.start - interstitial.startTime) >= 1) {
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
    if (!this.adContainer_ ||
        this.usingBaseVideo_ != config.supportsMultipleMediaElements) {
      return;
    }
    this.usingBaseVideo_ = !config.supportsMultipleMediaElements;
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
    this.player_.destroy();
  }


  /**
   * @param {shaka.extern.Interstitial} interstitial
   */
  async addMetadata(interstitial) {
    if (this.basePlayer_.getLoadMode() == shaka.Player.LoadMode.SRC_EQUALS &&
        this.usingBaseVideo_) {
      shaka.log.alwaysWarn(
          'Unsupported interstitial when using single media element',
          interstitial);
      return;
    }
    this.updatePlayerConfig_();
    let cuepointsChanged = false;
    const interstitialsAd = await this.getInterstitialsInfo_(interstitial);
    if (interstitialsAd.length) {
      for (const interstitialAd of interstitialsAd) {
        const interstitialId = JSON.stringify(interstitialAd);
        if (this.interstitialIds_.has(interstitialId)) {
          continue;
        }
        cuepointsChanged = true;
        this.interstitialIds_.add(interstitialId);
        this.interstitials_.add(interstitialAd);
        let shouldPreload = false;
        if (interstitial.pre && this.lastTime_ == null) {
          shouldPreload = true;
        } else if (interstitialAd.startTime == 0 && !interstitialAd.canJump) {
          shouldPreload = true;
        } else if (this.lastTime_ != null) {
          const difference = interstitial.startTime - this.lastTime_;
          if (difference > 0 && difference <= 10) {
            shouldPreload = true;
          }
        }
        if (shouldPreload) {
          if (!this.preloadManagerInterstitials_.has(interstitialAd)) {
            this.preloadManagerInterstitials_.set(
                interstitialAd, this.player_.preload(interstitialAd.uri));
          }
        }
      }
    } else {
      shaka.log.alwaysWarn('Unsupported interstitial', interstitial);
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
   * @param {number=} numberToSkip
   * @return {?shaka.ads.InterstitialAdManager.Interstitial}
   * @private
   */
  getCurrentInterstitial_(needPreRoll, numberToSkip = 0) {
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
          isValid = difference > 0 &&
              (difference <= 1 || !interstitial.canJump);
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
   * @param {shaka.ads.InterstitialAdManager.Interstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} initialTime the clock time the ad started at
   * @param {number=} oncePlayed
   * @private
   */
  async setupAd_(interstitial, sequenceLength, adPosition, initialTime,
      oncePlayed = 0) {
    goog.asserts.assert(this.video_, 'Must have video');

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

    if (interstitial.once) {
      oncePlayed++;
      this.interstitials_.delete(interstitial);
      this.cuepointsChanged_();
    }
    this.playingAd_ = true;

    if (this.usingBaseVideo_ && adPosition == 1) {
      this.onEvent_(new shaka.util.FakeEvent(
          shaka.ads.AdManager.AD_CONTENT_PAUSE_REQUESTED,
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
          if (interstitial.timelineRange && interstitial.endTime) {
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
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));
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
            if (interstitial.timelineRange && interstitial.endTime) {
              offset = interstitial.endTime - (this.lastTime_ || 0);
            } else {
              offset = (Date.now() - initialTime) / 1000;
            }
          }
          this.onEvent_(new shaka.util.FakeEvent(
              shaka.ads.AdManager.AD_CONTENT_RESUME_REQUESTED,
              (new Map()).set('offset', offset)));
        }
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STOPPED));
        this.adEventManager_.removeAll();
        this.playingAd_ = false;
        if (!this.usingBaseVideo_) {
          updateBaseVideoTime();
          if (!this.baseVideo_.ended) {
            this.baseVideo_.play();
          }
        }
      }
    };
    const error = async (e) => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_ERROR,
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
          new shaka.util.FakeEvent(shaka.ads.AdManager.AD_COMPLETE));
    };
    const onSkip = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.AD_SKIPPED));
      await basicTask();
    };

    const ad = new shaka.ads.InterstitialAd(this.video_,
        interstitial.isSkippable, onSkip, sequenceLength, adPosition);
    if (!this.usingBaseVideo_) {
      ad.setMuted(this.baseVideo_.muted);
      ad.setVolume(this.baseVideo_.volume);
    }

    this.onEvent_(
        new shaka.util.FakeEvent(shaka.ads.AdManager.AD_STARTED,
            (new Map()).set('ad', ad)));

    if (ad.canSkipNow()) {
      this.onEvent_(new shaka.util.FakeEvent(
          shaka.ads.AdManager.AD_SKIP_STATE_CHANGED));
    }
    this.adEventManager_.listenOnce(this.player_, 'error', error);
    this.adEventManager_.listenOnce(this.player_, 'firstquartile', () => {
      updateBaseVideoTime();
      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.AdManager.AD_FIRST_QUARTILE));
    });
    this.adEventManager_.listenOnce(this.player_, 'midpoint', () => {
      updateBaseVideoTime();
      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MIDPOINT));
    });
    this.adEventManager_.listenOnce(this.player_, 'thirdquartile', () => {
      updateBaseVideoTime();
      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.AdManager.AD_THIRD_QUARTILE));
    });
    this.adEventManager_.listenOnce(this.player_, 'complete', complete);
    this.adEventManager_.listen(this.video_, 'play', () => {
      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.AdManager.AD_RESUMED));
    });
    this.adEventManager_.listen(this.video_, 'pause', () => {
      this.onEvent_(
          new shaka.util.FakeEvent(shaka.ads.AdManager.AD_PAUSED));
    });
    this.adEventManager_.listen(this.video_, 'volumechange', () => {
      if (this.video_.muted) {
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_MUTED));
      } else {
        this.onEvent_(
            new shaka.util.FakeEvent(shaka.ads.AdManager.AD_VOLUME_CHANGED));
      }
    });
    try {
      if (interstitial.playoutLimit) {
        playoutLimitTimer = new shaka.util.Timer(() => {
          ad.skip();
        }).tickAfter(interstitial.playoutLimit);
      }
      this.updatePlayerConfig_();
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
      const loadTime = (Date.now() - startTime) / 1000;
      this.onEvent_(new shaka.util.FakeEvent(shaka.ads.AdManager.ADS_LOADED,
          (new Map()).set('loadTime', loadTime)));
      if (this.usingBaseVideo_) {
        this.baseVideo_.play();
      }
    } catch (e) {
      error(e);
    }
  }


  /**
   * @param {shaka.extern.Interstitial} interstitial
   * @return {!Promise.<!Array.<shaka.ads.InterstitialAdManager.Interstitial>>}
   * @private
   */
  async getInterstitialsInfo_(interstitial) {
    const interstitialsAd = [];
    if (!interstitial) {
      return interstitialsAd;
    }
    const assetUri = interstitial.values.find((v) => v.key == 'X-ASSET-URI');
    const assetList = interstitial.values.find((v) => v.key == 'X-ASSET-LIST');
    if (!assetUri && !assetList) {
      return interstitialsAd;
    }
    const restrict = interstitial.values.find((v) => v.key == 'X-RESTRICT');
    let isSkippable = true;
    let canJump = true;
    if (restrict && restrict.data) {
      const data = /** @type {string} */(restrict.data);
      isSkippable = !data.includes('SKIP');
      canJump = !data.includes('JUMP');
    }
    let resumeOffset = null;
    const resume = interstitial.values.find((v) => v.key == 'X-RESUME-OFFSET');
    if (resume) {
      const resumeOffsetString = /** @type {string} */(resume.data);
      resumeOffset = parseFloat(resumeOffsetString);
      if (isNaN(resumeOffset)) {
        resumeOffset = null;
      }
    }
    let playoutLimit = null;
    const playout = interstitial.values.find((v) => v.key == 'X-PLAYOUT-LIMIT');
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
    const cue = interstitial.values.find((v) => v.key == 'CUE');
    if (cue) {
      const data = /** @type {string} */(cue.data);
      once = data.includes('ONCE');
      pre = data.includes('PRE');
      post = data.includes('POST');
    }
    let timelineRange = true;
    const timelineOccupies =
        interstitial.values.find((v) => v.key == 'X-TIMELINE-OCCUPIES');
    if (timelineOccupies) {
      const data = /** @type {string} */(timelineOccupies.data);
      timelineRange = data.includes('RANGE');
    } else if (!resume && this.basePlayer_.isLive()) {
      timelineRange = true;
    }
    if (assetUri) {
      const uri = /** @type {string} */(assetUri.data);
      if (!uri) {
        return interstitialsAd;
      }
      interstitialsAd.push({
        startTime: interstitial.startTime,
        endTime: interstitial.endTime,
        uri,
        isSkippable,
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
      const type = shaka.net.NetworkingEngine.RequestType.ADS;
      const request = shaka.net.NetworkingEngine.makeRequest(
          [uri],
          shaka.net.NetworkingEngine.defaultRetryParameters());
      const op = this.basePlayer_.getNetworkingEngine().request(type, request);
      try {
        const response = await op.promise;
        const data = shaka.util.StringUtils.fromUTF8(response.data);
        const dataAsJson =
        /** @type {!shaka.ads.InterstitialAdManager.AssetsList} */ (
            JSON.parse(data));
        for (const asset of dataAsJson.ASSETS) {
          if (asset.URI) {
            interstitialsAd.push({
              startTime: interstitial.startTime,
              endTime: interstitial.endTime,
              uri: asset.URI,
              isSkippable,
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
        shaka.ads.AdManager.CUEPOINTS_CHANGED,
        (new Map()).set('cuepoints', cuePoints)));
  }


  /**
   * @private
   */
  updatePlayerConfig_() {
    goog.asserts.assert(this.player_, 'Must have player');
    goog.asserts.assert(this.basePlayer_, 'Must have base player');
    this.player_.configure(this.basePlayer_.getNonDefaultConfiguration());
    const netEngine = this.player_.getNetworkingEngine();
    goog.asserts.assert(netEngine, 'Need networking engine');
    netEngine.clearAllRequestFilters();
    netEngine.clearAllResponseFilters();
    this.basePlayer_.getNetworkingEngine().copyFiltersInto(netEngine);
  }
};


/**
 * @typedef {{
 *   ASSETS: !Array.<shaka.ads.InterstitialAdManager.Asset>
 * }}
 *
 * @property {!Array.<shaka.ads.InterstitialAdManager.Asset>} ASSETS
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
 *   startTime: number,
 *   endTime: ?number,
 *   uri: string,
 *   isSkippable: boolean,
 *   canJump: boolean,
 *   resumeOffset: ?number,
 *   playoutLimit: ?number,
 *   once: boolean,
 *   pre: boolean,
 *   post: boolean,
 *   timelineRange: boolean
 * }}
 *
 * @property {number} startTime
 * @property {?number} endTime
 * @property {string} uri
 * @property {boolean} isSkippable
 * @property {boolean} canJump
 * @property {?number} resumeOffset
 * @property {?number} playoutLimit
 * @property {boolean} once
 * @property {boolean} pre
 * @property {boolean} post
 * @property {boolean} timelineRange
 */
shaka.ads.InterstitialAdManager.Interstitial;
