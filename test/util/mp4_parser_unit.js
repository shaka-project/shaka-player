/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4Parser', () => {
  const Util = shaka.test.Util;

  let boxData;
  let fullBoxData;
  let boxWithChildData;
  let fullBoxWithChildData;
  let boxWithSampleDescription;
  let partialBoxWithSampleDescription;
  let multipleSingleLevelBoxes;
  let twoLevelBoxStructure;

  beforeAll(() => {
    boxData = new Uint8Array([
      0x00, 0x00, 0x00, 0x0C, // size
      0x62, 0x30, 0x30, 0x31, // type
      0x00, 0x11, 0x22, 0x33,  // payload
    ]);

    fullBoxData = new Uint8Array([
      0x00, 0x00, 0x00, 0x10, // size
      0x62, 0x30, 0x30, 0x31, // type
      0x01,                   // version
      0x12, 0x34, 0x56,       // flags
      0x00, 0x11, 0x22, 0x33,  // payload
    ]);

    boxWithChildData = new Uint8Array([
      0x00, 0x00, 0x00, 0x14, // size
      0x62, 0x30, 0x30, 0x33, // type
      0x00, 0x00, 0x00, 0x0C, // child [0] size
      0x62, 0x30, 0x33, 0x31, // child [0] type
      0x00, 0x11, 0x22, 0x33, // child [0] payload
      0x00, 0x00, 0x00, 0x0C, // child [1] size
      0x62, 0x30, 0x33, 0x32, // child [1] type
      0x44, 0x55, 0x66, 0x77,  // child [1] payload
    ]);

    fullBoxWithChildData = new Uint8Array([
      0x00, 0x00, 0x00, 0x18, // size
      0x62, 0x30, 0x30, 0x33, // type
      0x01,                   // version
      0x12, 0x34, 0x56,       // flags
      0x00, 0x00, 0x00, 0x0C, // child [0] size
      0x62, 0x30, 0x33, 0x31, // child [0] type
      0x00, 0x11, 0x22, 0x33, // child [0] payload
      0x00, 0x00, 0x00, 0x0C, // child [1] size
      0x62, 0x30, 0x33, 0x32, // child [1] type
      0x44, 0x55, 0x66, 0x77,  // child [1] payload
    ]);

    boxWithSampleDescription = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, // size
      0x62, 0x30, 0x30, 0x33, // type
      0x00, 0x00, 0x00, 0x02, // number of chidren
      0x00, 0x00, 0x00, 0x0C, // child [0] size
      0x62, 0x30, 0x33, 0x32, // child [0] type
      0x00, 0x11, 0x22, 0x33, // child [0] payload
      0x00, 0x00, 0x00, 0x0C, // child [1] size
      0x62, 0x30, 0x33, 0x33, // child [1] type
      0x44, 0x55, 0x66, 0x77,  // child [1] payload
    ]);

    partialBoxWithSampleDescription = new Uint8Array([
      0x00, 0x00, 0x00, 0x24, // size
      0x62, 0x30, 0x30, 0x33, // type
      0x00, 0x00, 0x00, 0x02, // number of chidren
      0x00, 0x00, 0x00, 0x0C, // child [0] size
      0x62, 0x30, 0x33, 0x32, // child [0] type
      0x00, 0x11, 0x22, 0x33,  // child [0] payload
      // Omit child [1]
    ]);

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
      0x00, 0x11, 0x22, 0x33,  // box [3] payload
    ]);

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
      0x00, 0x11, 0x22, 0x33,  // box [3] [0] payload
    ]);
  });

  describe('headerDefinitions', () => {
    it('reads box header', () => {
      const callback = jasmine.createSpy('parser callback').and.callFake(
          (box) => {
            expect(box.start).toBe(0);
            expect(box.size).toBe(12);
            expect(box.version).toBe(null);
            expect(box.flags).toBe(null);
          });

      new shaka.util.Mp4Parser()
          .box('b001', Util.spyFunc(callback)).parse(boxData);

      expect(callback).toHaveBeenCalled();
    });

    it('reads full box header', () => {
      const callback = jasmine.createSpy('parser callback').and.callFake(
          (box) => {
            expect(box.start).toBe(0);
            expect(box.size).toBe(16);
            expect(box.version).toBe(1);
            expect(box.flags).toBe(0x123456);
          });

      new shaka.util.Mp4Parser()
          .fullBox('b001', Util.spyFunc(callback)).parse(fullBoxData);

      expect(callback).toHaveBeenCalled();
    });
  });

  describe('boxDefinitions', () => {
    it('reads children definition', () => {
      const parentBox = jasmine.createSpy('parent box').and.callFake(
          shaka.util.Mp4Parser.children);

      const childBox1 = jasmine.createSpy('child box 1');
      const childBox2 = jasmine.createSpy('child box 2');

      new shaka.util.Mp4Parser()
          .box('b003', Util.spyFunc(parentBox))
          .box('b031', Util.spyFunc(childBox1))
          .box('b032', Util.spyFunc(childBox2)).parse(boxWithChildData);

      expect(parentBox).toHaveBeenCalled();
      expect(childBox1).toHaveBeenCalledWith(jasmine.objectContaining({
        start: 8,
        size: 12,
        version: null,
        flags: null,
      }));
      expect(childBox2).toHaveBeenCalledWith(jasmine.objectContaining({
        start: 20,
        size: 12,
        version: null,
        flags: null,
      }));
    });

    it('reads children definition with full boxes', () => {
      const parentBox = jasmine.createSpy('parent box').and.callFake(
          shaka.util.Mp4Parser.children);

      const childBox1 = jasmine.createSpy('child box 1');
      const childBox2 = jasmine.createSpy('child box 2');

      new shaka.util.Mp4Parser()
          .fullBox('b003', Util.spyFunc(parentBox))
          .box('b031', Util.spyFunc(childBox1))
          .box('b032', Util.spyFunc(childBox2)).parse(fullBoxWithChildData);

      expect(parentBox).toHaveBeenCalled();
      expect(childBox1).toHaveBeenCalledWith(jasmine.objectContaining({
        start: 12,
        size: 12,
        version: null,
        flags: null,
      }));
      expect(childBox2).toHaveBeenCalledWith(jasmine.objectContaining({
        start: 24,
        size: 12,
        version: null,
        flags: null,
      }));
    });

    it('stops reading children when asked to', () => {
      const parentBox = jasmine.createSpy('parent box').and.callFake(
          shaka.util.Mp4Parser.children);

      const childBox1 = jasmine.createSpy('child box 1').and.callFake(
          (box) => {
            box.parser.stop();
          });

      const childBox2 = jasmine.createSpy('child box 2');

      new shaka.util.Mp4Parser()
          .box('b003', Util.spyFunc(parentBox))
          .box('b031', Util.spyFunc(childBox1))
          .box('b032', Util.spyFunc(childBox2)).parse(boxWithChildData);

      expect(parentBox).toHaveBeenCalled();
      expect(childBox1).toHaveBeenCalled();
      expect(childBox2).not.toHaveBeenCalled();
    });

    it('reads all data definition', () => {
      let payload = [];

      new shaka.util.Mp4Parser()
          .box('b001', shaka.util.Mp4Parser.allData(
              (data) => {
                payload = data;
              })).parse(boxData);

      expect(payload.length).toBe(4);
      expect(payload[0]).toBe(0x00);
      expect(payload[1]).toBe(0x11);
      expect(payload[2]).toBe(0x22);
      expect(payload[3]).toBe(0x33);
    });

    it('reads sample description definition', () => {
      const parentBox = jasmine.createSpy('parent box').and.callFake(
          shaka.util.Mp4Parser.sampleDescription);
      const childBox1 = jasmine.createSpy('child box 1');
      const childBox2 = jasmine.createSpy('child box 2');

      new shaka.util.Mp4Parser()
          .box('b003', Util.spyFunc(parentBox))
          .box('b032', Util.spyFunc(childBox1))
          .box('b033', Util.spyFunc(childBox2)).parse(boxWithSampleDescription);

      expect(parentBox).toHaveBeenCalledTimes(1);
      expect(childBox1).toHaveBeenCalledTimes(1);
      expect(childBox1).toHaveBeenCalledWith(jasmine.objectContaining({
        start: 12,
        size: 12,
        version: null,
        flags: null,
      }));
      expect(childBox2).toHaveBeenCalledTimes(1);
      expect(childBox2).toHaveBeenCalledWith(jasmine.objectContaining({
        start: 24,
        size: 12,
        version: null,
        flags: null,
      }));
    });

    it('stops reading sample description when asked to', () => {
      const parentBox = jasmine.createSpy('parent box').and.callFake(
          shaka.util.Mp4Parser.sampleDescription);
      const childBox1 = jasmine.createSpy('child box 1').and.callFake(
          (box) => {
            box.parser.stop();
          });
      const childBox2 = jasmine.createSpy('child box 2');

      new shaka.util.Mp4Parser()
          .box('b003', Util.spyFunc(parentBox))
          .box('b032', Util.spyFunc(childBox1))
          .box('b033', Util.spyFunc(childBox2)).parse(boxWithSampleDescription);

      expect(parentBox).toHaveBeenCalledTimes(1);
      expect(childBox1).toHaveBeenCalledTimes(1);
      expect(childBox2).not.toHaveBeenCalled();
    });
  });

  describe('parsing', () => {
    it('finds all top level boxes', () => {
      const box1 = jasmine.createSpy('box 1');
      const box2 = jasmine.createSpy('box 2');
      const box3 = jasmine.createSpy('box 3');

      new shaka.util.Mp4Parser()
          .box('b001', Util.spyFunc(box1))
          .box('b002', Util.spyFunc(box2))
          .box('b003', Util.spyFunc(box3)).parse(multipleSingleLevelBoxes);

      expect(box1).toHaveBeenCalled();
      expect(box2).toHaveBeenCalled();
      expect(box3).toHaveBeenCalled();
    });

    it('skips undefined top level boxes', () => {
      // By leaving a single box undefined, it should not interfere
      // with the other boxes (on the same level) from being read.

      const box1 = jasmine.createSpy('box 1');
      const box3 = jasmine.createSpy('box 3');

      new shaka.util.Mp4Parser()
          .box('b001', Util.spyFunc(box1))
          .box('b003', Util.spyFunc(box3)).parse(multipleSingleLevelBoxes);

      expect(box1).toHaveBeenCalled();
      expect(box3).toHaveBeenCalled();
    });

    it('does not parse child boxes with undefined parent box', () => {
      const box1 = jasmine.createSpy('box 1');
      const box2Child = jasmine.createSpy('box 2 child');
      const box3 = jasmine.createSpy('box 3');

      // Listing a definition for box 2's child but not for box 2 should mean
      // box 2's child is never parsed.
      new shaka.util.Mp4Parser()
          .box('b010', Util.spyFunc(box1))
          .box('b021', Util.spyFunc(box2Child))
          .box('b030', Util.spyFunc(box3)).parse(twoLevelBoxStructure);

      expect(box1).toHaveBeenCalled();
      expect(box2Child).not.toHaveBeenCalled();
      expect(box3).toHaveBeenCalled();
    });

    it('can parse partial parent box and find first child', () => {
      const parentBox = jasmine.createSpy('parent box').and.callFake(
          shaka.util.Mp4Parser.sampleDescription);

      const childBox1 = jasmine.createSpy('child box 1').and.callFake(
          (box) => {
            // We found what we were looking for, so stop parsing.
            box.parser.stop();
          });

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MEDIA,
          shaka.util.Error.Code.BUFFER_READ_OUT_OF_BOUNDS));
      expect(() => {
        new shaka.util.Mp4Parser()
            .box('b003', Util.spyFunc(parentBox))
            .box('b032', Util.spyFunc(childBox1))
            .parse(partialBoxWithSampleDescription, false /* partialOkay */);
      }).toThrow(expected);

      parentBox.calls.reset();
      childBox1.calls.reset();

      // With the partialOkay flag set to true, this should succeed.
      new shaka.util.Mp4Parser()
          .box('b003', Util.spyFunc(parentBox))
          .box('b032', Util.spyFunc(childBox1))
          .parse(partialBoxWithSampleDescription, true /* partialOkay */);

      expect(parentBox).toHaveBeenCalledTimes(1);
      expect(childBox1).toHaveBeenCalledTimes(1);
    });
  });
});
