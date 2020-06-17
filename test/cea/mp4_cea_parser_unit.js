/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Mp4CeaParser', () => {
  const ceaInitSegmentUri = '/base/test/test/assets/cea-init.mp4';
  const ceaSegmentUri = '/base/test/test/assets/cea-segment.mp4';

  /** @type {!ArrayBuffer} */
  let ceaInitSegment;
  /** @type {!ArrayBuffer} */
  let ceaSegment;

  beforeAll(async () => {
    const responses = await Promise.all([
      shaka.test.Util.fetch(ceaInitSegmentUri),
      shaka.test.Util.fetch(ceaSegmentUri),
    ]);
    ceaInitSegment = responses[0];
    ceaSegment = responses[1];
  });

  it('parses cea data from mp4 stream', () => {
    let cea708Packets;
    const cea708Parser = new shaka.cea.Mp4CeaParser();

    const expectedCea708Packets = new Uint8Array([181, 0, 49, 71, 65, 57,
      52, 3, 206, 255, 253, 148, 32, 253, 148, 174, 253, 145, 98, 253, 115,
      247, 253, 229, 186, 253, 145, 185, 253, 176, 176, 253, 186, 176, 253,
      176, 186, 253, 176, 49, 253, 186, 176, 253, 176, 128, 253, 148, 44,
      253, 148, 47, 255]);

    cea708Parser.init(ceaInitSegment);
    cea708Parser.parse(ceaSegment, (data) => {
      cea708Packets = data;
    });
    expect(cea708Packets).toBeDefined();
    expect(cea708Packets).toEqual(expectedCea708Packets);
  });

  it('parses an invalid init segment', () => {
    const cea708Parser = new shaka.cea.Mp4CeaParser();

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.TEXT,
        shaka.util.Error.Code.INVALID_MP4_CEA));

    expect(() => {
      cea708Parser.init(ceaSegment);
    }).toThrow(expected);
  });
});
