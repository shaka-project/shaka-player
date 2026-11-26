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
goog.require('shaka.ads.InterstitialMediaAsset');
goog.require('shaka.ads.InterstitialTracker');
goog.require('shaka.ads.LayoutRenderer');
goog.require('shaka.ads.InterstitialStaticAd');
goog.require('shaka.ads.InterstitialConcurrentPresentation');
goog.require('shaka.ads.Utils');
goog.require('shaka.ads.VastInterstitialParser');
goog.require('shaka.device.DeviceFactory');
goog.require('shaka.device.IDevice');
goog.require('shaka.log');
goog.require('shaka.media.ManifestParser');
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
   * @param {function(!shaka.Player,
   *     ?shaka.extern.AdInterstitial)=} configurePlayer
   *   Configures the player of an interstitial.
   * @param {shaka.ads.InterstitialAdSession.TrackerFactory=} createTracker
   *   Creates the format specific tracker of an interstitial.
   * @param {?shaka.ads.InterstitialAdManager.PresentationSignaling_=} signaling
   *   Reads the format specific signaling of the ads carried in the
   *   presentation of an interstitial.
   */
  constructor(adContainer, player, onEvent, configurePlayer = () => {},
      createTracker = () => null, signaling = null) {
    /** @private {?shaka.extern.AdsConfiguration} */
    this.config_ = null;

    /** @private {HTMLElement} */
    this.adContainer_ = adContainer;

    /** @private {shaka.Player} */
    this.basePlayer_ = player;

    /** @private {HTMLMediaElement} */
    this.baseVideo_ = player.getMediaElement();

    /** @private {boolean} */
    this.usingBaseVideo_ = true;

    /** @private {function(!shaka.util.FakeEvent)} */
    this.onEvent_ = onEvent;

    /**
     * The media asset of the interstitials played as video.
     * @private {!shaka.ads.InterstitialMediaAsset}
     */
    this.media_ = new shaka.ads.InterstitialMediaAsset(
        /** @type {!shaka.Player} */ (player), adContainer, configurePlayer);

    /**
     * Places the primary video and the assets of the interstitial being
     * presented.
     * @private {!shaka.ads.LayoutRenderer}
     */
    this.layoutRenderer_ = new shaka.ads.LayoutRenderer(
        /** @type {!HTMLElement} */ (this.baseVideo_), adContainer);

    /** @private {shaka.ads.InterstitialAdSession.TrackerFactory} */
    this.createTracker_ = createTracker;

    /** @private {?shaka.ads.InterstitialAdManager.PresentationSignaling_} */
    this.presentationSignaling_ = signaling;

    /** @private {!Set<string>} */
    this.interstitialIds_ = new Set();

    /** @private {!Set<shaka.extern.AdInterstitial>} */
    this.interstitials_ = new Set();

    /**
     * The executions of each interstitial with an id: how many times it
     * started playing and how late its last execution started, for the
     * player state parameters of the requests of DASH alternative MPD
     * events (ISO/IEC 23009-1 Annex I.4).
     * @private {!Map<string, {count: number, delta: number}>}
     */
    this.executions_ = new Map();

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

    /**
     * While playback starts in an ad break, the streaming of the content is
     * held, and this releases it with the position to start at.
     * @private {?function(number)}
     */
    this.releaseStreaming_ = null;

    /** @private {?shaka.extern.AdInterstitial} */
    this.lastPlayedAd_ = null;

    /**
     * Playout of the interstitial being played. Only media actually played
     * counts, so loading or rebuffering its assets does not consume its
     * playout limit.
     * @private {?shaka.ads.InterstitialAdManager.Playout_}
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

    /**
     * The non-linear interstitial being presented with the primary content,
     * if any.
     * @private {?shaka.ads.InterstitialConcurrentPresentation}
     */
    this.concurrentPresentation_ = null;

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
      if (!shaka.ads.Utils.isLinear(interstitial)) {
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
      if (this.playingAd_ || !this.lastTime_ || this.releaseStreaming_ ||
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
      if (this.lastTime_) {
        // Video frame callbacks only run while frames are presented, which
        // never happens in hidden pages or for audio-only content.
        this.checkForInterstitials_();
        return;
      }
      this.updateEmbeddedInterstitial_();
      if (this.playingAd_ || this.releaseStreaming_ ||
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
            if (shaka.ads.Utils.isLinear(interstitial)) {
              cuepointsChanged = true;
            }
          } else {
            if (this.isWithinPreloadWindow_(interstitial)) {
              if (!this.preloadTasks_.has(interstitial) &&
                  this.isPreloadAllowed_(interstitial)) {
                this.preloadTasks_.set(interstitial,
                    this.createPreloadTask_(interstitial));
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

    // Where playback starts is only known once the presentation is loaded,
    // which can be after its interstitials are added: before segments are
    // fetched for DASH ('streaming'), once the media playlists are loaded for
    // HLS ('canupdatestarttime'), and with the metadata of the media element
    // for src= playback.
    this.eventManager_.listenMulti(this.basePlayer_,
        ['streaming', 'canupdatestarttime'],
        () => this.checkStartInterstitials_());
    this.eventManager_.listen(this.baseVideo_, 'loadedmetadata',
        () => this.checkStartInterstitials_());

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
   * video. Then, it either creates or destroys the media element of the
   * media asset, as appropriate.
   * @param {boolean=} force If true, re-create the media element of the
   *   media asset if it is appropriate for playback.
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
    this.media_.useOwnElement(!this.usingBaseVideo_, force);
  }


  /**
   * Resets the Interstitial manager and removes any continuous polling.
   */
  stop() {
    if (this.adEventManager_) {
      this.adEventManager_.removeAll();
    }
    this.media_.getEventManager().removeAll();
    this.generation_++;
    this.releaseStreaming_?.(this.lastTime_ || 0);
    this.releaseStreaming_ = null;
    for (const session of this.sessions_.values()) {
      session.release();
    }
    this.sessions_.clear();
    this.embeddedInterstitial_ = null;
    this.embeddedGroup_ = null;
    this.embeddedClickTarget_ = null;
    this.interstitialIds_.clear();
    this.interstitials_.clear();
    this.executions_.clear();
    this.hasEmbeddedInterstitials_ = false;
    this.sortedInterstitials_ = null;
    for (const resource of this.deferredInterstitials_) {
      resource.abort();
    }
    this.deferredInterstitials_.clear();
    this.preloadOffsets_.clear();
    this.media_.destroyAllPreloads();
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
    this.media_.reset();
    this.isEnded_ = false;
    this.playingAd_ = false;
    this.lastTime_ = null;
    this.lastPlayedAd_ = null;
    this.playout_ = null;
    this.lastOnPlayoutLimit_ = null;
    this.lastAdCompleteTime_ = null;
    this.usingBaseVideo_ = true;
    this.removeBaseStyles_();
    this.removeEventListeners_();
    this.concurrentPresentation_?.release();
    this.concurrentPresentation_ = null;
    if (this.adContainer_) {
      shaka.util.Dom.removeAllChildren(this.adContainer_);
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
    this.media_.release();
    this.layoutRenderer_.release();
  }

  /**
   * @return {!shaka.Player}
   */
  getPlayer() {
    return this.media_.getPlayer();
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
        (this.playingAd_ && this.lastPlayedAd_ &&
          shaka.ads.Utils.isLinear(this.lastPlayedAd_))) {
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
          }, current.podSize || 1, current.podPosition || 1, false);
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
      if (uri && shaka.ads.Utils.isHttpOrRelativeUri(uri)) {
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
          (new Map()).set('ad', ad).set('interstitial', current));
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
    const isVideoAd = shaka.ads.Utils.isLinear(interstitial) &&
        !shaka.ads.Utils.isStatic(interstitial);
    const playout = this.playout_;
    if (!isPlaying || !isVideoAd || !playout || playout.limit != Infinity) {
      return;
    }
    playout.limit = playoutLimit;
    const remaining = playout.limit - playout.played;
    if (remaining <= 0) {
      this.lastOnPlayoutLimit_?.();
    } else {
      this.media_.getPlayer().configure('playRangeEnd',
          this.media_.getMediaElement().currentTime + remaining);
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
      interstitials = await shaka.ads.VastInterstitialParser
          .parseVastToInterstitials(data, this.lastTime_);
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
        const ads = await shaka.ads.VastInterstitialParser
            .parseVastToInterstitials(vast, ad.time);
        interstitials.push(...ads);
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
          const netEngine = this.getPlayer().getNetworkingEngine();
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
      const isLinear = shaka.ads.Utils.isLinear(interstitial);
      if (interstitial.loop && isLinear) {
        shaka.log.alwaysWarn('Loop is only supported in overlay interstitials',
            interstitial);
      }
      if (isLinear) {
        cuepointsChanged = true;
      }
      this.interstitialIds_.add(interstitialId);
      this.applyPreloadOffset_(interstitial);
      this.interstitials_.add(interstitial);
      this.hasEmbeddedInterstitials_ =
          this.hasEmbeddedInterstitials_ || embedded;
      this.sortedInterstitials_ = null;
      this.preloadIfWithinWindow_(interstitial);
    }
    if (cuepointsChanged) {
      this.cuepointsChanged_();
    }
    this.addEventListeners_();
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
          if ((difference > 0 || (difference == 0 && this.lastTime_ == 0)) &&
              difference <= this.maxJoinDelay_(interstitial)) {
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
   * How long after the start of an interstitial playback can still start it:
   * until its end when starting in the middle of interstitials is allowed,
   * without limit when it cannot be jumped over, and otherwise 1 second.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @return {number}
   * @private
   */
  maxJoinDelay_(interstitial) {
    if (!interstitial.canJump) {
      return Infinity;
    }
    if (this.config_.allowStartInMiddleOfInterstitial &&
        interstitial.endTime && interstitial.endTime != Infinity) {
      return interstitial.endTime - interstitial.startTime;
    }
    return 1;
  }


  /**
   * The position of the primary content.  Before its first time update, it
   * is where playback is going to start: the live edge for live content, and
   * the start of the seek range otherwise.  Null when that is not known yet,
   * because the presentation is still loading.
   *
   * @return {?number}
   * @private
   */
  getPosition_() {
    if (this.lastTime_ != null) {
      return this.lastTime_;
    }
    const seekRange = this.basePlayer_.seekRange();
    if (!seekRange.start && !seekRange.end) {
      return null;
    }
    const position =
        this.basePlayer_.isLive() ? seekRange.end : seekRange.start;
    return Number.isFinite(position) ? position : null;
  }


  /**
   * Before playback starts, loads the interstitials of the ad break where it
   * is going to start, once that is known.
   *
   * @private
   */
  checkStartInterstitials_() {
    if (this.lastTime_ != null || this.playingAd_ ||
        this.getPosition_() == null) {
      return;
    }
    for (const descriptor of Array.from(this.deferredInterstitials_)) {
      if (!descriptor.resolving && !descriptor.resolved &&
          this.shouldResolveResourceNow_(descriptor)) {
        descriptor.resolving = true;
        this.resolveDeferredInterstitial_(descriptor);
      }
    }
    for (const interstitial of this.interstitials_) {
      this.preloadIfWithinWindow_(interstitial);
    }
    this.startInAdBreak_();
  }


  /**
   * When playback is going to start in an ad break that replaces the content
   * (e.g. a pre-roll, or a live stream joined during an ad break), the
   * content is not streamed until the ad break ends, so that what the ad
   * break replaces is neither fetched nor shown.  The ad break starts as soon
   * as playback does.
   *
   * @private
   */
  startInAdBreak_() {
    if (this.releaseStreaming_ || this.playingAd_ || this.lastTime_ != null ||
        this.usingBaseVideo_ || this.basePlayer_.isRemotePlayback() ||
        !this.getStartInterstitial_()) {
      return;
    }
    const hold = Promise.withResolvers();
    if (!this.basePlayer_.holdStreamingStart(hold.promise)) {
      return;
    }
    this.releaseStreaming_ = (position) => {
      this.releaseStreaming_ = null;
      hold.resolve(position);
    };
    const generation = this.generation_;
    const start = () => {
      if (generation != this.generation_ || !this.releaseStreaming_) {
        return;
      }
      // Where playback starts now, since it may have been waiting to play.
      const interstitial = this.getStartInterstitial_();
      const position = this.getPosition_();
      if (interstitial && position != null) {
        this.lastTime_ = position;
        this.setupAd_(interstitial, /* sequenceLength= */ 1,
            /* adPosition= */ 1, /* initialTime= */ Date.now());
      }
      if (!this.playingAd_) {
        // The ad break is not played, so the content starts instead.
        this.lastTime_ = null;
        this.releaseStreaming_(position ?? 0);
      }
    };
    if (this.baseVideo_.autoplay || !this.baseVideo_.paused) {
      start();
    } else {
      // Playback has not been requested yet.
      this.eventManager_.listenOnce(this.baseVideo_, 'play', start);
    }
  }


  /**
   * The linear interstitial played first when playback starts where it is
   * going to start, if any.
   *
   * @return {?shaka.extern.AdInterstitial}
   * @private
   */
  getStartInterstitial_() {
    const position = this.getPosition_();
    if (this.lastTime_ != null || position == null) {
      return null;
    }
    this.lastTime_ = position;
    let interstitial = null;
    if (!this.lastPlayedAd_) {
      interstitial = this.getCurrentInterstitial_(/* needPreRoll= */ true);
    }
    if (!interstitial) {
      interstitial = this.getCurrentInterstitial_();
    }
    this.lastTime_ = null;
    if (!interstitial || !shaka.ads.Utils.isLinear(interstitial) ||
        !this.canPresent_(interstitial)) {
      return null;
    }
    return interstitial;
  }


  /**
   * Where the content returns to after a linear interstitial that started at
   * the given position of the content and played for the given time: the
   * resume offset after it, the end of the range it replaces when it is
   * clipped to it, and otherwise where the content would be now.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} startPosition
   * @param {number} elapsed
   * @return {number}
   * @private
   */
  static getReturnPosition_(interstitial, startPosition, elapsed) {
    if (interstitial.resumeOffset != null) {
      return startPosition + interstitial.resumeOffset;
    }
    if (interstitial.timelineRange && interstitial.endTime &&
        interstitial.endTime != Infinity && interstitial.clip !== false) {
      return interstitial.endTime;
    }
    return startPosition + elapsed;
  }


  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @private
   */
  preloadIfWithinWindow_(interstitial) {
    if (!this.isWithinPreloadWindow_(interstitial)) {
      return;
    }
    if (!this.preloadTasks_.has(interstitial) &&
        this.isPreloadAllowed_(interstitial)) {
      this.preloadTasks_.set(interstitial,
          this.createPreloadTask_(interstitial));
    }
    this.checkPreloadOnDomElements_(interstitial);
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
    this.media_.mount();

    if (adPosition == 1 && sequenceLength == 1) {
      sequenceLength = Array.from(this.interstitials_).filter((i) => {
        // Embedded slots are part of the primary content, not of this break.
        if (i.playbackMode == shaka.ads.Utils.EMBEDDED) {
          return false;
        }
        if (interstitial.pre) {
          return i.pre == interstitial.pre;
        } else if (interstitial.post) {
          return i.post == interstitial.post;
        }
        return Math.abs(i.startTime - interstitial.startTime) < 0.001;
      }).length;
    }

    if (interstitial.playoutLimit &&
        !shaka.ads.Utils.isStatic(interstitial) &&
        interstitial.playoutLimit - this.getJoin_(interstitial, adPosition)
            .consumed <= 0) {
      // Joined too late: clipping leaves nothing to play, so the interstitial
      // is not executed (ISO/IEC 23009-1:2026, 5.16.2.2.6). A failed
      // execution does not use up an interstitial that plays only once.
      shaka.log.info('Skipping interstitial with no playout left',
          interstitial);
      return;
    }

    if (interstitial.once) {
      oncePlayed++;
      this.interstitials_.delete(interstitial);
      this.sortedInterstitials_ = null;
      this.removeEventListeners_();
      if (shaka.ads.Utils.isLinear(interstitial)) {
        this.cuepointsChanged_();
      }
    }

    if (!this.canPresent_(interstitial)) {
      shaka.log.alwaysWarn('Unsupported interstitial', interstitial);
      return;
    }
    shaka.log.info('Starting interstitial', interstitial);
    if (shaka.ads.Utils.isLinear(interstitial)) {
      this.setupLinearAd_(interstitial, sequenceLength, adPosition,
          initialTime, oncePlayed);
    } else if (shaka.ads.Utils.isStatic(interstitial)) {
      this.setupConcurrentAssetAd_(interstitial, sequenceLength, adPosition,
          oncePlayed);
    } else {
      this.setupConcurrentMediaAd_(interstitial, sequenceLength, adPosition,
          oncePlayed);
    }
  }


  /**
   * What the device can present together with the primary content.
   *
   * @return {shaka.ads.InterstitialAdManager.Capabilities_}
   * @private
   */
  getCapabilities_() {
    return {
      // The base video is the only media element when it is reused for ads.
      concurrentVideo: this.usingBaseVideo_ ? 1 : 2,
      // Images and HTML documents are drawn in the ad container.
      concurrentImage: !!this.adContainer_,
    };
  }


  /**
   * Whether the interstitial can be presented with the current capabilities.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @return {boolean}
   * @private
   */
  canPresent_(interstitial) {
    const Utils = shaka.ads.Utils;
    const isStatic = Utils.isStatic(interstitial);
    if (Utils.isLinear(interstitial)) {
      // A linear interstitial replaces the primary content, which an image or
      // an HTML document has no media to do.
      return !isStatic;
    }
    const capabilities = this.getCapabilities_();
    return isStatic ? capabilities.concurrentImage :
        capabilities.concurrentVideo > 1;
  }


  /**
   * Starts an ad break if none is being played.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} timeOffset
   * @private
   */
  startAdBreak_(interstitial, timeOffset) {
    if (!this.playingAd_) {
      const data = (new Map())
          .set('timeOffset', timeOffset)
          .set('startedAt', this.lastTime_);
      this.sendEventForAd_(interstitial,
          shaka.ads.Utils.AD_BREAK_STARTED, data);
    }

    this.playingAd_ = true;
  }


  /**
   * Moves on to the next interstitial of the ad break when a concurrent
   * presentation has ended, or ends the ad break.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} oncePlayed
   * @param {number} timeOffset
   * @private
   */
  endConcurrentAd_(interstitial, sequenceLength, adPosition, oncePlayed,
      timeOffset) {
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
  }


  /**
   * Presents the image or the HTML document of a non-linear interstitial.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} oncePlayed
   * @private
   */
  setupConcurrentAssetAd_(interstitial, sequenceLength, adPosition,
      oncePlayed) {
    const timeOffset = this.getTimeOffset_(interstitial);
    this.startAdBreak_(interstitial, timeOffset);

    goog.asserts.assert(interstitial.overlay, 'Must have overlay');
    goog.asserts.assert(this.adContainer_, 'Must have ad container');

    this.setBaseStyles_(interstitial);

    const ad = new shaka.ads.InterstitialStaticAd(
        interstitial, sequenceLength, adPosition);

    this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_IMPRESSION);
    this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_STARTED,
        (new Map()).set('ad', ad).set('interstitial', interstitial));

    const onClick = () => {
      if (!interstitial.clickThroughUrl) {
        return;
      }
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_CLICKED);
      if (!shaka.ads.Utils.isHttpOrRelativeUri(interstitial.clickThroughUrl)) {
        shaka.log.warning(
            'Ignoring click-through with unsupported URI scheme:',
            interstitial.clickThroughUrl);
        return;
      }
      window.open(interstitial.clickThroughUrl, '_blank');
    };

    const onEnd = () => {
      if (this.concurrentPresentation_ == presentation) {
        this.concurrentPresentation_ = null;
      }
      this.removeBaseStyles_(interstitial);
      this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_STOPPED);
      this.adEventManager_.removeAll();
      this.endConcurrentAd_(interstitial, sequenceLength, adPosition,
          oncePlayed, timeOffset);
    };

    const presentation = new shaka.ads.InterstitialConcurrentPresentation(
        interstitial, /** @type {!HTMLMediaElement} */ (this.baseVideo_));
    this.concurrentPresentation_ = presentation;
    presentation.presentAsset(
        /** @type {!HTMLElement} */ (this.adContainer_), this.layoutRenderer_,
        (type, data) => this.sendEventForAd_(interstitial, type, data),
        onClick, onEnd);
  }


  /**
   * Plays the media of a non-linear interstitial in a media element of its
   * own, over the primary content, which keeps playing.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} oncePlayed
   * @return {!Promise}
   * @private
   */
  async setupConcurrentMediaAd_(interstitial, sequenceLength, adPosition,
      oncePlayed) {
    const media = this.media_;
    const startTime = Date.now();
    const timeOffset = this.getTimeOffset_(interstitial);
    this.startAdBreak_(interstitial, timeOffset);

    /** @type {!Array<!shaka.ads.InterstitialAdManager.PresentedAd>} */
    let presented = [{
      interstitial,
      start: 0,
      end: null,
    }];
    if (this.readsPresentation_(interstitial)) {
      const ads = await this.readPresentedAds_(interstitial, adPosition);
      if (!ads) {
        return;
      }
      presented = ads;
    }

    const presentation = new shaka.ads.InterstitialConcurrentPresentation(
        interstitial, /** @type {!HTMLMediaElement} */ (this.baseVideo_));
    this.concurrentPresentation_ = presentation;

    await this.playMediaAd_(interstitial, presented, sequenceLength,
        adPosition, startTime, {
          prepare: (current) => {
            this.showMedia_(current, interstitial);
            media.getMediaElement().loop = interstitial.loop;
            return Promise.resolve();
          },
          start: (skip) => {
            const video = media.getMediaElement();
            if (this.baseVideo_.paused) {
              video.pause();
            } else {
              video.play();
            }
            presentation.presentMedia(video, this.basePlayer_.isLive(), skip);
          },
          stop: async (current) => {
            presentation.release();
            if (this.concurrentPresentation_ == presentation) {
              this.concurrentPresentation_ = null;
            }
            this.removeBaseStyles_(current);
            await media.stop();
            this.sendEventForAd_(current, shaka.ads.Utils.AD_STOPPED);
            this.adEventManager_.removeAll();
            media.getEventManager().removeAll();
            media.hide();
            if (!this.isEnded_) {
              this.baseVideo_.play();
            }
            this.determineIfUsingBaseVideo_();
            this.endConcurrentAd_(interstitial, sequenceLength, adPosition,
                oncePlayed, timeOffset);
          },
          onAdEvent: null,
          onTimeUpdate: null,
        });
  }


  /**
   * Plays a linear interstitial, which replaces the primary content.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} initialTime the clock time the ad started at
   * @param {number} oncePlayed
   * @return {!Promise}
   * @private
   */
  async setupLinearAd_(interstitial, sequenceLength, adPosition, initialTime,
      oncePlayed) {
    const media = this.media_;
    const events = media.getEventManager();
    const startTime = Date.now();

    const timeOffset = this.getTimeOffset_(interstitial);
    this.startAdBreak_(interstitial, timeOffset);

    /** @type {!Array<!shaka.ads.InterstitialAdManager.PresentedAd>} */
    let presented = [{interstitial, start: 0, end: null}];
    if (this.readsPresentation_(interstitial)) {
      // The signaling in the presentation describes its ads, so the
      // presentation is parsed before they are announced.
      if (!this.usingBaseVideo_) {
        this.baseVideo_.pause();
      }
      const waitStart = Date.now();
      const ads = await this.readPresentedAds_(interstitial, adPosition);
      if (!ads) {
        return;
      }
      if (this.usingBaseVideo_) {
        // The content kept playing in the meantime.
        initialTime += Date.now() - waitStart;
      }
      presented = ads;
    }

    const updateBaseVideoTime = () => {
      if (this.releaseStreaming_) {
        // The content has not started: it starts where the ad break returns
        // to when the ad break ends.
        return;
      }
      if (!this.usingBaseVideo_) {
        if (interstitial.resumeOffset == null) {
          if (interstitial.timelineRange && interstitial.endTime &&
              interstitial.endTime != Infinity && interstitial.clip !== false) {
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

    /**
     * @param {shaka.extern.AdInterstitial} current
     * @param {boolean} isSkip
     * @param {boolean} isBadHttpStatus
     */
    const basicTask = async (current, isSkip, isBadHttpStatus) => {
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
      this.removeBaseStyles_(current);
      if (!nextCurrentInterstitial ||
          !shaka.ads.Utils.isLinear(nextCurrentInterstitial)) {
        if (interstitial.post) {
          this.lastTime_ = null;
          this.lastPlayedAd_ = null;
        }
        await media.stop();
        if (this.usingBaseVideo_) {
          let offset = interstitial.resumeOffset;
          if (offset == null) {
            if (interstitial.timelineRange && interstitial.endTime &&
                interstitial.endTime != Infinity &&
                interstitial.clip !== false) {
              offset = interstitial.endTime - (this.lastTime_ || 0);
            } else {
              offset = (Date.now() - initialTime) / 1000;
            }
          }
          this.sendEventForAd_(current,
              shaka.ads.Utils.AD_CONTENT_RESUME_REQUESTED,
              (new Map()).set('offset', offset));
        } else if (this.basePlayer_.isLive()) {
          if (interstitial.resumeOffset != null &&
              interstitial.resumeOffset != 0) {
            this.baseVideo_.currentTime += interstitial.resumeOffset;
          }
        }
        this.sendEventForAd_(current, shaka.ads.Utils.AD_STOPPED);
        this.adEventManager_.removeAll();
        events.removeAll();
        this.playingAd_ = false;
        if (!this.usingBaseVideo_) {
          media.hide();
          if (this.releaseStreaming_) {
            const startPosition = this.lastTime_ || 0;
            const position = isBadHttpStatus ? startPosition :
                shaka.ads.InterstitialAdManager.getReturnPosition_(
                    interstitial, startPosition,
                    (Date.now() - initialTime) / 1000);
            this.lastTime_ = position;
            this.releaseStreaming_(position);
          } else if (!isBadHttpStatus) {
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
        await media.getPlayer().detach();
        this.determineIfUsingBaseVideo_(/* force= */ true);
      } else {
        this.determineIfUsingBaseVideo_();
      }
      if (nextCurrentInterstitial) {
        this.sendEventForAd_(current, shaka.ads.Utils.AD_STOPPED);
        this.adEventManager_.removeAll();
        events.removeAll();
        this.setupAd_(nextCurrentInterstitial, sequenceLength,
            ++adPosition, initialTime, oncePlayed);
      }
      if (!this.playingAd_) {
        this.lastAdCompleteTime_ = Date.now();
        this.sendEventForAd_(interstitial, shaka.ads.Utils.AD_BREAK_ENDED,
            (new Map()).set('timeOffset', timeOffset));
      }
    };

    await this.playMediaAd_(interstitial, presented, sequenceLength,
        adPosition, startTime, {
          prepare: async (current) => {
            if (this.usingBaseVideo_ && adPosition == 1) {
              this.sendEventForAd_(current,
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
            this.showMedia_(current, interstitial);
            if (!this.usingBaseVideo_) {
              this.baseVideo_.pause();
              let resumeOffset = 0;
              if (!this.basePlayer_.isLive()) {
                if (interstitial.resumeOffset != null &&
                    interstitial.resumeOffset != 0) {
                  resumeOffset = interstitial.resumeOffset;
                }
              }
              if (this.releaseStreaming_) {
                // Now that the ad video covers it, the content is loaded
                // behind it, paused where it returns to, so that it is ready
                // when the ad break ends (and its media element has the size
                // of the content).
                this.releaseStreaming_((this.lastTime_ || 0) + resumeOffset);
              } else if (resumeOffset) {
                this.baseVideo_.currentTime += resumeOffset;
              }
              media.getMediaElement().loop = false;
            }
          },
          start: () => {
            media.getMediaElement().play();
            if (this.usingBaseVideo_) {
              this.baseVideo_.play();
            }
          },
          stop: basicTask,
          onAdEvent: updateBaseVideoTime,
          onTimeUpdate: () => {
            if (!this.usingBaseVideo_ && interstitial.resumeOffset == null &&
                interstitial.timelineRange && interstitial.endTime &&
                interstitial.endTime != Infinity &&
                interstitial.clip !== false &&
                this.baseVideo_.currentTime != interstitial.endTime) {
              const baseSeekRange = this.basePlayer_.seekRange();
              if (baseSeekRange.end >= interstitial.endTime) {
                this.baseVideo_.currentTime = interstitial.endTime;
              }
            }
          },
        });
  }


  /**
   * Reads the ads that the signaling in the presentation of the interstitial
   * describes, limited to the part of the media played from this join.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} adPosition
   * @return {!Promise<?Array<!shaka.ads.InterstitialAdManager.PresentedAd>>}
   *   The ads, or null if the ad break was stopped in the meantime.
   * @private
   */
  async readPresentedAds_(interstitial, adPosition) {
    const generation = this.generation_;
    const task = this.preloadTasks_.getOrInsertComputed(interstitial,
        () => this.createPreloadTask_(interstitial));
    const ads = await task.getPresentedAds();
    if (generation != this.generation_ || !this.playingAd_) {
      return null;
    }
    if (ads && ads.length > 1) {
      // Only the ads in the part of the media played from this join are
      // presented.
      return shaka.ads.InterstitialAdManager.clipPresented_(
          interstitial, ads, this.getPlayedRange_(interstitial, adPosition));
    }
    return ads || [{
      interstitial,
      start: 0,
      end: null,
    }];
  }


  /**
   * Shows the media element of the media asset where the interstitial is
   * presented.
   *
   * @param {shaka.extern.AdInterstitial} current The ad being presented.
   * @param {shaka.extern.AdInterstitial} interstitial
   * @private
   */
  showMedia_(current, interstitial) {
    this.setBaseStyles_(current);
    if (!this.usingBaseVideo_) {
      this.media_.show();
      this.layoutRenderer_.place(
          /** @type {!HTMLElement} */ (this.media_.getMediaElement()),
          shaka.ads.LayoutRenderer.fromInterstitial(interstitial).assets[0]);
    }
  }


  /**
   * Plays the media of an interstitial in the media asset: loads it, announces
   * and tracks its ads, and counts its playout. What depends on how the
   * interstitial is presented with the primary content is left to the hooks.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {!Array<!shaka.ads.InterstitialAdManager.PresentedAd>} presented
   *   The ads presented in the media.
   * @param {number} sequenceLength
   * @param {number} adPosition
   * @param {number} startTime the clock time the interstitial started at
   * @param {shaka.ads.InterstitialAdManager.MediaAdHooks_} hooks
   * @return {!Promise}
   * @private
   */
  async playMediaAd_(interstitial, presented, sequenceLength, adPosition,
      startTime, hooks) {
    const media = this.media_;
    const events = media.getEventManager();
    // Whether the interstitial is presented as ads that are ranges of its
    // media.
    const ranged = presented.length > 1 || presented[0].end != null;
    /**
     * @param {number} position
     * @return {!shaka.ads.InterstitialAdManager.PresentedAd}
     */
    const findPresented = (position) => presented.find((item) =>
      item.end == null || position < item.end) ||
        presented[presented.length - 1];
    let presentedAd =
        findPresented(this.getPlayedRange_(interstitial, adPosition).start);
    /**
     * The ad being presented: the interstitial, or one of the ads signaled
     * in its presentation.
     * @type {!shaka.extern.AdInterstitial}
     */
    let current = presentedAd.interstitial;

    let unloadingInterstitial = false;

    /**
     * @param {boolean} isSkip
     * @param {boolean} isBadHttpStatus
     */
    const end = async (isSkip, isBadHttpStatus) => {
      this.sessions_.get(current)?.release();
      this.sessions_.delete(current);
      await hooks.stop(current, isSkip, isBadHttpStatus);
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
      this.sendEventForAd_(current, shaka.ads.Utils.AD_ERROR,
          (new Map()).set('originalEvent', e));
      await end(/* isSkip= */ false, isBadHttpStatus);
    };
    // Reaching the playout limit is a completion of the interstitial, and the
    // rest of its assets are not played.
    const reachPlayoutLimit = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.sendEventForAd_(current, shaka.ads.Utils.AD_COMPLETE);
      await end(/* isSkip= */ true, /* isBadHttpStatus= */ false);
    };
    this.lastOnPlayoutLimit_ = reachPlayoutLimit;
    let lastPosition = null;
    const updatePlayout = () => {
      const playout = this.playout_;
      const position = media.getMediaElement().currentTime;
      if (playout && lastPosition != null && !media.getMediaElement().seeking &&
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
      this.sendEventForAd_(current, shaka.ads.Utils.AD_COMPLETE);
      await end(/* isSkip= */ false, /* isBadHttpStatus= */ false);
    };
    const onSkip = async () => {
      if (unloadingInterstitial) {
        return;
      }
      unloadingInterstitial = true;
      this.sendEventForAd_(current, shaka.ads.Utils.AD_SKIPPED);
      await end(/* isSkip= */ true, /* isBadHttpStatus= */ false);
    };

    /** @type {!shaka.ads.InterstitialAd} */
    let ad;
    /** @type {!shaka.ads.InterstitialAdSession} */
    let session;
    let prevCanSkipNow = false;
    const startAd = () => {
      const item = current;
      const video = media.getMediaElement();
      ad = new shaka.ads.InterstitialAd(video,
          item, onSkip,
          item.podSize || sequenceLength,
          item.podPosition || adPosition,
          !this.usingBaseVideo_,
          ranged ? {start: presentedAd.start, end: presentedAd.end} : null);
      session = this.createSession_(item, ad, video,
          (type) => {
            hooks.onAdEvent?.();
            this.sendEventForAd_(item, type);
          });
      if (!this.usingBaseVideo_) {
        ad.setMuted(this.baseVideo_.muted);
        ad.setVolume(this.baseVideo_.volume);
      }
    };
    const announceAd = () => {
      this.sendEventForAd_(current, shaka.ads.Utils.AD_IMPRESSION);
      this.sendEventForAd_(current, shaka.ads.Utils.AD_STARTED,
          (new Map()).set('ad', ad).set('interstitial', current));
      prevCanSkipNow = ad.canSkipNow();
      if (prevCanSkipNow) {
        this.sendEventForAd_(current, shaka.ads.Utils.AD_SKIP_STATE_CHANGED);
      }
    };
    startAd();
    announceAd();
    // The only place the skip state is re-evaluated, so that every source of
    // change goes through the same transition check. Note that prevCanSkipNow
    // only advances when the event is actually sent, so a transition can never
    // be swallowed by a caller's guard.
    const updateSkipState = () => {
      const currentCanSkipNow = ad.canSkipNow();
      if (prevCanSkipNow != currentCanSkipNow) {
        prevCanSkipNow = currentCanSkipNow;
        this.sendEventForAd_(current,
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
    events.listenOnce(media.getPlayer(), 'error', (e) => {
      error(e['detail'], /* initial= */ false);
    });
    // The media element is not unloaded between the ads of a pod, so until
    // this fires it still holds the previous ad and the ad's timings cannot be
    // trusted. 'loadedmetadata' is guaranteed to precede any 'timeupdate' of
    // the new media, which is what matters when the load is instant because
    // the ad was preloaded.
    events.listenOnce(media.getMediaElement(), 'loadedmetadata', () => {
      ad.markMediaReady();
      updateSkipState();
    });
    // Moves on to the next ad when the playhead leaves the range of the
    // current one. The media keeps playing, so the next ad is ready.
    const updatePresentedAd = () => {
      if (!ranged || unloadingInterstitial) {
        return;
      }
      const next = findPresented(media.getMediaElement().currentTime);
      if (next == presentedAd) {
        return;
      }
      const previous = current;
      const previousSession = this.sessions_.get(previous);
      if (previousSession && previousSession.canComplete()) {
        this.sendEventForAd_(previous, shaka.ads.Utils.AD_COMPLETE);
      } else if (previousSession && previousSession.hasSeeked()) {
        this.sendEventForAd_(previous, shaka.ads.Utils.AD_SKIPPED);
      }
      this.sendEventForAd_(previous, shaka.ads.Utils.AD_STOPPED);
      previousSession?.release();
      this.sessions_.delete(previous);
      presentedAd = next;
      current = next.interstitial;
      startAd();
      ad.markMediaReady();
      this.setBaseStyles_(current);
      announceAd();
      if (!media.getMediaElement().paused) {
        this.sendEventForAd_(current, shaka.ads.Utils.AD_PLAYING,
            (new Map()).set('ad', ad));
      }
    };
    events.listen(media.getMediaElement(), 'timeupdate', () => {
      updatePresentedAd();
      const duration = media.getMediaElement().duration;
      if (!duration) {
        return;
      }
      if (ad.getRemainingTime() > 0 && ad.getDuration() > 0) {
        updateSkipState();
      }
      hooks.onTimeUpdate?.();
    });
    events.listenOnce(media.getPlayer(), 'complete', complete);
    events.listen(media.getMediaElement(), 'seeking', () => {
      lastPosition = null;
    });
    events.listen(media.getMediaElement(), 'timeupdate', () => {
      const playout = this.playout_;
      if (updatePlayout() && playout && playout.played >= playout.limit) {
        reachPlayoutLimit();
      }
    });
    let adPlayingFired = false;
    events.listen(media.getMediaElement(), 'play', () => {
      if (!adPlayingFired) {
        adPlayingFired = true;
        this.sendEventForAd_(current, shaka.ads.Utils.AD_PLAYING,
            (new Map()).set('ad', ad));
      } else {
        this.sendEventForAd_(current, shaka.ads.Utils.AD_RESUMED);
      }
    });
    events.listen(media.getMediaElement(), 'pause', () => {
      // playRangeEnd in src= causes the ended event not to be fired when that
      // position is reached, instead pause event is fired.
      const currentConfig = media.getPlayer().getConfiguration();
      if (media.getMediaElement().currentTime >= currentConfig.playRangeEnd) {
        complete();
        return;
      }
      this.sendEventForAd_(current, shaka.ads.Utils.AD_PAUSED);
    });
    let muted = media.getMediaElement().muted;
    events.listen(media.getMediaElement(), 'volumechange', () => {
      const video = media.getMediaElement();
      if (video.muted) {
        this.sendEventForAd_(current, shaka.ads.Utils.AD_MUTED);
      } else {
        this.sendEventForAd_(current, shaka.ads.Utils.AD_VOLUME_CHANGED,
            (new Map()).set('muteChanged', muted != video.muted));
      }
      muted = video.muted;
      if (!this.usingBaseVideo_) {
        this.baseVideo_.volume = video.volume;
        this.baseVideo_.muted = video.muted;
      }
    });
    if (presented.some((item) => item.interstitial.clickThroughUrl)) {
      const adContainer = this.adContainer_ || media.getMediaElement();
      this.adEventManager_.listen(adContainer, 'click', (e) => {
        const clickThroughUrl = current.clickThroughUrl;
        if (!clickThroughUrl) {
          return;
        }
        this.sendEventForAd_(current, shaka.ads.Utils.AD_CLICKED);
        if (!ad.isPaused()) {
          ad.pause();
        }
        if (!shaka.ads.Utils.isHttpOrRelativeUri(clickThroughUrl)) {
          shaka.log.warning(
              'Ignoring click-through with unsupported URI scheme:',
              clickThroughUrl);
          return;
        }
        window.open(session.expandUri(clickThroughUrl), '_blank');
      });
    }

    await hooks.prepare(current);

    try {
      media.configure(interstitial);
      // Without clipping, the interstitial is not bound to its range on the
      // primary timeline.
      const playedRange = this.getPlayedRange_(interstitial, adPosition);
      if (playedRange.end != Infinity) {
        media.getPlayer().configure('playRangeEnd', playedRange.end);
      }
      const join = this.getJoin_(interstitial, adPosition);
      const playerStartTime = join.startTime;
      // The playout limit applies to the interstitial, which may be made of
      // several assets (e.g. an HLS asset list).
      const playoutId = interstitial.groupId || interstitial.id;
      if (adPosition == 1 || !this.playout_ || playoutId == null ||
          this.playout_.id != playoutId) {
        this.playout_ = {
          id: playoutId,
          limit: interstitial.playoutLimit || Infinity,
          played: join.consumed,
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
        const rangeEnd = media.getPlayer().getConfiguration().playRangeEnd;
        media.getPlayer().configure('playRangeEnd', Math.min(end, rangeEnd));
      }
      await media.attach();
      const executionDelta = this.getExecutionDelta_(interstitial);
      if (this.preloadTasks_.has(interstitial)) {
        const task = this.preloadTasks_.get(interstitial);
        this.preloadTasks_.delete(interstitial);
        const error = task.getInitialError();
        if (error) {
          throw error;
        }
        const preloadManager = task.getPreloadManager();
        if (preloadManager) {
          await media.getPlayer().load(
              preloadManager,
              playerStartTime);
        } else {
          await media.getPlayer().load(
              this.getRequestUri_(interstitial),
              playerStartTime,
              interstitial.mimeType || undefined);
        }
      } else {
        await media.getPlayer().load(
            this.getRequestUri_(interstitial),
            playerStartTime,
            interstitial.mimeType || undefined);
      }
      if (interstitial.id != null) {
        const execution = this.executions_.getOrInsertComputed(
            interstitial.id, () => ({count: 0, delta: 0}));
        execution.count++;
        execution.delta = executionDelta;
      }
      // Safety net: the 'loadedmetadata' listener above normally gets here
      // first, but if a platform fails to fire it we must not leave the ad
      // reporting unknown timings for its whole duration. Marking is
      // idempotent.
      ad.markMediaReady();
      this.sendEventForAd_(current, shaka.ads.Utils.AD_LOADED);
      updateSkipState();
      hooks.start(onSkip);
      const loadTime = (Date.now() - startTime) / 1000;
      this.sendEventForAd_(current, shaka.ads.Utils.ADS_LOADED,
          (new Map()).set('loadTime', loadTime));
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
    this.layoutRenderer_.render(
        shaka.ads.LayoutRenderer.fromInterstitial(interstitial));
    if (this.adContainer_) {
      if (interstitial.clickThroughUrl) {
        this.adContainer_.setAttribute('ad-active', 'true');
        this.adContainer_.style.pointerEvents = '';
      } else {
        this.adContainer_.style.pointerEvents = 'none';
      }
    }
    const adVideo = this.media_.getOwnElement();
    if (adVideo) {
      if (!shaka.ads.Utils.isLinear(interstitial)) {
        adVideo.style.background = '';
      } else {
        adVideo.style.background = 'rgb(0, 0, 0)';
      }
    }
  }

  /**
   * @param {?shaka.extern.AdInterstitial=} interstitial
   * @private
   */
  removeBaseStyles_(interstitial) {
    const LayoutRenderer = shaka.ads.LayoutRenderer;
    this.layoutRenderer_.clear(
        interstitial && LayoutRenderer.fromInterstitial(interstitial));
    if (this.adContainer_) {
      this.adContainer_.removeAttribute('ad-active');
      this.adContainer_.style.pointerEvents = '';
    }
    const adVideo = this.media_.getOwnElement();
    if (adVideo) {
      adVideo.style.background = '';
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
      const currentTime = this.getPosition_() ?? this.baseVideo_.currentTime;
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
    // Compare against the current playhead, or before the first time update
    // where playback is going to start, so that the ad break playback joins
    // in is resolved eagerly and the rest stay deferred.
    const currentTime = this.getPosition_() ?? this.baseVideo_.currentTime;
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
      if (!shaka.ads.Utils.isLinear(interstitial)) {
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
   * Where playback of the interstitial starts when it begins at the given
   * position of its sequence, and how much of its playout limit is already
   * consumed. Joining in the middle of an interstitial starts at the offset of
   * the join point unless startWithOffset is false, and consumes the time
   * elapsed since its start unless clip is false (ISO/IEC 23009-1:2026,
   * 5.16.2.2.6).
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {number} adPosition
   * @return {{startTime: ?number, consumed: number}}
   * @private
   */
  getJoin_(interstitial, adPosition) {
    const join = {startTime: null, consumed: 0};
    if (adPosition != 1 || interstitial.pre || interstitial.post ||
        !this.config_.allowStartInMiddleOfInterstitial ||
        this.lastTime_ == null || interstitial.startTime > this.lastTime_ ||
        (interstitial.endTime && interstitial.endTime <= this.lastTime_)) {
      return join;
    }
    const elapsed = this.lastTime_ - interstitial.startTime;
    if (interstitial.startOffset != null) {
      if (Math.abs(interstitial.startOffset) > 0.25) {
        join.startTime = interstitial.startOffset;
        join.consumed = Math.max(0, elapsed);
      }
    } else if (Math.abs(elapsed) > 0.25) {
      if (interstitial.startWithOffset !== false) {
        join.startTime = elapsed;
      }
      if (interstitial.clip !== false) {
        join.consumed = Math.max(0, elapsed);
      }
    }
    return join;
  }

  /**
   * The range of the media of an interstitial that is played if it starts
   * now.  Without clipping, the interstitial is not bound to its range on the
   * primary timeline.  A clipped one ends with that range, so when it is
   * joined late only what is left of the range, or of its playout limit, is
   * played, from the start of the media or from the join position
   * (ISO/IEC 23009-1:2026, 5.16.2.2.6).
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {number} adPosition
   * @return {{start: number, end: number}}
   * @private
   */
  getPlayedRange_(interstitial, adPosition) {
    const join = this.getJoin_(interstitial, adPosition);
    const start = join.startTime || 0;
    let end = Infinity;
    if (interstitial.clip !== false &&
        interstitial.startTime && interstitial.endTime &&
        interstitial.endTime != Infinity &&
        interstitial.endTime > interstitial.startTime) {
      end = start + Math.max(0,
          interstitial.endTime - interstitial.startTime - join.consumed);
    }
    if (interstitial.playoutLimit) {
      end = Math.min(end,
          start + Math.max(0, interstitial.playoutLimit - join.consumed));
    }
    return {start, end};
  }

  /**
   * How late the execution of an interstitial starts if it starts now: the
   * time elapsed since its start (execution-delta, ISO/IEC 23009-1:2026,
   * 5.16.2.2.6 and Annex I.4), 0 before its start and for pre-rolls and
   * post-rolls.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @return {number}
   * @private
   */
  getExecutionDelta_(interstitial) {
    if (interstitial.pre || interstitial.post || this.lastTime_ == null) {
      return 0;
    }
    return Math.max(0, this.lastTime_ - interstitial.startTime);
  }

  /**
   * The URI to request an interstitial with. Its URL parameters are built
   * again with the current player state (ISO/IEC 23009-1 Annex I.4), since
   * the URI of the interstitial carries the values of an unknown state.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @return {string}
   * @private
   */
  getRequestUri_(interstitial) {
    const uri = interstitial.uri || '';
    if (!uri || !interstitial.urlParams) {
      return uri;
    }
    return shaka.util.URL.applyUrlParams(uri, interstitial.urlParams,
        (name, key) => this.getUrlParamState_(interstitial, name, key));
  }

  /**
   * The value of a player state parameter (ISO/IEC 23009-1 Annex I.4) in a
   * request for the given interstitial, or null when it is not known. The key
   * is the id of the event the parameter refers to, which is not necessarily
   * the interstitial being requested.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {string} name
   * @param {string} key
   * @return {?string}
   * @private
   */
  getUrlParamState_(interstitial, name, key) {
    // Fractional seconds, to the millisecond.
    const format = (seconds) => String(Math.round(seconds * 1000) / 1000);
    const isRequested = interstitial.id != null && key == interstitial.id;
    const execution = this.executions_.get(key);
    switch (name) {
      case 'execution-delta':
        if (isRequested) {
          return format(this.getExecutionDelta_(interstitial));
        }
        return execution ? format(execution.delta) : null;
      case 'expected-duration':
        // The playout limit left after clipping. The duration of the
        // alternative presentation also caps it, but it is not known before
        // the presentation is loaded.
        if (isRequested && interstitial.playoutLimit) {
          const consumed = this.getJoin_(interstitial, 1).consumed;
          return format(Math.max(0, interstitial.playoutLimit - consumed));
        }
        return null;
      case 'execution-count':
        if (execution) {
          return String(execution.count);
        }
        return isRequested || this.interstitialIds_.has(key) ? '0' : null;
    }
    // What the primary content is playing.
    return this.basePlayer_.getUrlParamState(name, key);
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
   * @return {!shaka.ads.InterstitialPreloadTask}
   * @private
   */
  createPreloadTask_(interstitial) {
    const signaling = this.presentationSignaling_;
    const readSignaling = signaling && this.readsPresentation_(interstitial) ?
        (preloadManager) => {
          const manifest = preloadManager.getManifest();
          return shaka.ads.InterstitialAdManager.present_(interstitial,
              signaling.parse(interstitial, preloadManager.getRegions(),
                  manifest),
              manifest ? manifest.presentationTimeline.getDuration() :
                  Infinity);
        } : null;
    return new shaka.ads.InterstitialPreloadTask(
        this.getPlayer(), interstitial, (type, dict) => {
          this.sendEvent_(type, dict);
        }, this.getRequestUri_(interstitial), readSignaling);
  }

  /**
   * Whether the ads of the interstitial are signaled in its presentation,
   * which is then parsed before they are announced. Only presentations with
   * a manifest can be parsed in advance.
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @return {boolean}
   * @private
   */
  readsPresentation_(interstitial) {
    return !!this.presentationSignaling_ &&
        interstitial.playbackMode != shaka.ads.Utils.EMBEDDED &&
        !shaka.ads.Utils.isStatic(interstitial) && !!interstitial.mimeType &&
        shaka.media.ManifestParser.isSupported(interstitial.mimeType) &&
        this.presentationSignaling_.accepts(interstitial);
  }

  /**
   * Clips the ads an interstitial is presented as to the part of its media
   * that is played, numbering them within it.
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {!Array<!shaka.ads.InterstitialAdManager.PresentedAd>} presented
   * @param {{start: number, end: number}} range
   * @return {!Array<!shaka.ads.InterstitialAdManager.PresentedAd>}
   * @private
   */
  static clipPresented_(interstitial, presented, range) {
    const tolerance = shaka.ads.InterstitialAdManager.RANGE_TOLERANCE_;
    const end = range.end;
    const clipped = presented.filter((item) =>
      (item.end == null || item.end > range.start + tolerance) &&
        item.start < end - tolerance);
    if (!clipped.length) {
      return presented;
    }
    const last = clipped[clipped.length - 1];
    if (end != Infinity && (last.end == null || last.end > end)) {
      last.end = end;
    }
    for (let i = 0; i < clipped.length; i++) {
      const ad = clipped[i].interstitial;
      ad.podSize = clipped.length > 1 ? clipped.length : interstitial.podSize;
      ad.podPosition = clipped.length > 1 ? i + 1 : interstitial.podPosition;
    }
    return clipped;
  }

  /**
   * How much of the media of an interstitial is played from its start, as
   * limited when its media is loaded.
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @return {number}
   * @private
   */
  static getPlayableDuration_(interstitial) {
    let limit = Infinity;
    if (interstitial.clip !== false &&
        interstitial.startTime && interstitial.endTime &&
        interstitial.endTime != Infinity &&
        interstitial.endTime > interstitial.startTime) {
      limit = interstitial.endTime - interstitial.startTime;
    }
    if (interstitial.playoutLimit) {
      limit = Math.min(limit, interstitial.playoutLimit);
    }
    return limit;
  }

  /**
   * The ads an interstitial is presented as, given the ads signaled in its
   * presentation. An ad that covers the whole presentation describes the
   * interstitial itself. Otherwise each of them, and each part of the
   * presentation outside them, is presented as an ad of its own, identified
   * like the assets of an HLS asset list: grouped under the interstitial,
   * with an id of its own.  The ads are clipped to the part of the
   * presentation that is played: the range of the interstitial on the
   * primary timeline, when clipped, and its playout limit.
   *
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {!Array<!shaka.ads.InterstitialAdManager.PresentedAd>} signaled
   *   The signaled ads, with their ranges in the presentation.
   * @param {number} duration The duration of the presentation, or Infinity
   *   if it is not known.
   * @return {!Array<!shaka.ads.InterstitialAdManager.PresentedAd>}
   * @private
   */
  static present_(interstitial, signaled, duration) {
    const tolerance = shaka.ads.InterstitialAdManager.RANGE_TOLERANCE_;
    const copy = () => /** @type {!shaka.extern.AdInterstitial} */ (
      Object.assign({}, interstitial));
    const playable = Math.min(duration,
        shaka.ads.InterstitialAdManager.getPlayableDuration_(interstitial));
    const sorted = signaled.filter((item) =>
      item.end != null && item.end > item.start &&
        item.start < playable - tolerance)
        .sort((a, b) => a.start - b.start);
    for (const item of sorted) {
      item.end = Math.min(/** @type {number} */ (item.end), playable);
    }
    /** @type {!Array<!shaka.ads.InterstitialAdManager.PresentedAd>} */
    const ranges = [];
    let position = 0;
    for (const item of sorted) {
      if (item.start < position - tolerance) {
        shaka.log.warning('Ignoring overlapping ad in interstitial', item);
        continue;
      }
      if (item.start - position > tolerance) {
        ranges.push({interstitial: copy(),
          start: position, end: item.start});
        position = item.start;
      }
      ranges.push({interstitial: item.interstitial, start: position,
        end: item.end});
      position = /** @type {number} */ (item.end);
    }
    if (!ranges.length) {
      return [{interstitial, start: 0, end: null}];
    }
    // The last ad runs to the end of the media, unless it is clipped.
    const end = playable < duration ? playable : null;
    if (Number.isFinite(playable) && playable - position > tolerance) {
      ranges.push({interstitial: copy(), start: position, end});
    } else {
      ranges[ranges.length - 1].end = end;
    }
    if (ranges.length > 1) {
      const groupId = interstitial.groupId || interstitial.id;
      for (let i = 0; i < ranges.length; i++) {
        const ad = ranges[i].interstitial;
        ad.podSize = ranges.length;
        ad.podPosition = i + 1;
        if (interstitial.id != null) {
          ad.id = interstitial.id + '_shaka_asset_' + i;
          ad.groupId = groupId;
        }
      }
    }
    return ranges;
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @return {boolean}
   * @private
   */
  isPreloadAllowed_(interstitial) {
    return !shaka.ads.Utils.isStatic(interstitial);
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
    } else if (this.lastTime_ == null) {
      // Before playback starts, an interstitial that is active where it is
      // going to start is played first, like a pre-roll (e.g. a DASH
      // alternative MPD event that covers the join point of a live stream).
      // It is loaded now, so that it is ready when playback starts.
      const position = this.getPosition_();
      if (interstitial.post || position == null) {
        return false;
      }
      const difference = position - interstitial.startTime;
      return difference >= 0 && difference <= this.maxJoinDelay_(interstitial);
    } else {
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
 * @private
 */
shaka.ads.InterstitialAdManager.Playout_;


/**
 * @typedef {{
 *   interstitial: !shaka.extern.AdInterstitial,
 *   start: number,
 *   end: ?number,
 * }}
 *
 * @description
 * An ad that an interstitial is presented as, with its range in the
 * presentation of the interstitial.
 *
 * @property {!shaka.extern.AdInterstitial} interstitial
 *   The ad. It is the interstitial, or a copy of it that describes a part of
 *   its presentation.
 * @property {number} start
 *   The start of the ad in the presentation, in seconds.
 * @property {?number} end
 *   The end of the ad in the presentation, in seconds, or null if the ad runs
 *   to the end of the presentation.
 */
shaka.ads.InterstitialAdManager.PresentedAd;


/**
 * @typedef {{
 *   accepts: function(!shaka.extern.AdInterstitial):boolean,
 *   parse: function(!shaka.extern.AdInterstitial,
 *       !Array<shaka.extern.TimelineRegionInfo>, ?shaka.extern.Manifest):
 *       !Array<!shaka.ads.InterstitialAdManager.PresentedAd>,
 * }}
 *
 * @description
 * Reads the signaling of the ads carried in the presentation of an
 * interstitial, such as SVTA2053 in a DASH list MPD or in an HLS asset
 * playlist, or the Periods of a DASH list MPD.
 *
 * @property {function(!shaka.extern.AdInterstitial):boolean} accepts
 *   Whether the ads of the interstitial may be signaled in its presentation.
 * @property {function(!shaka.extern.AdInterstitial,
 *     !Array<shaka.extern.TimelineRegionInfo>, ?shaka.extern.Manifest):
 *     !Array<!shaka.ads.InterstitialAdManager.PresentedAd>} parse
 *   Returns the ads signaled by the timeline regions and the manifest of the
 *   presentation, each one a copy of the interstitial that describes it.
 * @private
 */
shaka.ads.InterstitialAdManager.PresentationSignaling_;


/**
 * Margin, in seconds, within which a part of a presentation is too short to
 * be an ad of its own.
 *
 * @const {number}
 * @private
 */
shaka.ads.InterstitialAdManager.RANGE_TOLERANCE_ = 0.5;


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
   * @param {?string=} uri The URI to request, when not the one of the
   *   interstitial.
   * @param {?function(!shaka.media.PreloadManager):
   *     !Array<!shaka.ads.InterstitialAdManager.PresentedAd>=} readSignaling
   *   Reads the ads signaled in the presentation, once its manifest is parsed.
   */
  constructor(player, interstitial, sendEvent = null, uri = null,
      readSignaling = null) {
    /** @private {!shaka.Player} */
    this.player_ = player;

    /**
     * The ads signaled in the presentation, or null if they could not be
     * read.
     * @private {!Promise.PromiseWithResolvers<
     *     ?Array<!shaka.ads.InterstitialAdManager.PresentedAd>>}
     */
    this.presentedAds_ = Promise.withResolvers();

    /** @private {?shaka.media.PreloadManager} */
    this.preloadManager_ = null;

    /** @private {?shaka.util.Error} */
    this.initialError_ = null;

    /** @private {boolean} */
    this.released_ = false;

    /** @private {?function(string, Map<string, Object>=)} */
    this.sendEvent_ = sendEvent;

    this.start_(interstitial, uri || interstitial.uri || '', readSignaling);
  }

  /**
   * @param {!shaka.extern.AdInterstitial} interstitial
   * @param {string} uri
   * @param {?function(!shaka.media.PreloadManager):
   *     !Array<!shaka.ads.InterstitialAdManager.PresentedAd>} readSignaling
   * @private
   */
  async start_(interstitial, uri, readSignaling) {
    /** @type {?Array<!shaka.ads.InterstitialAdManager.PresentedAd>} */
    let presented = null;
    try {
      if (this.sendEvent_) {
        this.sendEvent_(shaka.ads.Utils.AD_INTERSTITIAL_PRELOAD,
            (new Map()).set('interstitial', interstitial));
      }

      const preloadManager = await this.player_.preload(
          uri,
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
      if (preloadManager && readSignaling) {
        try {
          // The segment indexes, which tell the Periods of a DASH
          // presentation, are only created by the end of the preload.  The
          // load of a preload waits for it anyway.
          await preloadManager.waitForFinish();
          if (this.released_) {
            return;
          }
          presented = readSignaling(preloadManager);
        } catch (e) {
          // A failed preload is reported when the interstitial is loaded.
          shaka.log.debug('Unable to read the interstitial presentation', e);
        }
      }
      if (preloadManager && this.sendEvent_) {
        // Like the assets of an HLS asset list, each ad of the presentation
        // is reported, described by its own signaling.
        const ads = presented ? presented.map((item) => item.interstitial) :
            [interstitial];
        for (const ad of ads) {
          this.sendEvent_(shaka.ads.Utils.AD_INTERSTITIAL_PRELOADED,
              (new Map()).set('interstitial', ad));
        }
      }
    } catch (e) {
      // Store only the initial error
      this.initialError_ =
          e instanceof shaka.util.Error ? e : null;
    } finally {
      this.presentedAds_.resolve(presented);
    }
  }

  /**
   * Resolves with the ads signaled in the presentation once it has been
   * parsed, or with null if they could not be read.
   *
   * @return {!Promise<?Array<!shaka.ads.InterstitialAdManager.PresentedAd>>}
   */
  getPresentedAds() {
    return this.presentedAds_.promise;
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
    this.presentedAds_.resolve(null);

    if (this.preloadManager_) {
      this.preloadManager_.destroy();
      this.preloadManager_ = null;
    }
  }
};


/**
 * @typedef {{
 *   concurrentVideo: number,
 *   concurrentImage: boolean,
 * }}
 *
 * @property {number} concurrentVideo
 *   The number of videos that can be decoded and composed at the same time,
 *   the primary content included.
 * @property {boolean} concurrentImage
 *   Whether an image or an HTML document can be composed over the video.
 * @private
 */
shaka.ads.InterstitialAdManager.Capabilities_;


/**
 * @typedef {{
 *   prepare: function(shaka.extern.AdInterstitial):!Promise,
 *   start: function(function():!Promise),
 *   stop: function(shaka.extern.AdInterstitial, boolean, boolean):!Promise,
 *   onAdEvent: ?function(),
 *   onTimeUpdate: ?function(),
 * }}
 *
 * @property {function(shaka.extern.AdInterstitial):!Promise} prepare
 *   Called with the ad being presented before the media is loaded, to make
 *   room for it.
 * @property {function(function():!Promise)} start
 *   Called once the media is loaded, to start playing it. It is given the
 *   function that skips the media.
 * @property {function(shaka.extern.AdInterstitial, boolean,
 *     boolean):!Promise} stop
 *   Called with the ad being presented, whether it was skipped and whether it
 *   failed to load with a bad HTTP status, once the media has ended.
 * @property {?function()} onAdEvent
 *   Called before each event tracked for the ad being presented.
 * @property {?function()} onTimeUpdate
 *   Called as the media plays.
 * @private
 */
shaka.ads.InterstitialAdManager.MediaAdHooks_;
