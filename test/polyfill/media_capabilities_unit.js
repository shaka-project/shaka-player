/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MediaCapabilities', () => {
  const originalVendor = navigator.vendor;
  const originalUserAgent = navigator.userAgent;
  const originalMediaCapabilities = navigator.mediaCapabilities;
  /** @type {MediaDecodingConfiguration} */
  let mockDecodingConfig;

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
  });

  afterAll(() => {
    Object.defineProperty(window['navigator'],
        'userAgent', {value: originalUserAgent});
    Object.defineProperty(window['navigator'],
        'vendor', {value: originalVendor});
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
      const isTypeSupportedSpy =
          spyOn(window['MediaSource'], 'isTypeSupported').and.returnValue(true);
      shaka.polyfill.MediaCapabilities.install();
      navigator.mediaCapabilities.decodingInfo(mockDecodingConfig);

      expect(isTypeSupportedSpy).toHaveBeenCalledTimes(2);
      expect(isTypeSupportedSpy).toHaveBeenCalledWith(
          mockDecodingConfig.video.contentType,
      );
      expect(isTypeSupportedSpy).toHaveBeenCalledWith(
          mockDecodingConfig.audio.contentType,
      );
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
  });

  describe('generateKeySystemCacheKey_', () => {
    it('should create key as expected', () => {
      const videoCodec = 'video/mp4; codecs="avc1.4D4015"';
      const audioCodec = 'audio/mp4; codecs="mp4a.40.2"';
      const keySystem = 'com.widevine.alpha';

      /** @suppress {accessControls} */
      const key = shaka.polyfill.MediaCapabilities.generateKeySystemCacheKey_(
          videoCodec,
          audioCodec,
          keySystem,
      );

      expect(key).toBe('video/mp4; codecs="avc1.4D4015"' +
        '#audio/mp4; codecs="mp4a.40.2"#com.widevine.alpha');
    });
  });

  describe('appendKeySystemCache', () => {
    it('should populate cache and not call requestMediaKeySystemAccess', () => {
      const videoCodec = 'video/mp4; codecs="avc1.4D4015"';
      const audioCodec = 'audio/mp4; codecs="mp4a.40.2"';
      const keySystem = 'com.widevine.alpha';

      /** @suppress {accessControls} */
      const key = shaka.polyfill.MediaCapabilities.generateKeySystemCacheKey_(
          videoCodec,
          audioCodec,
          keySystem,
      );

      const keySystemAccessResult = /** @type {!MediaKeySystemAccess} */ ({
        keySystem: 'com.widevine.alpha',
      });

      spyOn(window['MediaSource'], 'isTypeSupported').and.returnValue(true);
      const requestKeySystemAccessSpy =
          spyOn(window['navigator'], 'requestMediaKeySystemAccess');

      shaka.polyfill.MediaCapabilities.install();
      shaka.polyfill.MediaCapabilities.appendKeySystemCache(
          videoCodec,
          audioCodec,
          keySystem, keySystemAccessResult);
      navigator.mediaCapabilities.decodingInfo(mockDecodingConfig);

      expect(requestKeySystemAccessSpy)
          .not.toHaveBeenCalled();
      expect(shaka.polyfill.MediaCapabilities
          .memoizedMediaKeySystemAccessRequests_[key])
          .toBe(keySystemAccessResult);
    });
  });
});
