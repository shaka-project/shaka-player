/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Id3V1Utils', () => {
  const Id3V1Utils = shaka.metadata.Id3V1Utils;

  it('parses ID3v1 tags', () => {
    const data = new Uint8Array(128);

    data[0] = 0x54;
    data[1] = 0x41;
    data[2] = 0x47;

    const write = (offset, text) => {
      for (let i = 0; i < text.length; i++) {
        data[offset + i] = text.charCodeAt(i);
      }
    };

    write(3, 'Title');
    write(33, 'Artist');
    write(63, 'Album');
    write(93, '2024');

    data[125] = 0;
    data[126] = 7;
    data[127] = 13;

    const frames = Id3V1Utils.getID3v1Frames(data);

    expect(frames).toEqual(jasmine.arrayContaining([
      jasmine.objectContaining({
        key: 'TIT2',
        data: 'Title',
      }),
      jasmine.objectContaining({
        key: 'TPE1',
        data: 'Artist',
      }),
      jasmine.objectContaining({
        key: 'TRCK',
        data: '7',
      }),
      jasmine.objectContaining({
        key: 'TCON',
        data: '13',
      }),
    ]));
  });

  it('returns empty array when no ID3v1 tag exists', () => {
    const frames = Id3V1Utils.getID3v1Frames(new Uint8Array(128));

    expect(frames).toEqual([]);
  });
});
