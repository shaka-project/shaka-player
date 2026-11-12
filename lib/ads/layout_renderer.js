/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


goog.provide('shaka.ads.LayoutRenderer');


/**
 * Places the elements of an interstitial presentation, the primary video and
 * the assets presented with it, from a layout that does not depend on the
 * format that signaled it.
 */
shaka.ads.LayoutRenderer = class {
  /**
   * Converts the position fields of an interstitial into a layout.
   *
   * @param {shaka.extern.AdInterstitial} interstitial
   * @return {!shaka.ads.LayoutRenderer.Layout}
   */
  static fromInterstitial(interstitial) {
    const LayoutRenderer = shaka.ads.LayoutRenderer;
    const overlay = interstitial.overlay;
    const currentVideo = interstitial.currentVideo;
    // The asset is drawn below the primary video when the primary video is
    // displayed on top of it, and above it otherwise.
    const primaryOnTop = interstitial.displayOnBackground;
    /** @type {!shaka.ads.LayoutRenderer.Asset_} */
    const asset = {
      viewport: LayoutRenderer.FULL_VIEWPORT,
      width: 0,
      height: 0,
      zDepth: primaryOnTop ? 0 : 1,
    };
    if (overlay) {
      if (overlay.viewport.x && overlay.viewport.y) {
        asset.viewport = LayoutRenderer.toViewport_(overlay);
      } else {
        // Without a viewport, the size is the intrinsic size of the asset
        // in pixels (VAST non-linear ads).
        asset.viewport = null;
        asset.width = overlay.size.x;
        asset.height = overlay.size.y;
      }
    }
    return {
      primary: {
        viewport: currentVideo ? LayoutRenderer.toViewport_(currentVideo) :
            null,
        zDepth: primaryOnTop ? 1 : 0,
      },
      assets: [asset],
      background: interstitial.background,
    };
  }

  /**
   * Applies the layout to the primary video and to the container of the
   * assets.
   *
   * @param {!HTMLElement} video The primary video.
   * @param {?HTMLElement} container The container of the assets.
   * @param {!shaka.ads.LayoutRenderer.Layout} layout
   */
  static render(video, container, layout) {
    const LayoutRenderer = shaka.ads.LayoutRenderer;
    if (LayoutRenderer.isPrimaryOnTop_(layout)) {
      video.style.zIndex = '1';
    }
    const viewport = layout.primary.viewport;
    if (viewport) {
      video.style.transformOrigin = 'top left';
      let addTransition = true;
      const transforms = [];
      if (viewport.left > 0 && viewport.left <= 100) {
        transforms.push(`translateX(${viewport.left}%)`);
        // In the case of double box ads we do not want transitions.
        addTransition = false;
      }
      if (viewport.top > 0 && viewport.top <= 100) {
        transforms.push(`translateY(${viewport.top}%)`);
        // In the case of double box ads we do not want transitions.
        addTransition = false;
      }
      const scaleX = (100 - viewport.left - viewport.right) / 100;
      if (scaleX < 1) {
        transforms.push(`scaleX(${scaleX})`);
      }
      const scaleY = (100 - viewport.top - viewport.bottom) / 100;
      if (scaleY < 1) {
        transforms.push(`scaleY(${scaleY})`);
      }
      if (transforms.length) {
        video.style.transform = transforms.join(' ');
      }
      if (addTransition) {
        video.style.transition = 'transform 250ms';
      }
    }
    if (container && layout.background) {
      container.style.background = layout.background;
    }
  }

  /**
   * Undoes what {@link shaka.ads.LayoutRenderer.render} did for the layout, or
   * for any layout if none is given.
   *
   * @param {!HTMLElement} video The primary video.
   * @param {?HTMLElement} container The container of the assets.
   * @param {?shaka.ads.LayoutRenderer.Layout=} layout
   */
  static clear(video, container, layout) {
    if (!layout || shaka.ads.LayoutRenderer.isPrimaryOnTop_(layout)) {
      video.style.zIndex = '';
    }
    if (!layout || layout.primary.viewport) {
      video.style.transformOrigin = '';
      video.style.transition = '';
      video.style.transform = '';
    }
    if (container && (!layout || layout.background)) {
      container.style.background = '';
    }
  }

  /**
   * Places an asset element within its container.
   *
   * @param {!HTMLElement} element
   * @param {!shaka.ads.LayoutRenderer.Asset_} asset
   */
  static placeAsset(element, asset) {
    const style = element.style;
    const viewport = asset.viewport;
    if (viewport) {
      style.left = viewport.left + '%';
      style.top = viewport.top + '%';
      style.right = '';
      style.bottom = '';
      style.width = (100 - viewport.left - viewport.right) + '%';
      style.height = (100 - viewport.top - viewport.bottom) + '%';
    } else {
      // A banner of the intrinsic size of the asset, across the bottom.
      element.setAttribute('width', String(asset.width));
      element.setAttribute('height', String(asset.height));
      style.left = '0';
      style.top = '';
      style.right = '0';
      style.bottom = '10%';
      style.width = '100%';
      style.height = asset.height ? '' : 'auto';
    }
  }

  /**
   * @param {!shaka.ads.LayoutRenderer.Layout} layout
   * @return {boolean}
   * @private
   */
  static isPrimaryOnTop_(layout) {
    return layout.assets.some((asset) => asset.zDepth < layout.primary.zDepth);
  }

  /**
   * @param {!shaka.extern.AdPositionInfo} position
   * @return {!shaka.ads.LayoutRenderer.Viewport_}
   * @private
   */
  static toViewport_(position) {
    const left = position.topLeft.x / position.viewport.x * 100;
    const top = position.topLeft.y / position.viewport.y * 100;
    return {
      top,
      right: 100 - left - position.size.x / position.viewport.x * 100,
      bottom: 100 - top - position.size.y / position.viewport.y * 100,
      left,
    };
  }
};


