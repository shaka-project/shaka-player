/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ContentWorkarounds', () => {
  const encryptionBoxes = {
    'encv': ['hev1', 'hvc1', 'avc1', 'avc3'],
    'enca': ['ac-3', 'ec-3', 'ac-4', 'mp4a'],
  };
  for (const encryptionBox of Object.keys(encryptionBoxes)) {
    for (const box of encryptionBoxes[encryptionBox]) {
      it(`adds ${encryptionBox} box for ${box}`, () => {
        const boxType = [];
        for (const char of box) {
          boxType.push(char.charCodeAt(0));
        }
        const unencrypted = new Uint8Array([
          0x00, 0x00, 0x00, 0x20, // size
          0x73, 0x74, 0x73, 0x64, // stsd
          0x01,                   // version
          0x12, 0x34, 0x56,       // flags
          0x00, 0x00, 0x00, 0x01, // count
          0x00, 0x00, 0x00, 0x10, // size
          ...boxType,             // box type
          0x01,                   // version
          0x12, 0x34, 0x56,       // flags
          0x00, 0x11, 0x22, 0x33, // payload
        ]);

        const faked =
            shaka.media.ContentWorkarounds.fakeEncryption(unencrypted);
        const spy = jasmine.createSpy('boxCallback');
        new shaka.util.Mp4Parser()
            .fullBox('stsd', shaka.util.Mp4Parser.sampleDescription)
            .box(encryptionBox, /** @type {!Function} */ (spy))
            .parse(faked);
        expect(spy).toHaveBeenCalled();
      });
    }
  }
});
