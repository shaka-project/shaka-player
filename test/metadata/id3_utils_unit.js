/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Id3Utils', () => {
  const Id3Utils = shaka.metadata.Id3Utils;
  const Id3Generator = shaka.test.Id3Generator;
  const BufferUtils = shaka.util.BufferUtils;

  function utf16le(str) {
    const out = [];
    for (const c of str) {
      const code = c.charCodeAt(0);
      out.push(code & 0xff);
      out.push(code >> 8);
    }
    return out;
  }

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

  it('parses ID3v2.3 frame sizes correctly', () => {
    const value = new Uint8Array([
      3,
      83, 104, 97, 107, 97,
    ]);

    const frame = Id3Generator.generateId3Frame('TIT2', value);

    // Force version 2.3
    frame[3] = 3;

    const id3 = Id3Generator.generateId3(frame);
    id3[3] = 3;

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames[0].data).toBe('Shaka');
  });

  it('parses UTF16 TXXX frames', () => {
    const payload = new Uint8Array([
      1,
      0xff, 0xfe,
      ...utf16le('A'),
      0, 0,
      0xff, 0xfe,
      ...utf16le('Shaka'),
    ]);

    const frame = Id3Generator.generateId3Frame('TXXX', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames).toEqual([{
      key: 'TXXX',
      description: 'A',
      data: 'Shaka',
      mimeType: null,
      pictureType: null,
    }]);
  });

  it('parses UTF16BE text frames', () => {
    const payload = new Uint8Array([
      2,
      0x00, 0x53,
      0x00, 0x68,
      0x00, 0x61,
      0x00, 0x6b,
      0x00, 0x61,
    ]);

    const frame = Id3Generator.generateId3Frame('TIT2', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames[0].data).toBe('Shaka');
  });

  it('parses multi-value v2.4 text frames', () => {
    const payload = new Uint8Array([
      3,
      65,
      0,
      66,
      0,
      67,
    ]);

    const frame = Id3Generator.generateId3Frame('TPE1', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames[0].data).toBe('A / B / C');
  });

  it('parses COMM frames', () => {
    const payload = new Uint8Array([
      3,
      101, 110, 103,
      100, 101, 115, 99,
      0,
      104, 101, 108, 108, 111,
    ]);

    const frame = Id3Generator.generateId3Frame('COMM', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames[0]).toEqual({
      key: 'COMM',
      description: 'desc',
      data: 'hello',
      mimeType: null,
      pictureType: null,
    });
  });

  it('falls back to language in COMM frame', () => {
    const payload = new Uint8Array([
      3,
      101, 110, 103,
      0,
      104, 101, 108, 108, 111,
    ]);

    const frame = Id3Generator.generateId3Frame('COMM', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames[0].description).toBe('eng');
  });

  it('parses UFID frames', () => {
    const payload = new Uint8Array([
      111, 119, 110, 101, 114,
      0,
      1, 2, 3,
    ]);

    const frame = Id3Generator.generateId3Frame('UFID', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames[0]).toEqual({
      key: 'UFID',
      description: 'owner',
      data: BufferUtils.toArrayBuffer(new Uint8Array([1, 2, 3])),
      mimeType: null,
      pictureType: null,
    });
  });

  it('stops parsing at padding', () => {
    const frame = Id3Generator.generateId3Frame(
        'TIT2',
        new Uint8Array([3, 65]),
    );

    const id3 = Id3Generator.generateId3(frame);

    const padded = new Uint8Array(id3.length + 20);
    padded.set(id3);

    const frames = Id3Utils.getID3Frames(padded);

    expect(frames.length).toBe(1);
  });

  it('handles footer correctly', () => {
    const frame = Id3Generator.generateId3Frame(
        'TIT2',
        new Uint8Array([3, 65]),
    );

    const id3 = Id3Generator.generateId3(frame);

    const footer = new Uint8Array([
      0x33, 0x44, 0x49,
      4, 0,
      0,
      0, 0, 0, 10,
    ]);

    const combined = new Uint8Array(id3.length + footer.length);
    combined.set(id3);
    combined.set(footer, id3.length);

    const frames = Id3Utils.getID3Frames(combined);

    expect(frames.length).toBe(1);
  });

  it('extracts adjacent ID3 blocks', () => {
    const frame = Id3Generator.generateId3Frame(
        'TIT2',
        new Uint8Array([3, 65]),
    );

    const tag1 = Id3Generator.generateId3(frame);
    const tag2 = Id3Generator.generateId3(frame);

    const combined = new Uint8Array(tag1.length + tag2.length);
    combined.set(tag1);
    combined.set(tag2, tag1.length);

    const data = Id3Utils.getID3Data(combined);

    expect(data.length).toBe(combined.length);
  });

  it('returns empty ID3Data when absent', () => {
    const result = Id3Utils.getID3Data(new Uint8Array([1, 2, 3]));

    expect(result.length).toBe(0);
  });

  it('parses Apple transportStreamTimestamp PRIV frame', () => {
    const owner =
      'com.apple.streaming.transportStreamTimestamp';

    const ownerBytes = Array.from(owner).map((c) => c.charCodeAt(0));

    const payload = new Uint8Array([
      ...ownerBytes,
      0,
      0, 0, 0, 0,
      0, 0, 0, 90,
    ]);

    const frame = Id3Generator.generateId3Frame('PRIV', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(typeof frames[0].data).toBe('number');
  });

  it('returns null for malformed TXXX frame', () => {
    const payload = new Uint8Array([
      3,
      65,
      66,
      67,
    ]);

    const frame = Id3Generator.generateId3Frame('TXXX', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames).toEqual([]);
  });

  it('strips trailing nulls from W frames', () => {
    const payload = new Uint8Array([
      103, 111, 111, 103, 108, 101,
      0, 0,
    ]);

    const frame = Id3Generator.generateId3Frame('WCOP', payload);
    const id3 = Id3Generator.generateId3(frame);

    const frames = Id3Utils.getID3Frames(id3);

    expect(frames[0].data).toBe('google');
  });
});
