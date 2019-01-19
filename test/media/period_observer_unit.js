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

describe('PeriodObserver', () => {
  /** @type {shaka.extern.Manifest} */
  let manifest;

  /** @type {!jasmine.Spy} */
  let onPeriodChanged;

  /** @type {!shaka.media.PeriodObserver} */
  let observer;

  beforeEach(() => {
    onPeriodChanged = jasmine.createSpy('onPeriodChanged');

    manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
        .addPeriod(10)
        .addPeriod(20)
        .build();

    observer = new shaka.media.PeriodObserver(manifest);
    observer.setListeners(shaka.test.Util.spyFunc(onPeriodChanged));
  });

  afterEach(() => {
    observer.release();
  });

  // When we first update the playhead position, we should see a period changge
  // because we are entering our first period.
  it('first update calls callback', () => {
    // Our first period starts at time=0.
    poll(observer, 0);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[0]]);
  });

  it('does not call callback while in the same period', () => {
    // Start in period 0
    poll(observer, 0);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[0]]);

    // Playing in period 0 (period 1 starts at 10).
    for (let time = 1; time <= 9; time++) {
      poll(observer, time);
      expect(onPeriodChanged).not.toHaveBeenCalled();
    }
  });

  it('calls callback when changing to later period', () => {
    // Start in period 0
    poll(observer, 5);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[0]]);

    // "Play" into period 1
    poll(observer, 15);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[1]]);

    // "Play" into period 2
    poll(observer, 25);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[2]]);
  });

  it('calls callback when changing to previous period', () => {
    // Start in period 2
    poll(observer, 25);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[2]]);

    // "Play" into period 1
    poll(observer, 15);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[1]]);

    // "Play" into period 0
    poll(observer, 5);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[0]]);
  });

  it('calls callback once when seeking over Periods', () => {
    // Start in period 0
    poll(observer, 5);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[0]]);

    // Skip period 1 and "play" into period 2
    poll(observer, 25);
    expect(onPeriodChanged).toHaveBeenCalledOnceMoreWith([manifest.periods[2]]);
  });

  /**
   * @param {!shaka.media.IPlayheadObserver} observer
   * @param {number} inSeconds
   */
  function poll(observer, inSeconds) {
    observer.poll(
        /* position= */ inSeconds,
        /* seeking= */ false);
  }
});
