/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.provide('shaka.test.OfflineUtils');


shaka.test.OfflineUtils = class {
  /**
   * @param {string} originalUri
   * @return {shaka.extern.ManifestDB}
   */
  static createManifest(originalUri) {
    return {
      appMetadata: null,
      drmInfo: null,
      duration: 90,
      expiration: Infinity,
      originalManifestUri: originalUri,
      periods: [],
      sessionIds: [],
      size: 1024,
    };
  }

  /**
   * @param {number} id
   * @param {string} type
   * @return {shaka.extern.StreamDB}
   */
  static createStream(id, type) {
    return {
      id: id,
      originalId: id.toString(),
      primary: false,
      presentationTimeOffset: 0,
      contentType: type,
      mimeType: '',
      codecs: '',
      frameRate: undefined,
      kind: undefined,
      language: '',
      label: null,
      width: null,
      height: null,
      initSegmentKey: null,
      encrypted: false,
      keyId: null,
      segments: [],
      variantIds: [],
    };
  }

  /**
   * @param {!Array.<number>} data
   * @return {shaka.extern.SegmentDataDB}
   */
  static createSegmentData(data) {
    return {
      data: shaka.util.BufferUtils.toArrayBuffer(new Uint8Array(data)),
    };
  }

  /**
   * @param {!Array.<shaka.extern.SegmentDataDB>} segments
   * @param {shaka.extern.SegmentDataDB} expected
   */
  static expectSegmentsToContain(segments, expected) {
    const actualData = segments.map((segment) => {
      expect(segment.data).toBeTruthy();
      return shaka.util.BufferUtils.toUint8(segment.data);
    });

    expect(expected.data).toBeTruthy();
    const expectedData = shaka.util.BufferUtils.toUint8(expected.data);

    expect(actualData).toContain(expectedData);
  }

  /**
   * @param {shaka.extern.SegmentDataDB} actual
   * @param {shaka.extern.SegmentDataDB} expected
   */
  static expectSegmentToEqual(actual, expected) {
    expect(actual.data).toBeTruthy();
    expect(expected.data).toBeTruthy();

    const actualData = shaka.util.BufferUtils.toUint8(actual.data);
    const expectedData = shaka.util.BufferUtils.toUint8(expected.data);

    expect(actualData).toEqual(expectedData);
  }
};
