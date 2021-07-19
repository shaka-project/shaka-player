/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.net.DataUriPlugin');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.net.NetworkingEngine.RequestType');
goog.require('shaka.test.Util');
goog.require('shaka.util.Error');
goog.require('shaka.util.StringUtils');

describe('DataUriPlugin', () => {
  const retryParameters = shaka.net.NetworkingEngine.defaultRetryParameters();

  it('supports MIME types', async () => {
    await testSucceeds('data:text/plain,Hello', 'text/plain', 'Hello');
  });

  it('supports URI encoded text', async () => {
    await testSucceeds(
        'data:text/html,%3Ch1%3EHello%2C%20World!%3C%2Fh1%3E',
        'text/html',
        '<h1>Hello, World!</h1>');
  });

  it('supports base64 encoded text', async () => {
    await testSucceeds(
        'data:;base64,SGVsbG8sIFdvcmxkIQ%3D%3D', '', 'Hello, World!');
  });

  it('supports extra colon', async () => {
    await testSucceeds('data:,Hello:', '', 'Hello:');
  });

  it('supports extra semi-colon', async () => {
    await testSucceeds('data:,Hello;', '', 'Hello;');
  });

  it('supports extra comma', async () => {
    await testSucceeds('data:,Hello,', '', 'Hello,');
  });

  it('supports character set metadata', async () => {
    await testSucceeds(
        'data:text/plain;charset=UTF-8,Hello,', 'text/plain', 'Hello,');
  });

  it('supports arbitrary metadata', async () => {
    await testSucceeds(
        'data:text/plain;foo=bar,Hello,', 'text/plain', 'Hello,');
  });

  it('supports arbitrary metadata with base64 encoding', async () => {
    await testSucceeds(
        'data:text/plain;foo=bar;base64,SGVsbG8sIFdvcmxkIQ%3D%3D',
        'text/plain',
        'Hello, World!');
  });

  it('fails for empty URI', async () => {
    await testFails('', shaka.util.Error.Code.MALFORMED_DATA_URI);
  });

  it('fails for non-data URIs', async () => {
    await testFails(
        'http://google.com/', shaka.util.Error.Code.MALFORMED_DATA_URI);
  });

  it('fails for decoding errors', async () => {
    await testFails('data:Bad%', shaka.util.Error.Code.MALFORMED_DATA_URI);
  });

  it('fails if missing comma', async () => {
    await testFails('data:Bad', shaka.util.Error.Code.MALFORMED_DATA_URI);
  });

  async function testSucceeds(uri, contentType, text) {
    // An arbitrary request type.
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    // A dummy progress callback.
    const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};
    const request =
        shaka.net.NetworkingEngine.makeRequest([uri], retryParameters);
    const response = await shaka.net.DataUriPlugin.parse(
        uri, request, requestType, progressUpdated).promise;
    expect(response).toBeTruthy();
    expect(response.uri).toBe(uri);
    expect(response.data).toBeTruthy();
    expect(response.headers['content-type']).toBe(contentType);
    const data =
        shaka.util.StringUtils.fromBytesAutoDetect(response.data);
    expect(data).toBe(text);
  }

  async function testFails(uri, code) {
    // An arbitrary request type.
    const requestType = shaka.net.NetworkingEngine.RequestType.SEGMENT;
    // A dummy progress callback.
    const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};
    const request =
        shaka.net.NetworkingEngine.makeRequest([uri], retryParameters);
    const expected = shaka.test.Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.NETWORK,
        code, uri));
    await expectAsync(
        shaka.net.DataUriPlugin.parse(
            uri, request, requestType, progressUpdated).promise)
        .toBeRejectedWith(expected);
  }
});
