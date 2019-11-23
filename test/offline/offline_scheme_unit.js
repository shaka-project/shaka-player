/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @return {boolean} */
const offlineSchemeSupport = () => shaka.offline.StorageMuxer.support();
filterDescribe('OfflineScheme', offlineSchemeSupport, () => {
  // An arbitrary request type.
  const requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;

  // A dummy progress callback.
  const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};

  const Util = shaka.test.Util;

  beforeEach(async () => {
    // Make sure we start with a clean slate.
    await clearStorage();
  });

  afterEach(async () => {
    // Make sure that we don't waste storage by leaving stuff in storage.
    await clearStorage();
  });

  it('returns special content-type header for manifests', async () => {
    const expectedContentType = 'application/x-offline-manifest';
    const request = createRequest();
    /** @type {!shaka.offline.OfflineUri} */
    const uri = shaka.offline.OfflineUri.manifest(
        'mechanism', 'cell', 1024);

    const response = await shaka.offline.OfflineScheme.plugin(
        uri.toString(), request, requestType, progressUpdated).promise;

    expect(response).toBeTruthy();
    expect(response.uri).toBe(uri.toString());
    expect(response.headers['content-type']).toBe(expectedContentType);
  });

  it('returns segment data from storage', async () => {
    const request = createRequest();
    const segment = createSegment();

    /** @type {!shaka.offline.OfflineUri} */
    let uri;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();
      const keys = await handle.cell.addSegments([segment]);
      uri = shaka.offline.OfflineUri.segment(
          handle.path.mechanism, handle.path.cell, keys[0]);
    } finally {
      await muxer.destroy();
    }

    const response = await shaka.offline.OfflineScheme.plugin(
        uri.toString(), request, requestType, progressUpdated).promise;

    expect(response).toBeTruthy();
    expect(response.data.byteLength).toBe(segment.data.byteLength);
  });

  it('fails if segment not found', async () => {
    const request = createRequest();

    /** @type {!shaka.offline.OfflineUri} */
    let uri;

    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.init();
      const handle = await muxer.getActive();

      // Create a bad uri by using the mechanism and cell of the active cell
      // but use a key that is not in use.
      const badKey = 1000000;
      uri = shaka.offline.OfflineUri.segment(
          handle.path.mechanism, handle.path.cell, badKey);
    } finally {
      await muxer.destroy();
    }

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.STORAGE,
        shaka.util.Error.Code.KEY_NOT_FOUND,
        jasmine.any(String)));
    await expectAsync(
        shaka.offline.OfflineScheme.plugin(
            uri.toString(), request, requestType, progressUpdated).promise)
        .toBeRejectedWith(expected);
  });

  it('fails for invalid URI', async () => {
    const request = createRequest();
    const uri = 'this-in-an-invalid-uri';

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.MALFORMED_OFFLINE_URI,
        uri));
    await expectAsync(
        shaka.offline.OfflineScheme.plugin(
            uri, request, requestType, progressUpdated).promise)
        .toBeRejectedWith(expected);
  });

  /**
   * @return {shaka.extern.Request}
   */
  function createRequest() {
    const retry = shaka.net.NetworkingEngine.defaultRetryParameters();
    const request = shaka.net.NetworkingEngine.makeRequest([], retry);

    return request;
  }

  /**
   * @return {shaka.extern.SegmentDataDB}
   */
  function createSegment() {
    const dataLength = 12;

    const segment = {
      data: new ArrayBuffer(dataLength),
    };

    return segment;
  }

  /**
   * @return {!Promise}
   */
  async function clearStorage() {
    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.erase();
    } finally {
      await muxer.destroy;
    }
  }
});
