/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialStaticPresentation');

goog.require('shaka.ads.LayoutRenderer');
goog.require('shaka.ads.Utils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * Presents the image or HTML document of a non-linear interstitial over the
 * primary content, and ends it when its window or its playout limit is over.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.InterstitialStaticPresentation = class {
  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {!HTMLElement} container The element the assets are drawn in.
   * @param {!HTMLMediaElement} video The primary video.
   * @param {function(string, Map<string, ?>=)} onEvent Sends an ad event for
   *   the interstitial.
   * @param {function()} onClick Called when an asset is clicked, if the
   *   interstitial has a click-through.
   * @param {function()} onEnd Called once the presentation has ended and its
   *   assets have been removed.
   */
  constructor(interstitial, container, video, onEvent, onClick, onEnd) {
    /** @private {shaka.extern.AdInterstitial} */
    this.interstitial_ = interstitial;

    /** @private {!HTMLElement} */
    this.container_ = container;

    /** @private {!HTMLMediaElement} */
    this.video_ = video;

    /** @private {function(string, Map<string, ?>=)} */
    this.onEvent_ = onEvent;

    /** @private {function()} */
    this.onClick_ = onClick;

    /** @private {function()} */
    this.onEnd_ = onEnd;

    /** @private {!Array<!HTMLElement>} */
    this.elements_ = [];

    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {?shaka.util.Timer} */
    this.timer_ = null;

    /** @private {boolean} */
    this.released_ = false;
  }

  /**
   * Draws the assets and starts watching for the end of the presentation.
   */
  start() {
    const Utils = shaka.ads.Utils;
    const LayoutRenderer = shaka.ads.LayoutRenderer;
    const interstitial = this.interstitial_;
    const video = this.video_;

    const layout = LayoutRenderer.fromInterstitial(interstitial);
    const isHtml = interstitial.mimeType == 'text/html';
    const element = /** @type {!(HTMLImageElement|HTMLIFrameElement)} */ (
      document.createElement(isHtml ? 'iframe' : 'img'));
    element.style.objectFit = 'contain';
    element.style.position = 'absolute';
    element.style.border = 'none';
    element.src = interstitial.uri;
    if (!isHtml) {
      this.eventManager_.listen(element, 'error', (e) => {
        this.end_(Utils.AD_ERROR, (new Map()).set('originalEvent', e));
      });
    }
    LayoutRenderer.placeAsset(element, layout.assets[0]);
    this.container_.appendChild(element);
    this.elements_.push(element);

    const startTime = Date.now();
    this.timer_ = new shaka.util.Timer(() => {
      // The playout limit is read on each tick, since it can be updated
      // while the interstitial is presented. Without an end time the timer
      // ticks once, exactly when the limit is reached.
      if (interstitial.playoutLimit &&
          (Date.now() - startTime) / 1000 >= interstitial.playoutLimit) {
        this.end_(Utils.AD_COMPLETE);
      } else if (interstitial.endTime &&
          video.currentTime > interstitial.endTime) {
        this.end_(Utils.AD_COMPLETE);
      } else if (video.currentTime < interstitial.startTime) {
        this.end_(Utils.AD_SKIPPED);
      }
    });
    if (interstitial.playoutLimit && !interstitial.endTime) {
      this.timer_.tickAfter(interstitial.playoutLimit);
    } else if (interstitial.endTime) {
      this.timer_.tickEvery(/* seconds= */ 0.025);
    }
    this.eventManager_.listen(video, 'seeked', () => {
      const currentTime = video.currentTime;
      if (currentTime < interstitial.startTime ||
          (interstitial.endTime && currentTime > interstitial.endTime)) {
        this.end_(Utils.AD_SKIPPED);
      }
    });
    if (interstitial.clickThroughUrl) {
      for (const asset of this.elements_) {
        this.eventManager_.listen(asset, 'click', () => this.onClick_());
      }
    }
  }

  /**
   * Removes the assets without sending any event.
   *
   * @override
   */
  release() {
    if (this.released_) {
      return;
    }
    this.released_ = true;
    this.timer_?.stop();
    this.timer_ = null;
    this.eventManager_.release();
    for (const element of this.elements_) {
      element.remove();
    }
    this.elements_ = [];
  }

  /**
   * @param {string} type The event that ends the presentation.
   * @param {Map<string, ?>=} data
   * @private
   */
  end_(type, data) {
    if (this.released_) {
      return;
    }
    this.onEvent_(type, data);
    this.release();
    this.onEnd_();
  }
};
