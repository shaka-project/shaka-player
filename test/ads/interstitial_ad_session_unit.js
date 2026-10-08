/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('InterstitialAdSession', () => {
  /** @type {!shaka.test.FakeVideo} */
  let video;
  /** @type {!shaka.extern.AdInterstitial} */
  let interstitial;
  /** @type {!shaka.ads.InterstitialAdSession} */
  let session;
  /** @type {!jasmine.Spy} */
  let onEvent;
  /** @type {!jasmine.Spy} */
  let onTracking;
  /** @type {!shaka.ads.SvtaInterstitialTracker} */
  let tracker;

  beforeEach(() => {
    video = new shaka.test.FakeVideo(100);
    video.readyState = 4;
    const slot = {type: 'linear', start: 0, duration: 20,
      identifiers: [{scheme: 'test', value: 'creative'}], tracking: [
        {type: 'progress', offset: 0, urls: ['zero']},
        {type: 'progress', offset: 5, urls: ['five']},
        {type: 'complete', urls: ['complete']},
        {type: 'unmute', urls: ['unmute']},
        {type: 'resume', urls: ['resume']},
      ]};
    interstitial = shaka.ads.SvtaInterstitialParser.parseInterstitials(
        {version: 2, type: 'slot', payload: [slot]}, 100, 'id')
        .interstitials[0];
    const ad = new shaka.ads.InterstitialAd(video, interstitial,
        () => {}, 1, 1, false);
    onTracking = jasmine.createSpy('onTracking');
    onEvent = jasmine.createSpy('onEvent').and.callFake((type) => {
      session.notify(type);
    });
    session = new shaka.ads.InterstitialAdSession(video, interstitial, ad,
        shaka.test.Util.spyFunc(onEvent));
    tracker = new shaka.ads.SvtaInterstitialTracker();
    session.setTracker(tracker.create(interstitial, session,
        shaka.test.Util.spyFunc(onTracking),
        shaka.test.Util.spyFunc(jasmine.createSpy('fetch'))));
  });

  afterEach(() => {
    session.release();
    tracker.release();
  });

  it('uses the embedded slot clock on a live media element', () => {
    video.duration = Infinity;
    session.update();
    expect(onTracking).toHaveBeenCalledWith('zero');
    video.currentTime = 105;
    session.update();
    session.update();
    const fiveCalls = onTracking.calls.allArgs().filter((args) =>
      args[0] == 'five');
    expect(fiveCalls.length)
        .toBe(1);
    expect(onEvent).toHaveBeenCalledWith(shaka.ads.Utils.AD_FIRST_QUARTILE);
  });

  it('does not start tracking while paused', () => {
    video.paused = true;
    session.update();
    expect(onTracking).not.toHaveBeenCalled();
    video.paused = false;
    session.update();
    expect(onTracking).toHaveBeenCalledWith('zero');
  });

  it('does not backfill progress, quartiles or complete after a seek', () => {
    session.update();
    video.on['seeking']();
    video.currentTime = 120;
    session.update();
    expect(onEvent).not.toHaveBeenCalled();
    expect(onTracking).not.toHaveBeenCalledWith('five');
    expect(session.canComplete()).toBe(false);
  });

  it('does not count fast playback as normal playback', () => {
    session.update();
    video.playbackRate = 2;
    video.currentTime = 110;
    session.update();
    video.playbackRate = 1;
    session.update();
    expect(onTracking).not.toHaveBeenCalledWith('five');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('completes when the media ends before the signaled duration', () => {
    video.duration = 119.9;
    session.update();
    video.currentTime = 119.9;
    video.ended = true;
    expect(session.canComplete()).toBe(true);
  });

  it('does not mistake volume changes or initial play for unmute or resume',
      () => {
        session.update();
        session.notify(shaka.ads.Utils.AD_VOLUME_CHANGED);
        session.notify(shaka.ads.Utils.AD_RESUMED);
        expect(onTracking).not.toHaveBeenCalledWith('unmute');
        expect(onTracking).not.toHaveBeenCalledWith('resume');
        video.muted = true;
        session.notify(shaka.ads.Utils.AD_MUTED);
        video.muted = false;
        session.notify(shaka.ads.Utils.AD_VOLUME_CHANGED);
        session.notify(shaka.ads.Utils.AD_PAUSED);
        session.notify(shaka.ads.Utils.AD_RESUMED);
        expect(onTracking).toHaveBeenCalledWith('unmute');
        expect(onTracking).toHaveBeenCalledWith('resume');
      });

  it('expands macro values instead of sending literal macros', () => {
    expect(session.expandUri('https://example.com/?id=[ADID]&p=[ADPLAYHEAD]'))
        .toBe('https://example.com/?id=creative&p=00%3A00%3A00.000');
  });

  it('tracks player expansion and collapse during an active slot', () => {
    goog.asserts.assert(interstitial.adCreativeSignaling, 'Need slot metadata');
    interstitial.adCreativeSignaling.tracking.push(
        {type: 'playerExpand', urls: ['expanded']},
        {type: 'playerCollapse', urls: ['collapsed']});
    session.update();
    video.on['enterpictureinpicture']();
    video.on['leavepictureinpicture']();
    expect(onTracking).toHaveBeenCalledWith('expanded');
    expect(onTracking).toHaveBeenCalledWith('collapsed');
  });
});
