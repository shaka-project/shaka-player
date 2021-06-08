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
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const Util = shaka.test.Util;

  const originalLogError = shaka.log.error;
  const originalLogWarn = shaka.log.warning;
  const originalLogAlwaysWarn = shaka.log.alwaysWarn;
  const originalIsTypeSupported = window.MediaSource.isTypeSupported;

  const fakeManifestUri = 'fake-manifest-uri';

  /** @type {!jasmine.Spy} */
  let logErrorSpy;
  /** @type {!jasmine.Spy} */
  let logWarnSpy;
  /** @type {!jasmine.Spy} */
  let onError;
  /** @type {shaka.extern.Manifest} */
  let manifest;
  /** @type {number} */
  let periodIndex;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.test.FakeAbrManager} */
  let abrManager;
  /** @type {function():shaka.extern.AbrManager} */
  let abrFactory;

  /** @type {!shaka.test.FakeNetworkingEngine} */
  let networkingEngine;
  /** @type {!shaka.test.FakeStreamingEngine} */
  let streamingEngine;
  /** @type {!shaka.test.FakeDrmEngine} */
  let drmEngine;
  /** @type {!shaka.test.FakePlayhead} */
  let playhead;
  /** @type {!shaka.test.FakeTextDisplayer} */
  let textDisplayer;
  /** @type {function():shaka.extern.TextDisplayer} */
  let textDisplayFactory;

  let mediaSourceEngine;

  /** @type {!shaka.test.FakeVideo} */
  let video;

  beforeEach(() => {
    // By default, errors are a failure.
    logErrorSpy = jasmine.createSpy('shaka.log.error');
    logErrorSpy.calls.reset();
    shaka.log.error = shaka.test.Util.spyFunc(logErrorSpy);
    shaka.log.alwaysError = shaka.test.Util.spyFunc(logErrorSpy);

    logWarnSpy = jasmine.createSpy('shaka.log.warning');
    logErrorSpy.and.callFake(fail);
    shaka.log.warning = shaka.test.Util.spyFunc(logWarnSpy);
    shaka.log.alwaysWarn = shaka.test.Util.spyFunc(logWarnSpy);

    // Since this is not an integration test, we don't want MediaSourceEngine to
    // fail assertions based on browser support for types.  Pretend that all
    // video and audio types are supported.
    window.MediaSource.isTypeSupported = function(mimeType) {
      let type = mimeType.split('/')[0];
      return type == 'video' || type == 'audio';
    };

    // Many tests assume the existence of a manifest, so create a basic one.
    // Test suites can override this with more specific manifests.
    manifest = new shaka.test.ManifestGenerator()
      .addPeriod(0)
        .addVariant(0)
          .addAudio(1)
          .addVideo(2)
      .addPeriod(1)
        .addVariant(1)
          .addAudio(3)
          .addVideo(4)
      .build();
    periodIndex = 0;

    abrManager = new shaka.test.FakeAbrManager();
    abrFactory = function() { return abrManager; };

    textDisplayer = createTextDisplayer();
    textDisplayFactory = function() { return textDisplayer; };

    function dependencyInjector(player) {
      // Create a networking engine that always returns an empty buffer.
      networkingEngine = new shaka.test.FakeNetworkingEngine();
      networkingEngine.setDefaultValue(new ArrayBuffer(0));

      drmEngine = new shaka.test.FakeDrmEngine();
      playhead = new shaka.test.FakePlayhead();
      streamingEngine = new shaka.test.FakeStreamingEngine(
          onChooseStreams, onCanSwitch);
      mediaSourceEngine = {
        init: jasmine.createSpy('init').and.returnValue(Promise.resolve()),
        open: jasmine.createSpy('open').and.returnValue(Promise.resolve()),
        destroy: jasmine.createSpy('destroy').and.
            returnValue(Promise.resolve()),
        setUseEmbeddedText: jasmine.createSpy('setUseEmbeddedText'),
        getUseEmbeddedText: jasmine.createSpy('getUseEmbeddedText'),
        getTextDisplayer: () => textDisplayer,
        ended: jasmine.createSpy('ended').and.returnValue(false),
      };

      player.createDrmEngine = function() { return drmEngine; };
      player.createNetworkingEngine = function() { return networkingEngine; };
      player.createPlayhead = function() { return playhead; };
      player.createMediaSourceEngine = function() { return mediaSourceEngine; };
      player.createStreamingEngine = function() { return streamingEngine; };
    }

    video = new shaka.test.FakeVideo(20);
    player = new shaka.Player(video, dependencyInjector);
    player.configure({
      // Ensures we don't get a warning about missing preference.
      preferredAudioLanguage: 'en',
      abrFactory: abrFactory,
      textDisplayFactory: textDisplayFactory,
    });

    onError = jasmine.createSpy('error event');
    onError.and.callFake(function(event) {
      fail(event.detail);
    });
    player.addEventListener('error', shaka.test.Util.spyFunc(onError));
  });

  afterEach(async () => {
    try {
      await player.destroy();
    } finally {
      shaka.log.error = originalLogError;
      shaka.log.alwaysError = originalLogError;
      shaka.log.warning = originalLogWarn;
      shaka.log.alwaysWarn = originalLogAlwaysWarn;
      window.MediaSource.isTypeSupported = originalIsTypeSupported;
    }
  });

  describe('destroy', function() {
    it('cleans up all dependencies', async () => {
      goog.asserts.assert(manifest, 'Manifest should be non-null');
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };

      await player.load(fakeManifestUri, 0, factory);
      await player.destroy();

      expect(abrManager.stop).toHaveBeenCalled();
      expect(networkingEngine.destroy).toHaveBeenCalled();
      expect(drmEngine.destroy).toHaveBeenCalled();
      expect(playhead.release).toHaveBeenCalled();
      expect(mediaSourceEngine.destroy).toHaveBeenCalled();
      expect(streamingEngine.destroy).toHaveBeenCalled();
    });

    it('destroys mediaSourceEngine before drmEngine', async () => {
      goog.asserts.assert(manifest, 'Manifest should be non-null');
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };

      mediaSourceEngine.destroy.and.callFake(() => {
        expect(drmEngine.destroy).not.toHaveBeenCalled();
        return Util.delay(0.01).then(() => {
          expect(drmEngine.destroy).not.toHaveBeenCalled();
        });
      });

      await player.load(fakeManifestUri, 0, factory);
      await player.destroy();

      expect(mediaSourceEngine.destroy).toHaveBeenCalled();
      expect(drmEngine.destroy).toHaveBeenCalled();
    });

    // TODO(vaage): Re-enable once the parser is integrated into the load graph
    //              better.
    xit('destroys parser first when interrupting load', function(done) {
      let p = shaka.test.Util.delay(0.3);
      let parser = new shaka.test.FakeManifestParser(manifest);
      parser.start.and.returnValue(p);
      parser.stop.and.callFake(function() {
        expect(abrManager.stop).not.toHaveBeenCalled();
        expect(networkingEngine.destroy).not.toHaveBeenCalled();
      });
      let factory = function() { return parser; };

      player.load(fakeManifestUri, 0, factory).then(fail).catch(() => {});
      shaka.test.Util.delay(0.1).then(function() {
        player.destroy().catch(fail).then(function() {
          expect(abrManager.stop).toHaveBeenCalled();
          expect(networkingEngine.destroy).toHaveBeenCalled();
          expect(parser.stop).toHaveBeenCalled();
        }).then(done);
      });
    });
  });

  describe('load/unload', function() {
    /** @type {!shaka.test.FakeManifestParser} */
    let parser1;
    /** @type {!Function} */
    let factory1;
    /** @type {!jasmine.Spy} */
    let checkError;

    beforeEach(function() {
      goog.asserts.assert(manifest, 'manifest must be non-null');
      parser1 = new shaka.test.FakeManifestParser(manifest);
      factory1 = function() { return parser1; };

      checkError = jasmine.createSpy('checkError');
      checkError.and.callFake(function(error) {
        expect(error.code).toBe(shaka.util.Error.Code.LOAD_INTERRUPTED);
      });
    });

    describe('streaming event', function() {
      /** @type {jasmine.Spy} */
      let streamingListener;

      beforeEach(function() {
        streamingListener = jasmine.createSpy('listener');
        player.addEventListener('streaming', Util.spyFunc(streamingListener));

        // We must have two different sets of codecs for some of our tests.
        manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0)
              .addAudio(1).mime('audio/mp4', 'mp4a.40.2')
              .addVideo(2).mime('video/mp4', 'avc1.4d401f')
            .addVariant(1)
              .addAudio(3).mime('audio/webm', 'opus')
              .addVideo(4).mime('video/webm', 'vp9')
          .build();

        parser1 = new shaka.test.FakeManifestParser(manifest);
      });

      async function runTest() {
        expect(streamingListener).not.toHaveBeenCalled();
        await player.load(fakeManifestUri, 0, factory1);
        expect(streamingListener).toHaveBeenCalled();
      }

      it('fires after tracks exist', async () => {
        streamingListener.and.callFake(function() {
          const tracks = player.getVariantTracks();
          expect(tracks).toBeDefined();
          expect(tracks.length).toBeGreaterThan(0);
        });
        await runTest();
      });

      it('fires before any tracks are active', async () => {
        streamingListener.and.callFake(function() {
          const activeTracks =
            player.getVariantTracks().filter((t) => t.active);
          expect(activeTracks.length).toEqual(0);
        });
        await runTest();
      });

      // We used to fire the event /before/ filtering, which meant that for
      // multi-codec content, the application might select something which will
      // later be removed during filtering.
      // https://github.com/google/shaka-player/issues/1119
      it('fires after tracks have been filtered', async () => {
        streamingListener.and.callFake(function() {
          const tracks = player.getVariantTracks();
          // Either WebM, or MP4, but not both.
          expect(tracks.length).toEqual(1);
        });
        await runTest();
      });
    });

    describe('setTextTrackVisibility', function() {
      beforeEach(function() {
        manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0)
              .addAudio(1)
              .addVideo(2)
            .addTextStream(3)
              .language('es').label('Spanish')
              .bandwidth(100).mime('text/vtt')
              .kind('caption')
          .build();
      });

      it('load text stream if caption is visible', async () => {
        await player.load(fakeManifestUri, 0, returnManifest(manifest));
        await player.setTextTrackVisibility(true);
        expect(streamingEngine.loadNewTextStream).toHaveBeenCalled();
        expect(streamingEngine.getBufferingText()).not.toBe(null);
      });

      it('does not load text stream if caption is invisible', async () => {
        await player.load(fakeManifestUri, 0, returnManifest(manifest));
        await player.setTextTrackVisibility(false);
        expect(streamingEngine.loadNewTextStream).not.toHaveBeenCalled();
        expect(streamingEngine.getBufferingText()).toBe(null);
      });

      it('loads text stream if alwaysStreamText is set', async () => {
        await player.setTextTrackVisibility(false);
        player.configure({streaming: {alwaysStreamText: true}});

        await player.load(fakeManifestUri, 0, returnManifest(manifest));
        expect(streamingEngine.getBufferingText()).not.toBe(null);

        await player.setTextTrackVisibility(true);
        expect(streamingEngine.loadNewTextStream).not.toHaveBeenCalled();
        expect(streamingEngine.unloadTextStream).not.toHaveBeenCalled();

        await player.setTextTrackVisibility(false);
        expect(streamingEngine.loadNewTextStream).not.toHaveBeenCalled();
        expect(streamingEngine.unloadTextStream).not.toHaveBeenCalled();
      });
    });
  });  // describe('load/unload')

  describe('getConfiguration', function() {
    it('returns a copy of the configuration', function() {
      let config1 = player.getConfiguration();
      config1.streaming.bufferBehind = -99;
      let config2 = player.getConfiguration();
      expect(config1.streaming.bufferBehind).not.toEqual(
          config2.streaming.bufferBehind);
    });
  });

  describe('configure', function() {
    it('overwrites defaults', function() {
      let defaultConfig = player.getConfiguration();
      // Make sure the default differs from our test value:
      expect(defaultConfig.drm.retryParameters.backoffFactor).not.toBe(5);
      expect(defaultConfig.manifest.retryParameters.backoffFactor).not.toBe(5);

      player.configure({
        drm: {
          retryParameters: {backoffFactor: 5},
        },
      });

      let newConfig = player.getConfiguration();
      // Make sure we changed the backoff for DRM, but not for manifests:
      expect(newConfig.drm.retryParameters.backoffFactor).toBe(5);
      expect(newConfig.manifest.retryParameters.backoffFactor).not.toBe(5);
    });

    it('reverts to defaults when undefined is given', function() {
      player.configure({
        streaming: {
          retryParameters: {backoffFactor: 5},
          bufferBehind: 7,
        },
      });

      let newConfig = player.getConfiguration();
      expect(newConfig.streaming.retryParameters.backoffFactor).toBe(5);
      expect(newConfig.streaming.bufferBehind).toBe(7);

      player.configure({
        streaming: {
          retryParameters: undefined,
        },
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
      let defaultConfig = player.getConfiguration();

      // Try a bogus bufferBehind (string instead of number)
      player.configure({
        streaming: {bufferBehind: '77'},
      });

      let newConfig = player.getConfiguration();
      expect(newConfig).toEqual(defaultConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.streaming.bufferBehind'));

      // Try a bogus streaming config (number instead of Object)
      logErrorSpy.calls.reset();
      player.configure({
        streaming: 5,
      });

      newConfig = player.getConfiguration();
      expect(newConfig).toEqual(defaultConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.streaming'));
    });

    it('accepts synchronous function values for async function fields', () => {
      const defaultConfig = player.getConfiguration();

      // Make sure the default is async, or the test is invalid.
      const AsyncFunction = (async () => {}).constructor;
      expect(defaultConfig.offline.trackSelectionCallback.constructor)
          .toBe(AsyncFunction);

      // Try a synchronous callback.
      player.configure('offline.trackSelectionCallback', () => {});
      // If this fails, an error log will trigger test failure.
    });

    it('expands dictionaries that allow arbitrary keys', function() {
      player.configure({
        drm: {servers: {'com.widevine.alpha': 'http://foo/widevine'}},
      });

      let newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine',
      });

      player.configure({
        drm: {servers: {'com.microsoft.playready': 'http://foo/playready'}},
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine',
        'com.microsoft.playready': 'http://foo/playready',
      });
    });

    it('expands dictionaries but still restricts their values', function() {
      // Try a bogus server value (number instead of string)
      logErrorSpy.and.stub();
      player.configure({
        drm: {servers: {'com.widevine.alpha': 7}},
      });

      let newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({});
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.drm.servers.com.widevine.alpha'));

      // Try a valid advanced config.
      logErrorSpy.calls.reset();
      player.configure({
        drm: {advanced: {'ks1': {distinctiveIdentifierRequired: true}}},
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.advanced).toEqual({
        'ks1': jasmine.objectContaining({distinctiveIdentifierRequired: true}),
      });
      expect(logErrorSpy).not.toHaveBeenCalled();
      let lastGoodConfig = newConfig;

      // Try an invalid advanced config key.
      player.configure({
        drm: {advanced: {'ks1': {bogus: true}}},
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
            'com.microsoft.playready': 'http://foo/playready',
          },
        },
      });

      let newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.widevine.alpha': 'http://foo/widevine',
        'com.microsoft.playready': 'http://foo/playready',
      });

      player.configure({
        drm: {servers: {'com.widevine.alpha': undefined}},
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({
        'com.microsoft.playready': 'http://foo/playready',
      });

      player.configure({
        drm: {servers: undefined},
      });

      newConfig = player.getConfiguration();
      expect(newConfig.drm.servers).toEqual({});
    });

    it('checks the number of arguments to functions', function() {
      let goodCustomScheme = function(node) {};
      let badCustomScheme1 = function() {};  // too few args
      let badCustomScheme2 = function(x, y) {};  // too many args

      // Takes good callback.
      player.configure({
        manifest: {dash: {customScheme: goodCustomScheme}},
      });

      let newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(goodCustomScheme);
      expect(logWarnSpy).not.toHaveBeenCalled();

      // Warns about bad callback #1, still takes it.
      logWarnSpy.calls.reset();
      player.configure({
        manifest: {dash: {customScheme: badCustomScheme1}},
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(badCustomScheme1);
      expect(logWarnSpy).toHaveBeenCalledWith(
          stringContaining('.manifest.dash.customScheme'));

      // Warns about bad callback #2, still takes it.
      logWarnSpy.calls.reset();
      player.configure({
        manifest: {dash: {customScheme: badCustomScheme2}},
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).toBe(badCustomScheme2);
      expect(logWarnSpy).toHaveBeenCalledWith(
          stringContaining('.manifest.dash.customScheme'));

      // Resets to default if undefined.
      logWarnSpy.calls.reset();
      player.configure({
        manifest: {dash: {customScheme: undefined}},
      });

      newConfig = player.getConfiguration();
      expect(newConfig.manifest.dash.customScheme).not.toBe(badCustomScheme2);
      expect(logWarnSpy).not.toHaveBeenCalled();
    });

    // Regression test for https://github.com/google/shaka-player/issues/784
    it('does not throw when overwriting serverCertificate', function() {
      player.configure({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              serverCertificate: new Uint8Array(1),
            },
          },
        },
      });

      player.configure({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              serverCertificate: new Uint8Array(2),
            },
          },
        },
      });
    });

    it('checks the type of serverCertificate', function() {
      logErrorSpy.and.stub();

      player.configure({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              serverCertificate: null,
            },
          },
        },
      });

      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.serverCertificate'));

      logErrorSpy.calls.reset();
      player.configure({
        drm: {
          advanced: {
            'com.widevine.alpha': {
              serverCertificate: 'foobar',
            },
          },
        },
      });

      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.serverCertificate'));
    });

    it('does not throw when null appears instead of an object', function() {
      logErrorSpy.and.stub();

      player.configure({
        drm: {advanced: null},
      });

      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.drm.advanced'));
    });

    it('configures play and seek range for VOD', async () => {
      player.configure({playRangeStart: 5, playRangeEnd: 10});
      let timeline = new shaka.media.PresentationTimeline(300, 0);
      timeline.setStatic(true);
      manifest = new shaka.test.ManifestGenerator()
          .setTimeline(timeline)
          .addPeriod(0)
            .addVariant(0)
              .addVideo(1)
          .build();
      goog.asserts.assert(manifest, 'manifest must be non-null');
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      await player.load(fakeManifestUri, 0, factory);
      let seekRange = player.seekRange();
      expect(seekRange.start).toBe(5);
      expect(seekRange.end).toBe(10);
    });

    it('does not switch for plain configuration changes', async () => {
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };

      let switchVariantSpy = spyOn(player, 'switchVariant_');

      await player.load(fakeManifestUri, 0, factory);

      player.configure({abr: {enabled: false}});
      player.configure({streaming: {bufferingGoal: 9001}});

      // Delay to ensure that the switch would have been called.
      await shaka.test.Util.delay(0.1);

      expect(switchVariantSpy).not.toHaveBeenCalled();
    });

    it('accepts parameters in a (fieldName, value) format', function() {
      let oldConfig = player.getConfiguration();
      let oldDelayLicense = oldConfig.drm.delayLicenseRequestUntilPlayed;
      let oldSwitchInterval = oldConfig.abr.switchInterval;
      let oldPreferredLang = oldConfig.preferredAudioLanguage;

      expect(oldDelayLicense).toBe(false);
      expect(oldSwitchInterval).toBe(8);
      expect(oldPreferredLang).toBe('en');

      player.configure('drm.delayLicenseRequestUntilPlayed', true);
      player.configure('abr.switchInterval', 10);
      player.configure('preferredAudioLanguage', 'fr');

      let newConfig = player.getConfiguration();
      let newDelayLicense = newConfig.drm.delayLicenseRequestUntilPlayed;
      let newSwitchInterval = newConfig.abr.switchInterval;
      let newPreferredLang = newConfig.preferredAudioLanguage;

      expect(newDelayLicense).toBe(true);
      expect(newSwitchInterval).toBe(10);
      expect(newPreferredLang).toBe('fr');
    });

    it('accepts escaped "." in names', () => {
      const convert = (name, value) => {
        return shaka.util.ConfigUtils.convertToConfigObject(name, value);
      };

      expect(convert('foo', 1)).toEqual({foo: 1});
      expect(convert('foo.bar', 1)).toEqual({foo: {bar: 1}});
      expect(convert('foo..bar', 1)).toEqual({foo: {'': {bar: 1}}});
      expect(convert('foo.bar.baz', 1)).toEqual({foo: {bar: {baz: 1}}});
      expect(convert('foo.bar\\.baz', 1)).toEqual({foo: {'bar.baz': 1}});
      expect(convert('foo.baz.', 1)).toEqual({foo: {baz: {'': 1}}});
      expect(convert('foo.baz\\.', 1)).toEqual({foo: {'baz.': 1}});
      expect(convert('foo\\.bar', 1)).toEqual({'foo.bar': 1});
      expect(convert('.foo', 1)).toEqual({'': {foo: 1}});
      expect(convert('\\.foo', 1)).toEqual({'.foo': 1});
    });

    it('returns whether the config was valid', function() {
      logErrorSpy.and.stub();
      expect(player.configure({streaming: {bufferBehind: '77'}})).toBe(false);
      expect(player.configure({streaming: {bufferBehind: 77}})).toBe(true);
    });

    it('still sets other fields when there are errors', function() {
      logErrorSpy.and.stub();

      let changes = {
        manifest: {foobar: false},
        streaming: {bufferBehind: 77},
      };
      expect(player.configure(changes)).toBe(false);

      let newConfig = player.getConfiguration();
      expect(newConfig.streaming.bufferBehind).toEqual(77);
    });

    // https://github.com/google/shaka-player/issues/1524
    it('does not pollute other advanced DRM configs', () => {
      player.configure('drm.advanced.foo', {});
      player.configure('drm.advanced.bar', {});
      const fooConfig1 = player.getConfiguration().drm.advanced.foo;
      const barConfig1 = player.getConfiguration().drm.advanced.bar;
      expect(fooConfig1.distinctiveIdentifierRequired).toEqual(false);
      expect(barConfig1.distinctiveIdentifierRequired).toEqual(false);

      player.configure('drm.advanced.foo.distinctiveIdentifierRequired', true);
      const fooConfig2 = player.getConfiguration().drm.advanced.foo;
      const barConfig2 = player.getConfiguration().drm.advanced.bar;
      expect(fooConfig2.distinctiveIdentifierRequired).toEqual(true);
      expect(barConfig2.distinctiveIdentifierRequired).toEqual(false);
    });
  });

  describe('resetConfiguration', function() {
    it('resets configurations to default', () => {
      const default_ = player.getConfiguration().streaming.bufferingGoal;
      expect(default_).not.toBe(100);
      player.configure('streaming.bufferingGoal', 100);
      expect(player.getConfiguration().streaming.bufferingGoal).toBe(100);
      player.resetConfiguration();
      expect(player.getConfiguration().streaming.bufferingGoal).toBe(default_);
    });

    it('resets the arbitrary keys', () => {
      player.configure('drm.servers.org\\.w3\\.clearKey', 'http://foo.com');
      expect(player.getConfiguration().drm.servers).toEqual({
        'org.w3.clearKey': 'http://foo.com',
      });
      player.resetConfiguration();
      expect(player.getConfiguration().drm.servers).toEqual({});
    });

    it('keeps shared configuration the same', () => {
      const config = player.getSharedConfiguration();
      player.resetConfiguration();
      expect(player.getSharedConfiguration()).toBe(config);
    });
  });

  describe('AbrManager', function() {
    /** @type {!shaka.test.FakeManifestParser} */
    let parser;
    /** @type {!Function} */
    let parserFactory;

    beforeEach(function() {
      goog.asserts.assert(manifest, 'manifest must be non-null');
      parser = new shaka.test.FakeManifestParser(manifest);
      parserFactory = function() { return parser; };
    });

    it('sets through load', async () => {
      await player.load(fakeManifestUri, 0, parserFactory);
      expect(abrManager.init).toHaveBeenCalled();
    });

    it('calls chooseVariant', async () => {
      await player.load(fakeManifestUri, 0, parserFactory);
      expect(abrManager.chooseVariant).toHaveBeenCalled();
    });

    it('does not enable before stream startup', async () => {
      await player.load(fakeManifestUri, 0, parserFactory);
      expect(abrManager.enable).not.toHaveBeenCalled();
      streamingEngine.onCanSwitch();
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('does not enable if adaptation is disabled', async () => {
      player.configure({abr: {enabled: false}});
      await player.load(fakeManifestUri, 0, parserFactory);
      streamingEngine.onCanSwitch();
      expect(abrManager.enable).not.toHaveBeenCalled();
    });

    it('enables/disables though configure', async () => {
      await player.load(fakeManifestUri, 0, parserFactory);
      streamingEngine.onCanSwitch();
      abrManager.enable.calls.reset();
      abrManager.disable.calls.reset();

      player.configure({abr: {enabled: false}});
      expect(abrManager.disable).toHaveBeenCalled();

      player.configure({abr: {enabled: true}});
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('waits to enable if in-between Periods', async () => {
      player.configure({abr: {enabled: false}});
      await player.load(fakeManifestUri, 0, parserFactory);
      player.configure({abr: {enabled: true}});
      expect(abrManager.enable).not.toHaveBeenCalled();
      // Until onCanSwitch is called, the first period hasn't been set up yet.
      streamingEngine.onCanSwitch();
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('reuses AbrManager instance', async () => {
      /** @type {!jasmine.Spy} */
      const spy =
          jasmine.createSpy('AbrManagerFactory').and.returnValue(abrManager);
      player.configure({abrFactory: spy});

      await player.load(fakeManifestUri, 0, parserFactory);
      expect(spy).toHaveBeenCalled();
      spy.calls.reset();

      await player.load(fakeManifestUri, 0, parserFactory);
      expect(spy).not.toHaveBeenCalled();
    });

    it('creates new AbrManager if factory changes', async () => {
      /** @type {!jasmine.Spy} */
      const spy1 =
          jasmine.createSpy('AbrManagerFactory').and.returnValue(abrManager);
      /** @type {!jasmine.Spy} */
      const spy2 =
          jasmine.createSpy('AbrManagerFactory').and.returnValue(abrManager);
      player.configure({abrFactory: spy1});

      await player.load(fakeManifestUri, 0, parserFactory);
      expect(spy1).toHaveBeenCalled();
      expect(spy2).not.toHaveBeenCalled();
      spy1.calls.reset();

      player.configure({abrFactory: spy2});
      await player.load(fakeManifestUri, 0, parserFactory);
      expect(spy1).not.toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
    });
  });

  describe('filterTracks', function() {
    it('retains only video+audio variants if they exist', function(done) {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(10)
            .addAudio(1)
          .addVariant(11)
            .addAudio(2)
            .addVideo(3)
          .addVariant(12)
            .addVideo(4)
        .addPeriod(1)
          .addVariant(20)
            .addAudio(5)
          .addVariant(21)
            .addVideo(6)
          .addVariant(22)
            .addAudio(7)
            .addVideo(8)
        .build();

      let variantTracks1 = [
        jasmine.objectContaining({
          id: 11,
          active: true,
          type: 'variant',
        }),
      ];
      let variantTracks2 = [
        jasmine.objectContaining({
          id: 22,
          active: false,
          type: 'variant',
        }),
      ];

      let parser = new shaka.test.FakeManifestParser(manifest);
      let parserFactory = function() { return parser; };
      player.load(fakeManifestUri, 0, parserFactory).catch(fail).then(() => {
        // Check the first period's variant tracks.
        let actualVariantTracks1 = player.getVariantTracks();
        expect(actualVariantTracks1).toEqual(variantTracks1);

        // Check the second period's variant tracks.
        playhead.getTime.and.callFake(function() {
          return 100;
        });
        let actualVariantTracks2 = player.getVariantTracks();
        expect(actualVariantTracks2).toEqual(variantTracks2);
      }).then(done);
    });
  });

  describe('tracks', function() {
    /** @type {!Array.<shaka.extern.Track>} */
    let variantTracks;
    /** @type {!Array.<shaka.extern.Track>} */
    let textTracks;

    beforeEach(async () => {
      // A manifest we can use to test track expectations.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(100)  // main surround, low res
            .bandwidth(1300)
            .language('en')
            .addVideo(1).originalId('video-1kbps').bandwidth(1000)
              .size(100, 200).frameRate(1000000 / 42000)
              .pixelAspectRatio('59:54')
              .roles(['main'])
            .addAudio(3).originalId('audio-en-6c').bandwidth(300)
              .channelsCount(6).roles(['main']).audioSamplingRate(48000)

          .addVariant(101)  // main surround, high res
            .bandwidth(2300)
            .language('en')
            .addVideo(2).originalId('video-2kbps').bandwidth(2000)
              .size(200, 400).frameRate(24)
              .pixelAspectRatio('59:54')
            .addExistingStream(3)  // audio

          .addVariant(102)  // main stereo, low res
            .bandwidth(1100)
            .language('en')
            .addExistingStream(1)  // video
            .addAudio(4).originalId('audio-en-2c').bandwidth(100)
              .channelsCount(2).roles(['main']).audioSamplingRate(48000)

          .addVariant(103)  // main stereo, high res
            .bandwidth(2100)
            .language('en')
            .addExistingStream(2)  // video
            .addExistingStream(4)  // audio

          .addVariant(104)  // commentary stereo, low res
            .bandwidth(1100)
            .language('en')
            .addExistingStream(1)  // video
            .addAudio(5).originalId('audio-commentary').bandwidth(100)
              .channelsCount(2).roles(['commentary']).audioSamplingRate(48000)

          .addVariant(105)  // commentary stereo, low res
            .bandwidth(2100)
            .language('en')
            .addExistingStream(2)  // video
            .addExistingStream(5)  // audio

          .addVariant(106)  // spanish stereo, low res
            .language('es')
            .bandwidth(1100)
            .addExistingStream(1)  // video
            .addAudio(6).originalId('audio-es').bandwidth(100)
              .channelsCount(2).audioSamplingRate(48000)

          .addVariant(107)  // spanish stereo, high res
            .language('es')
            .bandwidth(2100)
            .addExistingStream(2)  // video
            .addExistingStream(6)  // audio

          // All text tracks should remain, even with different MIME types.
          .addTextStream(50).originalId('text-es')
            .language('es').label('Spanish')
            .bandwidth(10).mime('text/vtt')
            .kind('caption')
          .addTextStream(51).originalId('text-en')
            .language('en').label('English')
            .bandwidth(10).mime('application/ttml+xml')
            .kind('caption').roles(['main'])
           .addTextStream(52).originalId('text-commentary')
            .language('en').label('English')
            .bandwidth(10).mime('application/ttml+xml')
            .kind('caption').roles(['commentary'])
        .addPeriod(1)
          .addVariant(200)
            .bandwidth(1100)
            .language('en')
            .addVideo(10).bandwidth(1000).size(100, 200)
            .addAudio(11)
              .bandwidth(100).channelsCount(2)
              .audioSamplingRate(48000)
          .addVariant(201)
            .bandwidth(1300)
            .language('en')
            .addExistingStream(10)  // video
            .addAudio(12)
              .bandwidth(300).channelsCount(6)
              .audioSamplingRate(48000)
        .build();

      variantTracks = [
        {
          id: 100,
          active: true,
          type: 'variant',
          bandwidth: 1300,
          language: 'en',
          label: null,
          kind: null,
          width: 100,
          height: 200,
          frameRate: 1000000 / 42000,
          pixelAspectRatio: '59:54',
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: ['main'],
          audioRoles: ['main'],
          videoId: 1,
          audioId: 3,
          channelsCount: 6,
          audioSamplingRate: 48000,
          audioBandwidth: 300,
          videoBandwidth: 1000,
          originalAudioId: 'audio-en-6c',
          originalVideoId: 'video-1kbps',
          originalTextId: null,
        },
        {
          id: 101,
          active: false,
          type: 'variant',
          bandwidth: 2300,
          language: 'en',
          label: null,
          kind: null,
          width: 200,
          height: 400,
          frameRate: 24,
          pixelAspectRatio: '59:54',
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: ['main'],
          audioRoles: ['main'],
          videoId: 2,
          audioId: 3,
          channelsCount: 6,
          audioSamplingRate: 48000,
          audioBandwidth: 300,
          videoBandwidth: 2000,
          originalAudioId: 'audio-en-6c',
          originalVideoId: 'video-2kbps',
          originalTextId: null,
        },
        {
          id: 102,
          active: false,
          type: 'variant',
          bandwidth: 1100,
          language: 'en',
          label: null,
          kind: null,
          width: 100,
          height: 200,
          frameRate: 1000000 / 42000,
          pixelAspectRatio: '59:54',
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: ['main'],
          audioRoles: ['main'],
          videoId: 1,
          audioId: 4,
          channelsCount: 2,
          audioSamplingRate: 48000,
          audioBandwidth: 100,
          videoBandwidth: 1000,
          originalAudioId: 'audio-en-2c',
          originalVideoId: 'video-1kbps',
          originalTextId: null,
        },
        {
          id: 103,
          active: false,
          type: 'variant',
          bandwidth: 2100,
          language: 'en',
          label: null,
          kind: null,
          width: 200,
          height: 400,
          frameRate: 24,
          pixelAspectRatio: '59:54',
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: ['main'],
          audioRoles: ['main'],
          videoId: 2,
          audioId: 4,
          channelsCount: 2,
          audioSamplingRate: 48000,
          audioBandwidth: 100,
          videoBandwidth: 2000,
          originalAudioId: 'audio-en-2c',
          originalVideoId: 'video-2kbps',
          originalTextId: null,
        },
        {
          id: 104,
          active: false,
          type: 'variant',
          bandwidth: 1100,
          language: 'en',
          label: null,
          kind: null,
          width: 100,
          height: 200,
          frameRate: 1000000 / 42000,
          pixelAspectRatio: '59:54',
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: ['commentary', 'main'],
          audioRoles: ['commentary'],
          videoId: 1,
          audioId: 5,
          channelsCount: 2,
          audioSamplingRate: 48000,
          audioBandwidth: 100,
          videoBandwidth: 1000,
          originalAudioId: 'audio-commentary',
          originalVideoId: 'video-1kbps',
          originalTextId: null,
        },
        {
          id: 105,
          active: false,
          type: 'variant',
          bandwidth: 2100,
          language: 'en',
          label: null,
          kind: null,
          width: 200,
          height: 400,
          frameRate: 24,
          pixelAspectRatio: '59:54',
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: ['commentary'],
          audioRoles: ['commentary'],
          videoId: 2,
          audioId: 5,
          channelsCount: 2,
          audioSamplingRate: 48000,
          audioBandwidth: 100,
          videoBandwidth: 2000,
          originalAudioId: 'audio-commentary',
          originalVideoId: 'video-2kbps',
          originalTextId: null,
        },
        {
          id: 106,
          active: false,
          type: 'variant',
          bandwidth: 1100,
          language: 'es',
          label: null,
          kind: null,
          width: 100,
          height: 200,
          frameRate: 1000000 / 42000,
          pixelAspectRatio: '59:54',
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: ['main'],
          audioRoles: [],
          videoId: 1,
          audioId: 6,
          channelsCount: 2,
          audioSamplingRate: 48000,
          audioBandwidth: 100,
          videoBandwidth: 1000,
          originalAudioId: 'audio-es',
          originalVideoId: 'video-1kbps',
          originalTextId: null,
        },
        {
          id: 107,
          active: false,
          type: 'variant',
          bandwidth: 2100,
          language: 'es',
          label: null,
          kind: null,
          width: 200,
          height: 400,
          frameRate: 24,
          pixelAspectRatio: '59:54',
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: [],
          audioRoles: [],
          videoId: 2,
          audioId: 6,
          channelsCount: 2,
          audioSamplingRate: 48000,
          audioBandwidth: 100,
          videoBandwidth: 2000,
          originalAudioId: 'audio-es',
          originalVideoId: 'video-2kbps',
          originalTextId: null,
        },
      ];

      textTracks = [
        {
          id: 50,
          active: true,
          type: ContentType.TEXT,
          language: 'es',
          label: 'Spanish',
          kind: 'caption',
          mimeType: 'text/vtt',
          codecs: null,
          audioCodec: null,
          videoCodec: null,
          primary: false,
          roles: [],
          audioRoles: null,
          channelsCount: null,
          audioSamplingRate: null,
          audioBandwidth: null,
          videoBandwidth: null,
          bandwidth: 0,
          width: null,
          height: null,
          frameRate: null,
          pixelAspectRatio: null,
          videoId: null,
          audioId: null,
          originalAudioId: null,
          originalVideoId: null,
          originalTextId: 'text-es',
        },
        {
          id: 51,
          active: false,
          type: ContentType.TEXT,
          language: 'en',
          label: 'English',
          kind: 'caption',
          mimeType: 'application/ttml+xml',
          codecs: null,
          audioCodec: null,
          videoCodec: null,
          primary: false,
          roles: ['main'],
          audioRoles: null,
          channelsCount: null,
          audioSamplingRate: null,
          audioBandwidth: null,
          videoBandwidth: null,
          bandwidth: 0,
          width: null,
          height: null,
          frameRate: null,
          pixelAspectRatio: null,
          videoId: null,
          audioId: null,
          originalAudioId: null,
          originalVideoId: null,
          originalTextId: 'text-en',
        },
        {
          id: 52,
          active: false,
          type: ContentType.TEXT,
          language: 'en',
          label: 'English',
          kind: 'caption',
          mimeType: 'application/ttml+xml',
          codecs: null,
          audioCodec: null,
          videoCodec: null,
          primary: false,
          roles: ['commentary'],
          audioRoles: null,
          channelsCount: null,
          audioSamplingRate: null,
          audioBandwidth: null,
          videoBandwidth: null,
          bandwidth: 0,
          width: null,
          height: null,
          frameRate: null,
          pixelAspectRatio: null,
          videoId: null,
          audioId: null,
          originalAudioId: null,
          originalVideoId: null,
          originalTextId: 'text-commentary',
        },
      ];

      goog.asserts.assert(manifest, 'manifest must be non-null');
      let parser = new shaka.test.FakeManifestParser(manifest);
      let parserFactory = function() { return parser; };

      // Language/channel prefs must be set before load.  Used in
      // select*Language() tests.
      player.configure({
        preferredAudioLanguage: 'en',
        preferredTextLanguage: 'es',
        preferredAudioChannelCount: 6,
      });

      await player.load(fakeManifestUri, 0, parserFactory);
    });

    it('returns the correct tracks', function() {
      streamingEngine.onCanSwitch();

      expect(player.getVariantTracks()).toEqual(variantTracks);
      expect(player.getTextTracks()).toEqual(textTracks);
    });

    it('returns empty arrays before tracks can be determined', async () => {
      let parser = new shaka.test.FakeManifestParser(manifest);
      let parserFactory = function() { return parser; };
      parser.start.and.callFake(function(manifestUri, playerInterface) {
        // The player does not yet have a manifest.
        expect(player.getVariantTracks()).toEqual([]);
        expect(player.getTextTracks()).toEqual([]);

        parser.playerInterface = playerInterface;
        return Promise.resolve(manifest);
      });
      drmEngine.initForPlayback.and.callFake(() => {
        // The player does not yet have a playhead.
        expect(player.getVariantTracks()).toEqual([]);
        expect(player.getTextTracks()).toEqual([]);

        return Promise.resolve();
      });

      await player.load(fakeManifestUri, 0, parserFactory);

      // Make sure the interruptions didn't mess up the tracks.
      streamingEngine.onCanSwitch();
      expect(player.getVariantTracks()).toEqual(variantTracks);
      expect(player.getTextTracks()).toEqual(textTracks);
    });

    it('doesn\'t disable AbrManager if switching variants', function() {
      streamingEngine.onCanSwitch();

      let config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);

      const newTrack = player.getVariantTracks().filter((t) => !t.active)[0];
      player.selectVariantTrack(newTrack);

      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
    });

    it('doesn\'t disable AbrManager if switching text', function() {
      streamingEngine.onCanSwitch();

      let config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);

      const newTrack = player.getTextTracks().filter((t) => !t.active)[0];
      player.selectTextTrack(newTrack);

      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
    });

    it('switches streams', function() {
      streamingEngine.onCanSwitch();

      const newTrack = player.getVariantTracks().filter((t) => !t.active)[0];
      player.selectVariantTrack(newTrack);

      expect(streamingEngine.switchVariant).toHaveBeenCalled();
      const variant = streamingEngine.switchVariant.calls.argsFor(0)[0];
      expect(variant.id).toEqual(newTrack.id);
    });

    it('still switches streams if called during startup', function() {
      // startup is not complete until onCanSwitch is called.

      // pick a track
      const newTrack = player.getVariantTracks().filter((t) => !t.active)[0];
      // ask the player to switch to it
      player.selectVariantTrack(newTrack);
      // nothing happens yet
      expect(streamingEngine.switchVariant).not.toHaveBeenCalled();

      // after startup is complete, the manual selection takes effect.
      streamingEngine.onCanSwitch();
      expect(streamingEngine.switchVariant).toHaveBeenCalled();
      const variant = streamingEngine.switchVariant.calls.argsFor(0)[0];
      expect(variant.id).toEqual(newTrack.id);
    });

    it('still switches streams if called while switching Periods', function() {
      // startup is complete after onCanSwitch.
      streamingEngine.onCanSwitch();

      // startup doesn't call switchVariant
      expect(streamingEngine.switchVariant).not.toHaveBeenCalled();

      // pick a track
      const newTrack = player.getVariantTracks().filter((t) => !t.active)[0];

      // simulate the transition to period 1
      transitionPeriod(1);

      // select the new track (from period 0, which is fine)
      player.selectVariantTrack(newTrack);
      expect(streamingEngine.switchVariant).not.toHaveBeenCalled();

      // after transition is completed by onCanSwitch, switchVariant is called
      streamingEngine.onCanSwitch();
      expect(streamingEngine.switchVariant).toHaveBeenCalled();
      const variant = streamingEngine.switchVariant.calls.argsFor(0)[0];
      expect(variant.id).toEqual(newTrack.id);
    });

    it('switching audio doesn\'t change selected text track', function() {
      streamingEngine.onCanSwitch();
      player.configure({
        preferredTextLanguage: 'es',
      });

      // We will manually switch from Spanish to English.
      const englishTextTrack =
          player.getTextTracks().filter((t) => t.language == 'en')[0];

      streamingEngine.switchTextStream.calls.reset();
      player.selectTextTrack(englishTextTrack);
      expect(streamingEngine.switchTextStream).toHaveBeenCalled();
      // We have selected an English text track explicitly.
      expect(getActiveTextTrack().id).toBe(englishTextTrack.id);

      const newVariantTrack =
          player.getVariantTracks().filter((t) => !t.active)[0];
      player.selectVariantTrack(newVariantTrack);

      // The active text track has not changed, even though the text language
      // preference is Spanish.
      expect(getActiveTextTrack().id).toBe(englishTextTrack.id);
    });

    it('selectAudioLanguage() takes precedence over ' +
       'preferredAudioLanguage', function() {
      streamingEngine.onCanSwitch();

      // This preference is set in beforeEach, before load().
      expect(player.getConfiguration().preferredAudioLanguage).toBe('en');
      expect(getActiveVariantTrack().language).toBe('en');

      streamingEngine.switchVariant.calls.reset();
      player.selectAudioLanguage('es');

      expect(streamingEngine.switchVariant).toHaveBeenCalled();
      const args = streamingEngine.switchVariant.calls.argsFor(0);
      expect(args[0].language).toBe('es');
      expect(args[1]).toBe(true);
      expect(getActiveVariantTrack().language).toBe('es');
    });

    it('selectAudioLanguage() respects selected role', function() {
      streamingEngine.onCanSwitch();
      expect(getActiveVariantTrack().roles).not.toContain('commentary');

      streamingEngine.switchVariant.calls.reset();
      player.selectAudioLanguage('en', 'commentary');

      expect(streamingEngine.switchVariant).toHaveBeenCalled();
      const args = streamingEngine.switchVariant.calls.argsFor(0);
      expect(args[0].audio.roles).toContain('commentary');
      expect(args[1]).toBe(true);
      expect(getActiveVariantTrack().roles).toContain('commentary');
    });

    it('selectAudioLanguage() applies role only to audio', () => {
      streamingEngine.onCanSwitch();
      expect(getActiveVariantTrack().roles).not.toContain('commentary');
      player.selectAudioLanguage('en', 'commentary');
      let args = streamingEngine.switchVariant.calls.argsFor(0);
      expect(args[0].audio.roles).toContain('commentary');
      expect(args[0].video.roles).toContain('main');

      // Switch audio role from 'commentary' to 'main'.
      streamingEngine.switchVariant.calls.reset();
      player.selectAudioLanguage('en', 'main');
      expect(streamingEngine.switchVariant).toHaveBeenCalled();
      args = streamingEngine.switchVariant.calls.argsFor(0);
      expect(args[0].audio.roles).toContain('main');
      expect(args[0].video.roles).toContain('main');
    });

    it('selectAudioLanguage() does not change selected text track', function() {
      // This came up in a custom application that allows to select
      // from all tracks regardless of selected language.
      // We imitate this behavior by calling selectTextLanguage()
      // with one language and then selecting a track in a different
      // language.
      player.selectTextLanguage('en');
      const spanishTextTrack = textTracks.filter((t) => t.language == 'es')[0];
      player.selectTextTrack(spanishTextTrack);
      player.selectAudioLanguage('es');
      expect(getActiveTextTrack().id).toBe(spanishTextTrack.id);
    });

    // Regression test for https://github.com/google/shaka-player/issues/2906
    // and https://github.com/google/shaka-player/issues/2909.
    it('selectAudioLanguage() can choose role-less tracks', async () => {
      // For this test, we use a different (and simpler) manifest.
      // Both audio tracks are English; one has a role, and one has no roles.
      // The role=description track comes first to reproduce the conditions in
      // #2909.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(100)
            .language('en')
            .addVideo(1)
              .bandwidth(1000)
              .size(100, 200)
              .roles([])
            .addAudio(2)
              .bandwidth(100)
              .roles(['description'])
          .addVariant(101)
            .language('en')
            .addExistingStream(1)  // video
            .addAudio(3)
              .bandwidth(100)
              .roles([])
       .build();

      // No explicit preferred audio language is also part of #2909.
      player.configure('preferredAudioLanguage', undefined);

      // Load again to get this test-specific manifest loaded.
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      await player.load(fakeManifestUri, 0, factory);

      // #2909: The initial choice should be for the role-less track, even
      // though it is second in the manifest.
      expect(getActiveVariantTrack().audioRoles).toEqual([]);

      player.selectAudioLanguage('en', 'description');
      expect(getActiveVariantTrack().audioRoles).toEqual(['description']);

      // #2906: Selecting no particular role should prefer the track without any
      // roles.
      player.selectAudioLanguage('en');
      expect(getActiveVariantTrack().audioRoles).toEqual([]);
    });

    // https://github.com/google/shaka-player/issues/3262
    it('selectAudioLanguage() doesn\'t change resolution', () => {
      player.configure('abr.enabled', false);
      abrManager.chooseIndex = 1;
      const lowResEn =
          variantTracks.filter((t) => t.language == 'en' && t.height == 200)[0];
      player.selectVariantTrack(lowResEn);

      // Switching to 'es' should keep the low-res stream and not choose the
      // high-res version.
      player.selectAudioLanguage('es');
      const lowResEs =
          variantTracks.filter((t) => t.language == 'es' && t.height == 200)[0];
      expect(getActiveVariantTrack().id).toBe(lowResEs.id);
    });

    it('selectTextLanguage() does not change selected variant track', () => {
      // This came up in a custom application that allows to select
      // from all tracks regardless of selected language.
      // We imitate this behavior by calling selectAudioLanguage()
      // with one language and then selecting a track in a different
      // language.
      player.selectAudioLanguage('es');
      const englishVariantTrack =
          variantTracks.filter((t) => t.language == 'en')[0];
      player.selectVariantTrack(englishVariantTrack);
      player.selectTextLanguage('es');
      expect(getActiveVariantTrack().id).toBe(englishVariantTrack.id);
    });

    it('selectTextLanguage() takes precedence over ' +
       'preferredTextLanguage', function() {
      streamingEngine.onCanSwitch();

      // This preference is set in beforeEach, before load().
      expect(player.getConfiguration().preferredTextLanguage).toBe('es');
      expect(getActiveTextTrack().language).toBe('es');

      streamingEngine.switchTextStream.calls.reset();
      player.selectTextLanguage('en');

      expect(streamingEngine.switchTextStream).toHaveBeenCalled();
      const args = streamingEngine.switchTextStream.calls.argsFor(0);
      expect(args[0].language).toBe('en');
      expect(getActiveTextTrack().language).toBe('en');
    });

    it('selectTextLanguage() respects selected role', function() {
      streamingEngine.onCanSwitch();
      expect(getActiveTextTrack().roles).not.toContain('commentary');

      streamingEngine.switchTextStream.calls.reset();
      player.selectTextLanguage('en', 'commentary');

      expect(streamingEngine.switchTextStream).toHaveBeenCalled();
      const args = streamingEngine.switchTextStream.calls.argsFor(0);
      expect(args[0].roles).toContain('commentary');
      expect(getActiveTextTrack().roles).toContain('commentary');
    });

    it('changing current audio language changes active stream', function() {
      streamingEngine.onCanSwitch();

      expect(getActiveVariantTrack().language).not.toBe('es');
      expect(streamingEngine.switchVariant).not.toHaveBeenCalled();
      player.selectAudioLanguage('es');

      expect(streamingEngine.switchVariant).toHaveBeenCalled();
      const args = streamingEngine.switchVariant.calls.argsFor(0);
      expect(args[0].language).toBe('es');
      expect(args[1]).toBe(true);
      expect(getActiveVariantTrack().language).toBe('es');
    });

    it('changing current text language changes active stream', function() {
      streamingEngine.onCanSwitch();

      expect(getActiveTextTrack().language).not.toBe('en');
      expect(streamingEngine.switchTextStream).not.toHaveBeenCalled();
      player.selectTextLanguage('en');

      expect(streamingEngine.switchTextStream).toHaveBeenCalled();
      const args = streamingEngine.switchTextStream.calls.argsFor(0);
      expect(args[0].language).toBe('en');
      expect(getActiveTextTrack().language).toBe('en');
    });

    // https://github.com/google/shaka-player/issues/2010
    it('changing text lang changes active stream when not streaming', () => {
      streamingEngine.onCanSwitch();
      player.setTextTrackVisibility(false);

      expect(getActiveTextTrack().language).not.toBe('en');
      expect(streamingEngine.switchTextStream).not.toHaveBeenCalled();
      player.selectTextLanguage('en');

      expect(streamingEngine.switchTextStream).not.toHaveBeenCalled();
      expect(getActiveTextTrack().language).toBe('en');
    });

    it('remembers the channel count when ABR is reenabled', () => {
      streamingEngine.onCanSwitch();

      // We prefer 6 channels, and we are currently playing 6 channels.
      expect(player.getConfiguration().preferredAudioChannelCount).toBe(6);
      expect(getActiveVariantTrack().channelsCount).toBe(6);

      // Manually turn off ABR and select a 2-channel track.
      player.configure({abr: {enabled: false}});
      const newTrack =
          player.getVariantTracks().filter((t) => t.channelsCount == 2)[0];
      player.selectVariantTrack(newTrack);

      // See that we are playing a 2-channel track now.
      expect(getActiveVariantTrack().channelsCount).toBe(2);

      // See that AbrManager has a list of 2-channel tracks now.
      expect(abrManager.variants.length).toBeGreaterThan(0);
      abrManager.variants.forEach((v) => {
        expect(v.audio.channelsCount).toBe(2);
      });

      // Re-enable ABR.
      player.configure({abr: {enabled: true}});

      // See that AbrManager still has a list of 2-channel tracks.
      expect(abrManager.variants.length).toBeGreaterThan(0);
      abrManager.variants.forEach((v) => {
        expect(v.audio.channelsCount).toBe(2);
      });
      // See that we are still playing a 2-channel track.
      expect(getActiveVariantTrack().channelsCount).toBe(2);
    });

    it('remembers the channel count across key status changes', () => {
      // Simulate an encrypted stream.  Mark half of the audio streams with key
      // ID 'aaa', and the other half with 'bbb'.  Remove all roles, so that our
      // choices are limited only by channel count and key status.
      manifest.periods[0].variants.forEach((variant) => {
        const keyId = (variant.audio.id % 2) ? 'aaa' : 'bbb';
        variant.audio.keyId = keyId;
        variant.video.roles = [];
        variant.audio.roles = [];
      });

      streamingEngine.onCanSwitch();

      // We prefer 6 channels, and we are currently playing 6 channels.
      expect(player.getConfiguration().preferredAudioChannelCount).toBe(6);
      expect(getActiveVariantTrack().channelsCount).toBe(6);

      // Manually select a 2-channel track.
      const newTrack =
          player.getVariantTracks().filter((t) => t.channelsCount == 2)[0];
      player.selectVariantTrack(newTrack);

      // See that we are playing a 2-channel track now.
      expect(getActiveVariantTrack().channelsCount).toBe(2);

      // See that AbrManager has a list of 2-channel tracks now.
      expect(abrManager.variants.length).toBeGreaterThan(0);
      abrManager.variants.forEach((v) => {
        expect(v.audio.channelsCount).toBe(2);
      });

      // Simulate a key status event that would trigger the removal of some
      // tracks.
      onKeyStatus({
        'aaa': 'usable',
        'bbb': 'output-restricted',
      });

      // See that AbrManager still has a list of 2-channel tracks.
      expect(abrManager.variants.length).toBeGreaterThan(0);
      abrManager.variants.forEach((v) => {
        expect(v.audio.channelsCount).toBe(2);
      });
      // See that we are still playing a 2-channel track.
      expect(getActiveVariantTrack().channelsCount).toBe(2);
    });
  });  // describe('tracks')

  describe('languages', function() {
    it('chooses the first as default', async () => {
      await runTest(['en', 'es'], 'pt', 0);
    });

    it('chooses the primary track', async () => {
      await runTest(['en', 'es', '*fr'], 'pt', 2);
    });

    it('chooses exact match for main language', async () => {
      await runTest(['en', 'pt', 'pt-BR'], 'pt', 1);
    });

    it('chooses exact match for subtags', async () => {
      await runTest(['en', 'pt', 'pt-BR'], 'PT-BR', 2);
    });

    it('chooses base language if exact does not exist', async () => {
      await runTest(['en', 'es', 'pt'], 'pt-BR', 2);
    });

    it('chooses other subtags if base language does not exist', async () => {
      await runTest(['en', 'es', 'pt-BR'], 'pt-PT', 2);
    });

    it('enables text if its language differs from audio at start', async () => {
      // A manifest we can use to test text visibility.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0).language('pt').addAudio(0)
          .addVariant(1).language('en').addAudio(1)
          .addTextStream(2).language('pt')
          .addTextStream(3).language('fr')
       .build();

      player.configure({
        preferredAudioLanguage: 'en',
        preferredTextLanguage: 'fr',
      });

      expect(player.isTextTrackVisible()).toBe(false);

      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      await player.load(fakeManifestUri, 0, factory);

      // Text was turned on during startup.
      expect(player.isTextTrackVisible()).toBe(true);

      // Turn text back off.
      await player.setTextTrackVisibility(false);
      expect(player.isTextTrackVisible()).toBe(false);

      // Change text languages after startup.
      player.selectTextLanguage('pt');

      // This should not turn text back on.
      expect(player.isTextTrackVisible()).toBe(false);
    });

    it('chooses an arbitrary language when none given', async () => {
      // The Player shouldn't allow changing between languages, so it should
      // choose an arbitrary language when none is given.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0).language('pt').addAudio(0)
          .addVariant(1).language('en').addAudio(1)
       .build();

      player.configure({
        preferredAudioLanguage: undefined,
      });

      let parser = new shaka.test.FakeManifestParser(manifest);
      let parserFactory = function() { return parser; };
      await player.load(fakeManifestUri, 0, parserFactory);

      expect(abrManager.setVariants).toHaveBeenCalled();

      // If we have chosen any arbitrary language, setVariants is provided
      // with exactly one variant.
      let variants = abrManager.setVariants.calls.argsFor(0)[0];
      expect(variants.length).toBe(1);
    });

    /**
     * @param {!Array.<string>} languages
     * @param {string} preference
     * @param {number} expectedIndex
     * @return {!Promise}
     */
    function runTest(languages, preference, expectedIndex) {
      let generator = new shaka.test.ManifestGenerator().addPeriod(0);

      for (let i = 0; i < languages.length; i++) {
        let lang = languages[i];
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

      // Set the user preferences, which must happen before load().
      player.configure({
        preferredAudioLanguage: preference,
      });

      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      return player.load(fakeManifestUri, 0, factory).then(function() {
        expect(getActiveVariantTrack().id).toBe(expectedIndex);
      });
    }
  });

  describe('getStats', function() {
    beforeAll(function() {
      jasmine.clock().install();
      jasmine.clock().mockDate();
    });

    beforeEach(async () => {
      // The media element may be paused in a test, make sure that it is reset
      // to avoid cross-test contamination.
      video.paused = false;

      // A manifest we can use to test stats.
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(0)
            .bandwidth(200)
            .addAudio(1).bandwidth(100)
            .addVideo(2).bandwidth(100).size(100, 200)
          .addVariant(1)
            .bandwidth(300)
            .addExistingStream(1)  // audio
            .addVideo(3).bandwidth(200).size(200, 400)
          .addVariant(2)
            .bandwidth(300)
            .addAudio(4).bandwidth(200)
            .addExistingStream(2)  // video
          .addVariant(3)
            .bandwidth(400)
            .addExistingStream(4)  // audio
            .addExistingStream(3)  // video
        .build();

      let parser = new shaka.test.FakeManifestParser(manifest);
      let parserFactory = function() { return parser; };
      await player.load(fakeManifestUri, 0, parserFactory);

      // Initialize the fake streams.
      streamingEngine.onCanSwitch();
    });

    afterAll(function() {
      jasmine.clock().uninstall();
    });

    it('tracks estimated bandwidth', function() {
      abrManager.getBandwidthEstimate.and.returnValue(25);
      let stats = player.getStats();
      expect(stats.estimatedBandwidth).toBe(25);
    });

    it('tracks info about current stream', function() {
      let stats = player.getStats();
      // Should have chosen the first of each type of stream.
      expect(stats.width).toBe(100);
      expect(stats.height).toBe(200);
      expect(stats.streamBandwidth).toBe(200);
    });

    it('tracks frame info', function() {
      // getVideoPlaybackQuality does not exist yet.
      let stats = player.getStats();
      expect(stats.decodedFrames).toBeNaN();
      expect(stats.droppedFrames).toBeNaN();
      expect(stats.corruptedFrames).toBeNaN();

      video.getVideoPlaybackQuality = function() {
        return {
          corruptedVideoFrames: 10,
          creationTime: 0,
          totalFrameDelay: 0,
          totalVideoFrames: 75,
          droppedVideoFrames: 125,
        };
      };

      // Now that it exists, theses stats should exist.
      stats = player.getStats();
      expect(stats.decodedFrames).toBe(75);
      expect(stats.droppedFrames).toBe(125);
      expect(stats.corruptedFrames).toBe(10);
    });

    describe('buffer/play times', function() {
      it('tracks play time', function() {
        let stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(0);

        // Stop buffering and start "playing".
        forceBufferingTo(false);
        jasmine.clock().tick(5000);

        stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(5);
        expect(stats.bufferingTime).toBeCloseTo(0);
      });

      it('tracks buffering time', function() {
        let stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(0);

        forceBufferingTo(true);
        jasmine.clock().tick(5000);

        stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(5);
      });

      it('tracks correct time when switching states', function() {
        forceBufferingTo(false);
        jasmine.clock().tick(3000);
        forceBufferingTo(true);
        jasmine.clock().tick(5000);
        forceBufferingTo(true);
        jasmine.clock().tick(9000);
        forceBufferingTo(false);
        jasmine.clock().tick(1000);

        let stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(4);
        expect(stats.bufferingTime).toBeCloseTo(14);
      });
    });

    describe('.switchHistory', function() {
      it('includes original choices', function() {
        // checkHistory prepends the initial stream selections.
        checkHistory([]);
      });

      it('includes selectVariantTrack choices', function() {
        const track = player.getVariantTracks()[3];

        const variants = manifest.periods[0].variants;
        const variant = variants.find((variant) => variant.id == track.id);

        player.selectVariantTrack(track);

        checkHistory([{
          // We are using a mock date, so this is not a race.
          timestamp: Date.now() / 1000,
          id: variant.id,
          type: 'variant',
          fromAdaptation: false,
          bandwidth: variant.bandwidth,
        }]);
      });

      it('includes adaptation choices', function() {
        let variant = manifest.periods[0].variants[3];

        switch_(variant);
        checkHistory(jasmine.arrayContaining([
          {
            timestamp: Date.now() / 1000,
            id: variant.id,
            type: 'variant',
            fromAdaptation: true,
            bandwidth: variant.bandwidth,
          },
        ]));
      });

      /**
       * Checks that the switch history is correct.
       * @param {!Array.<shaka.extern.TrackChoice>} additional
       */
      function checkHistory(additional) {
        let prefix = {
          timestamp: jasmine.any(Number),
          id: 0,
          type: 'variant',
          fromAdaptation: true,
          bandwidth: 200,
        };

        let switchHistory = player.getStats().switchHistory;

        expect(switchHistory[0]).toEqual(prefix);
        expect(switchHistory.slice(1)).toEqual(additional);
      }

      /**
       * @param {shaka.extern.Variant} variant
       * @suppress {accessControls}
       */
      function switch_(variant) {
        player.switch_(variant);
      }
    });

    describe('.stateHistory', function() {
      function history() {
        return player.getStats().stateHistory;
      }

      // We expect that the player will start us in the buffering state after
      // loading. We should see that the only entry is a buffering entry.
      it('begins with buffering state', function() {
        expect(history()).toEqual([
          {
            timestamp: jasmine.any(Number),
            duration: 0,
            state: 'buffering',
          },
        ]);
      });

      // We expect that the player will start us in the buffering state, but
      // when the media element is paused, we should see that we change to the
      // paused state.
      it('transitions to paused if the video is paused', function() {
        // Start playback, we must be playing in order to be paused. The
        // buffering state takes precedent over other states, so if we are
        // buffering and then paused, it will only report buffering.
        forceBufferingTo(false);

        // Trigger a pause event.
        video.paused = true;
        video.on['pause']();

        expect(history()).toEqual([
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'buffering',
          },
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'playing',
          },
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'paused',
          },
        ]);
      });

      // We expect that the player will start us in the buffering state, but
      // once we leave that state, we should be playing.
      it('transitions to playing if the video is playing', function() {
        // Leave buffering (and enter playing).
        forceBufferingTo(false);

        expect(history()).toEqual([
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'buffering',
          },
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'playing',
          },
        ]);
      });

      // We expect that the player will start us in the buffering state. We
      // expect that once we reach the end, we will enter the ended state. Since
      // we must be first playing before reaching the end, this test will
      // reflect that.
      it('transitions to ended when the video ends', function() {
        // Stop buffering (and start playing);
        forceBufferingTo(false);

        // Signal the playhead reaching the end of the content.
        video.ended = true;
        video.on['ended']();

        expect(history()).toEqual([
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'buffering',
          },
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'playing',
          },
          {
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number),
            state: 'ended',
          },
        ]);
      });
    });

    /**
     * @param {boolean} buffering
     * @suppress {accessControls}
     */
    function forceBufferingTo(buffering) {
      const State = shaka.media.BufferingObserver.State;

      // Replace the |getState| method on the buffer controllers so that any
      // others calls relying on the state will get the state that we want them
      // to have.
      player.bufferObserver_.getState = () => {
        return buffering ? State.STARVING : State.SATISFIED;
      };

      // Force the update.
      player.updateBufferState_();
    }
  });

  describe('unplayable periods', function() {
    beforeEach(function() {
      // overriding for good / bad codecs.
      window.MediaSource.isTypeSupported = function(mimeType) {
        return mimeType.includes('good');
      };
    });

    it('success when one period is playable', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(0).mime('video/mp4', 'good')
              .build();
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      await player.load(fakeManifestUri, 0, factory);
    });

    it('success when all periods are playable', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(0).mime('video/mp4', 'good')
              .addPeriod(1)
                .addVariant(1)
                  .addVideo(1).mime('video/mp4', 'good')
              .build();
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      await player.load(fakeManifestUri, 0, factory);
    });

    it('throw UNPLAYABLE_PERIOD when some periods are unplayable', async () => {
      manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0).bandwidth(500)
              .addVideo(0).mime('video/mp4', 'good')
          .addPeriod(1)
            .addVariant(1).bandwidth(500)
              .addVideo(1).mime('video/mp4', 'bad')
          .build();
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      try {
        await player.load(fakeManifestUri, 0, factory);
        fail();
      } catch (error) {
        shaka.test.Util.expectToEqualError(
            error,
            new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.MANIFEST,
                shaka.util.Error.Code.UNPLAYABLE_PERIOD));
      }
    });

    it('throw CONTENT_UNSUPPORTED_BY_BROWSER when the only period is ' +
        'unplayable', async () => {
          manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(500)
                  .addVideo(0).mime('video/mp4', 'bad')
              .build();
          let parser = new shaka.test.FakeManifestParser(manifest);
          let factory = function() { return parser; };
          try {
            await player.load(fakeManifestUri, 0, factory);
            fail();
          } catch (error) {
            shaka.test.Util.expectToEqualError(
                error,
                new shaka.util.Error(
                    shaka.util.Error.Severity.CRITICAL,
                    shaka.util.Error.Category.MANIFEST,
                    shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER));
          }
        });

    it('throw CONTENT_UNSUPPORTED_BY_BROWSER when all periods are unplayable',
        async () => {
          manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(500)
                  .addVideo(0).mime('video/mp4', 'bad')
                .addVariant(1).bandwidth(500)
                  .addVideo(1).mime('video/mp4', 'bad')
              .addPeriod(1)
                .addVariant(2)
                  .addVideo(2).mime('video/mp4', 'bad')
              .build();

          let parser = new shaka.test.FakeManifestParser(manifest);
          let factory = function() { return parser; };
          try {
            await player.load(fakeManifestUri, 0, factory);
            fail();
          } catch (error) {
            shaka.test.Util.expectToEqualError(
                error,
                new shaka.util.Error(
                    shaka.util.Error.Severity.CRITICAL,
                    shaka.util.Error.Category.MANIFEST,
                    shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER));
          }
        });

    it('throw UNPLAYABLE_PERIOD when the new period is unplayable', (done) => {
      manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0).bandwidth(500)
              .addVideo(0).mime('video/mp4', 'good')
            .addVariant(1).bandwidth(500)
              .addVideo(1).mime('video/mp4', 'good')
          .build();
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      player.load(fakeManifestUri, 0, factory).catch(fail).then(function() {
        let manifest2 = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0).bandwidth(500)
              .addVideo(0).mime('video/mp4', 'bad')
          .build();
        manifest.periods.push(manifest2.periods[0]);
        try {
          parser.playerInterface.filterNewPeriod(manifest2.periods[0]);
          fail('filter period wrong');
        } catch (error) {
          shaka.test.Util.expectToEqualError(
              error,
              new shaka.util.Error(
                  shaka.util.Error.Severity.CRITICAL,
                  shaka.util.Error.Category.MANIFEST,
                  shaka.util.Error.Code.UNPLAYABLE_PERIOD));
        }
      }).catch(fail).then(done);
    });
  });

  describe('restrictions', function() {
    it('switches if active is restricted by application', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(500)
                  .addVideo(1)
                .addVariant(1).bandwidth(100)
                  .addVideo(2)
              .build();

      await setupPlayer();
      let activeVariant = getActiveVariantTrack();
      expect(activeVariant.id).toBe(0);

      // Ask AbrManager to choose the 0th variant from those it is given.
      abrManager.chooseIndex = 0;
      abrManager.chooseVariant.calls.reset();

      // This restriction should make it so that the first variant (bandwidth
      // 500, id 0) cannot be selected.
      player.configure({
        restrictions: {maxBandwidth: 200},
      });

      // The restriction change should trigger a call to AbrManager.
      expect(abrManager.chooseVariant).toHaveBeenCalled();

      // The first variant is disallowed.
      expect(manifest.periods[0].variants[0].id).toBe(0);
      expect(manifest.periods[0].variants[0].allowedByApplication)
          .toBe(false);

      // AbrManager chose the second variant (id 1).
      activeVariant = getActiveVariantTrack();
      expect(activeVariant.id).toBe(1);
    });

    it('updates AbrManager for restriction changes', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(1).bandwidth(500)
                  .addVideo(10)
                .addVariant(2).bandwidth(100)
                  .addVideo(20)
              .build();

      await setupPlayer();
      abrManager.setVariants.calls.reset();

      player.configure({restrictions: {maxBandwidth: 200}});

      // AbrManager should have been updated with the restricted tracks.
      // The first variant is disallowed.
      expect(abrManager.setVariants).toHaveBeenCalledTimes(1);
      const variants = abrManager.setVariants.calls.argsFor(0)[0];
      expect(variants.length).toBe(1);
      expect(variants[0].id).toBe(2);

      // Now increase the restriction, AbrManager should still be updated.
      // https://github.com/google/shaka-player/issues/1533
      abrManager.setVariants.calls.reset();
      player.configure({restrictions: {maxBandwidth: Infinity}});
      expect(abrManager.setVariants).toHaveBeenCalledTimes(1);
      const newVariants = abrManager.setVariants.calls.argsFor(0)[0];
      expect(newVariants.length).toBe(2);
    });

    it('switches if active key status is "output-restricted"', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

      await setupPlayer();
      let activeVariant = getActiveVariantTrack();
      expect(activeVariant.id).toBe(0);

      abrManager.chooseIndex = 0;
      abrManager.chooseVariant.calls.reset();

      // This restricts the first variant, which triggers chooseVariant.
      onKeyStatus({'abc': 'output-restricted'});
      expect(abrManager.chooseVariant).toHaveBeenCalled();

      // The first variant is disallowed.
      expect(manifest.periods[0].variants[0].id).toBe(0);
      expect(manifest.periods[0].variants[0].allowedByKeySystem)
          .toBe(false);

      // The second variant was chosen.
      activeVariant = getActiveVariantTrack();
      expect(activeVariant.id).toBe(1);
    });

    it('switches if active key status is "internal-error"', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

      await setupPlayer();
      let activeVariant = getActiveVariantTrack();
      expect(activeVariant.id).toBe(0);

      // AbrManager should choose the second track since the first is
      // restricted.
      abrManager.chooseIndex = 0;
      abrManager.chooseVariant.calls.reset();
      onKeyStatus({'abc': 'internal-error'});
      expect(abrManager.chooseVariant).toHaveBeenCalled();
      expect(manifest.periods[0].variants[0].id).toBe(0);
      expect(manifest.periods[0].variants[0].allowedByKeySystem)
          .toBe(false);

      activeVariant = getActiveVariantTrack();
      expect(activeVariant.id).toBe(1);
    });

    it('doesn\'t switch if the active stream isn\'t restricted', async () => {
      manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0)
              .addVideo(1).keyId('abc')
            .addVariant(1)
              .addVideo(2)
          .build();

      await setupPlayer();
      abrManager.chooseVariant.calls.reset();

      let activeVariant = getActiveVariantTrack();
      expect(activeVariant.id).toBe(0);

      onKeyStatus({'abc': 'usable'});
      expect(abrManager.chooseVariant).not.toHaveBeenCalled();

      activeVariant = getActiveVariantTrack();
      expect(activeVariant.id).toBe(0);
    });

    it('removes if key status is "output-restricted"', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      onKeyStatus({'abc': 'output-restricted'});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(1);
    });

    it('removes if key status is "internal-error"', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(1)
                  .addVideo(2)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      onKeyStatus({'abc': 'internal-error'});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(1);
    });

    it('removes if we don\'t have the required key', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(2)
                  .addVideo(3)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      // We have some key statuses, but not for the key IDs we know.
      onKeyStatus({'foo': 'usable'});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    // https://github.com/google/shaka-player/issues/2135
    it('updates key statuses for multi-Period content', async () => {
      manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0)
              .addVideo(1).keyId('abc')
          .addPeriod(10)
            .addVariant(2)
              .addVideo(3).keyId('abc')
            .addVariant(4)
              .addVideo(5).keyId('def')
          .build();

      await setupPlayer();
      onKeyStatus({'abc': 'usable'});

      expect(manifest.periods[0].variants[0].allowedByKeySystem).toBe(true);
      expect(manifest.periods[1].variants[0].allowedByKeySystem).toBe(true);
      expect(manifest.periods[1].variants[1].allowedByKeySystem).toBe(false);
    });

    it('does not restrict if no key statuses are available', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(2)
                  .addVideo(3)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      // This simulates, for example, the lack of key status on Chromecast
      // when using PlayReady.  See #1070.
      onKeyStatus({});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(2);
    });

    it('doesn\'t remove when using synthetic key status', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(2)
                  .addVideo(3)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      // A synthetic key status contains a single key status with key '00'.
      onKeyStatus({'00': 'usable'});

      expect(player.getVariantTracks().length).toBe(2);
    });

    it('removes all encrypted tracks for errors with synthetic key status',
        async () => {
          manifest = new shaka.test.ManifestGenerator()
                  .addPeriod(0)
                    .addVariant(0)
                      .addVideo(1).keyId('abc')
                    .addVariant(2)
                      .addVideo(3).keyId('xyz')
                    .addVariant(4)
                      .addVideo(5)
                  .build();

          await setupPlayer();
          expect(player.getVariantTracks().length).toBe(3);

          // A synthetic key status contains a single key status with key '00'.
          onKeyStatus({'00': 'internal-error'});

          let tracks = player.getVariantTracks();
          expect(tracks.length).toBe(1);
          expect(tracks[0].id).toBe(4);
        });

    it('removes if key system does not support codec', async () => {
      manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0).addDrmInfo('foo.bar')
              .addVideo(1).encrypted(true).mime('video/unsupported')
            .addVariant(1).addDrmInfo('foo.bar')
              .addVideo(2).encrypted(true)
          .build();

      // We must be careful that our video/unsupported was not filtered out
      // because of MSE support.  We are specifically testing EME-based
      // filtering of codecs.
      expect(MediaSource.isTypeSupported('video/unsupported')).toBe(true);

      // Make sure that drm engine will reject the variant with an unsupported
      // video mime type.
      drmEngine.supportsVariant.and.callFake((variant) => {
        return variant.video.mimeType != 'video/unsupported';
      });

      await setupPlayer();
      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(1);
    });

    it('removes based on bandwidth', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(10)
                  .addVideo(1)
                .addVariant(1).bandwidth(1500)
                  .addVideo(2)
                .addVariant(2).bandwidth(500)
                  .addVideo(3)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      player.configure({restrictions: {minBandwidth: 100, maxBandwidth: 1000}});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    it('removes based on pixels', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(900, 900)
                .addVariant(1)
                  .addVideo(2).size(5, 5)
                .addVariant(2)
                  .addVideo(3).size(190, 190)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      player.configure({restrictions: {minPixels: 100, maxPixels: 800 * 800}});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    it('removes based on width', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(5, 5)
                .addVariant(1)
                  .addVideo(2).size(1500, 200)
                .addVariant(2)
                  .addVideo(3).size(190, 190)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      player.configure({restrictions: {minWidth: 100, maxWidth: 1000}});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    it('removes based on height', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(5, 5)
                .addVariant(1)
                  .addVideo(2).size(200, 1024)
                .addVariant(2)
                  .addVideo(3).size(190, 190)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      player.configure({restrictions: {minHeight: 100, maxHeight: 1000}});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    it('removes the whole variant if one stream is restricted', async () => {
      manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            .addVariant(0)
              .addVideo(1).size(5, 5)
              .addAudio(2)
            .addVariant(1)
              .addVideo(3).size(190, 190)
              .addAudio(4)
          .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      player.configure({restrictions: {minHeight: 100, maxHeight: 1000}});

      let tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(1);
    });

    it('issues error if no streams are playable', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).size(5, 5)
                .addVariant(1)
                  .addVideo(2).size(200, 300)
                .addVariant(2)
                  .addVideo(3).size(190, 190)
              .build();

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      onError.and.callFake(function(e) {
        let error = e.detail;
        shaka.test.Util.expectToEqualError(
            error,
            new shaka.util.Error(
                shaka.util.Error.Severity.CRITICAL,
                shaka.util.Error.Category.MANIFEST,
                shaka.util.Error.Code.RESTRICTIONS_CANNOT_BE_MET, {
                  hasAppRestrictions: true,
                  missingKeys: [],
                  restrictedKeyStatuses: [],
                }));
      });

      player.configure({restrictions: {minHeight: 1000, maxHeight: 2000}});
      expect(onError).toHaveBeenCalled();
    });

    it('chooses efficient codecs and removes the rest', async () => {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
              // More efficient codecs
                .addVariant(0).bandwidth(100)
                  .addVideo(0).mime('video/mp4', 'good')
                .addVariant(1).bandwidth(200)
                  .addVideo(1).mime('video/mp4', 'good')
                .addVariant(2).bandwidth(300)
                  .addVideo(2).mime('video/mp4', 'good')
              // Less efficient codecs
                .addVariant(3).bandwidth(10000)
                  .addVideo(3).mime('video/mp4', 'bad')
                .addVariant(4).bandwidth(20000)
                  .addVideo(4).mime('video/mp4', 'bad')
                .addVariant(5).bandwidth(30000)
                  .addVideo(5).mime('video/mp4', 'bad')
              .build();

      await setupPlayer();
      expect(abrManager.setVariants).toHaveBeenCalled();
      let variants = abrManager.setVariants.calls.argsFor(0)[0];
      // We've already chosen codecs, so only 3 tracks should remain.
      expect(variants.length).toBe(3);
      // They should be the low-bandwidth ones.
      expect(variants[0].video.codecs).toEqual('good');
      expect(variants[1].video.codecs).toEqual('good');
      expect(variants[2].video.codecs).toEqual('good');
    });

    it('updates AbrManager about restricted variants', function(done) {
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0)
                  .addVideo(1).keyId('abc')
                .addVariant(2)
                  .addVideo(3)
              .build();

      let abrManager = new shaka.test.FakeAbrManager();
      player.configure({abrFactory: function() { return abrManager; }});
      setupPlayer().then(function() {
        expect(player.getVariantTracks().length).toBe(2);

        // We have some key statuses, but not for the key IDs we know.
        abrManager.setVariants.calls.reset();
        onKeyStatus({'foo': 'usable'});

        expect(abrManager.setVariants).toHaveBeenCalled();
        let variants = abrManager.setVariants.calls.argsFor(0)[0];
        expect(variants.length).toBe(1);
        expect(variants[0].id).toBe(2);
      }).catch(fail).then(done);
    });

    it('chooses codecs after considering 6-channel preference', async () => {
      manifest = new shaka.test.ManifestGenerator()
          .addPeriod(0)
            // Surround sound AC-3, preferred by config
            .addVariant(0).bandwidth(300)
              .addAudio(0)
                .channelsCount(6).mime('audio/mp4', 'ac-3')
                .audioSamplingRate(48000)
            // Stereo AAC, would win out based on bandwidth alone
            .addVariant(1).bandwidth(100)
              .addAudio(1)
                .channelsCount(2).mime('audio/mp4', 'mp4a.40.2')
                .audioSamplingRate(48000)
          .build();

      // Configure for 6 channels.
      player.configure({
        preferredAudioChannelCount: 6,
      });
      await setupPlayer();
      expect(abrManager.setVariants).toHaveBeenCalled();
      // We've chosen codecs, so only 1 track should remain.
      expect(abrManager.variants.length).toBe(1);
      // It should be the 6-channel variant, based on our preference.
      expect(abrManager.variants[0].audio.channelsCount).toEqual(6);
      expect(abrManager.variants[0].audio.codecs).toEqual('ac-3');
    });

    /**
     * @return {!Promise}
     */
    function setupPlayer() {
      let parser = new shaka.test.FakeManifestParser(manifest);
      let parserFactory = function() { return parser; };
      return player.load(fakeManifestUri, 0, parserFactory).then(function() {
        // Initialize the fake streams.
        streamingEngine.onCanSwitch();
      });
    }
  });

  describe('getPlayheadTimeAsDate()', function() {
    beforeEach(async () => {
      let timeline = new shaka.media.PresentationTimeline(300, 0);
      timeline.setStatic(false);
      manifest = new shaka.test.ManifestGenerator()
          .setTimeline(timeline)
          .addPeriod(0)
            .addVariant(0)
            .addVideo(1)
          .build();
      goog.asserts.assert(manifest, 'manifest must be non-null');
      let parser = new shaka.test.FakeManifestParser(manifest);
      let factory = function() { return parser; };
      await player.load(fakeManifestUri, 0, factory);
    });

    it('gets current wall clock time in UTC', () => {
      playhead.getTime.and.returnValue(20);

      const liveTimeUtc = player.getPlayheadTimeAsDate();
      // (300 (presentation start time) + 20 (playhead time)) * 1000 (ms/sec)
      expect(liveTimeUtc).toEqual(new Date(320 * 1000));
    });
  });

  it('rejects empty manifests', function(done) {
    manifest = new shaka.test.ManifestGenerator().build();
    let emptyParser = new shaka.test.FakeManifestParser(manifest);
    let emptyFactory = function() { return emptyParser; };

    player.load(fakeManifestUri, 0, emptyFactory).then(fail).catch((error) => {
      shaka.test.Util.expectToEqualError(
          error,
          new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.NO_PERIODS));
    }).then(done);
  });

  it('does not assert when adapting', async () => {
    // Most of our Player unit tests never adapt.  This allowed some assertions
    // to creep in that went uncaught until they happened during manual testing.
    // Repro only happens with audio+video variants in which we only adapt one
    // type.  This test covers https://github.com/google/shaka-player/issues/954

    manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
              .addVariant(0).bandwidth(100)
                .addVideo(0).mime('video/mp4', 'good')
                .addAudio(9).mime('audio/mp4', 'good')
              .addVariant(1).bandwidth(200)
                .addVideo(1).mime('video/mp4', 'good')
                .addExistingStream(9)  // audio
              .addVariant(2).bandwidth(300)
                .addVideo(2).mime('video/mp4', 'good')
                .addExistingStream(9)  // audio
            .build();

    let parser = new shaka.test.FakeManifestParser(manifest);
    let parserFactory = function() { return parser; };

    await player.load(fakeManifestUri, 0, parserFactory);
    streamingEngine.onCanSwitch();

    // We've already loaded variants[0].  Switch to [1] and [2].
    abrManager.switchCallback(manifest.periods[0].variants[1]);
    abrManager.switchCallback(manifest.periods[0].variants[2]);
  });

  describe('isTextTrackVisible', function() {
    it('does not throw before load', function() {
      player.isTextTrackVisible();
    });
  });

  describe('setTextTrackVisibility', function() {
    it('does not throw before load', async function() {
      await player.setTextTrackVisibility(true);
    });
  });

  describe('isAudioOnly', function() {
    it('detects audio-only content', async () => {
      // This factory recreates the parser each time, so updates to |manifest|
      // affect the next load() call.
      let parserFactory = function() {
        return new shaka.test.FakeManifestParser(manifest);
      };

      // False before we've loaded anything.
      expect(player.isAudioOnly()).toEqual(false);

      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(100)
                  .addVideo(0).mime('video/mp4', 'good')
                  .addAudio(1).mime('audio/mp4', 'good')
              .build();
      await player.load(fakeManifestUri, 0, parserFactory);
      // We have audio & video tracks, so this is not audio-only.
      expect(player.isAudioOnly()).toEqual(false);

      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(100)
                  .addVideo(0).mime('video/mp4', 'good')
              .build();
      await player.load(fakeManifestUri, 0, parserFactory);
      // We have video-only tracks, so this is not audio-only.
      expect(player.isAudioOnly()).toEqual(false);

      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(100)
                  .addAudio(1).mime('audio/mp4', 'good')
              .build();
      await player.load(fakeManifestUri, 0, parserFactory);
      // We have audio-only tracks, so this is audio-only.
      expect(player.isAudioOnly()).toEqual(true);

      await player.unload();
      // When we have nothing loaded, we go back to not audio-only status.
      expect(player.isAudioOnly()).toEqual(false);
    });
  });

  describe('load', function() {
    it('tolerates bandwidth of NaN, undefined, or 0', async () => {
      // Regression test for https://github.com/google/shaka-player/issues/938
      manifest = new shaka.test.ManifestGenerator()
              .addPeriod(0)
                .addVariant(0).bandwidth(/** @type {?} */(undefined))
                  .addVideo(0).mime('video/mp4', 'good')
                .addVariant(1).bandwidth(NaN)
                  .addVideo(1).mime('video/mp4', 'good')
                .addVariant(2).bandwidth(0)
                  .addVideo(2).mime('video/mp4', 'good')
              .build();

      let parser = new shaka.test.FakeManifestParser(manifest);
      let parserFactory = function() { return parser; };

      // Before the fix, load() would fail assertions and throw errors.
      await player.load(fakeManifestUri, 0, parserFactory);
    });

    it('respects startTime of 0', async () => {
      // What we shouldn't do is treat start time of 0 as the same as startTime
      // of null/undefined.  0 means timestamp 0, whereas null/undefined means
      // "default".  For VOD, the default is 0, but for live streams, the
      // default is the live edge.

      // Create a live timeline and manifest.
      let timeline = new shaka.media.PresentationTimeline(300, 0);
      timeline.setStatic(false);

      manifest = new shaka.test.ManifestGenerator()
          .setTimeline(timeline)
          .addPeriod(0)
            .addVariant(0)
            .addVideo(1)
          .build();

      let parser = new shaka.test.FakeManifestParser(manifest);
      let parserFactory = function() { return parser; };

      // To ensure that Playhead is correctly created, we must use the original
      // playhead injector.  To inspect the real Playhead instance, though, we
      // must shim this method and keep a copy of the real Playhead.  Otherwise,
      // we would be merely inspecting the mock Playhead.
      /** @type {shaka.media.Playhead} */
      let realPlayhead = null;

      /**
       * @this {shaka.Player}
       * @return {!shaka.media.Playhead}
       */
      player.createPlayhead = function() {
        realPlayhead =
            shaka.Player.prototype.createPlayhead.apply(this, arguments);
        return realPlayhead;
      };

      await player.load(fakeManifestUri, /* startTime */ 0, parserFactory);

      // Ensure this is seen as a live stream, or else the test is invalid.
      expect(player.isLive()).toBe(true);

      // If startTime of 0 was treated as null, then getTime() would point to
      // the live edge instead of 0.
      expect(realPlayhead.getTime()).toBe(0);
    });
  });

  describe('language methods', function() {
    let videoOnlyManifest;
    let parserFactory = function() {
      return new shaka.test.FakeManifestParser(manifest);
    };

    beforeEach(function() {
      manifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1).language('fr')
            .addVideo(0).size(300, 400)
            .addAudio(1).language('fr')

          .addVariant(2).language('en')
            .addExistingStream(0)  // video
            .addAudio(2).language('en').roles(['main'])

          .addVariant(3).language('en')
            .addExistingStream(0)  // video
            .addAudio(3).language('en').roles(['commentary'])

          .addVariant(4).language('de')
            .addExistingStream(0)  // video
            .addAudio(4).language('de').roles(['foo', 'bar'])

          .addTextStream(5)
            .language('es').roles(['baz', 'qwerty'])
          .addTextStream(6)
            .language('en').kind('caption').roles(['main', 'caption'])
          .addTextStream(7)
            .language('en').kind('subtitle').roles(['main', 'subtitle'])
        .build();

      videoOnlyManifest = new shaka.test.ManifestGenerator()
        .addPeriod(0)
          .addVariant(1)
            .bandwidth(400)
            .addVideo(1).size(300, 400)
          .addVariant(2)
            .bandwidth(800)
            .addVideo(2).size(500, 600)
        .build();
    });

    describe('get*Languages', function() {
      it('returns a list of languages', async () => {
        await player.load(fakeManifestUri, 0, parserFactory);
        expect(player.getAudioLanguages()).toEqual(['fr', 'en', 'de']);
        expect(player.getTextLanguages()).toEqual(['es', 'en']);
      });

      it('returns "und" for video-only tracks', async () => {
        manifest = videoOnlyManifest;

        await player.load(fakeManifestUri, 0, parserFactory);
        expect(player.getAudioLanguages()).toEqual(['und']);
        expect(player.getTextLanguages()).toEqual([]);
      });
    });

    describe('getAudioLanguagesAndRoles', () => {
      it('ignores video roles', async () => {
        manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
            .addVariant(0).language('en')
            .addVideo(1).roles(['video-only-role'])
            .addAudio(2).roles(['audio-only-role']).language('en')
            .build();

        await player.load(fakeManifestUri, 0, parserFactory);

        expect(player.getAudioLanguagesAndRoles()).toEqual([
          {language: 'en', role: 'audio-only-role'},
        ]);
      });

      it('lists all language-role combinations', async () => {
        await player.load(fakeManifestUri, 0, parserFactory);
        expect(player.getAudioLanguagesAndRoles()).toEqual([
          {language: 'fr', role: ''},
          {language: 'en', role: 'main'},
          {language: 'en', role: 'commentary'},
          {language: 'de', role: 'foo'},
          {language: 'de', role: 'bar'},
        ]);
      });

      it('uses "und" for video-only tracks', async () => {
        manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
            .addVariant(0)
            .addVideo(1).roles(['video-only-role'])
            .build();

        await player.load(fakeManifestUri, 0, parserFactory);
        expect(player.getAudioLanguagesAndRoles()).toEqual([
          {language: 'und', role: ''},
        ]);
      });
    });

    describe('getTextLanguageAndRoles', function() {
      it('lists all language-role combinations', async () => {
        await player.load(fakeManifestUri, 0, parserFactory);
        expect(player.getTextLanguagesAndRoles()).toEqual([
          {language: 'es', role: 'baz'},
          {language: 'es', role: 'qwerty'},
          {language: 'en', role: 'main'},
          {language: 'en', role: 'caption'},
          {language: 'en', role: 'subtitle'},
        ]);
      });
    });
  });

  /**
   * Gets the currently active variant track.
   * @return {shaka.extern.Track}
   */
  function getActiveVariantTrack() {
    let activeTracks = player.getVariantTracks().filter(function(track) {
      return track.active;
    });

    expect(activeTracks.length).toBe(1);
    return activeTracks[0];
  }

  /**
   * Gets the currently active text track.
   * @return {shaka.extern.Track}
   */
  function getActiveTextTrack() {
    let activeTracks = player.getTextTracks().filter(function(track) {
      return track.active;
    });

    expect(activeTracks.length).toBe(1);
    return activeTracks[0];
  }

  /**
   * Simulate the transition to a new period using the fake StreamingEngine.
   * @param {number} index
   */
  function transitionPeriod(index) {
    periodIndex = index;
    streamingEngine.onChooseStreams();
  }

  /**
   * Choose streams for the given period.
   *
   * @suppress {accessControls}
   * @return {shaka.media.StreamingEngine.ChosenStreams}
   */
  function onChooseStreams() {
    return player.onChooseStreams_(manifest.periods[periodIndex]);
  }

  /** @suppress {accessControls} */
  function onCanSwitch() { player.canSwitch_(); }

  /**
   * A Jasmine asymmetric matcher for substring matches.
   * @param {string} substring
   * @return {!Object}
   */
  function stringContaining(substring) {
    return {
      asymmetricMatch: function(actual) {
        return actual.includes(substring);
      },
    };
  }

  /**
   * @param {!Object.<string, string>} keyStatusMap
   * @suppress {accessControls}
   */
  function onKeyStatus(keyStatusMap) {
    player.onKeyStatus_(keyStatusMap);
  }

  /**
   * @param {shaka.extern.Manifest} manifest
   * @return {function():shaka.extern.ManifestParser}
   */
  function returnManifest(manifest) {
    return () => {
      return new shaka.test.FakeManifestParser(manifest);
    };
  }

  /**
   * Create a fake text displayer with a little extra logic to work with the
   * test cases.
   *
   * @return {!shaka.test.FakeTextDisplayer}
   */
  function createTextDisplayer() {
    /** @type {!shaka.test.FakeTextDisplayer} */
    const displayer = new shaka.test.FakeTextDisplayer();

    // Allow the tests to set and check if we are showing text.
    let isVisible = false;
    displayer.isTextVisibleSpy.and.callFake(() => {
      return isVisible;
    });
    displayer.setTextVisibilitySpy.and.callFake((on) => {
      isVisible = on;
    });

    return displayer;
  }
});
