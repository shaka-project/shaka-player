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

describe('Mp4Parser', function() {
  var boxData;
  var fullBoxData;
  var boxWithChildData;
  var boxWithSampleDescription;
  var multipleSingleLevelBoxes;
  var twoLevelBoxStructure;

  beforeAll(function() {
    boxData = new Uint8Array([
      0x00, 0x00, 0x00, 0x0C, // size
      0x62, 0x30, 0x30, 0x31, // type
      0x00, 0x11, 0x22, 0x33  // payload
    ]).buffer;

    fullBoxData = new Uint8Array([
      0x00, 0x00, 0x00, 0x10, // size
      0x62, 0x30, 0x30, 0x31, // type
      0x01,                   // version
      0x12, 0x34, 0x56,       // flags
      0x00, 0x11, 0x22, 0x33  // payload
    ]).buffer;

    boxWithChildData = new Uint8Array([
      0x00, 0x00, 0x00, 0x14, // size
      0x62, 0x30, 0x30, 0x33, // type
      0x00, 0x00, 0x00, 0x0C, // child size
      0x62, 0x30, 0x33, 0x31, // child type
      0x00, 0x11, 0x22, 0x33  // child payload
    ]).buffer;

    boxWithSampleDescription = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, // size
      0x62, 0x30, 0x30, 0x33, // type
      0x00, 0x00, 0x00, 0x02, // number of chidren
      0x00, 0x00, 0x00, 0x0C, // child [0] size
      0x62, 0x30, 0x33, 0x32, // child [0] type
      0x00, 0x11, 0x22, 0x33, // child [0] payload
      0x00, 0x00, 0x00, 0x0C, // child [1] size
      0x62, 0x30, 0x33, 0x33, // child [1] type
      0x44, 0x55, 0x66, 0x77  // child [1] payload
    ]).buffer;

    multipleSingleLevelBoxes = new Uint8Array([
      0x00, 0x00, 0x00, 0x0C, // box [0] size
      0x62, 0x30, 0x30, 0x31, // box [0] type
      0x00, 0x11, 0x22, 0x33, // box [0] payload
      0x00, 0x00, 0x00, 0x0C, // box [1] size
      0x62, 0x30, 0x30, 0x32, // box [1] type
      0x00, 0x11, 0x22, 0x33, // box [1] payload
      0x00, 0x00, 0x00, 0x0C, // box [2] size
      0x62, 0x30, 0x30, 0x33, // box [2] type
      0x00, 0x11, 0x22, 0x33, // box [2] payload
      0x00, 0x00, 0x00, 0x0C, // box [3] size
      0x62, 0x30, 0x30, 0x34, // box [3] type
      0x00, 0x11, 0x22, 0x33  // box [3] payload
    ]).buffer;

    twoLevelBoxStructure = new Uint8Array([
      0x00, 0x00, 0x00, 0x14, // box [0] size
      0x62, 0x30, 0x31, 0x30, // box [0] type
      0x00, 0x00, 0x00, 0x0C, // box [0] [0] size
      0x00, 0x30, 0x31, 0x31, // box [0] [0] type
      0x00, 0x11, 0x22, 0x33, // box [0] [0] payload
      0x00, 0x00, 0x00, 0x14, // box [1] size
      0x62, 0x30, 0x32, 0x30, // box [1] type
      0x00, 0x00, 0x00, 0x0C, // box [1] [0] size
      0x62, 0x30, 0x32, 0x31, // box [1] [0] type
      0x00, 0x11, 0x22, 0x33, // box [1] [0] payload
      0x00, 0x00, 0x00, 0x14, // box [2] size
      0x62, 0x30, 0x33, 0x30, // box [2] type
      0x00, 0x00, 0x00, 0x0C, // box [2] [0] size
      0x62, 0x30, 0x33, 0x31, // box [2] [0] type
      0x00, 0x11, 0x22, 0x33, // box [2] [0] payload
      0x00, 0x00, 0x00, 0x14, // box [3] size
      0x62, 0x30, 0x34, 0x30, // box [3] type
      0x00, 0x00, 0x00, 0x0C, // box [3] [0] size
      0x62, 0x30, 0x34, 0x31, // box [3] [0] type
      0x00, 0x11, 0x22, 0x33  // box [3] [0] payload
    ]).buffer;
  });

  describe('headerDefinitions', function() {
    it('reads box header', function() {
      var callback = jasmine.createSpy('parser callback').and.callFake(
          function(box) {
            expect(box.size).toEqual(12);
            expect(box.version).toEqual(null);
            expect(box.flags).toEqual(null);
          });

      new shaka.util.Mp4Parser()
          .box('b001', callback).parse(boxData);

      expect(callback).toHaveBeenCalled();
    });

    it('reads full box header', function() {
      var callback = jasmine.createSpy('parser callback').and.callFake(
          function(box) {
            expect(box.size).toEqual(16);
            expect(box.version).toEqual(1);
            expect(box.flags).toEqual(0x123456);
          });

      new shaka.util.Mp4Parser()
          .fullBox('b001', callback).parse(fullBoxData);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('boxDefinitions', function() {
    it('reads children definition', function() {
      var parentBox = jasmine.createSpy('parent box').and.callFake(
          shaka.util.Mp4Parser.children);

      var childBox = jasmine.createSpy('child box').and.callFake(
          function(box) {
            expect(box.size).toEqual(12);
            expect(box.version).toEqual(null);
            expect(box.flags).toEqual(null);
          });

      new shaka.util.Mp4Parser()
          .box('b003', parentBox)
          .box('b031', childBox).parse(boxWithChildData);

      expect(parentBox).toHaveBeenCalled();
      expect(childBox).toHaveBeenCalled();
    });

    it('reads all data definition', function() {
      var payload = [];

      new shaka.util.Mp4Parser()
          .box('b001', shaka.util.Mp4Parser.allData(
              function(data) {
                payload = data;
              })).parse(boxData);

      expect(payload.length).toEqual(4);
      expect(payload[0]).toEqual(0x00);
      expect(payload[1]).toEqual(0x11);
      expect(payload[2]).toEqual(0x22);
      expect(payload[3]).toEqual(0x33);
    });

    it('reads sample description definition', function() {

      var parentBox = jasmine.createSpy('parent box').and.callFake(
          shaka.util.Mp4Parser.sampleDescription);
      var childBox1 = jasmine.createSpy('child box 1');
      var childBox2 = jasmine.createSpy('child box 2');

      new shaka.util.Mp4Parser()
          .box('b003', parentBox)
          .box('b032', childBox1)
          .box('b033', childBox2).parse(boxWithSampleDescription);

      expect(parentBox).toHaveBeenCalledTimes(1);
      expect(childBox1).toHaveBeenCalledTimes(1);
      expect(childBox2).toHaveBeenCalledTimes(1);
    });
  });

  describe('parsing', function() {
    it('finds all top level boxes', function() {
      var box1 = jasmine.createSpy('box 1');
      var box2 = jasmine.createSpy('box 2');
      var box3 = jasmine.createSpy('box 3');

      new shaka.util.Mp4Parser()
          .box('b001', box1)
          .box('b002', box2)
          .box('b003', box3).parse(multipleSingleLevelBoxes);

      expect(box1).toHaveBeenCalled();
      expect(box2).toHaveBeenCalled();
      expect(box3).toHaveBeenCalled();
    });

    it('skips undefined top level boxes', function() {
      // By leaving a single box undefined, it should not interfere
      // with the other boxes (on the same level) from being read.

      var box1 = jasmine.createSpy('box 1');
      var box3 = jasmine.createSpy('box 3');

      new shaka.util.Mp4Parser()
          .box('b001', box1)
          .box('b003', box3).parse(multipleSingleLevelBoxes);

      expect(box1).toHaveBeenCalled();
      expect(box3).toHaveBeenCalled();
    });

    it('does not parse child boxes with undefined parent box', function() {
      var box1 = jasmine.createSpy('box 1');
      var box2Child = jasmine.createSpy('box 2 child');
      var box3 = jasmine.createSpy('box 3');

      // Listing a definition for box 2's child but not for box 2 should mean
      // box 2's child is never parsed.
      new shaka.util.Mp4Parser()
          .box('b010', box1)
          .box('b021', box2Child)
          .box('b030', box3).parse(twoLevelBoxStructure);

      expect(box1).toHaveBeenCalled();
      expect(box2Child).not.toHaveBeenCalled();
      expect(box3).toHaveBeenCalled();
    });
  });
});
