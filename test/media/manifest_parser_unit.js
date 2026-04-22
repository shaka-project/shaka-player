/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ManifestParser', () => {
  const ManifestParser = shaka.media.ManifestParser;

  describe('isSupported', () => {
    const testMimeTypeLowercase = 'application/x-test-type';

    let testFactory;

    beforeEach(() => {
      testFactory = /** @type {shaka.extern.ManifestParser.Factory} */ (() => {
        return /** @type {shaka.extern.ManifestParser} */ ({});
      });

      ManifestParser.registerParserByMime(testMimeTypeLowercase, testFactory);


      // Skip test if MediaSource is not supported (native playback mode)
      if (!deviceDetected.supportsMediaSource()) {
        pending('MediaSource not supported on this platform');
      }
    });

    afterEach(() => {
      ManifestParser.unregisterParserByMime(testMimeTypeLowercase);
    });

    it('returns false for unregistered MIME types', () => {
      expect(ManifestParser.isSupported('application/x-unknown')).toBe(false);
    });
  });
});
