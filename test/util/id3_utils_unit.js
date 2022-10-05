/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Id3Utils', () => {
  const Id3Utils = shaka.util.Id3Utils;
  const Id3Generator = shaka.test.Id3Generator;

  it('no valid data produces empty output', () => {
    expect(Id3Utils.getID3Frames(new Uint8Array([]))).toEqual([]);
  });

  it('parse a TXXX frame', () => {
    const txxxValue = new Uint8Array([3, 0, 83, 104, 97, 107, 97]);
    const txxxFrame = Id3Generator.generateId3Frame('TXXX', txxxValue);
    const txxxID3 = Id3Generator.generateId3(txxxFrame);
    const expectedID3 = [
      {
        id: 'TXXX',
        key: 'TXXX',
        description: '',
        data: 'Shaka',
        value: 'Shaka',
      },
    ];
    expect(Id3Utils.getID3Frames(txxxID3)).toEqual(expectedID3);
  });
});
