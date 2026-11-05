/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('LayoutRenderer', () => {
  const LayoutRenderer = shaka.ads.LayoutRenderer;

  /**
   * @param {number} x
   * @param {number} y
   * @param {number} width
   * @param {number} height
   * @param {number=} viewportWidth
   * @param {number=} viewportHeight
   * @return {shaka.extern.AdPositionInfo}
   */
  function position(x, y, width, height, viewportWidth = 1920,
      viewportHeight = 1080) {
    return {
      viewport: {x: viewportWidth, y: viewportHeight},
      topLeft: {x, y},
      size: {x: width, y: height},
    };
  }

  /**
   * @param {!Object} fields
   * @return {shaka.extern.AdInterstitial}
   */
  function interstitial(fields) {
    return shaka.ads.Utils.createInterstitial(fields);
  }

  /**
   * @param {!HTMLElement} element
   * @return {!Object<string, string>}
   */
  function box(element) {
    const style = element.style;
    return {
      left: style.left,
      top: style.top,
      right: style.right,
      bottom: style.bottom,
      width: style.width,
      height: style.height,
    };
  }

  describe('fromInterstitial', () => {
    it('lays a linear interstitial over the whole container', () => {
      const layout = LayoutRenderer.fromInterstitial(interstitial({}));

      expect(layout).toEqual({
        primary: {viewport: null, zDepth: 0},
        assets: [{
          viewport: {top: 0, right: 0, bottom: 0, left: 0},
          width: 0,
          height: 0,
          zDepth: 1,
        }],
        background: null,
      });
    });

    it('converts overlay and squeeze positions to insets', () => {
      const layout = LayoutRenderer.fromInterstitial(interstitial({
        overlay: position(960, 270, 960, 540),
        currentVideo: position(0, 0, 960, 540),
        displayOnBackground: true,
        background: 'red',
      }));

      expect(layout).toEqual({
        primary: {
          viewport: {top: 0, right: 50, bottom: 50, left: 0},
          zDepth: 1,
        },
        assets: [{
          viewport: {top: 25, right: 0, bottom: 25, left: 50},
          width: 0,
          height: 0,
          zDepth: 0,
        }],
        background: 'red',
      });
    });

    it('keeps the intrinsic size of an overlay without viewport', () => {
      const layout = LayoutRenderer.fromInterstitial(interstitial({
        overlay: position(0, 0, 300, 50, 0, 0),
      }));

      expect(layout.assets).toEqual([{
        viewport: null,
        width: 300,
        height: 50,
        zDepth: 1,
      }]);
    });
  });

  describe('placeAsset', () => {
    /** @type {!HTMLElement} */
    let element;

    beforeEach(() => {
      element = /** @type {!HTMLElement} */ (document.createElement('img'));
    });

    it('places an asset at its viewport', () => {
      LayoutRenderer.placeAsset(element, {
        viewport: {top: 25, right: 0, bottom: 25, left: 50},
        width: 0,
        height: 0,
        zDepth: 1,
      });

      expect(box(element)).toEqual({
        left: '50%',
        top: '25%',
        right: '',
        bottom: '',
        width: '50%',
        height: '50%',
      });
    });

    it('places an asset without viewport as a banner', () => {
      LayoutRenderer.placeAsset(element, {
        viewport: null,
        width: 300,
        height: 50,
        zDepth: 1,
      });

      expect(element.getAttribute('width')).toBe('300');
      expect(element.getAttribute('height')).toBe('50');
      expect(box(element)).toEqual({
        left: '0px',
        top: '',
        right: '0px',
        bottom: '10%',
        width: '100%',
        height: '',
      });
    });

    it('sizes a banner without height to its content', () => {
      LayoutRenderer.placeAsset(element, {
        viewport: null,
        width: 300,
        height: 0,
        zDepth: 1,
      });

      expect(element.style.height).toBe('auto');
    });

    it('clears the banner edges when placed at a viewport', () => {
      const banner = {viewport: null, width: 300, height: 50, zDepth: 1};
      LayoutRenderer.placeAsset(element, banner);
      LayoutRenderer.placeAsset(element, {
        viewport: LayoutRenderer.FULL_VIEWPORT,
        width: 0,
        height: 0,
        zDepth: 1,
      });

      expect(box(element)).toEqual({
        left: '0%',
        top: '0%',
        right: '',
        bottom: '',
        width: '100%',
        height: '100%',
      });
    });
  });

  describe('render', () => {
    /** @type {!HTMLElement} */
    let video;
    /** @type {!HTMLElement} */
    let container;

    beforeEach(() => {
      video = /** @type {!HTMLElement} */ (document.createElement('video'));
      container = /** @type {!HTMLElement} */ (document.createElement('div'));
    });

    /**
     * @param {!Object} fields
     * @return {!shaka.ads.LayoutRenderer.Layout}
     */
    function layoutOf(fields) {
      return LayoutRenderer.fromInterstitial(interstitial(fields));
    }

    it('scales the primary video with a transition', () => {
      LayoutRenderer.render(video, container, layoutOf({
        currentVideo: position(0, 0, 960, 540),
      }));

      // Firefox serializes the default z offset too ('left top 0px').
      expect(video.style.transformOrigin).toMatch(/^left top( 0px)?$/);
      expect(video.style.transform).toBe('scaleX(0.5) scaleY(0.5)');
      expect(video.style.transition).toBe('transform 250ms');
    });

    it('moves the primary video without a transition', () => {
      LayoutRenderer.render(video, container, layoutOf({
        currentVideo: position(480, 270, 960, 540),
      }));

      expect(video.style.transform).toBe(
          'translateX(25%) translateY(25%) scaleX(0.5) scaleY(0.5)');
      expect(video.style.transition).toBe('');
    });

    it('scales the primary video on each axis independently', () => {
      LayoutRenderer.render(video, container, layoutOf({
        currentVideo: position(0, 0, 1920, 540),
      }));

      expect(video.style.transform).toBe('scaleY(0.5)');

      LayoutRenderer.render(video, container, layoutOf({
        currentVideo: position(0, 0, 960, 1080),
      }));

      expect(video.style.transform).toBe('scaleX(0.5)');
    });

    it('draws the primary video on top of the asset', () => {
      LayoutRenderer.render(video, container, layoutOf({
        overlay: position(0, 0, 1920, 1080),
        displayOnBackground: true,
      }));

      expect(video.style.zIndex).toBe('1');
    });

    it('leaves the primary video alone for a plain overlay', () => {
      LayoutRenderer.render(video, container, layoutOf({
        overlay: position(0, 0, 960, 540),
      }));

      expect(video.style.zIndex).toBe('');
      expect(video.style.transform).toBe('');
    });

    it('sets the background of the container', () => {
      LayoutRenderer.render(video, container, layoutOf({background: 'red'}));

      expect(container.style.background).toContain('red');
    });

    it('resets only what the layout applied', () => {
      LayoutRenderer.render(video, container, layoutOf({
        currentVideo: position(0, 0, 960, 540),
        displayOnBackground: true,
        background: 'red',
      }));
      LayoutRenderer.clear(video, container, layoutOf({}));

      expect(video.style.zIndex).toBe('1');
      expect(video.style.transform).not.toBe('');
      expect(container.style.background).toContain('red');

      LayoutRenderer.clear(video, container);

      expect(video.style.zIndex).toBe('');
      expect(video.style.transform).toBe('');
      expect(video.style.transition).toBe('');
      expect(container.style.background).toBe('');
    });
  });
});
