/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('PlayRateController', () => {
  /** @type {!jasmine.Spy} */
  let getPlayRateSpy;
  /** @type {!jasmine.Spy} */
  let getDefaultPlayRateSpy;
  /** @type {!jasmine.Spy} */
  let setPlayRateSpy;
  /** @type {!jasmine.Spy} */
  let movePlayheadSpy;

  /** @type {number} */
  let playRate;

  /** @type {!shaka.media.PlayRateController} */
  let controller;

  beforeEach(() => {
    getPlayRateSpy = jasmine.createSpy('getPlaybackRate');
    getDefaultPlayRateSpy = jasmine.createSpy('getDefaultPlaybackRate');
    setPlayRateSpy = jasmine.createSpy('setPlaybackRate');
    movePlayheadSpy = jasmine.createSpy('movePlayhead');

    playRate = 1;

    getPlayRateSpy.and.callFake(() => playRate);
    setPlayRateSpy.and.callFake((rate) => {
      playRate = rate;
    });

    const harness = {
      getRate: shaka.test.Util.spyFunc(getPlayRateSpy),
      getDefaultRate: shaka.test.Util.spyFunc(getDefaultPlayRateSpy),
      setRate: shaka.test.Util.spyFunc(setPlayRateSpy),
      movePlayhead: shaka.test.Util.spyFunc(movePlayheadSpy),
    };

    controller = new shaka.media.PlayRateController(harness);
  });

  // When the playback rate is positive, we want to see that the media element's
  // playback rate gets set to the playback rate.
  it('positive playback rate', () => {
    controller.set(5);
    expect(setPlayRateSpy).toHaveBeenCalledWith(5);
  });

  // When the playback rate is negative, we want to see the media element's
  // playback rate get set to zero.
  it('negative playback rate', () => {
    controller.set(-5);
    expect(setPlayRateSpy).toHaveBeenCalledWith(0);
  });

  // Make sure that when the playback rate set, if the new rate matches the
  // current rate, the controller will not set the rate on the media element.
  it('does not redundently set the playrate', () => {
    // Make sure we don't see the play rate change before and after we set the
    // rate on the controller.
    expect(setPlayRateSpy).not.toHaveBeenCalled();
    controller.set(1);
    expect(setPlayRateSpy).not.toHaveBeenCalled();
  });
});
