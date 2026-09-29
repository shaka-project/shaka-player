/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4Generator', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;

  /**
   * @param {!Object} overrides
   * @param {string} type
   * @return {shaka.util.Mp4Generator.StreamInfo}
   */
  const makeInfo = (overrides, type) => {
    const stream = shaka.util.StreamUtils.createStream({
      id: 0,
      type,
      language: 'und',
      width: 1920,
      height: 1080,
      channelsCount: 6,
      audioSamplingRate: 48000,
    });
    return /** @type {shaka.util.Mp4Generator.StreamInfo} */(Object.assign({
      id: 0,
      type,
      codecs: '',
      timescale: 90000,
      duration: 10,
      mediaConfig: new Uint8Array(0),
      data: null,
      stream,
    }, overrides));
  };

  /**
   * @param {shaka.util.Mp4Generator.StreamInfo} info
   * @return {!Uint8Array}
   */
  const makeInit = (info) => {
    return new shaka.util.Mp4Generator([info]).initSegment();
  };

  /**
   * @param {!Uint8Array} data
   * @param {string} name A four-character box name.
   * @return {number} Where the name is in the data, or -1.
   */
  const indexOfBox = (data, name) => {
    const codes = Array.from(name).map((char) => char.charCodeAt(0));
    for (let i = 0; i + codes.length <= data.length; i++) {
      if (codes.every((code, j) => data[i + j] == code)) {
        return i;
      }
    }
    return -1;
  };

  /**
   * Reads a box: what follows its name, up to the length its header gives.
   *
   * @param {!Uint8Array} data
   * @param {string} name
   * @return {!Uint8Array} The payload of the box.
   */
  const readBox = (data, name) => {
    const at = indexOfBox(data, name);
    expect(at).toBeGreaterThan(3);
    const view = shaka.util.BufferUtils.toDataView(data);
    const size = view.getUint32(at - 4);
    return data.subarray(at + 4, at - 4 + size);
  };

  describe('VP9', () => {
    it('writes a vp09 sample entry with the vpcC box', () => {
      const config = shaka.codec.VP9.buildVpcC('vp09.02.40.10.01');
      const init = makeInit(makeInfo(
          {codecs: 'vp09', mediaConfig: config}, ContentType.VIDEO));
      expect(indexOfBox(init, 'vp09')).toBeGreaterThan(0);
      expect(Array.from(readBox(init, 'vpcC'))).toEqual(Array.from(config));
    });
  });

  describe('FLAC', () => {
    it('writes a fLaC sample entry with the dfLa box', () => {
      const dfLa = new Uint8Array(4 + 4 + 34);
      dfLa[4] = 0x80;
      dfLa[7] = 34;
      const init = makeInit(makeInfo(
          {codecs: 'flac', mediaConfig: dfLa, timescale: 48000},
          ContentType.AUDIO));
      expect(indexOfBox(init, 'fLaC')).toBeGreaterThan(0);
      expect(Array.from(readBox(init, 'dfLa'))).toEqual(Array.from(dfLa));
    });

    it('writes 0 for a rate that does not fit the sample entry', () => {
      const info = makeInfo(
          {codecs: 'flac', mediaConfig: new Uint8Array(42)},
          ContentType.AUDIO);
      info.stream.audioSamplingRate = 96000;
      const init = makeInit(info);
      // The sample entry: 6 reserved bytes, the data reference index, 8
      // reserved bytes, the channels, the sample size, 4 reserved bytes and
      // the rate.
      const entry = readBox(init, 'fLaC');
      expect((entry[24] << 8) | entry[25]).toBe(0);
      // The channels are still there.
      expect(entry[17]).toBe(6);
    });

    it('writes the rate when it fits', () => {
      const info = makeInfo(
          {codecs: 'flac', mediaConfig: new Uint8Array(42)},
          ContentType.AUDIO);
      const entry = readBox(makeInit(info), 'fLaC');
      expect((entry[24] << 8) | entry[25]).toBe(48000);
    });
  });

  describe('Dolby Vision', () => {
    const record = new Uint8Array(24);
    // Version 1.0, profile 8, level 3, RPU and base layer.
    record.set([1, 0, 8 << 1, (3 << 3) | 0x05, 0x10]);
    const profile5 = new Uint8Array(24);
    profile5.set([1, 0, 5 << 1, (3 << 3) | 0x05, 0x00]);
    const hvcC = new Uint8Array(23).fill(9);

    it('writes a dvh1 sample entry with hvcC and dvvC', () => {
      const init = makeInit(makeInfo({
        codecs: 'dvh1',
        mediaConfig: hvcC,
        dolbyVisionConfig: record,
      }, ContentType.VIDEO));
      expect(indexOfBox(init, 'dvh1')).toBeGreaterThan(0);
      // Profile 8 uses dvvC.
      expect(indexOfBox(init, 'dvcC')).toBe(-1);
      expect(Array.from(readBox(init, 'dvvC'))).toEqual(Array.from(record));
      expect(Array.from(readBox(init, 'hvcC'))).toEqual(Array.from(hvcC));
      // The configuration of the codec comes first.
      expect(indexOfBox(init, 'hvcC')).toBeLessThan(indexOfBox(init, 'dvvC'));
    });

    it('writes dvcC for the profiles that use it', () => {
      const init = makeInit(makeInfo({
        codecs: 'dvh1',
        mediaConfig: hvcC,
        dolbyVisionConfig: profile5,
      }, ContentType.VIDEO));
      expect(Array.from(readBox(init, 'dvcC'))).toEqual(Array.from(profile5));
      expect(indexOfBox(init, 'dvvC')).toBe(-1);
    });

    it('writes dva1 and dav1 for AVC and AV1', () => {
      const avc = makeInit(makeInfo({
        codecs: 'dva1',
        mediaConfig: hvcC,
        dolbyVisionConfig: record,
      }, ContentType.VIDEO));
      expect(indexOfBox(avc, 'dva1')).toBeGreaterThan(0);
      expect(indexOfBox(avc, 'avcC')).toBeGreaterThan(0);
      const av1 = makeInit(makeInfo({
        codecs: 'dav1',
        mediaConfig: hvcC,
        dolbyVisionConfig: record,
      }, ContentType.VIDEO));
      expect(indexOfBox(av1, 'dav1')).toBeGreaterThan(0);
      expect(indexOfBox(av1, 'av1C')).toBeGreaterThan(0);
    });

    it('writes no box for a stream without a record', () => {
      const init = makeInit(makeInfo(
          {codecs: 'hvc1', mediaConfig: hvcC}, ContentType.VIDEO));
      expect(indexOfBox(init, 'hvc1')).toBeGreaterThan(0);
      expect(indexOfBox(init, 'dvcC')).toBe(-1);
      expect(indexOfBox(init, 'dvvC')).toBe(-1);
    });

    it('writes no box for a record it cannot read', () => {
      const init = makeInit(makeInfo({
        codecs: 'dvh1',
        mediaConfig: hvcC,
        dolbyVisionConfig: new Uint8Array(2),
      }, ContentType.VIDEO));
      expect(indexOfBox(init, 'dvvC')).toBe(-1);
      expect(indexOfBox(init, 'dvcC')).toBe(-1);
    });
  });
});
