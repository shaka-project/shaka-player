/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
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
    setPlayRateSpy.and.callFake((rate) => { playRate = rate; });

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

  it('buffering state sets rate to zero', () => {
    controller.setBuffering(true);
    expect(setPlayRateSpy).toHaveBeenCalledWith(0);

    setPlayRateSpy.calls.reset();

    controller.setBuffering(false);
    expect(setPlayRateSpy).toHaveBeenCalledWith(1);
  });

  it('entering buffering state twice has no effect', () => {
    controller.setBuffering(true);
    expect(setPlayRateSpy).toHaveBeenCalledWith(0);

    // Reset the calls so that we can make sure it was not called again.
    setPlayRateSpy.calls.reset();

    controller.setBuffering(true);
    expect(setPlayRateSpy).not.toHaveBeenCalled();
  });

  it('leaving buffering state twice has no effect', () => {
    controller.setBuffering(true);
    controller.setBuffering(false);

    // Reset the calls so that we can make sure it was not called again.
    setPlayRateSpy.calls.reset();

    controller.setBuffering(false);
    expect(setPlayRateSpy).not.toHaveBeenCalled();
  });

  // When we set the rate while in a buffering state, we should see the new
  // rate be used once we leave the buffering state.
  it('set takes effect after buffering state ends', () => {
    controller.setBuffering(true);
    expect(setPlayRateSpy).toHaveBeenCalledWith(0);

    // Reset so that we can make sure it was not called after we call |set(4)|.
    setPlayRateSpy.calls.reset();

    controller.set(4);
    expect(setPlayRateSpy).not.toHaveBeenCalled();

    controller.setBuffering(false);
    expect(setPlayRateSpy).toHaveBeenCalledWith(4);
  });

  // Make sure that when the playback rate set, if the new rate matches the
  // current rate, the controller will not set the rate on the media element.
  it('does not redundently set the playrate', ()=> {
    // Make sure we don't see the play rate change before and after we set the
    // rate on the controller.
    expect(setPlayRateSpy).not.toHaveBeenCalled();
    controller.set(1);
    expect(setPlayRateSpy).not.toHaveBeenCalled();
  });
});
