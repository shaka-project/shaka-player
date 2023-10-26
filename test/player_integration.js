/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player', () => {
  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {shaka.test.Waiter} */
  let waiter;

  const Util = shaka.test.Util;

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);

    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
    player = new compiledShaka.Player();
    await player.attach(video);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => {
      fail(event.detail);
    });
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    eventManager.release();

    await player.destroy();
    player.releaseAllMutexes();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  describe('attach', () => {
    beforeEach(async () => {
      // To test attach, we want to construct a player without a video element
      // attached in advance.  To do that, we destroy the player that was
      // constructed in the outermost beforeEach(), then construct a new one
      // without a video element.
      await player.destroy();
      player = new compiledShaka.Player();
    });

    it('can be used before load()', async () => {
      await player.attach(video);
      await player.load('test:sintel_compiled');
    });
  });  // describe('attach')

  describe('destroy', () => {
    // Regression test for:
    // https://github.com/shaka-project/shaka-player/issues/4850
    it('does not leave any lingering timers', async () => {
      shaka.util.Timer.activeTimers.clear();

      // Unlike the other tests in this file, this uses an uncompiled build of
      // Shaka, so that we don't need to expose shaka.util.Timer.activeTimers.
      player = new shaka.Player();
      await player.attach(video);

      // Disable stall detection, which can interfere with playback tests.
      player.configure('streaming.stallEnabled', false);

      waiter.setPlayer(player);

      // Play the video for a little while.
      await player.load('test:sintel');
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 1, 10);

      // Destroy the player.
      await player.destroy();

      // Are there any timers left?
      for (const timer of shaka.util.Timer.activeTimers.keys()) {
        const stackTrace = shaka.util.Timer.activeTimers.get(timer);
        fail('Lingering timer exists! Stack trace of creation: ' + stackTrace);
      }
    });
  });

  describe('updateStartTime() in manifestparsed event handler', () => {
    it('does not get segments prior to startTime', async () => {
      player.addEventListener('manifestparsed', () => {
        player.updateStartTime(24);
      });
      const results = {
        requestedVideoSegment0: false,
        requestedVideoSegment1: false,
        requestedVideoSegment2: false,
      };
      const expected = {
        requestedVideoSegment0: false,
        requestedVideoSegment1: false,
        requestedVideoSegment2: true,
      };
      player.getNetworkingEngine().registerRequestFilter(
          (type, request) => {
            if (request.uris[0] == 'test:sintel/video/0') {
              results.requestedVideoSegment0 = true;
            }
            if (request.uris[0] == 'test:sintel/video/1') {
              results.requestedVideoSegment1 = true;
            }
            if (request.uris[0] == 'test:sintel/video/2') {
              results.requestedVideoSegment2 = true;
            }
          });
      await player.load('test:sintel_compiled');
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 25, 30);
      expect(results).toEqual(expected);
    });
  });


  describe('getStats', () => {
    it('gives stats about current stream', async () => {
      // This is tested more in player_unit.js.  This is here to test the public
      // API and to check for renaming.
      await player.load('test:sintel_compiled');
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 1, 10);

      const stats = player.getStats();
      const expected = {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
        streamBandwidth: jasmine.any(Number),

        decodedFrames: jasmine.any(Number),
        droppedFrames: jasmine.any(Number),
        corruptedFrames: jasmine.any(Number),
        estimatedBandwidth: jasmine.any(Number),

        gapsJumped: jasmine.any(Number),
        stallsDetected: jasmine.any(Number),

        completionPercent: jasmine.any(Number),
        loadLatency: jasmine.any(Number),
        manifestTimeSeconds: jasmine.any(Number),
        drmTimeSeconds: jasmine.any(Number),
        playTime: jasmine.any(Number),
        pauseTime: jasmine.any(Number),
        bufferingTime: jasmine.any(Number),
        licenseTime: jasmine.any(Number),
        liveLatency: jasmine.any(Number),

        maxSegmentDuration: jasmine.any(Number),

        // We should have loaded the first Period by now, so we should have a
        // history.
        switchHistory: jasmine.arrayContaining([{
          timestamp: jasmine.any(Number),
          id: jasmine.any(Number),
          type: 'variant',
          fromAdaptation: true,
          bandwidth: 0,
        }]),

        stateHistory: jasmine.arrayContaining([{
          state: 'playing',
          timestamp: jasmine.any(Number),
          duration: jasmine.any(Number),
        }]),
      };
      expect(stats).toEqual(expected);
    });

    // Regression test for Issue #968 where trying to get the stats before
    // calling load would fail because not all components had been initialized.
    it('can get stats before loading content', async () => {
      // Destroy Player created in beforeEach.
      await player.destroy();

      // We are opting not to initialize the player with a video element so that
      // it is in the least loaded state possible.
      player = new compiledShaka.Player();

      const stats = player.getStats();
      expect(stats).toBeTruthy();
      await player.destroy();
    });
  });  // describe('getStats')

  describe('setTextTrackVisibility', () => {
    // Using mode='disabled' on TextTrack causes cues to go null, which leads
    // to a crash in TextEngine.  This validates that we do not trigger this
    // behavior when changing visibility of text.

    it('does not cause cues to be null', async () => {
      await player.load('test:sintel_compiled');
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 1, 10);

      // This TextTrack was created as part of load() when we set up the
      // TextDisplayer.
      const textTrack = video.textTracks[0];
      expect(textTrack).not.toBe(null);

      if (textTrack) {
        // This should not be null initially.
        expect(textTrack.cues).not.toBe(null);

        await player.setTextTrackVisibility(true);
        // This should definitely not be null when visible.
        expect(textTrack.cues).not.toBe(null);

        await player.setTextTrackVisibility(false);
        // This should not transition to null when invisible.
        expect(textTrack.cues).not.toBe(null);
      }
    });

    // Repro for https://github.com/shaka-project/shaka-player/issues/1879.
    it('appends cues when enabled initially', async () => {
      let cues = [];
      /** @const {!shaka.test.FakeTextDisplayer} */
      const displayer = new shaka.test.FakeTextDisplayer();
      displayer.appendSpy.and.callFake((added) => {
        cues = cues.concat(added);
      });

      player.configure('textDisplayFactory', () => displayer);

      const preferredTextLanguage = 'fa';  // The same as in the content itself
      player.configure({preferredTextLanguage: preferredTextLanguage});

      await player.load('test:sintel_realistic_compiled');

      // Play until a time at which the external cues would be on screen.
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 4, 20);

      expect(player.isTextTrackVisible()).toBe(true);
      expect(displayer.isTextVisible()).toBe(true);
      expect(cues.length).toBeGreaterThan(0);
    });

    it('appends cues for external text', async () => {
      let cues = [];
      /** @const {!shaka.test.FakeTextDisplayer} */
      const displayer = new shaka.test.FakeTextDisplayer();
      displayer.appendSpy.and.callFake((added) => {
        cues = cues.concat(added);
      });

      player.configure('textDisplayFactory', () => displayer);

      await player.load('test:sintel_no_text_compiled');
      const locationUri = new goog.Uri(location.href);
      const partialUri = new goog.Uri('/base/test/test/assets/text-clip.vtt');
      const absoluteUri = locationUri.resolve(partialUri);
      const newTrack = await player.addTextTrackAsync(
          absoluteUri.toString(), 'en', 'subtitles', 'text/vtt');

      expect(player.getTextTracks()).toEqual([newTrack]);

      player.selectTextTrack(newTrack);
      player.setTextTrackVisibility(true);
      await waiter.waitForEvent(player, 'texttrackvisibility');

      // Play until a time at which the external cues would be on screen.
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 4, 20);

      expect(player.isTextTrackVisible()).toBe(true);
      expect(displayer.isTextVisible()).toBe(true);
      expect(cues.length).toBeGreaterThan(0);
    });

    // https://github.com/shaka-project/shaka-player/issues/2553
    it('does not change the selected track', async () => {
      player.configure('streaming.alwaysStreamText', false);
      await player.load('test:forced_subs_simulation_compiled');

      // In this content, both text tracks have the same language and role, and
      // so should look identical in terms of choosing one to match a
      // preference.  This is important to the test, so verify it first.
      const tracks = player.getTextTracks();
      expect(tracks[0].language).toBe(tracks[1].language);
      expect(tracks[0].roles).toEqual(tracks[1].roles);

      const getTracksActive = () => player.getTextTracks().map((t) => t.active);

      // If we choose a track first, then turn on text, the track should not
      // change.  Try this with both tracks.
      player.setTextTrackVisibility(false);

      player.selectTextTrack(tracks[0]);
      expect(getTracksActive()).toEqual([true, false]);
      player.setTextTrackVisibility(true);
      expect(getTracksActive()).toEqual([true, false]);

      player.setTextTrackVisibility(false);

      player.selectTextTrack(tracks[1]);
      expect(getTracksActive()).toEqual([false, true]);
      player.setTextTrackVisibility(true);
      expect(getTracksActive()).toEqual([false, true]);
    });

    // https://github.com/shaka-project/shaka-player/issues/4821
    it('loads a single text stream', async () => {
      player.configure({preferredTextLanguage: 'en'});
      await player.load('test:sintel_no_text_compiled');

      // Add preferred language text track.
      const locationUri = new goog.Uri(location.href);
      const partialUri = new goog.Uri('/base/test/test/assets/text-clip.vtt');
      const absoluteUri = locationUri.resolve(partialUri);
      await player.addTextTrackAsync(
          absoluteUri.toString(), 'en', 'subtitles', 'text/vtt');

      // Add alternate language text track.
      // Two text tracks with same timings but different text
      // are necessary for test.
      const partialUri2 =
      new goog.Uri('/base/test/test/assets/text-clip-alt.vtt');
      const absoluteUri2 = locationUri.resolve(partialUri2);
      await player.addTextTrackAsync(
          absoluteUri2.toString(), 'fr', 'subtitles', 'text/vtt');

      const textTracks = player.getTextTracks();
      expect(textTracks.length).toBe(2);
      expect(textTracks[0].language).toBe('en');
      expect(textTracks[1].language).toBe('fr');

      // Enable text visibilty and immediately change language.
      // Only one set of cues should be active.
      // Cues should be of the selected language track.
      player.setTextTrackVisibility(true);
      player.selectTextLanguage('fr');
      video.currentTime = 5;
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(video.textTracks[0].activeCues.length).toBe(1);
      expect(player.getTextTracks()[1].active).toBe(true);
    });
  });  // describe('setTextTrackVisibility')

  describe('autoShowText', () => {
    async function textMatchesAudioDoesNot() {
      const preferredTextLanguage = 'fa';  // The same as in the content
      player.configure({preferredTextLanguage: preferredTextLanguage});

      // NOTE: This is also a regression test for #1696, in which a change to
      // this feature broke StreamingEngine initialization.

      // Now load a version of Sintel with delayed setup of video & audio
      // streams and wait for completion.
      await player.load('test:sintel_realistic_compiled');
      // By this point, a MediaSource error would be thrown in a repro of bug
      // #1696.

      // Make sure the content we tested with has text tracks, that the config
      // we used matches the text language, and that the audio language differs.
      // These will catch any changes to the underlying content that would
      // invalidate the test setup.
      expect(player.getTextTracks().length).not.toBe(0);
      const textTrack = player.getTextTracks()[0];
      expect(textTrack.language).toBe(preferredTextLanguage);

      const variantTrack = player.getVariantTracks()[0];
      expect(variantTrack.language).not.toBe(textTrack.language);
    }

    async function textDoesNotMatch() {
      const preferredTextLanguage = 'xx';  // Differs from the content
      player.configure({preferredTextLanguage: preferredTextLanguage});

      // Now load the content and wait for completion.
      await player.load('test:sintel_realistic_compiled');

      // Make sure the content we tested with has text tracks, that the config
      // we used does not match the text language, and that the text and audio
      // languages do not match each other (to keep this distinct from the next
      // test case).  This will catch any changes to the underlying content that
      // would invalidate the test setup.
      expect(player.getTextTracks().length).not.toBe(0);
      const textTrack = player.getTextTracks()[0];
      expect(textTrack.language).not.toBe(preferredTextLanguage);

      const variantTrack = player.getVariantTracks()[0];
      expect(variantTrack.language).not.toBe(textTrack.language);
    }

    async function textAndAudioMatch() {
      const preferredTextLanguage = 'und';  // The same as in the content
      player.configure({preferredTextLanguage: preferredTextLanguage});

      // Now load the content and wait for completion.
      await player.load('test:sintel_compiled');

      // Make sure the content we tested with has text tracks, that the config
      // we used matches the content, and that the text and audio languages
      // match each other.  This will catch any changes to the underlying
      // content that would invalidate the test setup.
      expect(player.getTextTracks().length).not.toBe(0);
      const textTrack = player.getTextTracks()[0];
      expect(textTrack.language).toBe(preferredTextLanguage);

      const variantTrack = player.getVariantTracks()[0];
      expect(variantTrack.language).toBe(textTrack.language);
    }

    describe('IF_SUBTITLES_MAY_BE_NEEDED', () => {
      beforeEach(() => {
        player.configure(
            'autoShowText',
            shaka.config.AutoShowText.IF_SUBTITLES_MAY_BE_NEEDED);
      });

      it('enables text if text matches and audio does not', async () => {
        await textMatchesAudioDoesNot();
        expect(player.isTextTrackVisible()).toBe(true);
      });

      it('disables text if text does not match', async () => {
        await textDoesNotMatch();
        expect(player.isTextTrackVisible()).toBe(false);
      });

      it('disables text if both text and audio match', async () => {
        await textAndAudioMatch();
        expect(player.isTextTrackVisible()).toBe(false);
      });
    });  // IF_SUBTITLES_MAY_BE_NEEDED

    describe('IF_PREFERRED_TEXT_LANGUAGE', () => {
      beforeEach(() => {
        player.configure(
            'autoShowText',
            shaka.config.AutoShowText.IF_PREFERRED_TEXT_LANGUAGE);
      });

      it('enables text if text matches and audio does not', async () => {
        await textMatchesAudioDoesNot();
        expect(player.isTextTrackVisible()).toBe(true);
      });

      it('disables text if text does not match', async () => {
        await textDoesNotMatch();
        expect(player.isTextTrackVisible()).toBe(false);
      });

      it('enables text if both text and audio match', async () => {
        await textAndAudioMatch();
        expect(player.isTextTrackVisible()).toBe(true);
      });
    });  // IF_PREFERRED_TEXT_LANGUAGE

    describe('ALWAYS', () => {
      beforeEach(() => {
        player.configure('autoShowText', shaka.config.AutoShowText.ALWAYS);
      });

      it('enables text if text matches and audio does not', async () => {
        await textMatchesAudioDoesNot();
        expect(player.isTextTrackVisible()).toBe(true);
      });

      it('enables text if text does not match', async () => {
        await textDoesNotMatch();
        expect(player.isTextTrackVisible()).toBe(true);
      });

      it('enables text if both text and audio match', async () => {
        await textAndAudioMatch();
        expect(player.isTextTrackVisible()).toBe(true);
      });
    });  // ALWAYS

    describe('NEVER', () => {
      beforeEach(() => {
        player.configure('autoShowText', shaka.config.AutoShowText.NEVER);
      });

      it('disables text if text matches and audio does not', async () => {
        await textMatchesAudioDoesNot();
        expect(player.isTextTrackVisible()).toBe(false);
      });

      it('disables text if text does not match', async () => {
        await textDoesNotMatch();
        expect(player.isTextTrackVisible()).toBe(false);
      });

      it('disables text if both text and audio match', async () => {
        await textAndAudioMatch();
        expect(player.isTextTrackVisible()).toBe(false);
      });
    });  // NEVER
  });  // AutoShowText

  describe('plays', () => {
    it('with external text tracks', async () => {
      await player.load('test:sintel_no_text_compiled');

      // For some reason, using path-absolute URLs (i.e. without the hostname)
      // like this doesn't work on Safari.  So manually resolve the URL.
      const locationUri = new goog.Uri(location.href);
      const partialUri = new goog.Uri('/base/test/test/assets/text-clip.vtt');
      const absoluteUri = locationUri.resolve(partialUri);
      const newTrack = await player.addTextTrackAsync(
          absoluteUri.toString(), 'en', 'subtitles', 'text/vtt');

      expect(newTrack.language).toBe('en');
      expect(player.getTextTracks()).toEqual([newTrack]);

      player.selectTextTrack(newTrack);
      expect(player.getTextTracks()[0].active).toBe(true);
    });

    it('with cea closed captions', async () => {
      await player.load('test:cea-708_mp4_compiled');

      const textTracks = player.getTextTracks();
      expect(textTracks).toBeTruthy();
      expect(textTracks.length).toBe(1);
      expect(textTracks[0].language).toBe('en');
    });

    it('at higher playback rates', async () => {
      await player.load('test:sintel_compiled');
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 1, 10);

      // Enabling trick play should change our playback rate to the same rate.
      player.trickPlay(2);
      expect(video.playbackRate).toBe(2);

      // Let playback continue playing for a bit longer.
      await shaka.test.Util.delay(2);

      // Cancelling trick play should return our playback rate to normal.
      player.cancelTrickPlay();
      expect(video.playbackRate).toBe(1);
    });

    it('in sequence mode', async () => {
      await player.load('test:sintel_sequence_compiled');
      expect(player.getManifest().sequenceMode).toBe(true);

      // Ensure the video plays.
      await video.play();
      await waiter.timeoutAfter(20).waitUntilPlayheadReaches(video, 5);

      // Seek the video, and see if it can continue playing from that point.
      // If this is a multiple of 10, it tends to flake on Tizen with stall
      // detection disabled.  So use 25.
      video.currentTime = 25;

      // Expect that we can then reach the end of the video.
      await waiter.timeoutAfter(40).waitForEnd(video);
    });

    // Regression test for #2326.
    //
    // 1. Construct an instance with a video element.
    // 2. Don't call or await attach().
    // 3. Call load() with a MIME type, which triggers a check for native
    //    playback support.
    //
    // Note that a real playback may use a HEAD request to fetch a MIME type,
    // even if one is not specified in load().
    it('immediately after construction with MIME type', async () => {
      const testSchemeMimeType = 'application/x-test-manifest';
      await player.load('test:sintel_compiled', 0, testSchemeMimeType);
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 1, 10);
    });

    /**
     * Gets the language of the active Variant.
     * @return {string}
     */
    function getActiveLanguage() {
      const tracks = player.getVariantTracks().filter((t) => {
        return t.active;
      });
      expect(tracks.length).toBeGreaterThan(0);
      return tracks[0].language;
    }
  });  // describe('plays')

  describe('TextDisplayer plugin', () => {
    // Simulate the use of an external TextDisplayer plugin.
    /** @type {shaka.test.FakeTextDisplayer} */
    let textDisplayer;
    beforeEach(() => {
      textDisplayer = new shaka.test.FakeTextDisplayer();

      textDisplayer.isTextVisibleSpy.and.callFake(() => {
        return false;
      });
      textDisplayer.destroySpy.and.returnValue(Promise.resolve());
      player.configure('textDisplayFactory', () => textDisplayer);

      // Make sure the configuration was taken.
      const configuredFactory = player.getConfiguration().textDisplayFactory;
      const configuredTextDisplayer = configuredFactory();
      expect(configuredTextDisplayer).toBe(textDisplayer);
    });

    // Regression test for https://github.com/shaka-project/shaka-player/issues/1187
    it('does not throw on destroy', async () => {
      await player.load('test:sintel_compiled');
      await video.play();
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 1, 10);
      await player.unload();
      // Before we fixed #1187, the call to destroy() on textDisplayer was
      // renamed in the compiled version and could not be called.
      expect(textDisplayer.destroySpy).toHaveBeenCalled();
    });
  });  // describe('TextDisplayer plugin')

  describe('TextAndRoles', () => {
    // Regression Test. Makes sure that the language and role fields have been
    // properly exported from the player.
    it('exports language and roles fields', async () => {
      await player.load('test:sintel_compiled');
      const languagesAndRoles = player.getTextLanguagesAndRoles();
      expect(languagesAndRoles.length).toBeTruthy();
      for (const languageAndRole of languagesAndRoles) {
        expect(languageAndRole.language).not.toBeUndefined();
        expect(languageAndRole.role).not.toBeUndefined();
      }
    });
  });  // describe('TextAndRoles')

  describe('streaming event', () => {
    // Calling switch early during load() caused a failed assertion in Player
    // and the track selection was ignored.  Because this bug involved
    // interactions between Player and StreamingEngine, it is an integration
    // test and not a unit test.
    // https://github.com/shaka-project/shaka-player/issues/1119
    it('allows early selection of specific tracks', async () => {
      /** @type {!jasmine.Spy} */
      const streamingListener = jasmine.createSpy('listener');

      // Because this is an issue with failed assertions, destroy the existing
      // player from the compiled version, and create a new one using the
      // uncompiled version.  Then we will get assertions.
      eventManager.unlisten(player, 'error');
      await player.destroy();
      player = new shaka.Player();  // NOTE: MUST BE UNCOMPILED
      await player.attach(video);
      player.configure({abr: {enabled: false}});
      eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));

      // When 'streaming' fires, select the first track explicitly.
      player.addEventListener('streaming', Util.spyFunc(streamingListener));
      streamingListener.and.callFake(() => {
        const tracks = player.getVariantTracks();
        player.selectVariantTrack(tracks[0]);
      });

      // Now load the content.
      await player.load('test:sintel');

      // When the bug triggers, we fail assertions in Player.
      // Make sure the listener was triggered, so that it could trigger the
      // code path in this bug.
      expect(streamingListener).toHaveBeenCalled();
    });

    // After fixing the issue above, calling switch early during a second load()
    // caused a failed assertion in StreamingEngine, because we did not reset
    // switchingPeriods_ in Player.  Because this bug involved interactions
    // between Player and StreamingEngine, it is an integration test and not a
    // unit test.
    // https://github.com/shaka-project/shaka-player/issues/1119
    it('allows selection of tracks in subsequent loads', async () => {
      /** @type {!jasmine.Spy} */
      const streamingListener = jasmine.createSpy('listener');

      // Because this is an issue with failed assertions, destroy the existing
      // player from the compiled version, and create a new one using the
      // uncompiled version.  Then we will get assertions.
      eventManager.unlisten(player, 'error');
      await player.destroy();
      player = new shaka.Player();  // NOTE: MUST BE UNCOMPILED
      await player.attach(video);
      player.configure({abr: {enabled: false}});
      eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));

      // This bug only triggers when you do this on the second load.
      // So we load one piece of content, then set up the streaming listener
      // to change tracks, then we load a second piece of content.
      await player.load('test:sintel');

      // Give StreamingEngine time to complete all setup and to call back into
      // the Player with canSwitch_.  If you move on too quickly to the next
      // load(), the bug does not reproduce.
      await shaka.test.Util.delay(1);

      player.addEventListener('streaming', Util.spyFunc(streamingListener));

      streamingListener.and.callFake(() => {
        const track = player.getVariantTracks()[0];
        player.selectVariantTrack(track);
      });

      // Now load again to trigger the failed assertion.
      await player.load('test:sintel');

      // When the bug triggers, we fail assertions in StreamingEngine.
      // So just make sure the listener was triggered, so that it could
      // trigger the code path in this bug.
      expect(streamingListener).toHaveBeenCalled();
    });
  });  // describe('streaming event')

  describe('tracks', () => {
    // This is a regression test for b/138941217, in which tracks briefly
    // vanished during the loading process.  On Chromecast devices, where the
    // timing is very different from on desktop, this could occur such that
    // there were no tracks after load() is resolved.
    // This is an integration test so that we can check the behavior of the
    // Player against actual platform behavior on all supported platforms.
    it('remain available at every stage of loading', async () => {
      let tracksFound = false;

      /**
       * @param {string} when When the check takes place.
       *
       * Will fail the test if tracks disappear after they first become
       * available.
       */
      const checkTracks = (when) => {
        // If tracks have already been found, expect them to still be found.
        const tracksNow = player.getVariantTracks().length != 0;
        if (tracksFound) {
          expect(tracksNow).withContext(when).toBe(true);
        } else {
          // If tracks are now found, they should not, at any point during
          // the loading process, disappear again.
          if (tracksNow) {
            tracksFound = true;
          }
        }
        shaka.log.debug(
            'checkTracks', when,
            'tracksFound=', tracksFound,
            'tracksNow=', tracksNow);
      };

      /** @param {Event} event */
      const checkOnEvent = (event) => {
        checkTracks(event.type + ' event');
      };

      // On each of these events, we will notice when tracks first appear, and
      // verify that they never disappear at any point in the loading sequence.
      eventManager.listen(video, 'canplay', checkOnEvent);
      eventManager.listen(video, 'canplaythrough', checkOnEvent);
      eventManager.listen(video, 'durationchange', checkOnEvent);
      eventManager.listen(video, 'emptied', checkOnEvent);
      eventManager.listen(video, 'loadeddata', checkOnEvent);
      eventManager.listen(video, 'loadedmetadata', checkOnEvent);
      eventManager.listen(video, 'loadstart', checkOnEvent);
      eventManager.listen(video, 'pause', checkOnEvent);
      eventManager.listen(video, 'play', checkOnEvent);
      eventManager.listen(video, 'playing', checkOnEvent);
      eventManager.listen(video, 'seeked', checkOnEvent);
      eventManager.listen(video, 'seeking', checkOnEvent);
      eventManager.listen(video, 'stalled', checkOnEvent);
      eventManager.listen(video, 'waiting', checkOnEvent);
      eventManager.listen(player, 'trackschanged', checkOnEvent);

      const waiter = new shaka.test.Waiter(eventManager)
          .setPlayer(player)
          .timeoutAfter(10);
      const canPlayThrough = waiter.waitForEvent(video, 'canplaythrough');

      await player.load('test:sintel_compiled', 5);
      shaka.log.debug('load resolved');

      // When load is resolved(), tracks should definitely exist.
      expect(tracksFound).toBe(true);

      // Let the test keep running until we can play through.  In the original
      // bug, tracks would disappear _after_ load() on some platforms.
      await canPlayThrough;
    });
  });  // describe('tracks')

  describe('loading', () => {
    // A regression test for Issue #2433.
    it('can load very large files', async () => {
      // Reset the lazy function, so that it does not remember any chunk size
      // that was detected beforehand.
      compiledShaka.util.StringUtils.resetFromCharCode();
      const oldFromCharCode = String.fromCharCode;
      try {
        // Replace String.fromCharCode with a version that can only handle very
        // small chunks.
        // This has to be an old-style function, to use the "arguments" object.
        // eslint-disable-next-line no-restricted-syntax
        String.fromCharCode = function() {
          if (arguments.length > 2000) {
            throw new RangeError('Synthetic Range Error');
          }
          // eslint-disable-next-line prefer-spread
          return oldFromCharCode.apply(null, arguments);
        };
        await player.load('/base/test/test/assets/large_file.mpd');
      } finally {
        String.fromCharCode = oldFromCharCode;
      }
    });
  });

  describe('mediaQualityChanges', () => {
    /** @type {!jasmine.Spy} */
    let onQualityChange;
    /** @type {!shaka.test.Waiter} */
    let waiter;

    const qualityChange1 = jasmine.objectContaining({
      mediaQuality: jasmine.objectContaining({
        bandwidth: 1,
        codecs: 'mp4a.40.2',
        contentType: 'audio',
        mimeType: 'audio/mp4',
      }),
      type: 'mediaqualitychanged',
      position: jasmine.any(Number),
    });
    const qualityChange2 = jasmine.objectContaining({
      mediaQuality: jasmine.objectContaining({
        bandwidth: 1,
        codecs: 'avc1.42c01e',
        contentType: 'video',
        mimeType: 'video/mp4',
      }),
      type: 'mediaqualitychanged',
      position: jasmine.any(Number),
    });

    beforeEach(() => {
      onQualityChange = jasmine.createSpy('onQualityChange');
      // const spyFunc = Util.spyFunc(onQualityChange);
      player.addEventListener('mediaqualitychanged',
          Util.spyFunc(onQualityChange));
      waiter = new shaka.test.Waiter(eventManager)
          .setPlayer(player)
          .timeoutAfter(10)
          .failOnTimeout(true);
    });

    it('emits audio/video quality changes at start when enabled', async () => {
      player.configure('streaming.observeQualityChanges', true);

      await player.load('test:sintel_compiled');
      await video.play();

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);
      expect(onQualityChange).toHaveBeenCalledTimes(2);
      expect(onQualityChange).toHaveBeenCalledWith(qualityChange1);
      expect(onQualityChange).toHaveBeenCalledWith(qualityChange2);
    });

    it('does not emit quality changes at start when disabled', async () => {
      player.configure('streaming.observeQualityChanges', false);

      await player.load('test:sintel_compiled');
      await video.play();

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);
      expect(onQualityChange).not.toHaveBeenCalled();
    });
  });

  describe('seek range', () => {
    // Regression test for Issue #3675.
    it('has a reasonable seek range after going from live to VOD', async () => {
      const netEngine = player.getNetworkingEngine();
      const startTime = Date.now();
      netEngine.registerRequestFilter((type, request) => {
        if (type != shaka.net.NetworkingEngine.RequestType.MANIFEST) {
          return;
        }
        // Simulate a live stream by providing different manifests over time.
        const time = (Date.now() - startTime) / 1000;
        const manifestNumber = Math.min(5, Math.floor(0.5 + time / 2));
        request.uris = [
          '/base/test/test/assets/3675/dash_' + manifestNumber + '.mpd',
        ];
        console.log('getting manifest', request.uris);
      });

      // Play the stream.
      await player.load('/base/test/test/assets/3675/dash_0.mpd');
      await video.play();

      // Wait for the stream to be over.
      eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
      /** @type {shaka.test.Waiter} */
      const waiter = new shaka.test.Waiter(eventManager)
          .setPlayer(player)
          .timeoutAfter(40)
          .failOnTimeout(true);
      await waiter.waitForEnd(video);

      // The stream should have transitioned to VOD by now.
      expect(player.isLive()).toBe(false);

      // Check that the final seek range is as expected.
      const seekRange = player.seekRange();
      expect(seekRange.end).toBeCloseTo(14);
    });
  });

  describe('buffering', () => {
    const startBuffering = jasmine.objectContaining({buffering: true});
    const endBuffering = jasmine.objectContaining({buffering: false});
    /** @type {!jasmine.Spy} */
    let onBuffering;
    /** @type {!shaka.test.Waiter} */
    let waiter;

    beforeEach(() => {
      onBuffering = jasmine.createSpy('onBuffering');
      player.addEventListener('buffering', Util.spyFunc(onBuffering));

      waiter = new shaka.test.Waiter(eventManager)
          .setPlayer(player)
          .timeoutAfter(10)
          .failOnTimeout(true);
    });

    it('enters/exits buffering state at start', async () => {
      // Set a large rebuffer goal to ensure we can see the buffering before
      // we start playing.
      player.configure('streaming.rebufferingGoal', 30);

      await player.load('test:sintel_long_compiled');
      video.pause();
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(startBuffering);
      onBuffering.calls.reset();

      await waiter.waitForEvent(player, 'buffering');
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(endBuffering);

      expect(getBufferedAhead()).toBeGreaterThanOrEqual(30);
    });

    it('enters/exits buffering state while playing', async () => {
      player.configure('streaming.rebufferingGoal', 1);
      player.configure('streaming.bufferingGoal', 10);

      await player.load('test:sintel_long_compiled');
      video.pause();
      if (player.isBuffering()) {
        await waiter.waitForEvent(player, 'buffering');
      }
      onBuffering.calls.reset();

      player.configure('streaming.rebufferingGoal', 30);
      video.currentTime = 70;
      await waiter.waitForEvent(player, 'buffering');
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(startBuffering);
      onBuffering.calls.reset();

      expect(getBufferedAhead()).toBeLessThan(30);

      await waiter.waitForEvent(player, 'buffering');
      expect(onBuffering).toHaveBeenCalledTimes(1);
      expect(onBuffering).toHaveBeenCalledWith(endBuffering);

      expect(getBufferedAhead()).toBeGreaterThanOrEqual(30);
    });

    it('buffers ahead of the playhead', async () => {
      player.configure('streaming.bufferingGoal', 10);

      await player.load('test:sintel_long_compiled');
      video.pause();
      await waiter.waitUntilBuffered(video, 10);

      player.configure('streaming.bufferingGoal', 30);
      await waiter.waitUntilBuffered(video, 30);

      player.configure('streaming.bufferingGoal', 60);
      await waiter.waitUntilBuffered(video, 60);
      await Util.delay(1);
      expect(getBufferedAhead()).toBeLessThan(70);  // 60 + segment_size

      // We don't remove buffered content ahead of the playhead, so seek to
      // clear the buffer.
      player.configure('streaming.bufferingGoal', 10);
      video.currentTime = 120;
      await waiter.waitUntilBuffered(video, 10);
      await Util.delay(1);
      expect(getBufferedAhead()).toBeLessThan(20);  // 10 + segment_size
    });

    it('clears buffer behind playhead', async () => {
      player.configure('streaming.bufferingGoal', 30);
      player.configure('streaming.bufferBehind', 30);

      await player.load('test:sintel_long_compiled');
      video.pause();
      await waiter.waitUntilBuffered(video, 30);
      video.currentTime = 20;
      await waiter.waitUntilBuffered(video, 30);

      expect(getBufferedBehind()).toBe(20);  // Buffered to start still.
      video.currentTime = 50;
      await waiter.waitUntilBuffered(video, 30);
      await Util.delay(1);
      expect(getBufferedBehind()).toBeLessThan(40);  // 30 + segment_size

      player.configure('streaming.bufferBehind', 10);
      // We only evict content when we append a segment, so increase the
      // buffering goal so we append another segment.
      player.configure('streaming.bufferingGoal', 40);
      await waiter.waitUntilBuffered(video, 40);
      await Util.delay(1);
      expect(getBufferedBehind()).toBeLessThanOrEqual(10);
    });

    function getBufferedAhead() {
      const end = shaka.media.TimeRangesUtils.bufferEnd(video.buffered);
      if (end == null) {
        return 0;
      }
      return end - video.currentTime;
    }

    function getBufferedBehind() {
      const start = shaka.media.TimeRangesUtils.bufferStart(video.buffered);
      if (start == null) {
        return 0;
      }
      return video.currentTime - start;
    }
  });  // describe('buffering')

  describe('configuration', () => {
    it('has the correct number of arguments in compiled callbacks', () => {
      // Get the default configuration for both the compiled & uncompiled
      // versions for comparison.
      const compiledConfig = (new compiledShaka.Player()).getConfiguration();
      const uncompiledConfig = (new shaka.Player()).getConfiguration();

      compareConfigFunctions(compiledConfig, uncompiledConfig);

      /**
       * Find all the callbacks in the configuration recursively and compare
       * their lengths (number of arguments).  We warn the app developer when a
       * configured callback has the wrong number of arguments, so our own
       * compiled versions must be correct.
       *
       * @param {Object} compiled
       * @param {Object} uncompiled
       * @param {string=} basePath The path to this point in the config, for
       *   logging purposes.
       */
      function compareConfigFunctions(compiled, uncompiled, basePath = '') {
        for (const key in uncompiled) {
          const uncompiledValue = uncompiled[key];
          const compiledValue = compiled[key];
          const path = basePath + '.' + key;

          if (uncompiledValue && uncompiledValue.constructor == Object) {
            // This is an anonymous Object, so recurse on it.
            compareConfigFunctions(compiledValue, uncompiledValue, path);
          } else if (typeof uncompiledValue == 'function') {
            // This is a function, so check its length.  The uncompiled version
            // is considered canonically correct, so we use the uncompiled
            // length as the expectation.
            shaka.log.debug('[' + path + ']',
                compiledValue.length, 'should be', uncompiledValue.length);
            expect(compiledValue.length).withContext(path)
                .toBe(uncompiledValue.length);
          }
        }
      }
    });
  });  // describe('configuration')

  describe('adaptation', () => {
    /** @type {!shaka.test.FakeAbrManager} */
    let abrManager;

    beforeEach(() => {
      abrManager = new shaka.test.FakeAbrManager();
      player.configure('abrFactory', () => abrManager);
    });

    it('fires "adaptation" event', async () => {
      const abrEnabled = new Promise((resolve) => {
        abrManager.enable.and.callFake(resolve);
      });

      await player.load('test:sintel_multi_lingual_multi_res_compiled');

      expect(abrManager.switchCallback).toBeTruthy();
      expect(abrManager.variants.length).toBeGreaterThan(1);
      expect(abrManager.chooseIndex).toBe(0);

      /** @type {shaka.test.Waiter} */
      const waiter = new shaka.test.Waiter(eventManager)
          .setPlayer(player)
          .timeoutAfter(1)
          .failOnTimeout(true);

      await waiter.waitForPromise(abrEnabled, 'AbrManager enabled');

      const p = waiter.waitForEvent(player, 'adaptation');
      abrManager.switchCallback(abrManager.variants[1]);
      await expectAsync(p).toBeResolved();
    });

    it('doesn\'t fire "adaptation" when not changing streams', async () => {
      const abrEnabled = new Promise((resolve) => {
        abrManager.enable.and.callFake(resolve);
      });

      await player.load('test:sintel_multi_lingual_multi_res_compiled');

      expect(abrManager.switchCallback).toBeTruthy();

      /** @type {shaka.test.Waiter} */
      const waiter = new shaka.test.Waiter(eventManager)
          .setPlayer(player)
          .timeoutAfter(1)
          .failOnTimeout(true);

      await waiter.waitForPromise(abrEnabled, 'AbrManager enabled');

      const p = waiter.waitForEvent(player, 'adaptation');
      for (let i = 0; i < 3; i++) {
        abrManager.switchCallback(abrManager.variants[abrManager.chooseIndex]);
      }
      await expectAsync(p).toBeRejected();  // Timeout
    });
  });  // describe('adaptation')

  /** Regression test for Issue #2741 */
  describe('unloading', () => {
    drmIt('unloads properly after DRM error', async () => {
      const drmSupport = await shaka.media.DrmEngine.probeSupport();
      if (!drmSupport['com.widevine.alpha'] &&
          !drmSupport['com.microsoft.playready']) {
        pending('Skipping DRM error test, only runs on Widevine and PlayReady');
      }

      let unloadPromise = null;
      const errorPromise = new Promise((resolve, reject) => {
        onErrorSpy.and.callFake((event) => {
          unloadPromise = player.unload();
          onErrorSpy.and.callThrough();
          resolve();
        });
      });

      // Load an encrypted asset with the wrong license servers, so it errors.
      const bogusUrl = 'http://foo/widevine';
      player.configure('drm.servers', {
        'com.widevine.alpha': bogusUrl,
        'com.microsoft.playready': bogusUrl,
      });
      await player.load('test:sintel-enc_compiled');

      await errorPromise;
      expect(unloadPromise).not.toBeNull();
      if (unloadPromise) {
        await unloadPromise;
      }
    });
  });  // describe('unloading')

  describe('addChaptersTrack', () => {
    it('adds external chapters in vtt format', async () => {
      await player.load('test:sintel_no_text_compiled');
      const locationUri = new goog.Uri(location.href);
      const partialUri1 = new goog.Uri('/base/test/test/assets/chapters.vtt');
      const absoluteUri1 = locationUri.resolve(partialUri1);
      await player.addChaptersTrack(absoluteUri1.toString(), 'en');

      // Data should be available as soon as addChaptersTrack resolves.
      // See https://github.com/shaka-project/shaka-player/issues/4186
      const chapters = player.getChapters('en');
      expect(chapters.length).toBe(3);
      const chapter1 = chapters[0];
      expect(chapter1.title).toBe('Chapter 1');
      expect(chapter1.startTime).toBe(0);
      expect(chapter1.endTime).toBe(5);
      const chapter2 = chapters[1];
      expect(chapter2.title).toBe('Chapter 2');
      expect(chapter2.startTime).toBe(5);
      expect(chapter2.endTime).toBe(10);
      const chapter3 = chapters[2];
      expect(chapter3.title).toBe('Chapter 3');
      expect(chapter3.startTime).toBe(10);
      expect(chapter3.endTime).toBe(20);

      const partialUri2 = new goog.Uri('/base/test/test/assets/chapters2.vtt');
      const absoluteUri2 = locationUri.resolve(partialUri2);
      await player.addChaptersTrack(absoluteUri2.toString(), 'en');

      const chaptersUpdated = player.getChapters('en');
      expect(chaptersUpdated.length).toBe(6);
      const chapterUpdated1 = chaptersUpdated[0];
      expect(chapterUpdated1.title).toBe('Chapter 1');
      expect(chapterUpdated1.startTime).toBe(0);
      expect(chapterUpdated1.endTime).toBe(5);
      const chapterUpdated2 = chaptersUpdated[1];
      expect(chapterUpdated2.title).toBe('Chapter 2');
      expect(chapterUpdated2.startTime).toBe(5);
      expect(chapterUpdated2.endTime).toBe(10);
      const chapterUpdated3 = chaptersUpdated[2];
      expect(chapterUpdated3.title).toBe('Chapter 3');
      expect(chapterUpdated3.startTime).toBe(10);
      expect(chapterUpdated3.endTime).toBe(20);
      const chapterUpdated4 = chaptersUpdated[3];
      expect(chapterUpdated4.title).toBe('Chapter 4');
      expect(chapterUpdated4.startTime).toBe(20);
      expect(chapterUpdated4.endTime).toBe(30);
      const chapterUpdated5 = chaptersUpdated[4];
      expect(chapterUpdated5.title).toBe('Chapter 5');
      expect(chapterUpdated5.startTime).toBe(30);
      expect(chapterUpdated5.endTime).toBe(40);
      const chapterUpdated6 = chaptersUpdated[5];
      expect(chapterUpdated6.title).toBe('Chapter 6');
      expect(chapterUpdated6.startTime).toBe(40);
      expect(chapterUpdated6.endTime).toBe(61.349);
    });

    it('adds external chapters in srt format', async () => {
      await player.load('test:sintel_no_text_compiled');
      const locationUri = new goog.Uri(location.href);
      const partialUri = new goog.Uri('/base/test/test/assets/chapters.srt');
      const absoluteUri = locationUri.resolve(partialUri);
      await player.addChaptersTrack(absoluteUri.toString(), 'es');

      const chapters = player.getChapters('es');
      expect(chapters.length).toBe(3);
      const chapter1 = chapters[0];
      expect(chapter1.title).toBe('Chapter 1');
      expect(chapter1.startTime).toBe(0);
      expect(chapter1.endTime).toBe(5);
      const chapter2 = chapters[1];
      expect(chapter2.title).toBe('Chapter 2');
      expect(chapter2.startTime).toBe(5);
      expect(chapter2.endTime).toBe(30);
      const chapter3 = chapters[2];
      expect(chapter3.title).toBe('Chapter 3');
      expect(chapter3.startTime).toBe(30);
      expect(chapter3.endTime).toBe(61.349);
    });
  });  // describe('addChaptersTrack')

  it('requires a license server for HLS ClearKey content', async () => {
    const expectedError = Util.jasmineError(new shaka.util.Error(
        shaka.util.Error.Severity.CRITICAL,
        shaka.util.Error.Category.DRM,
        shaka.util.Error.Code.NO_LICENSE_SERVER_GIVEN,
        'org.w3.clearkey'));
    await expectAsync(player.load('test:sintel-hls-clearkey'))
        .toBeRejectedWith(expectedError);
  });

  describe('addThumbnailsTrack', () => {
    it('appends thumbnails for external thumbnails with sprites',
        async () => {
          await player.load('test:sintel_no_text_compiled');
          const locationUri = new goog.Uri(location.href);
          const partialUri =
              new goog.Uri('/base/test/test/assets/thumbnails-sprites.vtt');
          const absoluteUri = locationUri.resolve(partialUri);
          const newTrack =
              await player.addThumbnailsTrack(absoluteUri.toString());

          expect(player.getImageTracks()).toEqual([newTrack]);

          const thumbnail1 = await player.getThumbnails(newTrack.id, 0);
          expect(thumbnail1.startTime).toBe(0);
          expect(thumbnail1.duration).toBe(5);
          expect(thumbnail1.height).toBe(90);
          expect(thumbnail1.positionX).toBe(0);
          expect(thumbnail1.positionY).toBe(0);
          expect(thumbnail1.width).toBe(160);
          const thumbnail2 = await player.getThumbnails(newTrack.id, 10);
          expect(thumbnail2.startTime).toBe(5);
          expect(thumbnail2.duration).toBe(25);
          expect(thumbnail2.height).toBe(90);
          expect(thumbnail2.positionX).toBe(160);
          expect(thumbnail2.positionY).toBe(0);
          expect(thumbnail2.width).toBe(160);
          const thumbnail3 = await player.getThumbnails(newTrack.id, 40);
          expect(thumbnail3.startTime).toBe(30);
          expect(thumbnail3.duration).toBe(30);
          expect(thumbnail3.height).toBe(90);
          expect(thumbnail3.positionX).toBe(160);
          expect(thumbnail3.positionY).toBe(90);
          expect(thumbnail3.width).toBe(160);

          const thumbnails = await player.getAllThumbnails(newTrack.id);
          expect(thumbnails.length).toBe(3);
        });

    it('appends thumbnails for external thumbnails without sprites',
        async () => {
          await player.load('test:sintel_no_text_compiled');
          const locationUri = new goog.Uri(location.href);
          const partialUri =
              new goog.Uri('/base/test/test/assets/thumbnails.vtt');
          const absoluteUri = locationUri.resolve(partialUri);
          const newTrack =
              await player.addThumbnailsTrack(absoluteUri.toString());

          expect(player.getImageTracks()).toEqual([newTrack]);

          const thumbnail1 = await player.getThumbnails(newTrack.id, 0);
          expect(thumbnail1.startTime).toBe(0);
          expect(thumbnail1.duration).toBe(5);
          const thumbnail2 = await player.getThumbnails(newTrack.id, 10);
          expect(thumbnail2.startTime).toBe(5);
          expect(thumbnail2.duration).toBe(25);
          const thumbnail3 = await player.getThumbnails(newTrack.id, 40);
          expect(thumbnail3.startTime).toBe(30);
          expect(thumbnail3.duration).toBe(30);

          const thumbnails = await player.getAllThumbnails(newTrack.id);
          expect(thumbnails.length).toBe(3);
        });
  });  // describe('addThumbnailsTrack')
});
