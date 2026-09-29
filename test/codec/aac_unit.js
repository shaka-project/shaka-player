/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('AAC', () => {
  const AAC = shaka.codec.AAC;

  describe('getCodecs', () => {
    it('gives the object type of the AudioSpecificConfig', () => {
      // AAC-LC (2) at 44.1 kHz, stereo.
      expect(AAC.getCodecs(new Uint8Array([0x12, 0x10]))).toBe('mp4a.40.2');
      // HE-AAC (5).
      expect(AAC.getCodecs(new Uint8Array([0x2b, 0x92, 0x08, 0x00])))
          .toBe('mp4a.40.5');
    });

    it('reads an escaped object type', () => {
      // 31 (escape) followed by 6 bits with the value 1: 32 + 1.
      expect(AAC.getCodecs(new Uint8Array([0xf8, 0x20]))).toBe('mp4a.40.33');
    });

    it('takes AAC-LC with a doubled output rate as HE-AAC', () => {
      const config = new Uint8Array([0x13, 0x08]);
      expect(AAC.getCodecs(config, 24000, 48000)).toBe('mp4a.40.5');
      expect(AAC.getCodecs(config, 48000, 48000)).toBe('mp4a.40.2');
      expect(AAC.getCodecs(config)).toBe('mp4a.40.2');
    });
  });

  describe('buildEsds', () => {
    it('wraps the AudioSpecificConfig in the descriptors of an esds', () => {
      expect(Array.from(AAC.buildEsds(new Uint8Array([0x12, 0x10]))))
          .toEqual([
            // Version and flags.
            0, 0, 0, 0,
            // ES_Descriptor, 25 bytes: ES_ID and flags.
            0x03, 25, 0, 0, 0,
            // DecoderConfigDescriptor, 17 bytes: MPEG-4 audio, audio stream,
            // buffer size, maximum and average bitrate.
            0x04, 17, 0x40, 0x15, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
            // DecoderSpecificInfo: the AudioSpecificConfig.
            0x05, 2, 0x12, 0x10,
            // SLConfigDescriptor.
            0x06, 1, 0x02,
          ]);
    });
  });
});
