/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Ads', () => {
  const Util = shaka.test.Util;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLScriptElement} */
  let imaScript;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!HTMLElement} */
  let adContainer;
  /** @type {shaka.Player} */
  let player;
  /** @type {shaka.extern.IAdManager} */
  let adManager;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

  beforeAll(async () => {
    imaScript = shaka.test.UiUtils.createImaSdkScript();
    const loadImaScript = new Promise((resolve, reject) => {
      imaScript.onload = resolve;
      imaScript.onerror= reject;
    });
    document.head.appendChild(imaScript);
    await loadImaScript;
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    adContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    document.body.appendChild(adContainer);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
    player = new compiledShaka.Player();
    adManager = player.getAdManager();
    await player.attach(video);

    player.configure('ads.skipPlayDetection', true);
    player.configure('ads.supportsMultipleMediaElements', false);
    player.configure('streaming.useNativeHlsOnSafari', false);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => fail(event.detail));
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
    eventManager.listen(adManager, shaka.ads.AdManager.AD_ERROR,
        Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.head.removeChild(imaScript);
    document.body.removeChild(video);
  });

  it('supports IMA SDK with vast', async () => {
    await player.load('/base/test/test/assets/dash-aes-128/dash.mpd');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 5 seconds, but stop early if the video ends.  If it takes
    // longer than 20 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 20);

    adManager.initClientSide(
        adContainer, video, /** adsRenderingSettings= **/ null);
    const adRequest = new google.ima.AdsRequest();
    adRequest.adTagUrl = 'https://pubads.g.doubleclick.net/gampad/ads?' +
        'sz=640x480&iu=/124319096/external/single_ad_samples&' +
        'ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&' +
        'unviewed_position_start=1&' +
        'cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';
    adManager.requestClientSideAds(adRequest);

    await waiter.timeoutAfter(30)
        .waitForEvent(adManager, shaka.ads.AdManager.AD_STOPPED);

    // Play for 10 seconds, but stop early if the video ends.  If it takes
    // longer than 20 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 20);

    await player.unload();
  });
});
