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
  describe('find', function() {
    it('finds the correct references', function() {
      var actual1 = makeReference(0, 0, 10, uri(0));
      var actual2 = makeReference(1, 10, 20, uri(10));
      var actual3 = makeReference(2, 20, 30, uri(20));

      var index, pos1, pos2, pos3;

      // One reference.
      index = new shaka.media.SegmentIndex([actual1]);
      pos1 = index.find(5);
      expect(pos1).toBe(actual1.position);

      // Two references.
      index = new shaka.media.SegmentIndex([actual1, actual2]);
      pos1 = index.find(5);
      pos2 = index.find(15);
      expect(pos1).toBe(actual1.position);
      expect(pos2).toBe(actual2.position);

      // Three references.
      index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      pos1 = index.find(5);
      pos2 = index.find(15);
      pos3 = index.find(25);
      expect(pos1).toBe(actual1.position);
      expect(pos2).toBe(actual2.position);
      expect(pos3).toBe(actual3.position);
    });

    it('works if time == first start time', function() {
      var actual = makeReference(1, 10, 20, uri(10));
      var index = new shaka.media.SegmentIndex([actual]);

      var pos = index.find(10);
      expect(pos).toBe(actual.position);
    });

    it('works with two references if time == second start time', function() {
      var actual1 = makeReference(1, 10, 20, uri(10));
      var actual2 = makeReference(2, 20, 30, uri(20));
      var index = new shaka.media.SegmentIndex([actual1, actual2]);

      var pos = index.find(20);
      expect(pos).toBe(actual2.position);
    });

    it('returns null if time < first start time', function() {
      var actual = makeReference(1, 10, 20, uri(10));
      var index = new shaka.media.SegmentIndex([actual]);

      var pos = index.find(5);
      expect(pos).toBeNull();
    });

    it('returns null if time == last end time', function() {
      var actual = makeReference(1, 10, 20, uri(10));
      var index = new shaka.media.SegmentIndex([actual]);

      var pos = index.find(20);
      expect(pos).toBeNull();
    });

    it('returns null if time > last end time', function() {
      var actual = makeReference(1, 10, 20, uri(10));
      var index = new shaka.media.SegmentIndex([actual]);

      var pos = index.find(21);
      expect(pos).toBeNull();
    });

    it('returns null if time is within a gap', function() {
      var actual1 = makeReference(1, 10, 20, uri(10));
      var actual2 = makeReference(2, 25, 30, uri(25));
      var index = new shaka.media.SegmentIndex([actual1, actual2]);

      var pos = index.find(23);
      expect(pos).toBeNull();
    });
  });

  describe('get', function() {
    var actual1, actual2, actual3;

    beforeEach(function() {
      actual1 = makeReference(0, 0, 10, uri(0));
      actual2 = makeReference(1, 10, 20, uri(10));
      actual3 = makeReference(2, 20, 30, uri(20));
    });

    it('returns the correct references', function() {
      var index, r1, r2, r3;

      // One reference.
      index = new shaka.media.SegmentIndex([actual1]);
      r1 = index.get(0);
      expect(r1).toEqual(actual1);

      // Two references.
      index = new shaka.media.SegmentIndex([actual1, actual2]);
      r1 = index.get(0);
      r2 = index.get(1);
      expect(r1).toEqual(actual1);
      expect(r2).toEqual(actual2);

      // Three references.
      index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      r1 = index.get(0);
      r2 = index.get(1);
      r3 = index.get(2);
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
      var index = new shaka.media.SegmentIndex([]);
      expect(index.get(0)).toBeNull();
    });

    it('returns null if position < 0', function() {
      var index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      expect(index.get(-1)).toBeNull();
    });

    it('returns null for unknown positions', function() {
      var index1 = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      expect(index1.get(3)).toBeNull();

      var index2 = new shaka.media.SegmentIndex([actual2, actual3]);
      expect(index2.get(0)).toBeNull();
    });
  });

  describe('merge', function() {
    it('three references into zero references', function() {
      var index1 = new shaka.media.SegmentIndex([]);

      var references2 = [
        makeReference(0, 0, 10, uri(0)),
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20))
      ];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_).toEqual(references2);
    });

    it('zero references into three references', function() {
      var references1 = [
        makeReference(0, 0, 10, uri(0)),
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20))
      ];
      var index1 = new shaka.media.SegmentIndex(references1);

      index1.merge([]);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_).toEqual(references1);
    });

    it('one reference into one reference at end', function() {
      var references1 = [makeReference(1, 10, 20, uri(10))];
      var index1 = new shaka.media.SegmentIndex(references1);

      var references2 = [makeReference(2, 20, 30, uri(20))];

      index1.merge(references2);
      expect(index1.references_.length).toBe(2);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
    });

    it('one reference into two references at end', function() {
      var references1 = [
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20))
      ];
      var index1 = new shaka.media.SegmentIndex(references1);

      var references2 = [makeReference(3, 30, 40, uri(30))];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references1[1]);
      expect(index1.references_[2]).toEqual(references2[0]);
    });

    it('two references into one reference at end', function() {
      var references1 = [makeReference(2, 20, 30, uri(20))];
      var index1 = new shaka.media.SegmentIndex(references1);

      var references2 = [
        makeReference(3, 30, 40, uri(30)),
        makeReference(4, 40, 50, uri(40))
      ];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
      expect(index1.references_[2]).toEqual(references2[1]);
    });

    it('last live stream reference when period change', function() {
      var references1 = [
        makeReference(1, 10, 20, uri(10)),
        makeReference(2, 20, 30, uri(20)),
        makeReference(3, 30, 49.887, uri(30))
      ];
      var index1 = new shaka.media.SegmentIndex(references1);

      // when period is changed, fitSegmentReference will
      // expand last segment to the start of the next the period
      var references2 = [
        makeReference(2, 20, 30, uri(20)),
        makeReference(3, 30, 50, uri(30))
      ];

      index1.merge(references2);
      expect(index1.references_.length).toBe(3);
      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
      expect(index1.references_[2]).toEqual(references2[1]);
    });
  });

  describe('evict', function() {
    var actual1, actual2, actual3, index1;

    beforeEach(function() {
      actual1 = makeReference(0, 0, 10, uri(0));
      actual2 = makeReference(1, 10, 20, uri(10));
      actual3 = makeReference(2, 20, 30, uri(20));
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