/**
 * Insets of each edge of an element from the same edge of its container, as a
 * percentage of the size of the container.
 *
 * @typedef {{
 *   top: number,
 *   right: number,
 *   bottom: number,
 *   left: number,
 * }}
 * @private
 */
shaka.ads.LayoutRenderer.Viewport_;


/**
 * @typedef {{
 *   viewport: ?shaka.ads.LayoutRenderer.Viewport_,
 *   zDepth: number,
 * }}
 *
 * @property {?shaka.ads.LayoutRenderer.Viewport_} viewport
 *   Where the primary video is placed, or null to leave it where it is.
 * @property {number} zDepth
 *   The stacking order of the primary video. Elements with a higher value are
 *   drawn on top.
 * @private
 */
shaka.ads.LayoutRenderer.Primary_;


/**
 * @typedef {{
 *   viewport: ?shaka.ads.LayoutRenderer.Viewport_,
 *   width: number,
 *   height: number,
 *   zDepth: number,
 * }}
 *
 * @property {?shaka.ads.LayoutRenderer.Viewport_} viewport
 *   Where the asset is placed. If null, the asset is a banner of its
 *   intrinsic size across the bottom.
 * @property {number} width
 *   The intrinsic width of the asset in pixels, used without viewport.
 * @property {number} height
 *   The intrinsic height of the asset in pixels, used without viewport.
 * @property {number} zDepth
 *   The stacking order of the asset. Elements with a higher value are drawn
 *   on top.
 * @private
 */
shaka.ads.LayoutRenderer.Asset_;


/**
 * @typedef {{
 *   primary: !shaka.ads.LayoutRenderer.Primary_,
 *   assets: !Array<!shaka.ads.LayoutRenderer.Asset_>,
 *   background: ?string,
 * }}
 *
 * @property {!shaka.ads.LayoutRenderer.Primary_} primary
 *   The layout of the primary video.
 * @property {!Array<!shaka.ads.LayoutRenderer.Asset_>} assets
 *   The layout of each asset presented.
 * @property {?string} background
 *   The CSS background of the container of the assets.
 */
shaka.ads.LayoutRenderer.Layout;


/**
 * The whole container.
 *
 * @const {!shaka.ads.LayoutRenderer.Viewport_}
 */
shaka.ads.LayoutRenderer.FULL_VIEWPORT = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};
