/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DrmUtils', () => {
  describe('isPlayReadyKeySystem', () => {
    it('should return true for MS & Chromecast PlayReady', () => {
      expect(shaka.util.DrmUtils.isPlayReadyKeySystem(
          'com.microsoft.playready')).toBe(true);
      expect(shaka.util.DrmUtils.isPlayReadyKeySystem(
          'com.microsoft.playready.anything')).toBe(true);
      expect(shaka.util.DrmUtils.isPlayReadyKeySystem(
          'com.chromecast.playready')).toBe(true);
    });

    it('should return false for non-PlayReady key systems', () => {
      expect(shaka.util.DrmUtils.isPlayReadyKeySystem(
          'com.widevine.alpha')).toBe(false);
      expect(shaka.util.DrmUtils.isPlayReadyKeySystem(
          'com.abc.playready')).toBe(false);
    });
  });

  describe('isFairPlayKeySystem', () => {
    it('should return true for FairPlay', () => {
      expect(shaka.util.DrmUtils.isFairPlayKeySystem(
          'com.apple.fps')).toBe(true);
      expect(shaka.util.DrmUtils.isFairPlayKeySystem(
          'com.apple.fps.1_0')).toBe(true);
      expect(shaka.util.DrmUtils.isFairPlayKeySystem(
          'com.apple.fps.2_0')).toBe(true);
      expect(shaka.util.DrmUtils.isFairPlayKeySystem(
          'com.apple.fps.3_0')).toBe(true);
    });

    it('should return false for non-FairPlay key systems', () => {
      expect(shaka.util.DrmUtils.isFairPlayKeySystem(
          'com.widevine.alpha')).toBe(false);
      expect(shaka.util.DrmUtils.isFairPlayKeySystem(
          'com.abc.playready')).toBe(false);
    });
  });
});
