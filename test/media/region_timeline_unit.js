/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
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

  it('stores unique scheme id uri', () => {
    // Add regions with unique scheme id uri
    timeline.addRegion(createRegion('urn:foo', 'my-region', 0, 10));
    timeline.addRegion(createRegion('urn:bar', 'my-region', 0, 10));
    expect(onNewRegion).toHaveBeenCalledTimes(2);
  });

  it('stores unique event id', () => {
    // Add regions with unique event id
    timeline.addRegion(createRegion('urn:foo', 'my-region-1', 0, 10));
    timeline.addRegion(createRegion('urn:foo', 'my-region-2', 0, 10));
    expect(onNewRegion).toHaveBeenCalledTimes(2);
  });

  it('stores unique start time', () => {
    // Add regions with unique start time
    timeline.addRegion(createRegion('urn:foo', 'my-region', 0, 10));
    timeline.addRegion(createRegion('urn:foo', 'my-region', 5, 10));
    expect(onNewRegion).toHaveBeenCalledTimes(2);
  });

  it('stores unique end time', () => {
    // Add regions with unique end time
    timeline.addRegion(createRegion('urn:foo', 'my-region', 0, 10));
    timeline.addRegion(createRegion('urn:foo', 'my-region', 0, 15));
    expect(onNewRegion).toHaveBeenCalledTimes(2);
  });

  it('dedups identical regions', () => {
    // Add two identical regions and verify only one is stored
    timeline.addRegion(createRegion('urn:foo', 'my-region', 0, 10));
    timeline.addRegion(createRegion('urn:foo', 'my-region', 0, 10));
    expect(onNewRegion).toHaveBeenCalledTimes(1);
  });

  it('verifies region data integrity', () => {
    // Add a few regions and verify data integrity
    const region1 = createRegion('urn:foo', 'my-region-1', 0, 10);
    const region2 = createRegion('urn:foo', 'my-region-2', 11, 20);
    const region3 = createRegion('urn:foo', 'my-region-3', 21, 30);

    timeline.addRegion(region1);
    timeline.addRegion(region2);
    timeline.addRegion(region3);

    const uniqueRegions = Array.from(timeline.regions());
    expect(uniqueRegions).toEqual([
      region1,
      region2,
      region3,
    ]);
  });

  /**
   * @param {string} schemeIdUri
   * @param {string} id
   * @param {number} startTimeSeconds
   * @param {number} endTimeSeconds
   * @return {shaka.extern.TimelineRegionInfo}
   */
  function createRegion(schemeIdUri, id, startTimeSeconds, endTimeSeconds) {
    return {
      schemeIdUri: schemeIdUri,
      id: id,
      value: '',
      startTime: startTimeSeconds,
      endTime: endTimeSeconds,
      eventElement: null,
    };
  }
});
