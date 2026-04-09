/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.abr.SimpleAbrManager');

goog.require('goog.asserts');
goog.require('shaka.abr.EwmaBandwidthEstimator');
goog.require('shaka.log');
goog.require('shaka.util.ArrayUtils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.StreamUtils');
goog.require('shaka.util.Timer');

goog.requireType('shaka.util.CmsdManager');


/**
 * @summary
 * <p>
 * This defines the default ABR manager for the Player.  An instance of this
 * class is used when no ABR manager is given.
 * </p>
 * <p>
 * The behavior of this class is to take throughput samples using
 * segmentDownloaded to estimate the current network bandwidth.  Then it will
 * use that to choose the streams that best fit the current bandwidth.  It will
 * always pick the highest bandwidth variant it thinks can be played.
 * </p>
 * <p>
 * After initial choices are made, this class will call switchCallback() when
 * there is a better choice.  switchCallback() will not be called more than once
 * per ({@link shaka.abr.SimpleAbrManager.SWITCH_INTERVAL_MS}).
 * </p>
 *
 * @implements {shaka.extern.AbrManager}
 * @implements {shaka.util.IReleasable}
 * @export
 */
shaka.abr.SimpleAbrManager = class {
  constructor() {
    /** @private {?shaka.extern.AbrManager.SwitchCallback} */
    this.switch_ = null;

    /** @private {?shaka.extern.AbrManager.DisableStreamCallback} */
    this.disableStreamCallback_ = null;

    /** @private {boolean} */
    this.enabled_ = false;

    /** @private {shaka.abr.EwmaBandwidthEstimator} */
    this.bandwidthEstimator_ = new shaka.abr.EwmaBandwidthEstimator();

    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    // Some browsers implement the Network Information API, which allows
    // retrieving information about a user's network connection. We listen
    // to the change event to be able to make quick changes in case the type
    // of connectivity changes.
    if (navigator.connection && navigator.connection.addEventListener) {
      this.eventManager_.listen(
          /** @type {EventTarget} */(navigator.connection),
          'change',
          () => {
            if (this.config_.useNetworkInformation && navigator.onLine) {
              this.bandwidthEstimator_ = new shaka.abr.EwmaBandwidthEstimator();
              if (this.config_) {
                this.bandwidthEstimator_.configure(this.config_.advanced);
              }
              this.trySuggestStreams();
            }
          });
    }

    /**
     * A filtered list of Variants to choose from.
     * @private {!Array<!shaka.extern.Variant>}
     */
    this.variants_ = [];

    /** @private {number} */
    this.playbackRate_ = 1;

    /** @private {boolean} */
    this.startupComplete_ = false;

    /**
     * The last wall-clock time, in milliseconds, when streams were chosen.
     *
     * @private {?number}
     */
    this.lastTimeChosenMs_ = null;

    /** @private {?shaka.extern.AbrConfiguration} */
    this.config_ = null;

    /** @private {HTMLMediaElement} */
    this.mediaElement_ = null;

    /** @private {ResizeObserver} */
    this.resizeObserver_ = null;

    /** @private {shaka.util.Timer} */
    this.resizeObserverTimer_ = new shaka.util.Timer(() => {
      if (this.enabled_ && (this.config_.restrictToElementSize ||
          this.config_.restrictToScreenSize)) {
        const chosenVariant = this.chooseVariant();
        if (chosenVariant && this.switch_) {
          this.switch_(chosenVariant, this.config_.clearBufferSwitch,
              this.config_.safeMarginSwitch);
        }
      }
    });

    /** @private {Window} */
    this.windowToCheck_ = window;

    if ('documentPictureInPicture' in window) {
      this.eventManager_.listen(
          window.documentPictureInPicture, 'enter', () => {
            this.windowToCheck_ = window.documentPictureInPicture.window;
            if (this.resizeObserverTimer_) {
              this.resizeObserverTimer_.tickNow();
            }
            this.eventManager_.listenOnce(
                this.windowToCheck_, 'pagehide', () => {
                  this.windowToCheck_ = window;
                  if (this.resizeObserverTimer_) {
                    this.resizeObserverTimer_.tickNow();
                  }
                });
          });
    }

    /** @private {PictureInPictureWindow} */
    this.pictureInPictureWindow_ = null;

    /** @private {?shaka.util.CmsdManager} */
    this.cmsdManager_ = null;

    /** @private {shaka.util.Timer} */
    this.droppedFramePoller_ = null;

    /** @private {number} */
    this.lastDroppedFrames_ = 0;

    /** @private {number} */
    this.lastTotalFrames_ = 0;
  }


  /**
   * @override
   * @export
   */
  stop() {
    this.switch_ = null;
    this.enabled_ = false;
    this.variants_ = [];
    this.playbackRate_ = 1;
    this.lastTimeChosenMs_ = null;
    this.mediaElement_ = null;

    this.resizeObserver_?.disconnect();
    this.resizeObserver_ = null;

    this.resizeObserverTimer_?.stop();

    this.pictureInPictureWindow_ = null;

    this.cmsdManager_ = null;

    this.stopDroppedFramePoller_();

    // Don't reset |startupComplete_|: if we've left the startup interval, we
    // can start using bandwidth estimates right away after init() is called.
  }

  /**
   * @override
   * @export
   */
  release() {
    this.stop();
    this.eventManager_.release();
    this.resizeObserverTimer_ = null;
  }


  /**
   * @override
   * @export
   */
  init(switchCallback, disableStreamCallback) {
    this.switch_ = switchCallback;
    this.disableStreamCallback_ = disableStreamCallback;
  }


  /**
   * @param {boolean=} preferFastSwitching
   * @return {shaka.extern.Variant}
   * @override
   * @export
   */
  chooseVariant(preferFastSwitching = false) {
    let maxHeight = Infinity;
    let maxWidth = Infinity;

    if (this.config_.restrictToScreenSize) {
      const devicePixelRatio = this.config_.ignoreDevicePixelRatio ?
          1 : this.windowToCheck_.devicePixelRatio;
      maxHeight = this.windowToCheck_.screen.height * devicePixelRatio;
      maxWidth = this.windowToCheck_.screen.width * devicePixelRatio;
    }

    if (this.resizeObserver_ && this.config_.restrictToElementSize) {
      const devicePixelRatio = this.config_.ignoreDevicePixelRatio ?
          1 : this.windowToCheck_.devicePixelRatio;
      let height = this.mediaElement_.clientHeight;
      let width = this.mediaElement_.clientWidth;
      if (this.pictureInPictureWindow_ && document.pictureInPictureElement &&
          document.pictureInPictureElement == this.mediaElement_) {
        height = this.pictureInPictureWindow_.height;
        width = this.pictureInPictureWindow_.width;
      }
      maxHeight = Math.min(maxHeight, height * devicePixelRatio);
      maxWidth = Math.min(maxWidth, width * devicePixelRatio);
    }

    let normalVariants = this.variants_.filter((variant) => {
      return variant && !shaka.util.StreamUtils.isFastSwitching(variant);
    });
    if (!normalVariants.length) {
      normalVariants = this.variants_;
    }

    let variants = normalVariants;
    if (preferFastSwitching &&
        normalVariants.length != this.variants_.length) {
      variants = this.variants_.filter((variant) => {
        return variant && shaka.util.StreamUtils.isFastSwitching(variant);
      });
    }

    // Get sorted Variants.
    let sortedVariants = this.filterAndSortVariants_(
        this.config_.restrictions, variants,
        /* maxHeight= */ Infinity, /* maxWidth= */ Infinity);

    if (maxHeight != Infinity || maxWidth != Infinity) {
      const resolutions = this.getResolutionList_(sortedVariants);
      for (const resolution of resolutions) {
        if (resolution.height >= maxHeight && resolution.width >= maxWidth) {
          maxHeight = resolution.height;
          maxWidth = resolution.width;
          break;
        }
      }

      sortedVariants = this.filterAndSortVariants_(
          this.config_.restrictions, variants, maxHeight, maxWidth);
    }

    const currentBandwidth = this.getBandwidthEstimate();

    if (variants.length && !sortedVariants.length) {
      // If we couldn't meet the ABR restrictions, we should still play
      // something.
      // These restrictions are not "hard" restrictions in the way that
      // top-level or DRM-based restrictions are.  Sort the variants without
      // restrictions and keep just the first (lowest-bandwidth) one.
      shaka.log.warning('No variants met the ABR restrictions. ' +
                        'Choosing a variant by lowest bandwidth.');
      sortedVariants = this.filterAndSortVariants_(
          /* restrictions= */ null, variants,
          /* maxHeight= */ Infinity, /* maxWidth= */ Infinity);
      sortedVariants = [sortedVariants[0]];
    }

    // Start by assuming that we will use the first Stream.
    let chosen = sortedVariants[0] || null;

    for (let i = 0; i < sortedVariants.length; i++) {
      const item = sortedVariants[i];
      const playbackRate =
          !isNaN(this.playbackRate_) ? Math.abs(this.playbackRate_) : 1;
      const itemBandwidth = playbackRate * item.bandwidth;
      const minBandwidth =
          itemBandwidth / this.config_.bandwidthDowngradeTarget;
      let next = {bandwidth: Infinity};
      for (let j = i + 1; j < sortedVariants.length; j++) {
        if (item.bandwidth != sortedVariants[j].bandwidth) {
          next = sortedVariants[j];
          break;
        }
      }
      const nextBandwidth = playbackRate * next.bandwidth;
      const maxBandwidth = nextBandwidth / this.config_.bandwidthUpgradeTarget;
      shaka.log.v2('Bandwidth ranges:',
          (itemBandwidth / 1e6).toFixed(3),
          (minBandwidth / 1e6).toFixed(3),
          (maxBandwidth / 1e6).toFixed(3));

      if (chosen && item && currentBandwidth >= minBandwidth &&
          currentBandwidth <= maxBandwidth &&
          (chosen.bandwidth != item.bandwidth ||
          this.isSameBandwidthAndHigherResolution_(chosen, item))) {
        chosen = item;
      }
    }

    this.lastTimeChosenMs_ = Date.now();
    return chosen;
  }


  /**
   * @override
   * @export
   */
  enable() {
    this.enabled_ = true;
    this.updateFramesInfo_();
    if (this.variants_.length) {
      this.trySuggestStreams();
    }
  }


  /**
   * @override
   * @export
   */
  disable() {
    this.enabled_ = false;
  }


  /**
   * @param {number} deltaTimeMs The duration, in milliseconds, that the request
   *     took to complete.
   * @param {number} numBytes The total number of bytes transferred.
   * @param {boolean} allowSwitch Indicate if the segment is allowed to switch
   *     to another stream.
   * @param {shaka.extern.Request=} request
   *     A reference to the request
   * @param {shaka.extern.RequestContext=} context
   *     A reference to the request context
   * @override
   * @export
   */
  segmentDownloaded(deltaTimeMs, numBytes, allowSwitch, request, context) {
    // The time indicates that it could be a cache response, so we should
    // ignore this value.
    if (deltaTimeMs >= this.config_.cacheLoadThreshold) {
      shaka.log.v2('Segment downloaded:',
          'contentType=' + (request && request.contentType),
          'deltaTimeMs=' + deltaTimeMs,
          'numBytes=' + numBytes,
          'lastTimeChosenMs=' + this.lastTimeChosenMs_,
          'enabled=' + this.enabled_);
      goog.asserts.assert(deltaTimeMs >= 0, 'expected a non-negative duration');
      this.bandwidthEstimator_.sample(deltaTimeMs, numBytes);
    }

    if (allowSwitch && (this.lastTimeChosenMs_ != null) && this.enabled_) {
      this.suggestStreams_();
    }
  }


  /**
   * @override
   * @export
   */
  trySuggestStreams() {
    if (this.enabled_) {
      this.lastTimeChosenMs_ = Date.now();
      this.suggestStreams_(/* force= */ true);
    }
  }


  /**
   * @override
   * @export
   */
  getBandwidthEstimate() {
    const defaultBandwidthEstimate = this.getDefaultBandwidth_();
    if (navigator.connection && navigator.connection.downlink &&
        this.config_.useNetworkInformation &&
        this.config_.preferNetworkInformationBandwidth) {
      return defaultBandwidthEstimate;
    }
    const bandwidthEstimate = this.bandwidthEstimator_.getBandwidthEstimate(
        defaultBandwidthEstimate);
    if (this.cmsdManager_) {
      return this.cmsdManager_.getBandwidthEstimate(bandwidthEstimate);
    }
    return bandwidthEstimate;
  }


  /**
   * @override
   * @export
   */
  setVariants(variants, isLowLatency) {
    if (shaka.util.ArrayUtils.hasSameElements(variants, this.variants_)) {
      return false;
    }
    this.variants_ = variants;
    return true;
  }


  /**
   * @override
   * @export
   */
  playbackRateChanged(rate) {
    this.playbackRate_ = rate;
  }


  /**
   * @override
   * @export
   */
  setMediaElement(mediaElement) {
    this.mediaElement_ = mediaElement;
    if (this.resizeObserver_) {
      this.resizeObserver_.disconnect();
      this.resizeObserver_ = null;
    }
    const onResize = () => {
      const SimpleAbrManager = shaka.abr.SimpleAbrManager;
      // Batch up resize changes before checking them.
      this.resizeObserverTimer_.tickAfter(
          /* seconds= */ SimpleAbrManager.RESIZE_OBSERVER_BATCH_TIME);
    };
    if (this.mediaElement_ && 'ResizeObserver' in window) {
      this.resizeObserver_ = new ResizeObserver(onResize);
      this.resizeObserver_.observe(this.mediaElement_);
    }

    this.eventManager_.listen(mediaElement, 'enterpictureinpicture', (e) => {
      const event = /** @type {PictureInPictureEvent} */(e);
      if (event.pictureInPictureWindow) {
        this.pictureInPictureWindow_ = event.pictureInPictureWindow;
        this.eventManager_.listen(
            this.pictureInPictureWindow_, 'resize', onResize);
      }
    });
    this.eventManager_.listen(mediaElement, 'leavepictureinpicture', () => {
      if (this.pictureInPictureWindow_) {
        this.eventManager_.unlisten(
            this.pictureInPictureWindow_, 'resize', onResize);
      }
      this.pictureInPictureWindow_ = null;
    });
    this.startDroppedFramePoller_();
  }


  /**
   * @override
   * @export
   */
  setCmsdManager(cmsdManager) {
    this.cmsdManager_ = cmsdManager;
  }


  /**
   * @override
   * @export
   */
  configure(config) {
    this.config_ = config;
    if (this.bandwidthEstimator_ && this.config_) {
      this.bandwidthEstimator_.configure(this.config_.advanced);
    }
    this.startDroppedFramePoller_();
  }


  /**
   * Calls switch_() with the variant chosen by chooseVariant().
   *
   * @param {boolean=} force
   * @private
   */
  suggestStreams_(force = false) {
    shaka.log.v2('Suggesting Streams...');
    goog.asserts.assert(this.lastTimeChosenMs_ != null,
        'lastTimeChosenMs_ should not be null');

    if (!force) {
      if (!this.startupComplete_) {
        // Check if we've got enough data yet.
        if (!this.bandwidthEstimator_.hasGoodEstimate()) {
          shaka.log.v2('Still waiting for a good estimate...');
          return;
        }
        this.startupComplete_ = true;

        this.lastTimeChosenMs_ -=
            (this.config_.switchInterval - this.config_.minTimeToSwitch) * 1000;
      }

      // Check if we've left the switch interval.
      const now = Date.now();
      const delta = now - this.lastTimeChosenMs_;
      if (delta < this.config_.switchInterval * 1000) {
        shaka.log.v2('Still within switch interval...');
        return;
      }
    }

    const chosenVariant = this.chooseVariant();
    const bandwidthEstimate = this.getBandwidthEstimate();
    const currentBandwidthKbps = Math.round(bandwidthEstimate / 1000.0);

    if (chosenVariant && this.switch_) {
      shaka.log.debug(
          'Calling switch_(), bandwidth=' + currentBandwidthKbps + ' kbps');
      // If any of these chosen streams are already chosen, Player will filter
      // them out before passing the choices on to StreamingEngine.
      this.switch_(chosenVariant, this.config_.clearBufferSwitch,
          this.config_.safeMarginSwitch);
      this.updateFramesInfo_();
    }
  }


  /**
   * @private
   */
  getDefaultBandwidth_() {
    let defaultBandwidthEstimate = this.config_.defaultBandwidthEstimate;

    // Some browsers implement the Network Information API, which allows
    // retrieving information about a user's network connection.  Tizen 3 has
    // NetworkInformation, but not the downlink attribute.
    if (navigator.connection && navigator.connection.downlink &&
        this.config_.useNetworkInformation) {
      // If it's available, get the bandwidth estimate from the browser (in
      // megabits per second) and use it as defaultBandwidthEstimate.
      defaultBandwidthEstimate = navigator.connection.downlink * 1e6;
    }
    return defaultBandwidthEstimate;
  }


  /**
   * @param {?shaka.extern.Restrictions} restrictions
   * @param {!Array<shaka.extern.Variant>} variants
   * @param {!number} maxHeight
   * @param {!number} maxWidth
   * @return {!Array<shaka.extern.Variant>} variants filtered according to
   *   |restrictions| and sorted in ascending order of bandwidth.
   * @private
   */
  filterAndSortVariants_(restrictions, variants, maxHeight, maxWidth) {
    if (this.cmsdManager_) {
      const maxBitrate = this.cmsdManager_.getMaxBitrate();
      if (maxBitrate) {
        variants = variants.filter((variant) => {
          if (!variant.bandwidth || !maxBitrate) {
            return true;
          }
          return variant.bandwidth <= maxBitrate;
        });
      }
    }

    if (restrictions) {
      variants = variants.filter((variant) => {
        // This was already checked in another scope, but the compiler doesn't
        // seem to understand that.
        goog.asserts.assert(restrictions, 'Restrictions should exist!');

        return shaka.util.StreamUtils.meetsRestrictions(
            variant, restrictions,
            /* maxHwRes= */ {width: maxWidth, height: maxHeight});
      });
    }

    return variants.sort((v1, v2) => {
      return v1.bandwidth - v2.bandwidth;
    });
  }

  /**
   * @param {!Array<shaka.extern.Variant>} variants
   * @return {!Array<{height: number, width: number}>}
   * @private
   */
  getResolutionList_(variants) {
    const resolutions = [];
    for (const variant of variants) {
      if (!variant) {
        continue;
      }
      const video = variant.video;
      if (!video || !video.height || !video.width) {
        continue;
      }
      resolutions.push({
        height: video.height,
        width: video.width,
      });
    }

    return resolutions.sort((v1, v2) => {
      return v1.width - v2.width;
    });
  }

  /**
   * @param {shaka.extern.Variant} chosenVariant
   * @param {shaka.extern.Variant} newVariant
   * @return {boolean}
   * @private
   */
  isSameBandwidthAndHigherResolution_(chosenVariant, newVariant) {
    if (chosenVariant.bandwidth != newVariant.bandwidth) {
      return false;
    }
    if (!chosenVariant.video || !newVariant.video) {
      return false;
    }
    return chosenVariant.video.width < newVariant.video.width ||
        chosenVariant.video.height < newVariant.video.height;
  }

  /**
   * Starts the dropped frame poller if the feature is enabled.
   *
   * @private
   */
  startDroppedFramePoller_() {
    this.stopDroppedFramePoller_();

    const element = /** @type {!HTMLVideoElement} */ (this.mediaElement_);
    if (!this.config_.droppedFrames || !element?.getVideoPlaybackQuality) {
      return;
    }

    this.updateFramesInfo_();
    this.startListeningToResize_();

    this.droppedFramePoller_ = new shaka.util.Timer(() => {
      this.checkDroppedFrames_();
    }).tickEvery(this.config_.advanced.droppedFramesInterval);
  }

  /**
   * Stops the dropped frame poller.
   *
   * @private
   */
  stopDroppedFramePoller_() {
    this.stopListeningToResize_();
    this.droppedFramePoller_?.stop();
    this.droppedFramePoller_ = null;
  }

  /**
   * Checks the dropped frame rate since the last interval. If it exceeds the
   * configured threshold, the current video stream is temporarily disabled.
   *
   * @private
   */
  checkDroppedFrames_() {
    // Skip checks paused state or ABR disabled or droppedFrames disabled.
    if (this.mediaElement_.paused || !this.enabled_ ||
        !this.config_.droppedFrames) {
      return;
    }

    const element = /** @type {!HTMLVideoElement} */ (this.mediaElement_);
    const info = element.getVideoPlaybackQuality();
    const currentDropped = info.droppedVideoFrames;
    const currentTotal = info.totalVideoFrames;

    // Skip ban logic when playback rate is greater than 1x
    // because frame drops are expected or when the total frames are 0.
    if (this.mediaElement_.playbackRate > 1 || !currentTotal) {
      this.lastDroppedFrames_ = currentDropped;
      this.lastTotalFrames_ = currentTotal;
      return;
    }

    const deltaDropped = currentDropped - this.lastDroppedFrames_;
    const deltaTotal = currentTotal - this.lastTotalFrames_;

    this.lastDroppedFrames_ = currentDropped;
    this.lastTotalFrames_ = currentTotal;

    const dropRatio = deltaDropped / deltaTotal;
    const droppedFramesThreshold = this.config_.advanced.droppedFramesThreshold;
    if (dropRatio >= droppedFramesThreshold && this.disableStreamCallback_) {
      shaka.log.warning(
          'Dropped frame ratio exceeded threshold: ' + dropRatio.toFixed(2) +
          ' >= ' + droppedFramesThreshold +
          '. Disabling current video stream.');

      this.disableStreamCallback_(
          'video', this.config_.advanced.droppedFramesBanDuration);
    }
  }

  /**
   * @private
   */
  updateFramesInfo_() {
    const element = /** @type {!HTMLVideoElement} */ (this.mediaElement_);
    if (this.config_.droppedFrames && element?.getVideoPlaybackQuality) {
      const info = element.getVideoPlaybackQuality();
      this.lastDroppedFrames_ = info.droppedVideoFrames;
      this.lastTotalFrames_ = info.totalVideoFrames;
    }
  }

  /**
   * @private
   */
  startListeningToResize_() {
    const video = /** @type {!HTMLVideoElement} */ (this.mediaElement_);

    this.eventManager_.listen(video, 'resize', () => {
      shaka.log.debug('video resolution changed to ' +
          video.videoWidth + 'x' + video.videoHeight +
          '. Resetting frame counters.');
      this.updateFramesInfo_();
    });

    shaka.log.v1('listening to resize started.');
  }

  /**
   * @private
   */
  stopListeningToResize_() {
    this.eventManager_.unlisten(this.mediaElement_, 'resize');
    shaka.log.v1('listening to resize stopped.');
  }
};


/**
 * The amount of time, in seconds, we wait to batch up rapid resize changes.
 * This allows us to avoid multiple resize events in most cases.
 * @type {number}
 */
shaka.abr.SimpleAbrManager.RESIZE_OBSERVER_BATCH_TIME = 1;
