/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Id3Utils', () => {
  const Id3Utils = shaka.util.Id3Utils;
  const Id3Generator = shaka.test.Id3Generator;
  const BufferUtils = shaka.util.BufferUtils;

  it('no valid data produces empty output', () => {
    expect(Id3Utils.getID3Frames(new Uint8Array([]))).toEqual([]);
  });

  it('parse an APIC frame with image data', () => {
    const apicValue = new Uint8Array([
      3, 105, 109, 97, 103, 101, 47, 106, 112, 101, 103, 0, 3, 83, 104, 97,
      107, 97, 0, 1, 2, 3,
    ]);
    const apicFrame = Id3Generator.generateId3Frame('APIC', apicValue);
    const apicID3 = Id3Generator.generateId3(apicFrame);
    const expectedID3 = [
      {
        key: 'APIC',
        mimeType: 'image/jpeg',
        pictureType: 3,
        description: 'Shaka',
        data: BufferUtils.toArrayBuffer(new Uint8Array([1, 2, 3])),
      },
    ];
    expect(Id3Utils.getID3Frames(apicID3)).toEqual(expectedID3);
  });

  it('parse an APIC frame with image URL', () => {
    const apicValue = new Uint8Array([
      3, 45, 45, 62, 0, 3, 83, 104, 97, 107, 97, 0, 103, 111, 111, 103, 108,
      101, 46, 99, 111, 109,
    ]);
    const apicFrame = Id3Generator.generateId3Frame('APIC', apicValue);
    const apicID3 = Id3Generator.generateId3(apicFrame);
    const expectedID3 = [
      {
        key: 'APIC',
        mimeType: '-->',
        pictureType: 3,
        description: 'Shaka',
        data: 'google.com',
      },
    ];
    expect(Id3Utils.getID3Frames(apicID3)).toEqual(expectedID3);
  });

  it('parse a TXXX frame', () => {
    const txxxValue = new Uint8Array([3, 65, 0, 83, 104, 97, 107, 97]);
    const txxxFrame = Id3Generator.generateId3Frame('TXXX', txxxValue);
    const txxxID3 = Id3Generator.generateId3(txxxFrame);
    const expectedID3 = [
      {
        key: 'TXXX',
        description: 'A',
        data: 'Shaka',
        mimeType: null,
        pictureType: null,
      },
    ];
    expect(Id3Utils.getID3Frames(txxxID3)).toEqual(expectedID3);
  });

  it('parse a TXXX frame with extended header', () => {
    const txxxValue = new Uint8Array([3, 65, 0, 83, 104, 97, 107, 97]);
    const txxxFrame = Id3Generator.generateId3Frame('TXXX', txxxValue);
    const txxxID3 = Id3Generator.generateId3(txxxFrame, true);
    const expectedID3 = [
      {
        key: 'TXXX',
        description: 'A',
        data: 'Shaka',
        mimeType: null,
        pictureType: null,
      },
    ];
    expect(Id3Utils.getID3Frames(txxxID3)).toEqual(expectedID3);
  });

  it('parse a TCOP frame', () => {
    const tcopValue = new Uint8Array(
        [3, 83, 104, 97, 107, 97, 32, 50, 48, 49, 54]);
    const tcopFrame = Id3Generator.generateId3Frame('TCOP', tcopValue);
    const tcopID3 = Id3Generator.generateId3(tcopFrame);
    const expectedID3 = [
      {
        key: 'TCOP',
        description: '',
        data: 'Shaka 2016',
        mimeType: null,
        pictureType: null,
      },
    ];
    expect(Id3Utils.getID3Frames(tcopID3)).toEqual(expectedID3);
  });

  it('parse a WXXX frame', () => {
    const wxxxValue = new Uint8Array(
        [3, 65, 0, 103, 111, 111, 103, 108, 101, 46, 99, 111, 109]);
    const wxxxFrame = Id3Generator.generateId3Frame('WXXX', wxxxValue);
    const wxxxID3 = Id3Generator.generateId3(wxxxFrame);
    const expectedID3 = [
      {
        key: 'WXXX',
        description: 'A',
        data: 'google.com',
        mimeType: null,
        pictureType: null,
      },
    ];
    expect(Id3Utils.getID3Frames(wxxxID3)).toEqual(expectedID3);
  });

  it('parse a WCOP frame', () => {
    const wcopValue = new Uint8Array(
        [103, 111, 111, 103, 108, 101, 46, 99, 111, 109]);
    const wcopFrame = Id3Generator.generateId3Frame('WCOP', wcopValue);
    const wcopID3 = Id3Generator.generateId3(wcopFrame);
    const expectedID3 = [
      {
        key: 'WCOP',
        description: '',
        data: 'google.com',
        mimeType: null,
        pictureType: null,
      },
    ];
    expect(Id3Utils.getID3Frames(wcopID3)).toEqual(expectedID3);
  });

  it('parse a PRIV frame', () => {
    const privValue = new Uint8Array([65, 0, 83, 104, 97, 107]);
    const privFrame = Id3Generator.generateId3Frame('PRIV', privValue);
    const privID3 = Id3Generator.generateId3(privFrame);
    const expectedID3 = [
      {
        key: 'PRIV',
        description: 'A',
        data: BufferUtils.toArrayBuffer(new Uint8Array([83, 104, 97, 107])),
        mimeType: null,
        pictureType: null,
      },
    ];
    expect(Id3Utils.getID3Frames(privID3)).toEqual(expectedID3);
  });

  it('parse an unknown frame', () => {
    const unknownValue = new Uint8Array([83, 104, 97, 107]);
    const unknownFrame = Id3Generator.generateId3Frame('XXXX', unknownValue);
    const unknownID3 = Id3Generator.generateId3(unknownFrame);
    const expectedID3 = [
      {
        key: 'XXXX',
        description: '',
        data: BufferUtils.toArrayBuffer(new Uint8Array([83, 104, 97, 107])),
        mimeType: null,
        pictureType: null,
      },
    ];
    expect(Id3Utils.getID3Frames(unknownID3)).toEqual(expectedID3);
  });
});
