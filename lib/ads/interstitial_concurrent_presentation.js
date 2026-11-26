/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.InterstitialConcurrentPresentation');

goog.require('shaka.ads.LayoutRenderer');
goog.require('shaka.ads.Utils');
goog.require('shaka.util.EventManager');
goog.require('shaka.util.IReleasable');
goog.require('shaka.util.Timer');


/**
 * Presents a non-linear interstitial together with the primary content, which
 * keeps playing: an image or an HTML document drawn over it, or media played
 * in a media element of its own. It follows the primary content, and ends the
 * presentation when the primary content leaves the window of the
 * interstitial.
 *
 * @implements {shaka.util.IReleasable}
 */
shaka.ads.InterstitialConcurrentPresentation = class {
  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @param {!HTMLMediaElement} video The primary video.
   */
  constructor(interstitial, video) {
    /** @private {shaka.extern.AdInterstitial} */
    this.interstitial_ = interstitial;

    /** @private {!HTMLMediaElement} */
    this.video_ = video;

    /** @private {!Array<!HTMLElement>} */
    this.elements_ = [];

    /** @private {!shaka.util.EventManager} */
    this.eventManager_ = new shaka.util.EventManager();

    /** @private {?shaka.util.Timer} */
    this.timer_ = null;

    /** @private {?function(string, Map<string, ?>=)} */
    this.onEvent_ = null;

    /** @private {?function()} */
    this.onEnd_ = null;

    /** @private {boolean} */
    this.released_ = false;
  }

  /**
   * Draws the image or the HTML document of the interstitial, and ends the
   * presentation when its window or its playout limit is over.
   *
   * @param {!HTMLElement} container The element the assets are drawn in.
   * @param {!shaka.ads.LayoutRenderer} layoutRenderer Places the assets.
   * @param {function(string, Map<string, ?>=)} onEvent Sends an ad event for
   *   the interstitial.
   * @param {function()} onClick Called when an asset is clicked, if the
   *   interstitial has a click-through.
   * @param {function()} onEnd Called once the presentation has ended and its
   *   assets have been removed.
   */
  presentAsset(container, layoutRenderer, onEvent, onClick, onEnd) {
    const Utils = shaka.ads.Utils;
    const LayoutRenderer = shaka.ads.LayoutRenderer;
    const interstitial = this.interstitial_;
    const video = this.video_;
    this.onEvent_ = onEvent;
    this.onEnd_ = onEnd;

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
    layoutRenderer.place(element, layout.assets[0]);
    container.appendChild(element);
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
    this.watchWindow_(() => this.end_(Utils.AD_SKIPPED));
    if (interstitial.clickThroughUrl) {
      for (const asset of this.elements_) {
        this.eventManager_.listen(asset, 'click', () => onClick());
      }
    }
  }

  /**
   * Keeps the media of the interstitial, which is played and ended by its
   * owner, at the position of the primary content within the window of the
   * interstitial, and skips it when the primary content leaves the window.
   *
   * @param {!HTMLMediaElement} element The media element the media of the
   *   interstitial is played in.
   * @param {boolean} live Whether the primary content is live.
   * @param {function()} skip Ends the media of the interstitial as skipped.
   */
  presentMedia(element, live, skip) {
    const interstitial = this.interstitial_;
    const video = this.video_;
    if (!interstitial.pre && !interstitial.post &&
        (!live || interstitial.startTime > 0)) {
      const setPosition = () => {
        const newPosition = video.currentTime - interstitial.startTime;
        if (Math.abs(newPosition - element.currentTime) > 0.1) {
          element.currentTime = newPosition;
        }
      };
      this.eventManager_.listenOnce(element, 'playing', setPosition);
      this.eventManager_.listen(video, 'seeking', setPosition);
    }
    this.watchWindow_(skip);
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
   * Calls the given function when the primary content is seeked out of the
   * window of the interstitial.
   *
   * @param {function()} onLeave
   * @private
   */
  watchWindow_(onLeave) {
    const interstitial = this.interstitial_;
    const video = this.video_;
    this.eventManager_.listen(video, 'seeked', () => {
      const currentTime = video.currentTime;
      if (currentTime < interstitial.startTime ||
          (interstitial.endTime && currentTime > interstitial.endTime)) {
        onLeave();
      }
    });
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
    this.onEvent_?.(type, data);
    this.release();
    this.onEnd_?.();
  }
};
