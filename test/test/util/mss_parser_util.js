/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @summary Utilities for working with the MSS parser. */
shaka.test.Mss = class {
  /**
   * Constructs and configures a very simple MSS parser.
   * @return {!shaka.mss.MssParser}
   */
  static makeMssParser() {
    const parser = new shaka.mss.MssParser();
    const config = shaka.util.PlayerConfiguration.createDefault().manifest;
    parser.configure(config);
    return parser;
  }

  /**
   * Tests the segment index produced by the MSS manifest parser.
   *
   * @param {string} manifestText
   * @param {!Array.<shaka.media.SegmentReference>} references
   * @return {!Promise}
   */
  static async testSegmentIndex(manifestText, references) {
    const buffer = shaka.util.StringUtils.toUTF8(manifestText);
    const mssParser = shaka.test.Mss.makeMssParser();

    const networkingEngine = new shaka.test.FakeNetworkingEngine()
        .setResponseValue('dummy://foo', buffer);

    const playerInterface = {
      networkingEngine: networkingEngine,
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: () => {},
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,
      onEvent: fail,
      onError: fail,
      isLowLatencyMode: () => false,
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
    };
    const manifest = await mssParser.start('dummy://foo', playerInterface);
    const stream = manifest.variants[0].audio;
    await stream.createSegmentIndex();

    shaka.test.ManifestParser.verifySegmentIndex(stream, references);
  }

  /**
   * Tests that the MSS manifest parser fails to parse the given manifest.
   *
   * @param {string} manifestText
   * @param {!shaka.util.Error} expectedError
   * @return {!Promise}
   */
  static async testFails(manifestText, expectedError) {
    const manifestData = shaka.util.StringUtils.toUTF8(manifestText);
    const mssParser = shaka.test.Mss.makeMssParser();

    const networkingEngine = new shaka.test.FakeNetworkingEngine()
        .setResponseValue('dummy://foo', manifestData);

    const playerInterface = {
      networkingEngine: networkingEngine,
      modifyManifestRequest: (request, manifestInfo) => {},
      modifySegmentRequest: (request, segmentInfo) => {},
      filter: () => {},
      makeTextStreamsForClosedCaptions: (manifest) => {},
      onTimelineRegionAdded: fail,  // Should not have any EventStream elements.
      onEvent: fail,
      onError: fail,
      isLowLatencyMode: () => false,
      isAutoLowLatencyMode: () => false,
      enableLowLatencyMode: () => {},
      updateDuration: () => {},
      newDrmInfo: (stream) => {},
    };
    const p = mssParser.start('dummy://foo', playerInterface);
    await expectAsync(p).toBeRejectedWith(
        shaka.test.Util.jasmineError(expectedError));
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @return {!Promise.<shaka.media.SegmentReference>}
   */
  static async getFirstAudioSegmentReference(manifest) {
    const variant = manifest.variants[0];
    expect(variant).not.toBe(null);
    if (!variant) {
      return null;
    }

    const audio = variant.audio;
    expect(audio).not.toBe(null);
    if (!audio) {
      return null;
    }

    await audio.createSegmentIndex();
    const position = audio.segmentIndex.find(0);
    goog.asserts.assert(position != null, 'Position should not be null!');

    const reference = audio.segmentIndex.get(position);
    goog.asserts.assert(reference != null, 'Reference should not be null!');
    return reference;
  }
};
