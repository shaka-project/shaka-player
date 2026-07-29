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

    it('rejects an overlapping or touching range', () => {
      expect(controller.add(10, 30)).toBe(true);
      expect(controller.add(20, 40)).toBe(false);  // overlaps
      expect(controller.add(30, 50)).toBe(false);  // touches at the edge
      expect(controller.getAll()).toEqual([{start: 10, end: 30}]);
    });

    it('removes a range matched by start/end', () => {
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
