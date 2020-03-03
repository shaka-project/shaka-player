/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SegmentIndex', /** @suppress {accessControls} */ () => {
  const actual1 = makeReference(0, 0, 10, uri(0));
  const actual2 = makeReference(1, 10, 20, uri(20));
  const actual3 = makeReference(2, 20, 30, uri(20));

  describe('seek', () => {
    it('finds the correct references', () => {
      // One reference.
      let index = new shaka.media.SegmentIndex([actual1]);
      let ref1 = index.seek(5);
      expect(ref1).toBe(actual1);

      // Two references.
      index = new shaka.media.SegmentIndex([actual1, actual2]);
      ref1 = index.seek(5);
      let ref2 = index.seek(15);
      expect(ref1).toBe(actual1);
      expect(ref2).toBe(actual2);

      // Three references.
      index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      ref1 = index.seek(5);
      ref2 = index.seek(15);
      const ref3 = index.seek(25);
      expect(ref1).toBe(actual1);
      expect(ref2).toBe(actual2);
      expect(ref3).toBe(actual3);
    });

    it('works if time == first start time', () => {
      const actual = makeReference(1, 10, 20, uri(10));
      const index = new shaka.media.SegmentIndex([actual]);

      const ref = index.seek(10);
      expect(ref).toBe(actual);
    });

    it('works with two references if time == second start time', () => {
      const actual1 = makeReference(1, 10, 20, uri(10));
      const actual2 = makeReference(2, 20, 30, uri(20));
      const index = new shaka.media.SegmentIndex([actual1, actual2]);

      const ref = index.seek(20);
      expect(ref).toBe(actual2);
    });

    it('returns the first segment if time < first start time', () => {
      const actual = makeReference(1, 10, 20, uri(10));
      const index = new shaka.media.SegmentIndex([actual]);

      const ref = index.seek(5);
      expect(ref).toBe(actual);
    });

    it('returns null if time == last end time', () => {
      const actual = makeReference(1, 10, 20, uri(10));
      const index = new shaka.media.SegmentIndex([actual]);

      const ref = index.seek(20);
      expect(ref).toBeNull();
    });

    it('returns null if time > last end time', () => {
      const actual = makeReference(1, 10, 20, uri(10));
      const index = new shaka.media.SegmentIndex([actual]);

      const ref = index.seek(21);
      expect(ref).toBeNull();
    });

    it('returns null if time is within a gap', () => {
      const actual1 = makeReference(1, 10, 20, uri(10));
      const actual2 = makeReference(2, 25, 30, uri(25));
      const index = new shaka.media.SegmentIndex([actual1, actual2]);

      const ref = index.seek(23);
      expect(ref).toBeNull();
    });
  });

  describe('fit', () => {
    it('drops references which are outside the period bounds', () => {
      // These negative numbers can occur due to presentationTimeOffset in DASH.
      const references = [
        makeReference(0, -10, -3, uri(0)),
        makeReference(1, -3, 4, uri(1)),
        makeReference(2, 4, 11, uri(2)),
        makeReference(3, 11, 18, uri(3)),
        makeReference(4, 18, 25, uri(4)),
      ];
      const index = new shaka.media.SegmentIndex(references);
      expect(index.references_).toEqual(references);

      index.fit(/* periodStart= */ 0, /* periodEnd= */ 15);
      const newReferences = [
        /* ref 0 dropped because it ends before the period starts */
        makeReference(1, -3, 4, uri(1)),
        makeReference(2, 4, 11, uri(2)),
        makeReference(3, 11, 15, uri(3)),  // end time clamped to period
        /* ref 4 dropped because it starts after the period ends */
      ];
      expect(index.references_).toEqual(newReferences);
    });

    it('drops references which end exactly at zero', () => {
      // The end time is meant to be exclusive, so segments ending at zero
      // (after PTO adjustments) should be dropped.
      const references = [
        makeReference(0, -10, 0, uri(0)),
        makeReference(1, 0, 10, uri(1)),
      ];
      const index = new shaka.media.SegmentIndex(references);
      expect(index.references_).toEqual(references);

      index.fit(/* periodStart= */ 0, /* periodEnd= */ 10);
      const newReferences = [
        /* ref 0 dropped because it ends before the period starts (at 0) */
        makeReference(1, 0, 10, uri(1)),
      ];
      expect(index.references_).toEqual(newReferences);
    });
  });

  describe('merge', () => {
    it('three references into zero references', () => {
      const index1 = new shaka.media.SegmentIndex([]);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [actual1, actual2, actual3];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_).toEqual(references2);
    });

    it('zero references into three references', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [actual1, actual2, actual3];
      const index1 = new shaka.media.SegmentIndex(references1);

      index1.merge([]);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_).toEqual(references1);
    });

    it('one reference into one reference at end', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [makeReference(1, 10, 20, uri(10))];
      const index1 = new shaka.media.SegmentIndex(references1);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [makeReference(2, 20, 30, uri(20))];

      index1.merge(references2);
      expect(index1.references_.length).toBe(2);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
    });

    it('one reference into two references at end', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20)),
      ];
      const index1 = new shaka.media.SegmentIndex(references1);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [makeReference(3, 30, 40, uri(30))];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references1[1]);
      expect(index1.references_[2]).toEqual(references2[0]);
    });

    it('two references into one reference at end', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [makeReference(2, 20, 30, uri(20))];
      const index1 = new shaka.media.SegmentIndex(references1);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [
        makeReference(3, 30, 40, uri(30)),
        makeReference(4, 40, 50, uri(40)),
      ];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
      expect(index1.references_[2]).toEqual(references2[1]);
    });

    it('last live stream reference when period change', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20)),
        makeReference(3, 30, 49.887, uri(30)),
      ];
      const index1 = new shaka.media.SegmentIndex(references1);

      // When the period is changed, fit() will expand last segment to the start
      // of the next the period.  This simulates an update in which fit() has
      // done that.
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [
        makeReference(2, 20, 30, uri(20)),
        makeReference(3, 30, 50, uri(30)),
      ];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
      expect(index1.references_[2]).toEqual(references2[1]);
    });
  });

  describe('evict', () => {
    /** @type {!shaka.media.SegmentIndex} */
    let index1;

    beforeEach(() => {
      index1 = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
    });

    it('no segments', () => {
      index1.evict(5);
      expect(index1.references_.length).toBe(3);
    });

    it('one segment (edge)', () => {
      index1.evict(10);

      expect(index1.references_.length).toBe(2);
      expect(index1.references_[0]).toEqual(actual2);
      expect(index1.references_[1]).toEqual(actual3);
    });

    it('one segment', () => {
      index1.evict(11);

      expect(index1.references_.length).toBe(2);
      expect(index1.references_[0]).toEqual(actual2);
      expect(index1.references_[1]).toEqual(actual3);
    });

    it('two segments (edge)', () => {
      index1.evict(20);

      expect(index1.references_.length).toBe(1);
      expect(index1.references_[0]).toEqual(actual3);
    });

    it('two segments', () => {
      index1.evict(21);

      expect(index1.references_.length).toBe(1);
      expect(index1.references_[0]).toEqual(actual3);
    });

    it('three segments (edge)', () => {
      index1.evict(30);
      expect(index1.references_.length).toBe(0);
    });

    it('three segments', () => {
      index1.evict(31);
      expect(index1.references_.length).toBe(0);
    });
  });

  /**
   * Creates a new SegmentReference.
   *
   * @param {number} position
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} uri
   * @return {!shaka.media.SegmentReference}
   */
  function makeReference(position, startTime, endTime, uri) {
    return new shaka.media.SegmentReference(
        position, startTime, endTime,
        /* getUris= */ () => [uri],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity);
  }

  /**
   * Creates a URI string.
   *
   * @param {number} x
   * @return {string}
   */
  function uri(x) {
    return 'http://example.com/video_' + x + '.m4s';
  }
});

