/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const testGetMimeType = async (expertedMimeType, contentType) => {
  const netEngine = new shaka.test.FakeNetworkingEngine()
      .setHeaders('dummy://foo', {'content-type': contentType});
  const mimeType = await shaka.net.NetworkingUtils
      .getMimeType('dummy://foo', netEngine,
          shaka.net.NetworkingEngine.defaultRetryParameters());
  expect(mimeType).toBe(expertedMimeType);
};

describe('NetworkingUtils', () => {
  describe('getMimeType', () => {
    it('test correct mimeType', () => {
      testGetMimeType('application/dash+xml', 'application/dash+xml');
    });

    it('test mimeType with charset', () => {
      testGetMimeType('application/dash+xml',
          'application/dash+xml;charset=UTF-8');
    });

    it('test content-type with uppercase letters', () => {
      testGetMimeType('application/dash+xml',
          'Application/Dash+XML');
    });

    it('test content-type with uppercase letters and charset', () => {
      testGetMimeType('text/html',
          'Text/HTML;Charset="utf-8"');
    });
  });
});
