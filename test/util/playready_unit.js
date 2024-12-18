/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('PlayReady', () => {
  it('getLicenseURL', () => {
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
      shaka.util.PlayReady.PLAYREADY_RECORD_TYPES.RIGHTS_MANAGEMENT,
      // record size (in num bytes)
      laurl.length * 2,
      // value
    ].concat(laurlCodes));
    const actual = shaka.util.PlayReady.getLicenseUrl(prBytes);
    expect(actual).toBe('www.example.com');
  });
});
