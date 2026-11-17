/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('shaka.msf.packaging.Loc', isMSFSupported, () => {
  /**
   * @param {!Object} fields
   * @return {!shaka.extern.MsfSegmenter}
   */
  function createSegmenter(fields) {
    const track = /** @type {msfCatalog.Track} */ (
      /** @type {?} */ (Object.assign({name: 'track'}, fields)));
    const packaging = new shaka.msf.packaging.Loc();
    expect(packaging.describeTrack(track, new Uint8Array(0))).not.toBe(null);
    return packaging.createSegmenter();
  }

  /**
   * @param {number} object
   * @param {number=} frameMarking The first byte of a Video Frame Marking
   *   property, or undefined to carry none.
   * @return {!shaka.extern.MsfObject}
   */
  function mediaObject(object, frameMarking) {
    return /** @type {!shaka.extern.MsfObject} */ (/** @type {?} */ ({
      location: {group: BigInt(10), object: BigInt(object), subgroup: null},
      data: new Uint8Array([1]),
      // A lone property is written with its absolute type: Video Frame
      // Marking (0x09), a length of 1, then the marking.
      extensions: frameMarking === undefined ?
          null : new Uint8Array([0x09, 0x01, frameMarking]),
    }));
  }

  it('marks only the Group start as independently decodable video', () => {
    const segmenter =
        createSegmenter({codec: 'avc1.64001f', framerate: 30});
    // A live join can deliver the rest of the Group before its first Object,
    // and every LOC Object is a single frame.
    expect(segmenter.push(mediaObject(15))[0].independent).toBe(false);
    expect(segmenter.push(mediaObject(0))[0].independent).toBe(true);
    expect(segmenter.push(mediaObject(16))[0].independent).toBe(false);
  });

  it('prefers the Video Frame Marking over the Group start', () => {
    const segmenter =
        createSegmenter({codec: 'avc1.64001f', framerate: 30});
    // A key frame inside the Group, and a Group start marked dependent.
    expect(segmenter.push(mediaObject(15, 0xe0))[0].independent).toBe(true);
    expect(segmenter.push(mediaObject(0, 0xc0))[0].independent).toBe(false);
  });

  it('keeps audio objects independently decodable', () => {
    const segmenter =
        createSegmenter({codec: 'mp4a.40.2', samplerate: 48000});
    expect(segmenter.push(mediaObject(15))[0].independent).toBe(true);
  });
});
