/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('TimeRangesUtils', () => {
  const TimeRangesUtils = shaka.media.TimeRangesUtils;

  describe('isBuffered', () => {
    it('still works when passed null', () => {
      expect(TimeRangesUtils.isBuffered(null, 10)).toBe(false);
    });

    it('still works with nothing buffered', () => {
      const b = createFakeBuffered([]);
      expect(TimeRangesUtils.isBuffered(b, 10)).toBe(false);
    });

    it('returns buffered when inside a single range', () => {
      const b = createFakeBuffered([{start: 10, end: 20}]);
      expect(TimeRangesUtils.isBuffered(b, 13)).toBe(true);
    });

    it('returns buffered when having a small gap', () => {
      const b = createFakeBuffered([{start: 10, end: 20}]);
      expect(TimeRangesUtils.isBuffered(b, 9, 1)).toBe(true);
    });

    // Ranges: [10-20], [30-40], [50-60]
    defineTest('returns false when before range', {time: 3, expected: false});
    defineTest('returns true inside first range', {time: 12, expected: true});
    defineTest('returns true when inside gap', {time: 22, expected: true});
    defineTest(
        'returns true when inside last range', {time: 57, expected: true});
    defineTest(
        'returns false when after last range', {time: 3, expected: false});

    /**
     * @param {string} name
     * @param {{time: number, expected: boolean}} data
     */
    function defineTest(name, data) {
      it(name, () => {
        const b = createFakeBuffered(
            [{start: 10, end: 20}, {start: 30, end: 40}, {start: 50, end: 60}]);
        expect(TimeRangesUtils.isBuffered(b, data.time)).toBe(data.expected);
      });
    }
  });

  describe('bufferedAheadOf', () => {
    it('still works when passed null', () => {
      expect(TimeRangesUtils.bufferedAheadOf(null, 10)).toBe(0);
    });

    it('still works when nothing is buffered', () => {
      const b = createFakeBuffered([]);
      expect(TimeRangesUtils.bufferedAheadOf(b, 10)).toBe(0);
    });


    // Ranges: [10-20], [30-40], [50-60]
    defineTest(
        'returns total when before first range', {time: 0, expected: 30});
    defineTest(
        'gives partial amount for first range', {time: 12, expected: 28});
    defineTest('skips over first gap', {time: 25, expected: 20});
    defineTest(
        'gives partial amount for middle range', {time: 35, expected: 15});
    defineTest('skips over last gap', {time: 45, expected: 10});
    defineTest('gives partial amount for last range', {time: 55, expected: 5});
    defineTest('returns 0 when past end', {time: 65, expected: 0});

    /**
     * @param {string} name
     * @param {{time: number, expected: number}} data
     */
    function defineTest(name, data) {
      it(name, () => {
        const b = createFakeBuffered(
            [{start: 10, end: 20}, {start: 30, end: 40}, {start: 50, end: 60}]);
        expect(TimeRangesUtils.bufferedAheadOf(
            b, data.time)).toBe(data.expected);
      });
    }
  });

  describe('getGapIndex', () => {
    it('still works when passed null', () => {
      expect(TimeRangesUtils.getGapIndex(null, 10)).toBe(null);
    });

    it('still works whith nothing buffered', () => {
      const b = createFakeBuffered([]);
      expect(TimeRangesUtils.getGapIndex(b, 10)).toBe(null);
    });


    // Ranges: [10-20], [30-40], [50-60]
    defineTest('returns 0 when before first range', {time: 0, expected: 0});
    defineTest('ignores when inside first range', {time: 12, expected: null});
    defineTest(
        'returns index when near end of first range',
        {time: 19.95, expected: 1});
    defineTest('returns index when inside first gap', {time: 25, expected: 1});
    defineTest('ignores when inside middle range', {time: 35, expected: null});
    defineTest(
        'returns index when near end of middle range',
        {time: 39.95, expected: 2});
    defineTest('returns index when inside last gap', {time: 45, expected: 2});
    defineTest('ignores when inside last range', {time: 55, expected: null});
    defineTest('ignores when past end', {time: 65, expected: null});

    /**
     * @param {string} name
     * @param {{time: number, expected: ?number}} data
     */
    function defineTest(name, data) {
      it(name, () => {
        const b = createFakeBuffered(
            [{start: 10, end: 20}, {start: 30, end: 40}, {start: 50, end: 60}]);
        expect(TimeRangesUtils.getGapIndex(b, data.time)).toBe(data.expected);
      });
    }
  });
});
