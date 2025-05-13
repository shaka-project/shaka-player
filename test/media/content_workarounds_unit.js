/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ContentWorkarounds', () => {
  const Util = shaka.test.Util;

  describe('fakeEncryption', () => {
    const fakeStream = shaka.test.StreamingEngineUtil.createMockVideoStream(1);

    const encryptionBoxes = {
      'encv': [
        'hev1',
        'hvc1',
        'avc1',
        'avc3',
        'dvav',
        'dva1',
        'dvh1',
        'dvhe',
        'dvc1',
        'dvi1',
      ],
      'enca': [
        'ac-3',
        'ec-3',
        'ac-4',
        'Opus',
        'fLaC',
        'mp4a',
      ],
    };
    for (const encryptionBox of Object.keys(encryptionBoxes)) {
      for (const box of encryptionBoxes[encryptionBox]) {
        it(`adds ${encryptionBox} box for ${box}`, () => {
          const unencrypted = new Uint8Array([
            0x00, 0x00, 0x00, 0x20, // size
            0x73, 0x74, 0x73, 0x64, // stsd
            0x01,                   // version
            0x12, 0x34, 0x56,       // flags
            0x00, 0x00, 0x00, 0x01, // count
            0x00, 0x00, 0x00, 0x10, // size
            ...boxNameToArray(box), // box type
            0x01,                   // version
            0x12, 0x34, 0x56,       // flags
            0x00, 0x11, 0x22, 0x33, // payload
          ]);

          const faked = shaka.media.ContentWorkarounds.fakeEncryption(
              fakeStream, unencrypted, null);
          const spy = jasmine.createSpy('boxCallback');
          new shaka.util.Mp4Parser()
              .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
              .box(encryptionBox, Util.spyFunc(spy))
              .parse(faked);
          expect(spy).toHaveBeenCalled();
        });
      }
    }

    it('faked encryption on Edge returns two init segments', () => {
      spyOn(deviceDetected, 'requiresClearAndEncryptedInitSegments')
          .and.returnValue(true);

      const unencrypted = new Uint8Array([
        0x00, 0x00, 0x00, 0x20, // size
        0x73, 0x74, 0x73, 0x64, // stsd
        0x01,                   // version
        0x12, 0x34, 0x56,       // flags
        0x00, 0x00, 0x00, 0x01, // count
        0x00, 0x00, 0x00, 0x10, // size
        0x61, 0x76, 0x63, 0x31, // avc1
        0x01,                   // version
        0x12, 0x34, 0x56,       // flags
        0x00, 0x11, 0x22, 0x33, // payload
      ]);

      const faked = shaka.media.ContentWorkarounds.fakeEncryption(
          fakeStream, unencrypted, null);
      const stsdSpy = jasmine.createSpy('stsdCallback').and
          .callFake(shaka.util.Mp4Parser.sampleDescription);
      const encvSpy = jasmine.createSpy('encvCallback');
      new shaka.util.Mp4Parser()
          .fullBox('stsd', Util.spyFunc(stsdSpy))
          .box('encv', Util.spyFunc(encvSpy))
          .parse(faked);
      // 2 init segments
      expect(stsdSpy).toHaveBeenCalledTimes(2);
      // but only one encrypted
      expect(encvSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('fakeMediaEncryption', () => {
    it('replaces sample description index when no data offset', () => {
      const media = new Uint8Array([
        0x00, 0x00, 0x00, 0x14,    // size
        ...boxNameToArray('tfhd'), // tfhd
        0x00, 0x00, 0x00, 0x02,    // version & flags
        0x00, 0x00, 0x00, 0x01,    // track id
        0x00, 0x00, 0x00, 0x01,    // sample description index
        0x00, 0x00, 0x00, 0x08,    // mdat size
        ...boxNameToArray('mdat'), // mdat
      ]);
      let view = shaka.util.BufferUtils.toDataView(media);
      expect(view.getUint32(16)).toBe(1);

      const modified =
          shaka.media.ContentWorkarounds.fakeMediaEncryption(media);
      view = shaka.util.BufferUtils.toDataView(modified);
      expect(view.getUint32(16)).toBe(2);
    });

    it('replaces sample description index when there is data offset', () => {
      const media = new Uint8Array([
        0x00, 0x00, 0x00, 0x1c,    // size
        ...boxNameToArray('tfhd'), // tfhd
        0x00, 0x00, 0x00, 0x03,    // version & flags
        0x00, 0x00, 0x00, 0x01,    // track id
        0x00, 0x00, 0x00, 0x00,    // base data offset (high)
        0x00, 0x00, 0x00, 0x00,    // base data offset (low)
        0x00, 0x00, 0x00, 0x01,    // sample description index
        0x00, 0x00, 0x00, 0x08,    // mdat size
        ...boxNameToArray('mdat'), // mdat
      ]);
      let view = shaka.util.BufferUtils.toDataView(media);
      expect(view.getUint32(24)).toBe(1);

      const modified =
          shaka.media.ContentWorkarounds.fakeMediaEncryption(media);
      view = shaka.util.BufferUtils.toDataView(modified);
      expect(view.getUint32(24)).toBe(2);
    });

    it('adds sample description index when missing', () => {
      const media = new Uint8Array([
        0x00, 0x00, 0x00, 0x10,    // size
        ...boxNameToArray('tfhd'), // tfhd
        0x00, 0x00, 0x00, 0x00,    // version & flags
        0x00, 0x00, 0x00, 0x01,    // track id
        0x00, 0x00, 0x00, 0x08,    // mdat size
        ...boxNameToArray('mdat'), // mdat
      ]);
      let view = shaka.util.BufferUtils.toDataView(media);
      expect(view.getUint32(0)).toBe(16);
      expect(view.getUint32(8)).toBe(0);

      const modified =
          shaka.media.ContentWorkarounds.fakeMediaEncryption(media);
      view = shaka.util.BufferUtils.toDataView(modified);
      // Size needs to be updated
      expect(view.getUint32(0)).toBe(20);
      // Sample description index flag is added
      expect(view.getUint32(8)).toBe(2);
      expect(view.getUint32(16)).toBe(2);
    });

    it('adjusts trun data offset', () => {
      const media = new Uint8Array([
        0x00, 0x00, 0x00, 0x10,    // tfhd size
        ...boxNameToArray('tfhd'), // tfhd
        0x00, 0x00, 0x00, 0x00,    // version & flags
        0x00, 0x00, 0x00, 0x01,    // track id
        0x00, 0x00, 0x00, 0x14,    // trun size
        ...boxNameToArray('trun'), // trun
        0x00, 0x00, 0x00, 0x01,    // version & flags
        0x00, 0x00, 0x00, 0x00,    // sample count
        0x00, 0x00, 0x00, 0x01,    // data offset
        0x00, 0x00, 0x00, 0x08,    // mdat size
        ...boxNameToArray('mdat'), // mdat
      ]);
      let view = shaka.util.BufferUtils.toDataView(media);
      expect(view.getUint32(0)).toBe(16);
      expect(view.getUint32(8)).toBe(0);

      const modified =
          shaka.media.ContentWorkarounds.fakeMediaEncryption(media);
      view = shaka.util.BufferUtils.toDataView(modified);
      // Size needs to be updated
      expect(view.getUint32(0)).toBe(20);
      // Sample description index flag is added
      expect(view.getUint32(8)).toBe(2);
      expect(view.getUint32(16)).toBe(2);

      expect(view.getUint32(36)).toBe(5);
    });

    it('adjusts sizes of ancestor boxes', () => {
      const media = new Uint8Array([
        0x00, 0x00, 0x00, 0x34,    // moof size
        ...boxNameToArray('moof'), // moof
        0x00, 0x00, 0x00, 0x2c,    // traf size
        ...boxNameToArray('traf'), // traf
        0x00, 0x00, 0x00, 0x10,    // tfhd size
        ...boxNameToArray('tfhd'), // tfhd
        0x00, 0x00, 0x00, 0x00,    // version & flags
        0x00, 0x00, 0x00, 0x01,    // track id
        0x00, 0x00, 0x00, 0x14,    // trun size
        ...boxNameToArray('trun'), // trun
        0x00, 0x00, 0x00, 0x01,    // version & flags
        0x00, 0x00, 0x00, 0x00,    // sample count
        0x00, 0x00, 0x00, 0x01,    // data offset
        0x00, 0x00, 0x00, 0x08,    // mdat size
        ...boxNameToArray('mdat'), // mdat
      ]);
      let view = shaka.util.BufferUtils.toDataView(media);
      expect(view.getUint32(0)).toBe(52); // moof size
      expect(view.getUint32(8)).toBe(44); // traf size
      expect(view.getUint32(16)).toBe(16); // tfhd size
      expect(view.getUint32(32)).toBe(20); // trun size

      const modified =
          shaka.media.ContentWorkarounds.fakeMediaEncryption(media);
      view = shaka.util.BufferUtils.toDataView(modified);

      expect(view.getUint32(0)).toBe(56); // moof size
      expect(view.getUint32(8)).toBe(48); // traf size
      expect(view.getUint32(16)).toBe(20); // tfhd size
      expect(view.getUint32(36)).toBe(20); // trun size

      expect(view.getUint32(24)).toBe(2); // sample description index flag
      expect(view.getUint32(32)).toBe(2); // sample description index

      expect(view.getUint32(52)).toBe(5); // data offset
    });
  });

  describe('fakeEC3', () => {
    it('replaces ac-3 with ec-3', () => {
      const unchanged = new Uint8Array([
        0x00, 0x00, 0x00, 0x3f, // size
        0x73, 0x74, 0x73, 0x64, // stsd
        0x00,                   // version
        0x00, 0x00, 0x00,       // flags
        0x00, 0x00, 0x00, 0x01, // count
        0x00, 0x00, 0x00, 0x2f, // size
        0x61, 0x63, 0x2d, 0x33, // box type ac-3
        0x00,                   // version
        0x00, 0x00, 0x00,       // flags
        0x00, 0x00, 0x00, 0x01, // payload
        0x00, 0x00, 0x00, 0x00, // payload
        0x00, 0x00, 0x00, 0x00, // payload
        0x00, 0x02, 0x00, 0x10, // payload
        0x00, 0x00, 0x00, 0x00, // payload
        0xbb, 0x80, 0x00, 0x00, // payload
        0x00, 0x00, 0x00, 0x0B, // size
        0x64, 0x61, 0x63, 0x33, // box type dac3
        0x0C, 0x11, 0xe0,       // payload
      ]);
      const faked = shaka.media.ContentWorkarounds.fakeEC3(unchanged);
      const spy = jasmine.createSpy('boxCallback');
      new shaka.util.Mp4Parser()
          .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
          .box('ec-3', Util.spyFunc(spy))
          .parse(faked);
      expect(spy).toHaveBeenCalled();
    });

    describe('enca correction', () => {
      const initSegmentUri = '/base/test/test/assets/incorrect-enca-init.mp4';
      /** @type {!ArrayBuffer} */
      let initSegmentData;

      const getChannelCount = (initSegment) => {
        let channelCount = 0;
        new shaka.util.Mp4Parser()
            .box('moov', shaka.util.Mp4Parser.children)
            .box('trak', shaka.util.Mp4Parser.children)
            .box('mdia', shaka.util.Mp4Parser.children)
            .box('minf', shaka.util.Mp4Parser.children)
            .box('stbl', shaka.util.Mp4Parser.children)
            .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
            .box('enca', (box) => {
              const data = shaka.util.Mp4BoxParsers
                  .audioSampleEntry(box.reader);
              channelCount = data.channelCount;
            }).parse(initSegment);
        return channelCount;
      };

      beforeEach(async () => {
        initSegmentData = await shaka.test.Util.fetch(initSegmentUri);
      });

      it('should replace the ChannelCount in the enca box', () => {
        const ContentWorkarounds = shaka.media.ContentWorkarounds;
        expect(getChannelCount(initSegmentData)).toBe(7);

        const modified = ContentWorkarounds.correctEnca(initSegmentData);
        expect(getChannelCount(modified)).toBe(2);
      });
    });
  });

  /**
   * @param {string} boxName
   * @return {!Array<number>}
   */
  function boxNameToArray(boxName) {
    const boxType = [];
    for (const char of boxName) {
      boxType.push(char.charCodeAt(0));
    }
    return boxType;
  }
});
