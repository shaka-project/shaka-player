/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('SegmentIndex', /** @suppress {accessControls} */ () => {
  const actual1 = makeReference(uri(0), 0, 10);
  const actual2 = makeReference(uri(20), 10, 20);
  const actual3 = makeReference(uri(20), 20, 30);

  describe('find', () => {
    it('finds the correct references', () => {
      // One reference.
      let index = new shaka.media.SegmentIndex([actual1]);
      let pos1 = index.find(5);
      expect(pos1).toBe(0);

      // Two references.
      index = new shaka.media.SegmentIndex([actual1, actual2]);
      pos1 = index.find(5);
      let pos2 = index.find(15);
      expect(pos1).toBe(0);
      expect(pos2).toBe(1);

      // Three references.
      index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      pos1 = index.find(5);
      pos2 = index.find(15);
      const pos3 = index.find(25);
      expect(pos1).toBe(0);
      expect(pos2).toBe(1);
      expect(pos3).toBe(2);
    });

    it('works if time == first start time', () => {
      const actual = makeReference(uri(10), 10, 20);
      const index = new shaka.media.SegmentIndex([actual]);

      const pos = index.find(10);
      goog.asserts.assert(pos != null, 'Null position!');
      const ref = index.get(pos);
      expect(ref).toBe(actual);
    });

    it('works with two references if time == second start time', () => {
      const actual1 = makeReference(uri(10), 10, 20);
      const actual2 = makeReference(uri(20), 20, 30);
      const index = new shaka.media.SegmentIndex([actual1, actual2]);

      const pos = index.find(20);
      goog.asserts.assert(pos != null, 'Null position!');
      const ref = index.get(pos);
      expect(ref).toBe(actual2);
    });

    it('works with two references if time == first end time', () => {
      const actual1 = makeReference(uri(10), 10, 20.12);
      const actual2 = makeReference(uri(20), 20.13, 30);
      const index = new shaka.media.SegmentIndex([actual1, actual2]);

      const pos = index.find(20.12);
      goog.asserts.assert(pos != null, 'Null position!');
      const ref = index.get(pos);
      expect(ref).toBe(actual1);
    });

    it('works with time is between first endTime and second startTime', () => {
      const actual1 = makeReference(uri(10), 10, 20.12111);
      const actual2 = makeReference(uri(20), 20.12113, 30);
      const index = new shaka.media.SegmentIndex([actual1, actual2]);

      const pos = index.find(20.12112);
      goog.asserts.assert(pos != null, 'Null position!');
      const ref = index.get(pos);
      expect(ref).toBe(actual1);
    });

    it('returns the first segment if time < first start time', () => {
      const actual = makeReference(uri(10), 10, 20);
      const index = new shaka.media.SegmentIndex([actual]);

      const pos = index.find(5);
      goog.asserts.assert(pos != null, 'Null position!');
      const ref = index.get(pos);
      expect(ref).toBe(actual);
    });

    it('returns null if time == last end time', () => {
      const actual = makeReference(uri(10), 10, 20);
      const index = new shaka.media.SegmentIndex([actual]);

      const pos = index.find(20);
      expect(pos).toBeNull();
    });

    it('returns null if time > last end time', () => {
      const actual = makeReference(uri(10), 10, 20);
      const index = new shaka.media.SegmentIndex([actual]);

      const pos = index.find(21);
      expect(pos).toBeNull();
    });
  });

  describe('get', () => {
    it('returns the correct references', () => {
      // One reference.
      let index = new shaka.media.SegmentIndex([actual1]);
      let r1 = index.get(0);
      expect(r1).toEqual(actual1);

      // Two references.
      index = new shaka.media.SegmentIndex([actual1, actual2]);
      r1 = index.get(0);
      let r2 = index.get(1);
      expect(r1).toEqual(actual1);
      expect(r2).toEqual(actual2);

      // Three references.
      index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      r1 = index.get(0);
      r2 = index.get(1);
      let r3 = index.get(2);
      expect(r1).toEqual(actual1);
      expect(r2).toEqual(actual2);
      expect(r3).toEqual(actual3);

      // Two references with offset.
      index = new shaka.media.SegmentIndex([actual2, actual3]);
      r2 = index.get(0);
      r3 = index.get(1);
      expect(r2).toEqual(actual2);
      expect(r3).toEqual(actual3);

      // One reference with offset.
      index = new shaka.media.SegmentIndex([actual3]);
      r3 = index.get(0);
      expect(r3).toEqual(actual3);
    });

    it('returns null with zero references', () => {
      const index = new shaka.media.SegmentIndex([]);
      expect(index.get(0)).toBeNull();
    });

    it('returns null if position < 0', () => {
      const index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      expect(index.get(-1)).toBeNull();
    });

    it('returns null for unknown positions', () => {
      const index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      expect(index.get(3)).toBeNull();
      expect(index.get(-1)).toBeNull();
    });
  });

  describe('fit', () => {
    it('clamps references to the window bounds', () => {
      // These negative numbers can occur due to presentationTimeOffset in DASH.
      const references = [
        makeReference(uri(0), -10, -3),
        makeReference(uri(1), -3, 4),
        makeReference(uri(2), 4, 11),
        makeReference(uri(3), 11, 18),
        makeReference(uri(4), 18, 25),
      ];
      const index = new shaka.media.SegmentIndex(references);
      expect(index.references).toEqual(references);

      // Get the position and reference of the segment at time 5.
      const positionAtTimeFive = index.find(5);
      goog.asserts.assert(positionAtTimeFive != null, 'Null position!');
      const referenceAtTimeFive = index.get(positionAtTimeFive);

      index.fit(/* windowStart= */ 0, /* windowEnd= */ 15);
      const newReferences = [
        /* ref 0 dropped because it ends before the period starts */
        makeReference(uri(1), -3, 4),
        makeReference(uri(2), 4, 11),
        makeReference(uri(3), 11, 15),  // end time clamped to period
        /* ref 4 dropped because it starts after the period ends */
      ];
      expect(index.references).toEqual(newReferences);

      // The position used to represent this segment should not have changed.
      expect(index.find(5)).toBe(positionAtTimeFive);
      expect(index.get(positionAtTimeFive)).toBe(referenceAtTimeFive);
    });

    it('drops references which end exactly at window start', () => {
      // The end time is meant to be exclusive, so segments ending at window
      // start should be dropped.
      const references = [
        makeReference(uri(0), -10, 0),
        makeReference(uri(1), 0, 10),
      ];

      const index = new shaka.media.SegmentIndex(references);
      expect(index.references).toEqual(references);

      index.fit(/* windowStart= */ 0, /* windowEnd= */ 10);
      const newReferences = [
        /* ref 0 dropped because it ends when the window start (at 0) */
        makeReference(uri(1), 0, 10),
      ];
      expect(index.references).toEqual(newReferences);
    });

    it('preserves hls key of the last reference', () => {
      // The hls key of the last segment should be preserved.
      const references = [
        makeReference(uri(0), 0, 5, [],
            {method: 'AES-128', firstMediaSequenceNumber: 0}),
        makeReference(uri(1), 5, 10, [],
            {method: 'AES-128', firstMediaSequenceNumber: 0}),
        makeReference(uri(2), 10, 15, [],
            {method: 'AES-128', firstMediaSequenceNumber: 0}),
      ];
      const index = new shaka.media.SegmentIndex(references);
      expect(index.references).toEqual(references);

      index.fit(/* windowStart= */ 0, /* windowEnd= */ 10);
      expect(
          index.references[index.references.length - 1].aes128Key,
      ).toEqual({method: 'AES-128', firstMediaSequenceNumber: 0});
    });
  });

  describe('merge', () => {
    it('three references into zero references', () => {
      const index1 = new shaka.media.SegmentIndex([]);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [actual1, actual2, actual3];

      index1.merge(references2);
      expect(index1.references.length).toBe(3);
      expect(index1.references).toEqual(references2);
    });

    it('zero references into three references', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [actual1, actual2, actual3];
      const index1 = new shaka.media.SegmentIndex(references1);

      index1.merge([]);
      expect(index1.references.length).toBe(3);
      expect(index1.references).toEqual(references1);
    });

    it('one reference into one reference at end', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [makeReference(uri(10), 10, 20)];
      const index1 = new shaka.media.SegmentIndex(references1);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [makeReference(uri(20), 20, 30)];

      index1.merge(references2);
      expect(index1.references.length).toBe(2);
      expect(index1.references[0]).toEqual(references1[0]);
      expect(index1.references[1]).toEqual(references2[0]);
    });

    it('one reference into two references at end', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [
        makeReference(uri(10), 10, 20),
        makeReference(uri(20), 20, 30),
      ];
      const index1 = new shaka.media.SegmentIndex(references1);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [makeReference(uri(30), 30, 40)];

      index1.merge(references2);
      expect(index1.references.length).toBe(3);
      expect(index1.references[0]).toEqual(references1[0]);
      expect(index1.references[1]).toEqual(references1[1]);
      expect(index1.references[2]).toEqual(references2[0]);
    });

    it('two references into one reference at end', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [makeReference(uri(20), 20, 30)];
      const index1 = new shaka.media.SegmentIndex(references1);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [
        makeReference(uri(30), 30, 40),
        makeReference(uri(40), 40, 50),
      ];

      index1.merge(references2);
      expect(index1.references.length).toBe(3);
      expect(index1.references[0]).toEqual(references1[0]);
      expect(index1.references[1]).toEqual(references2[0]);
      expect(index1.references[2]).toEqual(references2[1]);
    });

    it('last live stream reference when period change', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [
        makeReference(uri(10), 10, 20),
        makeReference(uri(20), 20, 30),
        makeReference(uri(30), 30, 49.887),
      ];
      const index1 = new shaka.media.SegmentIndex(references1);

      // When the period is changed, fit() will expand last segment to the start
      // of the next the period.  This simulates an update in which fit() has
      // done that.
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [
        makeReference(uri(20), 20, 30),
        makeReference(uri(30), 30, 50),
      ];

      index1.merge(references2);
      expect(index1.references.length).toBe(3);
      expect(index1.references[0]).toEqual(references1[0]);
      expect(index1.references[1]).toEqual(references2[0]);
      expect(index1.references[2]).toEqual(references2[1]);
    });

    it('references with partial segments of the same parent segment', () => {
      // refs1:  [[[0,5][5,10]]]
      // refs2:  [[[0,5][5,10][10,15]]]
      // Merged: [[[0,5][5,10][10,15]]]

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs1 = [
        makeReference(uri(0.5), 0, 5),
        makeReference(uri(5.10), 5, 10),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs2 = [
        makeReference(uri(0.5), 0, 5),
        makeReference(uri(5.10), 5, 10),
        makeReference(uri(10.15), 10, 15),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs1 = [
        makeReference(uri(0.10), 0, 10, partialRefs1),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs2 = [
        makeReference(uri(0.15), 0, 15, partialRefs2),
      ];
      const index1 = new shaka.media.SegmentIndex(refs1);
      index1.merge(refs2);
      expect(index1.references).toEqual(refs2);
    });

    it('references with partial segments', () => {
      // refs1: [[0,10], [[10,15][15,20]]]
      // refs2: [        [[10,15][15,20][20,25]]]
      // Merged:[[0,10], [[10,15][15,20][20,25]]]

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs1 = [
        makeReference(uri(10.15), 10, 15),
        makeReference(uri(15.20), 15, 20),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs2 = [
        makeReference(uri(10.15), 10, 15),
        makeReference(uri(15.20), 15, 20),
        makeReference(uri(20.25), 20, 25),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs1 = [
        makeReference(uri(0.10), 0, 10),
        makeReference(uri(10.20), 10, 20, partialRefs1),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs2 = [
        makeReference(uri(10.25), 10, 25, partialRefs2),
      ];

      const index1 = new shaka.media.SegmentIndex(refs1);
      index1.merge(refs2);
      const expectedRefs = [refs1[0]].concat(refs2);
      expect(index1.references).toEqual(expectedRefs);
    });

    it('references and remove old partial segments ', () => {
      // refs1: [[0,10], [[10,15][15,20]]]]
      // refs2: [        [10,20], [[20,25][25,30]]]
      // Merged:[[0,10], [10,20], [[20,25][25,30]]]

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs1 = [
        makeReference(uri(10.15), 10, 15),
        makeReference(uri(15.20), 15, 20),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs2 = [
        makeReference(uri(20.25), 20, 25),
        makeReference(uri(25.30), 25, 30),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs1 = [
        makeReference(uri(0.10), 0, 10),
        makeReference(uri(10.20), 10, 20, partialRefs1),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs2 = [
        makeReference(uri(10.20), 10, 20),
        makeReference(uri(20.30), 20, 30, partialRefs2),
      ];

      const index1 = new shaka.media.SegmentIndex(refs1);
      index1.merge(refs2);
      // Expect the first SegmentReference's partial SegmentReferences removed.
      const expectedRefs = [refs1[0]].concat(refs2);
      expect(index1.references).toEqual(expectedRefs);
    });

    it('references with only preload hinted segments', () => {
      // refs1:  [[(preload-hint)[0,0]]]
      // refs2:  [[[0,5][5,10]]]
      // Merged: [[[0,5][5,10]]]

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      // A segment with only preload hinted partial segment.
      const preloadRefs1 = [
        makeReference(uri(0.0), 0, 0),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs2 = [
        // Previous preload hinted segment is replaced with a partial segment.
        makeReference(uri(0.5), 0, 5),
        makeReference(uri(5.10), 5, 10),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs1 = [
        makeReference(uri(0.0), 0, 0, preloadRefs1),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs2 = [
        makeReference(uri(0.10), 0, 10, partialRefs2),
      ];
      const index1 = new shaka.media.SegmentIndex(refs1);
      index1.merge(refs2);
      expect(index1.references.length).toBe(1);
      expect(index1.references).toEqual(refs2);
    });

    it('references with preload hinted segments', () => {
      // refs1:  [[[0,5],(preload-hint)[5,5]]]
      // refs2:  [[[0,5][5,10][10,15]]]
      // Merged: [[[0,5][5,10][10,15]]]

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs1 = [
        makeReference(uri(0.5), 0, 5),
        // Preload hinted partial segment
        makeReference(uri(5.5), 5, 5),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const partialRefs2 = [
        makeReference(uri(0.5), 0, 5),
        makeReference(uri(5.10), 5, 10),
        makeReference(uri(10.15), 10, 15),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs1 = [
        makeReference(uri(0.5), 0, 5, partialRefs1),
      ];
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const refs2 = [
        makeReference(uri(0.15), 0, 15, partialRefs2),
      ];
      const index1 = new shaka.media.SegmentIndex(refs1);
      index1.merge(refs2);
      expect(index1.references.length).toBe(1);
      expect(index1.references).toEqual(refs2);
    });
  });

  describe('mergeAndEvict', () => {
    it('discards segments that end before the availabilityWindowStart', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [
        // Assuming ref(0, 10) has been already evicted
        makeReference(uri(10), 10, 20),
      ];
      const index1 = new shaka.media.SegmentIndex(references1);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [
        makeReference(uri(0), 0, 10),
        makeReference(uri(10), 10, 20),
        makeReference(uri(20), 20, 30),
      ];

      // The first two references end before the availabilityWindowStart, so
      // they should be discarded.
      index1.mergeAndEvict(references2, 21);
      expect(index1.references.length).toBe(1);
      expect(index1.references[0]).toEqual(references2[2]);
    });

    it('discards segments that end before the first old segment', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [
        // Assuming ref(0, 10) has been already evicted
        makeReference(uri(10), 10, 20),
      ];
      const index1 = new shaka.media.SegmentIndex(references1);
      const position1 = index1.find(10);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [
        makeReference(uri(0), 0, 10),
        makeReference(uri(10), 10, 20),
        makeReference(uri(20), 20, 30),
      ];

      // The new first reference ends before the first old reference starts, so
      // it should be discarded.  We will never grow the list at the beginning.
      index1.mergeAndEvict(references2, 0);
      expect(index1.references.length).toBe(2);
      expect(index1.references[0]).toEqual(references2[1]);
      expect(index1.references[1]).toEqual(references2[2]);

      // The positions should be the same, as well.
      expect(index1.find(10)).toBe(position1);
      goog.asserts.assert(position1 != null, 'Position should not be null!');
      expect(index1.get(position1)).toBe(references2[1]);
    });

    it('does not duplicate references with rounding errors', () => {
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references1 = [
        makeReference(uri(10), 10, 20),
        makeReference(uri(20), 20, 30),
      ];
      const index1 = new shaka.media.SegmentIndex(references1);

      // 0.24 microseconds: an insignificant rounding error.
      const tinyError = 0.24e-6;

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const references2 = [
        makeReference(uri(10), 10, 20),
        // The difference between this and the equivalent old reference is an
        // insignificant rounding error.
        makeReference(uri(20), 20 + tinyError, 30 + tinyError),
        makeReference(uri(30), 30 + tinyError, 40),
      ];

      index1.merge(references2);
      expect(index1.references.length).toBe(3);
      expect(index1.references[0]).toEqual(references1[0]);
      // The new references replaced the old one.
      expect(index1.references[1]).toEqual(references2[1]);
      expect(index1.references[2]).toEqual(references2[2]);
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
      expect(index1.references.length).toBe(3);
    });

    it('one segment (edge)', () => {
      index1.evict(10);

      expect(index1.references.length).toBe(2);
      expect(index1.references[0]).toEqual(actual2);
      expect(index1.references[1]).toEqual(actual3);
    });

    it('one segment', () => {
      index1.evict(11);

      expect(index1.references.length).toBe(2);
      expect(index1.references[0]).toEqual(actual2);
      expect(index1.references[1]).toEqual(actual3);
    });

    it('two segments (edge)', () => {
      index1.evict(20);

      expect(index1.references.length).toBe(1);
      expect(index1.references[0]).toEqual(actual3);
    });

    it('two segments', () => {
      index1.evict(21);

      expect(index1.references.length).toBe(1);
      expect(index1.references[0]).toEqual(actual3);
    });

    it('three segments (edge)', () => {
      index1.evict(30);
      expect(index1.references.length).toBe(0);
    });

    it('three segments', () => {
      index1.evict(31);
      expect(index1.references.length).toBe(0);
    });

    it('does not change positions', () => {
      // Get the position and reference of the segment at time 15.
      const positionAtTimeFifteen = index1.find(15);
      goog.asserts.assert(positionAtTimeFifteen != null, 'Null position!');
      const referenceAtTimeFifteen = index1.get(positionAtTimeFifteen);

      index1.evict(10);

      // The position should not have changed.
      expect(index1.find(15)).toBe(positionAtTimeFifteen);
      expect(index1.get(positionAtTimeFifteen)).toBe(referenceAtTimeFifteen);
    });
  });

  describe('SegmentIterator', () => {
    const inputRefs = [
      makeReference(uri(0.10), 0, 10),
      makeReference(uri(10.20), 10, 20),
      makeReference(uri(20.30), 20, 30),
    ];

    const additionalRefs = [
      makeReference(uri(30.40), 30, 40),
      makeReference(uri(40.50), 40, 50),
      makeReference(uri(50.60), 50, 60),
    ];

    const partialRefs1 = [
      makeReference(uri(10.15), 10, 15),
      makeReference(uri(15.20), 15, 20),
    ];

    const partialRefs2 = [
      makeReference(uri(20.25), 20, 25),
      makeReference(uri(25.30), 25, 30),
    ];

    const inputRefsWithPartial = [
      makeReference(uri(0.10), 0, 10),
      makeReference(uri(10.20), 10, 20, partialRefs1),
      makeReference(uri(20.30), 20, 30, partialRefs2),
    ];


    it('works with Array.from', () => {
      const index = new shaka.media.SegmentIndex(inputRefs);
      const refs = Array.from(index);
      expect(refs).toEqual(inputRefs);
    });

    it('works with Array.from with partial segments', () => {
      const index = new shaka.media.SegmentIndex(inputRefsWithPartial);
      const refs = Array.from(index);

      const expectedRefs = [inputRefsWithPartial[0]].concat(
          partialRefs1, partialRefs2);
      expect(refs).toEqual(expectedRefs);
    });

    it('works with for-of', () => {
      const index = new shaka.media.SegmentIndex(inputRefs);
      const refs = [];
      for (const ref of index) {
        refs.push(ref);
      }
      expect(refs).toEqual(inputRefs);
    });

    it('works with for-of with partial segments', () => {
      const index = new shaka.media.SegmentIndex(inputRefsWithPartial);
      const refs = [];
      for (const ref of index) {
        refs.push(ref);
      }

      const expectedRefs = [inputRefsWithPartial[0]].concat(
          partialRefs1, partialRefs2);
      expect(refs).toEqual(expectedRefs);
    });

    it('works after eviction', () => {
      const index = new shaka.media.SegmentIndex(inputRefs);
      index.evict(15);  // Drop the first ref.
      expect(Array.from(index)).toEqual(inputRefs.slice(1));
    });

    it('resumes iteration after new references are added', () => {
      const refs = inputRefs.slice();
      const index = new shaka.media.SegmentIndex(refs);

      // This simulates the pattern of calls in StreamingEngine when we buffer
      // to the edge of a live stream.
      const iterator = index[Symbol.iterator]();
      iterator.next();
      expect(iterator.current()).toBe(inputRefs[0]);

      iterator.next();
      expect(iterator.current()).toBe(inputRefs[1]);

      iterator.next();
      expect(iterator.current()).toBe(inputRefs[2]);

      iterator.next();
      expect(iterator.current()).toBe(null);
      // After we reach the end of the iteration, we should still get null back
      // on subsequent requests.
      expect(iterator.current()).toBe(null);
      expect(iterator.current()).toBe(null);

      // Although we have reached the end, we should still be able to add new
      // references and iterate to them without starting over the iteration.
      refs.push(...additionalRefs);

      expect(iterator.current()).toBe(additionalRefs[0]);

      iterator.next();
      expect(iterator.current()).toBe(additionalRefs[1]);

      iterator.next();
      expect(iterator.current()).toBe(additionalRefs[2]);

      iterator.next();
      expect(iterator.current()).toBe(null);
    });

    describe('getIteratorForTime', () => {
      it('begins with an independent partial segment', () => {
        // This test contains its own segment refs, which are manipulated to
        // look a little different from the more general ones used elsewhere.
        // In particular, we mark some partial refs as dependent, and we make
        // the second partial list much longer.
        const partialRefs1 = [
          makeReference(uri(10.15), 10, 15),
          makeReference(uri(15.20), 15, 20),
        ];
        partialRefs1[1].markAsNonIndependent();

        const partialRefs2 = [
          makeReference(uri(20.25), 20, 25),
          makeReference(uri(25.30), 25, 30),
          makeReference(uri(30.35), 30, 35),
          makeReference(uri(35.40), 35, 40),
          makeReference(uri(40.45), 40, 45),
          makeReference(uri(45.50), 45, 50),
          makeReference(uri(50.55), 50, 55),
          makeReference(uri(55.60), 55, 60),
          makeReference(uri(60.65), 60, 65),
          makeReference(uri(65.70), 65, 70),
        ];
        // All but the first:
        for (const r of partialRefs2.slice(1)) {
          r.markAsNonIndependent();
        }

        const localInputRefs = [
          makeReference(uri(0.10), 0, 10),
          makeReference(uri(10.20), 10, 20, partialRefs1),
          makeReference(uri(20.70), 20, 70, partialRefs2),
        ];
        const index = new shaka.media.SegmentIndex(localInputRefs);

        // This time points to partialRefs1[0], which is independent.
        const iterator1 = index.getIteratorForTime(11);
        expect(iterator1.next().value).toBe(partialRefs1[0]);

        // Even though the time would point to partialRefs1[1], that is not
        // independent.  So it walks back to partialRefs1[0].
        const iterator2 = index.getIteratorForTime(16);
        expect(iterator2.next().value).toBe(partialRefs1[0]);

        // Even though the time would point to partialRefs2[9], that is not
        // independent.  So it walks all the way back to partialRefs2[0].
        const iterator3 = index.getIteratorForTime(69);
        expect(iterator3.next().value).toBe(partialRefs2[0]);
      });
    });

    describe('next', () => {
      it('starts with the first segment', () => {
        const index = new shaka.media.SegmentIndex(inputRefs);
        const iterator = index[Symbol.iterator]();
        expect(iterator.next().value).toBe(inputRefs[0]);
      });

      it('iterates through all segments', () => {
        const index = new shaka.media.SegmentIndex(inputRefs);
        const iterator = index[Symbol.iterator]();
        expect(iterator.next().value).toBe(inputRefs[0]);
        expect(iterator.next().value).toBe(inputRefs[1]);
        expect(iterator.next().value).toBe(inputRefs[2]);
        expect(iterator.next().value).toBe(null);
      });

      it('iterates from getIteratorForTime', () => {
        const index = new shaka.media.SegmentIndex(inputRefs);
        const iterator = index.getIteratorForTime(10);
        expect(iterator.next().value).toBe(inputRefs[1]);
        expect(iterator.current()).toBe(inputRefs[1]);
        expect(iterator.next().value).toBe(inputRefs[2]);
        expect(iterator.current()).toBe(inputRefs[2]);
        expect(iterator.next().value).toBe(null);
      });

      it('iterates from getIteratorForTime with partial segments', () => {
        const index = new shaka.media.SegmentIndex(inputRefsWithPartial);
        const iterator = index.getIteratorForTime(10);
        expect(iterator.next().value).toBe(partialRefs1[0]);
        expect(iterator.current()).toBe(partialRefs1[0]);
        expect(iterator.next().value).toBe(partialRefs1[1]);
        expect(iterator.current()).toBe(partialRefs1[1]);
        expect(iterator.next().value).toBe(partialRefs2[0]);
        expect(iterator.current()).toBe(partialRefs2[0]);
      });

      it('iterates through regular and partial segments', () => {
        const index = new shaka.media.SegmentIndex(inputRefsWithPartial);
        const iterator = index[Symbol.iterator]();
        expect(iterator.next().value).toBe(inputRefsWithPartial[0]);
        expect(iterator.next().value).toBe(partialRefs1[0]);
        expect(iterator.next().value).toBe(partialRefs1[1]);
        expect(iterator.next().value).toBe(partialRefs2[0]);
        expect(iterator.next().value).toBe(partialRefs2[1]);
        expect(iterator.next().value).toBe(null);
      });
    });

    describe('current', () => {
      it('starts with null', () => {
        const index = new shaka.media.SegmentIndex(inputRefs);
        const iterator = index[Symbol.iterator]();
        // Technically, next() starts iteration, so current() returns null
        // before next() is called.
        expect(iterator.current()).toBe(null);
      });

      it('returns the same thing returned by the previous next() call', () => {
        const index = new shaka.media.SegmentIndex(inputRefs);
        const iterator = index[Symbol.iterator]();

        expect(iterator.next().value).toBe(inputRefs[0]);
        expect(iterator.current()).toBe(inputRefs[0]);

        expect(iterator.next().value).toBe(inputRefs[1]);
        expect(iterator.current()).toBe(inputRefs[1]);

        expect(iterator.next().value).toBe(inputRefs[2]);
        expect(iterator.current()).toBe(inputRefs[2]);
      });

      it('returns the same thing returned by the previous next() call ' +
          'with partial segments', () => {
        const index = new shaka.media.SegmentIndex(inputRefsWithPartial);

        // const index = new shaka.media.SegmentIndex(inputRefs);
        const iterator = index[Symbol.iterator]();

        expect(iterator.next().value).toBe(inputRefsWithPartial[0]);
        expect(iterator.current()).toBe(inputRefsWithPartial[0]);
        expect(iterator.next().value).toBe(partialRefs1[0]);
        expect(iterator.current()).toBe(partialRefs1[0]);
        expect(iterator.next().value).toBe(partialRefs1[1]);
        expect(iterator.current()).toBe(partialRefs1[1]);
        expect(iterator.next().value).toBe(partialRefs2[0]);
        expect(iterator.current()).toBe(partialRefs2[0]);
      });
    });
  });

  describe('MetaSegmentIndex', () => {
    const inputRefs0 = [
      makeReference(uri(0), 0, 10),
      makeReference(uri(1), 10, 20),
      makeReference(uri(2), 20, 30),
    ];
    const inputRefs1 = [
      makeReference(uri(3), 30, 40),
      makeReference(uri(4), 40, 50),
      makeReference(uri(5), 50, 60),
    ];
    const inputRefs2 = [
      makeReference(uri(6), 60, 70),
      makeReference(uri(7), 70, 80),
      makeReference(uri(8), 80, 90),
    ];

    /** @type {!shaka.media.SegmentIndex} */
    let index0;
    /** @type {!shaka.media.SegmentIndex} */
    let index1;
    /** @type {!shaka.media.SegmentIndex} */
    let index2;
    /** @type {!shaka.media.MetaSegmentIndex} */
    let metaIndex;

    beforeEach(() => {
      // Make sure each index has a _copy_ of the input refs, so that the
      // original arrays are never modified.
      index0 = new shaka.media.SegmentIndex(inputRefs0.slice());
      index1 = new shaka.media.SegmentIndex(inputRefs1.slice());
      index2 = new shaka.media.SegmentIndex(inputRefs2.slice());
      metaIndex = new shaka.media.MetaSegmentIndex();
    });

    it('combines the contents of several SegmentIndexes', () => {
      metaIndex.appendSegmentIndex(index0);
      expect(metaIndex.find(0)).toBe(0);
      expect(metaIndex.find(10)).toBe(1);
      expect(metaIndex.find(20)).toBe(2);
      expect(metaIndex.find(30)).toBe(null);
      expect(Array.from(metaIndex)).toEqual(inputRefs0);

      metaIndex.appendSegmentIndex(index1);
      expect(metaIndex.find(0)).toBe(0);
      expect(metaIndex.find(10)).toBe(1);
      expect(metaIndex.find(20)).toBe(2);
      expect(metaIndex.find(30)).toBe(3);
      expect(metaIndex.find(40)).toBe(4);
      expect(metaIndex.find(50)).toBe(5);
      expect(metaIndex.find(60)).toBe(null);
      expect(Array.from(metaIndex)).toEqual(inputRefs0.concat(inputRefs1));

      metaIndex.appendSegmentIndex(index2);
      expect(metaIndex.find(0)).toBe(0);
      expect(metaIndex.find(10)).toBe(1);
      expect(metaIndex.find(20)).toBe(2);
      expect(metaIndex.find(30)).toBe(3);
      expect(metaIndex.find(40)).toBe(4);
      expect(metaIndex.find(50)).toBe(5);
      expect(metaIndex.find(60)).toBe(6);
      expect(metaIndex.find(70)).toBe(7);
      expect(metaIndex.find(80)).toBe(8);
      expect(metaIndex.find(90)).toBe(null);
      expect(Array.from(metaIndex)).toEqual(
          inputRefs0.concat(inputRefs1, inputRefs2));
    });

    it('updates through merge', () => {
      metaIndex.appendSegmentIndex(index0);
      metaIndex.appendSegmentIndex(index1);
      expect(Array.from(metaIndex)).toEqual(inputRefs0.concat(inputRefs1));

      index1.merge(inputRefs2);
      expect(Array.from(metaIndex)).toEqual(
          inputRefs0.concat(inputRefs1, inputRefs2));
    });

    it('tracks evictions with stable positions', () => {
      metaIndex.appendSegmentIndex(index0);
      metaIndex.appendSegmentIndex(index1);
      metaIndex.appendSegmentIndex(index2);
      const allRefs = inputRefs0.concat(inputRefs1, inputRefs2);

      expect(metaIndex.find(0)).toBe(0);
      expect(metaIndex.find(10)).toBe(1);
      expect(metaIndex.find(20)).toBe(2);
      expect(metaIndex.find(30)).toBe(3);
      expect(metaIndex.find(40)).toBe(4);
      expect(metaIndex.find(50)).toBe(5);
      expect(metaIndex.find(60)).toBe(6);
      expect(metaIndex.find(70)).toBe(7);
      expect(metaIndex.find(80)).toBe(8);
      expect(metaIndex.find(90)).toBe(null);
      expect(Array.from(metaIndex)).toEqual(allRefs);

      index0.evict(25);
      index1.evict(25);
      index2.evict(25);
      expect(metaIndex.find(20)).toBe(2);
      expect(metaIndex.find(30)).toBe(3);
      expect(metaIndex.find(40)).toBe(4);
      expect(metaIndex.find(50)).toBe(5);
      expect(metaIndex.find(60)).toBe(6);
      expect(metaIndex.find(70)).toBe(7);
      expect(metaIndex.find(80)).toBe(8);
      expect(metaIndex.find(90)).toBe(null);
      expect(Array.from(metaIndex)).toEqual(allRefs.slice(2));

      index0.evict(45);
      index1.evict(45);
      index2.evict(45);
      expect(metaIndex.find(40)).toBe(4);
      expect(metaIndex.find(50)).toBe(5);
      expect(metaIndex.find(60)).toBe(6);
      expect(metaIndex.find(70)).toBe(7);
      expect(metaIndex.find(80)).toBe(8);
      expect(metaIndex.find(90)).toBe(null);
      expect(Array.from(metaIndex)).toEqual(allRefs.slice(4));
    });

    it('updates through updateEvery', async () => {
      metaIndex.appendSegmentIndex(index0);
      metaIndex.appendSegmentIndex(index1);

      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const oldRefs = inputRefs0.concat(inputRefs1);

      // Make a copy of inputRefs2 so we don't modify the original.
      /** @type {!Array.<!shaka.media.SegmentReference>} */
      const newRefs = inputRefs2.slice();

      expect(Array.from(metaIndex)).toEqual(oldRefs);

      // Every 0.1 seconds, return the next new ref.
      const done = new Promise((resolve, reject) => {
        index1.updateEvery(0.1, () => {
          if (newRefs.length == 0) {
            resolve();
          }
          return [newRefs.shift()];
        });
      });

      // Wait for the new refs to be appended.
      await done;

      expect(Array.from(metaIndex)).toEqual(oldRefs.concat(inputRefs2));
    });
  });

  /**
   * Creates a URI string.
   *
   * @param {number} x
   * @return {string}
   */
  function uri(x) {
    return 'http://example.com/video_' + x + '.m4s';
  }

  /**
   * Creates a real SegmentReference.  This is distinct from the fake ones used
   * in ManifestParser tests because it can be on the left-hand side of an
   * expect().  You can't expect jasmine.any(Number) to equal
   * jasmine.any(Number).  :-(
   *
   * @param {string} uri
   * @param {number} startTime
   * @param {number} endTime
   * @param {!Array.<!shaka.media.SegmentReference>=} partialReferences
   * @param {?shaka.extern.aes128Key=} aes128Key
   * @return {shaka.media.SegmentReference}
   */
  function makeReference(uri, startTime, endTime, partialReferences = [],
      aes128Key = null) {
    return new shaka.media.SegmentReference(
        startTime,
        endTime,
        /* getUris= */ () => [uri],
        /* startByte= */ 0,
        /* endByte= */ null,
        /* initSegmentReference= */ null,
        /* timestampOffset= */ 0,
        /* appendWindowStart= */ 0,
        /* appendWindowEnd= */ Infinity,
        /* partialReferences= */ partialReferences,
        /* tilesLayout= */ undefined,
        /* tileDuration= */ undefined,
        /* syncTime= */ undefined,
        /* status= */ undefined,
        /* aes128Key= */ aes128Key,
        /* allPartialSegments= */ partialReferences.length > 0);
  }
});
