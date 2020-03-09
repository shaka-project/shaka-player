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

  describe('ad counter', () => {
    /** @type {!HTMLElement} */
    let adCounter;
    /** @type {!shaka.ui.Localization} */
    let localization;

    beforeEach(() => {
      adCounter = UiUtils.getElementByClassName(
          container, 'shaka-ad-counter-span');

      localization = video['ui'].getControls().getLocalization();
    });

    it('displays correct ad time', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.AdManager.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ null,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);
      ad.setRemainingTime(5); // seconds

      await p;

      // Ad counter has an internal timer that fires every 0.5 sec
      // to check the state. Give it a full second to make sure it
      // has time to catch up to the new remaining time value.
      await shaka.test.Util.delay(1);

      const expectedTimeString = '0:05 / 0:10';
      const LocIds = shaka.ui.Locales.Ids;
      const raw = localization.resolve(LocIds.AD_TIME);
      expect(adCounter.textContent).toBe(
          raw.replace('[AD_TIME]', expectedTimeString));
    });
  });

  describe('ad position', () => {
    /** @type {!HTMLElement} */
    let adPosition;
    /** @type {!shaka.ui.Localization} */
    let localization;

    beforeEach(() => {
      adPosition = UiUtils.getElementByClassName(
          container, 'shaka-ad-position-span');

      localization = video['ui'].getControls().getLocalization();
    });


    it('correctly shows "X of Y ads" for a sequence of several ads',
        async () => {
          const position = 2;
          const adsInPod = 3;
          const eventManager = new shaka.util.EventManager();
          const waiter = new shaka.test.Waiter(eventManager);
          const p = waiter.waitForEvent(
              adManager, shaka.ads.AdManager.AD_STARTED);

          ad = new shaka.test.FakeAd(/* skipIn= */ null,
          /* position= */ position, /* totalAdsInPod= */ adsInPod);
          adManager.startAd(ad);

          await p;

          const LocIds = shaka.ui.Locales.Ids;
          const expectedString = localization.resolve(LocIds.AD_PROGRESS)
              .replace('[AD_ON]', String(position))
              .replace('[NUM_ADS]', String(adsInPod));

          expect(adPosition.textContent).toBe(expectedString);
        });
  });

  /*
   TODO:
   Timeline:
   - dissappears when an ad is showing
   - ad markers are placed correctly
   */
});
