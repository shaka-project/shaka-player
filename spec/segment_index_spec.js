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

goog.require('goog.Uri');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentReference');
goog.require('shaka.media.WebmSegmentIndexParser');

// TODO: Write tests for evict.
describe('SegmentIndex', function() {
  describe('merge', function() {
    var index1;

    function url(i) {
      return 'http://example.com/video' + i;
    }

    beforeEach(function() {
      var references1 = [
        createReference(0, 10, url(0)),
        createReference(10, 20, url(1)),
        createReference(20, 30, url(2))
      ];
      index1 = new shaka.media.SegmentIndex(references1);
    });

    it('starting before start, ending before start', function() {
      //    Old:                 |----|
      //    New: |====|====|====|
      // Merged:                 |----|
      var references2 = [
        createReference(31, 41, url(31))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index2.merge(index1);
      var merged = index2.references;

      // All new segments should be ignored.
      expect(merged.length).toBe(1);
      checkReference(merged[0], url(31), 31, 41);
    });

    it('starting before start, ending at start', function() {
      //    Old:                |----|
      //    New: |====|====|====|
      // Merged:                |----|
      var references2 = [
        createReference(30, 40, url(30))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index2.merge(index1);
      var merged = index2.references;

      // All new segments should be ignored.
      expect(merged.length).toBe(1);
      checkReference(merged[0], url(30), 30, 40);
    });

    it('starting before start, ending before end', function() {
      //    Old:            |----|
      //    New: |====|====|====|
      // Merged:            |----|
      var references2 = [
        createReference(21, 31, url(21))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index2.merge(index1);
      var merged = index2.references;

      // All new segments should be ignored.
      expect(merged.length).toBe(1);
      checkReference(merged[0], url(21), 21, 31);
    });

    it('starting before start, ending at end', function() {
      //    Old:           |----|
      //    New: |====|====|====|
      // Merged: |====|====|====|
      var references2 = [
        createReference(20, 30, url(20))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index2.merge(index1);
      var merged = index2.references;

      expect(merged.length).toBe(3);
      checkReference(merged[0], url(0), 0, 10);
      checkReference(merged[1], url(1), 10, 20);
      checkReference(merged[2], url(2), 20, 30);
    });

    it('starting before start, ending past end', function() {
      //    Old:    |----|----|
      //    New: |====|====|====|
      // Merged: |====|====|====|
      var references2 = [
        createReference(5, 15, url(5)),
        createReference(15, 25, url(15))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index2.merge(index1);
      var merged = index2.references;

      expect(merged.length).toBe(3);
      checkReference(merged[0], url(0), 0, 10);
      checkReference(merged[1], url(1), 10, 20);
      checkReference(merged[2], url(2), 20, 30);
    });

    it('starting at start, ending past end', function() {
      //    Old: |----|----|
      //    New: |====|====|====|
      // Merged: |====|====|====|
      var references2 = [
        createReference(0, 10, url(100)),
        createReference(10, 20, url(110))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index2.merge(index1);
      var merged = index2.references;

      expect(merged.length).toBe(3);
      checkReference(merged[0], url(0), 0, 10);
      checkReference(merged[1], url(1), 10, 20);
      checkReference(merged[2], url(2), 20, 30);
    });

    it('starting in middle, ending past end', function() {
      //    Old: |----|----|----|
      //    New:         |====|====|====|
      // Merged: |----|--|====|====|====|
      var references2 = [
        createReference(15, 25, url(15)),
        createReference(25, 35, url(25)),
        createReference(35, 45, url(35))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index1.merge(index2);
      var merged = index1.references;

      expect(merged.length).toBe(5);
      checkReference(merged[0], url(0), 0, 10);
      checkReference(merged[1], url(1), 10, 15);  // Should compress to 15.
      checkReference(merged[2], url(15), 15, 25);
      checkReference(merged[3], url(25), 25, 35);
      checkReference(merged[4], url(35), 35, 45);
    });

    it('starting in middle at a boundary, ending past end', function() {
      //    Old: |----|----|----|
      //    New:      |====|====|====|
      // Merged: |----|====|====|====|
      var references2 = [
        createReference(10, 20, url(10)),
        createReference(20, 30, url(20)),
        createReference(30, 40, url(30))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index1.merge(index2);
      var merged = index1.references;

      expect(merged.length).toBe(4);
      checkReference(merged[0], url(0), 0, 10);
      checkReference(merged[1], url(10), 10, 20);
      checkReference(merged[2], url(20), 20, 30);
      checkReference(merged[3], url(30), 30, 40);
    });

    it('starting at end', function() {
      //    Old: |----|----|----|
      //    New:                |====|====|====|
      // Merged: |----|----|----|====|====|====|
      var references2 = [
        createReference(30, 40, url(30)),
        createReference(40, 50, url(40)),
        createReference(50, 60, url(50))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index1.merge(index2);
      var merged = index1.references;

      expect(merged.length).toBe(6);
      checkReference(merged[0], url(0), 0, 10);
      checkReference(merged[1], url(1), 10, 20);
      checkReference(merged[2], url(2), 20, 30);
      checkReference(merged[3], url(30), 30, 40);
      checkReference(merged[4], url(40), 40, 50);
      checkReference(merged[5], url(50), 50, 60);
    });

    it('starting past end', function() {
      //    Old: |----|----|----|
      //    New:                 |====|====|====|
      // Merged: |----|----|-----|====|====|====|
      var references2 = [
        createReference(31, 41, url(31)),
        createReference(41, 51, url(41)),
        createReference(51, 61, url(51))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index1.merge(index2);
      var merged = index1.references;

      expect(merged.length).toBe(6);
      checkReference(merged[0], url(0), 0, 10);
      checkReference(merged[1], url(1), 10, 20);
      checkReference(merged[2], url(2), 20, 31);  // Should extend to 31.
      checkReference(merged[3], url(31), 31, 41);
      checkReference(merged[4], url(41), 41, 51);
      checkReference(merged[5], url(51), 51, 61);
    });

    it('no existing segments', function() {
      index1 = new shaka.media.SegmentIndex([]);

      var references2 = [
        createReference(10, 20, url(10)),
        createReference(20, 30, url(20)),
        createReference(30, 40, url(30))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index1.merge(index2);
      var merged = index1.references;

      expect(merged.length).toBe(3);
      checkReference(merged[0], url(10), 10, 20);
      checkReference(merged[1], url(20), 20, 30);
      checkReference(merged[2], url(30), 30, 40);
    });

    it('no new segments', function() {
      index1 = new shaka.media.SegmentIndex([]);

      var references2 = [
        createReference(10, 20, url(10)),
        createReference(20, 30, url(20)),
        createReference(30, 40, url(30))
      ];
      var index2 = new shaka.media.SegmentIndex(references2);

      index2.merge(index1);
      var merged = index2.references;

      expect(merged.length).toBe(3);
      checkReference(merged[0], url(10), 10, 20);
      checkReference(merged[1], url(20), 20, 30);
      checkReference(merged[2], url(30), 30, 40);
    });
  });
});

