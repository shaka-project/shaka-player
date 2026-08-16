/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ContentWorkarounds', () => {
  const Util = shaka.test.Util;

  describe('fakeEncryption', () => {
    /** @type {!shaka.extern.Stream} */
    let fakeStream;

    beforeEach(() => {
      fakeStream = shaka.test.StreamingEngineUtil.createMockVideoStream(1);
      fakeStream.encrypted = true;
    });

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
              fakeStream, unencrypted, null, null);
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
          fakeStream, unencrypted, null, null);
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

    it('inserts PSSH boxes', () => {
      const initData = {
        initDataType: 'cenc',
        initData: new Uint8Array([
          0x00, 0x00, 0x00, 0x10, // size
          0x70, 0x73, 0x73, 0x68, // pssh
          0x00, 0x00, 0x00, 0x00, // version & flags
          0x00, 0x00, 0x00, 0x00, // system id
        ]),
      };
      fakeStream.drmInfos.push(shaka.util.ManifestParserUtils.createDrmInfo(
          'com.widevine.alpha', 'cenc', [initData]));
      const initSegment = new Uint8Array([
        0x00, 0x00, 0x00, 0x28, // size
        0x6d, 0x6f, 0x6f, 0x76, // moov
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
          fakeStream, initSegment, null, null);
      const psshSpy = jasmine.createSpy('psshCallback');
      new shaka.util.Mp4Parser()
          .box('moov', shaka.util.Mp4Parser.children)
          .fullBox('pssh', Util.spyFunc(psshSpy))
          .parse(faked);
      expect(psshSpy).toHaveBeenCalled();
    });

    it('does not insert PSSH box when it is not available', () => {
      fakeStream.drmInfos = [];
      const initSegment = new Uint8Array([
        0x00, 0x00, 0x00, 0x28, // size
        0x6d, 0x6f, 0x6f, 0x76, // moov
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
          fakeStream, initSegment, null, null);
      const psshSpy = jasmine.createSpy('psshCallback');
      new shaka.util.Mp4Parser()
          .box('moov', shaka.util.Mp4Parser.children)
          .fullBox('pssh', Util.spyFunc(psshSpy))
          .parse(faked);
      expect(psshSpy).not.toHaveBeenCalled();
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

  describe('fixBrokenIframes', () => {
    // A movie fragment declaring two samples (durations from the tfhd
    // default_sample_duration of 100), whose mdat declares 8 payload bytes but
    // only carries 4 (the first sample).  This mimics an I-frame only playlist
    // that clipped the byte range without rewriting the moof.
    const brokenSegment = () => new Uint8Array([
      0x00, 0x00, 0x00, 0x50,    // moof size (80)
      ...boxNameToArray('moof'), // moof
      0x00, 0x00, 0x00, 0x10,    // mfhd size (16)
      ...boxNameToArray('mfhd'), // mfhd
      0x00, 0x00, 0x00, 0x00,    // version & flags
      0x00, 0x00, 0x00, 0x01,    // sequence number
      0x00, 0x00, 0x00, 0x38,    // traf size (56)
      ...boxNameToArray('traf'), // traf
      0x00, 0x00, 0x00, 0x14,    // tfhd size (20)
      ...boxNameToArray('tfhd'), // tfhd
      0x00, 0x00, 0x00, 0x08,    // version & flags (default_sample_duration)
      0x00, 0x00, 0x00, 0x01,    // track id
      0x00, 0x00, 0x00, 0x64,    // default_sample_duration (100)
      0x00, 0x00, 0x00, 0x1c,    // trun size (28)
      ...boxNameToArray('trun'), // trun
      0x00, 0x00, 0x02, 0x01,    // version & flags (data_offset + sample_size)
      0x00, 0x00, 0x00, 0x02,    // sample count (2)
      0x00, 0x00, 0x00, 0x58,    // data offset (88)
      0x00, 0x00, 0x00, 0x04,    // sample[0] size (4)
      0x00, 0x00, 0x00, 0x04,    // sample[1] size (4)
      0x00, 0x00, 0x00, 0x10,    // mdat size (16, declares 8 payload bytes)
      ...boxNameToArray('mdat'), // mdat
      0xde, 0xad, 0xbe, 0xef,    // sample[0] data (only 4 of 8 bytes present)
    ]);

    it('truncates the fragment to the samples that are present', () => {
      const modified =
          shaka.media.ContentWorkarounds.fixBrokenIframes(brokenSegment());
      const view = shaka.util.BufferUtils.toDataView(modified);

      // moof/traf/trun shrink by one removed sample entry (4 bytes).
      expect(view.getUint32(0)).toBe(76); // moof size
      expect(view.getUint32(24)).toBe(52); // traf size
      expect(view.getUint32(52)).toBe(24); // trun size

      // The single kept sample now carries the whole segment duration so the
      // I-frame spans the original slot (2 * 100).
      expect(view.getUint32(48)).toBe(200); // tfhd default_sample_duration

      expect(view.getUint32(64)).toBe(1); // trun sample count
      expect(view.getUint32(68)).toBe(84); // trun data offset (88 - 4)
      expect(view.getUint32(72)).toBe(4); // trun sample[0] size

      // The mdat is rebuilt to hold only the present payload.
      expect(view.getUint32(76)).toBe(12); // mdat size (header + 4)
      expect(modified.byteLength).toBe(88); // 76 (moof) + 12 (mdat)

      // The data offset points exactly at the start of the mdat payload.
      expect(view.getUint32(68)).toBe(76 + 8);
    });

    it('leaves a well-formed fragment untouched', () => {
      // Same fragment, but with both samples present in the mdat.
      const wellFormed = brokenSegment();
      const withFullMdat = new Uint8Array([
        ...wellFormed,
        0xca, 0xfe, 0xba, 0xbe, // sample[1] data (now present)
      ]);

      const modified =
          shaka.media.ContentWorkarounds.fixBrokenIframes(withFullMdat);
      expect(modified).toEqual(withFullMdat);
    });

    it('leaves a single-sample fragment untouched', () => {
      const singleSample = new Uint8Array([
        0x00, 0x00, 0x00, 0x4c,    // moof size (76)
        ...boxNameToArray('moof'), // moof
        0x00, 0x00, 0x00, 0x10,    // mfhd size (16)
        ...boxNameToArray('mfhd'), // mfhd
        0x00, 0x00, 0x00, 0x00,    // version & flags
        0x00, 0x00, 0x00, 0x01,    // sequence number
        0x00, 0x00, 0x00, 0x34,    // traf size (52)
        ...boxNameToArray('traf'), // traf
        0x00, 0x00, 0x00, 0x14,    // tfhd size (20)
        ...boxNameToArray('tfhd'), // tfhd
        0x00, 0x00, 0x00, 0x08,    // version & flags
        0x00, 0x00, 0x00, 0x01,    // track id
        0x00, 0x00, 0x00, 0x64,    // default_sample_duration (100)
        0x00, 0x00, 0x00, 0x18,    // trun size (24)
        ...boxNameToArray('trun'), // trun
        0x00, 0x00, 0x02, 0x01,    // version & flags
        0x00, 0x00, 0x00, 0x01,    // sample count (1)
        0x00, 0x00, 0x00, 0x54,    // data offset (84)
        0x00, 0x00, 0x00, 0x04,    // sample[0] size (4)
        0x00, 0x00, 0x00, 0x0c,    // mdat size (12)
        ...boxNameToArray('mdat'), // mdat
        0xde, 0xad, 0xbe, 0xef,    // sample[0] data
      ]);

      const modified =
          shaka.media.ContentWorkarounds.fixBrokenIframes(singleSample);
      expect(modified).toEqual(singleSample);
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
            .boxes([
              'moov',
              'trak',
              'mdia',
              'minf',
              'stbl',
            ], shaka.util.Mp4Parser.children)
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

    describe('remove dvvC box', () => {
      const initSegmentUri =
          '/base/test/test/assets/' +
          'dv-p8-1-hevc/media-video-hvc1-dvh1-db1p-1.mp4';
      /** @type {!ArrayBuffer} */
      let initSegmentData;

      const getBox = (initSegment, type) => {
        let box = null;
        new shaka.util.Mp4Parser()
            .boxes([
              'moov',
              'trak',
              'mdia',
              'minf',
              'stbl',
            ], shaka.util.Mp4Parser.children)
            .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
            .box('hvc1', shaka.util.Mp4Parser.visualSampleEntry)
            .box(type, (_box) => {
              box = _box;
            }).parse(initSegment);
        return box;
      };

      beforeEach(async () => {
        initSegmentData = await shaka.test.Util.fetch(initSegmentUri);
      });

      it('should replace the dvvC box type with free', () => {
        const ContentWorkarounds = shaka.media.ContentWorkarounds;
        expect(getBox(initSegmentData, 'dvvC')).not.toBeNull();
        expect(getBox(initSegmentData, 'free')).toBeNull();

        const modified = ContentWorkarounds.freeDvvcBox(initSegmentData);
        expect(getBox(modified, 'dvvC')).toBeNull();
        expect(getBox(modified, 'free')).not.toBeNull();
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
