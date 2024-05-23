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

  /** @type {string} */
  const streamUri = '/base/test/test/assets/dash-multi-codec/dash.mpd';

  /** @type {string} */
  const adUri = 'https://pubads.g.doubleclick.net/gampad/ads?' +
      'sz=640x480&iu=/124319096/external/single_ad_samples&' +
      'ciu_szs=300x250&impl=s&gdfp_req=1&env=vp&output=vast&' +
      'unviewed_position_start=1&' +
      'cust_params=deployment%3Ddevsite%26sample_ct%3Dlinear&correlator=';

  // Load IMA script breaks Tizen 3, so we need avoid load to the script.
  if (!shaka.util.Platform.isTizen3()) {
    beforeAll(async () => {
      await new Promise((resolve, reject) => {
        imaScript = /** @type {!HTMLScriptElement} */(
          document.createElement('script'));
        imaScript.defer = false;
        imaScript['async'] = false;
        imaScript.onload = resolve;
        imaScript.onerror = reject;
        imaScript.setAttribute('src',
            'https://imasdk.googleapis.com/js/sdkloader/ima3.js');
        document.head.appendChild(imaScript);
      });
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

      player.configure('streaming.useNativeHlsOnSafari', false);

      // Disable stall detection, which can interfere with playback tests.
      player.configure('streaming.stallEnabled', false);

      // Grab event manager from the uncompiled library:
      eventManager = new shaka.util.EventManager();
      waiter = new shaka.test.Waiter(eventManager);
      waiter.setPlayer(player);

      onErrorSpy = jasmine.createSpy('onError');
      onErrorSpy.and.callFake((event) => {
        fail(event.detail);
      });
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
      document.body.removeChild(adContainer);
    });

    describe('supports IMA SDK with vast', () => {
      it('with support for multiple media elements', async () => {
        if (shaka.util.Platform.isSmartTV()) {
          pending('Platform without support for multiple media elements.');
        }
        player.configure('ads.customPlayheadTracker', false);
        player.configure('ads.skipPlayDetection', false);
        player.configure('ads.supportsMultipleMediaElements', true);

        adManager.initClientSide(
            adContainer, video, /** adsRenderingSettings= **/ null);

        await player.load(streamUri);
        await video.play();
        expect(player.isLive()).toBe(false);

        // Wait for the video to start playback.  If it takes longer than 10
        // seconds, fail the test.
        await waiter.waitForMovementOrFailOnTimeout(video, 10);

        // Play for 5 seconds, but stop early if the video ends.  If it takes
        // longer than 20 seconds, fail the test.
        await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 20);

        const adRequest = new google.ima.AdsRequest();
        adRequest.adTagUrl = adUri;
        adManager.requestClientSideAds(adRequest);

        // Wait a maximum of 10 seconds before the ad starts playing.
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_FIRST_QUARTILE);
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_MIDPOINT);
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_THIRD_QUARTILE);
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_STOPPED);

        // Play for 10 seconds, but stop early if the video ends.  If it takes
        // longer than 30 seconds, fail the test.
        await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

        await player.unload();
      });

      it('without support for multiple media elements', async () => {
        player.configure('ads.customPlayheadTracker', true);
        player.configure('ads.skipPlayDetection', true);
        player.configure('ads.supportsMultipleMediaElements', false);

        adManager.initClientSide(
            adContainer, video, /** adsRenderingSettings= **/ null);

        await player.load(streamUri);
        await video.play();
        expect(player.isLive()).toBe(false);

        // Wait for the video to start playback.  If it takes longer than 10
        // seconds, fail the test.
        await waiter.waitForMovementOrFailOnTimeout(video, 10);

        // Play for 5 seconds, but stop early if the video ends.  If it takes
        // longer than 20 seconds, fail the test.
        await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 20);

        const adRequest = new google.ima.AdsRequest();
        adRequest.adTagUrl = adUri;
        adManager.requestClientSideAds(adRequest);

        // Wait a maximum of 10 seconds before the ad starts playing.
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_FIRST_QUARTILE);
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_MIDPOINT);
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_THIRD_QUARTILE);
        await waiter.timeoutAfter(10)
            .waitForEvent(adManager, shaka.ads.AdManager.AD_STOPPED);

        // Play for 10 seconds, but stop early if the video ends.  If it takes
        // longer than 30 seconds, fail the test.
        await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

        await player.unload();
      });
    });
  }
});
