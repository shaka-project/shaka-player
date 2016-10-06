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
  var originalRequestMediaKeySystemAccess;
  var originalLogError;

  var requestMediaKeySystemAccessSpy;
  var logErrorSpy;
  var onErrorSpy;
  var onKeyStatusSpy;

  var fakeNetEngine;
  var drmEngine;
  var manifest;
  var config;

  var mockMediaKeySystemAccess;
  var mockMediaKeys;
  var mockVideo;

  var session1;
  var session2;
  var session3;
  var license;

  beforeAll(function() {
    originalRequestMediaKeySystemAccess =
        navigator.requestMediaKeySystemAccess;

    requestMediaKeySystemAccessSpy =
        jasmine.createSpy('requestMediaKeySystemAccess');
    navigator.requestMediaKeySystemAccess = requestMediaKeySystemAccessSpy;

    originalLogError = shaka.log.error;

    logErrorSpy = jasmine.createSpy('shaka.log.error');
    shaka.log.error = logErrorSpy;

    onErrorSpy = jasmine.createSpy('onError');
    onKeyStatusSpy = jasmine.createSpy('onKeyStatus');
  });

  beforeEach(function() {
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addStreamSet('video')
          .addDrmInfo('drm.abc')
          .addStream(0).mime('video/foo', 'vbar').encrypted(true)
        .addStreamSet('audio')
          .addDrmInfo('drm.def')
          .addStream(1).mime('audio/foo', 'abar').encrypted(true)
      .build();

    // Reset spies.
    requestMediaKeySystemAccessSpy.calls.reset();
    onErrorSpy.calls.reset();
    logErrorSpy.calls.reset();
    onKeyStatusSpy.calls.reset();

    // By default, error logs and callbacks result in failure.
    onErrorSpy.and.callFake(fail);
    logErrorSpy.and.callFake(fail);

    // By default, allow keysystem drm.abc
    requestMediaKeySystemAccessSpy.and.callFake(
        fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));

    mockVideo = createMockVideo();
    mockVideo.setMediaKeys.and.returnValue(Promise.resolve());

    session1 = createMockSession();
    session2 = createMockSession();
    session3 = createMockSession();

    mockMediaKeySystemAccess = createMockMediaKeySystemAccess();

    mockMediaKeys = createMockMediaKeys();
    mockMediaKeys.createSession.and.callFake(function() {
      var index = mockMediaKeys.createSession.calls.count() - 1;
      return [session1, session2, session3][index];
    });
    mockMediaKeys.setServerCertificate.and.returnValue(Promise.resolve());

    var retryParameters = shaka.net.NetworkingEngine.defaultRetryParameters();
    fakeNetEngine = new shaka.test.FakeNetworkingEngine();

    license = (new Uint8Array(0)).buffer;
    fakeNetEngine.setResponseMap({ 'http://abc.drm/license': license });

    drmEngine = new shaka.media.DrmEngine(
        fakeNetEngine, onErrorSpy, onKeyStatusSpy);
    config = {
      retryParameters: retryParameters,
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
        var calls = requestMediaKeySystemAccessSpy.calls;
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
        var calls = requestMediaKeySystemAccessSpy.calls;
        expect(calls.argsFor(0)[0]).toBe('drm.def');
        expect(calls.argsFor(1)[0]).toBe('drm.abc');
      }).then(done);
    });

    it('detects content type capabilities of key system', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));

      drmEngine.init(manifest, /* offline */ false).then(function() {
        expect(drmEngine.initialized()).toBe(true);
        expect(drmEngine.getSupportedTypes()).toEqual([
          'audio/webm', 'video/mp4; codecs="fake"'
        ]);
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
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE));
      }).then(done);
    });

    it('fails to initialize if no key systems are recognized', function(done) {
      // Simulate the DASH parser inserting a blank placeholder when only
      // unrecognized custom schemes are found.
      manifest.periods[0].streamSets[0].drmInfos[0].keySystem = '';
      manifest.periods[0].streamSets[1].drmInfos[0].keySystem = '';

      drmEngine.init(manifest, false).then(fail).catch(function(error) {
        expect(drmEngine.initialized()).toBe(false);

        // No key systems were tried, since the dummy placeholder was detected.
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(0);

        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
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
      manifest.periods[0].streamSets[0].drmInfos[0]
          .distinctiveIdentifierRequired = true;
      manifest.periods[0].streamSets[1].drmInfos[0]
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

    it('makes no queries for clear content', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      manifest.periods[0].streamSets[0].drmInfos = [];
      manifest.periods[0].streamSets[1].drmInfos = [];

      drmEngine.init(manifest, /* offline */ false).then(function() {
        expect(drmEngine.initialized()).toBe(true);
        expect(drmEngine.keySystem()).toBe('');
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(0);
      }).catch(fail).then(done);
    });

    it('combines capabilites for the same key system', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      // Both audio and video with the same key system now:
      manifest.periods[0].streamSets[1].drmInfos[0].keySystem = 'drm.abc';
      // And the audio stream set requires distinctive identifiers:
      manifest.periods[0].streamSets[1].drmInfos[0]
          .distinctiveIdentifierRequired = true;

      drmEngine.init(manifest, /* offline */ false).then(fail, function() {
        expect(drmEngine.initialized()).toBe(false);
        expect(requestMediaKeySystemAccessSpy.calls.count()).toBe(1);
        expect(requestMediaKeySystemAccessSpy)
            .toHaveBeenCalledWith('drm.abc', [jasmine.objectContaining({
              videoCapabilities: [jasmine.objectContaining({
                contentType: 'video/foo; codecs="vbar"'
              })],
              audioCapabilities: [jasmine.objectContaining({
                contentType: 'audio/foo; codecs="abar"'
              })],
              distinctiveIdentifier: 'required'
            })]);
      }).then(done);
    });

    it('uses advanced config to override DrmInfo fields', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      // Both audio and video with the same key system now:
      manifest.periods[0].streamSets[1].drmInfos[0].keySystem = 'drm.abc';

      config.advanced['drm.abc'] = {
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
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
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));

      // Both audio and video with the same key system now:
      manifest.periods[0].streamSets[1].drmInfos[0].keySystem = 'drm.abc';

      // DrmInfo directly sets advanced settings.
      manifest.periods[0].streamSets[0].drmInfos[0]  // either stream set
          .distinctiveIdentifierRequired = true;
      manifest.periods[0].streamSets[0].drmInfos[0]  // either stream set
          .persistentStateRequired = true;
      manifest.periods[0].streamSets[1].drmInfos[0]  // specifically audio
          .audioRobustness = 'good';
      manifest.periods[0].streamSets[0].drmInfos[0]  // specifically video
          .videoRobustness = 'really_really_ridiculously_good';

      config.advanced['drm.abc'] = {
        audioRobustness: 'bad',
        videoRobustness: 'so_bad_it_hurts',
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

      logErrorSpy.and.stub();
      config.servers = {};
      drmEngine.configure(config);

      drmEngine.init(manifest, /* offline */ false).then(fail, function(error) {
        expect(logErrorSpy).toHaveBeenCalled();
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN));
      }).then(done);
    });
  });  // describe('init')

  describe('attach', function() {
    beforeEach(function() {
      // Both audio and video with the same key system:
      manifest.periods[0].streamSets[1].drmInfos[0].keySystem = 'drm.abc';
    });

    it('does nothing for unencrypted content', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, []));
      manifest.periods[0].streamSets[0].drmInfos = [];
      manifest.periods[0].streamSets[1].drmInfos = [];

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
      var cert = new Uint8Array(0);
      config.advanced['drm.abc'] = { serverCertificate: cert };
      drmEngine.configure(config);

      initAndAttach().then(function() {
        expect(mockMediaKeys.setServerCertificate).toHaveBeenCalledWith(cert);
      }).catch(fail).then(done);
    });

    it('prefers server certificate from DrmInfo', function(done) {
      var cert1 = new Uint8Array(5);
      var cert2 = new Uint8Array(5);  // identical to cert1, will be merged
      var cert3 = new Uint8Array(0);  // in config, will be ignored
      manifest.periods[0].streamSets[0].drmInfos[0].serverCertificate = cert1;
      manifest.periods[0].streamSets[1].drmInfos[0].serverCertificate = cert2;

      config.advanced['drm.abc'] = { serverCertificate: cert3 };
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
      var initData1 = new Uint8Array(5);
      var initData2 = new Uint8Array(0);
      var initData3 = new Uint8Array(5);  // identical to initData1
      var initData4 = new Uint8Array(10);
      manifest.periods[0].streamSets[0].drmInfos[0].initData = [
        { initData: initData1, initDataType: 'cenc' },
        { initData: initData2, initDataType: 'webm' }
      ];
      manifest.periods[0].streamSets[1].drmInfos[0].initData = [
        { initData: initData3, initDataType: 'cenc' },  // will be merged with 1
        { initData: initData4, initDataType: 'cenc' }   // unique
      ];

      initAndAttach().then(function() {
        expect(mockMediaKeys.createSession.calls.count()).toBe(3);
        expect(session1.generateRequest).
            toHaveBeenCalledWith('cenc', initData1.buffer);
        expect(session2.generateRequest).
            toHaveBeenCalledWith('webm', initData2.buffer);
        expect(session3.generateRequest).
            toHaveBeenCalledWith('cenc', initData4.buffer);
      }).catch(fail).then(done);
    });

    it('uses clearKeys config to override DrmInfo', function(done) {
      manifest.periods[0].streamSets[0].drmInfos[0].keySystem =
          'com.fake.NOT.clearkey';
      manifest.periods[0].streamSets[1].drmInfos[0].keySystem =
          'com.fake.NOT.clearkey';
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['org.w3.clearkey']));

      // Configure clear keys (map of hex key IDs to keys)
      config.clearKeys = {
        'deadbeefdeadbeefdeadbeefdeadbeef': '18675309186753091867530918675309',
        '02030507011013017019023029031037': '03050701302303204201080425098033'
      };
      drmEngine.configure(config);

      var session = createMockSession();
      mockMediaKeys.createSession.and.callFake(function() {
        expect(mockMediaKeys.createSession.calls.count()).toBe(1);
        return session;
      });

      initAndAttach().then(function() {
        var Uint8ArrayUtils = shaka.util.Uint8ArrayUtils;

        expect(manifest.periods[0].streamSets[0].drmInfos.length).toBe(1);
        expect(manifest.periods[0].streamSets[0].drmInfos[0].keySystem).
            toBe('org.w3.clearkey');
        expect(manifest.periods[0].streamSets[1].drmInfos.length).toBe(1);
        expect(manifest.periods[0].streamSets[1].drmInfos[0].keySystem).
            toBe('org.w3.clearkey');

        expect(session.generateRequest).
            toHaveBeenCalledWith('keyids', jasmine.any(ArrayBuffer));

        var initData = JSON.parse(shaka.util.StringUtils.fromUTF8(
            session.generateRequest.calls.argsFor(0)[1]));
        var keyId1 = Uint8ArrayUtils.toHex(
            Uint8ArrayUtils.fromBase64(initData.kids[0]));
        var keyId2 = Uint8ArrayUtils.toHex(
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
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_ATTACH_TO_VIDEO,
            'whoops!'));
      }).then(done);
    });

    it('fails with an error if setServerCertificate fails', function(done) {
      var cert = new Uint8Array(0);
      config.advanced['drm.abc'] = { serverCertificate: cert };
      drmEngine.configure(config);

      // Fail setServerCertificate.
      mockMediaKeys.setServerCertificate.and.returnValue(Promise.reject({
        message: 'whoops!'
      }));

      initAndAttach().then(fail).catch(function(error) {
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.INVALID_SERVER_CERTIFICATE,
            'whoops!'));
      }).then(done);
    });

    it('dispatches an error if generateRequest fails', function(done) {
      // Set up an init data override in the manifest to get an immediate call
      // to generateRequest:
      var initData1 = new Uint8Array(5);
      manifest.periods[0].streamSets[0].drmInfos[0].initData = [
        { initData: initData1, initDataType: 'cenc' }
      ];

      // Fail generateRequest.
      var session1 = createMockSession();
      session1.generateRequest.and.returnValue(Promise.reject({
        message: 'whoops!'
      }));
      mockMediaKeys.createSession.and.returnValue(session1);

      onErrorSpy.and.stub();
      initAndAttach().then(function() {
        expect(onErrorSpy).toHaveBeenCalled();
        var error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.FAILED_TO_GENERATE_LICENSE_REQUEST,
            'whoops!'));
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
          var initData1 = new Uint8Array(1);
          var initData2 = new Uint8Array(2);

          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData1 });
          mockVideo.on['encrypted'](
              { initDataType: 'cenc', initData: initData2 });

          expect(mockMediaKeys.createSession.calls.count()).toBe(2);
          expect(session1.generateRequest).
              toHaveBeenCalledWith('webm', initData1.buffer);
          expect(session2.generateRequest).
              toHaveBeenCalledWith('cenc', initData2.buffer);
        }).catch(fail).then(done);
      });

      it('suppresses duplicate initDatas', function(done) {
        initAndAttach().then(function() {
          var initData1 = new Uint8Array(1);
          var initData2 = new Uint8Array(1);  // identical to initData1

          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData1 });
          mockVideo.on['encrypted'](
              { initDataType: 'cenc', initData: initData2 });

          expect(mockMediaKeys.createSession.calls.count()).toBe(1);
          expect(session1.generateRequest).
              toHaveBeenCalledWith('webm', initData1.buffer);
        }).catch(fail).then(done);
      });

      it('is ignored when init data is in DrmInfo', function(done) {
        // Set up an init data override in the manifest:
        manifest.periods[0].streamSets[0].drmInfos[0].initData = [
          { initData: new Uint8Array(0), initDataType: 'cenc' }
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
          var initData1 = new Uint8Array(1);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData1 });

          expect(onErrorSpy).toHaveBeenCalled();
          var error = onErrorSpy.calls.argsFor(0)[0];
          shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
              shaka.util.Error.Category.DRM,
              shaka.util.Error.Code.FAILED_TO_CREATE_SESSION,
              'whoops!'));
        }).catch(fail).then(done);
      });

      it('dispatches an error if manifest says unencrypted', function(done) {
        manifest.periods[0].streamSets[0].drmInfos = [];
        manifest.periods[0].streamSets[1].drmInfos = [];

        onErrorSpy.and.stub();

        initAndAttach().then(function() {
          var initData1 = new Uint8Array(1);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData1 });

          expect(onErrorSpy).toHaveBeenCalled();
          var error = onErrorSpy.calls.argsFor(0)[0];
          shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
              shaka.util.Error.Category.DRM,
              shaka.util.Error.Code.ENCRYPTED_CONTENT_WITHOUT_DRM_INFO));
        }).catch(fail).then(done);
      });
    });  // describe('encrypted')

    describe('message', function() {
      it('is listened for', function(done) {
        initAndAttach().then(function() {
          var initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData });

          expect(session1.addEventListener).toHaveBeenCalledWith(
              'message', jasmine.any(Function), false);
        }).catch(fail).then(done);
      });

      it('triggers a license request', function(done) {
        initAndAttach().then(function() {
          var initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData });

          fakeNetEngine.request.and.returnValue(new shaka.util.PublicPromise());
          var message = new Uint8Array(0);
          session1.on['message']({ message: message });

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
        manifest.periods[0].streamSets[0].drmInfos[0].licenseServerUri =
            'http://foo.bar/drm';

        initAndAttach().then(function() {
          var initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData });

          fakeNetEngine.request.and.returnValue(new shaka.util.PublicPromise());
          var message = new Uint8Array(0);
          session1.on['message']({ message: message });

          expect(fakeNetEngine.request).toHaveBeenCalledWith(
              shaka.net.NetworkingEngine.RequestType.LICENSE,
              jasmine.objectContaining({ uris: ['http://foo.bar/drm'] }));
        }).catch(fail).then(done);
      });

      it('dispatches an error if license request fails', function(done) {
        onErrorSpy.and.stub();

        initAndAttach().then(function() {
          var initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData });

          // Simulate a permission error from the web server.
          var netError = new shaka.util.Error(
              shaka.util.Error.Category.NETWORK,
              shaka.util.Error.Code.BAD_HTTP_STATUS,
              'http://abc.drm/license', 403);
          fakeNetEngine.request.and.returnValue(Promise.reject(netError));

          var message = new Uint8Array(0);
          session1.on['message']({ message: message });
          return shaka.test.Util.delay(0.5);
        }).then(function() {
          expect(onErrorSpy).toHaveBeenCalled();
          var error = onErrorSpy.calls.argsFor(0)[0];
          shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
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
          var initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData });

          expect(session1.addEventListener).toHaveBeenCalledWith(
              'keystatuseschange', jasmine.any(Function), false);
        }).catch(fail).then(done);
      });

      it('triggers callback', function(done) {
        initAndAttach().then(function() {
          var initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData });

          var keyId1 = (new Uint8Array(1)).buffer;
          var keyId2 = (new Uint8Array(2)).buffer;
          var status1 = 'usable';
          var status2 = 'expired';
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

          session1.on['keystatuseschange']({ target: session1 });
        }).catch(fail);
      });

      it('causes an EXPIRED error when all keys expire', function(done) {
        onErrorSpy.and.stub();

        initAndAttach().then(function() {
          expect(onErrorSpy).not.toHaveBeenCalled();

          var initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData });

          var keyId1 = (new Uint8Array(1)).buffer;
          var keyId2 = (new Uint8Array(2)).buffer;

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
              var error = onErrorSpy.calls.argsFor(0)[0];
              shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
                  shaka.util.Error.Category.DRM,
                  shaka.util.Error.Code.EXPIRED));
              done();
            });

            session1.on['keystatuseschange']({ target: session1 });
          });

          session1.on['keystatuseschange']({ target: session1 });
        }).catch(fail);
      });

      it('causes only one error when two keys expire at once', function(done) {
        onErrorSpy.and.stub();

        initAndAttach().then(function() {
          expect(onErrorSpy).not.toHaveBeenCalled();

          var initData = new Uint8Array(0);
          mockVideo.on['encrypted'](
              { initDataType: 'webm', initData: initData });

          var keyId1 = (new Uint8Array(1)).buffer;
          var keyId2 = (new Uint8Array(2)).buffer;

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
            var error = onErrorSpy.calls.argsFor(0)[0];
            shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
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
          session1.on['keystatuseschange']({ target: session1 });
          session1.on['keystatuseschange']({ target: session1 });
        }).catch(fail);
      });
    });  // describe('keystatuseschange')
  });  // describe('events')

  describe('update', function() {
    it('receives a license', function(done) {
      var license = (new Uint8Array(0)).buffer;

      initAndAttach().then(function() {
        var initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData });

        fakeNetEngine.setResponseMap({ 'http://abc.drm/license': license });
        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });
        session1.update.and.returnValue(Promise.resolve());

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(session1.update).toHaveBeenCalledWith(license);
      }).catch(fail).then(done);
    });

    it('uses clearKeys config to override DrmInfo', function(done) {
      manifest.periods[0].streamSets[0].drmInfos[0].keySystem =
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
        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });
        session1.update.and.returnValue(Promise.resolve());
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(session1.update.calls.count()).toBe(1);
        var licenseBuffer = session1.update.calls.argsFor(0)[0];
        var licenseJson =
            shaka.util.StringUtils.fromBytesAutoDetect(licenseBuffer);
        var license = JSON.parse(licenseJson);
        expect(license).toEqual({
          keys: [
            { kid: '3q2-796tvu_erb7v3q2-7w',
              k: 'GGdTCRhnUwkYZ1MJGGdTCQ', kty: 'oct' },
            { kid: 'AgMFBwEQEwFwGQIwKQMQNw',
              k: 'AwUHATAjAyBCAQgEJQmAMw', kty: 'oct' }
          ]
        });
      }).catch(fail).then(done);
    });

    it('dispatches an error if update fails', function(done) {
      onErrorSpy.and.stub();

      var license = (new Uint8Array(0)).buffer;

      initAndAttach().then(function() {
        var initData = new Uint8Array(0);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData });

        fakeNetEngine.setResponseMap({ 'http://abc.drm/license': license });
        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });
        session1.update.and.throwError('whoops!');

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(onErrorSpy).toHaveBeenCalled();
        var error = onErrorSpy.calls.argsFor(0)[0];
        shaka.test.Util.expectToEqualError(error, new shaka.util.Error(
            shaka.util.Error.Category.DRM,
            shaka.util.Error.Code.LICENSE_RESPONSE_REJECTED,
            'whoops!'));
      }).catch(fail).then(done);
    });
  });  // describe('update')

  describe('destroy', function() {
    it('tears down MediaKeys and active sessions', function(done) {
      initAndAttach().then(function() {
        var initData1 = new Uint8Array(1);
        var initData2 = new Uint8Array(2);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData1 });
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData2 });

        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });
        session1.update.and.returnValue(Promise.resolve());
        session2.on['message']({ target: session2, message: message });
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
        var initData1 = new Uint8Array(1);
        var initData2 = new Uint8Array(2);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData1 });
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData2 });

        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });
        session1.update.and.returnValue(Promise.resolve());
        session2.on['message']({ target: session2, message: message });
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
        var initData1 = new Uint8Array(1);
        var initData2 = new Uint8Array(2);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData1 });
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData2 });

        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });
        session1.update.and.returnValue(Promise.resolve());
        session2.on['message']({ target: session2, message: message });
        session2.update.and.returnValue(Promise.resolve());

        return shaka.test.Util.delay(0.5);
      }).then(function() {
        mockVideo.setMediaKeys.and.returnValue(Promise.reject());
        return drmEngine.destroy();
      }).catch(fail).then(done);
    });

    it('interrupts failing MediaKeys queries', function(done) {
      // Hold the MediaKeys query:
      var p = new shaka.util.PublicPromise();
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
      var p = new shaka.util.PublicPromise();
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
      var p = new shaka.util.PublicPromise();
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
      var p1 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p1);

      // This chain should still return "success" when DrmEngine is destroyed.
      initAndAttach().catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // We are now blocked on setMediaKeys:
        expect(mockVideo.setMediaKeys.calls.count()).toBe(1);
        // DrmEngine.destroy also calls setMediaKeys.
        var p2 = new shaka.util.PublicPromise();
        mockVideo.setMediaKeys.and.returnValue(p2);
        // Set timeouts to complete these calls.
        shaka.test.Util.delay(0.5).then(p1.reject.bind(p1));   // Failure
        shaka.test.Util.delay(1.0).then(p2.resolve.bind(p2));  // Success
        return drmEngine.destroy();
      }).catch(fail).then(done);
    });

    it('interrupts successful calls to setMediaKeys', function(done) {
      // Hold setMediaKeys:
      var p1 = new shaka.util.PublicPromise();
      mockVideo.setMediaKeys.and.returnValue(p1);

      // This chain should still return "success" when DrmEngine is destroyed.
      initAndAttach().catch(fail);

      shaka.test.Util.delay(1.0).then(function() {
        // We are now blocked on setMediaKeys:
        expect(mockVideo.setMediaKeys.calls.count()).toBe(1);
        // DrmEngine.destroy also calls setMediaKeys.
        var p2 = new shaka.util.PublicPromise();
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
      var cert = new Uint8Array(0);
      config.advanced['drm.abc'] = { serverCertificate: cert };
      drmEngine.configure(config);

      // Hold setServerCertificate:
      var p = new shaka.util.PublicPromise();
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
      var cert = new Uint8Array(0);
      config.advanced['drm.abc'] = { serverCertificate: cert };
      drmEngine.configure(config);

      // Hold setServerCertificate:
      var p = new shaka.util.PublicPromise();
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
      var p = new shaka.util.PublicPromise();
      session1.generateRequest.and.returnValue(p);

      initAndAttach().then(function() {
        var initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData1 });

        // We are now blocked on generateRequest:
        expect(session1.generateRequest.calls.count()).toBe(1);

        return drmEngine.destroy();
      }).then(function() {
        p.reject();  // Fail generateRequest.
      }).catch(fail).then(done);
      // onError is a failure by default.
    });

    it('interrupts successful license requests', function(done) {
      var p = new shaka.util.PublicPromise();
      fakeNetEngine.request.and.returnValue(p);

      initAndAttach().then(function() {
        var initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData1 });

        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });
        session1.update.and.returnValue(Promise.resolve());

        // We are now blocked on the license request:
        expect(fakeNetEngine.request.calls.count()).toBe(1);
        expect(fakeNetEngine.request).toHaveBeenCalledWith(
            shaka.net.NetworkingEngine.RequestType.LICENSE,
            jasmine.anything());

        return drmEngine.destroy();
      }).then(function() {
        // Unblock the license request.
        p.resolve({ data: (new Uint8Array(0)).buffer });
      }).then(function() {
        // Due to the interruption, we never updated the session.
        expect(session1.update).not.toHaveBeenCalled();
      }).catch(fail).then(done);
      // onError is a failure by default.
    });

    it('interrupts failed license requests', function(done) {
      var p = new shaka.util.PublicPromise();
      fakeNetEngine.request.and.returnValue(p);

      initAndAttach().then(function() {
        var initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData1 });

        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });
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
      var p = new shaka.util.PublicPromise();
      session1.update.and.returnValue(p);

      initAndAttach().then(function() {
        var initData1 = new Uint8Array(1);
        mockVideo.on['encrypted'](
            { initDataType: 'webm', initData: initData1 });

        var message = new Uint8Array(0);
        session1.on['message']({ target: session1, message: message });

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
  });  // describe('destroy')

  describe('getDrmInfo', function() {
    it('includes correct info', function(done) {
      requestMediaKeySystemAccessSpy.and.callFake(
          fakeRequestMediaKeySystemAccess.bind(null, ['drm.abc']));
      // Both audio and video with the same key system now:
      manifest.periods[0].streamSets[1].drmInfos[0].keySystem = 'drm.abc';
      // Key IDs in manifest
      manifest.periods[0].streamSets[1].drmInfos[0].keyIds[0] =
          'deadbeefdeadbeefdeadbeefdeadbeef';

      config.advanced['drm.abc'] = {
        audioRobustness: 'good',
        videoRobustness: 'really_really_ridiculously_good',
        distinctiveIdentifierRequired: true,
        persistentStateRequired: true
      };
      drmEngine.configure(config);

      drmEngine.init(manifest, /* offline */ false).then(function() {
        expect(drmEngine.initialized()).toBe(true);
        var drmInfo = drmEngine.getDrmInfo();
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
    var mksa = {
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
    var session = {
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
    session.addEventListener.and.callFake(function(name, callback) {
      session.on[name] = callback;
    });
    return session;
  }

  function createMockVideo() {
    var video = {
      setMediaKeys: jasmine.createSpy('setMediaKeys'),
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      on: {}  // event listeners
    };
    video.addEventListener.and.callFake(function(name, callback) {
      video.on[name] = callback;
    });
    return video;
  }
});
