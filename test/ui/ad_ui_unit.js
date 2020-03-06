/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Ad UI', () => {
  const UiUtils = shaka.test.UiUtils;
  /** @type {!Element} */
  let cssLink;
  /** @type {!HTMLElement} */
  let container;
  /** @type {!HTMLMediaElement} */
  let video;
  /** @type {!shaka.test.FakeAd} */
  let ad;
  /** @type {!shaka.test.FakeAdManager} */
  let adManager;


  beforeAll(async () => {
    // Add css file
    cssLink = document.createElement('link');
    await UiUtils.setupCSS(cssLink);
    shaka.Player.setAdManagerFactory(() => new shaka.test.FakeAdManager());
  });

  afterEach(async () => {
    await UiUtils.cleanupUI();
  });

  afterAll(() => {
    document.head.removeChild(cssLink);
  });

  beforeEach(() => {
    container =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    document.body.appendChild(container);

    video = shaka.test.UiUtils.createVideoElement();
    container.appendChild(video);
    UiUtils.createUIThroughAPI(container, video);
    adManager = video['ui'].getControls().getPlayer().getAdManager();
  });

  it('is invisible if no ad is playing', () => {
    const adControlsContainer =
        UiUtils.getElementByClassName(container, 'shaka-ad-controls');
    UiUtils.confirmElementHidden(adControlsContainer);
  });

  it('becomes visible if an ad is playing', async () => {
    const eventManager = new shaka.util.EventManager();
    const waiter = new shaka.test.Waiter(eventManager);
    const p = waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);

    ad = new shaka.test.FakeAd(/* skipIn= */ null,
        /* position= */ 1, /* totalAdsInPod= */ 1);
    adManager.startAd(ad);

    await p;
    const adControlsContainer =
        UiUtils.getElementByClassName(container, 'shaka-ad-controls');


    UiUtils.confirmElementDisplayed(adControlsContainer);
  });

  it('hides when an ad is done playing', async () => {
    const eventManager = new shaka.util.EventManager();
    const waiter = new shaka.test.Waiter(eventManager);
    const pStart =
        waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);

    const pStop =
        waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STOPPED);

    ad = new shaka.test.FakeAd(/* skipIn= */ null,
        /* position= */ 1, /* totalAdsInPod= */ 1);
    adManager.startAd(ad);

    await pStart;
    const adControlsContainer =
        UiUtils.getElementByClassName(container, 'shaka-ad-controls');

    UiUtils.confirmElementDisplayed(adControlsContainer);

    adManager.finishAd();

    await pStop;

    UiUtils.confirmElementHidden(adControlsContainer);
  });

  describe('skip button', () => {
    /** @type {!HTMLButtonElement} */
    let skipButton;

    beforeEach(() => {
      skipButton =
        /** @type {!HTMLButtonElement} */ (UiUtils.getElementByClassName(
            container, 'shaka-skip-ad-button'));
    });

    it('is invisible if an unskippable ad is playing', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ null,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await p;

      UiUtils.confirmElementHidden(skipButton);
    });

    it('becomes visible if a skippable ad is playing', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ 10,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await p;

      UiUtils.confirmElementDisplayed(skipButton);
    });

    it('correctly shows the time until the ad can be skipped', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ 10,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await p;

      const skipCounter =
          UiUtils.getElementByClassName(container, 'shaka-skip-ad-counter');
      UiUtils.confirmElementDisplayed(skipCounter);
      expect(skipCounter.textContent).toBe('10');
    });

    it('is disabled if skip count is greater than 0', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ 10,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await p;

      expect(skipButton.disabled).toBe(true);
    });

    it('is enabled if an ad can be skipped now', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const pStart =
          waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);
      const pSkip = waiter.waitForEvent(
          adManager, shaka.ads.AdManager.AD_SKIP_STATE_CHANGED);

      ad = new shaka.test.FakeAd(/* skipIn= */ 0,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);
      await pStart;

      adManager.changeSkipState();
      await pSkip;

      expect(skipButton.disabled).toBe(false);
    });

    it('hides skip counter if an ad can be skipped now', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const pStart =
          waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);
      const pSkip = waiter.waitForEvent(
          adManager, shaka.ads.AdManager.AD_SKIP_STATE_CHANGED);

      ad = new shaka.test.FakeAd(/* skipIn= */ 10,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);
      await pStart;

      const skipCounter =
          UiUtils.getElementByClassName(container, 'shaka-skip-ad-counter');
      UiUtils.confirmElementDisplayed(skipCounter);

      // Set ad to be skippable now
      ad.setTimeUntilSkippable(0);
      adManager.changeSkipState();
      await pSkip;

      UiUtils.confirmElementHidden(skipCounter);
    });
  });

  /*
   TODO:
   Ad counter:
   - displays correct ad time
   - shows 'ad x of y' correctly if need be
   Timeline:
   - dissappears when an ad is showing
   - ad markers are placed correctly
   */
});
