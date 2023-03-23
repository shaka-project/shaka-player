/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MediaCapabilities', () => {
  const originalCast = window['cast'];
  const originalVendor = navigator.vendor;
  const originalUserAgent = navigator.userAgent;
  const originalRequestMediaKeySystemAccess =
    navigator.requestMediaKeySystemAccess;
  const originalMediaCapabilities = navigator.mediaCapabilities;
  const supportMap = shaka.media.Capabilities.MediaSourceTypeSupportMap;

  /** @type {MediaDecodingConfiguration} */
  let mockDecodingConfig;
  /** @type {!jasmine.Spy} */
  let mockCanDisplayType;

  beforeAll(() => {
    Object.defineProperty(window['navigator'],
        'userAgent', {
          value: 'unknown', configurable: true,
          writable: true,
        });
    Object.defineProperty(window['navigator'],
        'vendor', {
          value: 'unknown', configurable: true,
          writable: true,
        });
    Object.defineProperty(window['navigator'],
        'requestMediaKeySystemAccess', {
          value: 'unknown', configurable: true,
          writable: true,
        });
    Object.defineProperty(window['navigator'],
        'mediaCapabilities', {
          value: undefined, configurable: true,
          writable: true,
        });
  });

  beforeEach(() => {
    mockDecodingConfig = {
      audio: {
        bitrate: 100891,
        channels: 2,
        contentType: 'audio/mp4; codecs="mp4a.40.2"',
        samplerate: 48000,
        spatialRendering: false,
      },
      keySystemConfiguration: {
        audio: {robustness: 'SW_SECURE_CRYPTO'},
        distinctiveIdentifier: 'optional',
        initDataType: 'cenc',
        keySystem: 'com.widevine.alpha',
        persistentState: 'optional',
        sessionTypes: ['temporary'],
        video: {robustness: 'SW_SECURE_CRYPTO'},
      },
      type: 'media-source',
      video: {
        bitrate: 349265,
        contentType: 'video/mp4; codecs="avc1.4D4015"',
        framerate: 23.976023976023978,
        height: 288,
        width: 512,
      },
    };
    shaka.polyfill.MediaCapabilities.memoizedMediaKeySystemAccessRequests_ = {};
    supportMap.clear();

    mockCanDisplayType = jasmine.createSpy('canDisplayType');
    mockCanDisplayType.and.returnValue(false);
  });

  afterEach(() => {
    window['cast'] = originalCast;
  });

  afterAll(() => {
    window['cast'] = originalCast;
    Object.defineProperty(window['navigator'],
        'userAgent', {value: originalUserAgent});
    Object.defineProperty(window['navigator'],
        'vendor', {value: originalVendor});
    Object.defineProperty(window['navigator'],
        'requestMediaKeySystemAccess',
        {value: originalRequestMediaKeySystemAccess});
    Object.defineProperty(window['navigator'],
        'mediaCapabilities', {value: originalMediaCapabilities});
  });

  describe('install', () => {
    it('should define decoding info method', () => {
      shaka.polyfill.MediaCapabilities.install();

      expect(navigator.mediaCapabilities.decodingInfo).toBeDefined();
    });
  });

  describe('decodingInfo', () => {
    it('should check codec support when MediaDecodingConfiguration.type ' +
      'is "media-source"', () => {
      expect(window['MediaSource']['isTypeSupported']).toBeDefined();
      shaka.polyfill.MediaCapabilities.install();
      navigator.mediaCapabilities.decodingInfo(mockDecodingConfig);

      expect(supportMap.has(mockDecodingConfig.video.contentType)).toBe(true);
      expect(supportMap.has(mockDecodingConfig.audio.contentType)).toBe(true);
    });

    it('should check codec support when MediaDecodingConfiguration.type ' +
      'is "file"', () => {
      const supportsMediaTypeSpy =
          spyOn(shaka['util']['Platform'],
              'supportsMediaType').and.returnValue(true);
      mockDecodingConfig.type = 'file';
      shaka.polyfill.MediaCapabilities.install();
      navigator.mediaCapabilities.decodingInfo(mockDecodingConfig);

      expect(supportsMediaTypeSpy).toHaveBeenCalledTimes(2);
      expect(supportsMediaTypeSpy).toHaveBeenCalledWith(
          mockDecodingConfig.video.contentType,
      );
      expect(supportsMediaTypeSpy).toHaveBeenCalledWith(
          mockDecodingConfig.audio.contentType,
      );
    });

    it('should check MediaKeySystem when keySystemConfiguration is present',
        async () => {
          const mockResult = {mockKeySystemAccess: 'mockKeySystemAccess'};
          spyOn(window['MediaSource'], 'isTypeSupported').and.returnValue(true);
          const requestKeySystemAccessSpy =
          spyOn(window['navigator'],
              'requestMediaKeySystemAccess').and.returnValue(mockResult);

          shaka.polyfill.MediaCapabilities.install();
          const result = await navigator.mediaCapabilities
              .decodingInfo(mockDecodingConfig);

          expect(requestKeySystemAccessSpy).toHaveBeenCalledWith(
              'com.widevine.alpha',
              [{
                audioCapabilities: [
                  {
                    robustness: 'SW_SECURE_CRYPTO',
                    contentType: 'audio/mp4; codecs="mp4a.40.2"',
                  },
                ],
                distinctiveIdentifier: 'optional',
                initDataTypes: ['cenc'],
                persistentState: 'optional',
                sessionTypes: ['temporary'],
                videoCapabilities: [{
                  robustness: 'SW_SECURE_CRYPTO',
                  contentType: 'video/mp4; codecs="avc1.4D4015"',
                }],
              }],
          );
          expect(result.keySystemAccess).toEqual(mockResult);
        });

    it('should read previously requested codec/key system'+
        'combinations from cache', async () => {
      const mockResult = {mockKeySystemAccess: 'mockKeySystemAccess'};
      spyOn(window['MediaSource'], 'isTypeSupported').and.returnValue(true);
      const requestKeySystemAccessSpy =
          spyOn(window['navigator'],
              'requestMediaKeySystemAccess').and.returnValue(mockResult);

      shaka.polyfill.MediaCapabilities.install();
      await navigator.mediaCapabilities
          .decodingInfo(mockDecodingConfig);
      await navigator.mediaCapabilities
          .decodingInfo(mockDecodingConfig);

      expect(requestKeySystemAccessSpy)
          .toHaveBeenCalledTimes(1);
    });

    it('falls back to isTypeSupported() when cast namespace is not available',
        async () => {
          // Temporarily remove window.cast to trigger error. It's restored
          // after every test.
          delete window['cast'];

          const isChromecastSpy =
              spyOn(shaka['util']['Platform'],
                  'isChromecast').and.returnValue(true);
          expect(window['MediaSource']['isTypeSupported']).toBeDefined();

          shaka.polyfill.MediaCapabilities.install();
          await navigator.mediaCapabilities.decodingInfo(mockDecodingConfig);

          expect(mockCanDisplayType).not.toHaveBeenCalled();
          // 1 (during install()) + 1 (for video config check).
          expect(isChromecastSpy).toHaveBeenCalledTimes(2);
          // 1 (fallback in canCastDisplayType()) +
          // 1 (mockDecodingConfig.audio).
          expect(supportMap.has(mockDecodingConfig.video.contentType))
              .toBe(true);
          expect(supportMap.has(mockDecodingConfig.audio.contentType))
              .toBe(true);
        });

    it('falls back to isTypeSupported() when canDisplayType() missing',
        async () => {
          // We only set the cast namespace, but not the canDisplayType() API.
          window['cast'] = {};
          const isChromecastSpy =
              spyOn(shaka['util']['Platform'],
                  'isChromecast').and.returnValue(true);
          expect(window['MediaSource']['isTypeSupported']).toBeDefined();

          shaka.polyfill.MediaCapabilities.install();
          await navigator.mediaCapabilities.decodingInfo(mockDecodingConfig);

          expect(mockCanDisplayType).not.toHaveBeenCalled();
          // 1 (during install()) + 1 (for video config check).
          expect(isChromecastSpy).toHaveBeenCalledTimes(2);
          // 1 (fallback in canCastDisplayType()) +
          // 1 (mockDecodingConfig.audio).
          expect(supportMap.has(mockDecodingConfig.video.contentType))
              .toBe(true);
          expect(supportMap.has(mockDecodingConfig.audio.contentType))
              .toBe(true);
        });

    it('should use cast.__platform__.canDisplayType for "supported" field ' +
        'when platform is Cast', async () => {
      // We're using quotes to access window.cast because the compiler
      // knows about lots of Cast-specific APIs we aren't mocking.  We
      // don't need this mock strictly type-checked.
      window['cast'] = {
        __platform__: {canDisplayType: mockCanDisplayType},
      };
      const isChromecastSpy =
          spyOn(shaka['util']['Platform'],
              'isChromecast').and.returnValue(true);
      expect(window['MediaSource']['isTypeSupported']).toBeDefined();

      // Tests an HDR stream's extended MIME type is correctly provided.
      mockDecodingConfig.video.transferFunction = 'pq';
      mockDecodingConfig.video.contentType =
          'video/mp4; codecs="hev1.2.4.L153.B0"';
      // Round to a whole number since we can't rely on number => string
      // conversion precision on all devices.
      mockDecodingConfig.video.framerate = 24;

      const chromecastType =
          'video/mp4; ' +
          'codecs="hev1.2.4.L153.B0"; ' +
          'width=512; ' +
          'height=288; ' +
          'framerate=24; ' +
          'eotf=smpte2084';
      mockCanDisplayType.and.callFake((type) => {
        expect(type).toBe(chromecastType);
        supportMap.set(type, true);
        return true;
      });

      shaka.polyfill.MediaCapabilities.install();
      await navigator.mediaCapabilities.decodingInfo(mockDecodingConfig);

      // 1 (during install()) + 1 (for video config check).
      expect(isChromecastSpy).toHaveBeenCalledTimes(2);
      // 1 (mockDecodingConfig.audio).
      expect(supportMap.has(chromecastType)).toBe(true);
      // Called once in canCastDisplayType.
      expect(mockCanDisplayType).toHaveBeenCalledTimes(1);
    });
  });
});
