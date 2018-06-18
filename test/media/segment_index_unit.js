/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('SegmentIndex', /** @suppress {accessControls} */ function() {
  const actual1 = makeReference(0, 0, 10, uri(0));
  const actual2 = makeReference(1, 10, 20, uri(20));
  const actual3 = makeReference(2, 20, 30, uri(20));

  describe('find', function() {
    it('finds the correct references', function() {
      // One reference.
      let index = new shaka.media.SegmentIndex([actual1]);
      let pos1 = index.find(5);
      expect(pos1).toBe(actual1.position);

      // Two references.
      index = new shaka.media.SegmentIndex([actual1, actual2]);
      pos1 = index.find(5);
      let pos2 = index.find(15);
      expect(pos1).toBe(actual1.position);
      expect(pos2).toBe(actual2.position);

      // Three references.
      index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      pos1 = index.find(5);
      pos2 = index.find(15);
      let pos3 = index.find(25);
      expect(pos1).toBe(actual1.position);
      expect(pos2).toBe(actual2.position);
      expect(pos3).toBe(actual3.position);
    });

    it('works if time == first start time', function() {
      let actual = makeReference(1, 10, 20, uri(10));
      let index = new shaka.media.SegmentIndex([actual]);

      let pos = index.find(10);
      expect(pos).toBe(actual.position);
    });

    it('works with two references if time == second start time', function() {
      let actual1 = makeReference(1, 10, 20, uri(10));
      let actual2 = makeReference(2, 20, 30, uri(20));
      let index = new shaka.media.SegmentIndex([actual1, actual2]);

      let pos = index.find(20);
      expect(pos).toBe(actual2.position);
    });

    it('returns the first segment if time < first start time', function() {
      let actual = makeReference(1, 10, 20, uri(10));
      let index = new shaka.media.SegmentIndex([actual]);

      let pos = index.find(5);
      expect(pos).toBe(actual.position);
    });

    it('returns null if time == last end time', function() {
      let actual = makeReference(1, 10, 20, uri(10));
      let index = new shaka.media.SegmentIndex([actual]);

      let pos = index.find(20);
      expect(pos).toBeNull();
    });

    it('returns null if time > last end time', function() {
      let actual = makeReference(1, 10, 20, uri(10));
      let index = new shaka.media.SegmentIndex([actual]);

      let pos = index.find(21);
      expect(pos).toBeNull();
    });

    it('returns null if time is within a gap', function() {
      let actual1 = makeReference(1, 10, 20, uri(10));
      let actual2 = makeReference(2, 25, 30, uri(25));
      let index = new shaka.media.SegmentIndex([actual1, actual2]);

      let pos = index.find(23);
      expect(pos).toBeNull();
    });
  });

  describe('get', function() {
    it('returns the correct references', function() {
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
      r2 = index.get(1);
      r3 = index.get(2);
      expect(r2).toEqual(actual2);
      expect(r3).toEqual(actual3);

      // One reference with offset.
      index = new shaka.media.SegmentIndex([actual3]);
      r3 = index.get(2);
      expect(r3).toEqual(actual3);
    });

    it('returns null with zero references', function() {
      let index = new shaka.media.SegmentIndex([]);
      expect(index.get(0)).toBeNull();
    });

    it('returns null if position < 0', function() {
      let index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      expect(index.get(-1)).toBeNull();
    });

    it('returns null for unknown positions', function() {
      let index1 = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      expect(index1.get(3)).toBeNull();

      let index2 = new shaka.media.SegmentIndex([actual2, actual3]);
      expect(index2.get(0)).toBeNull();
    });
  });

  describe('fit', function() {
    it('drops references which are outside the period bounds', function() {
      // These negative numbers can occur due to presentationTimeOffset in DASH.
      let references = [
        makeReference(0, -10, -3, uri(0)),
        makeReference(1, -3, 4, uri(1)),
        makeReference(2, 4, 11, uri(2)),
        makeReference(3, 11, 18, uri(3)),
        makeReference(4, 18, 25, uri(4)),
      ];
      let index = new shaka.media.SegmentIndex(references);
      expect(index.references_).toEqual(references);

      index.fit(/* periodDuration */ 15);
      let newReferences = [
        /* ref 0 dropped because it ends before the period starts */
        makeReference(1, -3, 4, uri(1)),
        makeReference(2, 4, 11, uri(2)),
        makeReference(3, 11, 15, uri(3)),  // end time clamped to period
        /* ref 4 dropped because it starts after the period ends */
      ];
      expect(index.references_).toEqual(newReferences);
    });

    it('drops references which end exactly at zero', function() {
      // The end time is meant to be exclusive, so segments ending at zero
      // (after PTO adjustments) should be dropped.
      let references = [
        makeReference(0, -10, 0, uri(0)),
        makeReference(1, 0, 10, uri(1)),
      ];
      let index = new shaka.media.SegmentIndex(references);
      expect(index.references_).toEqual(references);

      index.fit(/* periodDuration */ 10);
      let newReferences = [
        /* ref 0 dropped because it ends before the period starts (at 0) */
        makeReference(1, 0, 10, uri(1)),
      ];
      expect(index.references_).toEqual(newReferences);
    });
  });

  describe('merge', function() {
    it('three references into zero references', function() {
      let index1 = new shaka.media.SegmentIndex([]);

      let references2 = [actual1, actual2, actual3];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_).toEqual(references2);
    });

    it('zero references into three references', function() {
      let references1 = [actual1, actual2, actual3];
      let index1 = new shaka.media.SegmentIndex(references1);

      index1.merge([]);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_).toEqual(references1);
    });

    it('one reference into one reference at end', function() {
      let references1 = [makeReference(1, 10, 20, uri(10))];
      let index1 = new shaka.media.SegmentIndex(references1);

      let references2 = [makeReference(2, 20, 30, uri(20))];

      index1.merge(references2);
      expect(index1.references_.length).toBe(2);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
    });

    it('one reference into two references at end', function() {
      let references1 = [
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20)),
      ];
      let index1 = new shaka.media.SegmentIndex(references1);

      let references2 = [makeReference(3, 30, 40, uri(30))];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references1[1]);
      expect(index1.references_[2]).toEqual(references2[0]);
    });

    it('two references into one reference at end', function() {
      let references1 = [makeReference(2, 20, 30, uri(20))];
      let index1 = new shaka.media.SegmentIndex(references1);

      let references2 = [
        makeReference(3, 30, 40, uri(30)),
        makeReference(4, 40, 50, uri(40)),
      ];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
      expect(index1.references_[2]).toEqual(references2[1]);
    });

    it('last live stream reference when period change', function() {
      let references1 = [
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20)),
        makeReference(3, 30, 49.887, uri(30)),
      ];
      let index1 = new shaka.media.SegmentIndex(references1);

      // When the period is changed, fit() will expand last segment to the start
      // of the next the period.  This simulates an update in which fit() has
      // done that.
      let references2 = [
        makeReference(2, 20, 30, uri(20)),
        makeReference(3, 30, 50, uri(30)),
      ];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
      expect(index1.references_[2]).toEqual(references2[1]);
    });

    // Makes sure segment references from time-based template merge with correct
    // position numbers.
    // https://github.com/google/shaka-player/pull/838
    it('last live stream reference with corrected position', function() {
      let references1 = [
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20)),
        makeReference(3, 30, 49.887, uri(30)),
      ];
      let index1 = new shaka.media.SegmentIndex(references1);

      // segment position always start from 1 for time-based segment templates
      let references2 = [
        makeReference(1, 20, 30, uri(20)),
        makeReference(2, 30, 50, uri(30)),
      ];

      let lastReference = makeReference(3, 30, 50, uri(30));

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references1[1]);
      expect(index1.references_[2]).toEqual(lastReference);
    });
  });

  describe('evict', function() {
    /** @type {!shaka.media.SegmentIndex} */
    let index1;

    beforeEach(function() {
      index1 = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
    });

    it('no segments', function() {
      index1.evict(5);
      expect(index1.references_.length).toBe(3);
    });

    it('one segment (edge)', function() {
      index1.evict(10);

      expect(index1.references_.length).toBe(2);
      expect(index1.references_[0]).toEqual(actual2);
      expect(index1.references_[1]).toEqual(actual3);
    });

    it('one segment', function() {
      index1.evict(11);

      expect(index1.references_.length).toBe(2);
      expect(index1.references_[0]).toEqual(actual2);
      expect(index1.references_[1]).toEqual(actual3);
    });

    it('two segments (edge)', function() {
      index1.evict(20);

      expect(index1.references_.length).toBe(1);
      expect(index1.references_[0]).toEqual(actual3);
    });

    it('two segments', function() {
      index1.evict(21);

      expect(index1.references_.length).toBe(1);
      expect(index1.references_[0]).toEqual(actual3);
    });

    it('three segments (edge)', function() {
      index1.evict(30);
      expect(index1.references_.length).toBe(0);
    });

    it('three segments', function() {
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
        position, startTime, endTime, function() { return [uri]; }, 0, null);
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

