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
  var onError;
  var player;

  var networkingEngine;
  var streamingEngine;
  var drmEngine;
  var playhead;
  var playheadObserver;
  var mediaSourceEngine;

  var video;
  var ContentType;

  beforeAll(function() {
    originalLogError = shaka.log.error;
    originalLogWarn = shaka.log.warning;

    logErrorSpy = jasmine.createSpy('shaka.log.error');
    shaka.log.error = logErrorSpy;
    logWarnSpy = jasmine.createSpy('shaka.log.warning');
    shaka.log.warning = logWarnSpy;

    ContentType = shaka.util.ManifestParserUtils.ContentType;
  });

  beforeEach(function() {
    // By default, errors are a failure.
    logErrorSpy.calls.reset();
    logErrorSpy.and.callFake(fail);

    // Many tests assume the existence of a manifest, so create a basic one.
    // Test suites can override this with more specific manifests.
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0)
          .addAudio(1)
          .addVideo(2)
      .build();

    function dependencyInjector(player) {
      networkingEngine =
          new shaka.test.FakeNetworkingEngine({}, new ArrayBuffer(0));
      drmEngine = new shaka.test.FakeDrmEngine();
      playhead = new shaka.test.FakePlayhead();
      playheadObserver = new shaka.test.FakePlayheadObserver();
      mediaSourceEngine = {
        destroy: jasmine.createSpy('destroy').and.returnValue(Promise.resolve())
      };

      player.createDrmEngine = function() { return drmEngine; };
      player.createNetworkingEngine = function() { return networkingEngine; };
      player.createPlayhead = function() { return playhead; };
      player.createPlayheadObserver = function() { return playheadObserver; };
      player.createMediaSource = function() { return Promise.resolve(); };
      player.createMediaSourceEngine = function() { return mediaSourceEngine; };
      player.createStreamingEngine = function() {
        // This captures the variable |manifest| so this should only be used
        // after the manifest has been set.
        var period = manifest.periods[0];
        streamingEngine = new shaka.test.FakeStreamingEngine(period);
        return streamingEngine;
      };
    }

    video = new shaka.test.FakeVideo(20);
    player = new shaka.Player(video, dependencyInjector);

    abrManager = new shaka.test.FakeAbrManager();
    player.configure({
      abr: {manager: abrManager},
      // Ensures we don't get a warning about missing preference.
      preferredAudioLanguage: 'en'
    });

    onError = jasmine.createSpy('error event');
    onError.and.callFake(function(event) {
      fail(event.detail);
    });
    player.addEventListener('error', onError);
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

  describe('destroy', function() {
    it('cleans up all dependencies', function(done) {
      goog.asserts.assert(manifest, 'Manifest should be non-null');
      var parser = new shaka.test.FakeManifestParser(manifest);
      var factory = function() { return parser; };

      player.load('', 0, factory).then(function() {
        return player.destroy();
      }).then(function() {
        expect(networkingEngine.destroy).toHaveBeenCalled();
        expect(drmEngine.destroy).toHaveBeenCalled();
        expect(playhead.destroy).toHaveBeenCalled();
        expect(playheadObserver.destroy).toHaveBeenCalled();
        expect(mediaSourceEngine.destroy).toHaveBeenCalled();
        expect(streamingEngine.destroy).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
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

    it('won\'t start loading until unloading is done', function(done) {
      // There was a bug when calling unload before calling load would cause
      // the load to continue before the (first) unload was complete.
      // https://github.com/google/shaka-player/issues/612
      player.load('', 0, factory1).then(function() {
        // Delay the promise to destroy the parser.
        var p = new shaka.util.PublicPromise();
        parser1.stop.and.returnValue(p);

        var unloadDone = false;
        spyOn(player, 'createMediaSourceEngine');

        shaka.test.Util.delay(0.5).then(function() {
          // Should not start loading yet.
          expect(player.createMediaSourceEngine).not.toHaveBeenCalled();

          // Unblock the unload chain.
          unloadDone = true;
          p.resolve();
        });

        // Explicitly unload the player first.  When load calls unload, it
        // should wait until the parser is destroyed.
        player.unload();
        player.load('', 0, factory2).then(function() {
          expect(unloadDone).toBe(true);
          done();
        });
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
    var variantTracks;
    var textTracks;

    beforeEach(function() {
      // A manifest we can use to test track expectations.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .bandwidth(200)
            .language('en')
            .addAudio(1).bandwidth(100)
            .addVideo(4).bandwidth(100).size(100, 200)
            .frameRate(1000000 / 42000)
          .addVariant(2)
            .bandwidth(300)
            .language('en')
            .addAudio(1).bandwidth(100)
            .addVideo(5).bandwidth(200).size(200, 400).frameRate(24)
          .addVariant(3)
            .bandwidth(200)
            .language('en')
            .addAudio(2).bandwidth(100)
            .addVideo(4).bandwidth(100).size(100, 200)
            .frameRate(1000000 / 42000)
          .addVariant(4)
            .bandwidth(300)
            .language('en')
            .addAudio(2).bandwidth(100)
            .addVideo(5).bandwidth(200).size(200, 400).frameRate(24)
          .addVariant(5)
            .language('es')
            .bandwidth(300)
            .addAudio(8).bandwidth(100)
            .addVideo(5).bandwidth(200).size(200, 400).frameRate(24)
          .addTextStream(6)
            .language('es')
            .bandwidth(100).kind('caption')
                         .mime('text/vtt')
          .addTextStream(7)
            .language('en')
            .bandwidth(100).kind('caption')
                         .mime('application/ttml+xml')
          // Both text tracks should remain, even with different MIME types.
        .build();

      variantTracks = [
        {
          id: 1,
          active: true,
          type: 'variant',
          bandwidth: 200,
          language: 'en',
          kind: null,
          width: 100,
          height: 200,
          frameRate: 1000000 / 42000,
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          primary: false
        },
        {
          id: 2,
          active: false,
          type: 'variant',
          bandwidth: 300,
          language: 'en',
          kind: null,
          width: 200,
          height: 400,
          frameRate: 24,
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          primary: false
        },
        {
          id: 3,
          active: false,
          type: 'variant',
          bandwidth: 200,
          language: 'en',
          kind: null,
          width: 100,
          height: 200,
          frameRate: 1000000 / 42000,
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          primary: false
        },
        {
          id: 4,
          active: false,
          type: 'variant',
          bandwidth: 300,
          language: 'en',
          kind: null,
          width: 200,
          height: 400,
          frameRate: 24,
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          primary: false
        },
        {
          id: 5,
          active: false,
          type: 'variant',
          bandwidth: 300,
          language: 'es',
          kind: null,
          width: 200,
          height: 400,
          frameRate: 24,
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          primary: false
        }
      ];

      textTracks = [
        {
          id: 6,
          active: true,
          type: ContentType.TEXT,
          language: 'es',
          kind: 'caption',
          mimeType: 'text/vtt',
          codecs: null,
          primary: false
        },
        {
          id: 7,
          active: false,
          type: ContentType.TEXT,
          language: 'en',
          kind: 'caption',
          mimeType: 'application/ttml+xml',
          codecs: null,
          primary: false
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
      // Switch tracks first so we setup the "active" tracks.
      player.selectVariantTrack(variantTracks[0]);
      player.selectTextTrack(textTracks[0]);

      var actualVariantTracks = player.getVariantTracks();
      var actualTextTracks = player.getTextTracks();
      expect(actualVariantTracks).toEqual(variantTracks);
      expect(actualTextTracks).toEqual(textTracks);
    });

    it('doesn\'t disable AbrManager if switching variants', function() {
      var config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
      expect(variantTracks[1].type).toBe('variant');
      player.selectVariantTrack(variantTracks[1]);
      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
    });

    it('doesn\'t disable AbrManager if switching text', function() {
      var config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
      expect(textTracks[0].type).toBe(ContentType.TEXT);
      player.selectTextTrack(textTracks[0]);
      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
    });

    it('switches streams', function() {
      chooseStreams();
      canSwitch();

      var period = manifest.periods[0];
      var variant = period.variants[3];
      player.selectVariantTrack(variantTracks[3]);
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.AUDIO, variant.audio, false);
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.VIDEO, variant.video, false);
    });

    it('doesn\'t switch audio if old and new variants ' +
       'have the same audio track', function() {
          chooseStreams();
          canSwitch();

          var period = manifest.periods[0];
          var variant1 = period.variants[0];
          var variant2 = period.variants[1];
          expect(variant1.audio).toEqual(variant2.audio);

          player.selectVariantTrack(variantTracks[0]);
          streamingEngine.switch.calls.reset();

          player.selectVariantTrack(variantTracks[1]);

          expect(streamingEngine.switch).toHaveBeenCalledWith(
              ContentType.VIDEO, variant2.video, false);
          expect(streamingEngine.switch).not.toHaveBeenCalledWith(
              ContentType.AUDIO, variant2.audio, false);
        });

    it('doesn\'t switch video if old and new variants ' +
       'have the same video track', function() {
          chooseStreams();
          canSwitch();

          var period = manifest.periods[0];
          var variant1 = period.variants[0];
          var variant2 = period.variants[2];
          expect(variant1.video).toEqual(variant2.video);

          player.selectVariantTrack(variantTracks[0]);
          streamingEngine.switch.calls.reset();

          player.selectVariantTrack(variantTracks[2]);

          expect(streamingEngine.switch).toHaveBeenCalledWith(
              ContentType.AUDIO, variant2.audio, false);
          expect(streamingEngine.switch).not.toHaveBeenCalledWith(
              ContentType.VIDEO, variant2.video, false);
        });

    it('still switches streams if called during startup', function() {
      player.selectVariantTrack(variantTracks[1]);
      expect(streamingEngine.switch).not.toHaveBeenCalled();

      // Does not call switch, just overrides the choices made in AbrManager.
      var chosen = chooseStreams();
      var period = manifest.periods[0];
      var variant = period.variants[1];
      var expectedObject = {};
      expectedObject[ContentType.AUDIO] = variant.audio;
      expectedObject[ContentType.VIDEO] = variant.video;
      expect(chosen).toEqual(jasmine.objectContaining(expectedObject));
    });

    it('still switches streams if called while switching Periods', function() {
      chooseStreams();

      player.selectVariantTrack(variantTracks[3]);
      expect(streamingEngine.switch).not.toHaveBeenCalled();

      canSwitch();

      var period = manifest.periods[0];
      var variant = period.variants[3];
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.AUDIO, variant.audio, false);
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.VIDEO, variant.video, false);
    });

    it('switching audio doesn\'t change selected text track', function() {
      chooseStreams();
      canSwitch();
      player.configure({
        preferredTextLanguage: 'es'
      });

      expect(textTracks[1].type).toBe(ContentType.TEXT);
      expect(textTracks[1].language).toBe('en');
      player.selectTextTrack(textTracks[1]);
      var period = manifest.periods[0];
      var textStream = period.textStreams[1];

      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.TEXT, textStream, true);

      streamingEngine.switch.calls.reset();

      var variant = period.variants[2];
      expect(variantTracks[2].id).toBe(variant.id);
      player.selectVariantTrack(variantTracks[2]);
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.TEXT, textStream, true);
      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.AUDIO, variant.audio, false);
    });

    it('selectAudioLanguage() takes precedence over preferredAudioLanguage',
        function() {
          chooseStreams();
          canSwitch();
          player.configure({
            preferredAudioLanguage: 'en'
          });

          var period = manifest.periods[0];
          var spanishStream = period.variants[4].audio;
          var englishStream = period.variants[3].audio;

          expect(streamingEngine.switch).not.toHaveBeenCalled();
          player.selectAudioLanguage('es');

          expect(streamingEngine.switch)
              .toHaveBeenCalledWith(ContentType.AUDIO, spanishStream, true);
          expect(streamingEngine.switch)
              .not.toHaveBeenCalledWith(ContentType.AUDIO, englishStream, true);

        });

    it('selectTextLanguage() takes precedence over preferredTextLanguage',
        function() {
          chooseStreams();
          canSwitch();
          player.configure({
            preferredTextLanguage: 'es'
          });

          var period = manifest.periods[0];
          var spanishStream = period.textStreams[0];
          var englishStream = period.textStreams[1];

          expect(streamingEngine.switch).not.toHaveBeenCalled();
          player.selectTextLanguage('en');

          expect(streamingEngine.switch)
              .toHaveBeenCalledWith(ContentType.TEXT, englishStream, true);
          expect(streamingEngine.switch)
              .not.toHaveBeenCalledWith(ContentType.TEXT, spanishStream, true);

        });

    it('changing currentAudioLanguage changes active stream', function() {
      chooseStreams();
      canSwitch();

      var period = manifest.periods[0];
      var spanishStream = period.variants[4].audio;

      expect(streamingEngine.switch).not.toHaveBeenCalled();
      player.selectAudioLanguage('es');

      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.AUDIO, spanishStream, true);
    });

    it('changing currentTextLanguage changes active stream', function() {
      chooseStreams();
      canSwitch();

      var period = manifest.periods[0];
      var englishStream = period.textStreams[1];

      expect(streamingEngine.switch).not.toHaveBeenCalled();
      player.selectTextLanguage('en');

      expect(streamingEngine.switch)
          .toHaveBeenCalledWith(ContentType.TEXT, englishStream, true);
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
              .addVariant(0).language('pt').addAudio(0)
              .addVariant(1).language('en').addAudio(1)
              .addTextStream(2).language('pt')
              .addTextStream(3).language('fr')
           .build();

          var parser = new shaka.test.FakeManifestParser(manifest);
          var factory = function() { return parser; };
          player.load('', 0, factory)
              .then(function() {
                expect(player.isTextTrackVisible()).toBe(false);
                player.selectAudioLanguage('en');
                player.selectTextLanguage('fr');

                expect(player.isTextTrackVisible()).toBe(true);
              })
              .catch(fail)
              .then(done);
        });

    it('chooses an arbitrary language when none given', function(done) {
      // The Player shouldn't allow changing between languages, so it should
      // choose an arbitrary language when none is given.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0).language('pt').addAudio(0)
          .addVariant(1).language('en').addAudio(1)
       .build();

      player.configure({preferredAudioLanguage: undefined});

      var parser = new shaka.test.FakeManifestParser(manifest);
      var factory = function() { return parser; };
      player.load('', 0, factory)
          .then(function() {
            expect(abrManager.setVariants).toHaveBeenCalled();
            var variants = abrManager.setVariants.calls.argsFor(0)[0];
            expect(variants.length).toBe(1);
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
      var ContentType = shaka.util.ManifestParserUtils.ContentType;
      var generator = new shaka.test.ManifestGenerator().addPeriod(0);

      for (var i = 0; i < languages.length; i++) {
        var lang = languages[i];
        if (lang.charAt(0) == '*') {
          generator
            .addVariant(i)
              .primary()
              .language(lang.substr(1))
              .addAudio(i);
        } else {
          generator.addVariant(i).language(lang).addAudio(i);
        }
      }
      // A manifest we can use to test language selection.
      manifest = generator.build();

      var parser = new shaka.test.FakeManifestParser(manifest);
      var factory = function() { return parser; };
      player.load('', 0, factory)
          .then(function() {
            player.selectAudioLanguage(preference);
            player.selectTextLanguage(preference);

            var chosen = chooseStreams();
            expect(chosen[ContentType.AUDIO].id).toBe(expectedIndex);
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
          .addVariant(0)
            .bandwidth(200)
            .addAudio(1).bandwidth(100)
            .addVideo(4).bandwidth(100).size(100, 200)
          .addVariant(1)
            .bandwidth(300)
            .addAudio(1).bandwidth(100)
            .addVideo(5).bandwidth(200).size(200, 400)
          .addVariant(2)
            .bandwidth(300)
            .addAudio(2).bandwidth(200)
            .addVideo(4).bandwidth(100).size(100, 200)
          .addVariant(3)
            .bandwidth(400)
            .addAudio(2).bandwidth(200)
            .addVideo(5).bandwidth(200).size(200, 400)
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
        // checkHistory prepends the initial stream selections.
        checkHistory([]);
      });

      it('includes selectVariantTrack choices', function() {
        var track = player.getVariantTracks()[3];
        player.selectVariantTrack(track);

        var period = manifest.periods[0];
        var variant = shaka.util.StreamUtils.findVariantForTrack(period,
                                                                 track);

        checkHistory([{
          // We are using a mock date, so this is not a race.
          timestamp: Date.now() / 1000,
          id: variant.audio.id,
          type: ContentType.AUDIO,
          fromAdaptation: false
        },
        {
          timestamp: Date.now() / 1000,
          id: variant.video.id,
          type: ContentType.VIDEO,
          fromAdaptation: false
        }]);
      });

      it('includes adaptation choices', function() {
        var choices = {};
        choices[ContentType.AUDIO] = manifest.periods[0].variants[3].audio;
        choices[ContentType.VIDEO] = manifest.periods[0].variants[3].video;


        switch_(choices);
        checkHistory(jasmine.arrayContaining([
          {
            timestamp: Date.now() / 1000,
            id: choices[ContentType.AUDIO].id,
            type: ContentType.AUDIO,
            fromAdaptation: true
          },
          {
            timestamp: Date.now() / 1000,
            id: choices[ContentType.VIDEO].id,
            type: ContentType.VIDEO,
            fromAdaptation: true
          }
        ]));
      });

      it('ignores adaptation if stream is already active', function() {
        var choices = {};
        // This audio stream is already active.
        choices[ContentType.AUDIO] = manifest.periods[0].variants[1].audio;
        choices[ContentType.VIDEO] = manifest.periods[0].variants[1].video;

        switch_(choices);
        checkHistory([{
          timestamp: Date.now() / 1000,
          id: choices[ContentType.VIDEO].id,
          type: ContentType.VIDEO,
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
            type: ContentType.AUDIO,
            fromAdaptation: true
          },
          {
            timestamp: jasmine.any(Number),
            id: 4,
            type: ContentType.VIDEO,
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

    describe('.stateHistory', function() {
      it('begins with buffering state', function() {
        setBuffering(true);
        expect(player.getStats().stateHistory).toEqual([
          {
            // We are using a mock date, so this is not a race.
            timestamp: Date.now() / 1000,
            duration: 0,
            state: 'buffering'
          }
        ]);
      });

      it('transitions to paused if the video is paused', function() {
        setBuffering(true);
        video.paused = true;
        setBuffering(false);
        expect(player.getStats().stateHistory).toEqual([
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'buffering'
          },
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'paused'
          }
        ]);
      });

      it('transitions to playing if the video is playing', function() {
        setBuffering(true);
        video.paused = false;
        setBuffering(false);
        expect(player.getStats().stateHistory).toEqual([
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'buffering'
          },
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'playing'
          }
        ]);
      });

      it('transitions to ended when the video ends', function() {
        setBuffering(false);

        video.ended = true;
        // Fire an 'ended' event on the mock video.
        video.on['ended']();

        expect(player.getStats().stateHistory).toEqual([
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'playing'
          },
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'ended'
          }
        ]);
      });

      it('accumulates duration as time passes', function() {
        // We are using a mock date, so this is not a race.
        var bufferingStarts = Date.now() / 1000;
        setBuffering(true);

        expect(player.getStats().stateHistory).toEqual([
          {
            timestamp: bufferingStarts,
            duration: 0,
            state: 'buffering'
          }
        ]);

        jasmine.clock().tick(1500);
        expect(player.getStats().stateHistory).toEqual([
          {
            timestamp: bufferingStarts,
            duration: 1.5,
            state: 'buffering'
          }
        ]);

        var playbackStarts = Date.now() / 1000;
        setBuffering(false);
        jasmine.clock().tick(9000);
        expect(player.getStats().stateHistory).toEqual([
          {
            timestamp: bufferingStarts,
            duration: 1.5,
            state: 'buffering'
          },
          {
            timestamp: playbackStarts,
            duration: 9,
            state: 'playing'
          }
        ]);

      });

      /**
       * @param {boolean} buffering
       * @suppress {accessControls}
       */
      function setBuffering(buffering) {
        player.onBuffering_(buffering);
      }
    });
  });

  describe('restrictions', function() {
    var parser;
    var factory;

    it('switches if active is restricted by application', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(500)
                  .addVideo(1)
                .addVariant(1).bandwidth(100)
                  .addVideo(2)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).then(function() {
        var activeVariant = getActiveTrack('variant');
        expect(activeVariant.id).toBe(0);

        // AbrManager should choose the second track since the first is
        // restricted.
        abrManager.chooseIndex = 0;
        abrManager.chooseStreams.calls.reset();
        player.configure({restrictions: {maxBandwidth: 200}});
        expect(abrManager.chooseStreams).toHaveBeenCalled();
        expect(manifest.periods[0].variants[0].id).toBe(0);
        expect(manifest.periods[0].variants[0].allowedByApplication)
            .toBe(false);

        activeVariant = getActiveTrack('variant');
        expect(activeVariant.id).toBe(1);
      }).then(done);
    });

    it('switches if active key status is "output-restricted"', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        var activeVariant = getActiveTrack('variant');
        expect(activeVariant.id).toBe(0);

        // AbrManager should choose the second track since the first is
        // restricted.
        abrManager.chooseIndex = 0;
        abrManager.chooseStreams.calls.reset();
        onKeyStatus({'abc': 'output-restricted'});
        expect(abrManager.chooseStreams).toHaveBeenCalled();
        expect(manifest.periods[0].variants[0].id).toBe(0);
        expect(manifest.periods[0].variants[0].allowedByKeySystem)
            .toBe(false);

        activeVariant = getActiveTrack('variant');
        expect(activeVariant.id).toBe(1);
      }).then(done);
    });

    it('switches if active key status is "internal-error"', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        var activeVariant = getActiveTrack('variant');
        expect(activeVariant.id).toBe(0);

        // AbrManager should choose the second track since the first is
        // restricted.
        abrManager.chooseIndex = 0;
        abrManager.chooseStreams.calls.reset();
        onKeyStatus({'abc': 'internal-error'});
        expect(abrManager.chooseStreams).toHaveBeenCalled();
        expect(manifest.periods[0].variants[0].id).toBe(0);
        expect(manifest.periods[0].variants[0].allowedByKeySystem)
            .toBe(false);

        activeVariant = getActiveTrack('variant');
        expect(activeVariant.id).toBe(1);
      }).then(done);
    });

    it('doesn\'t switch if the active stream isn\'t restricted',
        function(done) {
          manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

          parser = new shaka.test.FakeManifestParser(manifest);
          factory = function() { return parser; };
          player.load('', 0, factory)
              .then(function() {
                // "initialize" the current period.
                chooseStreams();
                canSwitch();
                abrManager.chooseStreams.calls.reset();

                var activeVariant = getActiveTrack('variant');
                expect(activeVariant.id).toBe(0);

                onKeyStatus({'abc': 'usable'});
                expect(abrManager.chooseStreams).not.toHaveBeenCalled();

                activeVariant = getActiveTrack('variant');
                expect(activeVariant.id).toBe(0);
              })
              .catch(fail)
              .then(done);
        });

    it('removes if key status is "output-restricted"', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        expect(player.getVariantTracks().length).toBe(2);

        onKeyStatus({'abc': 'output-restricted'});

        var tracks = player.getVariantTracks();
        expect(tracks.length).toBe(1);
        expect(tracks[0].id).toBe(1);
      }).then(done);
    });

    it('removes if key status is "internal-error"', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        expect(player.getVariantTracks().length).toBe(2);

        onKeyStatus({'abc': 'internal-error'});

        var tracks = player.getVariantTracks();
        expect(tracks.length).toBe(1);
        expect(tracks[0].id).toBe(1);
      }).then(done);
    });

    it('removes if key system does not support codec', function(done) {
      // Should already be removed from filterPeriod_
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).mime('video/unsupported')
                .addVariant(1)
                  .addVideo(2)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        var tracks = player.getVariantTracks();
        expect(tracks.length).toBe(1);
        expect(tracks[0].id).toBe(1);
      }).then(done);
    });

    it('removes based on bandwidth', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(10)
                  .addVideo(1)
                .addVariant(1).bandwidth(1500)
                  .addVideo(2)
                .addVariant(2).bandwidth(500)
                  .addVideo(3)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        expect(player.getVariantTracks().length).toBe(3);

        player.configure(
            {restrictions: {minBandwidth: 100, maxBandwidth: 1000}});

        var tracks = player.getVariantTracks();
        expect(tracks.length).toBe(1);
        expect(tracks[0].id).toBe(2);
      }).then(done);
    });

    it('removes based on pixels', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(900, 900)
                .addVariant(1)
                  .addVideo(2).size(5, 5)
                .addVariant(2)
                  .addVideo(3).size(190, 190)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        expect(player.getVariantTracks().length).toBe(3);

        player.configure(
            {restrictions: {minPixels: 100, maxPixels: 800 * 800}});

        var tracks = player.getVariantTracks();
        expect(tracks.length).toBe(1);
        expect(tracks[0].id).toBe(2);
      }).then(done);
    });

    it('removes based on width', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(5, 5)
                .addVariant(1)
                  .addVideo(2).size(1500, 200)
                .addVariant(2)
                  .addVideo(3).size(190, 190)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        expect(player.getVariantTracks().length).toBe(3);

        player.configure({restrictions: {minWidth: 100, maxWidth: 1000}});

        var tracks = player.getVariantTracks();
        expect(tracks.length).toBe(1);
        expect(tracks[0].id).toBe(2);
      }).then(done);
    });

    it('removes based on height', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(5, 5)
                .addVariant(1)
                  .addVideo(2).size(200, 1500)
                .addVariant(2)
                  .addVideo(3).size(190, 190)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        expect(player.getVariantTracks().length).toBe(3);

        player.configure({restrictions: {minHeight: 100, maxHeight: 1000}});

        var tracks = player.getVariantTracks();
        expect(tracks.length).toBe(1);
        expect(tracks[0].id).toBe(2);
      }).then(done);
    });

    it('removes the whole variant if one of the streams is restricted',
        function(done) {
          manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(5, 5)
                  .addAudio(2)
                .addVariant(1)
                  .addVideo(3).size(190, 190)
                  .addAudio(4)
              .build();

          parser = new shaka.test.FakeManifestParser(manifest);
          factory = function() { return parser; };
          player.load('', 0, factory).then(function() {
            // "initialize" the current period.
            chooseStreams();
            canSwitch();
          }).catch(fail).then(function() {
            expect(player.getVariantTracks().length).toBe(2);

            player.configure({restrictions: {minHeight: 100, maxHeight: 1000}});

            var tracks = player.getVariantTracks();
            expect(tracks.length).toBe(1);
            expect(tracks[0].id).toBe(1);
          }).then(done);
        });

    it('issues error if no streams are playable', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(5, 5)
                .addVariant(1)
                  .addVideo(2).size(200, 300)
                .addVariant(2)
                  .addVideo(3).size(190, 190)
              .build();

      parser = new shaka.test.FakeManifestParser(manifest);
      factory = function() { return parser; };
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams();
        canSwitch();
      }).catch(fail).then(function() {
        expect(player.getVariantTracks().length).toBe(3);

        onError.and.callFake(function(e) {
          var error = e.detail;
          shaka.test.Util.expectToEqualError(
              error,
              new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.MANIFEST,
                  shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET));
        });

        player.configure({restrictions: {minHeight: 1000, maxHeight: 2000}});
        expect(onError).toHaveBeenCalled();
      }).then(done);
    });

    /**
     * Gets the currently active track.
     * @param {string} type
     * @return {shakaExtern.Track}
     */
    function getActiveTrack(type) {
      var activeTracks = player.getVariantTracks().filter(function(track) {
        return track.type == type && track.active;
      });

      expect(activeTracks.length).toBe(1);
      return activeTracks[0];
    }

    /**
     * @param {!Object.<string, string>} keyStatusMap
     * @suppress {accessControls}
     */
    function onKeyStatus(keyStatusMap) {
      player.onKeyStatus_(keyStatusMap);
    }
  });

  describe('getPlayheadTimeAsDate()', function() {
    beforeEach(function(done) {
      var timeline = new shaka.media.PresentationTimeline(300, 0);
      timeline.setStatic(false);
      manifest = new shaka.test.ManifestGenerator()
          .setTimeline(timeline)
          .addPeriod(0)
            .addVariant(0)
            .addVideo(1)
          .build();
      goog.asserts.assert(manifest, 'manifest must be non-null');
      var parser = new shaka.test.FakeManifestParser(manifest);
      var factory = function() { return parser; };
      player.load('', 0, factory).catch(fail).then(done);
    });

    it('gets current wall clock time in UTC', function() {
      var liveTimeUtc = player.getPlayheadTimeAsDate();
      expect(liveTimeUtc).toEqual(new Date(320000));
    });
  });

  it('rejects empty manifests', function(done) {
    var emptyManifest = new shaka.test.ManifestGenerator().build();
    var emptyParser = new shaka.test.FakeManifestParser(emptyManifest);
    var emptyFactory = function() { return emptyParser; };

    player.load('', 0, emptyFactory).then(fail).catch(function(error) {
      shaka.test.Util.expectToEqualError(
          error,
          new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.NO_PERIODS));
    }).then(done);
  });


  /**
   * Choose streams for the given period.
   *
   * @suppress {accessControls}
   * @return {!Object.<string, !shakaExtern.Stream>}
   */
  function chooseStreams() {
    var period = manifest.periods[0];
    player.manifest_ = manifest;
    player.streamingEngine_ = player.createStreamingEngine();
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
