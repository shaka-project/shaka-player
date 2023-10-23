/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

shaka.test.OfflineUtils = class {
  /**
   * @param {string} originalUri
   * @return {shaka.extern.ManifestDB}
   */
  static createManifest(originalUri) {
    return {
      creationTime: Date.now(),
      appMetadata: null,
      drmInfo: null,
      duration: 90,
      expiration: Infinity,
      originalManifestUri: originalUri,
      streams: [],
      sessionIds: [],
      size: 1024,
      sequenceMode: false,
    };
  }

  /**
   * @param {number} id
   * @param {string} type
   * @return {shaka.extern.StreamDB}
   */
  static createStream(id, type) {
    return {
      id,
      originalId: id.toString(),
      groupId: null,
      primary: false,
      presentationTimeOffset: 0,
      type,
      mimeType: '',
      codecs: '',
      frameRate: undefined,
      pixelAspectRatio: undefined,
      kind: undefined,
      language: '',
      originalLanguage: null,
      label: null,
      width: null,
      height: null,
      initSegmentKey: null,
      encrypted: false,
      keyIds: new Set(),
      segments: [],
      variantIds: [],
      roles: [],
      forced: false,
      channelsCount: null,
      audioSamplingRate: null,
      spatialAudio: false,
      closedCaptions: null,
      external: false,
      fastSwitching: false,
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
