/*! @license
 * Shaka Player
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ManifestParser', () => {
  const ManifestParser = shaka.media.ManifestParser;

  describe('isSupported', () => {
    const testMimeTypeLowercase = 'application/x-test-type';
    const testMimeTypeUppercase = testMimeTypeLowercase.toUpperCase();
    const testMimeTypeMixedCase = 'Application/X-Test-Type';

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

    it('performs case-insensitive MIME type matching', () => {
      // Test lowercase MIME type - original registration
      expect(ManifestParser.isSupported(testMimeTypeLowercase)).toBe(true);

      // Test uppercase MIME type
      expect(ManifestParser.isSupported(testMimeTypeUppercase))
          .toBe(true);

      // Test mixed case MIME type
      expect(ManifestParser.isSupported(testMimeTypeMixedCase))
          .toBe(true);
    });

    it('returns false for unregistered MIME types', () => {
      // Verify that case-insensitive matching still correctly rejects
      // MIME types that are not registered
      expect(ManifestParser.isSupported('application/x-unknown')).toBe(false);
      expect(ManifestParser.isSupported('APPLICATION/X-UNKNOWN')).toBe(false);
    });
  });
});
