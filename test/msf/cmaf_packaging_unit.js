/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.packaging.Cmaf', isMSFSupported, () => {
  beforeEach(() => {
    spyOn(shaka.media.SegmentUtils, 'getStartTimeAndDurationFromMp4')
        .and.returnValue({startTime: 100, duration: 1 / 30});
  });

  /**
   * @param {number} object
   * @return {!shaka.extern.MsfObject}
   */
  function mediaObject(object) {
    return /** @type {!shaka.extern.MsfObject} */ (/** @type {?} */ ({
      location: {group: BigInt(10), object: BigInt(object), subgroup: null},
      data: new Uint8Array([1]),
    }));
  }

  it('marks only the Group start as independently decodable video', () => {
    const segmenter = new shaka.msf.packaging.CmafSegmenter(90000, true);
    // Receiving a dependent object first does not make it a random access
    // point. The Group start can arrive later on another subgroup.
    expect(segmenter.push(mediaObject(15))[0].independent).toBe(false);
    expect(segmenter.push(mediaObject(0))[0].independent).toBe(true);
    expect(segmenter.push(mediaObject(16))[0].independent).toBe(false);
  });

  it('keeps audio objects independently decodable', () => {
    const segmenter = new shaka.msf.packaging.CmafSegmenter(48000, false);
    expect(segmenter.push(mediaObject(15))[0].independent).toBe(true);
  });
});
