/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DrmEngine', () => {
  const Util = shaka.test.Util;

  const originalRequestMediaKeySystemAccess =
      navigator.requestMediaKeySystemAccess;
  const originalLogError = shaka.log.error;
  const originalBatchTime = shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME;
  const originalDecodingInfo = navigator.mediaCapabilities.decodingInfo;

  /** @type {!jasmine.Spy} */
  let decodingInfoSpy;
  /** @type {!jasmine.Spy} */
  let logErrorSpy;
  /** @type {!jasmine.Spy} */
  let onErrorSpy;
  /** @type {!jasmine.Spy} */
  let onKeyStatusSpy;
  /** @type {!jasmine.Spy} */
  let onExpirationSpy;
  /** @type {!jasmine.Spy} */
  let onEventSpy;

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let fakeNetEngine;
  /** @type {!shaka.media.DrmEngine} */
  let drmEngine;
  /** @type {shaka.extern.Manifest} */
  let manifest;
  /** @type {shaka.extern.DrmConfiguration} */
  let config;

  let mockMediaKeySystemAccess;
  let mockMediaKeys;
  /** @type {!shaka.test.FakeVideo} */
  let mockVideo;

  let session1;
  let session2;
  let session3;

  const containing = jasmine.objectContaining;

  beforeAll(() => {
    shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME = 0;
  });

  afterAll(() => {
    shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME = originalBatchTime;
  });

  beforeEach(() => {
    decodingInfoSpy = jasmine.createSpy('decodingInfo');
    navigator.mediaCapabilities.decodingInfo =
        shaka.test.Util.spyFunc(decodingInfoSpy);

    logErrorSpy = jasmine.createSpy('shaka.log.error');
    shaka.log.error = shaka.test.Util.spyFunc(logErrorSpy);

    onErrorSpy = jasmine.createSpy('onError');
    onKeyStatusSpy = jasmine.createSpy('onKeyStatus');
    onExpirationSpy = jasmine.createSpy('onExpirationUpdated');
    onEventSpy = jasmine.createSpy('onEvent');

    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addVariant(0, (variant) => {
        variant.addVideo(1, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('drm.abc');
          stream.addDrmInfo('drm.def');
          stream.mime('video/foo', 'vbar');
        });
        variant.addAudio(2, (stream) => {
          stream.encrypted = true;
          stream.addDrmInfo('drm.abc');
          stream.addDrmInfo('drm.def');
          stream.mime('audio/foo', 'abar');
        });
      });
    });

    // By default, error logs and callbacks result in failure.
    onErrorSpy.and.callFake(fail);
    logErrorSpy.and.callFake(fail);

    // By default, allow keysystem drm.abc
    setDecodingInfoSpy(['drm.abc']);

    mockVideo = new shaka.test.FakeVideo();

    session1 = createMockSession();
    session2 = createMockSession();
    session3 = createMockSession();

    mockMediaKeySystemAccess = createMockMediaKeySystemAccess();

    mockMediaKeys = createMockMediaKeys();
    mockMediaKeys.createSession.and.callFake(() => {
      const index = mockMediaKeys.createSession.calls.count() - 1;
      return [session1, session2, session3][index];
    });
    mockMediaKeys.setServerCertificate.and.returnValue(Promise.resolve());

    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    const license = new Uint8Array(0);
    fakeNetEngine.setResponseValue('http://abc.drm/license', license);

    const playerInterface = {
      netEngine: fakeNetEngine,
      onError: shaka.test.Util.spyFunc(onErrorSpy),
      onKeyStatus: shaka.test.Util.spyFunc(onKeyStatusSpy),
      onExpirationUpdated: shaka.test.Util.spyFunc(onExpirationSpy),
      onEvent: shaka.test.Util.spyFunc(onEventSpy),
    };

    drmEngine = new shaka.media.DrmEngine(playerInterface);

    config = shaka.util.PlayerConfiguration.createDefault().drm;
    config.servers = {
      'drm.abc': 'http://abc.drm/license',
      'drm.def': 'http://def.drm/license',
    };
    // Some platforms, such as Xbox, default to parseInbandPssh: true, which
    // ignores encrypted events.  So set it explicitly to false, and let
    // individual tests set it to true where relevant.
    config.parseInbandPsshEnabled = false;

    drmEngine.configure(config);
  });

  afterEach(async () => {
    await drmEngine.destroy();

    navigator.requestMediaKeySystemAccess =
        originalRequestMediaKeySystemAccess;
    navigator.mediaCapabilities.decodingInfo = originalDecodingInfo;
    shaka.log.error = originalLogError;
  });

  describe('supportsVariants', () => {
    it('supports all clear variants', async () => {
      const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.encrypted = false;
            stream.addDrmInfo('drm.abc');
            stream.addDrmInfo('drm.def');
            stream.mime('video/foo', 'vbar');
          });
        });
      });

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      expect(drmEngine.supportsVariant(variants[0])).toBeTruthy();
    });
  });

  describe('init', () => {
    it('stops on first available key system', async () => {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      setDecodingInfoSpy(['drm.abc', 'drm.def']);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.abc');
    });

    it('tries to get the key systems in the order they appear in', async () => {
      // Fail both key systems.
      setDecodingInfoSpy([]);

      const variants = manifest.variants;
      await expectAsync(drmEngine.initForPlayback(variants,
          manifest.offlineSessionIds)).toBeRejected();

      expect(decodingInfoSpy).toHaveBeenCalledTimes(2);
      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({keySystem: 'drm.abc'}),
      }));

      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({keySystem: 'drm.def'}),
      }));
    });

    it('tries the second key system if the first fails', async () => {
      // Accept drm.def, but not drm.abc.
      setDecodingInfoSpy(['drm.def']);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.def');
    });

    it('chooses systems by configured preferredKeySystems', async () => {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      setDecodingInfoSpy(['drm.abc', 'drm.def']);
      config.preferredKeySystems = ['drm.def'];
      drmEngine.configure(config);
      logErrorSpy.and.stub();

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      // should be only one variant, as preferredKeySystems is propagated
      // to getDecodingInfos
      expect(variants[0].decodingInfos.length).toBe(1);
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.def');
    });

    it('chooses systems with configured license servers', async () => {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      setDecodingInfoSpy(['drm.abc', 'drm.def']);

      // Remove the server URI for drm.abc, which appears first in the manifest.
      delete config.servers['drm.abc'];
      drmEngine.configure(config);
      // Ignore error logs, which we expect to occur due to the missing server.
      logErrorSpy.and.stub();

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      expect(variants[0].decodingInfos.length).toBe(2);
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.def');
    });

    it('overrides manifest with configured license servers', async () => {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      setDecodingInfoSpy(['drm.abc', 'drm.def']);

      // Add manifest-supplied license servers for both.
      tweakDrmInfos((drmInfos) => {
        for (const drmInfo of drmInfos) {
          if (drmInfo.keySystem == 'drm.abc') {
            drmInfo.licenseServerUri = 'http://foo.bar/abc';
          } else if (drmInfo.keySystem == 'drm.def') {
            drmInfo.licenseServerUri = 'http://foo.bar/def';
          }

          // Make sure we didn't somehow choose manifest-supplied values that
          // match the config.  This would invalidate parts of the test.
          const configServer = config.servers[drmInfo.keySystem];
          expect(drmInfo.licenseServerUri).not.toBe(configServer);
        }
      });

      // Remove the server URI for drm.abc from the config, so that only drm.def
      // could be used, in spite of the manifest-supplied license server URI.
      delete config.servers['drm.abc'];
      drmEngine.configure(config);

      // Ignore error logs, which we expect to occur due to the missing server.
      logErrorSpy.and.stub();

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      expect(variants[0].decodingInfos.length).toBe(2);
      const selectedDrmInfo = drmEngine.getDrmInfo();
      expect(selectedDrmInfo).not.toBe(null);
      expect(selectedDrmInfo.keySystem).toBe('drm.def');
      expect(selectedDrmInfo.licenseServerUri).toBe(config.servers['drm.def']);
    });

    it('detects content type capabilities of key system', async () => {
      setDecodingInfoSpy(['drm.abc']);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(drmEngine.willSupport('audio/webm')).toBeTruthy();
      expect(drmEngine.willSupport('video/mp4; codecs="fake"')).toBeTruthy();
      expect(drmEngine.willSupport('video/mp4; codecs="FAKE"')).toBeTruthy();

      // Because DrmEngine will err on being too accepting, make sure it will
      // reject something. However, we can only check that it is actually
      // thing on non-Edge browsers because of https://bit.ly/2IcEgv0
      if (!shaka.util.Platform.isLegacyEdge()) {
        expect(drmEngine.willSupport('this-should-fail')).toBeFalsy();
      }
    });

    it('fails to initialize if no key systems are available', async () => {
      // Accept no key systems.
      setDecodingInfoSpy([]);

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE));
      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejectedWith(expected);

      expect(drmEngine.initialized()).toBe(false);

      expect(variants[0].decodingInfos.length).toBe(2);
    });

    it('does not error for unencrypted assets with no EME', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.mime('video/foo', 'vbar');
          });
          variant.addAudio(2, (stream) => {
            stream.mime('audio/foo', 'abar');
          });
        });
      });

      // Accept no key systems, simulating a lack of EME.
      setDecodingInfoSpy([]);

      const variants = manifest.variants;
      // All that matters here is that we don't throw.
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .not.toBeRejected();
    });

    it('fails to initialize if no key systems are recognized', async () => {
      // Simulate the DASH parser inserting a blank placeholder when only
      // unrecognized custom schemes are found.
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].keySystem = '';
        drmInfos[1].keySystem = '';
      });

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS));
      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejectedWith(expected);

      expect(drmEngine.initialized()).toBe(false);

      expect(variants[0].decodingInfos.length).toBe(1);
      expect(variants[0].decodingInfos[0].keySystemAccess).toBeFalsy();
    });

    it('fails to initialize if the CDM cannot be created', async () => {
      // The query succeeds, but we fail to create the CDM.
      mockMediaKeySystemAccess.createMediaKeys.and.throwError('whoops!');

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_CREATE_CDM,
          'whoops!'));
      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejectedWith(expected);

      expect(drmEngine.initialized()).toBe(false);
      expect(variants[0].decodingInfos.length).toBe(2);
    });

    it('queries audio/video capabilities', async () => {
      setDecodingInfoSpy([]);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      const decodingConfig1 = containing({
        video: containing({
          contentType: 'video/foo; codecs="vbar"',
        }),
        audio: containing({
          contentType: 'audio/foo; codecs="abar"',
        }),
        keySystemConfiguration: containing({
          keySystem: 'drm.abc',
          persistentState: 'optional',
          distinctiveIdentifier: 'optional',
          sessionTypes: ['temporary'],
          initDataType: 'cenc',
        }),
      });

      const decodingConfig2 = containing({
        video: containing({
          contentType: 'video/foo; codecs="vbar"',
        }),
        audio: containing({
          contentType: 'audio/foo; codecs="abar"',
        }),
        keySystemConfiguration: containing({
          keySystem: 'drm.def',
          persistentState: 'optional',
          distinctiveIdentifier: 'optional',
          sessionTypes: ['temporary'],
          initDataType: 'cenc',
        }),
      });
      expect(decodingInfoSpy).toHaveBeenCalledTimes(2);
      expect(decodingInfoSpy).toHaveBeenCalledWith(decodingConfig1);
      expect(decodingInfoSpy).toHaveBeenCalledWith(decodingConfig2);
    });

    it('asks for persistent state and license for offline', async () => {
      setDecodingInfoSpy([]);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForStorage(variants, /* usePersistentLicense= */ true))
          .toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      expect(decodingInfoSpy).toHaveBeenCalledTimes(2);
      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({
          keySystem: 'drm.abc',
          distinctiveIdentifier: 'optional',
          persistentState: 'required',
          sessionTypes: ['persistent-license'],
          initDataType: 'cenc',
        }),
      }),
      );

      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({
          keySystem: 'drm.def',
          distinctiveIdentifier: 'optional',
          persistentState: 'required',
          sessionTypes: ['persistent-license'],
          initDataType: 'cenc',
        }),
      }),
      );
    });

    it('honors distinctive identifier and persistent state', async () => {
      setDecodingInfoSpy([]);
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].distinctiveIdentifierRequired = true;
        drmInfos[1].persistentStateRequired = true;
      });

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      expect(decodingInfoSpy).toHaveBeenCalledTimes(2);
      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({
          keySystem: 'drm.abc',
          distinctiveIdentifier: 'required',
          persistentState: 'optional',
          sessionTypes: ['temporary'],
        }),
      }),
      );

      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({
          keySystem: 'drm.def',
          distinctiveIdentifier: 'optional',
          persistentState: 'required',
          sessionTypes: ['temporary'],
        }),
      }),
      );
    });

    it('makes no queries for key systems with clear content if no key config',
        async () => {
          setDecodingInfoSpy([]);
          manifest.variants[0].video.drmInfos = [];
          manifest.variants[0].audio.drmInfos = [];
          config.servers = {};
          config.advanced = {};

          drmEngine.configure(config);
          const variants = manifest.variants;
          await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

          // Gets decodingInfo for clear content with no keySystemAccess.
          expect(variants[0].decodingInfos.length).toBe(1);
          expect(variants[0].decodingInfos[0].keySystemAccess).toBeFalsy();
          expect(
              shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo())).toBe('');
          expect(drmEngine.initialized()).toBe(true);
        });

    it('makes queries for clear content if key is configured', async () => {
      setDecodingInfoSpy(['drm.abc']);
      manifest.variants[0].video.drmInfos = [];
      manifest.variants[0].audio.drmInfos = [];
      config.servers = {
        'drm.abc': 'http://abc.drm/license',
      };

      drmEngine.configure(config);
      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.abc');
      expect(variants[0].decodingInfos.length).toBe(1);
    });

    it('uses advanced config to fill in DrmInfo', async () => {
      // Leave only one drmInfo
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
          variant.addAudio(2, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
        });
      });

      setDecodingInfoSpy([]);

      config.advanced['drm.abc'] = {
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: null,
        serverCertificateUri: '',
        sessionType: 'persistent-license',
        individualizationServer: '',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
      };
      drmEngine.configure(config);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejected();

      expect(drmEngine.initialized()).toBe(false);
      expect(decodingInfoSpy).toHaveBeenCalledTimes(1);
      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({
          keySystem: 'drm.abc',
          distinctiveIdentifier: 'required',
          persistentState: 'required',
          sessionTypes: ['persistent-license'],
          initDataType: 'cenc',
          audio: containing({
            robustness: 'good',
          }),
          video: containing({
            robustness: 'really_really_ridiculously_good',
          }),
        }),
      }));
    });

    it('prefers advanced config from manifest if present', async () => {
      // Leave only one drmInfo
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
          variant.addAudio(2, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
        });
      });

      setDecodingInfoSpy([]);

      // DrmInfo directly sets advanced settings.
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].distinctiveIdentifierRequired = true;
        drmInfos[0].persistentStateRequired = true;
        drmInfos[0].audioRobustness = 'good';
        drmInfos[0].videoRobustness = 'really_really_ridiculously_good';
      });

      config.advanced['drm.abc'] = {
        audioRobustness: 'bad',
        videoRobustness: 'so_bad_it_hurts',
        serverCertificate: null,
        serverCertificateUri: '',
        sessionType: '',
        individualizationServer: '',
        distinctiveIdentifierRequired: false,
        persistentStateRequired: false,
      };
      drmEngine.configure(config);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      expect(decodingInfoSpy).toHaveBeenCalledTimes(1);
      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({
          keySystem: 'drm.abc',
          audio: containing({
            robustness: 'good',
          }),
          video: containing({
            robustness: 'really_really_ridiculously_good',
          }),
          distinctiveIdentifier: 'required',
          persistentState: 'required',
          initDataType: 'cenc',
        }),
      }));
    });

    it('sets unique initDataTypes if specified from the initData', async () => {
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData = [
          {initDataType: 'very_nice', initData: new Uint8Array(5), keyId: null},
          {initDataType: 'very_nice', initData: new Uint8Array(5), keyId: null},
        ];
      });

      drmEngine.configure(config);

      const variants = manifest.variants;

      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      expect(drmEngine.initialized()).toBe(true);
      expect(decodingInfoSpy).toHaveBeenCalledTimes(2);
      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({
          keySystem: 'drm.abc',
          initDataType: 'very_nice',
        }),
      }),
      );
    });

    it('fails if license server is not configured', async () => {
      setDecodingInfoSpy(['drm.abc']);

      config.servers = {};
      drmEngine.configure(config);

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN,
          'drm.abc'));
      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejectedWith(expected);
    });

    it('uses key system IDs from keySystemsMapping config', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
        });
      });

      setDecodingInfoSpy([]);

      config.keySystemsMapping['drm.abc'] = 'drm.def';
      drmEngine.configure(config);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds))
          .toBeRejected();

      expect(drmEngine.initialized()).toBe(false);
      expect(decodingInfoSpy).toHaveBeenCalledTimes(1);
      expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
        keySystemConfiguration: containing({
          keySystem: 'drm.def',
        }),
      }));
    });

    it('maps TS MIME types through the transmuxer', async () => {
      const originalIsSupported =
          shaka.transmuxer.TransmuxerEngine.isSupported;
      const originalConvertCodecs =
          shaka.transmuxer.TransmuxerEngine.convertCodecs;

      try {
        // Mock out isSupported on Transmuxer so that we don't have to care
        // about what MediaSource supports under that.  All we really care about
        // is the translation of MIME types.
        shaka.transmuxer.TransmuxerEngine.isSupported =
            (mimeType, contentType) => {
              return mimeType.startsWith('video/mp2t');
            };
        shaka.transmuxer.TransmuxerEngine.convertCodecs =
            (contentType, mimeType) => {
              let newMimeType = mimeType.replace('mp2t', 'mp4');
              if (contentType == 'audio') {
                newMimeType = newMimeType.replace('video', 'audio');
              }
              return newMimeType;
            };

        // The default mock for this is so unrealistic, some of our test
        // conditions would always fail.  Make it realistic enough for this
        // test case by returning the same types we are supposed to be querying
        // for.  That way, supportsVariant() should work produce the correct
        // result after translating the types of the variant's streams.
        mockMediaKeySystemAccess.getConfiguration.and.callFake(() => {
          return {
            audioCapabilities: [{contentType: 'audio/mp4; codecs="abar"'}],
            videoCapabilities: [{contentType: 'video/mp4; codecs="vbar"'}],
          };
        });

        setDecodingInfoSpy(['drm.abc']);

        const variants = manifest.variants;
        variants[0].video.mimeType = 'video/mp2t';
        variants[0].audio.mimeType = 'video/mp2t';

        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        expect(drmEngine.initialized()).toBe(true);

        const decodingConfig = containing({
          video: containing({
            contentType: 'video/mp4; codecs="vbar"',
          }),
          audio: containing({
            contentType: 'audio/mp4; codecs="abar"',
          }),
        });
        expect(decodingInfoSpy).toHaveBeenCalledTimes(2);
        expect(decodingInfoSpy).toHaveBeenCalledWith(decodingConfig);

        expect(drmEngine.supportsVariant(variants[0])).toBeTruthy();
      } finally {
        // Restore the mock.
        shaka.transmuxer.TransmuxerEngine.isSupported = originalIsSupported;
        shaka.transmuxer.TransmuxerEngine.convertCodecs =
            originalConvertCodecs;
      }
    });
  });  // describe('init')

  describe('attach', () => {
    beforeEach(() => {
      // Both audio and video with the same key system:
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
          variant.addAudio(2, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
        });
      });
    });

    it('does nothing for unencrypted content', async () => {
      setDecodingInfoSpy([]);
      manifest.variants[0].video.drmInfos = [];
      manifest.variants[0].audio.drmInfos = [];
      config.servers = {};
      config.advanced = {};

      await initAndAttach();
      expect(mockVideo.setMediaKeys).not.toHaveBeenCalled();
    });

    it('sets server certificate if present in config', async () => {
      const cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      config.advanced['drm.abc'].serverCertificateUri =
          'https://drm-service.com/certificate';
      drmEngine.configure(config);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      expect(fakeNetEngine.request).not.toHaveBeenCalled();
      // Should be set merely after init, without waiting for attach.
      expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(cert);
    });

    it('fetches and sets server certificate from uri', async () => {
      const cert = new Uint8Array(0);
      const serverCertificateUri = 'https://drm-service.com/certificate';
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      config.advanced['drm.abc'].serverCertificateUri = serverCertificateUri;

      fakeNetEngine.setResponseValue(
          serverCertificateUri,
          shaka.util.BufferUtils.toArrayBuffer(new Uint8Array(1)));

      drmEngine.configure(config);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      fakeNetEngine.expectRequest(
          serverCertificateUri,
          shaka.net.NetworkingEngine.RequestType.SERVER_CERTIFICATE);

      // Should be set merely after init, without waiting for attach.
      expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(
          new Uint8Array(1));
    });

    it('fetches server certificate from uri and triggers error', async () => {
      const cert = new Uint8Array(0);
      const serverCertificateUri = 'https://drm-service.com/certificate';
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      config.advanced['drm.abc'].serverCertificateUri = serverCertificateUri;

      // Simulate a permission error from the web server.
      const netError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS,
          serverCertificateUri, 403);
      const operation = shaka.util.AbortableOperation.failed(netError);
      fakeNetEngine.request.and.returnValue(operation);

      drmEngine.configure(config);

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.SERVER_CERTIFICATE_REQUEST_FAILED,
          netError));

      await expectAsync(initAndAttach()).toBeRejectedWith(expected);

      fakeNetEngine.expectRequest(
          serverCertificateUri,
          shaka.net.NetworkingEngine.RequestType.SERVER_CERTIFICATE);

      // Should be set merely after init, without waiting for attach.
      expect(mockMediaKeys.setServerCertificate).not.toHaveBeenCalled();
    });

    it('prefers server certificate from DrmInfo', async () => {
      const cert1 = new Uint8Array(5);
      const cert2 = new Uint8Array(1);
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].serverCertificate = cert1;
      });

      config.advanced['drm.abc'] = createAdvancedConfig(cert2);
      drmEngine.configure(config);

      await initAndAttach();
      expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(cert1);
    });

    it('does not set server certificate if absent', async () => {
      await initAndAttach();
      expect(mockMediaKeys.setServerCertificate).not.toHaveBeenCalled();
    });

    it('creates sessions for init data overrides', async () => {
      // Set up init data overrides in the manifest:
      /** @type {!Uint8Array} */
      const initData1 = new Uint8Array(5);
      /** @type {!Uint8Array} */
      const initData2 = new Uint8Array(1);
      /** @type {!Uint8Array} */
      const initData3 = new Uint8Array(10);

      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData = [
          {initData: initData1, initDataType: 'cenc', keyId: null},
          {initData: initData2, initDataType: 'webm', keyId: null},
          {initData: initData3, initDataType: 'cenc', keyId: null},
        ];
      });

      await initAndAttach();
      expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(3);
      expect(session1.generateRequest)
          .toHaveBeenCalledWith('cenc', initData1);
      expect(session2.generateRequest)
          .toHaveBeenCalledWith('webm', initData2);
      expect(session3.generateRequest)
          .toHaveBeenCalledWith('cenc', initData3);
    });

    it('ignores duplicate init data overrides', async () => {
      // Set up init data overrides in the manifest;
      // The second initData has a different keyId from the first,
      // but the same initData.
      // The third initData has a different initData from the first,
      // but the same keyId.
      // Both should be discarded as duplicates.
      /** @type {!Uint8Array} */
      const initData1 = new Uint8Array(1);
      const initData2 = new Uint8Array(1);
      const initData3 = new Uint8Array(10);

      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData = [
          {initData: initData1, initDataType: 'cenc', keyId: 'abc'},
          {initData: initData2, initDataType: 'cenc', keyId: 'def'},
          {initData: initData3, initDataType: 'cenc', keyId: 'abc'},
        ];
      });

      await initAndAttach();
      expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
      expect(session1.generateRequest)
          .toHaveBeenCalledWith('cenc', initData1);
    });

    // https://github.com/shaka-project/shaka-player/issues/2754
    it('ignores duplicate init data from newInitData', async () => {
      /** @type {!Uint8Array} */
      const initData = new Uint8Array(1);

      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData =
            [{initData: initData, initDataType: 'cenc', keyId: 'abc'}];
      });

      await drmEngine.initForPlayback(
          manifest.variants, manifest.offlineSessionIds);
      drmEngine.newInitData('cenc', initData);
      await drmEngine.attach(mockVideo);

      expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
      expect(session1.generateRequest).toHaveBeenCalledWith('cenc', initData);
    });

    it('uses clearKeys config to override DrmInfo', async () => {
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].keySystem = 'com.fake.NOT.clearkey';
      });

      setDecodingInfoSpy(['org.w3.clearkey']);

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033',
      };
      drmEngine.configure(config);

      const session = createMockSession();
      mockMediaKeys.createSession.and.callFake(() => {
        expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
        return session;
      });

      await initAndAttach();
      const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

      tweakDrmInfos((drmInfos) => {
        expect(drmInfos.length).toBe(1);
        expect(drmInfos[0].keySystem).toBe('org.w3.clearkey');
      });

      expect(session.generateRequest)
          .toHaveBeenCalledWith('keyids', jasmine.any(Uint8Array));

      const initData = /** @type {{kids: !Array.<string>}} */(JSON.parse(
          shaka.util.StringUtils.fromUTF8(
              session.generateRequest.calls.argsFor(0)[1])));
      const keyId1 = Uint8ArrayUtils.toHex(
          Uint8ArrayUtils.fromBase64(initData.kids[0]));
      const keyId2 = Uint8ArrayUtils.toHex(
          Uint8ArrayUtils.fromBase64(initData.kids[1]));
      expect(keyId1).toBe('deadbeefdeadbeefdeadbeefdeadbeef');
      expect(keyId2).toBe('02030507011013017019023029031037');
    });

    // Regression test for #2139, in which we suppressed errors if drmInfos was
    // empty and clearKeys config was given
    it('fails if clearKeys config fails', async () => {
      manifest.variants[0].video.drmInfos = [];
      manifest.variants[0].audio.drmInfos = [];

      // Make it so that clear key setup fails by pretending we don't have it.
      // In reality, it was failing because of missing codec info, but any
      // failure should do for testing purposes.
      setDecodingInfoSpy([]);

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033',
      };
      drmEngine.configure(config);

      const variants = manifest.variants;

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE));
      await expectAsync(drmEngine.initForPlayback(variants, []))
          .toBeRejectedWith(expected);
    });

    it('fails with an error if setMediaKeys fails', async () => {
      // Fail setMediaKeys.
      mockVideo.setMediaKeys.and.returnValue(Promise.reject(
          new Error('whoops!')));

      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData = [
          {initData: new Uint8Array(1), initDataType: 'cenc', keyId: null},
        ];
      });

      onErrorSpy.and.stub();

      await initAndAttach();

      expect(onErrorSpy).toHaveBeenCalled();
      const error = onErrorSpy.calls.argsFor(0)[0];
      shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
          'whoops!'));
    });

    it('fails with an error if setServerCertificate fails', async () => {
      const cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      // Fail setServerCertificate.
      mockMediaKeys.setServerCertificate.and.returnValue(Promise.reject(
          new Error('whoops!')));

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
          'whoops!'));
      await expectAsync(initAndAttach()).toBeRejectedWith(expected);
    });

    it('dispatches an error if generateRequest fails', async () => {
      // Set up an init data override in the manifest to get an immediate call
      // to generateRequest:
      const initData1 = new Uint8Array(5);

      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData = [
          {initData: initData1, initDataType: 'cenc', keyId: null},
        ];
      });

      // Fail generateRequest.
      const session1 = createMockSession();
      const message = 'whoops!';
      const nativeError = new Error(message);
      session1.generateRequest.and.returnValue(Promise.reject(nativeError));
      mockMediaKeys.createSession.and.returnValue(session1);

      onErrorSpy.and.stub();
      await initAndAttach();
      expect(onErrorSpy).toHaveBeenCalled();
      const error = onErrorSpy.calls.argsFor(0)[0];
      shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_GENERATE_LICENSE_REQUEST,
          message, nativeError, undefined));
    });

    it('should throw a OFFLINE_SESSION_REMOVED error', async () => {
      // Given persistent session is not available
      session1.load.and.returnValue(false);

      onErrorSpy.and.stub();

      await drmEngine.initForPlayback(
          manifest.variants, ['persistent-session-id']);
      await drmEngine.attach(mockVideo);

      expect(drmEngine.initialized()).toBe(true);

      await Util.shortDelay();

      expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
      expect(mockMediaKeys.createSession)
          .toHaveBeenCalledWith('persistent-license');
      expect(session1.load).toHaveBeenCalledWith('persistent-session-id');

      expect(onErrorSpy).toHaveBeenCalled();
      const error = onErrorSpy.calls.argsFor(0)[0];
      shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.OFFLINE_SESSION_REMOVED));
    });

    it('uses persistent session ids when available', async () => {
      const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

      const keyId1 = makeKeyId(1);
      const keyId2 = makeKeyId(2);

      /** @type {!Uint8Array} */
      const initData1 = new Uint8Array(5);

      // Key IDs in manifest
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].keyIds = new Set([
          Uint8ArrayUtils.toHex(keyId1), Uint8ArrayUtils.toHex(keyId2),
        ]);
        drmInfos[0].initData = [
          {initData: initData1, initDataType: 'cenc', keyId: null},
        ];
      });

      // Given persistent session is available
      session1.load.and.returnValue(true);

      config.persistentSessionOnlinePlayback = true;
      config.persistentSessionsMetadata = [{
        sessionId: 'persistent-session-id',
        initData: initData1,
        initDataType: 'cenc'}];

      drmEngine.configure(config);

      await initAndAttach();

      await Util.shortDelay();

      session1.keyStatuses.forEach.and.callFake((callback) => {
        callback(keyId1, 'usable');
        callback(keyId2, 'usable');
      });

      session1.on['keystatuseschange']({target: session1});

      expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
      expect(mockMediaKeys.createSession)
          .toHaveBeenCalledWith('persistent-license');
      expect(session1.load).toHaveBeenCalledWith('persistent-session-id');

      expect(session2.generateRequest).not.toHaveBeenCalled();
    });

    it(
        'tries persistent session ids before requesting a license',
        async () => {
          const Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

          const keyId1 = makeKeyId(1);

          /** @type {!Uint8Array} */
          const initData1 = new Uint8Array(5);

          // Key IDs in manifest
          tweakDrmInfos((drmInfos) => {
            drmInfos[0].keyIds = new Set([
              Uint8ArrayUtils.toHex(keyId1),
            ]);
            drmInfos[0].sessionType = 'temporary';
            drmInfos[0].initData = [
              {initData: initData1, initDataType: 'cenc', keyId: null},
            ];
          });

          // Given persistent sessions aren't available
          session1.load.and.returnValue(Promise.resolve(false));
          session2.load.and.returnValue(
              Promise.reject(new Error('This should be a recoverable error')));

          manifest.offlineSessionIds = ['persistent-session-id-1'];

          config.persistentSessionsMetadata = [{
            sessionId: 'persistent-session-id-2',
            initData: initData1,
            initDataType: 'cenc'}];
          config.persistentSessionOnlinePlayback = true;

          drmEngine.configure(config);

          onErrorSpy.and.stub();

          await initAndAttach();

          await Util.shortDelay();

          shaka.test.Util.expectToEqualError(
              onErrorSpy.calls.argsFor(0)[0],
              new shaka.util.Error(
                  shaka.util.Error.Severity.RECOVERABLE,
                  shaka.util.Error.Category.DRM,
                  shaka.util.Error.Code.OFFLINE_SESSION_REMOVED));

          shaka.test.Util.expectToEqualError(
              onErrorSpy.calls.argsFor(1)[0],
              new shaka.util.Error(
                  shaka.util.Error.Severity.RECOVERABLE,
                  shaka.util.Error.Category.DRM,
                  shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
                  'This should be a recoverable error'));

          // We need to go through the whole license request / update,
          // otherwise the DrmEngine will be destroyed while waiting for
          // sessions to be marked as loaded, throwing an unhandled exception
          const operation = shaka.util.AbortableOperation.completed(
              new Uint8Array(0));
          fakeNetEngine.request.and.returnValue(operation);

          await Util.shortDelay();

          session3.on['message']({
            target: session3,
            message: new Uint8Array(0),
            messageType: 'license-request'});

          session3.keyStatuses.forEach.and.callFake((callback) => {
            callback(keyId1, 'usable');
          });

          session3.on['keystatuseschange']({target: session3});

          await Util.shortDelay();

          expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(3);
          expect(mockMediaKeys.createSession)
              .toHaveBeenCalledWith('persistent-license');
          expect(session1.load)
              .toHaveBeenCalledWith('persistent-session-id-1');

          expect(mockMediaKeys.createSession)
              .toHaveBeenCalledWith('persistent-license');
          expect(session2.load)
              .toHaveBeenCalledWith('persistent-session-id-2');

          expect(mockMediaKeys.createSession)
              .toHaveBeenCalledWith('temporary');
          expect(session3.generateRequest)
              .toHaveBeenCalledWith('cenc', initData1);
        });
  });  // describe('attach')

  describe('events', () => {
    describe('encrypted', () => {
      it('is listened for', async () => {
        await initAndAttach();
        expect(mockVideo.addEventListener).toHaveBeenCalledWith(
            'encrypted', jasmine.any(Function), jasmine.anything());
      });

      it('is not listened for if parseInbandPsshEnabled is true', async () => {
        config.parseInbandPsshEnabled = true;
        drmEngine.configure(config);
        await initAndAttach();
        expect(mockVideo.addEventListener).not.toHaveBeenCalledWith(
            'encrypted', jasmine.any(Function), jasmine.anything());
      });

      it('triggers the creation of a session', async () => {
        await initAndAttach();
        const initData1 = new Uint8Array(1);
        const initData2 = new Uint8Array(2);

        await sendEncryptedEvent('webm', initData1);
        await sendEncryptedEvent('cenc', initData2);

        expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(2);
        expect(session1.generateRequest)
            .toHaveBeenCalledWith('webm', initData1);
        expect(session2.generateRequest)
            .toHaveBeenCalledWith('cenc', initData2);
      });

      it('suppresses duplicate initDatas', async () => {
        await initAndAttach();

        const initData1 = new Uint8Array(1);

        await sendEncryptedEvent('webm', initData1);
        await sendEncryptedEvent('cenc'); // identical to webm initData

        expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
        expect(session1.generateRequest)
            .toHaveBeenCalledWith('webm', initData1);
      });

      it('set media keys when not already done at startup', async () => {
        await initAndAttach();
        await sendEncryptedEvent();

        expect(mockVideo.setMediaKeys).toHaveBeenCalledTimes(1);
        expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
      });

      it('dispatches an error if createSession fails', async () => {
        mockMediaKeys.createSession.and.throwError('whoops!');
        onErrorSpy.and.stub();

        await initAndAttach();
        await sendEncryptedEvent();

        expect(onErrorSpy).toHaveBeenCalled();
        const error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
            'whoops!'));
      });

      it('dispatches an error if manifest says unencrypted', async () => {
        manifest.variants[0].video.drmInfos = [];
        manifest.variants[0].audio.drmInfos = [];
        config.servers = {};
        config.advanced = {};

        onErrorSpy.and.stub();

        await initAndAttach();
        await sendEncryptedEvent();

        expect(onErrorSpy).toHaveBeenCalled();
        const error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
      });
    });  // describe('encrypted')

    describe('message', () => {
      it('is listened for', async () => {
        await initAndAttach();
        await sendEncryptedEvent();

        expect(session1.addEventListener).toHaveBeenCalledWith(
            'message', jasmine.any(Function), jasmine.anything());
      });

      it('triggers a license request', async () => {
        await sendMessageTest('http://abc.drm/license');
      });

      it('prefers a license server URI from configuration', async () => {
        tweakDrmInfos((drmInfos) => {
          drmInfos[0].licenseServerUri = 'http://foo.bar/drm';
        });
        await sendMessageTest('http://abc.drm/license');
      });

      it('handles "individualization-request" messages special', async () => {
        config.advanced['drm.abc'] = createAdvancedConfig(null);
        config.advanced['drm.abc'].individualizationServer =
            'http://foo.bar/drm';
        expect(config.servers['drm.abc']).not.toBe('http://foo.bar/drm');

        await sendMessageTest(
            'http://foo.bar/drm', 'individualization-request');
      });

      it('uses license server for "individualization-request" by default',
          async () => {
            config.advanced['drm.abc'] = createAdvancedConfig(null);
            config.advanced['drm.abc'].individualizationServer = '';

            await sendMessageTest(
                'http://abc.drm/license', 'individualization-request');
          });

      it('dispatches an error if license request fails', async () => {
        onErrorSpy.and.stub();

        await initAndAttach();
        await sendEncryptedEvent();

        // Simulate a permission error from the web server.
        const netError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.BAD_HTTP_STATUS,
            'http://abc.drm/license', 403);
        const operation = shaka.util.AbortableOperation.failed(netError);
        fakeNetEngine.request.and.returnValue(operation);

        const message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});
        await shaka.test.Util.shortDelay();

        expect(onErrorSpy).toHaveBeenCalled();
        const error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
            jasmine.objectContaining({
              category: shaka.util.Error.Category.NETWORK,
              code: shaka.util.Error.Code.BAD_HTTP_STATUS,
              data: ['http://abc.drm/license', 403],
            })));
      });

      /**
       * @param {string=} expectedUrl
       * @param {string=} messageType
       * @return {!Promise}
       */
      async function sendMessageTest(
          expectedUrl, messageType = 'license-request') {
        await initAndAttach();
        await sendEncryptedEvent();

        const operation = shaka.util.AbortableOperation.completed({});
        fakeNetEngine.request.and.returnValue(operation);
        const message = new Uint8Array(0);
        session1.on['message'](
            {target: session1, message: message, messageType: messageType});

        expect(fakeNetEngine.request).toHaveBeenCalledWith(
            shaka.net.NetworkingEngine.RequestType.LICENSE,
            jasmine.objectContaining({
              uris: [expectedUrl],
              method: 'POST',
              body: message,
              licenseRequestType: messageType,
            }));
      }
    });  // describe('message')

    describe('keystatuseschange', () => {
      it('is listened for', async () => {
        await initAndAttach();
        await sendEncryptedEvent();

        expect(session1.addEventListener).toHaveBeenCalledWith(
            'keystatuseschange', jasmine.any(Function), jasmine.anything());
      });

      it('triggers callback', async () => {
        await initAndAttach();
        await sendEncryptedEvent();

        const keyId1 = makeKeyId(1);
        const keyId2 = makeKeyId(2);
        const status1 = 'usable';
        const status2 = 'expired';
        session1.keyStatuses.forEach.and.callFake((callback) => {
          callback(keyId1, status1);
          callback(keyId2, status2);
        });

        onKeyStatusSpy.and.callFake((statusMap) => {
          expect(statusMap).toEqual({
            '01': status1,
            '02': status2,
          });
        });

        session1.on['keystatuseschange']({target: session1});
        await Util.shortDelay();
        expect(onKeyStatusSpy).toHaveBeenCalled();
      });

      // See https://github.com/shaka-project/shaka-player/issues/1541
      it('does not update public key statuses before callback', async () => {
        await initAndAttach();
        await sendEncryptedEvent();

        const keyId1 = makeKeyId(1);
        const keyId2 = makeKeyId(2);
        const status1 = 'usable';
        const status2 = 'expired';
        session1.keyStatuses.forEach.and.callFake((callback) => {
          callback(keyId1, status1);
          callback(keyId2, status2);
        });

        session1.on['keystatuseschange']({target: session1});

        // The callback waits for some time to pass, to batch up status changes.
        expect(onKeyStatusSpy).not.toHaveBeenCalled();

        // The publicly-accessible key statuses should not show these new
        // changes yet.  This shows that we have solved the race between the
        // callback and any polling done by any other component.
        let keyIds = Object.keys(drmEngine.getKeyStatuses());
        expect(keyIds.length).toBe(0);

        // Wait for the callback to occur, then end the test.
        await new Promise((resolve) => {
          onKeyStatusSpy.and.callFake(resolve);
        });

        // Now key statuses are available.
        keyIds = Object.keys(drmEngine.getKeyStatuses());
        expect(keyIds.length).toBe(2);
      });

      // See https://github.com/shaka-project/shaka-player/issues/1541
      it('does not invoke callback until all sessions are loaded', async () => {
        // Set up init data overrides in the manifest so that we get multiple
        // sessions.
        const initData1 = new Uint8Array(10);
        const initData2 = new Uint8Array(11);

        tweakDrmInfos((drmInfos) => {
          drmInfos[0].initData = [
            {initData: initData1, initDataType: 'cenc', keyId: null},
            {initData: initData2, initDataType: 'cenc', keyId: null},
          ];
        });

        const keyId1 = makeKeyId(1);
        const keyId2 = makeKeyId(2);
        session1.keyStatuses.forEach.and.callFake((callback) => {
          callback(keyId1, 'usable');
        });
        session2.keyStatuses.forEach.and.callFake((callback) => {
          callback(keyId2, 'usable');
        });

        await initAndAttach();

        // The callback waits for some time to pass, to batch up status changes.
        // But even after some time has passed, we should not have invoked the
        // callback, because we don't have a status for session2 yet.
        session1.on['keystatuseschange']({target: session1});
        await shaka.test.Util.shortDelay();
        expect(onKeyStatusSpy).not.toHaveBeenCalled();

        // After both sessions have been loaded, we will finally invoke the
        // callback.
        session2.on['keystatuseschange']({target: session2});
        await shaka.test.Util.shortDelay();
        expect(onKeyStatusSpy).toHaveBeenCalled();
      });

      it('causes an EXPIRED error when all keys expire', async () => {
        onErrorSpy.and.stub();

        await initAndAttach();
        expect(onErrorSpy).not.toHaveBeenCalled();

        await sendEncryptedEvent();

        const keyId1 = makeKeyId(1);
        const keyId2 = makeKeyId(2);

        // Expire one key.
        session1.keyStatuses.forEach.and.callFake((callback) => {
          callback(keyId1, 'usable');
          callback(keyId2, 'expired');
        });

        await new Promise((resolve) => {
          onKeyStatusSpy.and.callFake(resolve);
          session1.on['keystatuseschange']({target: session1});
        });

        // One key is still usable.
        expect(onErrorSpy).not.toHaveBeenCalled();

        // Expire both keys.
        session1.keyStatuses.forEach.and.callFake((callback) => {
          callback(keyId1, 'expired');
          callback(keyId2, 'expired');
        });

        await new Promise((resolve) => {
          onKeyStatusSpy.and.callFake(resolve);
          session1.on['keystatuseschange']({target: session1});
        });

        // Both keys are expired, so we should have an error.
        expect(onErrorSpy).toHaveBeenCalled();
        // There should be exactly one error.
        expect(onErrorSpy).toHaveBeenCalledTimes(1);
        const error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.EXPIRED));
      });

      it('causes only one error when two keys expire at once', async () => {
        onErrorSpy.and.stub();

        await initAndAttach();
        expect(onErrorSpy).not.toHaveBeenCalled();

        await sendEncryptedEvent();

        const keyId1 = makeKeyId(1);
        const keyId2 = makeKeyId(2);

        // Expire both keys at once.
        session1.keyStatuses.forEach.and.callFake((callback) => {
          callback(keyId1, 'expired');
          callback(keyId2, 'expired');
        });

        await new Promise((resolve) => {
          onKeyStatusSpy.and.callFake(resolve);

          // Fire change events for both keys.
          session1.on['keystatuseschange']({target: session1});
          session1.on['keystatuseschange']({target: session1});
        });

        // Both keys are expired, so we should have an error.
        expect(onErrorSpy).toHaveBeenCalled();
        // There should be exactly one error.
        expect(onErrorSpy).toHaveBeenCalledTimes(1);
        const error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.EXPIRED));

        // Ignore the next key status event, sleep for one second, then
        // check to see if another error fired.
        onKeyStatusSpy.and.stub();
        await shaka.test.Util.shortDelay();
        // Still only one error.
        expect(onErrorSpy).toHaveBeenCalledTimes(1);
      });
    });  // describe('keystatuseschange')
  });  // describe('events')

  describe('update', () => {
    it('receives a license', async () => {
      const license = new Uint8Array(0);

      await initAndAttach();
      await sendEncryptedEvent();

      fakeNetEngine.setResponseValue('http://abc.drm/license', license);
      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.shortDelay();
      expect(session1.update).toHaveBeenCalledWith(license);
    });

    it('uses clearKeys config to override DrmInfo', async () => {
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].keySystem = 'com.fake.NOT.clearkey';
      });
      setDecodingInfoSpy(['org.w3.clearkey']);

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033',
      };
      drmEngine.configure(config);

      // Not mocked.  Run data through real data URI parser to ensure that it is
      // correctly formatted.
      fakeNetEngine.request.and.callFake((type, request, context) => {
        const requestType = shaka.net.NetworkingEngine.RequestType.LICENSE;

        // A dummy progress callback.
        const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};

        return shaka.net.DataUriPlugin.parse(
            request.uris[0], request, requestType, progressUpdated);
      });

      await initAndAttach();
      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.shortDelay();
      expect(session1.update).toHaveBeenCalledTimes(1);
      const licenseBuffer = session1.update.calls.argsFor(0)[0];
      const licenseJson =
          shaka.util.StringUtils.fromBytesAutoDetect(licenseBuffer);
      const license = JSON.parse(licenseJson);
      expect(license).toEqual({
        keys: [
          {kid: '3q2-796tvu_erb7v3q2-7w',
            k: 'GGdTCRhnUwkYZ1MJGGdTCQ', kty: 'oct'},
          {kid: 'AgMFBwEQEwFwGQIwKQMQNw',
            k: 'AwUHATAjAyBCAQgEJQmAMw', kty: 'oct'},
        ],
      });
    });

    it('publishes an event if update succeeds', async () => {
      await initAndAttach();
      await sendEncryptedEvent();

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.shortDelay();
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({type: 'drmsessionupdate'}));
    });

    it('dispatches an error if update fails', async () => {
      onErrorSpy.and.stub();

      const license = new Uint8Array(0);

      await initAndAttach();
      await sendEncryptedEvent();

      fakeNetEngine.setResponseValue('http://abc.drm/license', license);
      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.throwError('whoops!');

      await shaka.test.Util.shortDelay();
      expect(onErrorSpy).toHaveBeenCalled();
      const error = onErrorSpy.calls.argsFor(0)[0];
      shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
          'whoops!'));
    });
  });  // describe('update')

  describe('destroy', () => {
    it('tears down MediaKeys and active sessions', async () => {
      await initAndAttach();

      await sendEncryptedEvent('webm');
      await sendEncryptedEvent('cenc', new Uint8Array(2));

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.shortDelay();
      mockVideo.setMediaKeys.calls.reset();
      await drmEngine.destroy();
      expect(session1.close).toHaveBeenCalled();
      expect(session1.remove).not.toHaveBeenCalled();
      expect(session2.close).toHaveBeenCalled();
      expect(session2.remove).not.toHaveBeenCalled();
      expect(mockVideo.setMediaKeys).toHaveBeenCalledWith(null);
    });

    it('tears down & removes active persistent sessions', async () => {
      config.advanced['drm.abc'] = createAdvancedConfig(null);
      config.advanced['drm.abc'].sessionType = 'persistent-license';

      drmEngine.configure(config);

      await initAndAttach();
      await sendEncryptedEvent('webm');
      await sendEncryptedEvent('cenc', new Uint8Array(2));

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.shortDelay();
      mockVideo.setMediaKeys.calls.reset();
      await drmEngine.destroy();

      expect(session1.close).not.toHaveBeenCalled();
      expect(session1.remove).toHaveBeenCalled();

      expect(session2.close).not.toHaveBeenCalled();
      expect(session2.remove).toHaveBeenCalled();
    });

    it(
        // eslint-disable-next-line max-len
        'tears down & does not remove active persistent sessions based on configuration flag',
        async () => {
          config.advanced['drm.abc'] = createAdvancedConfig(null);
          config.advanced['drm.abc'].sessionType = 'persistent-license';
          config.persistentSessionOnlinePlayback = true;

          drmEngine.configure(config);

          await initAndAttach();
          await sendEncryptedEvent('cenc', new Uint8Array(2));

          const message = new Uint8Array(0);
          session1.on['message']({target: session1, message: message});
          session1.update.and.returnValue(Promise.resolve());

          await shaka.test.Util.shortDelay();
          mockVideo.setMediaKeys.calls.reset();
          await drmEngine.destroy();

          expect(session1.close).toHaveBeenCalled();
          expect(session1.remove).not.toHaveBeenCalled();
        });

    it('swallows errors when closing sessions', async () => {
      await initAndAttach();
      await sendEncryptedEvent('webm');
      await sendEncryptedEvent('cenc', new Uint8Array(2));

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.shortDelay();
      session1.close.and.returnValue(Promise.reject(new Error('')));
      session2.close.and.returnValue(Promise.reject(new Error('')));
      await drmEngine.destroy();
    });

    it('swallows errors when clearing MediaKeys', async () => {
      await initAndAttach();
      await sendEncryptedEvent('webm');
      await sendEncryptedEvent('cenc', new Uint8Array(2));

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.shortDelay();
      mockVideo.setMediaKeys.and.returnValue(Promise.reject(new Error('')));
      await drmEngine.destroy();
    });

    it('interrupts failing MediaKeys queries', async () => {
      // Hold the MediaKeys query.
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      decodingInfoSpy.and.returnValue(p);

      const variants = manifest.variants;
      const init = drmEngine.initForPlayback(
          variants, manifest.offlineSessionIds);

      // This flow should still return "success" when DrmEngine is destroyed.
      await shaka.test.Util.shortDelay();

      expect(variants[0].decodingInfos.length).toBe(0);
      await drmEngine.destroy();
      p.reject(new Error(''));  // Fail drm.abc.
      await expectAsync(init).toBeRejected();
      expect(drmEngine.initialized()).toBe(false);
    });

    it('interrupts successful MediaKeys queries', async () => {
      // Hold the MediaKeys query:
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      decodingInfoSpy.and.returnValue(p);

      const variants = manifest.variants;
      const init = drmEngine.initForPlayback(
          variants, manifest.offlineSessionIds);

      await shaka.test.Util.shortDelay();
      expect(variants[0].decodingInfos.length).toBe(0);
      await drmEngine.destroy();
      p.resolve();  // Success for drm.abc.
      await expectAsync(init).toBeRejected();
      // Due to the interruption, we never created MediaKeys.
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo())).toBe('');
      expect(drmEngine.initialized()).toBe(false);
    });

    it('interrupts successful calls to createMediaKeys', async () => {
      // Hold createMediaKeys:
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      mockMediaKeySystemAccess.createMediaKeys.and.returnValue(p);

      const variants = manifest.variants;
      const init = drmEngine.initForPlayback(
          variants, manifest.offlineSessionIds);

      await shaka.test.Util.shortDelay();
      // We are blocked on createMediaKeys:
      expect(mockMediaKeySystemAccess.createMediaKeys).toHaveBeenCalled();
      await drmEngine.destroy();
      p.resolve();  // Success for createMediaKeys().
      await expectAsync(init).toBeRejected();
      // Due to the interruption, we never finished initialization.
      expect(drmEngine.initialized()).toBe(false);
    });

    it('interrupts failed calls to setMediaKeys', async () => {
      // Hold setMediaKeys:
      /** @type {!shaka.util.PublicPromise} */
      const p1 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p1);

      onErrorSpy.and.stub();

      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData = [
          {initData: new Uint8Array(1), initDataType: 'cenc', keyId: null},
        ];
      });

      const init = expectAsync(initAndAttach()).toBeRejected();

      await shaka.test.Util.shortDelay();
      // We are now blocked on setMediaKeys:
      expect(mockVideo.setMediaKeys).toHaveBeenCalledTimes(1);
      // DrmEngine.destroy also calls setMediaKeys.
      /** @type {!shaka.util.PublicPromise} */
      const p2 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p2);

      const destroy = drmEngine.destroy();
      const fail = async () => {
        await shaka.test.Util.shortDelay();
        shaka.log.warning('fail');
        p1.reject(new Error('titi'));
      };
      const success = async () => {
        await shaka.test.Util.shortDelay();
        shaka.log.warning('success');
        p2.resolve();
      };
      await Promise.all([init, destroy, fail(), success()]);
    });

    it('interrupts successful calls to setMediaKeys', async () => {
      // Hold setMediaKeys:
      /** @type {!shaka.util.PublicPromise} */
      const p1 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p1);

      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData = [
          {initData: new Uint8Array(1), initDataType: 'cenc', keyId: null},
        ];
      });

      const init = expectAsync(initAndAttach()).toBeRejected();

      await shaka.test.Util.shortDelay();
      // We are now blocked on setMediaKeys:
      expect(mockVideo.setMediaKeys).toHaveBeenCalledTimes(1);
      // DrmEngine.destroy also calls setMediaKeys.
      /** @type {!shaka.util.PublicPromise} */
      const p2 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p2);

      const destroy = drmEngine.destroy();
      const resolve1 = async () => {
        await shaka.test.Util.shortDelay();
        p1.resolve();
      };
      const resolve2 = async () => {
        await shaka.test.Util.shortDelay();
        p2.resolve();
      };
      await Promise.all([init, destroy, resolve1(), resolve2()]);

      // Due to the interruption, we never listened for 'encrypted' events.
      expect(mockVideo.on['encrypted']).toBe(undefined);
    });

    it('interrupts failed calls to setServerCertificate', async () => {
      const cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      // Hold setServerCertificate:
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      mockMediaKeys.setServerCertificate.and.returnValue(p);

      const init = initAndAttach();

      await shaka.test.Util.shortDelay();
      // We are now blocked on setServerCertificate:
      expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledTimes(1);
      await drmEngine.destroy();

      p.reject(new Error(''));  // Fail setServerCertificate.
      await expectAsync(init).toBeRejected();
    });

    it('interrupts successful calls to setServerCertificate', async () => {
      const cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      // Hold setServerCertificate:
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      mockMediaKeys.setServerCertificate.and.returnValue(p);

      // This chain should still return "success" when DrmEngine is destroyed.
      const init = initAndAttach();

      await shaka.test.Util.shortDelay();
      // We are now blocked on setServerCertificate:
      expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledTimes(1);
      await drmEngine.destroy();

      p.resolve();  // Success for setServerCertificate.
      await expectAsync(init).toBeRejected();

      // Due to the interruption, we never listened for 'encrypted' events.
      expect(mockVideo.on['encrypted']).toBe(undefined);
    });

    it('does not trigger errors if it fails generateRequest', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      session1.generateRequest.and.returnValue(p);

      await initAndAttach();
      await sendEncryptedEvent();

      // We are now blocked on generateRequest:
      expect(session1.generateRequest).toHaveBeenCalledTimes(1);

      await drmEngine.destroy();

      p.reject(new Error('Fail'));  // Fail generateRequest.
      await Util.shortDelay();  // Wait for any delayed errors.
      // onError is a failure by default.
    });

    it('interrupts successful license requests', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      const operation = shaka.util.AbortableOperation.notAbortable(p);
      fakeNetEngine.request.and.returnValue(operation);

      await initAndAttach();
      await sendEncryptedEvent();

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      // We are now blocked on the license request:
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      expect(fakeNetEngine.request).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.LICENSE,
          jasmine.anything());

      await drmEngine.destroy();

      // Unblock the license request.
      p.resolve({data: new Uint8Array(0)});
      await Util.shortDelay();  // Ensure request is handled.

      // Due to the interruption, we never updated the session.
      expect(session1.update).not.toHaveBeenCalled();
    });

    it('interrupts failed license requests', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      const operation = shaka.util.AbortableOperation.notAbortable(p);
      fakeNetEngine.request.and.returnValue(operation);

      await initAndAttach();
      await sendEncryptedEvent();

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      // We are now blocked on the license request:
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
      expect(fakeNetEngine.request).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.LICENSE,
          jasmine.anything());

      await drmEngine.destroy();

      // Fail the license request.
      p.reject(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.HTTP_ERROR));
      await Util.shortDelay();
    });

    it('does not trigger errors if it fails update', async () => {
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      session1.update.and.returnValue(p);

      await initAndAttach();
      await sendEncryptedEvent();

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});

      await shaka.test.Util.shortDelay();

      // We are now blocked on update:
      expect(session1.update).toHaveBeenCalledTimes(1);
      await drmEngine.destroy();

      // Fail the update.
      p.reject(new Error('Fail'));
      await Util.shortDelay();
    });

    it('still completes if session is not callable', async () => {
      // Before, we would use |session.closed| as part of destroy().  However,
      // this doesn't work if the session is not callable (no license request
      // sent).  So |session.closed| should never resolve and |session.close()|
      // should be rejected and destroy() should still succeed.
      // https://github.com/shaka-project/shaka-player/issues/664
      await initAndAttach();
      session1.closed = new shaka.util.PublicPromise();
      session2.closed = new shaka.util.PublicPromise();

      // Since this won't be attached to anything until much later, we must
      // silence unhandled rejection errors.
      const rejected = Promise.reject(new Error(''));
      rejected.catch(() => {});

      session1.close.and.returnValue(rejected);
      session2.close.and.returnValue(rejected);

      await sendEncryptedEvent('webm');
      await sendEncryptedEvent('cenc', new Uint8Array(2));

      // Still resolve these since we are mocking close and closed.  This
      // ensures DrmEngine is in the correct state.
      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.shortDelay();
      await drmEngine.destroy();
    });
  });  // describe('destroy')

  describe('isPlayReadyKeySystem', () => {
    it('should return true for MS & Chromecast PlayReady', () => {
      expect(shaka.media.DrmEngine.isPlayReadyKeySystem(
          'com.microsoft.playready')).toBe(true);
      expect(shaka.media.DrmEngine.isPlayReadyKeySystem(
          'com.microsoft.playready.anything')).toBe(true);
      expect(shaka.media.DrmEngine.isPlayReadyKeySystem(
          'com.chromecast.playready')).toBe(true);
    });

    it('should return false for non-PlayReady key systems', () => {
      expect(shaka.media.DrmEngine.isPlayReadyKeySystem(
          'com.widevine.alpha')).toBe(false);
      expect(shaka.media.DrmEngine.isPlayReadyKeySystem(
          'com.abc.playready')).toBe(false);
    });
  });

  describe('isFairPlayKeySystem', () => {
    it('should return true for FairPlay', () => {
      expect(shaka.media.DrmEngine.isFairPlayKeySystem(
          'com.apple.fps')).toBe(true);
      expect(shaka.media.DrmEngine.isFairPlayKeySystem(
          'com.apple.fps.1_0')).toBe(true);
      expect(shaka.media.DrmEngine.isFairPlayKeySystem(
          'com.apple.fps.2_0')).toBe(true);
      expect(shaka.media.DrmEngine.isFairPlayKeySystem(
          'com.apple.fps.3_0')).toBe(true);
    });

    it('should return false for non-FairPlay key systems', () => {
      expect(shaka.media.DrmEngine.isFairPlayKeySystem(
          'com.widevine.alpha')).toBe(false);
      expect(shaka.media.DrmEngine.isFairPlayKeySystem(
          'com.abc.playready')).toBe(false);
    });
  });

  describe('getDrmInfo', () => {
    it('includes correct info', async () => {
      // Leave only one drmInfo
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addVariant(0, (variant) => {
          variant.addVideo(1, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
          variant.addAudio(2, (stream) => {
            stream.encrypted = true;
            stream.addDrmInfo('drm.abc');
          });
        });
      });
      setDecodingInfoSpy(['drm.abc']);

      // Key IDs in manifest
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].keyIds = new Set(['deadbeefdeadbeefdeadbeefdeadbeef']);
      });

      config.advanced['drm.abc'] = {
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        distinctiveIdentifierRequired: true,
        serverCertificate: null,
        serverCertificateUri: '',
        sessionType: '',
        individualizationServer: '',
        persistentStateRequired: true,
      };
      drmEngine.configure(config);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      const drmInfo = drmEngine.getDrmInfo();
      expect(drmInfo).toEqual({
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: undefined,
        serverCertificateUri: '',
        sessionType: 'temporary',
        initData: [],
        keyIds: new Set(['deadbeefdeadbeefdeadbeefdeadbeef']),
      });
    });
  });  // describe('getDrmInfo')

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
          shaka.media.DrmEngine.getCommonDrmInfos([drmInfo], []);
      const returnedTwo =
          shaka.media.DrmEngine.getCommonDrmInfos([], [drmInfo]);
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
      const returned = shaka.media.DrmEngine.getCommonDrmInfos([drmInfoVideo],
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
      const returned = shaka.media.DrmEngine.getCommonDrmInfos([drmInfoVideo],
          [drmInfoAudio]);
      expect(returned).toEqual([drmInfoDesired]);
    });
  }); // describe('getCommonDrmInfos')

  describe('configure', () => {
    it('delays initial license requests if configured to', async () => {
      config.delayLicenseRequestUntilPlayed = true;
      drmEngine.configure(config);
      mockVideo.paused = true;

      await initAndAttach();
      await sendEncryptedEvent();

      const operation = shaka.util.AbortableOperation.completed({});
      fakeNetEngine.request.and.returnValue(operation);
      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});

      expect(fakeNetEngine.request).not.toHaveBeenCalled();

      mockVideo.on['play']();

      expect(fakeNetEngine.request).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.LICENSE,
          jasmine.objectContaining({
            uris: ['http://abc.drm/license'],
            method: 'POST',
            body: message,
          }));
    });

    it('does not delay license renewal requests', async () => {
      config.delayLicenseRequestUntilPlayed = true;
      drmEngine.configure(config);
      mockVideo.paused = true;

      await initAndAttach();
      await sendEncryptedEvent();

      const operation = shaka.util.AbortableOperation.completed({});
      fakeNetEngine.request.and.returnValue(operation);
      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});

      expect(fakeNetEngine.request).not.toHaveBeenCalled();

      mockVideo.on['play']();

      expect(fakeNetEngine.request).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.LICENSE,
          jasmine.objectContaining({
            uris: ['http://abc.drm/license'],
            method: 'POST',
            body: message,
          }));

      fakeNetEngine.request.calls.reset();

      mockVideo.paused = true;
      session1.on['message']({target: session1, message: message});

      expect(fakeNetEngine.request).toHaveBeenCalledWith(
          shaka.net.NetworkingEngine.RequestType.LICENSE,
          jasmine.objectContaining({
            uris: ['http://abc.drm/license'],
            method: 'POST',
            body: message,
          }));
      expect(fakeNetEngine.request).toHaveBeenCalledTimes(1);
    });
  }); // describe('configure')

  describe('removeSession', () => {
    /** @type {!shaka.util.PublicPromise} */
    let updatePromise;

    beforeEach(async () => {
      session1.load.and.returnValue(Promise.resolve(true));

      // When remove() is called, it should resolve quickly and raise a
      // 'message' event of type 'license-release'.  The removeSessions method
      // should wait until update() is complete with the response.
      updatePromise = new shaka.util.PublicPromise();
      session1.remove.and.callFake(() => {
        // Raise the event synchronously, even though it doesn't normally.
        session1.on['message']({target: session1, message: new ArrayBuffer(0)});
        session1.update.and.returnValue(updatePromise);
        return Promise.resolve();
      });

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
    });

    it('waits until update() is complete', async () => {
      const update = async () => {
        await shaka.test.Util.shortDelay();
        updatePromise.resolve();
      };

      await Promise.all([drmEngine.removeSession('abc'), update()]);
      expect(session1.update).toHaveBeenCalled();
    });

    it('is rejected when network request fails', async () => {
      const p = fakeNetEngine.delayNextRequest();
      const networkError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);
      p.reject(networkError);
      onErrorSpy.and.stub();

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.LICENSE_REQUEST_FAILED, networkError));
      await expectAsync(drmEngine.removeSession('abc'))
          .toBeRejectedWith(expected);
      expect(session1.update).not.toHaveBeenCalled();
    });

    it('is rejected when update() is rejected', async () => {
      updatePromise.reject(new Error('Error'));
      onErrorSpy.and.stub();

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED, 'Error'));
      await expectAsync(drmEngine.removeSession('abc'))
          .toBeRejectedWith(expected);
    });

    // Regression test for #3534
    it('does not remove the same session again on destroy', async () => {
      updatePromise.resolve();
      expect(session1.remove).not.toHaveBeenCalled();
      await drmEngine.removeSession('abc');
      expect(session1.remove).toHaveBeenCalled();
      session1.remove.calls.reset();
      await drmEngine.destroy();
      // The session should only be removed ONCE. If it's double-removed, it
      // will make a (non-fatal) DOMException.
      expect(session1.remove).not.toHaveBeenCalled();
    });
  });

  describe('expiration', () => {
    beforeEach(async () => {
      session1.sessionId = 'abc';
      session1.expiration = NaN;

      await initAndAttach();
      await sendEncryptedEvent();

      const message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
    });

    it('calls the callback when the expiration changes', () => {
      onExpirationSpy.calls.reset();

      session1.expiration = 10000;
      checkExpiration();
      expect(onExpirationSpy).toHaveBeenCalledTimes(1);
      expect(onExpirationSpy).toHaveBeenCalledWith(session1.sessionId, 10000);
      onExpirationSpy.calls.reset();

      session1.expiration = 50;
      checkExpiration();
      expect(onExpirationSpy).toHaveBeenCalledTimes(1);
      expect(onExpirationSpy).toHaveBeenCalledWith(session1.sessionId, 50);
      onExpirationSpy.calls.reset();

      session1.expiration = NaN;
      checkExpiration();
      expect(onExpirationSpy).toHaveBeenCalledTimes(1);
      expect(onExpirationSpy)
          .toHaveBeenCalledWith(session1.sessionId, Infinity);
    });

    it('gets the current expiration times', () => {
      session1.expiration = NaN;
      expect(drmEngine.getExpiration()).toBe(Infinity);
      session1.expiration = 12345;
      expect(drmEngine.getExpiration()).toBe(12345);
    });

    /** @suppress {accessControls} */
    function checkExpiration() {
      drmEngine.expirationTimer_.tickNow();
    }
  });

  describe('parseInbandPssh', () => {
    const WIDEVINE_PSSH =
        '00000028' +                          // atom size
        '70737368' +                          // atom type='pssh'
        '00000000' +                          // v0, flags=0
        'edef8ba979d64acea3c827dcd51d21ed' +  // system id (Widevine)
        '00000008' +                          // data size
        '0102030405060708';                   // data

    const PLAYREADY_PSSH =
        '00000028' +                          // atom size
        '70737368' +                          // atom type 'pssh'
        '00000000' +                          // v0, flags=0
        '9a04f07998404286ab92e65be0885f95' +  // system id (PlayReady)
        '00000008' +                          // data size
        '0102030405060708';                   // data

    const SEGMENT =
        '00000058' + // atom size = 28x + 28x + 8x
        '6d6f6f66' + // atom type 'moof'
        WIDEVINE_PSSH +
        PLAYREADY_PSSH;

    const binarySegment = shaka.util.Uint8ArrayUtils.fromHex(SEGMENT);

    it('calls newInitData when enabled', async () => {
      config.parseInbandPsshEnabled = true;
      await initAndAttach();

      /** @type {!jasmine.Spy} */
      const newInitDataSpy = jasmine.createSpy('newInitData');
      drmEngine.newInitData = shaka.test.Util.spyFunc(newInitDataSpy);

      await drmEngine.parseInbandPssh(
          shaka.util.ManifestParserUtils.ContentType.VIDEO, binarySegment);
      const expectedInitData = shaka.util.Uint8ArrayUtils.fromHex(
          WIDEVINE_PSSH + PLAYREADY_PSSH);
      expect(newInitDataSpy).toHaveBeenCalledWith('cenc', expectedInitData);
    });

    it('does not call newInitData when disabled', async () => {
      config.parseInbandPsshEnabled = false;
      await initAndAttach();

      /** @type {!jasmine.Spy} */
      const newInitDataSpy = jasmine.createSpy('newInitData');
      drmEngine.newInitData = shaka.test.Util.spyFunc(newInitDataSpy);
      await drmEngine.parseInbandPssh(
          shaka.util.ManifestParserUtils.ContentType.VIDEO, binarySegment);
      expect(newInitDataSpy).not.toHaveBeenCalled();
    });
  });

  async function initAndAttach() {
    const variants = manifest.variants;
    await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
    await drmEngine.attach(mockVideo);
  }

  function setDecodingInfoSpy(acceptableKeySystems) {
    decodingInfoSpy.and.callFake((config) => {
      const keySystem = config && config.keySystemConfiguration ?
          config.keySystemConfiguration.keySystem : null;
      let res;
      if (!config.keySystemConfiguration) {
        // Unencrypted content, return supported decodingInfo.
        res = {supported: true};
      } else if (!acceptableKeySystems.includes(keySystem)) {
        res = {supported: false};
      } else if (acceptableKeySystems.length <= 1) {
        // Use the mockMediaKeySystemAccess if there's only one key system.
        mockMediaKeySystemAccess.keySystem = keySystem;
        res = {
          supported: true,
          keySystemAccess: mockMediaKeySystemAccess,
        };
      } else {
        // Create new mediaKeySystemAccess objects for multiple key systems.
        const mediaKeySystemAccess = createMockMediaKeySystemAccess();
        mediaKeySystemAccess.keySystem = keySystem;
        res = {
          supported: true,
          keySystemAccess: mediaKeySystemAccess,
        };
      }
      return Promise.resolve(res);
    });
  }

  function createMockMediaKeySystemAccess() {
    const mksa = {
      keySystem: '',
      getConfiguration: jasmine.createSpy('getConfiguration'),
      createMediaKeys: jasmine.createSpy('createMediaKeys'),
    };
    mksa.getConfiguration.and.callFake(() => {
      return {
        audioCapabilities: [{contentType: 'audio/webm'}],
        videoCapabilities: [{contentType: 'video/mp4; codecs="fake"'}],
      };
    });
    mksa.createMediaKeys.and.callFake(() => {
      return Promise.resolve(mockMediaKeys);
    });
    return mksa;
  }

  function createMockMediaKeys() {
    return {
      createSession: jasmine.createSpy('createSession'),
      setServerCertificate: jasmine.createSpy('setServerCertificate'),
    };
  }

  function createMockSession() {
    const session = {
      expiration: NaN,
      closed: Promise.resolve(),
      keyStatuses: {
        forEach: jasmine.createSpy('forEach'),
      },
      generateRequest: jasmine.createSpy('generateRequest'),
      load: jasmine.createSpy('load'),
      update: jasmine.createSpy('update'),
      close: jasmine.createSpy('close'),
      remove: jasmine.createSpy('remove'),
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      on: {},  // event listeners
    };
    session.generateRequest.and.returnValue(Promise.resolve());
    session.close.and.returnValue(Promise.resolve());
    session.update.and.returnValue(Promise.resolve());
    session.addEventListener.and.callFake((name, callback) => {
      session.on[name] = callback;
    });
    return session;
  }

  /**
   * @param {Uint8Array} serverCert
   * @return {shaka.extern.AdvancedDrmConfiguration}
   */
  function createAdvancedConfig(serverCert) {
    return {
      audioRobustness: '',
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      serverCertificate: serverCert,
      serverCertificateUri: '',
      individualizationServer: '',
      sessionType: '',
      videoRobustness: '',
    };
  }

  /**
   * @param {number} id
   * @return {!ArrayBuffer}
   */
  function makeKeyId(id) {
    return shaka.util.BufferUtils.toArrayBuffer(new Uint8Array([id]));
  }

  /**
   * @param {function(!Array.<shaka.extern.DrmInfo>)} callback
   */
  function tweakDrmInfos(callback) {
    if (manifest.variants[0].video.encrypted) {
      callback(manifest.variants[0].video.drmInfos);
    }
    if (manifest.variants[0].audio.encrypted) {
      callback(manifest.variants[0].audio.drmInfos);
    }
  }

  /**
   *
   * @param {string} initDataType
   * @param {Uint8Array} initData
   * @param {string|null} keyId
   */
  async function sendEncryptedEvent(
      initDataType = 'cenc', initData = new Uint8Array(1), keyId = null) {
    // For some platforms, such as Xbox, where parseInbandPssh defaults to
    // true, this listener may never be set.
    if (mockVideo.on['encrypted']) {
      mockVideo.on['encrypted']({initDataType, initData, keyId});
    }

    await Util.shortDelay();
  }
});
