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

describe('RegionObserver', () => {
  /** @type {!shaka.media.RegionTimeline} */
  let timeline;
  /** @type {!shaka.media.RegionObserver} */
  let observer;

  /** @type {!jasmine.Spy} */
  let onEnterRegion;
  /** @type {!jasmine.Spy} */
  let onExitRegion;
  /** @type {!jasmine.Spy} */
  let onSkipRegion;

  beforeEach(() => {
    onEnterRegion = jasmine.createSpy('onEnterRegion');
    onExitRegion = jasmine.createSpy('onExitRegion');
    onSkipRegion = jasmine.createSpy('onSkipRegion');

    timeline = new shaka.media.RegionTimeline();

    observer = new shaka.media.RegionObserver(timeline);
    observer.setListeners(
        /* onEnter= */ shaka.test.Util.spyFunc(onEnterRegion),
        /* onExit= */ shaka.test.Util.spyFunc(onExitRegion),
        /* onSkip= */ shaka.test.Util.spyFunc(onSkipRegion));
  });

  it('fires enter event when adding a region the playhead is in', () => {
    // Position us so that we will be in the middle of the region that we are
    // about to add.
    poll(observer,
        /* timeInSeconds= */ 5,
        /* seeking= */ false);

    const region = createRegion('my-region', 4, 6);
    timeline.addRegion(region);

    expect(onEnterRegion).not.toHaveBeenCalled();

    // Move to the same place, we should see the event fire even though we did
    // not have the region in the timeline previously.
    poll(observer,
        /* timeInSeconds= */ 5,
        /* seeking= */ false);

    expect(onEnterRegion).toHaveBeenCalledOnceMoreWith([region, false]);
  });

  it('fires enter event when entering region', () => {
    const region = createRegion('my-region', 5, 10);
    timeline.addRegion(region);

    // Make sure we call |onEnter| when we enter the region.
    poll(observer,
        /* timeInSeconds= */ 7,
        /* seeking */ false);
    expect(onEnterRegion).toHaveBeenCalledOnceMoreWith([region, false]);
  });

  it('does not fire events while in a region', () => {
    const region = createRegion('my-region', 5, 10);
    timeline.addRegion(region);

    // Make sure we call |onEnter| when we enter the region.
    poll(observer,
        /* timeInSeconds= */ 7,
        /* seeking */ false);
    expect(onEnterRegion).toHaveBeenCalledOnceMoreWith([region, false]);

    poll(observer,
        /* timeInSeconds= */ 8,
        /* seeking= */ false);
    expect(onEnterRegion).not.toHaveBeenCalled();
    expect(onExitRegion).not.toHaveBeenCalled();
    expect(onSkipRegion).not.toHaveBeenCalled();
  });

  it('fires exit event when leaving region', () => {
    const region = createRegion('my-region', 5, 10);
    timeline.addRegion(region);

    expect(onEnterRegion).not.toHaveBeenCalled();
    expect(onExitRegion).not.toHaveBeenCalled();

    // Move into the region (we must be in the region to leave it).
    poll(observer,
        /* timeInSeconds= */ 7,
        /* seeking */ false);

    // Make sure we call |onExit| when we exit the region.
    poll(observer,
        /* timeInSeconds= */ 15,
        /* seeking */ false);
    expect(onExitRegion).toHaveBeenCalledOnceMoreWith([region, false]);
  });

  it('fires skip event when we enter and leave region in one move', () => {
    const region = createRegion('my-region', 5, 10);
    timeline.addRegion(region);

    // Make sure we are before the region starts.
    poll(observer,
        /* timeInSeconds= */ 4,
        /* seeking */ false);
    expect(onSkipRegion).not.toHaveBeenCalled();

    // Make sure we call |onSkip| when we move so far that we skip over the
    // region.
    poll(observer,
        /* timeInSeconds= */ 15,
        /* seeking */ false);
    expect(onSkipRegion).toHaveBeenCalledOnceMoreWith([region, false]);
  });

  it('fires skip events for zero-duration regions', () => {
    // Make a region with no duration.
    const region = createRegion('my-region', 5, 5);
    timeline.addRegion(region);

    // Make sure we are before the region starts.
    poll(observer,
        /* timeInSeconds= */ 4,
        /* seeking */ false);
    expect(onSkipRegion).not.toHaveBeenCalled();

    // Make sure we call |onSkip| when we move so far that we skip over the
    // region.
    poll(observer,
        /* timeInSeconds= */ 10,
        /* seeking */ false);
    expect(onSkipRegion).toHaveBeenCalledOnceMoreWith([region, false]);
  });

  // We want to simulate a "normal" case of overlapping regions. For this we
  // will step up our timeline and then step through it in small steps so that
  // we will pass each boundary.
  it('fires correctly for overlapping regions', () => {
    // |---------|---------|---------|
    // |         |---1-----|         |
    // |           |-2-|             |
    // |                 |-3--|      |
    // |---------|---------|---------|
    //           10        20        30
    // 1: region
    // 2: nested
    // 3: overlap

    const region = createRegion('region', 10, 20);
    const nested = createRegion('nested', 12, 16);
    const overlap = createRegion('overlap', 18, 23);

    timeline.addRegion(region);
    timeline.addRegion(nested);
    timeline.addRegion(overlap);

    // Slowly move from time=0 to time=9. We should see nothing change.
    for (let time = 1; time <= 9; time++) {
      poll(observer,
          /* timeInSeconds= */ time,
          /* seeking= */ false);
      expect(onEnterRegion).not.toHaveBeenCalled();
      expect(onExitRegion).not.toHaveBeenCalled();
    }

    // Move forward one more (to time=10) and we should enter |region|.
    poll(observer,
        /* timeInSeconds= */ 10,
        /* seeking= */ false);
    expect(onEnterRegion).toHaveBeenCalledOnceMoreWith([region, false]);
    expect(onExitRegion).not.toHaveBeenCalled();

    // Nothing should change.
    poll(observer,
        /* timeInSeconds= */ 11,
        /* seeking= */ false);
    expect(onEnterRegion).not.toHaveBeenCalled();
    expect(onExitRegion).not.toHaveBeenCalled();

    // Moving to time=12, we should enter |nested|.
    poll(observer,
        /* timeInSeconds= */ 12,
        /* seeking= */ false);
    expect(onEnterRegion).toHaveBeenCalledOnceMoreWith([nested, false]);
    expect(onExitRegion).not.toHaveBeenCalled();

    // Slowly move from time=12 to time=16. We should see nothing change.
    for (let time = 13; time <= 16; time++) {
      poll(observer,
          /* timeInSeconds= */ time,
          /* seeking= */ false);
      expect(onEnterRegion).not.toHaveBeenCalled();
      expect(onExitRegion).not.toHaveBeenCalled();
    }

    // Moving to time=17, we should exit |nested|.
    poll(observer,
        /* timeInSeconds= */ 17,
        /* seeking= */ false);
    expect(onEnterRegion).not.toHaveBeenCalled();
    expect(onExitRegion).toHaveBeenCalledOnceMoreWith([nested, false]);

    // Moving to time=18, we should enter |overlap|.
    poll(observer,
        /* timeInSeconds= */ 18,
        /* seeking= */ false);
    expect(onEnterRegion).toHaveBeenCalledOnceMoreWith([overlap, false]);
    expect(onExitRegion).not.toHaveBeenCalled();

    // Slowly move from time=19 to time=20. We should see nothing change.
    for (let time = 19; time <= 20; time++) {
      poll(observer,
          /* timeInSeconds= */ time,
          /* seeking= */ false);
      expect(onEnterRegion).not.toHaveBeenCalled();
      expect(onExitRegion).not.toHaveBeenCalled();
    }

    // Moving to time=21, we should exit |region|.
    poll(observer,
        /* timeInSeconds= */ 21,
        /* seeking= */ false);
    expect(onEnterRegion).not.toHaveBeenCalled();
    expect(onExitRegion).toHaveBeenCalledOnceMoreWith([region, false]);

    // Nothing should change.
    // Slowly move from time=19 to time=20. We should see nothing change.
    for (let time = 22; time <= 23; time++) {
      poll(observer,
          /* timeInSeconds= */ time,
          /* seeking= */ false);
      expect(onEnterRegion).not.toHaveBeenCalled();
      expect(onExitRegion).not.toHaveBeenCalled();
    }

    // Moving to time=24, we should exit |overlap|.
    poll(observer,
        /* timeInSeconds= */ 24,
        /* seeking= */ false);
    expect(onEnterRegion).not.toHaveBeenCalled();
    expect(onExitRegion).toHaveBeenCalledOnceMoreWith([overlap, false]);

    // We should never have called the skip-region callback.
    expect(onSkipRegion).not.toHaveBeenCalled();
  });

  // When we move the playhead, we say whether the move is from a seek or from
  // normal playback. This flag should always be passed to the event. In our
  // tests we always pass "normal playback". This test should make sure that
  // the "seeking" flag is passed to each event.
  it('passes the seeking flag for each event', () => {
    const region = createRegion('my-region', 1, 3);
    timeline.addRegion(region);

    // Start before the region, move into the region, move out of the region,
    // and then skip over the region. All three events should have been fired.
    poll(observer,
        /* timeInSeconds= */ 0,
        /* seeking= */ true);

    poll(observer,
        /* timeInSeconds= */ 2,
        /* seeking= */ true);
    expect(onEnterRegion).toHaveBeenCalledWith(region, /* seeking= */ true);

    poll(observer,
        /* timeInSeconds= */ 4,
        /* seeking= */ true);
    expect(onExitRegion).toHaveBeenCalledWith(region, /* seeking= */ true);

    poll(observer,
        /* timeInSeconds= */ 0,
        /* seeking= */ true);
    expect(onSkipRegion).toHaveBeenCalledWith(region, /* seeking= */ true);
  });

  // The first call to |poll| sets the initial position of the playhead. If we
  // start the playhead after a region ends, we should not fire events for that
  // region.
  it('ignores regions the initial poll position when not seeking', () => {
    const region = createRegion('early-region', 0, 1);
    timeline.addRegion(region);

    // Start the playhead after the region ends.
    poll(observer, /* timeInSeconds= */ 2, /* seeking= */ false);
    expect(onEnterRegion).not.toHaveBeenCalled();
    expect(onExitRegion).not.toHaveBeenCalled();
    expect(onSkipRegion).not.toHaveBeenCalled();
  });

  // Just like the non-seeking version (see above), we should not see an event.
  // In practice, our initial poll will not be seeking, but it is worth
  // documenting this expectation.
  it('ignores regions the initial poll position when seeking', () => {
    const region = createRegion('early-region', 0, 1);
    timeline.addRegion(region);

    // Start the playhead after the region ends.
    poll(observer, /* timeInSeconds= */ 2, /* seeking= */ true);
    expect(onEnterRegion).not.toHaveBeenCalled();
    expect(onExitRegion).not.toHaveBeenCalled();
    expect(onSkipRegion).not.toHaveBeenCalled();
  });

  /**
   * @param {string} id
   * @param {number} startTimeSeconds
   * @param {number} endTimeSeconds
   * @return {shaka.extern.TimelineRegionInfo}
   */
  function createRegion(id, startTimeSeconds, endTimeSeconds) {
    return {
      schemeIdUri: 'urn:foo',
      id: id,
      value: '',
      startTime: startTimeSeconds,
      endTime: endTimeSeconds,
      eventElement: null,
    };
  }

  /**
   * @param {!shaka.media.IPlayheadObserver} observer
   * @param {number} timeInSeconds
   * @param {boolean} wasSeeking
   */
  function poll(observer, timeInSeconds, wasSeeking) {
    observer.poll(
        /* position= */ timeInSeconds,
        /* seeking= */ wasSeeking);
  }
});
