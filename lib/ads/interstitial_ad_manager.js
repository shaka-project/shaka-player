/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialAdManager');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.ads.InterstitialAd');
goog.require('shaka.ads.InterstitialAdSession');
goog.require('shaka.ads.InterstitialTracker');
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
goog.require('shaka.util.Timer');
goog.require('shaka.util.TXml');
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
   * @param {function(!shaka.Player,
   *     ?shaka.extern.AdInterstitial)=} configurePlayer
   *   Configures the player of an interstitial.
   * @param {shaka.ads.InterstitialAdSession.TrackerFactory=} createTracker
   *   Creates the format specific tracker of an interstitial.
   */
  constructor(adContainer, player, onEvent, configurePlayer = () => {},
      createTracker = () => null) {
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

    /** @private {function(!shaka.Player, ?shaka.extern.AdInterstitial)} */
    this.configurePlayer_ = configurePlayer;

    /** @private {shaka.ads.InterstitialAdSession.TrackerFactory} */
    this.createTracker_ = createTracker;

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
     * Interstitial resources whose resolution has been deferred until
     * playback approaches them. This avoids resolving every ad decision at
     * parse time, which would otherwise create a burst of concurrent requests.
     * See https://github.com/shaka-project/shaka-player/issues/10191
     * @private {!Set<shaka.extern.DeferredInterstitial>}
     */
    this.deferredInterstitials_ = new Set();

    /**
     * Preload hints (e.g. HLS "com.apple.hls.preload" Date Ranges, RFC 8216bis
     * Appendix F): maps the target ID to the time at which its resources may
     * start being resolved.
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
    this.player_ = null;

    /**
     * @private {!Map<shaka.extern.AdInterstitial,
                         shaka.ads.InterstitialAdSession>} */
    this.sessions_ = new Map();

    /** @private {?shaka.extern.AdInterstitial} */
    this.embeddedInterstitial_ = null;

    /** @private {boolean} */
    this.hasEmbeddedInterstitials_ = false;

    /** @private {?string} */
    this.embeddedGroup_ = null;

    /**
     * Receives clicks on the current embedded slot, which has no element of
     * its own in the ad container.
     * @private {?HTMLElement}
     */
    this.embeddedClickTarget_ = null;

    /** @private {number} */
    this.generation_ = 0;

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
     * Playout of the interstitial being played. Only media actually played
     * counts, so loading or rebuffering its assets does not consume its
     * playout limit.
     * @private {?shaka.ads.InterstitialAdManager.Playout}
     */
    this.playout_ = null;

    /** @private {?function()} */
    this.lastOnPlayoutLimit_ = null;

    /**
     * Wall-clock time (ms) when the last SGAI interstitial ad break finished
     * playing. Used to enforce the interstitialCooldown config.
     * @private {?number}
     */
    this.lastAdCompleteTime_ = null;

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
      this.updateEmbeddedInterstitial_();
      if (this.playingAd_ || !this.lastTime_ ||
          this.basePlayer_.isRemotePlayback()) {
        return;
      }
      this.isEnded_ = this.baseVideo_.ended;
      this.lastTime_ = this.baseVideo_.currentTime;
      const currentInterstitial = this.getCurrentInterstitial_();
      if (currentInterstitial &&
          allowPlayInterstitialNow(currentInterstitial)) {
        if (this.isInCooldown_()) {
          // Within the cooldown window after the last interstitial finished;
          // don't initiate a new ad break (snapback or next ad).
          return;
        }
        this.setupAd_(currentInterstitial, /* sequenceLength= */ 1,
            /* adPosition= */ 1, /* initialTime= */ Date.now());
      }
    };

    /** @private {function()} */
    this.onTimeUpdate_ = () => {
      this.updateEmbeddedInterstitial_();
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
        if (this.isInCooldown_()) {
          // Within the cooldown window after the last interstitial finished;
          // don't initiate a new ad break (snapback or next ad).
          return;
        }
        this.setupAd_(currentInterstitial, /* sequenceLength= */ 1,
            /* adPosition= */ 1, /* initialTime= */ Date.now());
      }
    };

    /** @private {function()} */
    this.onSeeked_ = () => {
      this.updateEmbeddedInterstitial_(/* seeked= */ true);
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
      this.resetResourcesOnSeek_(currentTime);
    };

    /** @private {shaka.util.Timer} */
    this.timeUpdateTimer_ = new shaka.util.Timer(this.checkForInterstitials_);


    /** @private {shaka.util.Timer} */
    this.pollTimer_ = new shaka.util.Timer(() => {
      if (!this.playingAd_ && this.lastTime_ != null &&
          (this.interstitials_.size || this.deferredInterstitials_.size)) {
        const currentLoadMode = this.basePlayer_.getLoadMode();
        if (currentLoadMode == shaka.Player.LoadMode.DESTROYED ||
            currentLoadMode == shaka.Player.LoadMode.NOT_LOADED) {
          return;
        }
        let cuepointsChanged = false;
        const seekRange = this.basePlayer_.seekRange();
        for (const descriptor of Array.from(this.deferredInterstitials_)) {
          const comparisonTime = descriptor.endTime || descriptor.startTime;
          if ((seekRange.start - comparisonTime) >= 1) {
            // The ad break has fallen out of the seekable window; drop it.
            this.deferredInterstitials_.delete(descriptor);
            this.removeEventListeners_();
            cuepointsChanged = true;
          } else if (!descriptor.resolving && !descriptor.resolved &&
              this.shouldResolveResourceNow_(descriptor)) {
            descriptor.resolving = true;
            this.resolveDeferredInterstitial_(descriptor);
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
        (!this.interstitials_.size && !this.deferredInterstitials_.size)) {
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
      this.pollTimer_.tickEvery(/* seconds= */ 1);
    }
    this.usingListeners_ = true;
  }

  /**
   * @private
   */
  removeEventListeners_() {
    if (!this.usingListeners_ ||
        this.interstitials_.size || this.deferredInterstitials_.size) {
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
    this.generation_++;
    for (const session of this.sessions_.values()) {
      session.release();
    }
    this.sessions_.clear();
    this.embeddedInterstitial_ = null;
    this.embeddedGroup_ = null;
    this.embeddedClickTarget_ = null;
    this.interstitialIds_.clear();
    this.interstitials_.clear();
    this.hasEmbeddedInterstitials_ = false;
    this.sortedInterstitials_ = null;
    for (const resource of this.deferredInterstitials_) {
      resource.abort();
    }
    this.deferredInterstitials_.clear();
    this.preloadOffsets_.clear();
    this.player_?.destroyAllPreloads();
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
    this.player_?.detach();
    this.isEnded_ = false;
    this.playingAd_ = false;
    this.lastTime_ = null;
    this.lastPlayedAd_ = null;
    this.playout_ = null;
    this.lastOnPlayoutLimit_ = null;
    this.lastAdCompleteTime_ = null;
    this.usingBaseVideo_ = true;
    this.video_ = this.baseVideo_;
    this.adVideo_ = null;
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
    this.player_?.destroy();
    this.player_ = null;
  }

  /**
   * @return {shaka.Player}
   */
  getPlayer() {
    if (!this.player_) {
      this.player_ = new shaka.Player();
      this.updatePlayerConfig_();
    }
    return this.player_;
  }

  /**
   * Updates embedded slots independently of the insertion scheduler. Loading
   * or seeking into a slot activates its half-open interval immediately;
   * insertion cooldown and snapback policies do not apply to existing media.
   *
   * @param {boolean=} seeked
   * @private
   */
  updateEmbeddedInterstitial_(seeked = false) {
    if (!this.hasEmbeddedInterstitials_) {
      return;
    }
    if (this.basePlayer_.isRemotePlayback() || this.baseVideo_.seeking ||
        (this.playingAd_ && !this.lastPlayedAd_?.overlay)) {
      return;
    }
    const position = this.baseVideo_.currentTime;
    const current = Array.from(this.interstitials_).find((item) =>
      item.playbackMode == shaka.ads.Utils.EMBEDDED &&
      item.startTime <= position && item.endTime != null &&
          position < item.endTime);
    const previous = this.embeddedInterstitial_;
    if (previous && previous != current) {
      const session = this.sessions_.get(previous);
      let type = null;
      if (!seeked && session && session.canComplete()) {
        type = shaka.ads.Utils.AD_COMPLETE;
      } else if (seeked || (session && session.hasSeeked())) {
        type = shaka.ads.Utils.AD_SKIPPED;
      }
      this.stopEmbeddedInterstitial_(type);
    }
    if (this.embeddedGroup_ && (!current ||
        this.embeddedGroup_ != (current.groupId || current.id))) {
      this.sendEvent_(shaka.ads.Utils.AD_BREAK_ENDED);
      this.embeddedGroup_ = null;
    }
    if (!current || this.baseVideo_.paused || this.baseVideo_.ended ||
        this.baseVideo_.readyState < 2) {
      return;
    }
    if (!this.embeddedInterstitial_) {
      const group = current.groupId || current.id;
      if (!this.embeddedGroup_) {
        this.embeddedGroup_ = group;
        this.sendEvent_(shaka.ads.Utils.AD_BREAK_STARTED,
            (new Map()).set('timeOffset', current.startTime));
      }
      this.embeddedInterstitial_ = current;
      const ad = new shaka.ads.InterstitialAd(this.baseVideo_, current,
          () => {
            if (this.embeddedInterstitial_ == current) {
              this.stopEmbeddedInterstitial_(shaka.ads.Utils.AD_SKIPPED);
              this.baseVideo_.currentTime = current.endTime;
            }
          }, current.sequenceLength || 1, current.position || 1, false);
      const session = this.createSession_(current, ad, this.baseVideo_,
          (type) => this.sendEventForAd_(current, type));
      const events = session.getEventManager();
      events.listen(this.baseVideo_, 'pause', () => {
        if (!this.baseVideo_.ended &&
            this.baseVideo_.currentTime < current.endTime) {
          this.sendEventForAd_(current, shaka.ads.Utils.AD_PAUSED);
        }
      });
      events.listen(this.baseVideo_, 'play', () => {
        this.sendEventForAd_(current, shaka.ads.Utils.AD_RESUMED);
      });
      let muted = this.baseVideo_.muted;
      events.listen(this.baseVideo_, 'volumechange', () => {
        const type = this.baseVideo_.muted ? shaka.ads.Utils.AD_MUTED :
            shaka.ads.Utils.AD_VOLUME_CHANGED;
        this.sendEventForAd_(current, type,
            (new Map()).set('muteChanged', muted != this.baseVideo_.muted));
        muted = this.baseVideo_.muted;
      });
      events.listen(this.basePlayer_, 'error', (event) => {
        this.sendEventForAd_(current, shaka.ads.Utils.AD_ERROR,
            (new Map()).set('originalEvent', event));
      });
      const uri = current.clickThroughUrl;
      if (uri && shaka.ads.InterstitialAdManager.isSafeClickThroughUri_(uri)) {
        // Like the media of other ads, the slot covers the ad container, so
        // the UI shows the container and passes clicks through to it.
        let target = this.baseVideo_;
        if (this.adContainer_) {
          target = shaka.util.Dom.createHTMLElement('div');
          target.style.cssText =
              'position:absolute;top:0;left:0;width:100%;height:100%;' +
              'cursor:pointer';
          this.adContainer_.appendChild(target);
          this.embeddedClickTarget_ = target;
        }
        events.listen(target, 'click', (event) => {
          // The click is handled here; it must not also toggle playback.
          event.stopPropagation();
          this.sendEventForAd_(current, shaka.ads.Utils.AD_CLICKED);
          this.baseVideo_.pause();
          window.open(session.expandUri(uri), '_blank');
        });
      }
      this.sendEventForAd_(current, shaka.ads.Utils.AD_IMPRESSION);
      this.sendEventForAd_(current, shaka.ads.Utils.AD_STARTED,
          (new Map()).set('ad', ad));
      this.sendEventForAd_(current, shaka.ads.Utils.AD_PLAYING,
          (new Map()).set('ad', ad));
    }
    this.sessions_.get(current)?.update();
  }

  /**
   * Ends the current embedded slot.
   *
   * @param {?string} type The event that explains the end, if any.
   * @private
   */
  stopEmbeddedInterstitial_(type) {
    const interstitial = this.embeddedInterstitial_;
    if (!interstitial) {
      return;
    }
    if (type) {
      this.sendEventForAd_(interstitial, type);
    }
    this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_STOPPED);
    this.sessions_.get(interstitial)?.release();
    this.sessions_.delete(interstitial);
    this.embeddedInterstitial_ = null;
    this.embeddedClickTarget_?.remove();
    this.embeddedClickTarget_ = null;
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {!shaka.ads.InterstitialAd} ad
   * @param {!HTMLMediaElement} video
   * @param {function(string)} onEvent
   * @return {!shaka.ads.InterstitialAdSession}
   * @private
   */
  createSession_(interstitial, ad, video, onEvent) {
    const embedded = interstitial.playbackMode == shaka.ads.Utils.EMBEDDED;
    const session = new shaka.ads.InterstitialAdSession(video, interstitial,
        ad, onEvent, () => embedded || !this.usingBaseVideo_ ?
            this.baseVideo_.currentTime : this.lastTime_ || 0);
    this.sessions_.set(interstitial, session);
    const sendBeacon = (uri) => this.sendBeacon_(session.expandUri(uri));
    let tracker = this.createTracker_(interstitial, session, sendBeacon,
        (uri) => this.makeAdRequest_(uri, {}));
    if (!tracker && interstitial.tracking) {
      const events =
          shaka.ads.InterstitialTracker.fromTracking(interstitial.tracking);
      tracker = new shaka.ads.InterstitialTracker(() => events, sendBeacon);
    }
    session.setTracker(tracker);
    return session;
  }

  /**
   * Advises that the resources of the interstitial (or deferred resource) with
   * the given ID may be resolved from the given time on. It is translated into
   * a resolutionTimeOffset, computed as the gap between the target's start
   * time and the hint's start time.
   *
   * @param {string} targetId
   * @param {number} startTime
   */
  addPreloadHint(targetId, startTime) {
    this.preloadOffsets_.set(targetId, startTime);
    // Apply the hint to interstitials and resources that are already known.
    for (const interstitial of this.interstitials_) {
      this.applyPreloadOffset_(interstitial);
    }
    for (const descriptor of this.deferredInterstitials_) {
      this.applyPreloadOffset_(descriptor);
    }
  }

  /**
   * Sets resolutionTimeOffset from a matching preload hint, if any.
   *
   * @param {{id: ?string, groupId: (?string|undefined),
   *          startTime: number,
   *          resolutionTimeOffset: (number|undefined)}} item
   * @private
   */
  applyPreloadOffset_(item) {
    let preloadStart = this.preloadOffsets_.get(item.id || '');
    if (preloadStart == null && item.groupId != null) {
      preloadStart = this.preloadOffsets_.get(item.groupId);
    }
    if (preloadStart != null) {
      item.resolutionTimeOffset = Math.max(0, item.startTime - preloadStart);
    }
  }

  /**
   * Applies a newly supplied playout limit to a scheduled ad or resource.
   * Existing limits remain unchanged.
   *
   * @param {string} id
   * @param {number} playoutLimit
   */
  updateInterstitial(id, playoutLimit) {
    for (const interstitial of this.interstitials_) {
      if (interstitial.id == id || interstitial.groupId == id) {
        this.applyUpdatedPlayoutLimit_(interstitial, playoutLimit);
      }
    }
    for (const descriptor of this.deferredInterstitials_) {
      if (descriptor.id == id && descriptor.playoutLimit == null) {
        descriptor.playoutLimit = playoutLimit;
      }
    }
  }

  /**
   * Applies a newly introduced playout limit to an interstitial. If the
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
    const playout = this.playout_;
    if (!isPlaying || !isVideoAd || !playout || playout.limit != Infinity) {
      return;
    }
    playout.limit = playoutLimit;
    const remaining = playout.limit - playout.played;
    if (remaining <= 0) {
      this.lastOnPlayoutLimit_?.();
    } else {
      this.player_.configure('playRangeEnd',
          this.video_.currentTime + remaining);
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
    const generation = this.generation_;
    let cuepointsChanged = false;
    for (const interstitial of interstitials) {
      const embedded = interstitial.playbackMode == shaka.ads.Utils.EMBEDDED;
      if (!embedded && !interstitial.uri) {
        shaka.log.alwaysWarn('Missing URL in interstitial', interstitial);
        continue;
      }
      if (embedded && (interstitial.endTime == null ||
          !Number.isFinite(interstitial.endTime) ||
          interstitial.endTime <= interstitial.startTime)) {
        shaka.log.warning(
            'Invalid embedded interstitial interval', interstitial);
        continue;
      }
      if (!embedded) {
        this.getPlayer();
      }
      if (!embedded && !interstitial.mimeType) {
        try {
          const netEngine = this.player_.getNetworkingEngine();
          goog.asserts.assert(netEngine, 'Need networking engine');
          // eslint-disable-next-line no-await-in-loop
          interstitial.mimeType = await shaka.net.NetworkingUtils.getMimeType(
              interstitial.uri || '', netEngine,
              this.basePlayer_.getConfiguration().streaming.retryParameters);
        } catch (error) {}
      }
      if (generation != this.generation_) {
        return;
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
      this.applyPreloadOffset_(interstitial);
      this.interstitials_.add(interstitial);
      this.hasEmbeddedInterstitials_ =
          this.hasEmbeddedInterstitials_ || embedded;
      this.sortedInterstitials_ = null;
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
      const interstitials = this.getSortedInterstitials_().filter((item) =>
        item.playbackMode != shaka.ads.Utils.EMBEDDED);
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
   * Returns true if we are within the interstitialCooldown window that starts
   * after an SGAI interstitial ad break finishes playing. While active, any
   * snapback or next ad break should be skipped.
   *
   * @return {boolean}
   * @private
   */
  isInCooldown_() {
    const cooldown = this.config_ ? this.config_.interstitialCooldown : 0;
    if (cooldown <= 0 || this.lastAdCompleteTime_ == null) {
      return false;
    }
    return (Date.now() - this.lastAdCompleteTime_) / 1000 < cooldown;
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
      const data = (new Map())
          .set('timeOffset', timeOffset)
          .set('startedAt', this.lastTime_);
      this.sendEventForAd_(interstitial,
          shaka.ads.Utils.AD_BREAK_STARTED, data);
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
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_STOPPED);
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
        this.lastAdCompleteTime_ = Date.now();
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_BREAK_ENDED,
            (new Map()).set('timeOffset', timeOffset));
      }
    };

    const ad = new shaka.ads.InterstitialStaticAd(
        interstitial, sequenceLength, adPosition);

    this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_IMPRESSION);
    this.sendEventForAd_(interstitial,
        shaka.ads.Utils.AD_STARTED, (new Map()).set('ad', ad));

    if (tagName == 'iframe') {
      htmlElement.src = interstitial.uri;
    } else {
      htmlElement.src = interstitial.uri;
      htmlElement.onerror = (e) => {
        this.sendEventForAd_(interstitial,
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
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_COMPLETE);
        basicTask();
      } else if (interstitial.endTime &&
          this.baseVideo_.currentTime > interstitial.endTime) {
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_COMPLETE);
        basicTask();
      } else if (this.baseVideo_.currentTime < interstitial.startTime) {
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_SKIPPED);
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
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_SKIPPED);
        basicTask();
      }
    });
    if (interstitial.clickThroughUrl) {
      this.adEventManager_.listen(htmlElement, 'click', (e) => {
        if (!interstitial.clickThroughUrl) {
          return;
        }
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_CLICKED);
        if (!shaka.ads.InterstitialAdManager.isSafeClickThroughUri_(
            interstitial.clickThroughUrl)) {
          shaka.log.warning(
              'Ignoring click-through with unsupported URI scheme:',
              interstitial.clickThroughUrl);
          return;
        }
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
      const data = (new Map())
          .set('timeOffset', timeOffset)
          .set('startedAt', this.lastTime_);
      this.sendEventForAd_(interstitial,
          shaka.ads.Utils.AD_BREAK_STARTED, data);
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
      this.sessions_.get(interstitial)?.release();
      this.sessions_.delete(interstitial);
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
          this.sendEventForAd_(interstitial,
              shaka.ads.Utils.AD_CONTENT_RESUME_REQUESTED,
              (new Map()).set('offset', offset));
        } else if (this.basePlayer_.isLive()) {
          if (interstitial.resumeOffset != null &&
              interstitial.resumeOffset != 0) {
            this.baseVideo_.currentTime += interstitial.resumeOffset;
          }
        }
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_STOPPED);
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
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_STOPPED);
        this.adEventManager_.removeAll();
        this.setupAd_(nextCurrentInterstitial, sequenceLength,
            ++adPosition, initialTime, oncePlayed);
      }
      if (!this.playingAd_) {
        this.lastAdCompleteTime_ = Date.now();
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_BREAK_ENDED,
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
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_ERROR,
          (new Map()).set('originalEvent', e));
      await basicTask(/* isSkip= */ false, isBadHttpStatus);
    };
    // Reaching the playout limit is a completion of the interstitial, and the
    // rest of its assets are not played.
    const reachPlayoutLimit = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_COMPLETE);
      await basicTask(/* isSkip= */ true, /* isBadHttpStatus= */ false);
    };
    this.lastOnPlayoutLimit_ = reachPlayoutLimit;
    let lastPosition = null;
    const updatePlayout = () => {
      const playout = this.playout_;
      const position = this.video_.currentTime;
      if (playout && lastPosition != null && !this.video_.seeking &&
          position > lastPosition && position - lastPosition < 1) {
        playout.played += position - lastPosition;
      }
      lastPosition = position;
      return !!playout && playout.played >= playout.limit -
          shaka.ads.InterstitialAdManager.PLAYOUT_LIMIT_TOLERANCE_;
    };
    const complete = async () => {
      if (updatePlayout()) {
        await reachPlayoutLimit();
        return;
      }
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      // Reaching the end of the media is a completion.
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_COMPLETE);
      await basicTask(/* isSkip= */ false, /* isBadHttpStatus= */ false);
    };
    this.lastOnSkip_ = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_SKIPPED);
      await basicTask(/* isSkip= */ true, /* isBadHttpStatus= */ false);
    };

    const ad = new shaka.ads.InterstitialAd(this.video_,
        interstitial, this.lastOnSkip_,
        interstitial.sequenceLength || sequenceLength,
        interstitial.position || adPosition,
        !this.usingBaseVideo_);
    const session = this.createSession_(interstitial, ad, this.video_,
        (type) => {
          updateBaseVideoTime();
          this.sendEventForAd_(interstitial, type);
        });
    if (!this.usingBaseVideo_) {
      ad.setMuted(this.baseVideo_.muted);
      ad.setVolume(this.baseVideo_.volume);
    }

    this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_IMPRESSION);
    this.sendEventForAd_(interstitial,
        shaka.ads.Utils.AD_STARTED, (new Map()).set('ad', ad));

    let prevCanSkipNow = ad.canSkipNow();
    if (prevCanSkipNow) {
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_SKIP_STATE_CHANGED);
    }
    // The only place the skip state is re-evaluated, so that every source of
    // change goes through the same transition check. Note that prevCanSkipNow
    // only advances when the event is actually sent, so a transition can never
    // be swallowed by a caller's guard.
    const updateSkipState = () => {
      const currentCanSkipNow = ad.canSkipNow();
      if (prevCanSkipNow != currentCanSkipNow) {
        prevCanSkipNow = currentCanSkipNow;
        this.sendEventForAd_(interstitial,
            shaka.ads.Utils.AD_SKIP_STATE_CHANGED);
      }
    };
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
    // The media element is not unloaded between the ads of a pod, so until
    // this fires it still holds the previous ad and the ad's timings cannot be
    // trusted. 'loadedmetadata' is guaranteed to precede any 'timeupdate' of
    // the new media, which is what matters when the load is instant because
    // the ad was preloaded.
    this.adEventManager_.listenOnce(this.video_, 'loadedmetadata', () => {
      ad.markMediaReady();
      updateSkipState();
    });
    this.adEventManager_.listen(this.video_, 'timeupdate', () => {
      const duration = this.video_.duration;
      if (!duration) {
        return;
      }
      if (ad.getRemainingTime() > 0 && ad.getDuration() > 0) {
        updateSkipState();
      }
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
    this.adEventManager_.listenOnce(this.player_, 'complete', complete);
    this.adEventManager_.listen(this.video_, 'seeking', () => {
      lastPosition = null;
    });
    this.adEventManager_.listen(this.video_, 'timeupdate', () => {
      const playout = this.playout_;
      if (updatePlayout() && playout && playout.played >= playout.limit) {
        reachPlayoutLimit();
      }
    });
    let adPlayingFired = false;
    this.adEventManager_.listen(this.video_, 'play', () => {
      if (!adPlayingFired) {
        adPlayingFired = true;
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_PLAYING,
            (new Map()).set('ad', ad));
      } else {
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_RESUMED);
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
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_PAUSED);
    });
    let muted = this.video_.muted;
    this.adEventManager_.listen(this.video_, 'volumechange', () => {
      if (this.video_.muted) {
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_MUTED);
      } else {
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_VOLUME_CHANGED,
            (new Map()).set('muteChanged', muted != this.video_.muted));
      }
      muted = this.video_.muted;
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
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_CLICKED);
        if (!ad.isPaused()) {
          ad.pause();
        }
        if (!shaka.ads.InterstitialAdManager.isSafeClickThroughUri_(
            interstitial.clickThroughUrl)) {
          shaka.log.warning(
              'Ignoring click-through with unsupported URI scheme:',
              interstitial.clickThroughUrl);
          return;
        }
        window.open(session.expandUri(interstitial.clickThroughUrl), '_blank');
      });
    }

    if (this.usingBaseVideo_ && adPosition == 1) {
      this.sendEventForAd_(interstitial,
          shaka.ads.Utils.AD_CONTENT_PAUSE_REQUESTED,
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
      this.updatePlayerConfig_(interstitial);
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
        if (interstitial.startOffset != null) {
          const offset = interstitial.startOffset;
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
      // The playout limit applies to the interstitial, which may be made of
      // several assets (e.g. an HLS asset list).
      const playoutId = interstitial.groupId || interstitial.id;
      if (adPosition == 1 || !this.playout_ || playoutId == null ||
          this.playout_.id != playoutId) {
        // Joining in the middle of the interstitial consumes its playout.
        this.playout_ = {
          id: playoutId,
          limit: interstitial.playoutLimit || Infinity,
          played: playerStartTime == null ? 0 :
              Math.max(0, (this.lastTime_ || 0) - interstitial.startTime),
        };
      } else if (interstitial.playoutLimit &&
          this.playout_.limit == Infinity) {
        this.playout_.limit = interstitial.playoutLimit;
      }
      const remaining = this.playout_.limit - this.playout_.played;
      if (remaining <= 0) {
        await reachPlayoutLimit();
        return;
      }
      if (remaining != Infinity) {
        const end = (playerStartTime || 0) + remaining;
        const rangeEnd = this.player_.getConfiguration().playRangeEnd;
        this.player_.configure('playRangeEnd', Math.min(end, rangeEnd));
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
      // Safety net: the 'loadedmetadata' listener above normally gets here
      // first, but if a platform fails to fire it we must not leave the ad
      // reporting unknown timings for its whole duration. Marking is
      // idempotent.
      ad.markMediaReady();
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_LOADED);
      updateSkipState();
      if (!interstitial.overlay || !this.baseVideo_.paused) {
        this.video_.play();
      } else {
        this.video_.pause();
      }
      const loadTime = (Date.now() - startTime) / 1000;
      this.sendEventForAd_(interstitial, shaka.ads.Utils.ADS_LOADED,
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
   * @param {!shaka.extern.DeferredInterstitial} descriptor
   * @return {!Promise<!Array<shaka.extern.AdInterstitial>>}
   * @private
   */
  async resolveInterstitialResource_(descriptor) {
    let offset = 0;
    if (!descriptor.pre && !descriptor.post &&
        this.config_.allowStartInMiddleOfInterstitial &&
        this.basePlayer_.isLive()) {
      const currentTime = this.lastTime_ ?? this.baseVideo_.currentTime;
      offset = Math.max(0, currentTime - descriptor.startTime);
    }
    try {
      return await descriptor.resolve(offset);
    } catch (error) {
      shaka.log.warning('Failed to resolve interstitial resource', error);
      return [];
    }
  }

  /**
   * Registers a resource whose resolution is controlled by the common
   * scheduler. The resolver owns the resource's format and request details.
   *
   * @param {!shaka.extern.DeferredInterstitial} descriptor
   * @return {!Promise}
   */
  async addDeferredInterstitial(descriptor) {
    if (Array.from(this.deferredInterstitials_).some((item) =>
      item.id == descriptor.id)) {
      return;
    }
    this.deferredInterstitials_.add(descriptor);
    this.applyPreloadOffset_(descriptor);
    if (this.shouldResolveResourceNow_(descriptor)) {
      descriptor.resolving = true;
      await this.resolveDeferredInterstitial_(descriptor);
    } else {
      this.cuepointsChanged_();
      this.addEventListeners_();
    }
  }

  /**
   * Resolves a deferred resource descriptor and adds the resulting
   * interstitials. Invoked from the poll timer; not awaited.
   *
   * @param {shaka.extern.DeferredInterstitial} descriptor
   * @private
   */
  async resolveDeferredInterstitial_(descriptor) {
    const generation = this.generation_;
    const interstitials = await this.resolveInterstitialResource_(descriptor);
    if (generation != this.generation_) {
      return;
    }
    descriptor.resolving = false;
    if (interstitials.length) {
      this.retainResolvedResource_(descriptor);
      await this.addInterstitials(interstitials);
    } else {
      // The resource yielded nothing (empty or failed). Drop its cue point
      // and stop listening if there is nothing left to do.
      this.deferredInterstitials_.delete(descriptor);
      this.cuepointsChanged_();
      this.removeEventListeners_();
    }
  }

  /**
   * After an resource resolves, either retain its descriptor (so a later seek
   * back into a live break can re-request it with an updated playback offset)
   * or drop it. Retaining is only useful for live streams that allow starting
   * in the middle of an interstitial.
   *
   * @param {shaka.extern.DeferredInterstitial} descriptor
   * @private
   */
  retainResolvedResource_(descriptor) {
    if (this.shouldRetainResource_()) {
      descriptor.resolved = true;
      this.deferredInterstitials_.add(descriptor);
    } else {
      this.deferredInterstitials_.delete(descriptor);
    }
  }

  /**
   * Whether resolved resources should be retained so they can be re-requested
   * after a seek. Only meaningful for live streams that allow starting in the
   * middle of an interstitial, where the playback offset would differ.
   *
   * @return {boolean}
   * @private
   */
  shouldRetainResource_() {
    return !!this.config_ && this.config_.allowStartInMiddleOfInterstitial &&
        this.basePlayer_.isLive();
  }

  /**
   * On a seek into a live break, an already-resolved resource must be
   * re-requested with an updated playback offset that reflects the new
   * playhead position. Reset the cache of any resolved resource whose range
   * now contains the playhead so the poll resolves it again.
   *
   * @param {number} currentTime
   * @private
   */
  resetResourcesOnSeek_(currentTime) {
    if (!this.shouldRetainResource_()) {
      return;
    }
    for (const descriptor of this.deferredInterstitials_) {
      if (!descriptor.resolved) {
        continue;
      }
      const endTime = descriptor.endTime;
      const inRange = currentTime >= descriptor.startTime &&
          (endTime == null || endTime == Infinity || currentTime < endTime);
      if (!inRange) {
        continue;
      }
      // Allow the resource to be resolved again with the new offset.
      descriptor.resolved = false;
      this.removeResolvedGroup_(descriptor.id);
    }
  }

  /**
   * Removes the interstitials previously resolved from the resource with the
   * given group id, so the resource can be resolved again.
   *
   * @param {?string} groupId
   * @private
   */
  removeResolvedGroup_(groupId) {
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
   * Whether the given resource should be resolved immediately rather than
   * deferred until playback approaches it.
   *
   * @param {shaka.extern.DeferredInterstitial} descriptor
   * @return {boolean}
   * @private
   */
  shouldResolveResourceNow_(descriptor) {
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
    // Include resources that have not been resolved yet, so the timeline UI
    // shows the upcoming ad breaks without waiting for their deferred
    // resolution.
    for (const descriptor of this.deferredInterstitials_) {
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
   * @param {?shaka.extern.AdInterstitial=} interstitial
   * @private
   */
  updatePlayerConfig_(interstitial = null) {
    this.getPlayer();
    goog.asserts.assert(this.player_, 'Must have player');
    goog.asserts.assert(this.basePlayer_, 'Must have base player');
    this.player_.configure(this.basePlayer_.getNonDefaultConfiguration());
    this.configurePlayer_(this.player_, interstitial);
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
   * @param {Map<string, ?>=} dict
   * @private
   */
  sendEvent_(type, dict) {
    shaka.log.info('Interstitial event', type, dict);
    this.onEvent_(new shaka.util.FakeEvent(type, dict));
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {string} type
   * @param {Map<string, ?>=} dict
   * @private
   */
  sendEventForAd_(interstitial, type, dict) {
    this.sendEvent_(type, dict);
    if (this.config_.disableTrackingEvents ||
        (type == shaka.ads.Utils.AD_VOLUME_CHANGED &&
        dict && dict.get('muteChanged') === false)) {
      return;
    }
    const session = this.sessions_.get(interstitial);
    if (session) {
      session.notify(type);
    } else if (interstitial.tracking) {
      // Static ads (images, HTML) have no playback to measure.
      const events =
          shaka.ads.InterstitialTracker.fromTracking(interstitial.tracking);
      new shaka.ads.InterstitialTracker(() => events,
          (uri) => this.sendBeacon_(uri)).onEvent(type);
    }
  }

  /**
   * @param {string} uri
   * @private
   */
  sendBeacon_(uri) {
    if (!this.config_.disableTrackingEvents) {
      this.makeAdRequest_(uri, {
        type: shaka.net.NetworkingEngine.AdvancedRequestType.TRACKING_EVENT,
      }).promise.catch((error) => {
        shaka.log.debug('Interstitial tracking request failed', error);
      });
    }
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @return {boolean}
   * @private
   */
  isWithinPreloadWindow_(interstitial) {
    if (interstitial.playbackMode == shaka.ads.Utils.EMBEDDED) {
      return false;
    }
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

  /**
   * Returns true if a click-through URI is safe to hand to window.open().
   *
   * Click-through URIs come from manifests and ad decision responses, which
   * are not trusted input. window.open() with a javascript: URI executes in
   * the opener's origin, so restrict click-throughs to http(s). Control
   * characters and whitespace are stripped before the scheme is read, because
   * browsers ignore them when resolving the scheme of a URL. A URI with no
   * scheme is relative and resolves against the page, so it is allowed.
   *
   * @param {string} uri
   * @return {boolean}
   * @private
   */
  static isSafeClickThroughUri_(uri) {
    // eslint-disable-next-line no-control-regex
    const normalizedUri = uri.replace(/[\u0000-\u0020]+/g, '');
    const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(normalizedUri);
    if (!schemeMatch) {
      return true;
    }
    const scheme = schemeMatch[1].toLowerCase();
    return scheme == 'http' || scheme == 'https';
  }
};


/**
 * @typedef {{
 *   id: ?string,
 *   limit: number,
 *   played: number,
 * }}
 *
 * @property {?string} id
 *   The interstitial, or group of interstitials, the playout belongs to.
 * @property {number} limit
 *   The playout limit, in seconds, or Infinity.
 * @property {number} played
 *   The media played so far, in seconds.
 */
shaka.ads.InterstitialAdManager.Playout;


/**
 * Margin, in seconds, within which the playout limit of an ad is considered
 * reached when its media ends. Playback is measured from timeupdate events,
 * which stop slightly before the end of the media.
 *
 * @const {number}
 * @private
 */
shaka.ads.InterstitialAdManager.PLAYOUT_LIMIT_TOLERANCE_ = 0.5;


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
          interstitial.uri || '',
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
