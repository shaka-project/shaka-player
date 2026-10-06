/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ClearKeyWebCryptoDecryptor', () => {
  const Mp4Generator = shaka.util.Mp4Generator;
  const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;
  const keyId = '202122232425262728292a2b2c2d2e2f';
  const key = '000102030405060708090a0b0c0d0e0f';
  const iv = Uint8ArrayUtils.fromHex('101112131415161718191a1b1c1d1e1f');

  /** @type {!shaka.media.ClearKeyWebCryptoDecryptor} */
  let decryptor;
  /** @type {shaka.extern.DrmInfo} */
  let drmInfo;

  beforeEach(async () => {
    decryptor = new shaka.media.ClearKeyWebCryptoDecryptor();
    drmInfo = shaka.util.ManifestParserUtils.createDrmInfoFromClearKeys(
        new Map([[keyId, key]]), 'cbcs');
    await decryptor.decrypt(makeInit(), true, drmInfo);
  });

  afterEach(async () => {
    await decryptor.destroy();
  });

  // Known ciphertext generated with Node's crypto.createCipheriv('aes-128-cbc')
  // and setAutoPadding(false). For each protected range, encrypt its first and
  // third 16-byte blocks as one CBC stream with the IV above, then scatter them
  // back. The second block and final seven bytes stay clear (pattern 1:1).
  it('restarts the CBC IV for each protected subsample', async () => {
    const ciphertext = Uint8ArrayUtils.fromHex(
        '0001027f5d5c7e5f213a9ce2ae678d62214107' +
        '131415161718191a1b1c1d1e1f202122219a2e72bf77fdac3cfc147c1312331a' +
        '333435363738393a3b3c3d3ea1463521956364f831ed44d49c3fb889' +
        '4f505152535455565758595a5b5c5d5eaa62770535f0ff45f33bbe86bcc68b54' +
        '6f707172737475');
    const senc = Mp4Generator.box('senc', new Uint8Array([
      0, 0, 0, 2, // version/flags: subsample encryption
      0, 0, 0, 1, // sample count
      0, 2, // subsample count; constant IV comes from tenc
      0, 3, 0, 0, 0, 55, // three clear bytes, 55 protected bytes
      0, 5, 0, 0, 0, 55, // five clear bytes, 55 protected bytes
    ]));
    const plaintext = new Uint8Array(118).map((_, i) => i);

    const result = await decryptor.decrypt(
        makeSegment(ciphertext, senc), false, drmInfo);

    expect(result.slice(-plaintext.length)).toEqual(plaintext);
  });

  it('preserves CBC chaining within a sample without subsamples', async () => {
    const ciphertext = Uint8ArrayUtils.fromHex(
        '954f64f2e4e86e9eee82d20216684899' +
        '101112131415161718191a1b1c1d1e1f' +
        '87d062d7d68a0b0ab8693ee249d06303' +
        '30313233343536');
    const plaintext = new Uint8Array(55).map((_, i) => i);

    const result = await decryptor.decrypt(
        makeSegment(ciphertext, new Uint8Array(0)), false, drmInfo);

    expect(result.slice(-plaintext.length)).toEqual(plaintext);
  });

  /** @return {!Uint8Array} */
  function makeInit() {
    const tkhd = new Uint8Array(84);
    shaka.util.BufferUtils.toDataView(tkhd).setUint32(12, 1); // track ID
    const tenc = Mp4Generator.box('tenc', new Uint8Array([
      1, 0, 0, 0, // version 1
      0, 0x11, 1, 0, // reserved, pattern 1:1, protected, constant IV
    ]), Uint8ArrayUtils.fromHex(keyId), new Uint8Array([16]), iv);
    const sinf = Mp4Generator.box('sinf',
        Mp4Generator.box('frma', Uint8ArrayUtils.fromHex('61763031')), // av01
        Mp4Generator.box('schm',
            Uint8ArrayUtils.fromHex('000000006362637300010000')), // cbcs
        Mp4Generator.box('schi', tenc));
    const stsd = Mp4Generator.box('stsd',
        Uint8ArrayUtils.fromHex('0000000000000001'),
        Mp4Generator.box('encv', new Uint8Array(78), sinf));
    const mdia = Mp4Generator.box('mdia',
        Mp4Generator.box('minf', Mp4Generator.box('stbl', stsd)));
    return Mp4Generator.box('moov',
        Mp4Generator.box('trak', Mp4Generator.box('tkhd', tkhd), mdia));
  }

  /**
   * @param {!Uint8Array} ciphertext
   * @param {!Uint8Array} senc Empty when there is no subsample metadata.
   * @return {!Uint8Array}
   */
  function makeSegment(ciphertext, senc) {
    const trun = new Uint8Array(12);
    const view = shaka.util.BufferUtils.toDataView(trun);
    view.setUint32(0, 0x200); // sample sizes present
    view.setUint32(4, 1); // sample count
    view.setUint32(8, ciphertext.length);
    const moof = Mp4Generator.box('moof', Mp4Generator.box('traf',
        Mp4Generator.box('tfhd', Uint8ArrayUtils.fromHex('0000000000000001')),
        Mp4Generator.box('trun', trun), senc));
    return Uint8ArrayUtils.concat(moof, Mp4Generator.box('mdat', ciphertext));
  }
});
