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

describe('Player', function() {
  var abrManager;
  var originalLogError;
  var originalLogWarn;
  var logErrorSpy;
  var logWarnSpy;
  var manifest;
  var player;
  var networkingEngine;
  var streamingEngine;
  var video;

  beforeAll(function() {
    originalLogError = shaka.log.error;
    originalLogWarn = shaka.log.warning;

    logErrorSpy = jasmine.createSpy('shaka.log.error');
    shaka.log.error = logErrorSpy;
    logWarnSpy = jasmine.createSpy('shaka.log.warning');
    shaka.log.warning = logWarnSpy;
  });

  beforeEach(function() {
    // By default, errors are a failure.
    logErrorSpy.calls.reset();
    logErrorSpy.and.callFake(fail);

    // Many tests assume the existence of a manifest, so create a basic one.
    // Test suites can override this with more specific manifests.
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addStreamSet('audio')
          .addStream(1)
        .addStreamSet('video')
          .addStream(2)
      .build();

    function dependencyInjector(player) {
      networkingEngine =
          new shaka.test.FakeNetworkingEngine({}, new ArrayBuffer(0));

      player.createDrmEngine = function() {
        return new shaka.test.FakeDrmEngine();
      };
      player.createNetworkingEngine = function() {
        return networkingEngine;
      };
      player.createPlayhead = function() { return {destroy: function() {}}; };
      player.createMediaSource = function() { return Promise.resolve(); };
      player.createMediaSourceEngine = function() {
        return {destroy: function() {}};
      };
      player.createStreamingEngine = function() {
        // This captures the variable |manifest| so this should only be used
        // after the manifest has been set.
        var period = manifest.periods[0];
        streamingEngine = new shaka.test.FakeStreamingEngine(period);
        return streamingEngine;
      };
    }

    video = createMockVideo();
    player = new shaka.Player(video, dependencyInjector);

    abrManager = new shaka.test.FakeAbrManager();
    player.configure({abr: {manager: abrManager}});
  });

  afterEach(function(done) {
    player.destroy().catch(fail).then(function() {
      manifest = null;
      player = null;
      done();
    });
  });

  afterAll(function() {
    shaka.log.error = originalLogError;
    shaka.log.warning = originalLogWarn;
  });

  describe('load/unload', function() {
    var parser1;
    var parser2;
    var factory1;
    var factory2;
    var checkError;

    beforeEach(function() {
      goog.asserts.assert(manifest, 'manifest must be non-null');
      parser1 = new shaka.test.FakeManifestParser(manifest);
      parser2 = new shaka.test.FakeManifestParser(manifest);
      factory1 = function() { return parser1; };
      factory2 = function() { return parser2; };

      checkError = jasmine.createSpy('checkError');
      checkError.and.callFake(function(error) {
        expect(error.code).toBe(shaka.util.Error.Code.LOAD_INTERRUPTED);
      });
    });

    it('handles repeated load/unload', function(done) {
      player.load('', 0, factory1).then(function() {
        shaka.log.debug('finished load 1');
        return player.unload();
      }).then(function() {
        shaka.log.debug('finished unload 1');
        expect(parser1.stop).toHaveBeenCalled();
        return player.load('', 0, factory2);
      }).then(function() {
        shaka.log.debug('finished load 2');
        return player.unload();
      }).then(function() {
        shaka.log.debug('finished unload 2');
        expect(parser2.stop).toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    it('handles repeated loads', function(done) {
      player.load('', 0, factory1).then(function() {
        return player.load('', 0, factory1);
      }).then(function() {
        return player.load('', 0, factory2);
      }).then(function() {
        expect(parser1.stop.calls.count()).toBe(2);
      }).catch(fail).then(done);
    });

    it('handles load interrupting load', function(done) {
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.load('', 0, factory1).then(fail).catch(checkError);

      player.load('', 0, factory2).catch(fail).then(function() {
        // Delay so the interrupted calls have time to reject themselves.
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(checkError.calls.count()).toBe(2);
        expect(parser1.stop.calls.count()).toEqual(parser1.start.calls.count());
        done();
      });
    });

    it('handles unload interrupting load', function(done) {
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.unload().catch(fail);
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.unload().catch(fail);

      player.load('', 0, factory2).catch(fail).then(function() {
        // Delay so the interrupted calls have time to reject themselves.
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(checkError.calls.count()).toBe(2);
        expect(parser1.stop.calls.count()).toEqual(parser1.start.calls.count());
        done();
      });
    });

    it('handles destroy interrupting load', function(done) {
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.destroy().catch(fail).then(function() {
        // Delay so the interrupted calls have time to reject themselves.
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(checkError.calls.count()).toBe(1);
        expect(parser1.stop.calls.count()).toEqual(parser1.start.calls.count());
        done();
      });
    });

    it('handles multiple unloads interrupting load', function(done) {
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.unload().catch(fail);
      player.unload().catch(fail);
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.unload().catch(fail);
      player.unload().catch(fail);
      player.unload().catch(fail);

      player.load('', 0, factory2).catch(fail).then(function() {
        // Delay so the interrupted calls have time to reject themselves.
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(checkError.calls.count()).toBe(2);
        expect(parser1.stop.calls.count()).toEqual(parser1.start.calls.count());
        done();
      });
    });

    it('handles multiple destroys interrupting load', function(done) {
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.destroy().catch(fail);
      player.destroy().catch(fail);
      player.destroy().catch(fail).then(function() {
        // Delay so the interrupted calls have time to reject themselves.
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(checkError.calls.count()).toBe(1);
        expect(parser1.stop.calls.count()).toEqual(parser1.start.calls.count());
        done();
      });
    });

    it('handles unload, then destroy interrupting load', function(done) {
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.unload().catch(fail);
      player.unload().catch(fail);
      player.destroy().catch(fail).then(function() {
        // Delay so the interrupted calls have time to reject themselves.
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(checkError.calls.count()).toBe(1);
        expect(parser1.stop.calls.count()).toEqual(parser1.start.calls.count());
        done();
      });
    });

    it('handles destroy, then unload interrupting load', function(done) {
      player.load('', 0, factory1).then(fail).catch(checkError);
      player.destroy().catch(fail).then(function() {
        // Delay so the interrupted calls have time to reject themselves.
        return shaka.test.Util.delay(0.5);
      }).then(function() {
        expect(checkError.calls.count()).toBe(1);
        expect(parser1.stop.calls.count()).toEqual(parser1.start.calls.count());
        done();
      });
      player.unload().catch(fail);
      player.unload().catch(fail);
    });

    describe('interruption during', function() {
      beforeEach(function() {
        checkError.and.callFake(function(error) {
          expect(error.code).toBe(shaka.util.Error.Code.LOAD_INTERRUPTED);
          expect(parser1.stop.calls.count())
              .toEqual(parser1.start.calls.count());
          expect(parser2.stop.calls.count())
              .toEqual(parser2.start.calls.count());
        });
      });

      it('manifest type check', function(done) {
        // Block the network request.
        var p = networkingEngine.delayNextRequest();
        // Give the stage a factory so that it can succeed and get canceled.
        shaka.media.ManifestParser.registerParserByMime('undefined', factory1);

        player.load('', 0).then(fail).catch(checkError).then(function() {
          // Unregister our parser factory.
          delete shaka.media.ManifestParser.parsersByMime['undefined'];
          done();
        });

        shaka.test.Util.delay(0.5).then(function() {
          // Make sure we're blocked.
          var requestType = shaka.net.NetworkingEngine.RequestType.MANIFEST;
          networkingEngine.expectRequest('', requestType);
          // Interrupt load().
          player.unload();
          p.resolve();
        });
      });

      it('parser startup', function(done) {
        // Block parser startup.
        var p = new shaka.util.PublicPromise();
        parser1.start.and.returnValue(p);

        player.load('', 0, factory1).then(fail).catch(checkError).then(done);

        shaka.test.Util.delay(0.5).then(function() {
          // Make sure we're blocked.
          expect(parser1.start).toHaveBeenCalled();
          // Interrupt load().
          player.unload();
          p.resolve();
        });
      });

      it('DrmEngine init', function(done) {
        // Block DrmEngine init.
        var p = new shaka.util.PublicPromise();
        var drmEngine = new shaka.test.FakeDrmEngine();
        drmEngine.init.and.returnValue(p);
        player.createDrmEngine = function() { return drmEngine; };

        player.load('', 0, factory1).then(fail).catch(checkError).then(done);

        shaka.test.Util.delay(1.0).then(function() {
          // Make sure we're blocked.
          expect(drmEngine.init).toHaveBeenCalled();
          // Interrupt load().
          player.unload();
          p.resolve();
        });
      });

      it('DrmEngine attach', function(done) {
        // Block DrmEngine attach.
        var p = new shaka.util.PublicPromise();
        var drmEngine = new shaka.test.FakeDrmEngine();
        drmEngine.attach.and.returnValue(p);
        player.createDrmEngine = function() { return drmEngine; };

        player.load('', 0, factory1).then(fail).catch(checkError).then(done);

        shaka.test.Util.delay(1.0).then(function() {
          // Make sure we're blocked.
          expect(drmEngine.attach).toHaveBeenCalled();
          // Interrupt load().
          player.unload();
          p.resolve();
        });
      });

      it('StreamingEngine init', function(done) {
        // Block StreamingEngine init.
        var p = new shaka.util.PublicPromise();
        player.createStreamingEngine = function() {
          var period = manifest.periods[0];
          streamingEngine = new shaka.test.FakeStreamingEngine(period);
          streamingEngine.init.and.returnValue(p);
          return streamingEngine;
        };

        player.load('', 0, factory1).then(fail).catch(checkError).then(done);

        shaka.test.Util.delay(1.5).then(function() {
          // Make sure we're blocked.
          expect(streamingEngine.init).toHaveBeenCalled();
          // Interrupt load().
          player.unload();
          p.resolve();
        });
      });
    });
  });

  describe('getConfiguration', function() {
    it('returns a copy of the configuration', function() {
      var config1 = player.getConfiguration();
      config1.streaming.bufferBehind = -99;
      var config2 = player.getConfiguration();
      expect(config1.streaming.bufferBehind).not.toEqual(
          config2.streaming.bufferBehind);
    });
  });

  describe('configure', function() {
    it('overwrites defaults', function() {
      var defaultConfig = player.getConfiguration();
      // Make sure the default differs from our test value:
      expect(defaultConfig.drm.retryParameters.backoffFactor).not.toBe(5);
      expect(defaultConfig.manifest.retryParameters.backoffFactor).not.toBe(5);

      player.configure({
        drm: {
          retryParameters: { backoffFactor: 5 }
        }
      });

      var newConfig = player.getConfiguration();
      // Make sure we changed the backoff for DRM, but not for manifests:
      expect(newConfig.drm.retryParameters.backoffFactor).toBe(5);
      expect(newConfig.manifest.retryParameters.backoffFactor).not.toBe(5);
    });

    it('reverts to defaults when undefined is given', function() {
      player.configure({
        streaming: {
          retryParameters: { backoffFactor: 5 },
          bufferBehind: 7
        }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.streaming.retryParameters.backoffFactor).toBe(5);
      expect(newConfig.streaming.bufferBehind).toBe(7);

      player.configure({
        streaming: {
          retryParameters: undefined
        }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.streaming.retryParameters.backoffFactor).not.toBe(5);
      expect(newConfig.streaming.bufferBehind).toBe(7);

      player.configure({streaming: undefined});
      newConfig = player.getConfiguration();
      expect(newConfig.streaming.bufferBehind).not.toBe(7);
    });

    it('restricts the types of config values', function() {
      logErrorSpy.and.stub();
      var defaultConfig = player.getConfiguration();

      // Try a bogus bufferBehind (string instead of number)
      player.configure({
        streaming: { bufferBehind: '77' }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig).toEqual(defaultConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.streaming.bufferBehind'));

      // Try a bogus streaming config (number instead of Object)
      logErrorSpy.calls.reset();
      player.configure({
        streaming: 5
      });

      newConfig = player.getConfiguration();
      expect(newConfig).toEqual(defaultConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.streaming'));
    });

    it('expands dictionaries that allow arbitrary keys', function() {
      player.configure({
        drm: { servers: { 'com.widevine.alpha': 'http://foo/widevine' } }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine'
      });

      player.configure({
        drm: { servers: { 'com.microsoft.playready': 'http://foo/playready' } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine',
        'com.microsoft.playready': 'http://foo/playready'
      });
    });

    it('expands dictionaries but still restricts their values', function() {
      // Try a bogus server value (number instead of string)
      logErrorSpy.and.stub();
      player.configure({
        drm: { servers: { 'com.widevine.alpha': 7 } }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({});
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.drm.servers.com.widevine.alpha'));

      // Try a valid advanced config.
      logErrorSpy.calls.reset();
      player.configure({
        drm: { advanced: { 'ks1': { distinctiveIdentifierRequired: true } } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.advanced).toEqual(jasmine.objectContaining({
        'ks1': { distinctiveIdentifierRequired: true }
      }));
      expect(logErrorSpy).not.toHaveBeenCalled();
      var lastGoodConfig = newConfig;

      // Try an invalid advanced config key.
      player.configure({
        drm: { advanced: { 'ks1': { bogus: true } } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig).toEqual(lastGoodConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.drm.advanced.ks1.bogus'));
    });

    it('removes dictionary entries when undefined is given', function() {
      player.configure({
        drm: {
          servers: {
            'com.widevine.alpha': 'http://foo/widevine',
            'com.microsoft.playready': 'http://foo/playready'
          }
        }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine',
        'com.microsoft.playready': 'http://foo/playready'
      });

      player.configure({
        drm: { servers: { 'com.widevine.alpha': undefined } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.microsoft.playready': 'http://foo/playready'
      });

      player.configure({
        drm: { servers: undefined }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({});
    });

    it('checks the number of arguments to functions', function() {
      var goodCustomScheme = function(node) {};
      var badCustomScheme1 = function() {};  // too few args
      var badCustomScheme2 = function(x, y) {};  // too many args

      // Takes good callback.
      player.configure({
        manifest: { dash: { customScheme: goodCustomScheme } }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(goodCustomScheme);
      expect(logWarnSpy).not.toHaveBeenCalled();

      // Warns about bad callback #1, still takes it.
      logWarnSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: badCustomScheme1 } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(badCustomScheme1);
      expect(logWarnSpy).toHaveBeenCalledWith(
          stringContaining('.manifest.dash.customScheme'));

      // Warns about bad callback #2, still takes it.
      logWarnSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: badCustomScheme2 } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(badCustomScheme2);
      expect(logWarnSpy).toHaveBeenCalledWith(
          stringContaining('.manifest.dash.customScheme'));

      // Resets to default if undefined.
      logWarnSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: undefined } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).not.toBe(badCustomScheme2);
      expect(logWarnSpy).not.toHaveBeenCalled();
    });
  });

  describe('AbrManager', function() {
    it('sets through configure', function() {
      var config = player.getConfiguration();
      expect(config.abr.manager).toBe(abrManager);
      expect(abrManager.init).toHaveBeenCalled();
    });

    it('calls chooseStreams', function() {
      expect(abrManager.chooseStreams).not.toHaveBeenCalled();
      chooseStreams();
      expect(abrManager.chooseStreams).toHaveBeenCalled();
    });

    it('does not enable before stream startup', function() {
      chooseStreams();
      expect(abrManager.enable).not.toHaveBeenCalled();
      canSwitch();
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('does not enable if adaptation is disabled', function() {
      player.configure({abr: {enabled: false}});
      chooseStreams();
      canSwitch();
      expect(abrManager.enable).not.toHaveBeenCalled();
    });

    it('enables/disables though configure', function() {
      chooseStreams();
      canSwitch();
      abrManager.enable.calls.reset();
      abrManager.disable.calls.reset();

      player.configure({abr: {enabled: false}});
      expect(abrManager.disable).toHaveBeenCalled();

      player.configure({abr: {enabled: true}});
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('waits to enable if in-between Periods', function() {
      player.configure({abr: {enabled: false}});
      chooseStreams();
      player.configure({abr: {enabled: true}});
      expect(abrManager.enable).not.toHaveBeenCalled();
      canSwitch();
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('still disables if called after chooseStreams', function() {
      chooseStreams();
      player.configure({abr: {enabled: false}});
      canSwitch();
      expect(abrManager.enable).not.toHaveBeenCalled();
    });

    it('sets the default bandwidth estimate', function() {
      chooseStreams();
      canSwitch();
      player.configure({abr: {defaultBandwidthEstimate: 2000}});
      expect(abrManager.setDefaultEstimate).toHaveBeenCalledWith(2000);
    });
  });

  describe('tracks', function() {
    var tracks;

    beforeEach(function() {
      // A manifest we can use to test track expectations.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('audio')
            .language('en')
            .addStream(1).bandwidth(100)
            .addStream(2).bandwidth(100)
          .addStreamSet('video')
            .addStream(4).bandwidth(100).size(100, 200)
            .frameRate(1000000 / 42000)
            .addStream(5).bandwidth(200).size(200, 400).frameRate(24)
          .addStreamSet('text')
            .language('es')
            .addStream(6).bandwidth(100).kind('caption')
          .addStreamSet('text')
            .language('en')
            .addStream(7).bandwidth(100).kind('caption')
        .build();

      tracks = [
        {
          id: 1,
          active: true,
          type: 'audio',
          bandwidth: 100,
          language: 'en',
          kind: null,
          width: null,
          height: null,
          frameRate: undefined,
          codecs: 'avc1.4d401f'
        },
        {
          id: 2,
          active: false,
          type: 'audio',
          bandwidth: 100,
          language: 'en',
          kind: null,
          width: null,
          height: null,
          frameRate: undefined,
          codecs: 'avc1.4d401f'
        },
        {
          id: 4,
          active: true,
          type: 'video',
          bandwidth: 100,
          language: 'und',
          kind: null,
          width: 100,
          height: 200,
          frameRate: 1000000 / 42000,
          codecs: 'avc1.4d401f'
        },
        {
          id: 5,
          active: false,
          type: 'video',
          bandwidth: 200,
          language: 'und',
          kind: null,
          width: 200,
          height: 400,
          frameRate: 24,
          codecs: 'avc1.4d401f'
        },
        {
          id: 6,
          active: true,
          type: 'text',
          bandwidth: 100,
          language: 'es',
          kind: 'caption',
          width: null,
          height: null,
          frameRate: undefined,
          codecs: 'avc1.4d401f'
        },
        {
          id: 7,
          active: false,
          type: 'text',
          bandwidth: 100,
          language: 'en',
          kind: 'caption',
          width: null,
          height: null,
          frameRate: undefined,
          codecs: 'avc1.4d401f'
        }
      ];
    });

    beforeEach(function(done) {
      goog.asserts.assert(manifest, 'manifest must be non-null');
      var parser = new shaka.test.FakeManifestParser(manifest);
      var factory = function() { return parser; };
      player.load('', 0, factory).catch(fail).then(done);
    });

    it('returns the correct tracks', function() {
      var actual = player.getTracks();
      expect(actual).toEqual(tracks);
    });

    it('disables AbrManager if switching audio or video', function() {
      var config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);

      expect(tracks[1].type).toBe('audio');
      player.selectTrack(tracks[1]);

      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(false);

      // Test again with video.
      player.configure({abr: {enabled: true}});

      expect(tracks[3].type).toBe('video');
      player.selectTrack(tracks[3]);

      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(false);
    });

    it('doesn\'t disable AbrManager if switching text', function() {
      var config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);

      expect(tracks[4].type).toBe('text');
      player.selectTrack(tracks[4]);

      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
    });

    it('switches streams', function() {
      chooseStreams();
      canSwitch();

      var period = manifest.periods[0];
      var stream = period.streamSets[0].streams[1];
      expect(tracks[1].id).toBe(stream.id);
      player.selectTrack(tracks[1]);
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith('audio', stream, false);
    });

    it('still switches streams if called during startup', function() {
      player.selectTrack(tracks[1]);
      expect(streamingEngine.switch).not.toHaveBeenCalled();

      // Does not call switch, just overrides the choices made in AbrManager.
      var chosen = chooseStreams();
      var period = manifest.periods[0];
      var stream = period.streamSets[0].streams[1];
      expect(chosen).toEqual(jasmine.objectContaining({'audio': stream}));
    });

    it('still switches streams if called while switching Periods', function() {
      chooseStreams();

      player.selectTrack(tracks[1]);
      expect(streamingEngine.switch).not.toHaveBeenCalled();

      canSwitch();

      var period = manifest.periods[0];
      var stream = period.streamSets[0].streams[1];
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith('audio', stream, false);
    });

    it('switching audio doesn\'t change selected text track', function() {
      chooseStreams();
      canSwitch();
      player.configure({
        preferredTextLanguage: 'es'
      });

      expect(tracks[5].type).toBe('text');
      expect(tracks[5].language).toBe('en');
      player.selectTrack(tracks[5]);
      var period = manifest.periods[0];
      var textStream = period.streamSets[3].streams[0];

      expect(streamingEngine.switch)
          .toHaveBeenCalledWith('text', textStream, true);

      streamingEngine.switch.calls.reset();

      var audioStream = period.streamSets[0].streams[1];
      expect(tracks[1].id).toBe(audioStream.id);
      player.selectTrack(tracks[1]);
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith('text', textStream, true);
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith('audio', audioStream, false);
    });
  });

  describe('languages', function() {
    it('chooses the first as default', function(done) {
      runTest(['en', 'es'], 'pt', 0, done);
    });

    it('chooses the primary track', function(done) {
      runTest(['en', 'es', '*fr'], 'pt', 2, done);
    });

    it('chooses exact match for main language', function(done) {
      runTest(['en', 'pt', 'pt-BR'], 'pt', 1, done);
    });

    it('chooses exact match for subtags', function(done) {
      runTest(['en', 'pt', 'pt-BR'], 'PT-BR', 2, done);
    });

    it('chooses base language if exact does not exist', function(done) {
      runTest(['en', 'es', 'pt'], 'pt-BR', 2, done);
    });

    it('chooses different subtags if base language does not exist',
       function(done) {
         runTest(['en', 'es', 'pt-BR'], 'pt-PT', 2, done);
       });

    it('enables text track if audio and text are different language',
        function(done) {
          // A manifest we can use to test text visibility.
          manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
              .addStreamSet('audio').language('pt').addStream(0)
              .addStreamSet('audio').language('en').addStream(1)
              .addStreamSet('text').language('pt').addStream(2)
              .addStreamSet('text').language('fr').addStream(3)
           .build();

          var parser = new shaka.test.FakeManifestParser(manifest);
          var factory = function() { return parser; };
          player.load('', 0, factory)
              .then(function() {
                expect(player.isTextTrackVisible()).toBe(false);
                player.configure({
                  preferredAudioLanguage: 'en',
                  preferredTextLanguage: 'fr'
                });
                expect(player.isTextTrackVisible()).toBe(true);
              })
              .catch(fail)
              .then(done);
        });

    /**
     * @param {!Array.<string>} languages
     * @param {string} preference
     * @param {number} expectedIndex
     * @param {function()} done
     */
    function runTest(languages, preference, expectedIndex, done) {
      var generator = new shaka.test.ManifestGenerator().addPeriod(0);

      for (var i = 0; i < languages.length; i++) {
        var lang = languages[i];
        if (lang.charAt(0) == '*') {
          generator
            .addStreamSet('audio')
              .primary()
              .language(lang.substr(1))
              .addStream(i);
        } else {
          generator.addStreamSet('audio').language(lang).addStream(i);
        }
      }
      // A manifest we can use to test language selection.
      manifest = generator.build();

      var parser = new shaka.test.FakeManifestParser(manifest);
      var factory = function() { return parser; };
      player.load('', 0, factory)
          .then(function() {
            player.configure({
              preferredAudioLanguage: preference,
              preferredTextLanguage: preference
            });

            var chosen = chooseStreams();
            expect(chosen['audio'].id).toBe(expectedIndex);
          })
          .catch(fail)
          .then(done);
    }
  });

  describe('getStats', function() {
    beforeAll(function() {
      jasmine.clock().install();
      jasmine.clock().mockDate();
    });

    beforeEach(function(done) {
      // A manifest we can use to test stats.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('audio')
            .language('en')
            .addStream(1).bandwidth(100)
            .addStream(2).bandwidth(200)
          .addStreamSet('video')
            .addStream(4).bandwidth(100).size(100, 200)
            .addStream(5).bandwidth(200).size(200, 400)
        .build();

      var parser = new shaka.test.FakeManifestParser(manifest);
      var factory = function() { return parser; };
      player.load('', 0, factory)
          .then(function() {
            // "initialize" the current period.
            chooseStreams();
            canSwitch();
          })
          .catch(fail)
          .then(done);
    });

    afterAll(function() {
      jasmine.clock().uninstall();
    });

    it('tracks estimated bandwidth', function() {
      abrManager.getBandwidthEstimate.and.returnValue(25);
      var stats = player.getStats();
      expect(stats.estimatedBandwidth).toBe(25);
    });

    it('tracks info about current stream', function() {
      var stats = player.getStats();
      // Should have chosen the first of each type of stream.
      expect(stats.width).toBe(100);
      expect(stats.height).toBe(200);
      expect(stats.streamBandwidth).toBe(200);
    });

    it('tracks frame info', function() {
      // getVideoPlaybackQuality does not exist yet.
      var stats = player.getStats();
      expect(stats.decodedFrames).toBeNaN();
      expect(stats.droppedFrames).toBeNaN();

      video.getVideoPlaybackQuality = function() {
        return {totalVideoFrames: 75, droppedVideoFrames: 125};
      };

      // Now that it exists, theses stats should exist.
      stats = player.getStats();
      expect(stats.decodedFrames).toBe(75);
      expect(stats.droppedFrames).toBe(125);
    });

    describe('buffer/play times', function() {
      it('tracks play time', function() {
        var stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(0);

        jasmine.clock().tick(5000);

        stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(5);
        expect(stats.bufferingTime).toBeCloseTo(0);
      });

      it('tracks buffering time', function() {
        var stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(0);

        buffering(true);
        jasmine.clock().tick(5000);

        stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(5);
      });

      it('tracks correct time when switching states', function() {
        // buffering(false)
        jasmine.clock().tick(3000);
        buffering(true);
        jasmine.clock().tick(5000);
        buffering(true);
        jasmine.clock().tick(9000);
        buffering(false);
        jasmine.clock().tick(1000);

        var stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(4);
        expect(stats.bufferingTime).toBeCloseTo(14);
      });

      /**
       * @param {boolean} buffering
       * @suppress {accessControls}
       */
      function buffering(buffering) {
        player.onBuffering_(buffering);
      }
    });

    describe('.switchHistory', function() {
      it('includes original choices', function() {
        checkHistory([]);
      });

      it('includes selectTrack choices', function() {
        var track = player.getTracks()[1];
        player.selectTrack(track);

        checkHistory([{
          // We are using a mock date, so this is not a race.
          timestamp: Date.now() / 1000,
          id: track.id,
          type: track.type,
          fromAdaptation: false
        }]);
      });

      it('includes adaptation choices', function() {
        var choices = {
          'audio': manifest.periods[0].streamSets[0].streams[1],
          'video': manifest.periods[0].streamSets[1].streams[1]
        };

        switch_(choices);
        checkHistory(jasmine.arrayContaining([
          {
            timestamp: Date.now() / 1000,
            id: choices['audio'].id,
            type: 'audio',
            fromAdaptation: true
          },
          {
            timestamp: Date.now() / 1000,
            id: choices['video'].id,
            type: 'video',
            fromAdaptation: true
          }
        ]));
      });

      it('ignores adaptation if stream is already active', function() {
        var choices = {
          // This audio stream is already active.
          'audio': manifest.periods[0].streamSets[0].streams[0],
          'video': manifest.periods[0].streamSets[1].streams[1]
        };

        switch_(choices);
        checkHistory([{
          timestamp: Date.now() / 1000,
          id: choices['video'].id,
          type: 'video',
          fromAdaptation: true
        }]);
      });

      /**
       * Checks that the switch history is correct.
       * @param {!Array.<shakaExtern.StreamChoice>} additional
       */
      function checkHistory(additional) {
        var prefix = [
          {
            timestamp: jasmine.any(Number),
            id: 1,
            type: 'audio',
            fromAdaptation: true
          },
          {
            timestamp: jasmine.any(Number),
            id: 4,
            type: 'video',
            fromAdaptation: true
          }
        ];

        var stats = player.getStats();
        expect(stats.switchHistory.slice(0, 2))
            .toEqual(jasmine.arrayContaining(prefix));
        expect(stats.switchHistory.slice(2)).toEqual(additional);
      }

      /**
       * @param {!Object.<string, !shakaExtern.Stream>} streamsByType
       * @suppress {accessControls}
       */
      function switch_(streamsByType) {
        player.switch_(streamsByType);
      }
    });
  });

  describe('restrictions', function() {
    beforeEach(function(done) {
      // A manifest for testing restrictions.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('audio')
            .addStream(1).bandwidth(500)
            .addStream(2).disallowByKeySystem()
            .addStream(3).bandwidth(1500)
          .addStreamSet('video')
            .addStream(4).size(100, 100).bandwidth(300).keyId('abc')
            .addStream(5).size(200, 1500)
            .addStream(6).size(5, 5)
            .addStream(7).size(100, 100).bandwidth(1500)
            .addStream(8).size(1500, 200)
            .addStream(9).size(900, 900)
            .addStream(10).size(100, 100).bandwidth(10)
            .addStream(11).bandwidth(200).mime('video/webm')
        .build();

      var parser = new shaka.test.FakeManifestParser(manifest);
      var factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(done);
    });

    it('switches if active is restricted by application', function() {
      var activeVideo = getActiveTrack('video');
      expect(activeVideo.id).toBe(4);

      // AbrManager should choose the second track since the first is
      // restricted.
      abrManager.chooseIndex = 1;
      abrManager.chooseStreams.calls.reset();
      player.configure({restrictions: {maxVideoBandwidth: 200}});
      expect(abrManager.chooseStreams).toHaveBeenCalled();
      expect(manifest.periods[0].streamSets[1].streams[0].id).toBe(4);
      expect(manifest.periods[0].streamSets[1].streams[0].allowedByApplication)
          .toBe(false);

      activeVideo = getActiveTrack('video');
      expect(activeVideo.id).toBe(5);
    });

    it('switches if active key status is "output-restricted"', function() {
      var activeVideo = getActiveTrack('video');
      expect(activeVideo.id).toBe(4);

      // AbrManager should choose the second track since the first is
      // restricted.
      abrManager.chooseIndex = 1;
      abrManager.chooseStreams.calls.reset();
      onKeyStatus({'abc': 'output-restricted'});
      expect(abrManager.chooseStreams).toHaveBeenCalled();
      expect(manifest.periods[0].streamSets[1].streams[0].id).toBe(4);
      expect(manifest.periods[0].streamSets[1].streams[0].allowedByKeySystem)
          .toBe(false);

      activeVideo = getActiveTrack('video');
      expect(activeVideo.id).toBe(5);
    });

    it('switches if active key status is "internal-error"', function() {
      var activeVideo = getActiveTrack('video');
      expect(activeVideo.id).toBe(4);

      // AbrManager should choose the second track since the first is
      // restricted.
      abrManager.chooseIndex = 1;
      abrManager.chooseStreams.calls.reset();
      onKeyStatus({'abc': 'internal-error'});
      expect(abrManager.chooseStreams).toHaveBeenCalled();
      expect(manifest.periods[0].streamSets[1].streams[0].id).toBe(4);
      expect(manifest.periods[0].streamSets[1].streams[0].allowedByKeySystem)
          .toBe(false);

      activeVideo = getActiveTrack('video');
      expect(activeVideo.id).toBe(5);
    });

    it('removes if key status is "output-restricted"', function() {
      expect(player.getTracks().length).toBe(9);

      onKeyStatus({'abc': 'output-restricted'});

      var tracks = player.getTracks();
      expect(tracks.length).toBe(8);
      expectDoesNotInclude(tracks, 4);
    });

    it('removes if key status is "internal-error"', function() {
      expect(player.getTracks().length).toBe(9);

      onKeyStatus({'abc': 'internal-error'});

      var tracks = player.getTracks();
      expect(tracks.length).toBe(8);
      expectDoesNotInclude(tracks, 4);
    });

    it('removes if key system does not support codec', function() {
      // Should already be removed from filterPeriod_
      var tracks = player.getTracks();
      expect(tracks.length).toBe(9);
      expectDoesNotInclude(tracks, 11);
    });

    it('removes based on bandwidth', function() {
      player.configure(
          {restrictions: {minVideoBandwidth: 100, maxVideoBandwidth: 1000}});

      var tracks = player.getTracks();
      expect(tracks.length).toBe(7);
      expectDoesNotInclude(tracks, 7);
      expectDoesNotInclude(tracks, 10);
    });

    it('removes based on pixels', function() {
      player.configure({restrictions: {minPixels: 100, maxPixels: 800 * 800}});

      var tracks = player.getTracks();
      expect(tracks.length).toBe(7);
      expectDoesNotInclude(tracks, 6);
      expectDoesNotInclude(tracks, 9);
    });

    it('removes based on width', function() {
      player.configure({restrictions: {minWidth: 100, maxWidth: 1000}});

      var tracks = player.getTracks();
      expect(tracks.length).toBe(7);
      expectDoesNotInclude(tracks, 6);
      expectDoesNotInclude(tracks, 8);
    });

    it('removes based on height', function() {
      player.configure({restrictions: {minHeight: 100, maxHeight: 1000}});

      var tracks = player.getTracks();
      expect(tracks.length).toBe(7);
      expectDoesNotInclude(tracks, 5);
      expectDoesNotInclude(tracks, 6);
    });

    it('issues error if no streams are playable', function() {
      var onError = jasmine.createSpy('error event');
      onError.and.callFake(function(e) {
        var error = e.detail;
        shaka.test.Util.expectToEqualError(
            error,
            new shaka.util.Error(
                shaka.util.Error.Category.MANIFEST,
                shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET));
      });
      player.addEventListener('error', onError);

      player.configure(
          {restrictions: {maxAudioBandwidth: 0, maxVideoBandwidth: 0}});
      expect(onError).toHaveBeenCalled();
    });

    /**
     * Gets the currently active track.
     * @param {string} type
     * @return {shakaExtern.Track}
     */
    function getActiveTrack(type) {
      var activeTracks = player.getTracks().filter(function(track) {
        return track.type == type && track.active;
      });
      expect(activeTracks.length).toBe(1);
      return activeTracks[0];
    }

    /**
     * Expects that the given track list does not include a track with the
     * given ID.
     * @param {!Array.<shakaExtern.Track>} tracks
     * @param {number} id
     */
    function expectDoesNotInclude(tracks, id) {
      var containsId = tracks.some(function(track) { return track.id == id; });
      expect(containsId).toBe(false);
    }

    /**
     * @param {!Object.<string, string>} keyStatusMap
     * @suppress {accessControls}
     */
    function onKeyStatus(keyStatusMap) {
      player.onKeyStatus_(keyStatusMap);
    }
  });

  /**
   * Choose streams for the given period.
   *
   * @suppress {accessControls}
   * @return {!Object.<string, !shakaExtern.Stream>}
   */
  function chooseStreams() {
    var period = manifest.periods[0];
    return player.onChooseStreams_(period);
  }

  /** @suppress {accessControls} */
  function canSwitch() { player.canSwitch_(); }

  /**
   * A Jasmine asymmetric matcher for substring matches.
   * @param {string} substring
   * @return {!Object}
   */
  function stringContaining(substring) {
    return {
      asymmetricMatch: function(actual) {
        return actual.indexOf(substring) >= 0;
      }
    };
  }
});
