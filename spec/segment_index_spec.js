/**
 * Copyright 2014 Google Inc.
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
 *
 * @fileoverview segment_index.js unit tests.
 */

goog.require('goog.Uri');
goog.require('shaka.media.SegmentIndex');
goog.require('shaka.media.SegmentMetadata');
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
        new shaka.media.SegmentReference(0, 10, 0, null, url(0)),
        new shaka.media.SegmentReference(10, 20, 0, null, url(1)),
        new shaka.media.SegmentReference(20, 30, 0, null, url(2))
      ];
      index1 = new shaka.media.SegmentIndex(references1);
    });

    it('starting before start, ending before start', function() {
      //    Old:                 |----|
      //    New: |====|====|====|
      // Merged:                 |----|
      var references2 = [
        new shaka.media.SegmentReference(31, 41, 0, null, url(31))
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
        new shaka.media.SegmentReference(30, 40, 0, null, url(30))
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
        new shaka.media.SegmentReference(21, 31, 0, null, url(21))
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
        new shaka.media.SegmentReference(20, 30, 0, null, url(20))
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
        new shaka.media.SegmentReference(5, 15, 0, null, url(5)),
        new shaka.media.SegmentReference(15, 25, 0, null, url(15))
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
        new shaka.media.SegmentReference(0, 10, 0, null, url(100)),
        new shaka.media.SegmentReference(10, 20, 0, null, url(110))
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
        new shaka.media.SegmentReference(15, 25, 0, null, url(15)),
        new shaka.media.SegmentReference(25, 35, 0, null, url(25)),
        new shaka.media.SegmentReference(35, 45, 0, null, url(35))
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
        new shaka.media.SegmentReference(10, 20, 0, null, url(10)),
        new shaka.media.SegmentReference(20, 30, 0, null, url(20)),
        new shaka.media.SegmentReference(30, 40, 0, null, url(30))
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
        new shaka.media.SegmentReference(30, 40, 0, null, url(30)),
        new shaka.media.SegmentReference(40, 50, 0, null, url(40)),
        new shaka.media.SegmentReference(50, 60, 0, null, url(50))
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
        new shaka.media.SegmentReference(31, 41, 0, null, url(31)),
        new shaka.media.SegmentReference(41, 51, 0, null, url(41)),
        new shaka.media.SegmentReference(51, 61, 0, null, url(51))
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
        new shaka.media.SegmentReference(10, 20, 0, null, url(10)),
        new shaka.media.SegmentReference(20, 30, 0, null, url(20)),
        new shaka.media.SegmentReference(30, 40, 0, null, url(30))
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
        new shaka.media.SegmentReference(10, 20, 0, null, url(10)),
        new shaka.media.SegmentReference(20, 30, 0, null, url(20)),
        new shaka.media.SegmentReference(30, 40, 0, null, url(30))
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

