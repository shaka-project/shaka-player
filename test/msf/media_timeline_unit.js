/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.MediaTimeline', isMSFSupported, () => {
  /** @type {!shaka.msf.MediaTimeline} */
  let timeline;

  beforeEach(() => {
    timeline = new shaka.msf.MediaTimeline();
  });

  /**
   * @param {*} document
   * @return {!Uint8Array}
   */
  function encode(document) {
    return shaka.util.BufferUtils.toUint8(
        shaka.util.StringUtils.toUTF8(JSON.stringify(document)));
  }

  /**
   * @param {*} document
   * @param {boolean=} independent
   * @return {boolean}
   */
  function addObject(document, independent = true) {
    return timeline.addObject(encode(document), independent);
  }

  describe('explicit entry format', () => {
    it('maps a time to the location of the entry covering it', () => {
      addObject([
        [0, [0, 0], 1759924158381],
        [2002, [1, 0], 1759924160383],
        [4004, [2, 0], 1759924162385],
      ]);

      // Inside the second group, so the second group is what has to be
      // subscribed: starting at the third would skip the content asked for.
      expect(timeline.locationForTime(3)).toEqual(
          {group: BigInt(1), object: BigInt(0), subgroup: null});
      expect(timeline.locationForTime(4.004)).toEqual(
          {group: BigInt(2), object: BigInt(0), subgroup: null});
    });

    it('clamps a time before the first entry to the first entry', () => {
      addObject([[2002, [1, 0], 0], [4004, [2, 0], 0]]);

      expect(timeline.locationForTime(0)).toBe(null);
      expect(timeline.getStartTime()).toBe(2.002);
    });

    it('reports the range it covers', () => {
      addObject([[0, [0, 0], 0], [2002, [1, 0], 0], [4004, [2, 0], 0]]);

      expect(timeline.getStartTime()).toBe(0);
      expect(timeline.getEndTime()).toBe(4.004);
      expect(timeline.isEmpty()).toBe(false);
    });

    it('maps a location back to its media time', () => {
      addObject([[0, [0, 0], 0], [2002, [1, 0], 0]]);

      expect(timeline.timeForLocation(
          {group: BigInt(1), object: BigInt(0), subgroup: null})).toBe(2.002);
      expect(timeline.timeForLocation(
          {group: BigInt(9), object: BigInt(0), subgroup: null})).toBe(null);
    });

    it('reports the wallclock time, interpolated across a group', () => {
      addObject([[0, [0, 0], 1759924158381], [2002, [1, 0], 1759924160383]]);

      expect(timeline.wallClockForTime(0)).toBe(1759924158381);
      expect(timeline.wallClockForTime(1)).toBe(1759924159381);
    });

    it('reports no wallclock time when the publisher sent zero', () => {
      // MSF says a VOD asset, or a publisher that does not know, sends 0.
      addObject([[0, [0, 0], 0]]);

      expect(timeline.wallClockForTime(0)).toBe(null);
    });

    it('sorts records a publisher sent out of order', () => {
      addObject([[4004, [2, 0], 0], [0, [0, 0], 0], [2002, [1, 0], 0]]);

      expect(timeline.getStartTime()).toBe(0);
      expect(timeline.getEndTime()).toBe(4.004);
    });

    it('discards malformed records but keeps the rest', () => {
      const changed = addObject([
        [0, [0, 0], 0],
        'not a record',
        [2002, [1], 0], // Location is not a pair.
        [3003, [-1, 0], 0], // Group IDs are var ints, so never negative.
        [4004, [2.5, 0], 0], // Nor fractional.
        ['4004', [3, 0], 0], // The media time is a JSON Number.
        [6006, [4, 0], 0],
      ]);

      expect(changed).toBe(true);
      expect(timeline.getStartTime()).toBe(0);
      expect(timeline.getEndTime()).toBe(6.006);
      expect(timeline.locationForTime(6.006)).toEqual(
          {group: BigInt(4), object: BigInt(0), subgroup: null});
    });

    it('discards a document that is not JSON', () => {
      const bytes = shaka.util.BufferUtils.toUint8(
          shaka.util.StringUtils.toUTF8('{not json'));

      expect(timeline.addObject(bytes, /* independent= */ true)).toBe(false);
      expect(timeline.isEmpty()).toBe(true);
    });

    it('discards a document that is not an array', () => {
      expect(addObject({entries: []})).toBe(false);
      expect(timeline.isEmpty()).toBe(true);
    });
  });

  describe('updating', () => {
    it('adds to what it holds for an incremental object', () => {
      // MSF section 8.3: the Objects after the first in a Group carry only
      // the records that are new.
      addObject([[0, [0, 0], 0]], /* independent= */ true);
      addObject([[2002, [1, 0], 0]], /* independent= */ false);

      expect(timeline.getStartTime()).toBe(0);
      expect(timeline.getEndTime()).toBe(2.002);
    });

    it('replaces what it holds for an independent object', () => {
      // The first Object of each Group carries everything still accessible,
      // so a record missing from it has aged out and must not survive here.
      addObject([[0, [0, 0], 0], [2002, [1, 0], 0]]);
      addObject([[2002, [1, 0], 0], [4004, [2, 0], 0]]);

      expect(timeline.getStartTime()).toBe(2.002);
      expect(timeline.getEndTime()).toBe(4.004);
      expect(timeline.locationForTime(0)).toBe(null);
    });

    it('does not store a record twice', () => {
      addObject([[0, [0, 0], 0]], /* independent= */ true);
      addObject([[0, [0, 0], 0], [2002, [1, 0], 0]],
          /* independent= */ false);

      expect(timeline.getStartTime()).toBe(0);
      expect(timeline.getEndTime()).toBe(2.002);
      expect(timeline.locationForTime(0)).toEqual(
          {group: BigInt(0), object: BigInt(0), subgroup: null});
    });

    it('reports no change for an empty incremental object', () => {
      addObject([[0, [0, 0], 0]], /* independent= */ true);

      expect(addObject([], /* independent= */ false)).toBe(false);
      expect(timeline.getEndTime()).toBe(0);
    });

    it('empties itself for an empty independent object', () => {
      addObject([[0, [0, 0], 0]], /* independent= */ true);
      addObject([], /* independent= */ true);

      expect(timeline.isEmpty()).toBe(true);
    });
  });

  describe('template format', () => {
    beforeEach(() => {
      // The example from MSF section 8.4.1: 2002 ms per group, one group per
      // entry, wallclock advancing with media time.
      expect(timeline.setTemplate([0, 2002, [0, 0], [1, 0], 1759924158381,
        2002])).toBe(true);
    });

    it('extrapolates a location for any time', () => {
      expect(timeline.locationForTime(0)).toEqual(
          {group: BigInt(0), object: BigInt(0), subgroup: null});
      expect(timeline.locationForTime(3)).toEqual(
          {group: BigInt(1), object: BigInt(0), subgroup: null});
      expect(timeline.locationForTime(100)).toEqual(
          {group: BigInt(49), object: BigInt(0), subgroup: null});
    });

    it('does not extrapolate before its own start', () => {
      expect(timeline.locationForTime(-10)).toEqual(
          {group: BigInt(0), object: BigInt(0), subgroup: null});
    });

    it('maps a location back to its media time', () => {
      expect(timeline.timeForLocation(
          {group: BigInt(2), object: BigInt(0), subgroup: null}))
          .toBe(2 * 2.002);
    });

    it('rejects a location the template does not describe', () => {
      expect(timeline.timeForLocation(
          {group: BigInt(2), object: BigInt(7), subgroup: null})).toBe(null);
    });

    it('reports a start but no end', () => {
      // A template extrapolates as far as it is asked to, so the live edge is
      // not its business.
      expect(timeline.getStartTime()).toBe(0);
      expect(timeline.getEndTime()).toBe(null);
    });

    it('reports the wallclock time', () => {
      expect(timeline.wallClockForTime(2.002)).toBe(1759924160383);
    });
  });

  describe('template validation', () => {
    it('rejects a template with too few values', () => {
      expect(timeline.setTemplate([0, 2002, [0, 0], [1, 0], 0])).toBe(false);
      expect(timeline.isEmpty()).toBe(true);
    });

    it('rejects a template whose location never advances', () => {
      // Every time would map to the same Object, so it describes nothing.
      expect(timeline.setTemplate([0, 2002, [0, 0], [0, 0], 0, 0]))
          .toBe(false);
    });

    it('rejects a template with a non-positive media time interval', () => {
      expect(timeline.setTemplate([0, 0, [0, 0], [1, 0], 0, 0])).toBe(false);
    });

    it('accepts a template that advances by object', () => {
      expect(timeline.setTemplate([0, 40, [3, 0], [0, 1], 0, 0])).toBe(true);
      expect(timeline.locationForTime(0.12)).toEqual(
          {group: BigInt(3), object: BigInt(3), subgroup: null});
    });
  });

  describe('explicit entries with a template', () => {
    beforeEach(() => {
      timeline.setTemplate([0, 2002, [0, 0], [1, 0], 0, 0]);
    });

    it('prefers an explicit record where there is one', () => {
      // The template predicts group 2 for this time; the records are
      // observations of what was actually published, so they win.
      addObject([[0, [0, 0], 0], [2002, [7, 0], 0], [4004, [8, 0], 0]]);

      expect(timeline.locationForTime(4.1)).toEqual(
          {group: BigInt(8), object: BigInt(0), subgroup: null});
    });

    it('falls back to the template before the first record', () => {
      addObject([[10010, [5, 0], 0]]);

      expect(timeline.locationForTime(2.5)).toEqual(
          {group: BigInt(1), object: BigInt(0), subgroup: null});
      // The window starts where the template says, since it claims that far
      // back is addressable.
      expect(timeline.getStartTime()).toBe(0);
    });
  });

  it('answers nothing when it knows nothing', () => {
    expect(timeline.isEmpty()).toBe(true);
    expect(timeline.getStartTime()).toBe(null);
    expect(timeline.getEndTime()).toBe(null);
    expect(timeline.locationForTime(5)).toBe(null);
    expect(timeline.wallClockForTime(5)).toBe(null);
    expect(timeline.timeForLocation(
        {group: BigInt(0), object: BigInt(0), subgroup: null})).toBe(null);
  });
});
