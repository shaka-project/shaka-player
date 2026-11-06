/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('InterstitialStaticPresentation', () => {
  const Utils = shaka.ads.Utils;

  /** @type {!HTMLElement} */
  let container;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {number} */
  let currentTime;
  /** @type {!jasmine.Spy} */
  let onEvent;
  /** @type {!jasmine.Spy} */
  let onClick;
  /** @type {!jasmine.Spy} */
  let onEnd;
  /** @type {?shaka.ads.InterstitialStaticPresentation} */
  let presentation;

  beforeEach(() => {
    jasmine.clock().install();
    jasmine.clock().mockDate();
    container = /** @type {!HTMLElement} */ (document.createElement('div'));
    video = shaka.test.UiUtils.createVideoElement();
    currentTime = 0;
    Object.defineProperty(video, 'currentTime', {
      get: () => currentTime,
      configurable: true,
    });
    onEvent = jasmine.createSpy('onEvent');
    onClick = jasmine.createSpy('onClick');
    onEnd = jasmine.createSpy('onEnd');
    presentation = null;
  });

  afterEach(() => {
    presentation?.release();
    jasmine.clock().uninstall();
  });

  /**
   * @param {!Object} fields
   * @return {!shaka.ads.InterstitialStaticPresentation}
   */
  function start(fields) {
    const interstitial = Utils.createInterstitial(Object.assign({
      uri: 'data:image/png;base64,',
      mimeType: 'image/png',
      overlay: {
        viewport: {x: 1920, y: 1080},
        topLeft: {x: 960, y: 540},
        size: {x: 960, y: 540},
      },
    }, fields));
    presentation = new shaka.ads.InterstitialStaticPresentation(
        interstitial, container, video, shaka.test.Util.spyFunc(onEvent),
        shaka.test.Util.spyFunc(onClick), shaka.test.Util.spyFunc(onEnd));
    presentation.start();
    return presentation;
  }

  it('draws an image at the position of the overlay', () => {
    start({});

    const element = container.querySelector('img');
    expect(element).not.toBeNull();
    expect(element.style.left).toBe('50%');
    expect(element.style.top).toBe('50%');
    expect(element.style.width).toBe('50%');
    expect(element.style.height).toBe('50%');
  });

  it('draws an HTML document in an iframe', () => {
    start({uri: 'about:blank', mimeType: 'text/html'});

    expect(container.querySelector('iframe')).not.toBeNull();
    expect(container.querySelector('img')).toBeNull();
  });

  it('completes when the playout limit is over', () => {
    start({playoutLimit: 2});

    jasmine.clock().tick(1000);
    expect(onEnd).not.toHaveBeenCalled();

    jasmine.clock().tick(1500);
    expect(onEvent).toHaveBeenCalledWith(Utils.AD_COMPLETE, undefined);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(container.childNodes.length).toBe(0);
  });

  it('completes when the primary content leaves the window', () => {
    start({startTime: 10, endTime: 20});
    currentTime = 15;
    jasmine.clock().tick(100);
    expect(onEnd).not.toHaveBeenCalled();

    currentTime = 21;
    jasmine.clock().tick(100);
    expect(onEvent).toHaveBeenCalledWith(Utils.AD_COMPLETE, undefined);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('is skipped when seeking out of the window', () => {
    start({startTime: 10, endTime: 20});
    currentTime = 5;
    video.dispatchEvent(new Event('seeked'));

    expect(onEvent).toHaveBeenCalledWith(Utils.AD_SKIPPED, undefined);
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(container.childNodes.length).toBe(0);
  });

  it('reports an error when the image fails to load', () => {
    start({});
    container.querySelector('img').dispatchEvent(new Event('error'));

    expect(onEvent).toHaveBeenCalledWith(
        Utils.AD_ERROR, jasmine.any(Map));
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('ends only once', () => {
    start({startTime: 10, endTime: 20});
    currentTime = 5;
    video.dispatchEvent(new Event('seeked'));
    jasmine.clock().tick(100);
    video.dispatchEvent(new Event('seeked'));

    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEnd).toHaveBeenCalledTimes(1);
  });

  it('notifies clicks only with a click-through', () => {
    start({});
    container.querySelector('img').dispatchEvent(new Event('click'));
    expect(onClick).not.toHaveBeenCalled();
    presentation.release();

    start({clickThroughUrl: 'https://example.com'});
    container.querySelector('img').dispatchEvent(new Event('click'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('removes its assets silently when released', () => {
    start({startTime: 10, endTime: 20});
    presentation.release();

    expect(container.childNodes.length).toBe(0);
    currentTime = 5;
    video.dispatchEvent(new Event('seeked'));
    jasmine.clock().tick(100);
    expect(onEvent).not.toHaveBeenCalled();
    expect(onEnd).not.toHaveBeenCalled();
  });
});
