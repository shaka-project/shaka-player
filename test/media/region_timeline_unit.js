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

describe('RegionTimeline', () => {
  /** @type {!shaka.media.RegionTimeline} */
  let timeline;

  /** @type {!jasmine.Spy} */
  let onNewRegion;

  beforeEach(() => {
    onNewRegion = jasmine.createSpy('onNewRegion');

    timeline = new shaka.media.RegionTimeline();
    timeline.setListeners(shaka.test.Util.spyFunc(onNewRegion));
  });

  afterEach(() => {
    timeline.release();
  });

  it('only fires added-event for unique regions', () => {
    const initialRegion = createRegion('my-region', 0, 10);
    const similarRegion = createRegion('my-region', 0, 10);

    // Have regions that only differ in one of the three parameters that are
    // used in the similarity check.
    const differentId = createRegion('my-other-region', 0, 10);
    const differentStartTime = createRegion('my-region', 5, 10);
    const differentEndTime = createRegion('my-region', 0, 5);

    // Make sure we are starting from a blank slate.
    expect(onNewRegion).toHaveBeenCalledTimes(0);

    // When we add a region, we should get an event.
    timeline.addRegion(initialRegion);
    expect(onNewRegion).toHaveBeenCalledTimes(1);

    // When we add a region that is similar to an existing region, we should
    // not see another event.
    timeline.addRegion(similarRegion);
    expect(onNewRegion).toHaveBeenCalledTimes(1);

    // We should see it called for each of our "slightly different" regions.
    timeline.addRegion(differentId);
    expect(onNewRegion).toHaveBeenCalledTimes(2);

    timeline.addRegion(differentStartTime);
    expect(onNewRegion).toHaveBeenCalledTimes(3);

    timeline.addRegion(differentEndTime);
    expect(onNewRegion).toHaveBeenCalledTimes(4);
  });

  it('stores only unique regions', () => {
    // Create a few regions, but only regions 1 and 3 are unique.
    const region1 = createRegion('my-region', 0, 10);
    const region2 = createRegion('my-region', 0, 10);
    const region3 = createRegion('my-region', 5, 10);

    timeline.addRegion(region1);
    timeline.addRegion(region2);
    timeline.addRegion(region3);

    const uniqueRegions = Array.from(timeline.regions());
    expect(uniqueRegions).toEqual([
      region1,
      region3,
    ]);
  });

  /**
   * @param {string} id
   * @param {number} startTimeSeconds
   * @param {number} endTimeSeconds
   * @return {shaka.extern.TimelineRegionInfo}
   */
  function createRegion(id, startTimeSeconds, endTimeSeconds) {
    return {
      schemeIdUri: id,
      value: '',
      startTime: startTimeSeconds,
      endTime: endTimeSeconds,
      id: '',
      eventElement: null,
    };
  }
});
