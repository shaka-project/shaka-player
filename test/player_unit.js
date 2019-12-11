/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player', () => {
  const ContentType = shaka.util.ManifestParserUtils.ContentType;
  const Util = shaka.test.Util;
  const returnManifest = (manifest) =>
    Util.factoryReturns(new shaka.test.FakeManifestParser(manifest));

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

  let mediaSourceEngine;

  /** @type {!shaka.test.FakeVideo} */
  let video;

  beforeEach(() => {
    // By default, errors are a failure.
    logErrorSpy = jasmine.createSpy('shaka.log.error');
    logErrorSpy.calls.reset();
    shaka.log.error = shaka.test.Util.spyFunc(logErrorSpy);

    logWarnSpy = jasmine.createSpy('shaka.log.warning');
    logErrorSpy.and.callFake(fail);
    shaka.log.warning = shaka.test.Util.spyFunc(logWarnSpy);
    shaka.log.alwaysWarn = shaka.test.Util.spyFunc(logWarnSpy);

    // Since this is not an integration test, we don't want MediaSourceEngine to
    // fail assertions based on browser support for types.  Pretend that all
    // video and audio types are supported.
    window.MediaSource.isTypeSupported = (mimeType) => {
      const type = mimeType.split('/')[0];
      return type == 'video' || type == 'audio';
    };

    // Many tests assume the existence of a manifest, so create a basic one.
    // Test suites can override this with more specific manifests.
    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addPeriod(0, (period) => {
        period.addVariant(0, (variant) => {
          variant.addAudio(1);
          variant.addVideo(2);
        });
      });
      manifest.addPeriod(1, (period) => {
        period.addVariant(1, (variant) => {
          variant.addAudio(3);
          variant.addVideo(4);
        });
      });
    });
    periodIndex = 0;

    abrManager = new shaka.test.FakeAbrManager();
    textDisplayer = createTextDisplayer();

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
        destroy:
            jasmine.createSpy('destroy').and.returnValue(Promise.resolve()),
        setUseEmbeddedText: jasmine.createSpy('setUseEmbeddedText'),
        getUseEmbeddedText: jasmine.createSpy('getUseEmbeddedText'),
        getTextDisplayer: () => textDisplayer,
        ended: jasmine.createSpy('ended').and.returnValue(false),
      };

      player.createDrmEngine = () => drmEngine;
      player.createNetworkingEngine = () => networkingEngine;
      player.createPlayhead = () => playhead;
      player.createMediaSourceEngine = () => mediaSourceEngine;
      player.createStreamingEngine = () => streamingEngine;
    }

    video = new shaka.test.FakeVideo(20);
    player = new shaka.Player(video, dependencyInjector);
    player.configure({
      // Ensures we don't get a warning about missing preference.
      preferredAudioLanguage: 'en',
      abrFactory: Util.factoryReturns(abrManager),
      textDisplayFactory: Util.factoryReturns(textDisplayer),
    });

    onError = jasmine.createSpy('error event');
    onError.and.callFake((event) => {
      fail(event.detail);
    });
    player.addEventListener('error', shaka.test.Util.spyFunc(onError));
  });

  afterEach(async () => {
    try {
      await player.destroy();
    } finally {
      shaka.log.error = originalLogError;
      shaka.log.warning = originalLogWarn;
      shaka.log.alwaysWarn = originalLogAlwaysWarn;
      window.MediaSource.isTypeSupported = originalIsTypeSupported;
    }
  });

  describe('destroy', () => {
    it('cleans up all dependencies', async () => {
      goog.asserts.assert(manifest, 'Manifest should be non-null');

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
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

      mediaSourceEngine.destroy.and.callFake(async () => {
        expect(drmEngine.destroy).not.toHaveBeenCalled();
        await Util.shortDelay();
        expect(drmEngine.destroy).not.toHaveBeenCalled();
      });

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      await player.destroy();

      expect(mediaSourceEngine.destroy).toHaveBeenCalled();
      expect(drmEngine.destroy).toHaveBeenCalled();
    });

    // TODO(vaage): Re-enable once the parser is integrated into the load graph
    //              better.
    xit('destroys parser first when interrupting load', async () => {
      const p = shaka.test.Util.shortDelay();
      /** @type {!shaka.test.FakeManifestParser} */
      const parser = new shaka.test.FakeManifestParser(manifest);
      parser.start.and.returnValue(p);
      parser.stop.and.callFake(() => {
        expect(abrManager.stop).not.toHaveBeenCalled();
        expect(networkingEngine.destroy).not.toHaveBeenCalled();
      });

      const load = player.load(fakeManifestUri, 0, Util.factoryReturns(parser));
      await shaka.test.Util.shortDelay();
      await player.destroy();
      expect(abrManager.stop).toHaveBeenCalled();
      expect(networkingEngine.destroy).toHaveBeenCalled();
      expect(parser.stop).toHaveBeenCalled();
      await expectAsync(load).toBeRejected();
    });
  });

  describe('load/unload', () => {
    /** @type {!jasmine.Spy} */
    let checkError;

    beforeEach(() => {
      goog.asserts.assert(manifest, 'manifest must be non-null');
      checkError = jasmine.createSpy('checkError');
      checkError.and.callFake((error) => {
        expect(error.code).toBe(shaka.util.Error.Code.LOAD_INTERRUPTED);
      });
    });

    describe('streaming event', () => {
      /** @type {jasmine.Spy} */
      let streamingListener;

      beforeEach(() => {
        streamingListener = jasmine.createSpy('listener');
        player.addEventListener('streaming', Util.spyFunc(streamingListener));

        // We must have two different sets of codecs for some of our tests.
        manifest = shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addPeriod(0, (period) => {
            period.addVariant(0, (variant) => {
              variant.addAudio(1, (stream) => {
                stream.mime('audio/mp4', 'mp4a.40.2');
              });
              variant.addVideo(2, (stream) => {
                stream.mime('video/mp4', 'avc1.4d401f');
              });
            });
            period.addVariant(1, (variant) => {
              variant.addAudio(3, (stream) => {
                stream.mime('audio/webm', 'opus');
              });
              variant.addVideo(4, (stream) => {
                stream.mime('video/webm', 'vp9');
              });
            });
          });
        });
      });

      async function runTest() {
        expect(streamingListener).not.toHaveBeenCalled();
        await player.load(fakeManifestUri, 0, returnManifest(manifest));
        expect(streamingListener).toHaveBeenCalled();
      }

      it('fires after tracks exist', async () => {
        streamingListener.and.callFake(() => {
          const tracks = player.getVariantTracks();
          expect(tracks).toBeDefined();
          expect(tracks.length).toBeGreaterThan(0);
        });
        await runTest();
      });

      it('fires before any tracks are active', async () => {
        streamingListener.and.callFake(() => {
          const activeTracks =
            player.getVariantTracks().filter((t) => t.active);
          expect(activeTracks.length).toBe(0);
        });
        await runTest();
      });

      // We used to fire the event /before/ filtering, which meant that for
      // multi-codec content, the application might select something which will
      // later be removed during filtering.
      // https://github.com/google/shaka-player/issues/1119
      it('fires after tracks have been filtered', async () => {
        streamingListener.and.callFake(() => {
          const tracks = player.getVariantTracks();
          // Either WebM, or MP4, but not both.
          expect(tracks.length).toBe(1);
        });
        await runTest();
      });
    });

    describe('setTextTrackVisibility', () => {
      beforeEach(() => {
        manifest = shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addPeriod(0, (period) => {
            period.addVariant(0, (variant) => {
              variant.addAudio(1);
              variant.addVideo(2);
            });
            period.addTextStream(3, (stream) => {
              stream.bandwidth = 100;
              stream.kind = 'caption';
              stream.label = 'Spanish';
              stream.language = 'es';
            });
          });
        });
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

  describe('getConfiguration', () => {
    it('returns a copy of the configuration', () => {
      const config1 = player.getConfiguration();
      config1.streaming.bufferBehind = -99;
      const config2 = player.getConfiguration();
      expect(config1.streaming.bufferBehind).not.toBe(
          config2.streaming.bufferBehind);
    });
  });

  describe('configure', () => {
    it('overwrites defaults', () => {
      const defaultConfig = player.getConfiguration();
      // Make sure the default differs from our test value:
      expect(defaultConfig.drm.retryParameters.backoffFactor).not.toBe(5);
      expect(defaultConfig.manifest.retryParameters.backoffFactor).not.toBe(5);

      player.configure({
        drm: {
          retryParameters: {backoffFactor: 5},
        },
      });

      const newConfig = player.getConfiguration();
      // Make sure we changed the backoff for DRM, but not for manifests:
      expect(newConfig.drm.retryParameters.backoffFactor).toBe(5);
      expect(newConfig.manifest.retryParameters.backoffFactor).not.toBe(5);
    });

    it('reverts to defaults when undefined is given', () => {
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

    it('restricts the types of config values', () => {
      logErrorSpy.and.stub();
      const defaultConfig = player.getConfiguration();

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

    it('expands dictionaries that allow arbitrary keys', () => {
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

    it('expands dictionaries but still restricts their values', () => {
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
      const lastGoodConfig = newConfig;

      // Try an invalid advanced config key.
      player.configure({
        drm: {advanced: {'ks1': {bogus: true}}},
      });

      newConfig = player.getConfiguration();
      expect(newConfig).toEqual(lastGoodConfig);
      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.drm.advanced.ks1.bogus'));
    });

    it('removes dictionary entries when undefined is given', () => {
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

    it('checks the number of arguments to functions', () => {
      const goodCustomScheme = (node) => {};
      const badCustomScheme1 = () => {};  // too few args
      const badCustomScheme2 = (x, y) => {};  // too many args

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
    it('does not throw when overwriting serverCertificate', () => {
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

    it('checks the type of serverCertificate', () => {
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

    it('does not throw when null appears instead of an object', () => {
      logErrorSpy.and.stub();

      player.configure({
        drm: {advanced: null},
      });

      expect(logErrorSpy).toHaveBeenCalledWith(
          stringContaining('.drm.advanced'));
    });

    it('configures play and seek range for VOD', async () => {
      player.configure({playRangeStart: 5, playRangeEnd: 10});
      const timeline = new shaka.media.PresentationTimeline(300, 0);
      timeline.setStatic(true);
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.presentationTimeline = timeline;
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1);
          });
        });
      });
      goog.asserts.assert(manifest, 'manifest must be non-null');
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      const seekRange = player.seekRange();
      expect(seekRange.start).toBe(5);
      expect(seekRange.end).toBe(10);
    });

    it('does not switch for plain configuration changes', async () => {
      const switchVariantSpy = spyOn(player, 'switchVariant_');

      await player.load(fakeManifestUri, 0, returnManifest(manifest));

      player.configure({abr: {enabled: false}});
      player.configure({streaming: {bufferingGoal: 9001}});

      // Delay to ensure that the switch would have been called.
      await shaka.test.Util.shortDelay();

      expect(switchVariantSpy).not.toHaveBeenCalled();
    });

    it('accepts parameters in a (fieldName, value) format', () => {
      const oldConfig = player.getConfiguration();
      const oldDelayLicense = oldConfig.drm.delayLicenseRequestUntilPlayed;
      const oldSwitchInterval = oldConfig.abr.switchInterval;
      const oldPreferredLang = oldConfig.preferredAudioLanguage;

      expect(oldDelayLicense).toBe(false);
      expect(oldSwitchInterval).toBe(8);
      expect(oldPreferredLang).toBe('en');

      player.configure('drm.delayLicenseRequestUntilPlayed', true);
      player.configure('abr.switchInterval', 10);
      player.configure('preferredAudioLanguage', 'fr');

      const newConfig = player.getConfiguration();
      const newDelayLicense = newConfig.drm.delayLicenseRequestUntilPlayed;
      const newSwitchInterval = newConfig.abr.switchInterval;
      const newPreferredLang = newConfig.preferredAudioLanguage;

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

    it('returns whether the config was valid', () => {
      logErrorSpy.and.stub();
      expect(player.configure({streaming: {bufferBehind: '77'}})).toBe(false);
      expect(player.configure({streaming: {bufferBehind: 77}})).toBe(true);
    });

    it('still sets other fields when there are errors', () => {
      logErrorSpy.and.stub();

      const changes = {
        manifest: {foobar: false},
        streaming: {bufferBehind: 77},
      };
      expect(player.configure(changes)).toBe(false);

      const newConfig = player.getConfiguration();
      expect(newConfig.streaming.bufferBehind).toBe(77);
    });

    // https://github.com/google/shaka-player/issues/1524
    it('does not pollute other advanced DRM configs', () => {
      player.configure('drm.advanced.foo', {});
      player.configure('drm.advanced.bar', {});
      const fooConfig1 = player.getConfiguration().drm.advanced.foo;
      const barConfig1 = player.getConfiguration().drm.advanced.bar;
      expect(fooConfig1.distinctiveIdentifierRequired).toBe(false);
      expect(barConfig1.distinctiveIdentifierRequired).toBe(false);

      player.configure('drm.advanced.foo.distinctiveIdentifierRequired', true);
      const fooConfig2 = player.getConfiguration().drm.advanced.foo;
      const barConfig2 = player.getConfiguration().drm.advanced.bar;
      expect(fooConfig2.distinctiveIdentifierRequired).toBe(true);
      expect(barConfig2.distinctiveIdentifierRequired).toBe(false);
    });
  });

  describe('resetConfiguration', () => {
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

  describe('AbrManager', () => {
    beforeEach(() => {
      goog.asserts.assert(manifest, 'manifest must be non-null');
    });

    it('sets through load', async () => {
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      expect(abrManager.init).toHaveBeenCalled();
    });

    it('calls chooseVariant', async () => {
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      expect(abrManager.chooseVariant).toHaveBeenCalled();
    });

    it('does not enable before stream startup', async () => {
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      expect(abrManager.enable).not.toHaveBeenCalled();
      streamingEngine.onCanSwitch();
      expect(abrManager.enable).toHaveBeenCalled();
    });

    it('does not enable if adaptation is disabled', async () => {
      player.configure({abr: {enabled: false}});
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      streamingEngine.onCanSwitch();
      expect(abrManager.enable).not.toHaveBeenCalled();
    });

    it('enables/disables though configure', async () => {
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
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
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
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

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      expect(spy).toHaveBeenCalled();
      spy.calls.reset();

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
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

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      expect(spy1).toHaveBeenCalled();
      expect(spy2).not.toHaveBeenCalled();
      spy1.calls.reset();

      player.configure({abrFactory: spy2});
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      expect(spy1).not.toHaveBeenCalled();
      expect(spy2).toHaveBeenCalled();
    });
  });

  describe('filterTracks', () => {
    it('retains only video+audio variants if they exist', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(10, (variant) => {
            variant.addAudio(1);
          });
          period.addVariant(11, (variant) => {
            variant.addAudio(2);
            variant.addVideo(3);
          });
          period.addVariant(12, (variant) => {
            variant.addVideo(4);
          });
        });
        manifest.addPeriod(1, (period) => {
          period.addVariant(20, (variant) => {
            variant.addAudio(5);
          });
          period.addVariant(21, (variant) => {
            variant.addVideo(6);
          });
          period.addVariant(22, (variant) => {
            variant.addAudio(7);
            variant.addVideo(8);
          });
        });
      });

      const variantTracks1 = [
        jasmine.objectContaining({
          id: 11,
          active: true,
          type: 'variant',
        }),
      ];
      const variantTracks2 = [
        jasmine.objectContaining({
          id: 22,
          active: false,
          type: 'variant',
        }),
      ];

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      // Check the first period's variant tracks.
      const actualVariantTracks1 = player.getVariantTracks();
      expect(actualVariantTracks1).toEqual(variantTracks1);

      // Check the second period's variant tracks.
      playhead.getTime.and.callFake(() => {
        return 100;
      });
      const actualVariantTracks2 = player.getVariantTracks();
      expect(actualVariantTracks2).toEqual(variantTracks2);
    });
  });

  describe('tracks', () => {
    /** @type {!Array.<shaka.extern.Track>} */
    let variantTracks;
    /** @type {!Array.<shaka.extern.Track>} */
    let textTracks;

    beforeEach(async () => {
      // A manifest we can use to test track expectations.
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(100, (variant) => {  // main surround, low res
            variant.bandwidth = 1300;
            variant.language = 'en';
            variant.addVideo(1, (stream) => {
              stream.originalId = 'video-1kbps';
              stream.bandwidth = 1000;
              stream.width = 100;
              stream.height = 200;
              stream.frameRate = 1000000 / 42000;
            });
            variant.addAudio(3, (stream) => {
              stream.originalId = 'audio-en-6c';
              stream.bandwidth = 300;
              stream.channelsCount = 6;
              stream.audioSamplingRate = 48000;
              stream.roles = ['main'];
            });
          });
          period.addVariant(101, (variant) => {  // main surround, high res
            variant.bandwidth = 2300;
            variant.language = 'en';
            variant.addVideo(2, (stream) => {
              stream.originalId = 'video-2kbps';
              stream.bandwidth = 2000;
              stream.frameRate = 24;
              stream.size(200, 400);
            });
            variant.addExistingStream(3);  // audio
          });
          period.addVariant(102, (variant) => {  // main stereo, low res
            variant.bandwidth = 1100;
            variant.language = 'en';
            variant.addExistingStream(1);  // video
            variant.addAudio(4, (stream) => {
              stream.originalId = 'audio-en-2c';
              stream.bandwidth = 100;
              stream.channelsCount = 2;
              stream.audioSamplingRate = 48000;
              stream.roles = ['main'];
            });
          });
          period.addVariant(103, (variant) => {  // main stereo, high res
            variant.bandwidth = 2100;
            variant.language = 'en';
            variant.addExistingStream(2);  // video
            variant.addExistingStream(4);  // audio
          });
          period.addVariant(104, (variant) => {  // commentary stereo, low res
            variant.bandwidth = 1100;
            variant.language = 'en';
            variant.addExistingStream(1);  // video
            variant.addAudio(5, (stream) => {
              stream.originalId = 'audio-commentary';
              stream.bandwidth = 100;
              stream.channelsCount = 2;
              stream.audioSamplingRate = 48000;
              stream.roles = ['commentary'];
            });
          });
          period.addVariant(105, (variant) => {  // commentary stereo, low res
            variant.bandwidth = 2100;
            variant.language = 'en';
            variant.addExistingStream(2);  // video
            variant.addExistingStream(5);  // audio
          });
          period.addVariant(106, (variant) => {  // spanish stereo, low res
            variant.language = 'es';
            variant.bandwidth = 1100;
            variant.addExistingStream(1);  // video
            variant.addAudio(6, (stream) => {
              stream.originalId = 'audio-es';
              stream.bandwidth = 100;
              stream.channelsCount = 2;
              stream.audioSamplingRate = 48000;
            });
          });
          period.addVariant(107, (variant) => {  // spanish stereo, high res
            variant.language = 'es';
            variant.bandwidth = 2100;
            variant.addExistingStream(2);  // video
            variant.addExistingStream(6);  // audio
          });

          // All text tracks should remain, even with different MIME types.
          period.addTextStream(50, (stream) => {
            stream.originalId = 'text-es';
            stream.language = 'es';
            stream.label = 'Spanish';
            stream.bandwidth = 10;
            stream.mimeType = 'text/vtt';
            stream.kind = 'caption';
          });
          period.addTextStream(51, (stream) => {
            stream.originalId = 'text-en';
            stream.language = 'en';
            stream.label = 'English';
            stream.bandwidth = 10;
            stream.mimeType = 'application/ttml+xml';
            stream.kind = 'caption';
            stream.roles = ['main'];
          });
          period.addTextStream(52, (stream) => {
            stream.originalId = 'text-commentary';
            stream.language = 'en';
            stream.label = 'English';
            stream.bandwidth = 10;
            stream.mimeType = 'application/ttml+xml';
            stream.kind = 'caption';
            stream.roles = ['commentary'];
          });
        });
        manifest.addPeriod(1, (period) => {
          period.addVariant(200, (variant) => {
            variant.bandwidth = 1100;
            variant.language = 'en';
            variant.addVideo(10, (stream) => {
              stream.bandwidth = 1000;
              stream.size(100, 200);
            });
            variant.addAudio(11, (stream) => {
              stream.bandwidth = 100;
              stream.channelsCount = 2;
              stream.audioSamplingRate = 48000;
            });
          });
          period.addVariant(201, (variant) => {
            variant.bandwidth = 1300;
            variant.language = 'en';
            variant.addExistingStream(10);  // video
            variant.addAudio(12, (stream) => {
              stream.bandwidth = 300;
              stream.channelsCount = 6;
              stream.audioSamplingRate = 48000;
            });
          });
        });
      });

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
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: ['commentary'],
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
          mimeType: 'video/mp4',
          codecs: 'avc1.4d401f, mp4a.40.2',
          audioCodec: 'mp4a.40.2',
          videoCodec: 'avc1.4d401f',
          primary: false,
          roles: [],
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
          videoId: null,
          audioId: null,
          originalAudioId: null,
          originalVideoId: null,
          originalTextId: 'text-commentary',
        },
      ];

      goog.asserts.assert(manifest, 'manifest must be non-null');

      // Language/channel prefs must be set before load.  Used in
      // select*Language() tests.
      player.configure({
        preferredAudioLanguage: 'en',
        preferredTextLanguage: 'es',
        preferredAudioChannelCount: 6,
      });

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
    });

    it('returns the correct tracks', () => {
      streamingEngine.onCanSwitch();

      expect(player.getVariantTracks()).toEqual(variantTracks);
      expect(player.getTextTracks()).toEqual(textTracks);
    });

    it('returns empty arrays before tracks can be determined', async () => {
      const parser = new shaka.test.FakeManifestParser(manifest);
      parser.start.and.callFake((manifestUri, playerInterface) => {
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

      await player.load(fakeManifestUri, 0, Util.factoryReturns(parser));

      // Make sure the interruptions didn't mess up the tracks.
      streamingEngine.onCanSwitch();
      expect(player.getVariantTracks()).toEqual(variantTracks);
      expect(player.getTextTracks()).toEqual(textTracks);
    });

    it('doesn\'t disable AbrManager if switching variants', () => {
      streamingEngine.onCanSwitch();

      let config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);

      const newTrack = player.getVariantTracks().filter((t) => !t.active)[0];
      player.selectVariantTrack(newTrack);

      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
    });

    it('doesn\'t disable AbrManager if switching text', () => {
      streamingEngine.onCanSwitch();

      let config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);

      const newTrack = player.getTextTracks().filter((t) => !t.active)[0];
      player.selectTextTrack(newTrack);

      config = player.getConfiguration();
      expect(config.abr.enabled).toBe(true);
    });

    it('switches streams', () => {
      streamingEngine.onCanSwitch();

      const newTrack = player.getVariantTracks().filter((t) => !t.active)[0];
      player.selectVariantTrack(newTrack);

      expect(streamingEngine.switchVariant).toHaveBeenCalled();
      const variant = streamingEngine.switchVariant.calls.argsFor(0)[0];
      expect(variant.id).toBe(newTrack.id);
    });

    it('still switches streams if called during startup', () => {
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
      expect(variant.id).toBe(newTrack.id);
    });

    it('still switches streams if called while switching Periods', () => {
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
      expect(variant.id).toBe(newTrack.id);
    });

    it('switching audio doesn\'t change selected text track', () => {
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
       'preferredAudioLanguage', () => {
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

    it('selectAudioLanguage() respects selected role', () => {
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

    it('selectAudioLanguage() does not change selected text track', () => {
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
       'preferredTextLanguage', () => {
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

    it('selectTextLanguage() respects selected role', () => {
      streamingEngine.onCanSwitch();
      expect(getActiveTextTrack().roles).not.toContain('commentary');

      streamingEngine.switchTextStream.calls.reset();
      player.selectTextLanguage('en', 'commentary');

      expect(streamingEngine.switchTextStream).toHaveBeenCalled();
      const args = streamingEngine.switchTextStream.calls.argsFor(0);
      expect(args[0].roles).toContain('commentary');
      expect(getActiveTextTrack().roles).toContain('commentary');
    });

    it('changing current audio language changes active stream', () => {
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

    it('changing current text language changes active stream', () => {
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
      for (const v of abrManager.variants) {
        expect(v.audio.channelsCount).toBe(2);
      }

      // Re-enable ABR.
      player.configure({abr: {enabled: true}});

      // See that AbrManager still has a list of 2-channel tracks.
      expect(abrManager.variants.length).toBeGreaterThan(0);
      for (const v of abrManager.variants) {
        expect(v.audio.channelsCount).toBe(2);
      }
      // See that we are still playing a 2-channel track.
      expect(getActiveVariantTrack().channelsCount).toBe(2);
    });

    it('remembers the channel count across key status changes', () => {
      // Simulate an encrypted stream.  Mark half of the audio streams with key
      // ID 'aaa', and the other half with 'bbb'.  Remove all roles, so that our
      // choices are limited only by channel count and key status.
      for (const variant of manifest.periods[0].variants) {
        const keyId = (variant.audio.id % 2) ? 'aaa' : 'bbb';
        variant.audio.keyId = keyId;
        variant.video.roles = [];
        variant.audio.roles = [];
      }

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
      for (const v of abrManager.variants) {
        expect(v.audio.channelsCount).toBe(2);
      }

      // Simulate a key status event that would trigger the removal of some
      // tracks.
      onKeyStatus({
        'aaa': 'usable',
        'bbb': 'output-restricted',
      });

      // See that AbrManager still has a list of 2-channel tracks.
      expect(abrManager.variants.length).toBeGreaterThan(0);
      for (const v of abrManager.variants) {
        expect(v.audio.channelsCount).toBe(2);
      }
      // See that we are still playing a 2-channel track.
      expect(getActiveVariantTrack().channelsCount).toBe(2);
    });
  });  // describe('tracks')

  describe('languages', () => {
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
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.language = 'pt';
            variant.addAudio(0);
          });
          period.addVariant(1, (variant) => {
            variant.language = 'en';
            variant.addAudio(1);
          });
          period.addTextStream(2, (stream) => {
            stream.language = 'pt';
          });
          period.addTextStream(3, (stream) => {
            stream.language = 'fr';
          });
        });
      });

      player.configure({
        preferredAudioLanguage: 'en',
        preferredTextLanguage: 'fr',
      });

      expect(player.isTextTrackVisible()).toBe(false);

      await player.load(fakeManifestUri, 0, returnManifest(manifest));

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
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.language = 'pt';
            variant.addAudio(0);
          });
          period.addVariant(1, (variant) => {
            variant.language = 'en';
            variant.addAudio(1);
          });
        });
      });

      player.configure({
        preferredAudioLanguage: undefined,
      });

      await player.load(fakeManifestUri, 0, returnManifest(manifest));

      expect(abrManager.setVariants).toHaveBeenCalled();

      // If we have chosen any arbitrary language, setVariants is provided
      // with exactly one variant.
      const variants = abrManager.setVariants.calls.argsFor(0)[0];
      expect(variants.length).toBe(1);
    });

    /**
     * @param {!Array.<string>} languages
     * @param {string} preference
     * @param {number} expectedIndex
     * @return {!Promise}
     */
    async function runTest(languages, preference, expectedIndex) {
      // A manifest we can use to test language selection.
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          const enumerate = (it) => shaka.util.Iterables.enumerate(it);
          for (const {i, item: lang} of enumerate(languages)) {
            if (lang.charAt(0) == '*') {
              period.addVariant(i, (variant) => {
                variant.primary = true;
                variant.language = lang.substr(1);
                variant.addAudio(i);
              });
            } else {
              period.addVariant(i, (variant) => {
                variant.language = lang;
                variant.addAudio(i);
              });
            }
          }
        });
      });

      // Set the user preferences, which must happen before load().
      player.configure({
        preferredAudioLanguage: preference,
      });

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      expect(getActiveVariantTrack().id).toBe(expectedIndex);
    }
  });

  describe('getStats', () => {
    const oldDateNow = Date.now;

    beforeEach(async () => {
      Date.now = () => 0;

      // The media element may be paused in a test, make sure that it is reset
      // to avoid cross-test contamination.
      video.paused = false;

      // A manifest we can use to test stats.
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.bandwidth = 200;
            variant.addAudio(1, (stream) => {
              stream.bandwidth = 100;
            });
            variant.addVideo(2, (stream) => {
              stream.bandwidth = 100;
              stream.size(100, 200);
            });
          });
          period.addVariant(1, (variant) => {
            variant.bandwidth = 300;
            variant.addExistingStream(1);  // audio
            variant.addVideo(3, (stream) => {
              stream.bandwidth = 200;
              stream.size(200, 400);
            });
          });
          period.addVariant(2, (variant) => {
            variant.bandwidth = 300;
            variant.addAudio(4, (stream) => {
              stream.bandwidth = 200;
            });
            variant.addExistingStream(2);  // video
          });
          period.addVariant(3, (variant) => {
            variant.bandwidth = 400;
            variant.addExistingStream(4);  // audio
            variant.addExistingStream(3);  // video
          });
        });
      });

      await player.load(fakeManifestUri, 0, returnManifest(manifest));

      // Initialize the fake streams.
      streamingEngine.onCanSwitch();
    });

    afterEach(() => {
      Date.now = oldDateNow;
    });

    it('tracks estimated bandwidth', () => {
      abrManager.getBandwidthEstimate.and.returnValue(25);
      const stats = player.getStats();
      expect(stats.estimatedBandwidth).toBe(25);
    });

    it('tracks info about current stream', () => {
      const stats = player.getStats();
      // Should have chosen the first of each type of stream.
      expect(stats.width).toBe(100);
      expect(stats.height).toBe(200);
      expect(stats.streamBandwidth).toBe(200);
    });

    it('tracks frame info', () => {
      // getVideoPlaybackQuality does not exist yet.
      let stats = player.getStats();
      expect(stats.decodedFrames).toBeNaN();
      expect(stats.droppedFrames).toBeNaN();

      video.getVideoPlaybackQuality = () => {
        return {
          corruptedVideoFrames: 0,
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
    });

    describe('buffer/play times', () => {
      it('tracks play time', () => {
        let stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(0);

        // Stop buffering and start "playing".
        forceBufferingTo(false);
        Date.now = () => 5000;

        stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(5);
        expect(stats.bufferingTime).toBeCloseTo(0);
      });

      it('tracks buffering time', () => {
        let stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(0);

        forceBufferingTo(true);
        Date.now = () => 5000;

        stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(0);
        expect(stats.bufferingTime).toBeCloseTo(5);
      });

      it('tracks correct time when switching states', () => {
        forceBufferingTo(false);
        Date.now = () => 3000;
        forceBufferingTo(true);
        Date.now = () => 8000;
        forceBufferingTo(true);
        Date.now = () => 17000;
        forceBufferingTo(false);
        Date.now = () => 18000;

        const stats = player.getStats();
        expect(stats.playTime).toBeCloseTo(4);
        expect(stats.bufferingTime).toBeCloseTo(14);
      });
    });

    describe('.switchHistory', () => {
      it('includes original choices', () => {
        // checkHistory prepends the initial stream selections.
        checkHistory([]);
      });

      it('includes selectVariantTrack choices', () => {
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

      it('includes adaptation choices', () => {
        const variant = manifest.periods[0].variants[3];

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
        const prefix = {
          timestamp: jasmine.any(Number),
          id: 0,
          type: 'variant',
          fromAdaptation: true,
          bandwidth: 200,
        };

        const switchHistory = player.getStats().switchHistory;

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

    describe('.stateHistory', () => {
      function history() {
        return player.getStats().stateHistory;
      }

      // We expect that the player will start us in the buffering state after
      // loading. We should see that the only entry is a buffering entry.
      it('begins with buffering state', () => {
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
      it('transitions to paused if the video is paused', () => {
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
      it('transitions to playing if the video is playing', () => {
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
      it('transitions to ended when the video ends', () => {
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

  describe('unplayable periods', () => {
    beforeEach(() => {
      // overriding for good / bad codecs.
      window.MediaSource.isTypeSupported =
          (mimeType) => mimeType.includes('good');
    });

    it('success when one period is playable', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(0, (stream) => {
              stream.mime('video/mp4', 'good');
            });
          });
        });
      });

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
    });

    it('success when all periods are playable', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(0, (stream) => {
              stream.mime('video/mp4', 'good');
            });
          });
        });
        manifest.addPeriod(1, (period) => {
          period.addVariant(1, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.mime('video/mp4', 'good');
            });
          });
        });
      });

      await player.load(fakeManifestUri, 0, returnManifest(manifest));
    });

    it('throw UNPLAYABLE_PERIOD when some periods are unplayable', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(0, (stream) => {
              stream.mime('video/mp4', 'good');
            });
          });
        });
        manifest.addPeriod(1, (period) => {
          period.addVariant(1, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.mime('video/mp4', 'bad');
            });
          });
        });
      });

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNPLAYABLE_PERIOD));
      const load = player.load(fakeManifestUri, 0, returnManifest(manifest));
      await expectAsync(load).toBeRejectedWith(expected);
    });

    it('throw CONTENT_UNSUPPORTED_BY_BROWSER when the only period is ' +
        'unplayable', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(0, (stream) => {
              stream.mime('video/mp4', 'bad');
            });
          });
        });
      });

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER));
      const load = player.load(fakeManifestUri, 0, returnManifest(manifest));
      await expectAsync(load).toBeRejectedWith(expected);
    });

    it('throw CONTENT_UNSUPPORTED_BY_BROWSER when all periods are unplayable',
        async () => {
          manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addPeriod(0, (period) => {
              period.addVariant(0, (variant) => {
                variant.addVideo(0, (stream) => {
                  stream.mime('video/mp4', 'bad');
                });
              });
              period.addVariant(1, (variant) => {
                variant.addVideo(1, (stream) => {
                  stream.mime('video/mp4', 'bad');
                });
              });
            });
            manifest.addPeriod(1, (period) => {
              period.addVariant(2, (variant) => {
                variant.addVideo(2, (stream) => {
                  stream.mime('video/mp4', 'bad');
                });
              });
            });
          });

          const expected = Util.jasmineError(new shaka.util.Error(
              shaka.util.Error.Severity.CRITICAL,
              shaka.util.Error.Category.MANIFEST,
              shaka.util.Error.Code.CONTENT_UNSUPPORTED_BY_BROWSER));
          const load = player.load(
              fakeManifestUri, 0, returnManifest(manifest));
          await expectAsync(load).toBeRejectedWith(expected);
        });

    it('throw UNPLAYABLE_PERIOD when the new period unplayable', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(0, (stream) => {
              stream.mime('video/mp4', 'good');
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.mime('video/mp4', 'good');
            });
          });
        });
      });

      /** @type {!shaka.test.FakeManifestParser} */
      const parser = new shaka.test.FakeManifestParser(manifest);
      await player.load(fakeManifestUri, 0, Util.factoryReturns(parser));

      const manifest2 = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(10, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(0, (stream) => {
              stream.mime('video/mp4', 'bad');
            });
          });
        });
      });
      manifest.periods.push(manifest2.periods[0]);

      const expected = Util.jasmineError(new shaka.util.Error(
          shaka.util.Error.Severity.CRITICAL,
          shaka.util.Error.Category.MANIFEST,
          shaka.util.Error.Code.UNPLAYABLE_PERIOD));
      const test =
          () => parser.playerInterface.filterNewPeriod(manifest2.periods[0]);
      expect(test).toThrow(expected);
    });
  });

  describe('restrictions', () => {
    it('switches if active is restricted by application', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.bandwidth = 500;
            variant.addVideo(1);
          });
          period.addVariant(1, (variant) => {
            variant.bandwidth = 100;
            variant.addVideo(2);
          });
        });
      });

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
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.bandwidth = 500;
            variant.addVideo(10);
          });
          period.addVariant(2, (variant) => {
            variant.bandwidth = 100;
            variant.addVideo(20);
          });
        });
      });

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
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2);
          });
        });
      });

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
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2);
          });
        });
      });

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
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2);
          });
        });
      });

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
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2);
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      onKeyStatus({'abc': 'output-restricted'});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(1);
    });

    it('removes if key status is "internal-error"', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2);
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      onKeyStatus({'abc': 'internal-error'});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(1);
    });

    it('removes if we don\'t have the required key', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(2, (variant) => {
            variant.addVideo(3);
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      // We have some key statuses, but not for the key IDs we know.
      onKeyStatus({'foo': 'usable'});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    // https://github.com/google/shaka-player/issues/2135
    it('updates key statuses for multi-Period content', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
        });
        manifest.addPeriod(10, (period) => {
          period.addVariant(2, (variant) => {
            variant.addVideo(3, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(4, (variant) => {
            variant.addVideo(5, (stream) => {
              stream.keyId = 'def';
            });
          });
        });
      });

      await setupPlayer();
      onKeyStatus({'abc': 'usable'});

      expect(manifest.periods[0].variants[0].allowedByKeySystem).toBe(true);
      expect(manifest.periods[1].variants[0].allowedByKeySystem).toBe(true);
      expect(manifest.periods[1].variants[1].allowedByKeySystem).toBe(false);
    });

    it('does not restrict if no key statuses are available', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(2, (variant) => {
            variant.addVideo(3);
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      // This simulates, for example, the lack of key status on Chromecast
      // when using PlayReady.  See #1070.
      onKeyStatus({});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(2);
    });

    it('doesn\'t remove when using synthetic key status', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(2, (variant) => {
            variant.addVideo(3);
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      // A synthetic key status contains a single key status with key '00'.
      onKeyStatus({'00': 'usable'});

      expect(player.getVariantTracks().length).toBe(2);
    });

    it('removes all encrypted tracks for errors with synthetic key status',
        async () => {
          manifest = shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addPeriod(0, (period) => {
              period.addVariant(0, (variant) => {
                variant.addVideo(1, (stream) => {
                  stream.keyId = 'abc';
                });
              });
              period.addVariant(2, (variant) => {
                variant.addVideo(3, (stream) => {
                  stream.keyId = 'xyz';
                });
              });
              period.addVariant(4, (variant) => {
                variant.addVideo(5);
              });
            });
          });

          await setupPlayer();
          expect(player.getVariantTracks().length).toBe(3);

          // A synthetic key status contains a single key status with key '00'.
          onKeyStatus({'00': 'internal-error'});

          const tracks = player.getVariantTracks();
          expect(tracks.length).toBe(1);
          expect(tracks[0].id).toBe(4);
        });

    it('removes if key system does not support codec', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addDrmInfo('foo.bar');
            variant.addVideo(1, (stream) => {
              stream.encrypted = true;
              stream.mimeType = 'video/unsupported';
            });
          });
          period.addVariant(1, (variant) => {
            variant.addDrmInfo('foo.bar');
            variant.addVideo(2, (stream) => {
              stream.encrypted = true;
            });
          });
        });
      });

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
      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(1);
    });

    it('removes based on bandwidth', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.bandwidth = 10;
            variant.addVideo(1);
          });
          period.addVariant(1, (variant) => {
            variant.bandwidth = 1500;
            variant.addVideo(2);
          });
          period.addVariant(2, (variant) => {
            variant.bandwidth = 500;
            variant.addVideo(3);
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      player.configure({restrictions: {minBandwidth: 100, maxBandwidth: 1000}});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    it('removes based on pixels', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.size(900, 900);
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2, (stream) => {
              stream.size(5, 5);
            });
          });
          period.addVariant(2, (variant) => {
            variant.addVideo(3, (stream) => {
              stream.size(190, 190);
            });
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      player.configure({restrictions: {minPixels: 100, maxPixels: 800 * 800}});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    it('removes based on width', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.size(5, 5);
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2, (stream) => {
              stream.size(1500, 200);
            });
          });
          period.addVariant(2, (variant) => {
            variant.addVideo(3, (stream) => {
              stream.size(190, 190);
            });
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      player.configure({restrictions: {minWidth: 100, maxWidth: 1000}});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    it('removes based on height', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.size(5, 5);
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2, (stream) => {
              stream.size(200, 1500);
            });
          });
          period.addVariant(2, (variant) => {
            variant.addVideo(3, (stream) => {
              stream.size(190, 190);
            });
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      player.configure({restrictions: {minHeight: 100, maxHeight: 1000}});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(2);
    });

    it('removes the whole variant if one stream is restricted', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.size(5, 5);
            });
            variant.addAudio(2);
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(3, (stream) => {
              stream.size(190, 190);
            });
            variant.addAudio(4);
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      player.configure({restrictions: {minHeight: 100, maxHeight: 1000}});

      const tracks = player.getVariantTracks();
      expect(tracks.length).toBe(1);
      expect(tracks[0].id).toBe(1);
    });

    it('issues error if no streams are playable', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.size(5, 5);
            });
          });
          period.addVariant(1, (variant) => {
            variant.addVideo(2, (stream) => {
              stream.size(200, 300);
            });
          });
          period.addVariant(2, (variant) => {
            variant.addVideo(3, (stream) => {
              stream.size(190, 190);
            });
          });
        });
      });

      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(3);

      onError.and.callFake((e) => {
        const error = e.detail;
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
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          // More efficient codecs
          period.addVariant(0, (variant) => {
            variant.bandwidth = 100;
            variant.addVideo(0, (stream) => {
              stream.codecs = 'good';
            });
          });
          period.addVariant(1, (variant) => {
            variant.bandwidth = 200;
            variant.addVideo(1, (stream) => {
              stream.codecs = 'good';
            });
          });
          period.addVariant(2, (variant) => {
            variant.bandwidth = 300;
            variant.addVideo(2, (stream) => {
              stream.codecs = 'good';
            });
          });

          // Less efficient codecs
          period.addVariant(3, (variant) => {
            variant.bandwidth = 10000;
            variant.addVideo(3, (stream) => {
              stream.codecs = 'bad';
            });
          });
          period.addVariant(4, (variant) => {
            variant.bandwidth = 20000;
            variant.addVideo(4, (stream) => {
              stream.codecs = 'bad';
            });
          });
          period.addVariant(5, (variant) => {
            variant.bandwidth = 30000;
            variant.addVideo(5, (stream) => {
              stream.codecs = 'bad';
            });
          });
        });
      });

      await setupPlayer();
      expect(abrManager.setVariants).toHaveBeenCalled();
      const variants = abrManager.setVariants.calls.argsFor(0)[0];
      // We've already chosen codecs, so only 3 tracks should remain.
      expect(variants.length).toBe(3);
      // They should be the low-bandwidth ones.
      expect(variants[0].video.codecs).toBe('good');
      expect(variants[1].video.codecs).toBe('good');
      expect(variants[2].video.codecs).toBe('good');
    });

    it('updates AbrManager about restricted variants', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.keyId = 'abc';
            });
          });
          period.addVariant(2, (variant) => {
            variant.addVideo(3);
          });
        });
      });

      /** @type {!shaka.test.FakeAbrManager} */
      const abrManager = new shaka.test.FakeAbrManager();
      player.configure({abrFactory: Util.factoryReturns(abrManager)});
      await setupPlayer();
      expect(player.getVariantTracks().length).toBe(2);

      // We have some key statuses, but not for the key IDs we know.
      abrManager.setVariants.calls.reset();
      onKeyStatus({'foo': 'usable'});

      expect(abrManager.setVariants).toHaveBeenCalled();
      const variants = abrManager.setVariants.calls.argsFor(0)[0];
      expect(variants.length).toBe(1);
      expect(variants[0].id).toBe(2);
    });

    it('chooses codecs after considering 6-channel preference', async () => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          // Surround sound AC-3, preferred by config
          period.addVariant(0, (variant) => {
            variant.bandwidth = 300;
            variant.addAudio(0, (stream) => {
              stream.channelsCount = 6;
              stream.audioSamplingRate = 48000;
              stream.codecs = 'ac-3';
            });
          });
          // Stereo AAC, would win out based on bandwidth alone
          period.addVariant(1, (variant) => {
            variant.bandwidth = 100;
            variant.addAudio(1, (stream) => {
              stream.channelsCount = 2;
              stream.audioSamplingRate = 48000;
              stream.codecs = 'mp4a.40.2';
            });
          });
        });
      });

      // Configure for 6 channels.
      player.configure({
        preferredAudioChannelCount: 6,
      });
      await setupPlayer();
      expect(abrManager.setVariants).toHaveBeenCalled();
      // We've chosen codecs, so only 1 track should remain.
      expect(abrManager.variants.length).toBe(1);
      // It should be the 6-channel variant, based on our preference.
      expect(abrManager.variants[0].audio.channelsCount).toBe(6);
      expect(abrManager.variants[0].audio.codecs).toBe('ac-3');
    });

    /**
     * @return {!Promise}
     */
    async function setupPlayer() {
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      // Initialize the fake streams.
      streamingEngine.onCanSwitch();
    }
  });

  describe('getPlayheadTimeAsDate()', () => {
    beforeEach(async () => {
      const timeline = new shaka.media.PresentationTimeline(300, 0);
      timeline.setStatic(false);

      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.presentationTimeline = timeline;
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1);
          });
        });
      });

      goog.asserts.assert(manifest, 'manifest must be non-null');
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
    });

    it('gets current wall clock time in UTC', () => {
      const liveTimeUtc = player.getPlayheadTimeAsDate();
      expect(liveTimeUtc).toEqual(new Date(320000));
    });
  });

  it('rejects empty manifests', async () => {
    manifest = shaka.test.ManifestGenerator.generate();

    const expected = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL, shaka.util.Error.Category.MANIFEST,
        shaka.util.Error.Code.NO_PERIODS));
    await expectAsync(player.load(fakeManifestUri, 0, returnManifest(manifest)))
        .toBeRejectedWith(expected);
  });

  it('does not assert when adapting', async () => {
    // Most of our Player unit tests never adapt.  This allowed some assertions
    // to creep in that went uncaught until they happened during manual testing.
    // Repro only happens with audio+video variants in which we only adapt one
    // type.  This test covers https://github.com/google/shaka-player/issues/954

    manifest = shaka.test.ManifestGenerator.generate((manifest) => {
      manifest.addPeriod(0, (period) => {
        period.addVariant(0, (variant) => {
          variant.bandwidth = 100;
          variant.addVideo(0);
          variant.addAudio(9);
        });
        period.addVariant(1, (variant) => {
          variant.bandwidth = 200;
          variant.addVideo(1);
          variant.addExistingStream(9);  // audio
        });
        period.addVariant(2, (variant) => {
          variant.bandwidth = 300;
          variant.addVideo(2);
          variant.addExistingStream(9);  // audio
        });
      });
    });

    await player.load(fakeManifestUri, 0, returnManifest(manifest));
    streamingEngine.onCanSwitch();

    // We've already loaded variants[0].  Switch to [1] and [2].
    abrManager.switchCallback(manifest.periods[0].variants[1]);
    abrManager.switchCallback(manifest.periods[0].variants[2]);
  });

  describe('isTextTrackVisible', () => {
    it('does not throw before load', () => {
      player.isTextTrackVisible();
    });
  });

  describe('setTextTrackVisibility', () => {
    it('does not throw before load', async () => {
      await player.setTextTrackVisibility(true);
    });
  });

  describe('isAudioOnly', () => {
    it('detects audio-only content', async () => {
      // False before we've loaded anything.
      expect(player.isAudioOnly()).toBe(false);

      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(0);
            variant.addAudio(1);
          });
        });
      });
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      // We have audio & video tracks, so this is not audio-only.
      expect(player.isAudioOnly()).toBe(false);

      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(0);
          });
        });
      });
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      // We have video-only tracks, so this is not audio-only.
      expect(player.isAudioOnly()).toBe(false);

      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addAudio(1);
          });
        });
      });
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
      // We have audio-only tracks, so this is audio-only.
      expect(player.isAudioOnly()).toBe(true);

      await player.unload();
      // When we have nothing loaded, we go back to not audio-only status.
      expect(player.isAudioOnly()).toBe(false);
    });
  });

  describe('load', () => {
    it('tolerates bandwidth of NaN, undefined, or 0', async () => {
      // Regression test for https://github.com/google/shaka-player/issues/938
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.bandwidth = /** @type {?} */(undefined);
            variant.addVideo(0);
          });
          period.addVariant(1, (variant) => {
            variant.bandwidth = NaN;
            variant.addVideo(1);
          });
          period.addVariant(2, (variant) => {
            variant.bandwidth = 0;
            variant.addVideo(2);
          });
        });
      });

      // Before the fix, load() would fail assertions and throw errors.
      await player.load(fakeManifestUri, 0, returnManifest(manifest));
    });

    it('respects startTime of 0', async () => {
      // What we shouldn't do is treat start time of 0 as the same as startTime
      // of null/undefined.  0 means timestamp 0, whereas null/undefined means
      // "default".  For VOD, the default is 0, but for live streams, the
      // default is the live edge.

      // Create a live timeline and manifest.
      const timeline = new shaka.media.PresentationTimeline(300, 0);
      timeline.setStatic(false);

      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.presentationTimeline = timeline;
        manifest.addPeriod(0, (period) => {
          period.addVariant(0, (variant) => {
            variant.addVideo(1);
          });
        });
      });

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
      // eslint-disable-next-line no-restricted-syntax
      player.createPlayhead = function() {
        realPlayhead =
            // eslint-disable-next-line no-restricted-syntax
            shaka.Player.prototype.createPlayhead.apply(this, arguments);
        return realPlayhead;
      };

      await player.load(
          fakeManifestUri, /* startTime */ 0, returnManifest(manifest));

      // Ensure this is seen as a live stream, or else the test is invalid.
      expect(player.isLive()).toBe(true);

      // If startTime of 0 was treated as null, then getTime() would point to
      // the live edge instead of 0.
      expect(realPlayhead.getTime()).toBe(0);
    });
  });

  describe('language methods', () => {
    let videoOnlyManifest;

    beforeEach(() => {
      manifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.language = 'fr';
            variant.addVideo(0);
            variant.addAudio(1, (stream) => {
              stream.language = 'fr';
            });
          });

          period.addVariant(2, (variant) => {
            variant.language = 'en';
            variant.addExistingStream(0);  // video
            variant.addAudio(2, (stream) => {
              stream.language = 'en';
              stream.roles = ['main'];
            });
          });

          period.addVariant(3, (variant) => {
            variant.language = 'en';
            variant.addExistingStream(0);  // video
            variant.addAudio(3, (stream) => {
              stream.language = 'en';
              stream.roles = ['commentary'];
            });
          });

          period.addVariant(4, (variant) => {
            variant.language = 'de';
            variant.addExistingStream(0);  // video
            variant.addAudio(4, (stream) => {
              stream.language = 'de';
              stream.roles = ['foo', 'bar'];
            });
          });

          period.addTextStream(5, (stream) => {
            stream.language = 'es';
            stream.roles = ['baz', 'qwerty'];
          });
          period.addTextStream(6, (stream) => {
            stream.language = 'en';
            stream.kind = 'caption';
            stream.roles = ['main', 'caption'];
          });
          period.addTextStream(7, (stream) => {
            stream.language = 'en';
            stream.kind = 'subtitle';
            stream.roles = ['main', 'subtitle'];
          });
        });
      });

      videoOnlyManifest = shaka.test.ManifestGenerator.generate((manifest) => {
        manifest.addPeriod(0, (period) => {
          period.addVariant(1, (variant) => {
            variant.bandwidth = 400;
            variant.addVideo(1);
          });
          period.addVariant(2, (variant) => {
            variant.bandwidth = 800;
            variant.addVideo(2);
          });
        });
      });
    });

    describe('get*Languages', () => {
      it('returns a list of languages', async () => {
        await player.load(fakeManifestUri, 0, returnManifest(manifest));
        expect(player.getAudioLanguages()).toEqual(['fr', 'en', 'de']);
        expect(player.getTextLanguages()).toEqual(['es', 'en']);
      });

      it('returns "und" for video-only tracks', async () => {
        manifest = videoOnlyManifest;

        await player.load(fakeManifestUri, 0, returnManifest(manifest));
        expect(player.getAudioLanguages()).toEqual(['und']);
        expect(player.getTextLanguages()).toEqual([]);
      });
    });

    describe('getAudioLanguagesAndRoles', () => {
      it('ignores video roles', async () => {
        manifest = shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addPeriod(0, (period) => {
            period.addVariant(0, (variant) => {
              variant.language = 'en';
              variant.addVideo(1, (stream) => {
                stream.roles = ['video-only-role'];
              });
              variant.addAudio(2, (stream) => {
                stream.roles = ['audio-only-role'];
                stream.language = 'en';
              });
            });
          });
        });

        await player.load(fakeManifestUri, 0, returnManifest(manifest));

        expect(player.getAudioLanguagesAndRoles()).toEqual([
          {language: 'en', role: 'audio-only-role'},
        ]);
      });

      it('lists all language-role combinations', async () => {
        await player.load(fakeManifestUri, 0, returnManifest(manifest));
        expect(player.getAudioLanguagesAndRoles()).toEqual([
          {language: 'fr', role: ''},
          {language: 'en', role: 'main'},
          {language: 'en', role: 'commentary'},
          {language: 'de', role: 'foo'},
          {language: 'de', role: 'bar'},
        ]);
      });

      it('uses "und" for video-only tracks', async () => {
        manifest = shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addPeriod(0, (period) => {
            period.addVariant(0, (variant) => {
              variant.addVideo(1, (stream) => {
                stream.roles = ['video-only-role'];
              });
            });
          });
        });

        await player.load(fakeManifestUri, 0, returnManifest(manifest));
        expect(player.getAudioLanguagesAndRoles()).toEqual([
          {language: 'und', role: ''},
        ]);
      });
    });

    describe('getTextLanguageAndRoles', () => {
      it('lists all language-role combinations', async () => {
        await player.load(fakeManifestUri, 0, returnManifest(manifest));
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
    const activeTracks = player.getVariantTracks().filter((track) => {
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
    const activeTracks = player.getTextTracks().filter((track) => {
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
  function onCanSwitch() {
    player.canSwitch_();
  }

  /**
   * A Jasmine asymmetric matcher for substring matches.
   * @param {string} substring
   * @return {!Object}
   */
  function stringContaining(substring) {
    return {
      asymmetricMatch: (actual) => actual.includes(substring),
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
