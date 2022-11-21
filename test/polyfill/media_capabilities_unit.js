/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MediaCapabilities', () => {
  const originalVendor = navigator.vendor;
  const originalUserAgent = navigator.userAgent;
  const originalRequestMediaKeySystemAccess =
    navigator.requestMediaKeySystemAccess;
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
  });

  afterAll(() => {
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
  });
});
