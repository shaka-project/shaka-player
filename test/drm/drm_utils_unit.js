/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// cspell:words eadbeefdeadbeefdeadbeefdeadbeefd

describe('DrmUtils', () => {
  describe('getCommonDrmInfos', () => {
    it('returns one array if the other is empty', () => {
      const drmInfo = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: undefined,
        serverCertificateUri: '',
        initData: [],
        keyIds: new Set(['deadbeefdeadbeefdeadbeefdeadbeef']),
      };
      const returnedOne =
          shaka.drm.DrmUtils.getCommonDrmInfos([drmInfo], []);
      const returnedTwo =
          shaka.drm.DrmUtils.getCommonDrmInfos([], [drmInfo]);
      expect(returnedOne).toEqual([drmInfo]);
      expect(returnedTwo).toEqual([drmInfo]);
    });

    it('merges drmInfos if two exist', () => {
      const serverCert = new Uint8Array(0);
      const drmInfoVideo = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: false,
        persistentStateRequired: true,
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: serverCert,
        serverCertificateUri: '',
        initData: [{keyId: 'a'}],
        keyIds: new Set(['deadbeefdeadbeefdeadbeefdeadbeef']),
      };
      const drmInfoAudio = {
        keySystem: 'drm.abc',
        licenseServerUri: undefined,
        distinctiveIdentifierRequired: true,
        persistentStateRequired: false,
        audioRobustness: 'good',
        serverCertificate: undefined,
        serverCertificateUri: '',
        initData: [{keyId: 'b'}],
        keyIds: new Set(['eadbeefdeadbeefdeadbeefdeadbeefd']),
      };
      const drmInfoDesired = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: serverCert,
        serverCertificateUri: '',
        initData: [{keyId: 'a'}, {keyId: 'b'}],
        keyIds: new Set([
          'deadbeefdeadbeefdeadbeefdeadbeef',
          'eadbeefdeadbeefdeadbeefdeadbeefd',
        ]),
      };
      const returned = shaka.drm.DrmUtils.getCommonDrmInfos([drmInfoVideo],
          [drmInfoAudio]);
      expect(returned).toEqual([drmInfoDesired]);
    });

    it('dedupes the merged init data based on keyId matching', () => {
      const serverCert = new Uint8Array(0);
      const drmInfoVideo = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: false,
        persistentStateRequired: true,
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: serverCert,
        serverCertificateUri: '',
        initData: [{keyId: 'v-init'}],
        keyIds: new Set(['deadbeefdeadbeefdeadbeefdeadbeef']),
      };
      const drmInfoAudio = {
        keySystem: 'drm.abc',
        licenseServerUri: undefined,
        distinctiveIdentifierRequired: true,
        persistentStateRequired: false,
        audioRobustness: 'good',
        serverCertificate: undefined,
        serverCertificateUri: '',
        initData: [{keyId: 'v-init'}, {keyId: 'a-init'}],
        keyIds: new Set(['eadbeefdeadbeefdeadbeefdeadbeefd']),
      };
      const drmInfoDesired = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: serverCert,
        serverCertificateUri: '',
        initData: [{keyId: 'v-init'}, {keyId: 'a-init'}],
        keyIds: new Set([
          'deadbeefdeadbeefdeadbeefdeadbeef',
          'eadbeefdeadbeefdeadbeefdeadbeefd',
        ]),
      };
      const returned = shaka.drm.DrmUtils.getCommonDrmInfos([drmInfoVideo],
          [drmInfoAudio]);
      expect(returned).toEqual([drmInfoDesired]);
    });

    it('does not match incompatible drmInfos', () => {
      // Different key systems do not match.
      const drmInfo1 = {
        keySystem: 'drm.abc',
        licenseServerUri: undefined,
        distinctiveIdentifierRequired: false,
        persistentStateRequired: false,
        serverCertificate: undefined,
        serverCertificateUri: '',
        initData: [],
        keyIds: new Set(),
      };
      const drmInfo2 = {
        keySystem: 'drm.foobar',
        licenseServerUri: undefined,
        distinctiveIdentifierRequired: false,
        persistentStateRequired: false,
        serverCertificate: undefined,
        serverCertificateUri: '',
        initData: [],
        keyIds: new Set(),
      };
      const returned1 = shaka.drm.DrmUtils.getCommonDrmInfos(
          [drmInfo1], [drmInfo2]);
      expect(returned1).toEqual([]);
    });
  }); // describe('getCommonDrmInfos')

  describe('isClearKeySystem', () => {
    it('should return true for ClearKey', () => {
      expect(shaka.drm.DrmUtils.isClearKeySystem(
          'org.w3.clearkey')).toBe(true);
    });

    it('should return false for non-ClearKey key systems', () => {
      expect(shaka.drm.DrmUtils.isClearKeySystem(
          'com.widevine.alpha')).toBe(false);
      expect(shaka.drm.DrmUtils.isClearKeySystem(
          'com.microsoft.playready')).toBe(false);
      expect(shaka.drm.DrmUtils.isClearKeySystem(
          'com.apple.fps')).toBe(false);
    });
  });

  describe('isWidevineKeySystem', () => {
    it('should return true for Widevine', () => {
      expect(shaka.drm.DrmUtils.isWidevineKeySystem(
          'com.widevine.alpha')).toBe(true);
      expect(shaka.drm.DrmUtils.isWidevineKeySystem(
          'com.widevine.alpha.anything')).toBe(true);
    });

    it('should return false for non-Widevine key systems', () => {
      expect(shaka.drm.DrmUtils.isWidevineKeySystem(
          'com.microsoft.playready')).toBe(false);
      expect(shaka.drm.DrmUtils.isWidevineKeySystem(
          'com.apple.fps')).toBe(false);
    });
  });

  describe('isPlayReadyKeySystem', () => {
    it('should return true for MS & Chromecast PlayReady', () => {
      expect(shaka.drm.DrmUtils.isPlayReadyKeySystem(
          'com.microsoft.playready')).toBe(true);
      expect(shaka.drm.DrmUtils.isPlayReadyKeySystem(
          'com.microsoft.playready.anything')).toBe(true);
      expect(shaka.drm.DrmUtils.isPlayReadyKeySystem(
          'com.chromecast.playready')).toBe(true);
    });

    it('should return false for non-PlayReady key systems', () => {
      expect(shaka.drm.DrmUtils.isPlayReadyKeySystem(
          'com.widevine.alpha')).toBe(false);
      expect(shaka.drm.DrmUtils.isPlayReadyKeySystem(
          'com.abc.playready')).toBe(false);
    });
  });

  describe('isFairPlayKeySystem', () => {
    it('should return true for FairPlay', () => {
      expect(shaka.drm.DrmUtils.isFairPlayKeySystem(
          'com.apple.fps')).toBe(true);
      expect(shaka.drm.DrmUtils.isFairPlayKeySystem(
          'com.apple.fps.1_0')).toBe(true);
      expect(shaka.drm.DrmUtils.isFairPlayKeySystem(
          'com.apple.fps.2_0')).toBe(true);
      expect(shaka.drm.DrmUtils.isFairPlayKeySystem(
          'com.apple.fps.3_0')).toBe(true);
    });

    it('should return false for non-FairPlay key systems', () => {
      expect(shaka.drm.DrmUtils.isFairPlayKeySystem(
          'com.widevine.alpha')).toBe(false);
      expect(shaka.drm.DrmUtils.isFairPlayKeySystem(
          'com.abc.playready')).toBe(false);
    });
  });

  describe('isWisePlayKeySystem', () => {
    it('should return true for WisePlay', () => {
      expect(shaka.drm.DrmUtils.isWisePlayKeySystem(
          'com.huawei.wiseplay')).toBe(true);
    });

    it('should return false for non-WisePlay key systems', () => {
      expect(shaka.drm.DrmUtils.isWisePlayKeySystem(
          'com.widevine.alpha')).toBe(false);
      expect(shaka.drm.DrmUtils.isWisePlayKeySystem(
          'com.microsoft.playready')).toBe(false);
      expect(shaka.drm.DrmUtils.isWisePlayKeySystem(
          'com.apple.fps')).toBe(false);
    });
  });

  describe('isMediaKeysPolyfilled', () => {
    let shakaMediaKeysPolyfill;

    beforeAll(() => {
      shakaMediaKeysPolyfill = window.shakaMediaKeysPolyfill;
    });

    afterAll(() => {
      window.shakaMediaKeysPolyfill = shakaMediaKeysPolyfill;
    });

    it('should return true with a matching polyfill type', () => {
      window.shakaMediaKeysPolyfill = 'webkit';
      const result = shaka.drm.DrmUtils.isMediaKeysPolyfilled('webkit');
      expect(result).toBe(true);
    });

    it('should return false with a non-matching polyfill type', () => {
      window.shakaMediaKeysPolyfill = 'webkit';
      const result = shaka.drm.DrmUtils.isMediaKeysPolyfilled('apple');
      expect(result).toBe(false);
    });
  });
});
