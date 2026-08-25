/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('InterstitialAd', () => {
  /** @type {!shaka.test.FakeVideo} */
  let video;

  beforeEach(() => {
    video = new shaka.test.FakeVideo();
  });

  /**
   * @param {boolean} skippable
   * @param {?number} skipOffset
   * @param {?number=} skipFor
   * @return {shaka.extern.AdInterstitial}
   */
  function makeInterstitial(skippable, skipOffset, skipFor = null) {
    return {
      id: 'AD',
      groupId: null,
      startTime: 0,
      endTime: null,
      uri: 'test.m3u8',
      mimeType: null,
      isSkippable: skippable,
      skipOffset: skipOffset,
      skipFor: skipFor,
      canJump: false,
      resumeOffset: 0,
      playoutLimit: null,
      once: true,
      pre: true,
      post: false,
      timelineRange: false,
      loop: false,
      overlay: null,
      displayOnBackground: false,
      currentVideo: null,
      background: null,
      clickThroughUrl: null,
      tracking: null,
    };
  }

  /**
   * @param {shaka.extern.AdInterstitial} interstitial
   * @return {!shaka.ads.InterstitialAd}
   */
  function makeAd(interstitial) {
    return new shaka.ads.InterstitialAd(
        video, interstitial, () => {}, /* sequenceLength= */ 2,
        /* adPosition= */ 2, /* isUsingAnotherMediaElement= */ true);
  }

  /**
   * Leaves the shared media element in the state the previous ad of a pod
   * leaves it in: loaded, and played to its end. The element is not unloaded
   * between the ads of a pod, so a newly created ad sees this.
   */
  function leavePreviousAdMediaLoaded() {
    video.duration = 30;
    video.currentTime = 30;
  }

  describe('before its own media has loaded', () => {
    it('does not become skippable from the previous ad of the pod', () => {
      // Regression test for
      // https://github.com/shaka-project/shaka-player/issues/10418
      leavePreviousAdMediaLoaded();

      const ad = makeAd(makeInterstitial(true, 5));

      expect(ad.isSkippable()).toBe(true);
      expect(ad.getTimeUntilSkippable()).toBe(5);
      expect(ad.canSkipNow()).toBe(false);
    });

    it('reports unknown timings instead of the previous ad\'s', () => {
      leavePreviousAdMediaLoaded();

      const ad = makeAd(makeInterstitial(true, 5));

      expect(ad.getDuration()).toBe(-1);
      expect(ad.getRemainingTime()).toBe(-1);
    });

    it('measures skipFor from a playhead of 0', () => {
      leavePreviousAdMediaLoaded();

      const ad = makeAd(makeInterstitial(true, 5, /* skipFor= */ 10));

      expect(ad.isSkippable()).toBe(true);
      expect(ad.getTimeUntilSkippable()).toBe(5);
      expect(ad.canSkipNow()).toBe(false);
    });

    it('is still immediately skippable without a skip offset', () => {
      // Ads that can be skipped from the start must keep enabling the skip
      // button right away, including when they are preloaded and the media
      // has not been attached yet.
      leavePreviousAdMediaLoaded();

      const ad = makeAd(makeInterstitial(true, 0));

      expect(ad.getTimeUntilSkippable()).toBe(0);
      expect(ad.canSkipNow()).toBe(true);
    });

    it('is never skippable when the interstitial is not', () => {
      leavePreviousAdMediaLoaded();

      const ad = makeAd(makeInterstitial(false, null));

      expect(ad.isSkippable()).toBe(false);
      expect(ad.canSkipNow()).toBe(false);
    });
  });

  describe('once its own media has loaded', () => {
    it('counts the skip offset down against its own playhead', () => {
      const ad = makeAd(makeInterstitial(true, 5));
      video.duration = 60;
      video.currentTime = 0;
      ad.markMediaReady();

      expect(ad.getDuration()).toBe(60);
      expect(ad.getRemainingTime()).toBe(60);
      expect(ad.getTimeUntilSkippable()).toBe(5);
      expect(ad.canSkipNow()).toBe(false);

      video.currentTime = 3;
      expect(ad.getTimeUntilSkippable()).toBe(2);
      expect(ad.canSkipNow()).toBe(false);

      video.currentTime = 5;
      expect(ad.getTimeUntilSkippable()).toBe(0);
      expect(ad.canSkipNow()).toBe(true);
    });

    it('stops being skippable after skipFor elapses', () => {
      const ad = makeAd(makeInterstitial(true, 5, /* skipFor= */ 10));
      video.duration = 60;
      video.currentTime = 7;
      ad.markMediaReady();

      expect(ad.isSkippable()).toBe(true);
      expect(ad.canSkipNow()).toBe(true);

      video.currentTime = 15;
      expect(ad.isSkippable()).toBe(false);
      expect(ad.canSkipNow()).toBe(false);
    });

    it('still reports unknown timings without a duration', () => {
      const ad = makeAd(makeInterstitial(true, 5));
      video.duration = NaN;
      ad.markMediaReady();

      expect(ad.getDuration()).toBe(-1);
      expect(ad.getRemainingTime()).toBe(-1);
    });
  });
});
