/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Test DRM-related parsing.
describe('MssParser ContentProtection', () => {
  const ContentProtection = shaka.mss.ContentProtection;

  const strToXml = (str) => {
    const parser = new DOMParser();
    return parser.parseFromString(str, 'application/xml').documentElement;
  };

  it('getPlayReadyLicenseURL', () => {
    const laurl = [
      '<WRMHEADER>',
      '  <DATA>',
      '    <LA_URL>www.example.com</LA_URL>',
      '  </DATA>',
      '</WRMHEADER>',
    ].join('\n');
    const laurlCodes = laurl.split('').map((c) => {
      return c.charCodeAt();
    });
    const prBytes = new Uint16Array([
      // pr object size (in num bytes).
      // + 10 for PRO size, count, and type
      laurl.length * 2 + 10, 0,
      // record count
      1,
      // type
      ContentProtection.PLAYREADY_RECORD_TYPES.RIGHTS_MANAGEMENT,
      // record size (in num bytes)
      laurl.length * 2,
      // value
    ].concat(laurlCodes));

    const encodedPrObject = shaka.util.Uint8ArrayUtils.toBase64(prBytes);
    const input = strToXml([
      '<ProtectionHeader SystemID="9a04f079-9840-4286-ab92-e65be0885f95">',
      encodedPrObject,
      '</ProtectionHeader>',
    ].join('\n'));
    const actual = ContentProtection.getPlayReadyLicenseUrl(input);
    expect(actual).toBe('www.example.com');
  });
});
