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
  var logErrorSpy;
  var manifest;
  var player;
  var streamingEngine;
  var video;

  beforeAll(function() {
    originalLogError = shaka.log.error;

    logErrorSpy = jasmine.createSpy('shaka.log.error');
    shaka.log.error = logErrorSpy;
  });

  beforeEach(function() {
    // By default, errors are a failure.
    logErrorSpy.calls.reset();
    logErrorSpy.and.callFake(fail);

    video = createMockVideo();
    var netEngine = new shaka.test.FakeNetworkingEngine({}, new ArrayBuffer(0));
    player = new shaka.Player(video);
    player.setNetworkingEngine(netEngine);
    abrManager = new shaka.test.FakeAbrManager();
    player.configure(
        /** @type {shakaExtern.PlayerConfiguration} */ (
            {abr: {manager: abrManager}}));

    player.loadInternal = function() {
      return Promise.resolve({
        drmEngine: new shaka.test.FakeDrmEngine(),
        manifest: manifest,
        manifestParser: null
      });
    };
    player.createPlayhead = function() { return {destroy: function() {}}; };
    player.createMediaSource = function() { return Promise.resolve(); };
    player.createMediaSourceEngine = function() {
      return {destroy: function() {}};
    };
    player.createStreamingEngine = function() {
      // This captures the variable |manifest| so this should only be used after
      // the manifest has been set.
      var period = manifest.periods[0];
      streamingEngine = new shaka.test.FakeStreamingEngine(period);
      return streamingEngine;
    };
  });

  afterAll(function() {
    shaka.log.error = originalLogError;
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
      logErrorSpy.and.stub();
      var goodCustomScheme = function(node) {};
      var badCustomScheme1 = function() {};  // too few args
      var badCustomScheme2 = function(x, y) {};  // too many args

      // Takes good callback.
      player.configure({
        manifest: { dash: { customScheme: goodCustomScheme } }
      });

      var newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(goodCustomScheme);
      expect(logErrorSpy).not.toHaveBeenCalled();

      // Doesn't take bad callback #1, refuses to overwrite good callback.
      logErrorSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: badCustomScheme1 } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(goodCustomScheme);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.manifest.dash.customScheme'));

      // Doesn't take bad callback #2, refuses to overwrite good callback.
      logErrorSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: badCustomScheme2 } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(goodCustomScheme);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.manifest.dash.customScheme'));

      // Resets to default if undefined.
      logErrorSpy.calls.reset();
      player.configure({
        manifest: { dash: { customScheme: undefined } }
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).not.toBe(goodCustomScheme);
      expect(logErrorSpy).not.toHaveBeenCalled();
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

    beforeAll(function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addStreamSet('audio')
            .language('en')
            .addStream(1).bandwidth(100)
            .addStream(2).bandwidth(100)
          .addStreamSet('video')
            .addStream(4).bandwidth(100).size(100, 200)
            .addStream(5).bandwidth(200).size(200, 400)
          .addStreamSet('text')
            .language('es')
            .addStream(6).bandwidth(100).kind('caption')
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
          height: null
        },
        {
          id: 2,
          active: false,
          type: 'audio',
          bandwidth: 100,
          language: 'en',
          kind: null,
          width: null,
          height: null
        },
        {
          id: 4,
          active: true,
          type: 'video',
          bandwidth: 100,
          language: 'und',
          kind: null,
          width: 100,
          height: 200
        },
        {
          id: 5,
          active: false,
          type: 'video',
          bandwidth: 200,
          language: 'und',
          kind: null,
          width: 200,
          height: 400
        },
        {
          id: 6,
          active: true,
          type: 'text',
          bandwidth: 100,
          language: 'es',
          kind: 'caption',
          width: null,
          height: null
        }
      ];
    });

    beforeEach(function(done) {
      var factory = shaka.test.FakeManifestParser.createFactory(manifest);
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

    it('doesn\'t disables AbrManager if switching text', function() {
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
         manifest = new shaka.test.ManifestGenerator()
           .addPeriod(0)
             .addStreamSet('audio').language('pt').addStream(0)
             .addStreamSet('audio').language('en').addStream(1)
             .addStreamSet('text').language('pt').addStream(2)
             .addStreamSet('text').language('fr').addStream(3)
          .build();

         var factory = shaka.test.FakeManifestParser.createFactory(manifest);
         player.load('', 0, factory)
             .then(function() {
               expect(player.isTextTrackVisible()).toBe(false);
               player.configure(
                   {preferredAudioLanguage: 'en', preferredTextLanguage: 'fr'});
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
      manifest = generator.build();

      var factory = shaka.test.FakeManifestParser.createFactory(manifest);
      player.load('', 0, factory)
          .then(function() {
            player.configure({
              preferredAudioLanguage: preference,
              preferredTextLanguage: preference
            });

            var chosen = chooseStreams(manifest.periods[0]);
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
    });

    beforeEach(function(done) {
      var factory = shaka.test.FakeManifestParser.createFactory(manifest);
      player.load('', 0, factory)
          .then(function() {
            // "initialize" the current period.
            chooseStreams(manifest.periods[0]);
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

      var factory = shaka.test.FakeManifestParser.createFactory(manifest);
      player.load('', 0, factory).then(function() {
        // "initialize" the current period.
        chooseStreams(manifest.periods[0]);
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

    it('switches if active is restricted by key status', function() {
      var activeVideo = getActiveTrack('video');
      expect(activeVideo.id).toBe(4);

      // AbrManager should choose the second track since the first is
      // restricted.
      abrManager.chooseIndex = 1;
      abrManager.chooseStreams.calls.reset();
      onKeyStatus({'abc': 'expired'});
      expect(abrManager.chooseStreams).toHaveBeenCalled();
      expect(manifest.periods[0].streamSets[1].streams[0].id).toBe(4);
      expect(manifest.periods[0].streamSets[1].streams[0].allowedByKeySystem)
          .toBe(false);

      activeVideo = getActiveTrack('video');
      expect(activeVideo.id).toBe(5);
    });

    it('removes based on key status', function() {
      expect(player.getTracks().length).toBe(9);

      onKeyStatus({'abc': 'expired'});

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
                shaka.util.Error.Code.ALL_STREAMS_RESTRICTED));
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
   * @param {!Object=} opt_period
   * @suppress {accessControls}
   */
  function chooseStreams(opt_period) {
    var period =
        opt_period || (manifest && manifest.periods[0]) || {streamSets: []};
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

  function createMockVideo() {
    var video = {
      src: '',
      textTracks: [],
      addTextTrack: jasmine.createSpy('addTextTrack'),
      addEventListener: jasmine.createSpy('addEventListener'),
      removeEventListener: jasmine.createSpy('removeEventListener'),
      removeAttribute: jasmine.createSpy('removeAttribute'),
      load: jasmine.createSpy('load'),
      dispatchEvent: jasmine.createSpy('dispatchEvent'),
      on: {}  // event listeners
    };
    video.addTextTrack.and.callFake(function(kind, id) {
      var track = createMockTextTrack();
      video.textTracks.push(track);
      return track;
    });
    video.addEventListener.and.callFake(function(name, callback) {
      video.on[name] = callback;
    });
    return video;
  }

  function createMockTextTrack() {
    // TODO: mock TextTrack, if/when Player starts directly accessing it.
    return {};
  }
});
