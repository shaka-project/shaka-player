/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SkipRangeController', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /**
   * A streaming PlayerInterface (two content types, nothing buffered) with the
   * given overrides.
   *
   * @param {!Object=} overrides
   * @return {!shaka.media.SkipRangeController.PlayerInterface}
   */
  function makeStreaming(overrides = {}) {
    return /** @type {!shaka.media.SkipRangeController.PlayerInterface} */ (
      Object.assign({
        getContentTypes: () => [ContentType.AUDIO, ContentType.VIDEO],
        isBuffered: (type, time) => false,
        bufferEnd: (type) => null,
        requestUpdate: () => {},
      }, overrides));
  }

  /** @return {!shaka.media.SkipRangeController.PlayerInterface} Pre-load. */
  function makeIdle() {
    return makeStreaming({getContentTypes: () => []});
  }

  /**
   * @param {!shaka.media.SkipRangeController.PlayerInterface} playerInterface
   * @return {!shaka.media.SkipRangeController}
   */
  function makeController(playerInterface) {
    return new shaka.media.SkipRangeController(playerInterface);
  }

  describe('interval logic (no streaming)', () => {
    /** @type {!shaka.media.SkipRangeController} */
    let controller;

    beforeEach(() => {
      controller = makeController(makeIdle());
    });

    it('records ranges and answers queries', () => {
      controller.add(10, 20);
      controller.add(30, 40);
      expect(controller.getAll()).toEqual([
        {start: 10, end: 20},
        {start: 30, end: 40},
      ]);
      expect(controller.isEmpty()).toBe(false);
    });

    it('rejects an empty or reversed interval', () => {
      controller.add(20, 20);
      controller.add(30, 10);
      expect(controller.getAll()).toEqual([]);
      expect(controller.isEmpty()).toBe(true);
    });

    it('rejects an overlapping or touching range', () => {
      controller.add(10, 30);
      controller.add(20, 40);  // overlaps
      controller.add(30, 50);  // touches at the edge
      expect(controller.getAll()).toEqual([{start: 10, end: 30}]);
    });

    it('does not run buffered checks when nothing is streaming', () => {
      // No content types, so the range is recorded without consulting the
      // buffer -- the pre-load queueing behavior.
      controller.add(10, 20);
      expect(controller.getAll()).toEqual([{start: 10, end: 20}]);
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

  describe('getRangeAt / getTimePast', () => {
    /** @type {!shaka.media.SkipRangeController} */
    let controller;

    beforeEach(() => {
      controller = makeController(makeIdle());
      controller.add(10, 20);
      controller.add(30, 40);
    });

    it('returns the containing range or null', () => {
      expect(controller.getRangeAt(15)).toEqual({start: 10, end: 20});
      expect(controller.getRangeAt(10)).toEqual({start: 10, end: 20});
      expect(controller.getRangeAt(20)).toBe(null);  // end is exclusive
      expect(controller.getRangeAt(25)).toBe(null);
    });

    it('advances a time past the range it falls in', () => {
      expect(controller.getTimePast(15)).toBe(20);
      expect(controller.getTimePast(35)).toBe(40);
      expect(controller.getTimePast(25)).toBe(25);  // outside any range
    });
  });

  describe('buffered checks while streaming', () => {
    it('rejects a range whose start is already buffered', () => {
      const controller = makeController(makeStreaming({
        isBuffered: (type, time) => time >= 10 && time < 20,
      }));
      controller.add(10, 30);
      expect(controller.getAll()).toEqual([]);
    });

    it('records a range that is not buffered', () => {
      const controller = makeController(makeStreaming());
      controller.add(10, 30);
      expect(controller.getAll()).toEqual([{start: 10, end: 30}]);
    });

    it('requests an update when a range is accepted', () => {
      const requestUpdate = jasmine.createSpy('requestUpdate');
      const controller = makeController(makeStreaming({requestUpdate}));
      controller.add(10, 30);
      expect(requestUpdate).toHaveBeenCalled();
    });

    it('does not request an update when a range is rejected', () => {
      const requestUpdate = jasmine.createSpy('requestUpdate');
      const controller = makeController(makeStreaming({requestUpdate}));
      controller.add(30, 10);  // reversed -> rejected
      expect(requestUpdate).not.toHaveBeenCalled();
    });

    it('ignores removal once the hole is committed', () => {
      // Buffer end is past the range start, so the hole is committed.
      const controller = makeController(
          makeStreaming({bufferEnd: (type) => 35}));
      controller.add(10, 30);
      controller.remove(10, 30);
      expect(controller.getAll()).toEqual([{start: 10, end: 30}]);
    });

    it('removes a range that is not yet buffered past', () => {
      const controller = makeController(
          makeStreaming({bufferEnd: (type) => 5}));
      controller.add(10, 30);
      controller.remove(10, 30);
      expect(controller.getAll()).toEqual([]);
    });
  });
});
