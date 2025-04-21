/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Ad UI', () => {
  const UiUtils = shaka.test.UiUtils;
  /** @type {!HTMLLinkElement} */
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
    cssLink = /** @type {!HTMLLinkElement} */(document.createElement('link'));
    await UiUtils.setupCSS(cssLink);
    shaka.Player.setAdManagerFactory(() => new shaka.test.FakeAdManager());
  });

  beforeEach(async () => {
    container =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    document.body.appendChild(container);

    video = shaka.test.UiUtils.createVideoElement();
    container.appendChild(video);
    await UiUtils.createUIThroughAPI(container, video);
    adManager = video['ui'].getControls().getPlayer().getAdManager();
  });

  afterEach(async () => {
    await UiUtils.cleanupUI();
  });

  afterAll(() => {
    document.head.removeChild(cssLink);
    shaka.Player.setAdManagerFactory(() => new shaka.ads.AdManager());
  });

  it('is invisible if no ad is playing', () => {
    const adControlsContainer =
        UiUtils.getElementByClassName(container, 'shaka-ad-controls');
    UiUtils.confirmElementHidden(adControlsContainer);
  });

  it('becomes visible if an ad is playing', async () => {
    const eventManager = new shaka.util.EventManager();
    const waiter = new shaka.test.Waiter(eventManager);
    const p = waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

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
        waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

    const pStop =
        waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

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
      const p = waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ null,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await p;

      UiUtils.confirmElementHidden(skipButton);
    });

    it('becomes visible if a skippable ad is playing', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ 10,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await p;

      UiUtils.confirmElementDisplayed(skipButton);
    });

    it('correctly shows the time until the ad can be skipped', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

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
      const p = waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

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
          waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      const pSkip = waiter.waitForEvent(
          adManager, shaka.ads.Utils.AD_SKIP_STATE_CHANGED);

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
          waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);
      const pSkip = waiter.waitForEvent(
          adManager, shaka.ads.Utils.AD_SKIP_STATE_CHANGED);

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

  describe('timeline', () => {
    /** @type {!HTMLElement} */
    let seekBar;
    /** @type {!HTMLElement} */
    let adMarkersBar;

    beforeEach(() => {
      seekBar = UiUtils.getElementByClassName(
          container, 'shaka-seek-bar-container');

      adMarkersBar = UiUtils.getElementByClassName(
          container, 'shaka-ad-markers');
    });

    it('disappears when an ad is playing', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ null,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await p;

      UiUtils.confirmElementHidden(seekBar);
    });

    it('ad markers aren\'t displayed if there are no ads', () => {
      expect(adMarkersBar.style.background).toBe('');
    });
  });

  describe('overflow menu', () => {
    /** @type {!HTMLElement} */
    let overflowMenuButton;

    beforeEach(() => {
      overflowMenuButton = UiUtils.getElementByClassName(
          container, 'shaka-overflow-menu-button');
    });

    it('is hidden when an ad is playing', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const p = waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

      ad = new shaka.test.FakeAd(/* skipIn= */ null,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await p;

      UiUtils.confirmElementHidden(overflowMenuButton);
    });

    it('is displayed when an ad stops playing', async () => {
      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const pStart =
          waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STARTED);

      const pStop =
          waiter.waitForEvent(adManager, shaka.ads.Utils.AD_STOPPED);

      ad = new shaka.test.FakeAd(/* skipIn= */ null,
          /* position= */ 1, /* totalAdsInPod= */ 1);
      adManager.startAd(ad);

      await pStart;

      UiUtils.confirmElementHidden(overflowMenuButton);

      adManager.finishAd();

      await pStop;

      UiUtils.confirmElementDisplayed(overflowMenuButton);
    });
  });
});
