/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.MSFPresentationTimeline', isMSFSupported, () => {
  /** @type {!shaka.msf.MSFPresentationTimeline} */
  let timeline;

  beforeEach(() => {
    timeline = new shaka.msf.MSFPresentationTimeline();
    timeline.setStatic(false);
  });

  /**
   * Feeds the timeline one reference, the way MSFParser.addSegment_ does.
   *
   * @param {number} startTime
   * @param {number} duration
   */
  function notifySegment(startTime, duration) {
    const reference = new shaka.media.SegmentReference(
        startTime,
        startTime + duration,
        /* getUris= */ () => [],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity);
    timeline.notifySegments([reference]);
    timeline.notifyMaxSegmentDuration(duration);
  }

  it('holds the live edge behind the furthest-ahead stream', () => {
    // Audio published ahead of video, which is the normal case: the edge must
    // not sit on top of the leading track or the trailing one can never be
    // fetched.
    notifySegment(1000, 0.021);

    expect(timeline.getSegmentAvailabilityEnd())
        .toBeCloseTo(1000.021 - 0.5, 6);
  });

  it('keeps a window wide enough for a track arriving late', () => {
    notifySegment(1000, 0.021);

    const start = timeline.getSegmentAvailabilityStart();
    const end = timeline.getSegmentAvailabilityEnd();
    // One segment of headroom would be 21ms; a track that lands a few hundred
    // milliseconds later needs more than that.
    expect(end - start).toBeGreaterThanOrEqual(0.5);
  });

  it('lets a long segment duration widen the window further', () => {
    notifySegment(1000, 4);

    const start = timeline.getSegmentAvailabilityStart();
    const end = timeline.getSegmentAvailabilityEnd();
    expect(end - start).toBeCloseTo(4, 6);
  });

  it('never reports a negative availability end', () => {
    notifySegment(0.1, 0.021);
    expect(timeline.getSegmentAvailabilityEnd()).toBe(0);
  });

  it('defers to the base class when static', () => {
    timeline.setStatic(true);
    notifySegment(1000, 0.021);
    // The base class computes a static range from the duration, so the live
    // margin must not be applied.
    expect(timeline.getSegmentAvailabilityStart()).toBe(0);
  });
});
