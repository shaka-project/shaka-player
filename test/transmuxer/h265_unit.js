/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('H265', () => {
  const H265 = shaka.transmuxer.H265;

  /**
   * @param {number} type
   * @param {!Array<number>=} payload
   * @return {shaka.extern.VideoNalu}
   */
  function nalu(type, payload) {
    const body = payload || [0x00, 0x01];
    // nal_unit_type(6) in the high bits of the first byte, then
    // nuh_layer_id(6) and nuh_temporal_id_plus1(3).
    const fullData = new Uint8Array([(type << 1) & 0x7e, 0x01, ...body]);
    return /** @type {shaka.extern.VideoNalu} */ ({
      data: fullData.subarray(2),
      fullData,
      type,
    });
  }

  /**
   * Reads back the NAL unit types of the length-prefixed sample the parser
   * produced.
   *
   * @param {!Uint8Array} data
   * @return {!Array<number>}
   */
  function sampleNaluTypes(data) {
    const types = [];
    let offset = 0;
    while (offset + 4 <= data.byteLength) {
      const size = ((data[offset] << 24) | (data[offset + 1] << 16) |
          (data[offset + 2] << 8) | data[offset + 3]) >>> 0;
      offset += 4;
      types.push((data[offset] & 0x7e) >> 1);
      offset += size;
    }
    return types;
  }

  // 39 = prefix SEI, 40 = suffix SEI, 32/33/34 = VPS/SPS/PPS,
  // 35 = AUD, 19 = IDR_W_RADL, 1 = TRAIL_R.
  const PREFIX_SEI = 39;
  const SUFFIX_SEI = 40;
  const VPS = 32;
  const SPS = 33;
  const PPS = 34;
  const AUD = 35;
  const IDR = 19;

  describe('parseFrame', () => {
    it('keeps the non-VCL units that precede the first slice', () => {
      // This is the ordinary access unit layout when there is no AUD: the
      // parameter sets and the prefix SEI come BEFORE the slice.  CEA
      // captions live in that SEI, so dropping it loses them.
      const frame = {data: new Uint8Array(0), isKeyframe: false};
      const parsed = H265.parseFrame(
          [nalu(VPS), nalu(SPS), nalu(PPS), nalu(PREFIX_SEI), nalu(IDR)],
          frame);

      expect(parsed).toBe(true);
      expect(sampleNaluTypes(frame.data))
          .toEqual([VPS, SPS, PPS, PREFIX_SEI, IDR]);
      expect(frame.isKeyframe).toBe(true);
    });

    it('keeps them when an AUD leads the access unit', () => {
      const frame = {data: new Uint8Array(0), isKeyframe: false};
      const parsed = H265.parseFrame(
          [nalu(AUD), nalu(PREFIX_SEI), nalu(IDR), nalu(SUFFIX_SEI)], frame);

      expect(parsed).toBe(true);
      expect(sampleNaluTypes(frame.data))
          .toEqual([AUD, PREFIX_SEI, IDR, SUFFIX_SEI]);
    });

    it('produces no sample for an access unit with no slice', () => {
      // Parameter sets on their own are not a frame, and emitting them as one
      // would put a sample with no picture into the timeline.
      const frame = {data: new Uint8Array(0), isKeyframe: false};
      const parsed = H265.parseFrame(
          [nalu(VPS), nalu(SPS), nalu(PPS), nalu(PREFIX_SEI)], frame);

      expect(parsed).toBe(false);
    });

    it('produces no sample for an empty access unit', () => {
      const frame = {data: new Uint8Array(0), isKeyframe: false};
      expect(H265.parseFrame([], frame)).toBe(false);
    });

    it('drops NAL unit types that do not belong in a sample', () => {
      const frame = {data: new Uint8Array(0), isKeyframe: false};
      // 62 is unspecified; it must not reach the SourceBuffer.
      H265.parseFrame([nalu(IDR), nalu(62)], frame);

      expect(sampleNaluTypes(frame.data)).toEqual([IDR]);
    });
  });
});
