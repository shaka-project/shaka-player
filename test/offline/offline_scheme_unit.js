/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('OfflineScheme', function() {
  beforeEach(checkAndRun(async function() {
    // Make sure we start with a clean slate.
    await clearStorage();
  }));

  afterEach(checkAndRun(async function() {
    // Make sure that we don't waste storage by leaving stuff in storage.
    await clearStorage();
  }));

  it('returns special content-type header for manifests',
      checkAndRun(async function() {
        const expectedContentType = 'application/x-offline-manifest';
        const request = createRequest();
        /** @type {!shaka.offline.OfflineUri} */
        const uri = shaka.offline.OfflineUri.manifest(
            'mechanism', 'cell', 1024);

        let response = await shaka.offline.OfflineScheme(
            uri.toString(), request).promise;

        expect(response).toBeTruthy();
        expect(response.uri).toBe(uri.toString());
        expect(response.headers['content-type']).toBe(expectedContentType);
      }));

  it('returns segment data from storage', checkAndRun(async function() {
    const request = createRequest();
    const segment = createSegment();

    /** @type {!shaka.offline.OfflineUri} */
    let uri;

    /** @type {!shaka.offline.StorageMuxer} */
    let muxer = new shaka.offline.StorageMuxer();
    await shaka.util.IDestroyable.with([muxer], async () => {
      await muxer.init();
      let handle = await muxer.getActive();
      let keys = await handle.cell.addSegments([segment]);
      uri = shaka.offline.OfflineUri.segment(
          handle.path.mechanism, handle.path.cell, keys[0]);
    });

    let response = await shaka.offline.OfflineScheme(
        uri.toString(), request).promise;

    expect(response).toBeTruthy();
    expect(response.data.byteLength).toBe(segment.data.byteLength);
  }));

  it('fails if segment not found', checkAndRun(async function() {
    const request = createRequest();

    /** @type {!shaka.offline.OfflineUri} */
    let uri;

    /** @type {!shaka.offline.StorageMuxer} */
    let muxer = new shaka.offline.StorageMuxer();
    await shaka.util.IDestroyable.with([muxer], async () => {
      await muxer.init();
      let handle = await muxer.getActive();

      // Create a bad uri by using the mechanism and cell of the active cell
      // but use a key that is not in use.
      const badKey = 1000000;
      uri = shaka.offline.OfflineUri.segment(
          handle.path.mechanism, handle.path.cell, badKey);
    });

    try {
      await shaka.offline.OfflineScheme(uri.toString(), request).promise;
      fail();
    } catch (e) {
      expect(e.code).toBe(shaka.util.Error.Code.KEY_NOT_FOUND);
    }
  }));

  it('fails for invalid URI', checkAndRun(async function() {
    const request = createRequest();
    const uri = 'this-in-an-invalid-uri';

    try {
      await shaka.offline.OfflineScheme(uri, request).promise;
      fail();
    } catch (e) {
      expect(e.code).toBe(shaka.util.Error.Code.MALFORMED_OFFLINE_URI);
    }
  }));

  /**
   * @return {shakaExtern.Request}
   */
  function createRequest() {
    let retry = shaka.net.NetworkingEngine.defaultRetryParameters();
    let request = shaka.net.NetworkingEngine.makeRequest([], retry);

    return request;
  }

  /**
   * @return {shakaExtern.SegmentDataDB}
   */
  function createSegment() {
    const dataLength = 12;

    let segment = {
      data: new ArrayBuffer(dataLength)
    };

    return segment;
  }

  /**
   * @return {!Promise}
   */
  function clearStorage() {
    /** @type {!shaka.offline.StorageMuxer} */
    let muxer = new shaka.offline.StorageMuxer();
    return shaka.util.IDestroyable.with([muxer], async () => {
      await muxer.erase();
    });
  }

  /**
   * Before running the test, check if storage is supported on this
   * platform.
   *
   * @param {function():!Promise} test
   * @return {function():!Promise}
   */
  function checkAndRun(test) {
    return async () => {
      let hasSupport = shaka.offline.StorageMuxer.support();
      if (hasSupport) {
        await test();
      } else {
        pending('Storage is not supported on this platform.');
      }
    };
  }
});
