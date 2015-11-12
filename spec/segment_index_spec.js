/**
 * @license
 * Copyright 2015 Google Inc.
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

goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');

describe('SegmentIndex', function() {
  describe('get', function() {
    var actual1, actual2, actual3;

    beforeEach(function() {
      actual1 = makeReference(0, 10, uri(0));
      actual2 = makeReference(10, 20, uri(10));
      actual3 = makeReference(20, 30, uri(20));
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
    });

    it('throws RangeError with zero references', function() {
      var index = new shaka.media.SegmentIndex([]);
      try {
        index.get(0);
        fail();
      } catch (exception) {
        expect(exception instanceof RangeError).toBeTruthy();
      }
    });

    it('throws RangeError if index < 0', function() {
      var index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);

      try {
        index.get(-1);
        fail();
      } catch (exception) {
        expect(exception instanceof RangeError).toBeTruthy();
      }
    });

    it('throws RangeError if index > number of references', function() {
      var index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);

      try {
        index.get(3);
        fail();
      } catch (exception) {
        expect(exception instanceof RangeError).toBeTruthy();
      }
    });
  });

  describe('find', function() {
    var actual1, actual2, actual3;

    beforeEach(function() {
      actual1 = makeReference(0, 10, uri(0));
      actual2 = makeReference(10, 20, uri(10));
      actual3 = makeReference(20, 30, uri(20));
    });

    it('finds the correct references', function() {
      var index, r1, r2, r3;

      // One reference.
      index = new shaka.media.SegmentIndex([actual1]);
      r1 = index.find(5);
      expect(r1).toEqual(actual1);

      // Two references.
      index = new shaka.media.SegmentIndex([actual1, actual2]);
      r1 = index.find(5);
      r2 = index.find(15);
      expect(r1).toEqual(actual1);
      expect(r2).toEqual(actual2);

      // Three references.
      index = new shaka.media.SegmentIndex([actual1, actual2, actual3]);
      r1 = index.find(5);
      r2 = index.find(15);
      r3 = index.find(25);
      expect(r1).toEqual(actual1);
      expect(r2).toEqual(actual2);
      expect(r3).toEqual(actual3);
    });

    it('works if time == first start time', function() {
      var actual = makeReference(10, 20, uri(10));
      var index = new shaka.media.SegmentIndex([actual]);

      var r = index.find(10);
      expect(r).toEqual(actual);
    });

    it('works with two references if time == second start time', function() {
      var actual1 = makeReference(10, 20, uri(10));
      var actual2 = makeReference(20, 30, uri(20));
      var index = new shaka.media.SegmentIndex([actual1, actual2]);

      var r = index.find(20);
      expect(r).toEqual(actual2);
    });

    it('returns null if time < first start time', function() {
      var actual = makeReference(10, 20, uri(10));
      var index = new shaka.media.SegmentIndex([actual]);

      var r = index.find(5);
      expect(r).toBeNull();
    });

    it('returns null if time == last end time', function() {
      var actual = makeReference(10, 20, uri(10));
      var index = new shaka.media.SegmentIndex([actual]);

      var r = index.find(20);
      expect(r).toBeNull();
    });

    it('returns null if time > last end time', function() {
      var actual = makeReference(10, 20, uri(10));
      var index = new shaka.media.SegmentIndex([actual]);

      var r = index.find(21);
      expect(r).toBeNull();
    });

    it('returns null if time is within a gap', function() {
      var actual1 = makeReference(10, 20, uri(10));
      var actual2 = makeReference(25, 30, uri(25));
      var index = new shaka.media.SegmentIndex([actual1, actual2]);

      var r = index.find(23);
      expect(r).toBeNull();
    });
  });

  describe('merge', function() {
    var references1, index1;

    beforeEach(function() {
      references1 = [
        makeReference(4, 7, uri(4)),
        makeReference(7, 10, uri(7)),
        makeReference(10, 13, uri(10))
      ];
      index1 = new shaka.media.SegmentIndex(references1);
    });

    it('in no new references', function() {
      var index2 = new shaka.media.SegmentIndex([]);

      index1.merge(index2.references_);
      expect(index1.references_.length).toBe(3);
      checkReferences(index1.references_);
    });

    it('into no existing references', function() {
      var index2 = new shaka.media.SegmentIndex([]);

      index2.merge(index1.references_);
      expect(index2.references_.length).toBe(3);
      checkReferences(index2.references_);
    });

    describe('three references into three references', function() {
      for (var i = 0; i <= 14; ++i) {
        it('start=' + i + ', end=' + (i + 6), function() {
          var references2 = [
            makeReference(i, i + 3, uri('new_' + i)),
            makeReference(i + 3, i + 6, uri('new_' + (i + 3))),
            makeReference(i + 6, i + 9, uri('new_' + (i + 6)))
          ];
          var index2 = new shaka.media.SegmentIndex(references2);

          index1.merge(index2.references_);
          expect(index1.references_.length).toBe(6);
          checkReferences(index1.references_);
        });
      }  // for i
    });

    describe('one reference into three references', function() {
      for (var i = 6; i <= 11; ++i) {
        // Vary the length of the segment.
        for (var d = 2; d <= 4; ++d) {
          it('start=' + i + ', end=' + (i + d), function() {
            var references2 = [
              makeReference(i, i + d, uri('new_' + i))
            ];
            var index2 = new shaka.media.SegmentIndex(references2);

            index1.merge(index2.references_);
            expect(index1.references_.length).toBe(4);
            checkReferences(index1.references_);
          });
        }  // for d
      }  // for i
    });

    it('doesn\'t mangle references', function() {
      var references2 = [
        makeReference(5, 8, uri('new_5')),
        makeReference(8, 11, uri('new_8')),
        makeReference(11, 14, uri('new_11'))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index1.merge(index2.references_);
      expect(index1.references_.length).toBe(6);

      expect(index1.references_[0]).toEqual(references1[0]);
      expect(index1.references_[1]).toEqual(references2[0]);
      expect(index1.references_[2]).toEqual(references1[1]);
      expect(index1.references_[3]).toEqual(references2[1]);
      expect(index1.references_[4]).toEqual(references1[2]);
      expect(index1.references_[5]).toEqual(references2[2]);
    });

    function checkReferences(references) {
      for (var i = 0; i < references.length; ++i) {
        if (i == 0) continue;

        var r1 = references[i - 1];
        var r2 = references[i];

        expect((r1.startTime < r2.startTime) ||
               (r1.startTime == r2.startTime &&
                r1.endTime <= r2.endTime)).toBeTruthy();
      }
    }
  });

  describe('evict', function() {
    var actual1, actual2, actual3, index1;

    beforeEach(function() {
      actual1 = makeReference(0, 10, uri(0));
      actual2 = makeReference(10, 20, uri(10));
      actual3 = makeReference(20, 30, uri(20));
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
   * @param {number} startTime
   * @param {number} endTime
   * @param {string} uri
   * @return {!shaka.media.SegmentReference}
   */
  function makeReference(startTime, endTime, uri) {
    return new shaka.media.SegmentReference(startTime, endTime, [uri], 0, null);
  }

  /**
   * Creates a URI string.
   *
   * @param {string|number} x
   */
  function uri(x) {
    return 'http://example.com/video_' + x + '.m4s';
  }
});

