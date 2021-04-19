/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.log');
goog.require('shaka.media.DrmEngine');
goog.require('shaka.media.Transmuxer');
goog.require('shaka.net.DataUriPlugin');
goog.require('shaka.net.NetworkingEngine');
goog.require('shaka.test.FakeNetworkingEngine');
goog.require('shaka.test.FakeVideo');
goog.require('shaka.test.ManifestGenerator');
goog.require('shaka.test.Util');
goog.require('shaka.util.AbortableOperation');
goog.require('shaka.util.BufferUtils');
goog.require('shaka.util.Error');
goog.require('shaka.util.Platform');
goog.require('shaka.util.PlayerConfiguration');
goog.require('shaka.util.Platform');
goog.require('shaka.util.PublicPromise');
goog.require('shaka.util.StringUtils');
goog.require('shaka.util.Uint8ArrayUtils');

for (const useMediaCapabilities of [true, false]) {
  const isEnabled = useMediaCapabilities ? 'enabled' : 'disabled';
  describe('DrmEngine with MediaCapabilities ' + isEnabled, () => {
    testDrmEngine(useMediaCapabilities);
  });
}

function testDrmEngine(useMediaCapabilities) {
  const Util = shaka.test.Util;

  const originalRequestMediaKeySystemAccess =
      navigator.requestMediaKeySystemAccess;
  const originalLogError = shaka.log.error;
  const originalBatchTime = shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME;
  const originalDecodingInfo = navigator.mediaCapabilities.decodingInfo;

  /** @type {!jasmine.Spy} */
  let requestMediaKeySystemAccessSpy;
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
    requestMediaKeySystemAccessSpy =
        jasmine.createSpy('requestMediaKeySystemAccess');
    navigator.requestMediaKeySystemAccess =
        shaka.test.Util.spyFunc(requestMediaKeySystemAccessSpy);
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
    setRequestMediaKeySystemAccessSpy(['drm.abc']);

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
      setRequestMediaKeySystemAccessSpy(['drm.abc', 'drm.def']);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);
      expect(drmEngine.initialized()).toBe(true);
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.abc');

      if (!useMediaCapabilities) {
        // Only one call, since the first key system worked.
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
      }
    });

    it('tries to get the key systems in the order they appear in', async () => {
      // Fail both key systems.
      setRequestMediaKeySystemAccessSpy([]);

      const variants = manifest.variants;
      await expectAsync(drmEngine.initForPlayback(variants,
          manifest.offlineSessionIds, useMediaCapabilities)).toBeRejected();

      if (useMediaCapabilities) {
        expect(decodingInfoSpy).toHaveBeenCalledTimes(2);
        expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
          keySystemConfiguration: containing({keySystem: 'drm.abc'}),
        }));

        expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
          keySystemConfiguration: containing({keySystem: 'drm.def'}),
        }));
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(2);
        // These should be in the same order as the key systems appear in the
        // manifest.
        const calls = requestMediaKeySystemAccessSpy.calls;
        expect(calls.argsFor(0)[0]).toBe('drm.abc');
        expect(calls.argsFor(1)[0]).toBe('drm.def');
      }
    });

    it('tries the second key system if the first fails', async () => {
      // Accept drm.def, but not drm.abc.
      setRequestMediaKeySystemAccessSpy(['drm.def']);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);
      expect(drmEngine.initialized()).toBe(true);
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.def');

      if (!useMediaCapabilities) {
        // Both key systems were tried, since the first one failed.
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', jasmine.any(Object));
      }
    });

    it('chooses systems with configured license servers', async () => {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      setRequestMediaKeySystemAccessSpy(['drm.abc', 'drm.def']);

      // Remove the server URI for drm.abc, which appears first in the manifest.
      delete config.servers['drm.abc'];
      drmEngine.configure(config);
      // Ignore error logs, which we expect to occur due to the missing server.
      logErrorSpy.and.stub();

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);

      if (useMediaCapabilities) {
        expect(variants[0].decodingInfos.length).toBe(2);
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
        // Although drm.def appears second in the manifest, it is queried first
        // and also selected because it has a server configured.
        const calls = requestMediaKeySystemAccessSpy.calls;
        expect(calls.argsFor(0)[0]).toBe('drm.def');
      }
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.def');
    });

    it('overrides manifest with configured license servers', async () => {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      setRequestMediaKeySystemAccessSpy(['drm.abc', 'drm.def']);

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
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);

      if (useMediaCapabilities) {
        expect(variants[0].decodingInfos.length).toBe(2);
      } else {
        // Although drm.def appears second in the manifest, it is queried first
        // because it has a server configured.  The manifest-supplied server for
        // drm.abc will not be used.
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
      }

      const selectedDrmInfo = drmEngine.getDrmInfo();
      expect(selectedDrmInfo).not.toBe(null);
      expect(selectedDrmInfo.keySystem).toBe('drm.def');
      expect(selectedDrmInfo.licenseServerUri).toBe(config.servers['drm.def']);
    });

    it('detects content type capabilities of key system', async () => {
      setRequestMediaKeySystemAccessSpy(['drm.abc']);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);
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
      setRequestMediaKeySystemAccessSpy([]);

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE));
      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).toBeRejectedWith(expected);

      expect(drmEngine.initialized()).toBe(false);

      if (useMediaCapabilities) {
        expect(variants[0].decodingInfos.length).toBe(2);
      } else {
        // Both key systems were tried, since the first one failed.
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', jasmine.any(Object));
      }
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
      setRequestMediaKeySystemAccessSpy([]);

      const variants = manifest.variants;
      // All that matters here is that we don't throw.
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).not.toBeRejected();
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
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).toBeRejectedWith(expected);

      expect(drmEngine.initialized()).toBe(false);

      if (useMediaCapabilities) {
        expect(variants[0].decodingInfos.length).toBe(1);
        expect(variants[0].decodingInfos[0].keySystemAccess).toBeFalsy();
      } else {
        // No key systems were tried, since the dummy placeholder was detected.
        expect(requestMediaKeySystemAccessSpy).not.toHaveBeenCalled();
      }
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
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).toBeRejectedWith(expected);

      expect(drmEngine.initialized()).toBe(false);

      if (useMediaCapabilities) {
        expect(variants[0].decodingInfos.length).toBe(2);
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
      }
    });

    it('queries audio/video capabilities', async () => {
      setRequestMediaKeySystemAccessSpy([]);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      if (useMediaCapabilities) {
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
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              // audioCapabilities not present.
              videoCapabilities: [jasmine.objectContaining({
                contentType: 'video/foo; codecs="vbar"',
              })],
              distinctiveIdentifier: 'optional',
              persistentState: 'optional',
              sessionTypes: ['temporary'],
            })]);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', [jasmine.objectContaining({
              audioCapabilities: [jasmine.objectContaining({
                contentType: 'audio/foo; codecs="abar"',
              })],
              // videoCapabilities not present.
              distinctiveIdentifier: 'optional',
              persistentState: 'optional',
              sessionTypes: ['temporary'],
            })]);
      }
    });

    it('asks for persistent state and license for offline', async () => {
      setRequestMediaKeySystemAccessSpy([]);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForStorage(variants, /* usePersistentLicense= */ true,
              useMediaCapabilities)).toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      if (useMediaCapabilities) {
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
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(2);
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledWith('drm.abc', [
          jasmine.objectContaining({
            distinctiveIdentifier: 'optional',
            persistentState: 'required',
            sessionTypes: ['persistent-license'],
            initDataTypes: ['cenc'],
          }),
        ]);
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledWith('drm.def', [
          jasmine.objectContaining({
            distinctiveIdentifier: 'optional',
            persistentState: 'required',
            sessionTypes: ['persistent-license'],
            initDataTypes: ['cenc'],
          }),
        ]);
      }
    });

    it('honors distinctive identifier and persistent state', async () => {
      setRequestMediaKeySystemAccessSpy([]);
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].distinctiveIdentifierRequired = true;
        drmInfos[1].persistentStateRequired = true;
      });

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      if (useMediaCapabilities) {
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
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              distinctiveIdentifier: 'required',
              persistentState: 'optional',
              sessionTypes: ['temporary'],
            })]);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', [jasmine.objectContaining({
              distinctiveIdentifier: 'optional',
              persistentState: 'required',
              sessionTypes: ['temporary'],
            })]);
      }
    });

    it('makes no queries for key systems with clear content if no key config',
        async () => {
          setRequestMediaKeySystemAccessSpy([]);
          manifest.variants[0].video.drmInfos = [];
          manifest.variants[0].audio.drmInfos = [];
          config.servers = {};
          config.advanced = {};

          drmEngine.configure(config);
          const variants = manifest.variants;
          await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities);

          if (useMediaCapabilities) {
            // Gets decodingInfo for clear content with no keySystemAccess.
            expect(variants[0].decodingInfos.length).toBe(1);
            expect(variants[0].decodingInfos[0].keySystemAccess).toBeFalsy();
          } else {
            // Makes no queries for clear content.
            expect(requestMediaKeySystemAccessSpy).not.toHaveBeenCalled();
          }
          expect(
              shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo())).toBe('');
          expect(drmEngine.initialized()).toBe(true);
        });

    it('makes queries for clear content if key is configured', async () => {
      setRequestMediaKeySystemAccessSpy(['drm.abc']);
      manifest.variants[0].video.drmInfos = [];
      manifest.variants[0].audio.drmInfos = [];
      config.servers = {
        'drm.abc': 'http://abc.drm/license',
      };

      drmEngine.configure(config);
      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);
      expect(drmEngine.initialized()).toBe(true);
      expect(shaka.media.DrmEngine.keySystem(drmEngine.getDrmInfo()))
          .toBe('drm.abc');
      if (useMediaCapabilities) {
        expect(variants[0].decodingInfos.length).toBe(1);
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
      }
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

      setRequestMediaKeySystemAccessSpy([]);

      config.advanced['drm.abc'] = {
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: null,
        sessionType: 'persistent-license',
        individualizationServer: '',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
      };
      drmEngine.configure(config);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      if (useMediaCapabilities) {
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
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              audioCapabilities: [jasmine.objectContaining({
                robustness: 'good',
              })],
              videoCapabilities: [jasmine.objectContaining({
                robustness: 'really_really_ridiculously_good',
              })],
              distinctiveIdentifier: 'required',
              persistentState: 'required',
              sessionTypes: ['persistent-license'],
              initDataTypes: ['cenc'],
            })]);
      }
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

      setRequestMediaKeySystemAccessSpy([]);

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
        sessionType: '',
        individualizationServer: '',
        distinctiveIdentifierRequired: false,
        persistentStateRequired: false,
      };
      drmEngine.configure(config);

      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).toBeRejected();

      expect(drmEngine.initialized()).toBe(false);

      if (useMediaCapabilities) {
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
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              audioCapabilities: [jasmine.objectContaining({
                robustness: 'good',
              })],
              videoCapabilities: [jasmine.objectContaining({
                robustness: 'really_really_ridiculously_good',
              })],
              distinctiveIdentifier: 'required',
              persistentState: 'required',
              initDataTypes: ['cenc'],
            })]);
      }
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

      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);

      expect(drmEngine.initialized()).toBe(true);
      if (useMediaCapabilities) {
        expect(decodingInfoSpy).toHaveBeenCalledTimes(2);
        expect(decodingInfoSpy).toHaveBeenCalledWith(containing({
          keySystemConfiguration: containing({
            keySystem: 'drm.abc',
            initDataType: 'very_nice',
          }),
        }),
        );
      } else {
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              initDataTypes: ['very_nice'],
            })]);
      }
    });

    it('fails if license server is not configured', async () => {
      setRequestMediaKeySystemAccessSpy(['drm.abc']);

      config.servers = {};
      drmEngine.configure(config);

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN,
          'drm.abc'));
      const variants = manifest.variants;
      await expectAsync(
          drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
              useMediaCapabilities)).toBeRejectedWith(expected);
    });

    it('maps TS MIME types through the transmuxer', async () => {
      const originalIsSupported = shaka.media.Transmuxer.isSupported;

      try {
        // Mock out isSupported on Transmuxer so that we don't have to care
        // about what MediaSource supports under that.  All we really care about
        // is the translation of MIME types.
        shaka.media.Transmuxer.isSupported = (mimeType, contentType) => {
          return mimeType.startsWith('video/mp2t');
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

        setRequestMediaKeySystemAccessSpy(['drm.abc']);

        const variants = manifest.variants;
        variants[0].video.mimeType = 'video/mp2t';
        variants[0].audio.mimeType = 'video/mp2t';

        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
            useMediaCapabilities);
        expect(drmEngine.initialized()).toBe(true);

        if (useMediaCapabilities) {
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
        } else {
          expect(requestMediaKeySystemAccessSpy)
              .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
                audioCapabilities: [jasmine.objectContaining({
                  contentType: 'audio/mp4; codecs="abar"',
                })],
                videoCapabilities: [jasmine.objectContaining({
                  contentType: 'video/mp4; codecs="vbar"',
                })],
              })]);
        }
        expect(drmEngine.supportsVariant(variants[0])).toBeTruthy();
      } finally {
        // Restore the mock.
        shaka.media.Transmuxer.isSupported = originalIsSupported;
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
      setRequestMediaKeySystemAccessSpy([]);
      manifest.variants[0].video.drmInfos = [];
      manifest.variants[0].audio.drmInfos = [];
      config.servers = {};
      config.advanced = {};

      await initAndAttach();
      expect(mockVideo.setMediaKeys).not.toHaveBeenCalled();
    });

    it('sets MediaKeys for encrypted content', async () => {
      await initAndAttach();
      expect(mockVideo.setMediaKeys).toHaveBeenCalledWith(mockMediaKeys);
    });

    it('sets server certificate if present in config', async () => {
      const cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);

      // Should be set merely after init, without waiting for attach.
      expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(cert);
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
      const initData2 = new Uint8Array(0);
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

    // https://github.com/google/shaka-player/issues/2754
    it('ignores duplicate init data from newInitData', async () => {
      /** @type {!Uint8Array} */
      const initData = new Uint8Array(1);

      tweakDrmInfos((drmInfos) => {
        drmInfos[0].initData =
            [{initData: initData, initDataType: 'cenc', keyId: 'abc'}];
      });

      await drmEngine.initForPlayback(
          manifest.variants, manifest.offlineSessionIds, useMediaCapabilities);
      drmEngine.newInitData('cenc', initData);
      await drmEngine.attach(mockVideo);

      expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
      expect(session1.generateRequest).toHaveBeenCalledWith('cenc', initData);
    });

    it('uses clearKeys config to override DrmInfo', async () => {
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].keySystem = 'com.fake.NOT.clearkey';
      });

      setRequestMediaKeySystemAccessSpy(['org.w3.clearkey']);

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
      setRequestMediaKeySystemAccessSpy([]);

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
      await expectAsync(drmEngine.initForPlayback(variants, [],
          useMediaCapabilities)).toBeRejectedWith(expected);
    });

    it('fails with an error if setMediaKeys fails', async () => {
      // Fail setMediaKeys.
      mockVideo.setMediaKeys.and.returnValue(Promise.reject(
          new Error('whoops!')));

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
          'whoops!'));
      await expectAsync(initAndAttach()).toBeRejectedWith(expected);
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
  });  // describe('attach')

  describe('events', () => {
    describe('encrypted', () => {
      it('is listened for', async () => {
        await initAndAttach();
        expect(mockVideo.addEventListener).toHaveBeenCalledWith(
            'encrypted', jasmine.any(Function), jasmine.anything());
      });

      it('triggers the creation of a session', async () => {
        await initAndAttach();
        const initData1 = new Uint8Array(1);
        const initData2 = new Uint8Array(2);

        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});
        mockVideo.on['encrypted'](
            {initDataType: 'cenc', initData: initData2, keyId: null});

        expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(2);
        expect(session1.generateRequest)
            .toHaveBeenCalledWith('webm', initData1);
        expect(session2.generateRequest)
            .toHaveBeenCalledWith('cenc', initData2);
      });

      it('suppresses duplicate initDatas', async () => {
        await initAndAttach();
        const initData1 = new Uint8Array(1);
        const initData2 = new Uint8Array(1);  // identical to initData1

        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});
        mockVideo.on['encrypted'](
            {initDataType: 'cenc', initData: initData2, keyId: null});

        expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
        expect(session1.generateRequest)
            .toHaveBeenCalledWith('webm', initData1);
      });

      it('is ignored when init data is in DrmInfo', async () => {
        // Set up an init data override in the manifest:
        tweakDrmInfos((drmInfos) => {
          drmInfos[0].initData = [
            {initData: new Uint8Array(0), initDataType: 'cenc', keyId: null},
          ];
        });

        await initAndAttach();
        // We already created a session for the init data override.
        expect(mockMediaKeys.createSession).toHaveBeenCalledTimes(1);
        // We aren't even listening for 'encrypted' events.
        expect(mockVideo.on['encrypted']).toBe(undefined);
      });

      it('dispatches an error if createSession fails', async () => {
        mockMediaKeys.createSession.and.throwError('whoops!');
        onErrorSpy.and.stub();

        await initAndAttach();
        const initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});

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
        const initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});

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
        const initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

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
        const initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

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
        const initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

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
        const initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

        expect(session1.addEventListener).toHaveBeenCalledWith(
            'keystatuseschange', jasmine.any(Function), jasmine.anything());
      });

      it('triggers callback', async () => {
        await initAndAttach();
        const initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

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

      // See https://github.com/google/shaka-player/issues/1541
      it('does not update public key statuses before callback', async () => {
        await initAndAttach();

        const initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

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

      // See https://github.com/google/shaka-player/issues/1541
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

        const initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

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

        const initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

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
      const initData = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});

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
      setRequestMediaKeySystemAccessSpy(['org.w3.clearkey']);

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033',
      };
      drmEngine.configure(config);

      // Not mocked.  Run data through real data URI parser to ensure that it is
      // correctly formatted.
      fakeNetEngine.request.and.callFake((type, request) => {
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
      const initData = new Uint8Array(1);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});
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
      const initData = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});

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
      const initData1 = new Uint8Array(1);
      const initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

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
      const initData1 = new Uint8Array(1);
      const initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

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

    it('swallows errors when closing sessions', async () => {
      await initAndAttach();
      const initData1 = new Uint8Array(1);
      const initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

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
      const initData1 = new Uint8Array(1);
      const initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

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
      requestMediaKeySystemAccessSpy.and.returnValue(p);
      decodingInfoSpy.and.returnValue(p);

      const variants = manifest.variants;
      const init = drmEngine.initForPlayback(
          variants, manifest.offlineSessionIds, useMediaCapabilities);

      // This flow should still return "success" when DrmEngine is destroyed.
      await shaka.test.Util.shortDelay();

      if (useMediaCapabilities) {
        expect(variants[0].decodingInfos.length).toBe(0);
        await drmEngine.destroy();
        p.reject(new Error(''));  // Fail drm.abc.
        await expectAsync(init).toBeRejected();
      } else {
        // The first query has been made, which we are blocking.
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledWith(
            'drm.abc', jasmine.any(Array));
        await drmEngine.destroy();
        p.reject(new Error(''));  // Fail drm.abc.
        await expectAsync(init).toBeRejected();
        // A second query was not made.
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
      }
      expect(drmEngine.initialized()).toBe(false);
    });

    it('interrupts successful MediaKeys queries', async () => {
      // Hold the MediaKeys query:
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      requestMediaKeySystemAccessSpy.and.returnValue(p);
      decodingInfoSpy.and.returnValue(p);

      const variants = manifest.variants;
      const init = drmEngine.initForPlayback(
          variants, manifest.offlineSessionIds, useMediaCapabilities);

      await shaka.test.Util.shortDelay();

      if (useMediaCapabilities) {
        expect(variants[0].decodingInfos.length).toBe(0);
      } else {
        // The first query has been made, which we are blocking.
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledTimes(1);
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledWith(
            'drm.abc', jasmine.any(Array));
      }
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
          variants, manifest.offlineSessionIds, useMediaCapabilities);

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
        p1.reject(new Error(''));
      };
      const success = async () => {
        await shaka.test.Util.shortDelay();
        p2.resolve();
      };
      await Promise.all([init, destroy, fail(), success()]);
    });

    it('interrupts successful calls to setMediaKeys', async () => {
      // Hold setMediaKeys:
      /** @type {!shaka.util.PublicPromise} */
      const p1 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p1);

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
      const initData1 = new Uint8Array(1);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});

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
      const initData1 = new Uint8Array(1);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});

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
      const initData1 = new Uint8Array(1);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});

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
      const initData1 = new Uint8Array(1);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});

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
      // https://github.com/google/shaka-player/issues/664
      await initAndAttach();
      session1.closed = new shaka.util.PublicPromise();
      session2.closed = new shaka.util.PublicPromise();

      // Since this won't be attached to anything until much later, we must
      // silence unhandled rejection errors.
      const rejected = Promise.reject(new Error(''));
      rejected.catch(() => {});

      session1.close.and.returnValue(rejected);
      session2.close.and.returnValue(rejected);

      const initData1 = new Uint8Array(1);
      const initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

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
          'com.apple.fps.1_0g')).toBe(true);
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
      setRequestMediaKeySystemAccessSpy(['drm.abc']);

      // Key IDs in manifest
      tweakDrmInfos((drmInfos) => {
        drmInfos[0].keyIds = new Set(['deadbeefdeadbeefdeadbeefdeadbeef']);
      });

      config.advanced['drm.abc'] = {
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        distinctiveIdentifierRequired: true,
        serverCertificate: null,
        sessionType: '',
        individualizationServer: '',
        persistentStateRequired: true,
      };
      drmEngine.configure(config);

      const variants = manifest.variants;
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);
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
        initData: ['blah'],
        keyIds: new Set(['deadbeefdeadbeefdeadbeefdeadbeef']),
      };
      const drmInfoAudio = {
        keySystem: 'drm.abc',
        licenseServerUri: undefined,
        distinctiveIdentifierRequired: true,
        persistentStateRequired: false,
        audioRobustness: 'good',
        serverCertificate: undefined,
        initData: ['init data'],
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
        initData: ['blah', 'init data'],
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
      const initData = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});

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
      const initData = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});

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
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
          useMediaCapabilities);
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
  });

  describe('expiration', () => {
    beforeEach(async () => {
      session1.sessionId = 'abc';
      session1.expiration = NaN;

      await initAndAttach();
      const initData = new Uint8Array(0);
      const message = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});
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

  async function initAndAttach() {
    const variants = manifest.variants;
    await drmEngine.initForPlayback(variants, manifest.offlineSessionIds,
        useMediaCapabilities);
    await drmEngine.attach(mockVideo);
  }

  function setRequestMediaKeySystemAccessSpy(acceptableKeySystems) {
    // TODO: Setting both the requestMediaKeySystemAccessSpy and decodingInfoSpy
    // as a temporary solution. Only decodingInfoSpy is needed once we use
    // decodingInfo API to get mediaKeySystemAccess.
    setDecodingInfoSpy(acceptableKeySystems);
    requestMediaKeySystemAccessSpy.and.callFake((keySystem) => {
      if (!acceptableKeySystems.includes(keySystem)) {
        return Promise.reject(new Error(''));
      }
      mockMediaKeySystemAccess.keySystem = keySystem;
      return Promise.resolve(mockMediaKeySystemAccess);
    });
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
}
