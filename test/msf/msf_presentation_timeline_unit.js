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

  it('puts the live edge on the newest segment end', () => {
    // The edge must not be held back: getSeekRangeEnd() derives from it, so
    // any margin here is latency the viewer pays, and it can drop the range
    // end below the earliest known segment and invert the seek range.
    notifySegment(1000, 0.021);

    expect(timeline.getSegmentAvailabilityEnd()).toBeCloseTo(1000.021, 6);
  });

  it('never inverts the seek range', () => {
    // Right after load only one segment is known, so the start is floored at
    // that segment's time.  If the end were pulled back behind it, seekRange()
    // would report a negative width.
    notifySegment(1000, 0.021);
    timeline.setSegmentAvailabilityDuration(1.5);

    expect(timeline.getSeekRangeEnd())
        .toBeGreaterThanOrEqual(timeline.getSeekRangeStart());
  });

  it('takes its window width from the availability duration', () => {
    // The parser floors this so the window can hold the playhead and the
    // trailing track; the timeline must not reimplement a second width.
    notifySegment(1000, 0.021);
    timeline.setSegmentAvailabilityDuration(1.5);

    const start = timeline.getSegmentAvailabilityStart();
    const end = timeline.getSegmentAvailabilityEnd();
    expect(end - start).toBeCloseTo(1.5, 6);
  });

  it('never reports a negative availability end', () => {
    timeline.setSegmentAvailabilityDuration(1.5);
    expect(timeline.getSegmentAvailabilityEnd()).toBe(0);
  });

  it('defers to the base class when static', () => {
    timeline.setStatic(true);
    notifySegment(1000, 0.021);
    expect(timeline.getSegmentAvailabilityStart()).toBe(0);
  });
});
