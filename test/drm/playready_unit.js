/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Test DRM-related parsing.
describe('PlayReady', () => {
  const strToXml = (str) => {
    return shaka.util.TXml.parseXmlString(str);
  };

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
      shaka.drm.PlayReady.PLAYREADY_RECORD_TYPES.RIGHTS_MANAGEMENT,
      // record size (in num bytes)
      laurl.length * 2,
      // value
    ].concat(laurlCodes));

    const encodedPrObject = shaka.util.Uint8ArrayUtils.toBase64(prBytes);
    const input = strToXml([
      '<TEST>',
      encodedPrObject,
      '</TEST>',
    ].join('\n'));
    const actual = shaka.drm.PlayReady.getLicenseUrl(input);
    expect(actual).toBe('www.example.com');
  });

  it('getLicenseUrlFromPssh', () => {
    // cspell:disable
    const psshString =
        'AAACvnBzc2gAAAAAmgTweZhAQoarkuZb4IhflQAAAp6eAgAAAQABAJQCPABXAFIATQBI' +
        'AEUAQQBEAEUAUgAgAHgAbQBsAG4AcwA9ACIAaAB0AHQAcAA6AC8ALwBzAGMAaABlAG0A' +
        'YQBzAC4AbQBpAGMAcgBvAHMAbwBmAHQALgBjAG8AbQAvAEQAUgBNAC8AMgAwADAANwAv' +
        'ADAAMwAvAFAAbABhAHkAUgBlAGEAZAB5AEgAZQBhAGQAZQByACIAIAB2AGUAcgBzAGkA' +
        'bwBuAD0AIgA0AC4AMwAuADAALgAwACIAPgA8AEQAQQBUAEEAPgA8AFAAUgBPAFQARQBD' +
        'AFQASQBOAEYATwA+ADwASwBJAEQAUwA+ADwASwBJAEQAIABBAEwARwBJAEQAPQAiAEEA' +
        'RQBTAEMAQgBDACIAIABWAEEATABVAEUAPQAiAFoAMABVAGoAQQBhAHUASgA3ADgAMABC' +
        'AEkAMABWAG4AaQBhAHYATgA3AHcAPQA9ACIAPgA8AC8ASwBJAEQAPgA8AC8ASwBJAEQA' +
        'UwA+ADwALwBQAFIATwBUAEUAQwBUAEkATgBGAE8APgA8AEwAQQBfAFUAUgBMAD4AaAB0' +
        'AHQAcABzADoALwAvAHAAbABhAHkAcgBlAGEAZAB5AC4AZQB6AGQAcgBtAC4AYwBvAG0A' +
        'LwBjAGUAbgBjAHkALwBwAHIAZQBhAHUAdABoAC4AYQBzAHAAeAA/AHAAWAA9ADIANwA0' +
        'AEYARgA0ADwALwBMAEEAXwBVAFIATAA+ADwARABTAF8ASQBEAD4AVgBsAFIANwBJAGQA' +
        'cwBJAEoARQB1AFIAZAAwADYATABhAHEAcwAyAGoAdwA9AD0APAAvAEQAUwBfAEkARAA+' +
        'ADwALwBEAEEAVABBAD4APAAvAFcAUgBNAEgARQBBAEQARQBSAD4A';
    // cspell:enable

    const data = shaka.util.Uint8ArrayUtils.fromBase64(psshString);
    const actual = shaka.drm.PlayReady.getLicenseUrlFromPssh(data);
    const expected = 'https://playready.ezdrm.com/cency/preauth.aspx?pX=274FF4';
    expect(actual).toBe(expected);
  });
});
