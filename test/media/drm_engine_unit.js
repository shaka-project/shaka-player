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
  /** @type {shakaExtern.Manifest} */
  let manifest;
  /** @type {shakaExtern.DrmConfiguration} */
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

  beforeAll(function() {
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
  });

  beforeEach(function() {
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0)
          .addDrmInfo('drm.abc')
          .addDrmInfo('drm.def')
          .addVideo(1).mime('video/foo', 'vbar').encrypted(true)
          .addAudio(2).mime('audio/foo', 'abar').encrypted(true)
      .build();

    // Reset spies.
    requestMediaKeySystemAccessSpy.calls.reset();
    onErrorSpy.calls.reset();
    logErrorSpy.calls.reset();
    onKeyStatusSpy.calls.reset();
    onExpirationSpy.calls.reset();
    onEventSpy.calls.reset();

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

    let retryParameters = shaka.net.NetworkingEngine.defaultRetryParameters();
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    license = (new Uint8Array(0)).buffer;
    fakeNetEngine.setResponseMap({'http://abc.drm/license': license});

    let playerInterface = {
      netEngine: fakeNetEngine,
      onError: shaka.test.Util.spyFunc(onErrorSpy),
      onKeyStatus: shaka.test.Util.spyFunc(onKeyStatusSpy),
      onExpirationUpdated: shaka.test.Util.spyFunc(onExpirationSpy),
      onEvent: shaka.test.Util.spyFunc(onEventSpy)
    };

    drmEngine = new shaka.media.DrmEngine(playerInterface);
    config = {
      retryParameters: retryParameters,
      delayLicenseRequestUntilPlayed: false,
      servers: {
        'drm.abc': 'http://abc.drm/license',
        'drm.def': 'http://def.drm/license'
      },
      advanced: {},
      clearKeys: {}
    };
    drmEngine.configure(config);
  });

  afterEach(function(done) {
    drmEngine.destroy().then(done);
  });

  afterAll(function() {
    navigator.requestMediaKeySystemAccess =
        originalRequestMediaKeySystemAccess;
    shaka.log.error = originalLogError;
  });

  describe('init', function() {
    it('stops on first available key system', function(done) {
      // Accept both drm.abc and drm.def.  Only one can be chosen.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc', 'drm.def']));

      drmEngine.init(manifest, /* offline */ false).then(function() {
        expect(drmEngine.initialized()).toBe(true);
        expect(drmEngine.keySystem()).toBe('drm.abc');

        // Only one call, since the first key system worked.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
      }).catch(fail).then(done);
    });

    it('tries systems in the order they appear in', function(done) {
      // Fail both key systems.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      drmEngine.init(manifest, /* offline */ false).then(fail, function() {
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        // These should be in the same order as the key systems appear in the
        // manifest.
        let calls = requestMediaKeySystemAccessSpy.calls;
        expect(calls.argsFor(0)[0]).toBe('drm.abc');
        expect(calls.argsFor(1)[0]).toBe('drm.def');
      }).then(done);
    });

    it('tries systems with configured license servers first', function(done) {
      // Fail both key systems.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      // Remove the server URI for drm.abc, which appears first in the manifest.
      delete config.servers['drm.abc'];
      drmEngine.configure(config);
      // Ignore error logs, which we expect to occur due to the missing server.
      logErrorSpy.and.stub();

      drmEngine.init(manifest, /* offline */ false).then(fail, function() {
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        // Although drm.def appears second in the manifest, it is queried first
        // because it has a server configured.
        let calls = requestMediaKeySystemAccessSpy.calls;
        expect(calls.argsFor(0)[0]).toBe('drm.def');
        expect(calls.argsFor(1)[0]).toBe('drm.abc');
      }).then(done);
    });

    it('detects content type capabilities of key system', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));

      drmEngine.init(manifest, /* offline */ false).then(function() {
        expect(drmEngine.initialized()).toBe(true);
        let supportedTypes = drmEngine.getSupportedTypes();
        // This is conditional because Edge 14 has a bug that prevents us from
        // getting the types at all.  TODO: Remove the condition once Edge has
        // released a fix for https://goo.gl/qMeV7v
        if (supportedTypes) {
          expect(supportedTypes).toEqual([
            'audio/webm', 'video/mp4; codecs="fake"'
          ]);
        }
      }).catch(fail).then(done);
    });

    it('tries the second key system if the first fails', function(done) {
      // Accept drm.def, but not drm.abc.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.def']));

      drmEngine.init(manifest, /* offline */ false).then(function() {
        expect(drmEngine.initialized()).toBe(true);
        expect(drmEngine.keySystem()).toBe('drm.def');

        // Both key systems were tried, since the first one failed.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', jasmine.any(Object));
      }).catch(fail).then(done);
    });

    it('fails to initialize if no key systems are available', function(done) {
      // Accept no key systems.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      drmEngine.init(manifest, false).then(fail).catch(function(error) {
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
      }).then(done);
    });

    it('silences errors for unencrypted assets', function(done) {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .addVideo(1).mime('video/foo', 'vbar')
            .addAudio(2).mime('audio/foo', 'abar')
        .build();

      // Accept no key systems.
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      drmEngine.init(manifest, false).then(function() {
        // Both key systems were tried, since the first one failed.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', jasmine.any(Object));
      }).catch(fail).then(done);
    });

    it('fails to initialize if no key systems are recognized', function(done) {
      // Simulate the DASH parser inserting a blank placeholder when only
      // unrecognized custom schemes are found.
      manifest.periods[0].variants[0].drmInfos[0].keySystem = '';
      manifest.periods[0].variants[0].drmInfos[1].keySystem = '';

      drmEngine.init(manifest, false).then(fail).catch(function(error) {
        expect(drmEngine.initialized()).toBe(false);

        // No key systems were tried, since the dummy placeholder was detected.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(0);

        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.NO_RECOGNIZED_KEY_SYSTEMS));
      }).then(done);
    });

    it('fails to initialize if the CDM cannot be created', function(done) {
      // The query succeeds, but we fail to create the CDM.
      mockMediaKeySystemAccess.createMediaKeys.and.throwError('whoops!');

      drmEngine.init(manifest, false).then(fail).catch(function(error) {
        expect(drmEngine.initialized()).toBe(false);

        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', jasmine.any(Object));
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_CREATE_CDM,
            'whoops!'));
      }).then(done);
    });

    it('queries audio/video capabilities', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      drmEngine.init(manifest, /* offline */ false).then(fail, function() {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              // audioCapabilities not present.
              videoCapabilities: [jasmine.objectContaining({
                contentType: 'video/foo; codecs="vbar"'
              })],
              distinctiveIdentifier: 'optional',
              persistentState: 'optional',
              sessionTypes: ['temporary']
            })]);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', [jasmine.objectContaining({
              audioCapabilities: [jasmine.objectContaining({
                contentType: 'audio/foo; codecs="abar"'
              })],
              // videoCapabilities not present.
              distinctiveIdentifier: 'optional',
              persistentState: 'optional',
              sessionTypes: ['temporary']
            })]);
      }).then(done);
    });

    it('asks for persistent state and license for offline', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      drmEngine.init(manifest, /* offline */ true).then(fail, function() {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              distinctiveIdentifier: 'optional',
              persistentState: 'required',
              sessionTypes: ['persistent-license']
            })]);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', [jasmine.objectContaining({
              distinctiveIdentifier: 'optional',
              persistentState: 'required',
              sessionTypes: ['persistent-license']
            })]);
      }).then(done);
    });

    it('honors distinctive identifier and persistent state', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      manifest.periods[0].variants[0].drmInfos[0]
          .distinctiveIdentifierRequired = true;
      manifest.periods[0].variants[0].drmInfos[1]
          .persistentStateRequired = true;

      drmEngine.init(manifest, /* offline */ false).then(fail, function() {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(2);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              distinctiveIdentifier: 'required',
              persistentState: 'optional',
              sessionTypes: ['temporary']
            })]);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.def', [jasmine.objectContaining({
              distinctiveIdentifier: 'optional',
              persistentState: 'required',
              sessionTypes: ['temporary']
            })]);
      }).then(done);
    });

    it('makes no queries for clear content if no key config', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      manifest.periods[0].variants[0].drmInfos = [];
      config.servers = {};
      config.advanced = {};

      drmEngine.configure(config);
      drmEngine.init(manifest, /* offline */ false).then(function() {
        expect(drmEngine.initialized()).toBe(true);
        expect(drmEngine.keySystem()).toBe('');
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(0);
      }).catch(fail).then(done);
    });

    it('makes queries for clear content if key is configured', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));
      manifest.periods[0].variants[0].drmInfos = [];
      config.servers = {
        'drm.abc': 'http://abc.drm/license'
      };

      drmEngine.configure(config);
      drmEngine.init(manifest, /* offline */ false).then(function() {
        expect(drmEngine.initialized()).toBe(true);
        expect(drmEngine.keySystem()).toBe('drm.abc');
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
      }).then(done);
    });

    it('uses advanced config to override DrmInfo fields', function(done) {
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
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true
      };
      drmEngine.configure(config);

      drmEngine.init(manifest, /* offline */ false).then(fail, function() {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              audioCapabilities: [jasmine.objectContaining({
                robustness: 'good'
              })],
              videoCapabilities: [jasmine.objectContaining({
                robustness: 'really_really_ridiculously_good'
              })],
              distinctiveIdentifier: 'required',
              persistentState: 'required'
            })]);
      }).then(done);
    });

    it('does not use config if DrmInfo already filled out', function(done) {
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
        distinctiveIdentifierRequired: false,
        persistentStateRequired: false
      };
      drmEngine.configure(config);

      drmEngine.init(manifest, /* offline */ false).then(fail, function() {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              audioCapabilities: [jasmine.objectContaining({
                robustness: 'good'
              })],
              videoCapabilities: [jasmine.objectContaining({
                robustness: 'really_really_ridiculously_good'
              })],
              distinctiveIdentifier: 'required',
              persistentState: 'required'
            })]);
      }).then(done);
    });

    it('fails if license server is not configured', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));

      config.servers = {};
      drmEngine.configure(config);

      drmEngine.init(manifest, /* offline */ false).then(fail, function(error) {
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN));
      }).then(done);
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

    it('does nothing for unencrypted content', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      manifest.periods[0].variants[0].drmInfos = [];
      config.servers = {};
      config.advanced = {};

      initAndAttach().then(function() {
        expect(mockVideo.setMediaKeys).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('sets MediaKeys for encrypted content', function(done) {
      initAndAttach().then(function() {
        expect(mockVideo.setMediaKeys).toHaveBeenCalledWith(mockMediaKeys);
      }).catch(fail).then(done);
    });

    it('sets server certificate if present in config', function(done) {
      let cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      initAndAttach().then(function() {
        expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(cert);
      }).catch(fail).then(done);
    });

    it('prefers server certificate from DrmInfo', function(done) {
      let cert1 = new Uint8Array(5);
      let cert2 = new Uint8Array(1);
      manifest.periods[0].variants[0].drmInfos[0].serverCertificate = cert1;

      config.advanced['drm.abc'] = createAdvancedConfig(cert2);
      drmEngine.configure(config);

      initAndAttach().then(function() {
        expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(cert1);
      }).catch(fail).then(done);
    });

    it('does not set server certificate if absent', function(done) {
      initAndAttach().then(function() {
        expect(mockMediaKeys.setServerCertificate).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('creates sessions for init data overrides', function(done) {
      // Set up init data overrides in the manifest:
      let initData1 = new Uint8Array(5);
      let initData2 = new Uint8Array(0);
      let initData3 = new Uint8Array(10);
      manifest.periods[0].variants[0].drmInfos[0].initData = [
        {initData: initData1, initDataType: 'cenc', keyId: null},
        {initData: initData2, initDataType: 'webm', keyId: null},
        {initData: initData3, initDataType: 'cenc', keyId: null}
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
        {initData: initData3, initDataType: 'cenc', keyId: 'abc'}
      ];

      initAndAttach().then(function() {
        expect(mockMediaKeys.createSession.calls.count()).toBe(1);
        expect(session1.generateRequest).
            toHaveBeenCalledWith('cenc', initData1.buffer);
      }).catch(fail).then(done);
    });

    it('uses clearKeys config to override DrmInfo', function(done) {
      manifest.periods[0].variants[0].drmInfos[0].keySystem =
          'com.fake.NOT.clearkey';

      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['org.w3.clearkey']));

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033'
      };
      drmEngine.configure(config);

      let session = createMockSession();
      mockMediaKeys.createSession.and.callFake(function() {
        expect(mockMediaKeys.createSession.calls.count()).toBe(1);
        return session;
      });

      initAndAttach().then(function() {
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
      }).catch(fail).then(done);
    });

    it('fails with an error if setMediaKeys fails', function(done) {
      // Fail setMediaKeys.
      mockVideo.setMediaKeys.and.returnValue(Promise.reject({
        message: 'whoops!'
      }));

      initAndAttach().then(fail).catch(function(error) {
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
            'whoops!'));
      }).then(done);
    });

    it('fails with an error if setServerCertificate fails', function(done) {
      let cert = new Uint8Array(1);
      config.advanced['drm.abc'] = createAdvancedConfig(cert);
      drmEngine.configure(config);

      // Fail setServerCertificate.
      mockMediaKeys.setServerCertificate.and.returnValue(Promise.reject({
        message: 'whoops!'
      }));

      initAndAttach().then(fail).catch(function(error) {
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
            'whoops!'));
      }).then(done);
    });

    it('dispatches an error if generateRequest fails', function(done) {
      // Set up an init data override in the manifest to get an immediate call
      // to generateRequest:
      let initData1 = new Uint8Array(5);
      manifest.periods[0].variants[0].drmInfos[0].initData = [
        {initData: initData1, initDataType: 'cenc', keyId: null}
      ];

      // Fail generateRequest.
      let session1 = createMockSession();

      const nativeError = {message: 'whoops!'};
      session1.generateRequest.and.returnValue(Promise.reject(nativeError));

      mockMediaKeys.createSession.and.returnValue(session1);

      onErrorSpy.and.stub();
      initAndAttach().then(function() {
        expect(onErrorSpy).toHaveBeenCalled();
        let error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_GENERATE_LICENSE_REQUEST,
            nativeError.message, nativeError, undefined));
      }).catch(fail).then(done);
    });
  });  // describe('attach')

  describe('events', function() {
    describe('encrypted', function() {
      it('is listened for', function(done) {
        initAndAttach().then(function() {
          expect(mockVideo.addEventListener).toHaveBeenCalledWith(
              'encrypted', jasmine.any(Function), false);
        }).catch(fail).then(done);
      });

      it('triggers the creation of a session', function(done) {
        initAndAttach().then(function() {
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
        }).catch(fail).then(done);
      });

      it('suppresses duplicate initDatas', function(done) {
        initAndAttach().then(function() {
          let initData1 = new Uint8Array(1);
          let initData2 = new Uint8Array(1);  // identical to initData1

          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData1, keyId: null});
          mockVideo.on['encrypted'](
              {initDataType: 'cenc', initData: initData2, keyId: null});

          expect(mockMediaKeys.createSession.calls.count()).toBe(1);
          expect(session1.generateRequest).
              toHaveBeenCalledWith('webm', initData1.buffer);
        }).catch(fail).then(done);
      });

      it('is ignored when init data is in DrmInfo', function(done) {
        // Set up an init data override in the manifest:
        manifest.periods[0].variants[0].drmInfos[0].initData = [
          {initData: new Uint8Array(0), initDataType: 'cenc', keyId: null}
        ];

        initAndAttach().then(function() {
          // We already created a session for the init data override.
          expect(mockMediaKeys.createSession.calls.count()).toBe(1);
          // We aren't even listening for 'encrypted' events.
          expect(mockVideo.on['encrypted']).toBe(undefined);
        }).catch(fail).then(done);
      });

      it('dispatches an error if createSession fails', function(done) {
        mockMediaKeys.createSession.and.throwError('whoops!');
        onErrorSpy.and.stub();

        initAndAttach().then(function() {
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
        }).catch(fail).then(done);
      });

      it('dispatches an error if manifest says unencrypted', function(done) {
        manifest.periods[0].variants[0].drmInfos = [];
        config.servers = {};
        config.advanced = {};

        onErrorSpy.and.stub();

        initAndAttach().then(function() {
          let initData1 = new Uint8Array(1);
          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData1, keyId: null});

          expect(onErrorSpy).toHaveBeenCalled();
          let error = onErrorSpy.calls.argsFor(0)[0];
          shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.DRM,
              shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
        }).catch(fail).then(done);
      });
    });  // describe('encrypted')

    describe('message', function() {
      it('is listened for', function(done) {
        initAndAttach().then(function() {
          let initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData, keyId: null});

          expect(session1.addEventListener).toHaveBeenCalledWith(
              'message', jasmine.any(Function), false);
        }).catch(fail).then(done);
      });

      it('triggers a license request', function(done) {
        initAndAttach().then(function() {
          let initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData, keyId: null});

          let operation = shaka.util.AbortableOperation.completed({});
          fakeNetEngine.request.and.returnValue(operation);
          let message = new Uint8Array(0);
          session1.on['message']({target: session1, message: message});

          expect(fakeNetEngine.request).toHaveBeenCalledWith(
              shaka.net.NetworkingEngine.RequestType.LICENSE,
              jasmine.objectContaining({
                uris: ['http://abc.drm/license'],
                method: 'POST',
                body: message
              }));
        }).catch(fail).then(done);
      });

      it('prefers a license server URI from DrmInfo', function(done) {
        manifest.periods[0].variants[0].drmInfos[0].licenseServerUri =
            'http://foo.bar/drm';

        initAndAttach().then(function() {
          let initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData, keyId: null});

          let operation = shaka.util.AbortableOperation.completed({});
          fakeNetEngine.request.and.returnValue(operation);
          let message = new Uint8Array(0);
          session1.on['message']({target: session1, message: message});

          expect(fakeNetEngine.request).toHaveBeenCalledWith(
              shaka.net.NetworkingEngine.RequestType.LICENSE,
              jasmine.objectContaining({uris: ['http://foo.bar/drm']}));
        }).catch(fail).then(done);
      });

      it('dispatches an error if license request fails', function(done) {
        onErrorSpy.and.stub();

        initAndAttach().then(function() {
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
          return shaka.test.Util.delay(0.5);
        }).then(function() {
          expect(onErrorSpy).toHaveBeenCalled();
          let error = onErrorSpy.calls.argsFor(0)[0];
          shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.DRM,
              shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
              jasmine.objectContaining({
                category: shaka.util.Error.Category.NETWORK,
                code: shaka.util.Error.Code.BAD_HTTP_STATUS,
                data: ['http://abc.drm/license', 403]
              })));
        }).catch(fail).then(done);
      });
    });  // describe('message')

    describe('keystatuseschange', function() {
      it('is listened for', function(done) {
        initAndAttach().then(function() {
          let initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              {initDataType: 'webm', initData: initData, keyId: null});

          expect(session1.addEventListener).toHaveBeenCalledWith(
              'keystatuseschange', jasmine.any(Function), false);
        }).catch(fail).then(done);
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
              '0000': status2
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
    it('receives a license', function(done) {
      let license = (new Uint8Array(0)).buffer;

      initAndAttach().then(function() {
        let initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

        fakeNetEngine.setResponseMap({'http://abc.drm/license': license});
        let message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});
        session1.update.and.returnValue(Promise.resolve());

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(session1.update).toHaveBeenCalledWith(license);
      }).catch(fail).then(done);
    });

    it('uses clearKeys config to override DrmInfo', function(done) {
      manifest.periods[0].variants[0].drmInfos[0].keySystem =
          'com.fake.NOT.clearkey';
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['org.w3.clearkey']));

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033'
      };
      drmEngine.configure(config);

      // Not mocked.  Run data through real data URI parser to ensure that it is
      // correctly formatted.
      fakeNetEngine.request.and.callFake(function(type, request) {
        return shaka.net.DataUriPlugin(request.uris[0], request);
      });

      initAndAttach().then(function() {
        let message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});
        session1.update.and.returnValue(Promise.resolve());
        return shaka.test.Util.delay(0.5);
      }).then(function() {
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
              k: 'AwUHATAjAyBCAQgEJQmAMw', kty: 'oct'}
          ]
        });
      }).catch(fail).then(done);
    });

    it('publishes an event if update succeeds', function(done) {
      initAndAttach().then(function() {
        let initData = new Uint8Array(1);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});
        let message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});
        session1.update.and.returnValue(Promise.resolve());

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onEventSpy).toHaveBeenCalledWith(
            jasmine.objectContaining({type: 'drmsessionupdate'}));
        done();
      }).catch(fail);
    });

    it('dispatches an error if update fails', function(done) {
      onErrorSpy.and.stub();

      let license = (new Uint8Array(0)).buffer;

      initAndAttach().then(function() {
        let initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});

        fakeNetEngine.setResponseMap({'http://abc.drm/license': license});
        let message = new Uint8Array(0);
        session1.on['message']({target: session1, message: message});
        session1.update.and.throwError('whoops!');

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onErrorSpy).toHaveBeenCalled();
        let error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
            'whoops!'));
      }).catch(fail).then(done);
    });
  });  // describe('update')

  describe('destroy', function() {
    it('tears down MediaKeys and active sessions', function(done) {
      initAndAttach().then(function() {
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

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        mockVideo.setMediaKeys.calls.reset();
        return drmEngine.destroy();
      }).then(function() {
        expect(session1.close).toHaveBeenCalled();
        expect(session2.close).toHaveBeenCalled();
        expect(mockVideo.setMediaKeys).toHaveBeenCalledWith(null);
      }).catch(fail).then(done);
    });

    it('swallows errors when closing sessions', function(done) {
      initAndAttach().then(function() {
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

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        session1.close.and.returnValue(Promise.reject());
        session2.close.and.returnValue(Promise.reject());
        return drmEngine.destroy();
      }).catch(fail).then(done);
    });

    it('swallows errors when clearing MediaKeys', function(done) {
      initAndAttach().then(function() {
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

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        mockVideo.setMediaKeys.and.returnValue(Promise.reject());
        return drmEngine.destroy();
      }).catch(fail).then(done);
    });

    it('interrupts failing MediaKeys queries', function(done) {
      // Hold the MediaKeys query:
      let p = new shaka.util.PublicPromise();
      requestMediaKeySystemAccessSpy.and.returnValue(p);

      // This chain should still return "success" when DrmEngine is destroyed.
      drmEngine.init(manifest, /* offline */ false).catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // The first query has been made, which we are blocking.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledWith(
            'drm.abc', jasmine.any(Array));
        return drmEngine.destroy();
      }).then(function() {
        p.reject();  // Fail drm.abc.
        return shaka.test.Util.delay(1.5);
      }).then(function() {
        // A second query was not made.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(drmEngine.initialized()).toBe(false);
      }).catch(fail).then(done);
    });

    it('interrupts successful MediaKeys queries', function(done) {
      // Hold the MediaKeys query:
      let p = new shaka.util.PublicPromise();
      requestMediaKeySystemAccessSpy.and.returnValue(p);

      // This chain should still return "success" when DrmEngine is destroyed.
      drmEngine.init(manifest, /* offline */ false).catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // The first query has been made, which we are blocking.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(requestMediaKeySystemAccessSpy).toHaveBeenCalledWith(
            'drm.abc', jasmine.any(Array));
        return drmEngine.destroy();
      }).then(function() {
        p.resolve();  // Success for drm.abc.
        return shaka.test.Util.delay(1.5);
      }).then(function() {
        // Due to the interruption, we never created MediaKeys.
        expect(drmEngine.keySystem()).toBe('');
        expect(drmEngine.initialized()).toBe(false);
      }).catch(fail).then(done);
    });

    it('interrupts successful calls to createMediaKeys', function(done) {
      // Hold createMediaKeys:
      let p = new shaka.util.PublicPromise();
      mockMediaKeySystemAccess.createMediaKeys.and.returnValue(p);

      // This chain should still return "success" when DrmEngine is destroyed.
      drmEngine.init(manifest, /* offline */ false).catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // We are blocked on createMediaKeys:
        expect(mockMediaKeySystemAccess.createMediaKeys).toHaveBeenCalled();
        return drmEngine.destroy();
      }).then(function() {
        p.resolve();  // Success for createMediaKeys().
        return shaka.test.Util.delay(1.5);
      }).then(function() {
        // Due to the interruption, we never finished initialization.
        expect(drmEngine.initialized()).toBe(false);
      }).catch(fail).then(done);
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

    it('still completes if session is not callable', function(done) {
      // Before, we would use |session.closed| as part of destroy().  However,
      // this doesn't work if the session is not callable (no license request
      // sent).  So |session.closed| should never resolve and |session.close()|
      // should be rejected and destroy() should still succeed.
      // https://github.com/google/shaka-player/issues/664
      initAndAttach().then(function() {
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

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        return drmEngine.destroy();
      }).catch(fail).then(done);
    });
  });  // describe('destroy')

  describe('getDrmInfo', function() {
    it('includes correct info', function(done) {
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
        persistentStateRequired: true
      };
      drmEngine.configure(config);

      drmEngine.init(manifest, /* offline */ false).then(function() {
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
          keyIds: ['deadbeefdeadbeefdeadbeefdeadbeef']
        });
      }).catch(fail).then(done);
    });
  });  // describe('getDrmInfo')

  describe('getCommonDrmInfos', function() {
    it('returns one array if the other is empty', function(done) {
      let drmInfo = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true,
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: undefined,
        initData: [],
        keyIds: ['deadbeefdeadbeefdeadbeefdeadbeef']
      };
      let returnedOne = shaka.media.DrmEngine.getCommonDrmInfos([drmInfo], []);
      let returnedTwo = shaka.media.DrmEngine.getCommonDrmInfos([], [drmInfo]);
      expect(returnedOne).toEqual([drmInfo]);
      expect(returnedTwo).toEqual([drmInfo]);
      done();
    });

    it('merges drmInfos if two exist', function(done) {
      let serverCert = new Uint8Array(0);
      let drmInfoVideo = {
        keySystem: 'drm.abc',
        licenseServerUri: 'http://abc.drm/license',
        distinctiveIdentifierRequired: false,
        persistentStateRequired: true,
        videoRobustness: 'really_really_ridiculously_good',
        serverCertificate: serverCert,
        initData: ['blah'],
        keyIds: ['deadbeefdeadbeefdeadbeefdeadbeef']
      };
      let drmInfoAudio = {
        keySystem: 'drm.abc',
        licenseServerUri: undefined,
        distinctiveIdentifierRequired: true,
        persistentStateRequired: false,
        audioRobustness: 'good',
        serverCertificate: undefined,
        initData: ['init data'],
        keyIds: ['eadbeefdeadbeefdeadbeefdeadbeefd']
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
                 'eadbeefdeadbeefdeadbeefdeadbeefd']
      };
      let returned = shaka.media.DrmEngine.getCommonDrmInfos([drmInfoVideo],
          [drmInfoAudio]);
      expect(returned).toEqual([drmInfoDesired]);
      done();
    });
  }); // describe('getCommonDrmInfos')

  describe('configure', function() {
    it('delays initial license requests if configured to', function(done) {
      config.delayLicenseRequestUntilPlayed = true;
      drmEngine.configure(config);
      mockVideo.paused = true;

      initAndAttach().then(function() {
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
              body: message
            }));
      }).catch(fail).then(done);
    });

    it('does not delay license renewal requests', function(done) {
      config.delayLicenseRequestUntilPlayed = true;
      drmEngine.configure(config);
      mockVideo.paused = true;

      initAndAttach().then(function() {
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
              body: message
            }));

        fakeNetEngine.request.calls.reset();

        mockVideo.paused = true;
        session1.on['message']({target: session1, message: message});

        expect(fakeNetEngine.request).toHaveBeenCalledWith(
            shaka.net.NetworkingEngine.RequestType.LICENSE,
            jasmine.objectContaining({
              uris: ['http://abc.drm/license'],
              method: 'POST',
              body: message
            }));
        expect(fakeNetEngine.request.calls.count()).toBe(1);
      }).catch(fail).then(done);
    });
  }); // describe('configure')

  describe('removeSessions', function() {
    /** @type {!shaka.util.PublicPromise} */
    let updatePromise1;
    /** @type {!shaka.util.PublicPromise} */
    let updatePromise2;

    beforeEach(function(done) {
      session1.load.and.returnValue(Promise.resolve(true));
      session2.load.and.returnValue(Promise.resolve(true));

      // When remove() is called, it should resolve quickly and raise a
      // 'message' event of type 'license-release'.  The removeSessions method
      // should wait until update() is complete with the response.
      updatePromise1 = new shaka.util.PublicPromise();
      updatePromise2 = new shaka.util.PublicPromise();
      session1.remove.and.callFake(function() {
        // Raise the event synchronously, even though it doesn't normally.
        session1.on['message']({target: session1, message: new ArrayBuffer(0)});
        session1.update.and.returnValue(updatePromise1);
        return Promise.resolve();
      });
      session2.remove.and.callFake(function() {
        session2.on['message']({target: session2, message: new ArrayBuffer(0)});
        session2.update.and.returnValue(updatePromise2);
        return Promise.resolve();
      });

      drmEngine.init(manifest, /* offline */ true).catch(fail).then(done);
    });

    it('waits until update() is complete', function(done) {
      shaka.test.Util.delay(0.1).then(
          updatePromise1.resolve.bind(updatePromise1));
      shaka.test.Util.delay(0.3).then(
          updatePromise2.resolve.bind(updatePromise2));

      drmEngine.removeSessions(['abc', 'def']).then(function() {
        expect(session1.update).toHaveBeenCalled();
        expect(session2.update).toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('is rejected when network request fails', function(done) {
      let p = fakeNetEngine.delayNextRequest();
      let networkError = new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.NETWORK,
          shaka.util.Error.Code.BAD_HTTP_STATUS);
      p.reject(networkError);
      onErrorSpy.and.stub();

      drmEngine.removeSessions(['abc', 'def']).then(fail).catch(function(err) {
        shaka.test.Util.expectToEqualError(
            err,
            new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.DRM,
                shaka.util.Error.Code.LICENSE_REQUEST_FAILED,
                networkError));
        // The first session's request was rejected.
        expect(session1.update).not.toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('is rejected when update() is rejected', function(done) {
      updatePromise1.reject({message: 'Error'});
      onErrorSpy.and.stub();

      drmEngine.removeSessions(['abc', 'def']).then(fail).catch(function(err) {
        shaka.test.Util.expectToEqualError(
            err,
            new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.DRM,
                shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
                'Error'));
      }).catch(fail).then(done);
    });
  });

  describe('expiration', function() {
    beforeAll(function() {
      jasmine.clock().install();
    });

    afterAll(function() {
      jasmine.clock().uninstall();
    });

    beforeEach(function(done) {
      session1.sessionId = 'abc';
      session1.expiration = NaN;

      initAndAttach().then(function() {
        let initData = new Uint8Array(0);
        let message = new Uint8Array(0);
        mockVideo.on['encrypted'](
            {initDataType: 'webm', initData: initData, keyId: null});
        session1.on['message']({target: session1, message: message});
        session1.update.and.returnValue(Promise.resolve());

        jasmine.clock().tick(1000);
      }).catch(fail).then(done);
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

  function initAndAttach() {
    return drmEngine.init(manifest, /* offline */ false).then(function() {
      return drmEngine.attach(mockVideo);
    });
  }

  function fakeRequestMediaKeySystemAccess(acceptableKeySystems, keySystem) {
    if (acceptableKeySystems.indexOf(keySystem) < 0) {
      return Promise.reject();
    }
    mockMediaKeySystemAccess.keySystem = keySystem;
    return Promise.resolve(mockMediaKeySystemAccess);
  }

  function createMockMediaKeySystemAccess() {
    let mksa = {
      keySystem: '',
      getConfiguration: jasmine.createSpy('getConfiguration'),
      createMediaKeys: jasmine.createSpy('createMediaKeys')
    };
    mksa.getConfiguration.and.callFake(function() {
      return {
        audioCapabilities: [{contentType: 'audio/webm'}],
        videoCapabilities: [{contentType: 'video/mp4; codecs="fake"'}]
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
      setServerCertificate: jasmine.createSpy('setServerCertificate')
    };
  }

  function createMockSession() {
    let session = {
      expiration: NaN,
      closed: Promise.resolve(),
      keyStatuses: {
        forEach: jasmine.createSpy('forEach')
      },
      generateRequest: jasmine.createSpy('generateRequest'),
      load: jasmine.createSpy('load'),
      update: jasmine.createSpy('update'),
      close: jasmine.createSpy('close'),
      remove: jasmine.createSpy('remove'),
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      on: {}  // event listeners
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
   * @return {shakaExtern.AdvancedDrmConfiguration}
   */
  function createAdvancedConfig(serverCert) {
    return {
      audioRobustness: '',
      distinctiveIdentifierRequired: false,
      persistentStateRequired: false,
      serverCertificate: serverCert,
      videoRobustness: ''
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
