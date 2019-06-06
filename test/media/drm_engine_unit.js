/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('DrmEngine', function() {
  const Periods = shaka.util.Periods;

  const originalRequestMediaKeySystemAccess =
      navigator.requestMediaKeySystemAccess;
  const originalLogError = shaka.log.error;

  /** @type {!jasmine.Spy} */
  let requestMediaKeySystemAccessSpy;
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
  /** @type {!ArrayBuffer} */
  let license;

  beforeEach(() => {
    requestMediaKeySystemAccessSpy =
        jasmine.createSpy('requestMediaKeySystemAccess');
    navigator.requestMediaKeySystemAccess =
        shaka.test.Util.spyFunc(requestMediaKeySystemAccessSpy);

    logErrorSpy = jasmine.createSpy('shaka.log.error');
    shaka.log.error = shaka.test.Util.spyFunc(logErrorSpy);

    onErrorSpy = jasmine.createSpy('onError');
    onKeyStatusSpy = jasmine.createSpy('onKeyStatus');
    onExpirationSpy = jasmine.createSpy('onExpirationUpdated');
    onEventSpy = jasmine.createSpy('onEvent');

    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0)
          .addDrmInfo('drm.abc')
          .addDrmInfo('drm.def')
          .addVideo(1).mime('video/foo', 'vbar').encrypted(true)
          .addAudio(2).mime('audio/foo', 'abar').encrypted(true)
      .build();

    // By default, error logs and callbacks result in failure.
    onErrorSpy.and.callFake(fail);
    logErrorSpy.and.callFake(fail);

    // By default, allow keysystem drm.abc
    requestMediaKeySystemAccessSpy.and.callFake(
        fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));

    mockVideo = new shaka.test.FakeVideo();

    session1 = createMockSession();
    session2 = createMockSession();
    session3 = createMockSession();

    mockMediaKeySystemAccess = createMockMediaKeySystemAccess();

    mockMediaKeys = createMockMediaKeys();
    mockMediaKeys.createSession.and.callFake(function() {
      let index = mockMediaKeys.createSession.calls.count() - 1;
      return [session1, session2, session3][index];
    });
    mockMediaKeys.setServerCertificate.and.returnValue(Promise.resolve());

    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    license = (new Uint8Array(0)).buffer;
    fakeNetEngine.setResponseValue('http://abc.drm/license', license);

    let playerInterface = {
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
    shaka.log.error = originalLogError;
  });

  describe('supportsVariants', function() {
    it('supports all clear variants', async function() {
      const manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0)
              .addDrmInfo('drm.abc')
              .addDrmInfo('drm.def')
              .addVideo(1).mime('video/foo', 'vbar').encrypted(false)
          .build();

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      expect(drmEngine.supportsVariant(variants[0])).toBeTruthy();
    });
  });

  describe('init', function() {
    it('stops on first available key system', async () => {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc', 'drm.def']));

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(drmEngine.keySystem()).toBe('drm.abc');

      // Only one call, since the first key system worked.
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
      expect(requestMediaKeySystemAccessSpy)
          .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
    });

    it('tries systems in the order they appear in', async () => {
      // Fail both key systems.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        // These should be in the same order as the key systems appear in the
        // manifest.
        let calls = requestMediaKeySystemAccessSpy.calls;
        expect(calls.argsFor(0)[0]).toBe('drm.abc');
        expect(calls.argsFor(1)[0]).toBe('drm.def');
      }
    });

    it('tries systems with configured license servers first', async () => {
      // Fail both key systems.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      // Remove the server URI for drm.abc, which appears first in the manifest.
      delete config.servers['drm.abc'];
      drmEngine.configure(config);
      // Ignore error logs, which we expect to occur due to the missing server.
      logErrorSpy.and.stub();

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        // Although drm.def appears second in the manifest, it is queried first
        // because it has a server configured.
        let calls = requestMediaKeySystemAccessSpy.calls;
        expect(calls.argsFor(0)[0]).toBe('drm.def');
        expect(calls.argsFor(1)[0]).toBe('drm.abc');
      }
    });

    it('overrides manifest with configured license servers', async () => {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc', 'drm.def']));

      // Add manifest-supplied license servers for both.
      for (const drmInfo of manifest.periods[0].variants[0].drmInfos) {
        if (drmInfo.keySystem == 'drm.abc') {
          drmInfo.licenseServerUri = 'http://foo.bar/abc';
        } else if (drmInfo.keySystem == 'drm.def') {
          drmInfo.licenseServerUri = 'http://foo.bar/def';
        }

        // Make sure we didn't somehow choose manifest-supplied values that
        // match the config.  This would invalidate parts of the test.
        const configServer = config.servers[drmInfo.keySystem];
        expect(drmInfo.licenseServerUri).not.toEqual(configServer);
      }

      // Remove the server URI for drm.abc from the config, so that only drm.def
      // could be used, in spite of the manifest-supplied license server URI.
      delete config.servers['drm.abc'];
      drmEngine.configure(config);

      // Ignore error logs, which we expect to occur due to the missing server.
      logErrorSpy.and.stub();

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      // Although drm.def appears second in the manifest, it is queried first
      // because it has a server configured.  The manifest-supplied server for
      // drm.abc will not be used.
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
      const selectedDrmInfo = drmEngine.getDrmInfo();
      expect(selectedDrmInfo).not.toBe(null);
      expect(selectedDrmInfo.keySystem).toBe('drm.def');
      expect(selectedDrmInfo.licenseServerUri).toBe(config.servers['drm.def']);
    });

    it('detects content type capabilities of key system', async () => {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(drmEngine.willSupport('audio/webm')).toBeTruthy();
      expect(drmEngine.willSupport('video/mp4; codecs="fake"')).toBeTruthy();

      // Because DrmEngine will err on being too accepting, make sure it will
      // reject something. However, we can only check that it is actually
      // thing on non-Edge browsers because of https://bit.ly/2IcEgv0
      if (!navigator.userAgent.includes('Edge/')) {
        expect(drmEngine.willSupport('this-should-fail')).toBeFalsy();
      }
    });

    it('tries the second key system if the first fails', async () => {
      // Accept drm.def, but not drm.abc.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.def']));

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(drmEngine.keySystem()).toBe('drm.def');

      // Both key systems were tried, since the first one failed.
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
      expect(requestMediaKeySystemAccessSpy)
          .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
      expect(requestMediaKeySystemAccessSpy)
          .toHaveBeenCalledWith('drm.def', jasmine.any(Object));
    });

    it('fails to initialize if no key systems are available', async () => {
      // Accept no key systems.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(drmEngine.initialized()).toBe(false);

        // Both key systems were tried, since the first one failed.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', jasmine.any(Object));
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE));
      }
    });

    it('silences errors for unencrypted assets', async () => {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addVideo(1).mime('video/foo', 'vbar')
            .addAudio(2).mime('audio/foo', 'abar')
        .build();

      // Accept no key systems.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      // Both key systems were tried, since the first one failed.
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
      expect(requestMediaKeySystemAccessSpy)
          .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
      expect(requestMediaKeySystemAccessSpy)
          .toHaveBeenCalledWith('drm.def', jasmine.any(Object));
    });

    it('fails to initialize if no key systems are recognized', async () => {
      // Simulate the DASH parser inserting a blank placeholder when only
      // unrecognized custom schemes are found.
      manifest.periods[0].variants[0].drmInfos[0].keySystem = '';
      manifest.periods[0].variants[0].drmInfos[1].keySystem = '';

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(drmEngine.initialized()).toBe(false);

        // No key systems were tried, since the dummy placeholder was detected.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(0);

        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS));
      }
    });

    it('fails to initialize if the CDM cannot be created', async () => {
      // The query succeeds, but we fail to create the CDM.
      mockMediaKeySystemAccess.createMediaKeys.and.throwError('whoops!');

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(drmEngine.initialized()).toBe(false);

        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_CREATE_CDM,
            'whoops!'));
      }
    });

    it('queries audio/video capabilities', async () => {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
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
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForStorage(
            variants, /* usePersistentLicense */ true);
        fail();
      } catch (error) {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              distinctiveIdentifier: 'optional',
              persistentState: 'required',
              sessionTypes: ['persistent-license'],
            })]);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', [jasmine.objectContaining({
              distinctiveIdentifier: 'optional',
              persistentState: 'required',
              sessionTypes: ['persistent-license'],
            })]);
      }
    });

    it('honors distinctive identifier and persistent state', async () => {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      manifest.periods[0].variants[0].drmInfos[0]
          .distinctiveIdentifierRequired = true;
      manifest.periods[0].variants[0].drmInfos[1]
          .persistentStateRequired = true;

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
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

    it('makes no queries for clear content if no key config', async () => {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      manifest.periods[0].variants[0].drmInfos = [];
      config.servers = {};
      config.advanced = {};

      drmEngine.configure(config);
      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(drmEngine.keySystem()).toBe('');
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(0);
    });

    it('makes queries for clear content if key is configured', async () => {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));
      manifest.periods[0].variants[0].drmInfos = [];
      config.servers = {
        'drm.abc': 'http://abc.drm/license',
      };

      drmEngine.configure(config);
      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      expect(drmEngine.keySystem()).toBe('drm.abc');
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
    });

    it('uses advanced config to fill in DrmInfo', async () => {
      // Leave only one drmInfo
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addDrmInfo('drm.abc')
            .addVideo(1).mime('video/foo', 'vbar').encrypted(true)
            .addAudio(2).mime('audio/foo', 'abar').encrypted(true)
        .build();

      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      config.advanced['drm.abc'] = {
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: null,
        individualizationServer: '',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
      };
      drmEngine.configure(config);

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
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
            })]);
      }
    });

    it('prefers advanced config from manifest if present', async () => {
      // Leave only one drmInfo
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addDrmInfo('drm.abc')
            .addVideo(1).mime('video/foo', 'vbar').encrypted(true)
            .addAudio(2).mime('audio/foo', 'abar').encrypted(true)
        .build();

      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      // DrmInfo directly sets advanced settings.
      manifest.periods[0].variants[0].drmInfos[0]
          .distinctiveIdentifierRequired = true;
      manifest.periods[0].variants[0].drmInfos[0]
          .persistentStateRequired = true;
      manifest.periods[0].variants[0].drmInfos[0]
          .audioRobustness = 'good';
      manifest.periods[0].variants[0].drmInfos[0]
          .videoRobustness = 'really_really_ridiculously_good';

      config.advanced['drm.abc'] = {
        audioRobustness: 'bad',
        videoRobustness: 'so_bad_it_hurts',
        serverCertificate: null,
        individualizationServer: '',
        distinctiveIdentifierRequired: false,
        persistentStateRequired: false,
      };
      drmEngine.configure(config);

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
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
            })]);
      }
    });

    it('fails if license server is not configured', async () => {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));

      config.servers = {};
      drmEngine.configure(config);

      try {
        const variants = Periods.getAllVariantsFrom(manifest.periods);
        await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
        fail();
      } catch (error) {
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN,
            'drm.abc'));
      }
    });
  });  // describe('init')

  describe('attach', function() {
    beforeEach(function() {
      // Both audio and video with the same key system:
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addDrmInfo('drm.abc')
            .addVideo(1).mime('video/foo', 'vbar').encrypted(true)
            .addAudio(2).mime('audio/foo', 'abar').encrypted(true)
        .build();
    });

    it('does nothing for unencrypted content', async () => {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      manifest.periods[0].variants[0].drmInfos = [];
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
      let cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      await initAndAttach();
      expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(cert);
    });

    it('prefers server certificate from DrmInfo', async () => {
      let cert1 = new Uint8Array(5);
      let cert2 = new Uint8Array(1);
      manifest.periods[0].variants[0].drmInfos[0].serverCertificate = cert1;

      config.advanced['drm.abc'] = createAdvancedConfig(cert2);
      drmEngine.configure(config);

      await initAndAttach();
      expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(cert1);
    });

    it('does not set server certificate if absent', async () => {
      await initAndAttach();
      expect(mockMediaKeys.setServerCertificate).not.toHaveBeenCalled();
    });

    it('creates sessions for init data overrides', function(done) {
      // Set up init data overrides in the manifest:
      let initData1 = new Uint8Array(5);
      let initData2 = new Uint8Array(0);
      let initData3 = new Uint8Array(10);
      manifest.periods[0].variants[0].drmInfos[0].initData = [
        {initData: initData1, initDataType: 'cenc', keyId: null},
        {initData: initData2, initDataType: 'webm', keyId: null},
        {initData: initData3, initDataType: 'cenc', keyId: null},
      ];

      initAndAttach().then(function() {
        expect(mockMediaKeys.createSession.calls.count()).toBe(3);
        expect(session1.generateRequest).
            toHaveBeenCalledWith('cenc', initData1.buffer);
        expect(session2.generateRequest).
            toHaveBeenCalledWith('webm', initData2.buffer);
        expect(session3.generateRequest).
            toHaveBeenCalledWith('cenc', initData3.buffer);
      }).catch(fail).then(done);
    });

    it('ignores duplicate init data overrides', function(done) {
      // Set up init data overrides in the manifest;
      // The second initData has a different keyId from the first,
      // but the same initData.
      // The third initData has a different initData from the first,
      // but the same keyId.
      // Both should be discarded as duplicates.
      let initData1 = new Uint8Array(1);
      let initData2 = new Uint8Array(1);
      let initData3 = new Uint8Array(10);
      manifest.periods[0].variants[0].drmInfos[0].initData = [
        {initData: initData1, initDataType: 'cenc', keyId: 'abc'},
        {initData: initData2, initDataType: 'cenc', keyId: 'def'},
        {initData: initData3, initDataType: 'cenc', keyId: 'abc'},
      ];

      initAndAttach().then(function() {
        expect(mockMediaKeys.createSession.calls.count()).toBe(1);
        expect(session1.generateRequest).
            toHaveBeenCalledWith('cenc', initData1.buffer);
      }).catch(fail).then(done);
    });

    it('uses clearKeys config to override DrmInfo', async () => {
      manifest.periods[0].variants[0].drmInfos[0].keySystem =
          'com.fake.NOT.clearkey';

      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['org.w3.clearkey']));

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033',
      };
      drmEngine.configure(config);

      let session = createMockSession();
      mockMediaKeys.createSession.and.callFake(function() {
        expect(mockMediaKeys.createSession.calls.count()).toBe(1);
        return session;
      });

      await initAndAttach();
      let Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

      expect(manifest.periods[0].variants[0].drmInfos.length).toBe(1);
      expect(manifest.periods[0].variants[0].drmInfos[0].keySystem).
          toBe('org.w3.clearkey');

      expect(session.generateRequest).
          toHaveBeenCalledWith('keyids', jasmine.any(ArrayBuffer));

      let initData = JSON.parse(shaka.util.StringUtils.fromUTF8(
          session.generateRequest.calls.argsFor(0)[1]));
      let keyId1 = Uint8ArrayUtils.toHex(
          Uint8ArrayUtils.fromBase64(initData.kids[0]));
      let keyId2 = Uint8ArrayUtils.toHex(
          Uint8ArrayUtils.fromBase64(initData.kids[1]));
      expect(keyId1).toBe('deadbeefdeadbeefdeadbeefdeadbeef');
      expect(keyId2).toBe('02030507011013017019023029031037');
    });

    it('fails with an error if setMediaKeys fails', async () => {
      // Fail setMediaKeys.
      mockVideo.setMediaKeys.and.returnValue(Promise.reject({
        message: 'whoops!',
      }));

      try {
        await initAndAttach();
        fail();
      } catch (error) {
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
            'whoops!'));
      }
    });

    it('fails with an error if setServerCertificate fails', async () => {
      let cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      // Fail setServerCertificate.
      mockMediaKeys.setServerCertificate.and.returnValue(Promise.reject({
        message: 'whoops!',
      }));

      try {
        await initAndAttach();
        fail();
      } catch (error) {
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
            'whoops!'));
      }
    });

    it('dispatches an error if generateRequest fails', async () => {
      // Set up an init data override in the manifest to get an immediate call
      // to generateRequest:
      let initData1 = new Uint8Array(5);
      manifest.periods[0].variants[0].drmInfos[0].initData = [
        {initData: initData1, initDataType: 'cenc', keyId: null},
      ];

      // Fail generateRequest.
      let session1 = createMockSession();
      const nativeError = {message: 'whoops!'};
      session1.generateRequest.and.returnValue(Promise.reject(nativeError));
      mockMediaKeys.createSession.and.returnValue(session1);

      onErrorSpy.and.stub();
      await initAndAttach();
      expect(onErrorSpy).toHaveBeenCalled();
      let error = onErrorSpy.calls.argsFor(0)[0];
      shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.FAILED_TO_GENERATE_LICENSE_REQUEST,
          nativeError.message, nativeError, undefined));
    });
  });  // describe('attach')

  describe('events', function() {
    describe('encrypted', function() {
      it('is listened for', async () => {
        await initAndAttach();
        expect(mockVideo.addEventListener).toHaveBeenCalledWith(
            'encrypted', jasmine.any(Function), jasmine.anything());
      });

      it('triggers the creation of a session', async () => {
        await initAndAttach();
        let initData1 = new Uint8Array(1);
        let initData2 = new Uint8Array(2);

        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});
        mockVideo.on['encrypted'](
            {initDataType: 'cenc', initData: initData2, keyId: null});

        expect(mockMediaKeys.createSession.calls.count()).toBe(2);
        expect(session1.generateRequest).
            toHaveBeenCalledWith('webm', initData1.buffer);
        expect(session2.generateRequest).
            toHaveBeenCalledWith('cenc', initData2.buffer);
      });

      it('suppresses duplicate initDatas', async () => {
        await initAndAttach();
        let initData1 = new Uint8Array(1);
        let initData2 = new Uint8Array(1);  // identical to initData1

        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});
        mockVideo.on['encrypted'](
            {initDataType: 'cenc', initData: initData2, keyId: null});

        expect(mockMediaKeys.createSession.calls.count()).toBe(1);
        expect(session1.generateRequest).
            toHaveBeenCalledWith('webm', initData1.buffer);
      });

      it('is ignored when init data is in DrmInfo', async () => {
        // Set up an init data override in the manifest:
        manifest.periods[0].variants[0].drmInfos[0].initData = [
          {initData: new Uint8Array(0), initDataType: 'cenc', keyId: null},
        ];

        await initAndAttach();
        // We already created a session for the init data override.
        expect(mockMediaKeys.createSession.calls.count()).toBe(1);
        // We aren't even listening for 'encrypted' events.
        expect(mockVideo.on['encrypted']).toBe(undefined);
      });

      it('dispatches an error if createSession fails', async () => {
        mockMediaKeys.createSession.and.throwError('whoops!');
        onErrorSpy.and.stub();

        await initAndAttach();
        let initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});

        expect(onErrorSpy).toHaveBeenCalled();
        let error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
            'whoops!'));
      });

      it('dispatches an error if manifest says unencrypted', async () => {
        manifest.periods[0].variants[0].drmInfos = [];
        config.servers = {};
        config.advanced = {};

        onErrorSpy.and.stub();

        await initAndAttach();
        let initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});

        expect(onErrorSpy).toHaveBeenCalled();
        let error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
      });
    });  // describe('encrypted')

    describe('message', function() {
      it('is listened for', async () => {
        await initAndAttach();
        let initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

        expect(session1.addEventListener).toHaveBeenCalledWith(
            'message', jasmine.any(Function), jasmine.anything());
      });

      it('triggers a license request', async () => {
        await sendMessageTest('http://abc.drm/license');
      });

      it('prefers a license server URI from configuration', async () => {
        manifest.periods[0].variants[0].drmInfos[0].licenseServerUri =
            'http://foo.bar/drm';
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
        let initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

        // Simulate a permission error from the web server.
        let netError = new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.BAD_HTTP_STATUS,
            'http://abc.drm/license', 403);
        let operation = shaka.util.AbortableOperation.failed(netError);
        fakeNetEngine.request.and.returnValue(operation);

        let message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});
        await shaka.test.Util.delay(0.5);

        expect(onErrorSpy).toHaveBeenCalled();
        let error = onErrorSpy.calls.argsFor(0)[0];
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
        let initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

        let operation = shaka.util.AbortableOperation.completed({});
        fakeNetEngine.request.and.returnValue(operation);
        let message = new Uint8Array(0);
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

    describe('keystatuseschange', function() {
      it('is listened for', async () => {
        await initAndAttach();
        let initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

        expect(session1.addEventListener).toHaveBeenCalledWith(
            'keystatuseschange', jasmine.any(Function), jasmine.anything());
      });

      it('triggers callback', function(done) {
        initAndAttach().then(function() {
          let initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData, keyId: null});

          let keyId1 = (new Uint8Array(1)).buffer;
          let keyId2 = (new Uint8Array(2)).buffer;
          let status1 = 'usable';
          let status2 = 'expired';
          session1.keyStatuses.forEach.and.callFake(function(callback) {
            callback(keyId1, status1);
            callback(keyId2, status2);
          });

          onKeyStatusSpy.and.callFake(function(statusMap) {
            expect(statusMap).toEqual({
              '00': status1,
              '0000': status2,
            });
            done();
          });

          session1.on['keystatuseschange']({target: session1});
        }).catch(fail);
      });

      // See https://github.com/google/shaka-player/issues/1541
      it('does not update public key statuses before callback', async () => {
        await initAndAttach();

        let initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

        let keyId1 = (new Uint8Array(1)).buffer;
        let keyId2 = (new Uint8Array(2)).buffer;
        let status1 = 'usable';
        let status2 = 'expired';
        session1.keyStatuses.forEach.and.callFake(function(callback) {
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
        expect(keyIds.length).toEqual(0);

        // Wait for the callback to occur, then end the test.
        await new Promise((resolve) => {
          onKeyStatusSpy.and.callFake(resolve);
        });

        // Now key statuses are available.
        keyIds = Object.keys(drmEngine.getKeyStatuses());
        expect(keyIds.length).toEqual(2);
      });

      // See https://github.com/google/shaka-player/issues/1541
      it('does not invoke callback until all sessions are loaded', async () => {
        // Set up init data overrides in the manifest so that we get multiple
        // sessions.
        let initData1 = new Uint8Array(10);
        let initData2 = new Uint8Array(11);
        manifest.periods[0].variants[0].drmInfos[0].initData = [
          {initData: initData1, initDataType: 'cenc', keyId: null},
          {initData: initData2, initDataType: 'cenc', keyId: null},
        ];

        let keyId1 = (new Uint8Array(1)).buffer;
        let keyId2 = (new Uint8Array(2)).buffer;
        session1.keyStatuses.forEach.and.callFake(function(callback) {
          callback(keyId1, 'usable');
        });
        session2.keyStatuses.forEach.and.callFake(function(callback) {
          callback(keyId2, 'usable');
        });

        await initAndAttach();

        // The callback waits for some time to pass, to batch up status changes.
        // But even after some time has passed, we should not have invoked the
        // callback, because we don't have a status for session2 yet.
        session1.on['keystatuseschange']({target: session1});
        await shaka.test.Util.delay(keyStatusBatchTime() + 0.5);
        expect(onKeyStatusSpy).not.toHaveBeenCalled();

        // After both sessions have been loaded, we will finally invoke the
        // callback.
        session2.on['keystatuseschange']({target: session2});
        await shaka.test.Util.delay(keyStatusBatchTime() + 0.5);
        expect(onKeyStatusSpy).toHaveBeenCalled();
      });

      it('causes an EXPIRED error when all keys expire', function(done) {
        onErrorSpy.and.stub();

        initAndAttach().then(function() {
          expect(onErrorSpy).not.toHaveBeenCalled();

          let initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData, keyId: null});

          let keyId1 = (new Uint8Array(1)).buffer;
          let keyId2 = (new Uint8Array(2)).buffer;

          // Expire one key.
          session1.keyStatuses.forEach.and.callFake(function(callback) {
            callback(keyId1, 'usable');
            callback(keyId2, 'expired');
          });

          onKeyStatusSpy.and.callFake(function(statusMap) {
            // One key is still usable.
            expect(onErrorSpy).not.toHaveBeenCalled();

            // Expire both keys.
            session1.keyStatuses.forEach.and.callFake(function(callback) {
              callback(keyId1, 'expired');
              callback(keyId2, 'expired');
            });

            onKeyStatusSpy.and.callFake(function(statusMap) {
              // Both keys are expired, so we should have an error.
              expect(onErrorSpy).toHaveBeenCalled();
              // There should be exactly one error.
              expect(onErrorSpy.calls.count()).toEqual(1);
              let error = onErrorSpy.calls.argsFor(0)[0];
              shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.DRM,
                  shaka.util.Error.Code.EXPIRED));
              done();
            });

            session1.on['keystatuseschange']({target: session1});
          });

          session1.on['keystatuseschange']({target: session1});
        }).catch(fail);
      });

      it('causes only one error when two keys expire at once', function(done) {
        onErrorSpy.and.stub();

        initAndAttach().then(function() {
          expect(onErrorSpy).not.toHaveBeenCalled();

          let initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData, keyId: null});

          let keyId1 = (new Uint8Array(1)).buffer;
          let keyId2 = (new Uint8Array(2)).buffer;

          // Expire both keys at once.
          session1.keyStatuses.forEach.and.callFake(function(callback) {
            callback(keyId1, 'expired');
            callback(keyId2, 'expired');
          });

          onKeyStatusSpy.and.callFake(function(statusMap) {
            // Both keys are expired, so we should have an error.
            expect(onErrorSpy).toHaveBeenCalled();
            // There should be exactly one error.
            expect(onErrorSpy.calls.count()).toEqual(1);
            let error = onErrorSpy.calls.argsFor(0)[0];
            shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.DRM,
                shaka.util.Error.Code.EXPIRED));

            // Ignore the next key status event, sleep for one second, then
            // check to see if another error fired.
            onKeyStatusSpy.and.stub();
            shaka.test.Util.delay(1).then(function() {
              // Still only one error.
              expect(onErrorSpy.calls.count()).toEqual(1);
              done();
            });
          });

          // Fire change events for both keys.
          session1.on['keystatuseschange']({target: session1});
          session1.on['keystatuseschange']({target: session1});
        }).catch(fail);
      });
    });  // describe('keystatuseschange')
  });  // describe('events')

  describe('update', function() {
    it('receives a license', async () => {
      let license = (new Uint8Array(0)).buffer;

      await initAndAttach();
      let initData = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});

      fakeNetEngine.setResponseValue('http://abc.drm/license', license);
      let message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.delay(0.5);
      expect(session1.update).toHaveBeenCalledWith(license);
    });

    it('uses clearKeys config to override DrmInfo', async () => {
      manifest.periods[0].variants[0].drmInfos[0].keySystem =
          'com.fake.NOT.clearkey';
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['org.w3.clearkey']));

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033',
      };
      drmEngine.configure(config);

      // Not mocked.  Run data through real data URI parser to ensure that it is
      // correctly formatted.
      fakeNetEngine.request.and.callFake(function(type, request) {
        const requestType = shaka.net.NetworkingEngine.RequestType.LICENSE;

        // A dummy progress callback.
        const progressUpdated = (elapsedMs, bytes, bytesRemaining) => {};

        // eslint-disable-next-line new-cap
        return shaka.net.DataUriPlugin(
            request.uris[0], request, requestType, progressUpdated);
      });

      await initAndAttach();
      let message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.delay(0.5);
      expect(session1.update.calls.count()).toBe(1);
      let licenseBuffer = session1.update.calls.argsFor(0)[0];
      let licenseJson =
          shaka.util.StringUtils.fromBytesAutoDetect(licenseBuffer);
      let license = JSON.parse(licenseJson);
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
      let initData = new Uint8Array(1);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});
      let message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.delay(0.5);
      expect(onEventSpy).toHaveBeenCalledWith(
          jasmine.objectContaining({type: 'drmsessionupdate'}));
    });

    it('dispatches an error if update fails', async () => {
      onErrorSpy.and.stub();

      let license = (new Uint8Array(0)).buffer;

      await initAndAttach();
      let initData = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});

      fakeNetEngine.setResponseValue('http://abc.drm/license', license);
      let message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.throwError('whoops!');

      await shaka.test.Util.delay(0.5);
      expect(onErrorSpy).toHaveBeenCalled();
      let error = onErrorSpy.calls.argsFor(0)[0];
      shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.DRM,
          shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
          'whoops!'));
    });
  });  // describe('update')

  describe('destroy', function() {
    it('tears down MediaKeys and active sessions', async () => {
      await initAndAttach();
      let initData1 = new Uint8Array(1);
      let initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

      let message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.delay(0.5);
      mockVideo.setMediaKeys.calls.reset();
      await drmEngine.destroy();
      expect(session1.close).toHaveBeenCalled();
      expect(session2.close).toHaveBeenCalled();
      expect(mockVideo.setMediaKeys).toHaveBeenCalledWith(null);
    });

    it('swallows errors when closing sessions', async () => {
      await initAndAttach();
      let initData1 = new Uint8Array(1);
      let initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

      let message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.delay(0.5);
      session1.close.and.returnValue(Promise.reject());
      session2.close.and.returnValue(Promise.reject());
      await drmEngine.destroy();
    });

    it('swallows errors when clearing MediaKeys', async () => {
      await initAndAttach();
      let initData1 = new Uint8Array(1);
      let initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

      let message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.delay(0.5);
      mockVideo.setMediaKeys.and.returnValue(Promise.reject());
      await drmEngine.destroy();
    });

    it('interrupts failing MediaKeys queries', async function() {
      // Hold the MediaKeys query:
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      requestMediaKeySystemAccessSpy.and.returnValue(p);

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      drmEngine.initForPlayback(
          variants, manifest.offlineSessionIds).catch(fail);

      // This flow should still return "success" when DrmEngine is destroyed.
      await shaka.test.Util.delay(1.0);
      // The first query has been made, which we are blocking.
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
      expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledWith(
          'drm.abc', jasmine.any(Array));
      await drmEngine.destroy();
      p.reject();  // Fail drm.abc.
      await shaka.test.Util.delay(1.5);
      // A second query was not made.
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
      expect(drmEngine.initialized()).toBe(false);
    });

    it('interrupts successful MediaKeys queries', async function() {
      // Hold the MediaKeys query:
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      requestMediaKeySystemAccessSpy.and.returnValue(p);

      // This flow should still return "success" when DrmEngine is destroyed.
      const variants = Periods.getAllVariantsFrom(manifest.periods);
      drmEngine.initForPlayback(
          variants, manifest.offlineSessionIds).catch(fail);

      await shaka.test.Util.delay(1.0);
      // The first query has been made, which we are blocking.
      expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
      expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledWith(
          'drm.abc', jasmine.any(Array));
      await drmEngine.destroy();
      p.resolve();  // Success for drm.abc.
      await shaka.test.Util.delay(1.5);
      // Due to the interruption, we never created MediaKeys.
      expect(drmEngine.keySystem()).toBe('');
      expect(drmEngine.initialized()).toBe(false);
    });

    it('interrupts successful calls to createMediaKeys', async function() {
      // Hold createMediaKeys:
      /** @type {!shaka.util.PublicPromise} */
      const p = new shaka.util.PublicPromise();
      mockMediaKeySystemAccess.createMediaKeys.and.returnValue(p);

      // This flow should still return "success" when DrmEngine is destroyed.
      const variants = Periods.getAllVariantsFrom(manifest.periods);
      drmEngine.initForPlayback(variants, manifest.offlineSessionIds);

      await shaka.test.Util.delay(1.0);
      // We are blocked on createMediaKeys:
      expect(mockMediaKeySystemAccess.createMediaKeys).toHaveBeenCalled();
      await drmEngine.destroy();
      p.resolve();  // Success for createMediaKeys().
      await shaka.test.Util.delay(1.5);
      // Due to the interruption, we never finished initialization.
      expect(drmEngine.initialized()).toBe(false);
    });

    it('interrupts failed calls to setMediaKeys', function(done) {
      // Hold setMediaKeys:
      let p1 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p1);

      // This chain should still return "success" when DrmEngine is destroyed.
      initAndAttach().catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // We are now blocked on setMediaKeys:
        expect(mockVideo.setMediaKeys.calls.count()).toBe(1);
        // DrmEngine.destroy also calls setMediaKeys.
        let p2 = new shaka.util.PublicPromise();
        mockVideo.setMediaKeys.and.returnValue(p2);
        // Set timeouts to complete these calls.
        shaka.test.Util.delay(0.5).then(p1.reject.bind(p1));   // Failure
        shaka.test.Util.delay(1.0).then(p2.resolve.bind(p2));  // Success
        return drmEngine.destroy();
      }).catch(fail).then(done);
    });

    it('interrupts successful calls to setMediaKeys', function(done) {
      // Hold setMediaKeys:
      let p1 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p1);

      // This chain should still return "success" when DrmEngine is destroyed.
      initAndAttach().catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // We are now blocked on setMediaKeys:
        expect(mockVideo.setMediaKeys.calls.count()).toBe(1);
        // DrmEngine.destroy also calls setMediaKeys.
        let p2 = new shaka.util.PublicPromise();
        mockVideo.setMediaKeys.and.returnValue(p2);
        // Set timeouts to complete these calls.
        shaka.test.Util.delay(0.5).then(p1.resolve.bind(p1));  // Success
        shaka.test.Util.delay(1.0).then(p2.resolve.bind(p2));  // Success
        return drmEngine.destroy();
      }).then(function() {
        // Due to the interruption, we never listened for 'encrypted' events.
        expect(mockVideo.on['encrypted']).toBe(undefined);
      }).catch(fail).then(done);
    });

    it('interrupts failed calls to setServerCertificate', function(done) {
      let cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      // Hold setServerCertificate:
      let p = new shaka.util.PublicPromise();
      mockMediaKeys.setServerCertificate.and.returnValue(p);

      // This chain should still return "success" when DrmEngine is destroyed.
      initAndAttach().catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // We are now blocked on setServerCertificate:
        expect(mockMediaKeys.setServerCertificate.calls.count()).toBe(1);
        return drmEngine.destroy();
      }).then(function() {
        p.reject();  // Fail setServerCertificate.
        return shaka.test.Util.delay(1.5);
      }).catch(fail).then(done);
    });

    it('interrupts successful calls to setServerCertificate', function(done) {
      let cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      // Hold setServerCertificate:
      let p = new shaka.util.PublicPromise();
      mockMediaKeys.setServerCertificate.and.returnValue(p);

      // This chain should still return "success" when DrmEngine is destroyed.
      initAndAttach().catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // We are now blocked on setServerCertificate:
        expect(mockMediaKeys.setServerCertificate.calls.count()).toBe(1);
        return drmEngine.destroy();
      }).then(function() {
        p.resolve();  // Success for setServerCertificate.
        return shaka.test.Util.delay(1.5);
      }).then(function() {
        // Due to the interruption, we never listened for 'encrypted' events.
        expect(mockVideo.on['encrypted']).toBe(undefined);
      }).catch(fail).then(done);
    });

    it('does not trigger errors if it fails generateRequest', function(done) {
      let p = new shaka.util.PublicPromise();
      session1.generateRequest.and.returnValue(p);

      initAndAttach().then(function() {
        let initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});

        // We are now blocked on generateRequest:
        expect(session1.generateRequest.calls.count()).toBe(1);

        return drmEngine.destroy();
      }).then(function() {
        p.reject();  // Fail generateRequest.
      }).catch(fail).then(done);
      // onError is a failure by default.
    });

    it('interrupts successful license requests', function(done) {
      let p = new shaka.util.PublicPromise();
      let operation = shaka.util.AbortableOperation.notAbortable(p);
      fakeNetEngine.request.and.returnValue(operation);

      initAndAttach().then(function() {
        let initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});

        let message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});
        session1.update.and.returnValue(Promise.resolve());

        // We are now blocked on the license request:
        expect(fakeNetEngine.request.calls.count()).toBe(1);
        expect(fakeNetEngine.request).toHaveBeenCalledWith(
            shaka.net.NetworkingEngine.RequestType.LICENSE,
            jasmine.anything());

        return drmEngine.destroy();
      }).then(function() {
        // Unblock the license request.
        p.resolve({data: (new Uint8Array(0)).buffer});
      }).then(function() {
        // Due to the interruption, we never updated the session.
        expect(session1.update).not.toHaveBeenCalled();
      }).catch(fail).then(done);
      // onError is a failure by default.
    });

    it('interrupts failed license requests', function(done) {
      let p = new shaka.util.PublicPromise();
      let operation = shaka.util.AbortableOperation.notAbortable(p);
      fakeNetEngine.request.and.returnValue(operation);

      initAndAttach().then(function() {
        let initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});

        let message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});
        session1.update.and.returnValue(Promise.resolve());

        // We are now blocked on the license request:
        expect(fakeNetEngine.request.calls.count()).toBe(1);
        expect(fakeNetEngine.request).toHaveBeenCalledWith(
            shaka.net.NetworkingEngine.RequestType.LICENSE,
            jasmine.anything());

        return drmEngine.destroy();
      }).then(function() {
        // Fail the license request.
        p.reject();
      }).catch(fail).then(done);
      // onError is a failure by default.
    });

    it('does not trigger errors if it fails update', function(done) {
      let p = new shaka.util.PublicPromise();
      session1.update.and.returnValue(p);

      initAndAttach().then(function() {
        let initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData1, keyId: null});

        let message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});

        return shaka.test.Util.delay(0.1);
      }).then(function() {
        // We are now blocked on update:
        expect(session1.update.calls.count()).toBe(1);
        return drmEngine.destroy();
      }).then(function() {
        // Fail the update.
        p.reject();
      }).catch(fail).then(done);
      // onError is a failure by default.
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
      const rejected = Promise.reject();
      rejected.catch(() => {});

      session1.close.and.returnValue(rejected);
      session2.close.and.returnValue(rejected);

      let initData1 = new Uint8Array(1);
      let initData2 = new Uint8Array(2);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData1, keyId: null});
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData2, keyId: null});

      // Still resolve these since we are mocking close and closed.  This
      // ensures DrmEngine is in the correct state.
      let message = new Uint8Array(0);
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());
      session2.on['message']({target: session2, message: message});
      session2.update.and.returnValue(Promise.resolve());

      await shaka.test.Util.delay(0.5);
      await drmEngine.destroy();
    });
  });  // describe('destroy')

  describe('getDrmInfo', function() {
    it('includes correct info', async () => {
      // Leave only one drmInfo
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addDrmInfo('drm.abc')
            .addVideo(1).mime('video/foo', 'vbar').encrypted(true)
            .addAudio(2).mime('audio/foo', 'abar').encrypted(true)
        .build();
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));

      // Key IDs in manifest
      manifest.periods[0].variants[0].drmInfos[0].keyIds[0] =
          'deadbeefdeadbeefdeadbeefdeadbeef';

      config.advanced['drm.abc'] = {
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        distinctiveIdentifierRequired: true,
        serverCertificate: null,
        individualizationServer: '',
        persistentStateRequired: true,
      };
      drmEngine.configure(config);

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
      expect(drmEngine.initialized()).toBe(true);
      let drmInfo = drmEngine.getDrmInfo();
      expect(drmInfo).toEqual({
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: undefined,
        initData: [],
        keyIds: ['deadbeefdeadbeefdeadbeefdeadbeef'],
      });
    });
  });  // describe('getDrmInfo')

  describe('getCommonDrmInfos', function() {
    it('returns one array if the other is empty', () => {
      let drmInfo = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: undefined,
        initData: [],
        keyIds: ['deadbeefdeadbeefdeadbeefdeadbeef'],
      };
      let returnedOne = shaka.media.DrmEngine.getCommonDrmInfos([drmInfo], []);
      let returnedTwo = shaka.media.DrmEngine.getCommonDrmInfos([], [drmInfo]);
      expect(returnedOne).toEqual([drmInfo]);
      expect(returnedTwo).toEqual([drmInfo]);
    });

    it('merges drmInfos if two exist', () => {
      let serverCert = new Uint8Array(0);
      let drmInfoVideo = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: false,
        persistentStateRequired: true,
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: serverCert,
        initData: ['blah'],
        keyIds: ['deadbeefdeadbeefdeadbeefdeadbeef'],
      };
      let drmInfoAudio = {
        keySystem: 'drm.abc',
        licenseServerUri: undefined,
        distinctiveIdentifierRequired: true,
        persistentStateRequired: false,
        audioRobustness: 'good',
        serverCertificate: undefined,
        initData: ['init data'],
        keyIds: ['eadbeefdeadbeefdeadbeefdeadbeefd'],
      };
      let drmInfoDesired = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: serverCert,
        initData: ['blah', 'init data'],
        keyIds: ['deadbeefdeadbeefdeadbeefdeadbeef',
                 'eadbeefdeadbeefdeadbeefdeadbeefd'],
      };
      let returned = shaka.media.DrmEngine.getCommonDrmInfos([drmInfoVideo],
          [drmInfoAudio]);
      expect(returned).toEqual([drmInfoDesired]);
    });
  }); // describe('getCommonDrmInfos')

  describe('configure', function() {
    it('delays initial license requests if configured to', async () => {
      config.delayLicenseRequestUntilPlayed = true;
      drmEngine.configure(config);
      mockVideo.paused = true;

      await initAndAttach();
      let initData = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});

      let operation = shaka.util.AbortableOperation.completed({});
      fakeNetEngine.request.and.returnValue(operation);
      let message = new Uint8Array(0);
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
      let initData = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});

      let operation = shaka.util.AbortableOperation.completed({});
      fakeNetEngine.request.and.returnValue(operation);
      let message = new Uint8Array(0);
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
      expect(fakeNetEngine.request.calls.count()).toBe(1);
    });
  }); // describe('configure')

  describe('removeSession', function() {
    /** @type {!shaka.util.PublicPromise} */
    let updatePromise;

    beforeEach(async () => {
      session1.load.and.returnValue(Promise.resolve(true));

      // When remove() is called, it should resolve quickly and raise a
      // 'message' event of type 'license-release'.  The removeSessions method
      // should wait until update() is complete with the response.
      updatePromise = new shaka.util.PublicPromise();
      session1.remove.and.callFake(function() {
        // Raise the event synchronously, even though it doesn't normally.
        session1.on['message']({target: session1, message: new ArrayBuffer(0)});
        session1.update.and.returnValue(updatePromise);
        return Promise.resolve();
      });

      const variants = Periods.getAllVariantsFrom(manifest.periods);
      await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
    });

    it('waits until update() is complete', async () => {
      shaka.test.Util.delay(0.3).then(
          updatePromise.resolve.bind(updatePromise));

      await drmEngine.removeSession('abc');
      expect(session1.update).toHaveBeenCalled();
    });

    it('is rejected when network request fails', async () => {
      let p = fakeNetEngine.delayNextRequest();
      let networkError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);
      p.reject(networkError);
      onErrorSpy.and.stub();

      try {
        await drmEngine.removeSession('abc');
        fail();
      } catch (error) {
        shaka.test.Util.expectToEqualError(
            error,
            new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.DRM,
                shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
                networkError));
        expect(session1.update).not.toHaveBeenCalled();
      }
    });

    it('is rejected when update() is rejected', async () => {
      updatePromise.reject({message: 'Error'});
      onErrorSpy.and.stub();

      try {
        await drmEngine.removeSession('abc');
        fail();
      } catch (error) {
        shaka.test.Util.expectToEqualError(
            error,
            new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.DRM,
                shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
                'Error'));
      }
    });
  });

  describe('expiration', function() {
    beforeAll(function() {
      jasmine.clock().install();
    });

    afterAll(function() {
      jasmine.clock().uninstall();
    });

    beforeEach(async () => {
      session1.sessionId = 'abc';
      session1.expiration = NaN;

      await initAndAttach();
      let initData = new Uint8Array(0);
      let message = new Uint8Array(0);
      mockVideo.on['encrypted'](
          {initDataType: 'webm', initData: initData, keyId: null});
      session1.on['message']({target: session1, message: message});
      session1.update.and.returnValue(Promise.resolve());

      jasmine.clock().tick(1000);
    });

    it('calls the callback when the expiration changes', function() {
      onExpirationSpy.calls.reset();

      session1.expiration = 10000;
      jasmine.clock().tick(1000);
      expect(onExpirationSpy).toHaveBeenCalledTimes(1);
      expect(onExpirationSpy).toHaveBeenCalledWith(session1.sessionId, 10000);

      onExpirationSpy.calls.reset();
      session1.expiration = 50;
      jasmine.clock().tick(1000);
      expect(onExpirationSpy).toHaveBeenCalledTimes(1);
      expect(onExpirationSpy).toHaveBeenCalledWith(session1.sessionId, 50);

      onExpirationSpy.calls.reset();
      session1.expiration = NaN;
      jasmine.clock().tick(1000);
      expect(onExpirationSpy).toHaveBeenCalledTimes(1);
      expect(onExpirationSpy)
          .toHaveBeenCalledWith(session1.sessionId, Infinity);
    });

    it('gets the current expiration times', function() {
      session1.expiration = NaN;
      expect(drmEngine.getExpiration()).toEqual(Infinity);
      session1.expiration = 12345;
      expect(drmEngine.getExpiration()).toEqual(12345);
    });
  });

  async function initAndAttach() {
    const variants = Periods.getAllVariantsFrom(manifest.periods);
    await drmEngine.initForPlayback(variants, manifest.offlineSessionIds);
    await drmEngine.attach(mockVideo);
  }

  function fakeRequestMediaKeySystemAccess(acceptableKeySystems, keySystem) {
    if (!acceptableKeySystems.includes(keySystem)) {
      return Promise.reject();
    }
    mockMediaKeySystemAccess.keySystem = keySystem;
    return Promise.resolve(mockMediaKeySystemAccess);
  }

  function createMockMediaKeySystemAccess() {
    let mksa = {
      keySystem: '',
      getConfiguration: jasmine.createSpy('getConfiguration'),
      createMediaKeys: jasmine.createSpy('createMediaKeys'),
    };
    mksa.getConfiguration.and.callFake(function() {
      return {
        audioCapabilities: [{contentType: 'audio/webm'}],
        videoCapabilities: [{contentType: 'video/mp4; codecs="fake"'}],
      };
    });
    mksa.createMediaKeys.and.callFake(function() {
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
    let session = {
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
    session.addEventListener.and.callFake(function(name, callback) {
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
      videoRobustness: '',
    };
  }

  /**
   * @suppress {visibility}
   * @return {number}
   */
  function keyStatusBatchTime() {
    return shaka.media.DrmEngine.KEY_STATUS_BATCH_TIME_;
  }
});
