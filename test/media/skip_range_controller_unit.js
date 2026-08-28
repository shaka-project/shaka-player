/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SkipRangeController', () => {
  /**
   * A PlayerInterface with the given overrides.
   *
   * @param {!Object=} overrides
   * @return {!shaka.media.SkipRangeController.PlayerInterface}
   */
  function makeInterface(overrides = {}) {
    return /** @type {!shaka.media.SkipRangeController.PlayerInterface} */ (
      Object.assign({
        requestUpdate: () => {},
        getPlaybackRate: () => 1,
        isRegionBuffered: (start, end) => false,
      }, overrides));
  }

  /**
   * @param {!shaka.media.SkipRangeController.PlayerInterface} playerInterface
   * @return {!shaka.media.SkipRangeController}
   */
  function makeController(playerInterface) {
    return new shaka.media.SkipRangeController(playerInterface);
  }

  /**
   * getRangeAt() that asserts a range was found, for callers that need a
   * non-null range.
   *
   * @param {!shaka.media.SkipRangeController} controller
   * @param {number} time
   * @return {!shaka.media.SkipRangeController.SkipRange}
   */
  function getRange(controller, time) {
    const region = controller.getRangeAt(time);
    expect(region).not.toBe(null);
    return /** @type {!shaka.media.SkipRangeController.SkipRange} */ (region);
  }

  /**
   * A minimal segment reference (only the fields resolveAlignment reads).
   *
   * @param {number} startTime
   * @param {number} endTime
   * @return {!shaka.media.SegmentReference}
   */
  function seg(startTime, endTime) {
    return /** @type {!shaka.media.SegmentReference} */ ({startTime, endTime});
  }

  /**
   * Resolves |region| as aligned to boundaries [start, end): a segment starts
   * at start, and a segment starts at end.
   *
   * @param {!shaka.media.SkipRangeController} controller
   * @param {!shaka.media.SkipRangeController.SkipRange} region
   * @param {number} start
   * @param {number} end
   */
  function markAligned(controller, region, start, end) {
    controller.resolveAlignment(
        region, seg(start, start + 1), seg(end, end + 1));
  }

  /**
   * Resolves |region| as misaligned (no segment starts/ends at its boundaries).
   *
   * @param {!shaka.media.SkipRangeController} controller
   * @param {!shaka.media.SkipRangeController.SkipRange} region
   */
  function markMisaligned(controller, region) {
    // Segments straddling both endpoints -> neither boundary aligns.
    controller.resolveAlignment(
        region,
        seg(region.start - 1, region.start + 1),
        seg(region.end - 1, region.end + 1));
  }

  describe('interval logic', () => {
    /** @type {!shaka.media.SkipRangeController} */
    let controller;

    beforeEach(() => {
      controller = makeController(makeInterface());
    });

    it('records ranges and answers queries', () => {
      expect(controller.add(10, 20)).toBe(true);
      expect(controller.add(30, 40)).toBe(true);
      expect(controller.getAll()).toEqual([
        {start: 10, end: 20},
        {start: 30, end: 40},
      ]);
      expect(controller.isEmpty()).toBe(false);
    });

    it('rejects an empty or reversed interval', () => {
      expect(controller.add(20, 20)).toBe(false);
      expect(controller.add(30, 10)).toBe(false);
      expect(controller.getAll()).toEqual([]);
      expect(controller.isEmpty()).toBe(true);
    });

    it('merges an overlapping or touching range', () => {
      expect(controller.add(10, 30)).toBe(true);
      expect(controller.add(20, 40)).toBe(true);  // overlaps -> merges
      expect(controller.getAll()).toEqual([{start: 10, end: 40}]);
      expect(controller.add(40, 50)).toBe(true);  // touches at the edge
      expect(controller.getAll()).toEqual([{start: 10, end: 50}]);
    });

    it('removes a whole range matched by start/end', () => {
      controller.add(10, 20);
      controller.add(30, 40);
      controller.remove(10, 20);
      expect(controller.getAll()).toEqual([{start: 30, end: 40}]);
    });

    it('clears all ranges', () => {
      controller.add(10, 20);
      controller.add(30, 40);
      controller.clear();
      expect(controller.getAll()).toEqual([]);
    });
  });

  describe('getRangeAt', () => {
    /** @type {!shaka.media.SkipRangeController} */
    let controller;

    beforeEach(() => {
      controller = makeController(makeInterface());
      controller.add(10, 20);
      controller.add(30, 40);
    });

    it('returns the containing range or null', () => {
      expect(controller.getRangeAt(15)).toEqual({start: 10, end: 20});
      expect(controller.getRangeAt(10)).toEqual({start: 10, end: 20});
      expect(controller.getRangeAt(20)).toBe(null);  // end is exclusive
      expect(controller.getRangeAt(25)).toBe(null);
    });

    it('matches within tolerance on both sides of a boundary', () => {
      // A segment starting a hair below the range start still counts as inside,
      // so a slightly-off boundary doesn't leak a whole segment.
      expect(controller.getRangeAt(9.9995)).toEqual({start: 10, end: 20});
      // A segment starting a hair below the range end is treated as *at* the
      // end (the first kept segment), not inside -- nothing extra is dropped.
      expect(controller.getRangeAt(19.9995)).toBe(null);
      // Times clearly outside tolerance stay outside.
      expect(controller.getRangeAt(9.5)).toBe(null);
      expect(controller.getRangeAt(19)).toEqual({start: 10, end: 20});
    });
  });

  describe('containingActiveRange', () => {
    /** @type {!shaka.media.SkipRangeController} */
    let controller;

    beforeEach(() => {
      controller = makeController(makeInterface());
      controller.add(10, 30);
      // Confirm the range aligns to segment boundaries (the video grid does
      // this in StreamingEngine); only then may it be carved.
      markAligned(controller, getRange(controller, 10), 10, 30);
    });

    it('returns the range for a segment that fits inside it', () => {
      // A [10,20) segment sits within the range and can be dropped.
      expect(controller.containingActiveRange(10, 20))
          .toEqual({start: 10, end: 30});
    });

    it('returns null for a segment spanning past the range end', () => {
      // A single segment [12,40) starts inside the range but extends past its
      // end: it can't be carved into a partial hole, so it is not skippable
      // (streamed normally instead of stalling).
      expect(controller.containingActiveRange(12, 40)).toBe(null);
    });

    it('returns null when no range applies', () => {
      expect(controller.containingActiveRange(50, 60)).toBe(null);
    });

    it('returns null until the range is resolved alignable', () => {
      // A freshly added range is unresolved and must not be carved by any
      // stream until the video grid confirms its alignment.
      const c = makeController(makeInterface());
      c.add(10, 30);
      expect(c.containingActiveRange(10, 20)).toBe(null);
      markAligned(c, getRange(c, 10), 10, 30);
      expect(c.containingActiveRange(10, 20)).toEqual({start: 10, end: 30});
    });

    it('returns null for a range marked unalignable', () => {
      const c = makeController(makeInterface());
      c.add(10, 30);
      markMisaligned(c, getRange(c, 10));
      expect(c.containingActiveRange(10, 20)).toBe(null);
    });

    it('is INDEPENDENT of buffer state', () => {
      // The skip/discard decision must not consult isRegionBuffered, or the
      // first in-range append would flip the range "buffered" and let every
      // later in-range segment through (the seek-into-range stall).  So a
      // segment inside the range is still skippable even when the region reads
      // fully buffered.
      const buffered = makeController(makeInterface({
        isRegionBuffered: (start, end) => true,
      }));
      buffered.add(10, 30);
      markAligned(buffered, getRange(buffered, 10), 10, 30);
      expect(buffered.containingActiveRange(10, 20))
          .toEqual({start: 10, end: 30});
    });

    it('does not act during reverse playback', () => {
      const reverse = makeController(makeInterface({
        getPlaybackRate: () => -1,
      }));
      reverse.add(10, 30);
      expect(reverse.containingActiveRange(10, 20)).toBe(null);
    });
  });

  describe('merge on add', () => {
    /** @type {!shaka.media.SkipRangeController} */
    let controller;

    beforeEach(() => {
      controller = makeController(makeInterface());
    });

    it('coalesces an overlapping range', () => {
      controller.add(10, 20);
      controller.add(15, 30);
      expect(controller.getAll()).toEqual([{start: 10, end: 30}]);
    });

    it('coalesces a range touching within tolerance', () => {
      controller.add(10, 20);
      controller.add(20.0005, 30);  // gap < tolerance -> merges
      expect(controller.getAll()).toEqual([{start: 10, end: 30}]);
    });

    it('bridges two existing ranges into one', () => {
      controller.add(10, 20);
      controller.add(30, 40);
      controller.add(18, 33);  // spans the gap between both
      expect(controller.getAll()).toEqual([{start: 10, end: 40}]);
    });

    it('keeps a disjoint range separate', () => {
      controller.add(10, 20);
      controller.add(30, 40);  // gap >> tolerance
      expect(controller.getAll()).toEqual([
        {start: 10, end: 20},
        {start: 30, end: 40},
      ]);
    });

    it('keeps the set sorted after a merge', () => {
      controller.add(30, 40);
      controller.add(10, 20);
      controller.add(35, 50);  // merges with the later range
      expect(controller.getAll()).toEqual([
        {start: 10, end: 20},
        {start: 30, end: 50},
      ]);
    });
  });

  describe('split / trim on remove', () => {
    /** @type {!shaka.media.SkipRangeController} */
    let controller;

    beforeEach(() => {
      controller = makeController(makeInterface());
      controller.add(10, 30);
    });

    it('trims the left when removing a prefix', () => {
      controller.remove(10, 20);
      expect(controller.getAll()).toEqual([{start: 20, end: 30}]);
    });

    it('trims the right when removing a suffix', () => {
      controller.remove(20, 30);
      expect(controller.getAll()).toEqual([{start: 10, end: 20}]);
    });

    it('splits the range when removing from the middle', () => {
      controller.remove(15, 25);
      expect(controller.getAll()).toEqual([
        {start: 10, end: 15},
        {start: 25, end: 30},
      ]);
    });

    it('deletes the range when the removal covers it', () => {
      controller.remove(5, 35);
      expect(controller.getAll()).toEqual([]);
    });

    it('applies across several ranges at once', () => {
      controller.add(40, 60);
      controller.remove(20, 50);  // trims the first, trims the second
      expect(controller.getAll()).toEqual([
        {start: 10, end: 20},
        {start: 50, end: 60},
      ]);
    });

    it('snaps endpoints within tolerance so no sliver is left', () => {
      // A remove whose endpoints are a hair off the range boundaries should
      // still fully restore the range, not leave zero-width fragments.
      controller.remove(10.0005, 29.9995);
      expect(controller.getAll()).toEqual([]);
    });

    it('requests an update when the set changes', () => {
      const requestUpdate = jasmine.createSpy('requestUpdate');
      const c = makeController(makeInterface({requestUpdate}));
      c.add(10, 30);
      requestUpdate.calls.reset();
      c.remove(15, 25);
      expect(requestUpdate).toHaveBeenCalled();
    });

    it('does not request an update when nothing matches', () => {
      const requestUpdate = jasmine.createSpy('requestUpdate');
      const c = makeController(makeInterface({requestUpdate}));
      c.add(10, 30);
      requestUpdate.calls.reset();
      c.remove(100, 200);  // outside every range
      expect(requestUpdate).not.toHaveBeenCalled();
    });
  });

  describe('resolveAlignment', () => {
    /** @type {!shaka.media.SkipRangeController} */
    let controller;
    /** @type {!jasmine.Spy} */
    let warningLog;

    beforeEach(() => {
      controller = makeController(makeInterface());
      warningLog = spyOn(shaka.log, 'warning');
    });

    it('aligns and snaps when both endpoints land on boundaries', () => {
      controller.add(12.001, 13.999);
      const region = getRange(controller, 12.001);
      // Start segment begins at 12; end segment begins at 14.
      controller.resolveAlignment(region, seg(12.0, 14.0), seg(14.0, 16.0));
      expect(controller.isUnalignable(region)).toBe(false);
      expect(controller.getAll()).toEqual([{start: 12.0, end: 14.0}]);
      expect(controller.containingActiveRange(12.0, 13.0))
          .toEqual({start: 12.0, end: 14.0});
      expect(warningLog).not.toHaveBeenCalled();
    });

    it('aligns when the end is a segment back boundary', () => {
      controller.add(12.0, 14.0);
      const region = getRange(controller, 12.0);
      // No segment starts at 14, but the segment covering 14 ends at 14.
      controller.resolveAlignment(region, seg(12.0, 14.0), seg(14.0, 16.0));
      expect(controller.isUnalignable(region)).toBe(false);
    });

    it('is unalignable when the start is mid-segment (and warns once)', () => {
      controller.add(15, 30);
      const region = getRange(controller, 15);
      // Start 15 falls inside [10,20); no boundary there.
      controller.resolveAlignment(region, seg(10, 20), seg(30, 40));
      expect(controller.isUnalignable(region)).toBe(true);
      expect(controller.containingActiveRange(15, 20)).toBe(null);
      expect(warningLog).toHaveBeenCalledTimes(1);
    });

    it('is unalignable when the end is mid-segment', () => {
      controller.add(10, 25);
      const region = getRange(controller, 10);
      // End 25 falls inside [20,30): neither its start nor end is 25.
      controller.resolveAlignment(region, seg(10, 20), seg(20, 30));
      expect(controller.isUnalignable(region)).toBe(true);
    });

    it('aligns to a boundary below the endpoint, within tolerance', () => {
      // Endpoints a hair *below* the boundaries, as an ad server reporting
      // times truncated to milliseconds gives.
      controller.add(12.0333, 18.0666);
      const region = getRange(controller, 12.0333);
      controller.resolveAlignment(
          region,
          [seg(6.0, 12.033333), seg(12.033333, 18.066666)],
          [seg(12.033333, 18.066666), seg(18.066666, 24.1)]);
      expect(controller.isUnalignable(region)).toBe(false);
      expect(controller.getAll()).toEqual([
        {start: 12.033333, end: 18.066666},
      ]);
    });

    it('snaps to the closest boundary when two are within tolerance', () => {
      // 3.0 and 3.0008 are both within tolerance of start 3.0006, but 3.0008
      // is nearer and must win over the earlier-examined 3.0.
      controller.add(3.0006, 6.0);
      const region = getRange(controller, 3.0006);
      controller.resolveAlignment(
          region,
          [seg(2.0, 3.0), seg(3.0, 3.0008), seg(3.0008, 6.0)],
          [seg(3.0008, 6.0), seg(6.0, 9.0)]);
      expect(controller.getAll()).toEqual([{start: 3.0008, end: 6.0}]);
    });

    it('keeps the set sorted after snapping', () => {
      controller.add(30, 40);
      controller.add(10.0005, 20);  // start a hair off the 10.0 boundary
      const region = getRange(controller, 10.0005);
      controller.resolveAlignment(region, seg(10.0, 12.0), seg(20.0, 22.0));
      expect(controller.getAll()).toEqual([
        {start: 10.0, end: 20.0},
        {start: 30, end: 40},
      ]);
    });

    it('does not leak alignment bookkeeping into getAll', () => {
      controller.add(12.0, 14.0);
      const region = getRange(controller, 12.0);
      controller.resolveAlignment(region, seg(12.0, 14.0), seg(14.0, 16.0));
      expect(controller.getAll()).toEqual([{start: 12.0, end: 14.0}]);
      expect(Object.keys(controller.getAll()[0]).sort()).toEqual(
          ['end', 'start']);
    });
  });

  describe('activeRangeAt / timeNeededPast', () => {
    it('acts on a range while it is unbuffered', () => {
      const controller = makeController(makeInterface({
        isRegionBuffered: (start, end) => false,
      }));
      controller.add(10, 20);
      expect(controller.activeRangeAt(15)).toEqual({start: 10, end: 20});
      expect(controller.timeNeededPast(15)).toBe(20);
      expect(controller.timeNeededPast(25)).toBe(25);  // outside any range
    });

    it('goes inert while any of the range is buffered', () => {
      const controller = makeController(makeInterface({
        isRegionBuffered: (start, end) => true,
      }));
      controller.add(10, 20);
      // The range is recorded, but buffered content makes it inert: no skip and
      // no run-ahead jump, so streaming plays through instead of stalling.
      expect(controller.activeRangeAt(15)).toBe(null);
      expect(controller.timeNeededPast(15)).toBe(15);
    });

    it('does not act during reverse playback', () => {
      const controller = makeController(makeInterface({
        getPlaybackRate: () => -1,
        isRegionBuffered: (start, end) => false,
      }));
      controller.add(10, 20);
      expect(controller.activeRangeAt(15)).toBe(null);
      expect(controller.timeNeededPast(15)).toBe(15);
    });
  });

  describe('accepts regardless of buffering', () => {
    // The controller never consults the buffer: a range is always recorded and
    // always removable.  Whether the skip actually forms a gap is decided by
    // the streaming side, once the region's span is clear.

    it('records a range even if it is already buffered', () => {
      const controller = makeController(makeInterface());
      expect(controller.add(10, 30)).toBe(true);
      expect(controller.getAll()).toEqual([{start: 10, end: 30}]);
    });

    it('removes a range even after the hole is committed', () => {
      const controller = makeController(makeInterface());
      controller.add(10, 30);
      controller.remove(10, 30);
      expect(controller.getAll()).toEqual([]);
    });

    it('requests an update when a range is accepted', () => {
      const requestUpdate = jasmine.createSpy('requestUpdate');
      const controller = makeController(makeInterface({requestUpdate}));
      controller.add(10, 30);
      expect(requestUpdate).toHaveBeenCalled();
    });

    it('does not request an update when a range is rejected', () => {
      const requestUpdate = jasmine.createSpy('requestUpdate');
      const controller = makeController(makeInterface({requestUpdate}));
      controller.add(30, 10);  // reversed -> rejected
      expect(requestUpdate).not.toHaveBeenCalled();
    });
  });
});
