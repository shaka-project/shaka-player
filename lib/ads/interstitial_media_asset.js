/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialMediaAsset');

goog.require('goog.asserts');
goog.require('shaka.Player');
goog.require('shaka.ads.LayoutRenderer');
goog.require('shaka.util.Error');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');


/**
 * A media asset of an interstitial: the player that plays it and the media
 * element it is played in, which is either an element of its own in the ad
 * container or the primary video.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.InterstitialMediaAsset = class {
  /**
   * @param {!shaka.Player} basePlayer The player of the primary content.
   * @param {HTMLElement} container The element the asset is drawn in.
   * @param {function(!shaka.Player,
   *     ?shaka.extern.AdInterstitial)} configurePlayer
   *   Configures the player of an interstitial.
   */
  constructor(basePlayer, container, configurePlayer) {
    /** @private {!shaka.Player} */
    this.basePlayer_ = basePlayer;

    /** @private {!HTMLMediaElement} */
    this.baseVideo_ = /** @type {!HTMLMediaElement} */ (
      basePlayer.getMediaElement());

    /** @private {HTMLElement} */
    this.container_ = container;

    /** @private {function(!shaka.Player, ?shaka.extern.AdInterstitial)} */
    this.configurePlayer_ = configurePlayer;

    /** @private {?shaka.Player} */
    this.player_ = null;

    /**
     * The media element of the asset, or null when it is played in the
     * primary video.
     * @private {?HTMLMediaElement}
     */
    this.element_ = null;

    /**
     * Listens to the media element and the player of the asset.
     * @private {!shaka.util.EventManager}
     */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {boolean} */
    this.released_ = false;
  }

  /**
   * The player of the asset, created the first time it is needed.
   *
   * @return {!shaka.Player}
   */
  getPlayer() {
    if (this.released_) {
      // An interstitial may still be loading when the asset is released, e.g.
      // because the primary content is unloaded. A new player would be
      // configured from the destroyed player of the primary content.
      throw new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.PLAYER,
          shaka.util.Error.Code.OPERATION_ABORTED);
    }
    if (!this.player_) {
      this.player_ = new shaka.Player();
      this.configure();
    }
    return this.player_;
  }

  /**
   * Configures the player like the player of the primary content, and then
   * for the interstitial.
   *
   * @param {?shaka.extern.AdInterstitial=} interstitial
   */
  configure(interstitial = null) {
    const player = this.getPlayer();
    player.configure(this.basePlayer_.getNonDefaultConfiguration());
    this.configurePlayer_(player, interstitial);
    player.configure('playRangeEnd', Infinity);
    const netEngine = player.getNetworkingEngine();
    goog.asserts.assert(netEngine, 'Need networking engine');
    this.basePlayer_.getNetworkingEngine().copyFiltersInto(netEngine);
  }

  /**
   * @return {!shaka.util.EventManager}
   */
  getEventManager() {
    return this.eventManager_;
  }

  /**
   * The media element the asset is played in.
   *
   * @return {!HTMLMediaElement}
   */
  getMediaElement() {
    return this.element_ || this.baseVideo_;
  }

  /**
   * The media element of the asset, if it is not played in the primary video.
   *
   * @return {?HTMLMediaElement}
   */
  getOwnElement() {
    return this.element_;
  }

  /**
   * Chooses whether the asset is played in a media element of its own, or in
   * the primary video.
   *
   * @param {boolean} ownElement
   * @param {boolean=} recreate If true, replaces the media element of the
   *   asset with a new one.
   */
  useOwnElement(ownElement, recreate = false) {
    const element = this.element_;
    if (element && (!ownElement || recreate)) {
      if (element.parentElement) {
        element.parentElement.removeChild(element);
      }
      this.element_ = null;
    }
    if (ownElement && !this.element_) {
      this.element_ = this.createElement_();
    }
  }

  /**
   * Adds the media element of the asset to the container, if it is not
   * there yet.
   */
  mount() {
    const element = this.element_;
    if (element && this.container_ && !element.parentElement) {
      this.container_.appendChild(element);
    }
  }

  /**
   * Shows the media element of the asset where the layout places it.
   *
   * @param {!shaka.ads.LayoutRenderer.Asset} asset
   */
  show(asset) {
    const element = this.element_;
    if (element) {
      element.style.display = '';
      shaka.ads.LayoutRenderer.placeAsset(
          /** @type {!HTMLElement} */ (element), asset);
    }
  }

  /**
   * Hides the media element of the asset.
   */
  hide() {
    if (this.element_) {
      this.element_.style.display = 'none';
    }
  }

  /**
   * Attaches the player to the media element of the asset.
   *
   * @return {!Promise}
   */
  async attach() {
    const player = this.getPlayer();
    const element = this.getMediaElement();
    if (player.getMediaElement() !== element) {
      await player.attach(element);
    }
  }

  /**
   * Stops playing the asset: the player leaves the primary video, which the
   * primary content plays in again, and unloads a media element of its own,
   * which is kept for the next asset.
   *
   * @return {!Promise}
   */
  async stop() {
    const player = this.player_;
    if (!player) {
      return;
    }
    if (this.element_) {
      await player.unload();
    } else {
      await player.detach();
    }
  }

  /**
   * Stops the asset and forgets its media element, which the owner of the
   * container removes.
   */
  reset() {
    this.eventManager_.removeAll();
    this.player_?.detach();
    this.element_ = null;
  }

  /**
   * Destroys the preloads made with the player of the asset.
   */
  destroyAllPreloads() {
    this.player_?.destroyAllPreloads();
  }

  /** @override */
  release() {
    this.released_ = true;
    this.eventManager_.release();
    this.player_?.destroy();
    this.player_ = null;
    this.useOwnElement(false);
  }

  /**
   * @return {!HTMLMediaElement}
   * @private
   */
  createElement_() {
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
};
