/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */


describe('InterstitialTracker', () => {
  const Utils = shaka.ads.Utils;

  /** @type {!jasmine.Spy} */
  let sendBeacon;

  beforeEach(() => {
    sendBeacon = jasmine.createSpy('sendBeacon');
  });

  /**
   * @param {!Array<shaka.ads.InterstitialTracker.Event>} events
   * @return {!shaka.ads.InterstitialTracker}
   */
  function createTracker(events) {
    return new shaka.ads.InterstitialTracker(
        () => events, shaka.test.Util.spyFunc(sendBeacon));
  }

  it('converts VAST tracking and maps ad events to its names', () => {
    const tracking = shaka.ads.Utils.createTracking();
    tracking.impression = ['impression'];
    tracking.firstQuartile = ['first'];
    tracking.unmute = ['unmute'];
    const tracker = createTracker(
        shaka.ads.InterstitialTracker.fromTracking(tracking));
    tracker.onEvent(Utils.AD_IMPRESSION);
    tracker.onEvent(Utils.AD_FIRST_QUARTILE);
    tracker.onEvent(Utils.AD_VOLUME_CHANGED);
    tracker.onEvent(Utils.AD_MIDPOINT);
    expect(sendBeacon.calls.allArgs()).toEqual(
        [['impression'], ['first'], ['unmute']]);
  });

  it('reports states once and actions every time', () => {
    const tracker = createTracker([
      {type: 'start', urls: ['start']},
      {type: 'pause', urls: ['pause']},
    ]);
    tracker.onEvent(Utils.AD_STARTED);
    tracker.onEvent(Utils.AD_STARTED);
    tracker.onEvent(Utils.AD_PAUSED);
    tracker.onEvent(Utils.AD_PAUSED);
    expect(sendBeacon.calls.allArgs()).toEqual(
        [['start'], ['pause'], ['pause']]);
  });

  it('reports progress offsets crossed by played media once', () => {
    const tracker = createTracker([
      {type: 'progress', offset: 5, urls: ['five']},
      {type: 'progress', offset: 10, urls: ['ten']},
    ]);
    tracker.onProgress(0, 4);
    expect(sendBeacon).not.toHaveBeenCalled();
    tracker.onProgress(4, 6);
    tracker.onProgress(4, 6);
    expect(sendBeacon.calls.allArgs()).toEqual([['five']]);
  });

  it('shares fired events and stops after release', () => {
    const events = [{type: 'start', urls: ['start']}];
    const fired = new Set();
    const first = new shaka.ads.InterstitialTracker(
        () => events, shaka.test.Util.spyFunc(sendBeacon), fired);
    const second = new shaka.ads.InterstitialTracker(
        () => events, shaka.test.Util.spyFunc(sendBeacon), fired);
    first.onEvent(Utils.AD_STARTED);
    second.onEvent(Utils.AD_STARTED);
    expect(sendBeacon).toHaveBeenCalledTimes(1);
    second.release();
    second.fire('pause');
    expect(sendBeacon).toHaveBeenCalledTimes(1);
  });
});
