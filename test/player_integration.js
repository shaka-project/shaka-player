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
  const Util = shaka.test.Util;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;
  /** @type {shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  beforeAll(async () => {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    compiledShaka = await Util.loadShaka(getClientArg('uncompiled'));
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
  });

  beforeEach(function() {
    player = new compiledShaka.Player(video);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake(function(event) { fail(event.detail); });
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    eventManager.release();

    await player.destroy();

    // Work-around: allow the Tizen media pipeline to cool down.
    // Without this, Tizen's pipeline seems to hang in subsequent tests.
    // TODO: file a bug on Tizen
    await Util.delay(0.1);
  });

  afterAll(function() {
    document.body.removeChild(video);
  });

  describe('constructor', function() {
    beforeEach(async function() {
      // To test the constructor, destroy the player that was constructed
      // in the outermost beforeEach().  Then we can control the details in
      // each constructor test.
      await player.destroy();
    });

    // TODO(vaage): Re-enable this test when we add back support for
    //              initializing media source during attach (via the
    //              constructor).
    xit('sets video.src when video is provided', async function() {
      expect(video.src).toBeFalsy();
      player = new compiledShaka.Player(video);

      // This should always be enough time to set up MediaSource.
      await Util.delay(2);
      expect(video.src).toBeTruthy();
    });

    it('does not set video.src when no video is provided', async function() {
      expect(video.src).toBeFalsy();
      player = new compiledShaka.Player();

      // This should always be enough time to set up MediaSource.
      await Util.delay(2);
      expect(video.src).toBeFalsy();
    });
  });

  describe('attach', function() {
    beforeEach(async function() {
      // To test attach, we want to construct a player without a video element
      // attached in advance.  To do that, we destroy the player that was
      // constructed in the outermost beforeEach(), then construct a new one
      // without a video element.
      await player.destroy();
      player = new compiledShaka.Player();
    });

    // TODO(vaage): Re-enable this test when we add back support for
    //              initializing media source during attach (via the
    //              constructor).
    xit('sets video.src when initializeMediaSource is true', async function() {
      expect(video.src).toBeFalsy();
      await player.attach(video, true);
      expect(video.src).toBeTruthy();
    });

    it('does not set video.src when initializeMediaSource is false',
        async function() {
          expect(video.src).toBeFalsy();
          await player.attach(video, false);
          expect(video.src).toBeFalsy();
        });

    it('can be used before load()', async function() {
      await player.attach(video);
      await player.load('test:sintel_compiled');
    });
  });

  describe('unload', function() {
    it('unsets video.src when reinitializeMediaSource is false',
        async function() {
          await player.load('test:sintel_compiled');
          expect(video.src).toBeTruthy();

          await player.unload(false);
          expect(video.src).toBeFalsy();

          await Util.delay(0.4);
          // After a long delay, we have not implicitly set MediaSource up
          // again.  video.src stays unset.
          expect(video.src).toBeFalsy();
        });

    // TODO(vaage): Re-enable this test when we add back support for
    //              initializing media source during attach (via the
    //              constructor).
    xit('resets video.src when reinitializeMediaSource is true',
        async function() {
          await player.load('test:sintel_compiled');
          expect(video.src).toBeTruthy();

          await player.unload(true);
          expect(video.src).toBeTruthy();
        });
  });

  describe('getStats', function() {
    it('gives stats about current stream', async () => {
      // This is tested more in player_unit.js.  This is here to test the public
      // API and to check for renaming.
      await player.load('test:sintel_compiled');
      video.play();
      await waitUntilPlayheadReaches(video, 1, 10);

      let stats = player.getStats();
      let expected = {
        width: jasmine.any(Number),
        height: jasmine.any(Number),
        streamBandwidth: jasmine.any(Number),

        decodedFrames: jasmine.any(Number),
        droppedFrames: jasmine.any(Number),
        estimatedBandwidth: jasmine.any(Number),

        loadLatency: jasmine.any(Number),
        playTime: jasmine.any(Number),
        bufferingTime: jasmine.any(Number),

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
  });

  describe('setTextTrackVisibility', function() {
    // Using mode='disabled' on TextTrack causes cues to go null, which leads
    // to a crash in TextEngine.  This validates that we do not trigger this
    // behavior when changing visibility of text.
    it('does not cause cues to be null', async () => {
      await player.load('test:sintel_compiled');
      video.play();
      await waitUntilPlayheadReaches(video, 1, 10);

      // This TextTrack was created as part of load() when we set up the
      // TextDisplayer.
      let textTrack = video.textTracks[0];
      expect(textTrack).not.toBe(null);

      if (textTrack) {
        // This should not be null initially.
        expect(textTrack.cues).not.toBe(null);

        player.setTextTrackVisibility(true);
        // This should definitely not be null when visible.
        expect(textTrack.cues).not.toBe(null);

        player.setTextTrackVisibility(false);
        // This should not transition to null when invisible.
        expect(textTrack.cues).not.toBe(null);
      }
    });

    it('is called automatically if language prefs match', async () => {
      // If the text is a match for the user's preferences, and audio differs
      // from text, we enable text display automatically.

      // NOTE: This is also a regression test for #1696, in which a change
      // to this feature broke StreamingEngine initialization.

      const preferredTextLanguage = 'fa';  // The same as in the content itself
      player.configure({preferredTextLanguage: preferredTextLanguage});

      // Now load a version of Sintel with delayed setup of video & audio
      // streams and wait for completion.
      await player.load('test:sintel_realistic_compiled');
      // By this point, a MediaSource error would be thrown in a repro of bug
      // #1696.

      // Make sure the automatic setting took effect.
      expect(player.isTextTrackVisible()).toBe(true);

      // Make sure the content we tested with has text tracks, that the config
      // we used matches the text language, and that the audio language differs.
      // These will catch any changes to the underlying content that would
      // invalidate the test setup.
      expect(player.getTextTracks().length).not.toBe(0);
      const textTrack = player.getTextTracks()[0];
      expect(textTrack.language).toEqual(preferredTextLanguage);

      const variantTrack = player.getVariantTracks()[0];
      expect(variantTrack.language).not.toEqual(textTrack.language);
    });

    it('is not called automatically without language pref match', async () => {
      // If the text preference doesn't match the content, we do not enable text
      // display automatically.

      const preferredTextLanguage = 'xx';  // Differs from the content itself
      player.configure({preferredTextLanguage: preferredTextLanguage});

      // Now load the content and wait for completion.
      await player.load('test:sintel_realistic_compiled');

      // Make sure the automatic setting did not happen.
      expect(player.isTextTrackVisible()).toBe(false);

      // Make sure the content we tested with has text tracks, that the config
      // we used does not match the text language, and that the text and audio
      // languages do not match each other (to keep this distinct from the next
      // test case).  This will catch any changes to the underlying content that
      // would invalidate the test setup.
      expect(player.getTextTracks().length).not.toBe(0);
      const textTrack = player.getTextTracks()[0];
      expect(textTrack.language).not.toEqual(preferredTextLanguage);

      const variantTrack = player.getVariantTracks()[0];
      expect(variantTrack.language).not.toEqual(textTrack.language);
    });

    it('is not called automatically with audio and text match', async () => {
      // If the audio and text tracks use the same language, we do not enable
      // text display automatically, no matter the text preference.

      const preferredTextLanguage = 'und';  // The same as in the content itself
      player.configure({preferredTextLanguage: preferredTextLanguage});

      // Now load the content and wait for completion.
      await player.load('test:sintel_compiled');

      // Make sure the automatic setting did not happen.
      expect(player.isTextTrackVisible()).toBe(false);

      // Make sure the content we tested with has text tracks, that the
      // config we used matches the content, and that the text and audio
      // languages match each other.  This will catch any changes to the
      // underlying content that would invalidate the test setup.
      expect(player.getTextTracks().length).not.toBe(0);
      const textTrack = player.getTextTracks()[0];
      expect(textTrack.language).toEqual(preferredTextLanguage);

      const variantTrack = player.getVariantTracks()[0];
      expect(variantTrack.language).toEqual(textTrack.language);
    });
  });

  describe('plays', function() {
    it('with external text tracks', async () => {
      await player.load('test:sintel_no_text_compiled');
      // For some reason, using path-absolute URLs (i.e. without the hostname)
      // like this doesn't work on Safari.  So manually resolve the URL.
      let locationUri = new goog.Uri(location.href);
      let partialUri = new goog.Uri('/base/test/test/assets/text-clip.vtt');
      let absoluteUri = locationUri.resolve(partialUri);
      player.addTextTrack(absoluteUri.toString(), 'en', 'subtitles',
                          'text/vtt');

      video.play();
      await Util.delay(5);

      let textTracks = player.getTextTracks();
      expect(textTracks).toBeTruthy();
      expect(textTracks.length).toBe(1);

      expect(textTracks[0].active).toBe(true);
      expect(textTracks[0].language).toEqual('en');
    });

    it('with cea closed captions', async () => {
      await player.load('test:cea-708_mp4_compiled');

      const textTracks = player.getTextTracks();
      expect(textTracks).toBeTruthy();
      expect(textTracks.length).toBe(1);
      expect(textTracks[0].language).toEqual('en');
    });


    it('while changing languages with short Periods', async () => {
      // See: https://github.com/google/shaka-player/issues/797
      player.configure({preferredAudioLanguage: 'en'});
      await player.load('test:sintel_short_periods_compiled');
      video.play();
      await waitUntilPlayheadReaches(video, 8, 30);

      // The Period changes at 10 seconds.  Assert that we are in the previous
      // Period and have buffered into the next one.
      expect(video.currentTime).toBeLessThan(9);
      // The two periods might not be in a single contiguous buffer, so don't
      // check end(0).  Gap-jumping will deal with any discontinuities.
      let bufferEnd = video.buffered.end(video.buffered.length - 1);
      expect(bufferEnd).toBeGreaterThan(11);

      // Change to a different language; this should clear the buffers and
      // cause a Period transition again.
      expect(getActiveLanguage()).toBe('en');
      player.selectAudioLanguage('es');
      await waitUntilPlayheadReaches(video, 21, 30);

      // Should have gotten past the next Period transition and still be
      // playing the new language.
      expect(getActiveLanguage()).toBe('es');
    });

    /**
     * Gets the language of the active Variant.
     * @return {string}
     */
    function getActiveLanguage() {
      let tracks = player.getVariantTracks().filter(function(t) {
        return t.active;
      });
      expect(tracks.length).toBeGreaterThan(0);
      return tracks[0].language;
    }
  });

  describe('abort', function() {
    /** @type {!jasmine.Spy} */
    let schemeSpy;

    beforeAll(function() {
      schemeSpy = jasmine.createSpy('reject scheme');
      schemeSpy.and.callFake(function() {
        // Throw a recoverable error so it will retry.
        let error = new shaka.util.Error(
            shaka.util.Error.Severity.RECOVERABLE,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.HTTP_ERROR);
        return shaka.util.AbortableOperation.failed(error);
      });
      compiledShaka.net.NetworkingEngine.registerScheme('reject',
          Util.spyFunc(schemeSpy));
    });

    afterEach(function() {
      schemeSpy.calls.reset();
    });

    afterAll(function() {
      compiledShaka.net.NetworkingEngine.unregisterScheme('reject');
    });

    function testTemplate(operationFn) {
      // No data will be loaded for this test, so it can use a real manifest
      // parser safely.
      player.load('reject://www.foo.com/bar.mpd').then(fail).catch(() => {});
      return shaka.test.Util.delay(0.1).then(operationFn).then(function() {
        expect(schemeSpy.calls.count()).toBe(1);
      });
    }

    // TODO(vaage): Re-enable when aborting manifest load retries is integrated
    //              with the load graph.
    xit('unload prevents further manifest load retries', async () => {
      await testTemplate(() => player.unload());
    });

    // TODO(vaage): Re-enable when aborting manifest load retries is integrated
    //              with the load graph.
    xit('destroy prevents further manifest load retries', async () => {
      await testTemplate(() => player.destroy());
    });
  });

  describe('TextDisplayer plugin', function() {
    // Simulate the use of an external TextDisplayer plugin.
    let textDisplayer;
    beforeEach(function() {
      textDisplayer = {
        destroy: jasmine.createSpy('destroy'),
        append: jasmine.createSpy('append'),
        remove: jasmine.createSpy('remove'),
        isTextVisible: jasmine.createSpy('isTextVisible'),
        setTextVisibility: jasmine.createSpy('setTextVisibility'),
      };

      textDisplayer.destroy.and.returnValue(Promise.resolve());
      textDisplayer.isTextVisible.and.returnValue(true);

      player.configure({
        textDisplayFactory: function() { return textDisplayer; },
      });

      // Make sure the configuration was taken.
      const ConfiguredFactory = player.getConfiguration().textDisplayFactory;
      const configuredTextDisplayer = new ConfiguredFactory();
      expect(configuredTextDisplayer).toBe(textDisplayer);
    });

    // Regression test for https://github.com/google/shaka-player/issues/1187
    it('does not throw on destroy', async () => {
      await player.load('test:sintel_compiled');
      video.play();
      await waitUntilPlayheadReaches(video, 1, 10);
      await player.unload();
      // Before we fixed #1187, the call to destroy() on textDisplayer was
      // renamed in the compiled version and could not be called.
      expect(textDisplayer.destroy).toHaveBeenCalled();
    });
  });

  describe('TextAndRoles', function() {
    // Regression Test. Makes sure that the language and role fields have been
    // properly exported from the player.
    it('exports language and roles fields', async () => {
      await player.load('test:sintel_compiled');
      let languagesAndRoles = player.getTextLanguagesAndRoles();
      expect(languagesAndRoles.length).toBeTruthy();
      languagesAndRoles.forEach((languageAndRole) => {
        expect(languageAndRole.language).not.toBeUndefined();
        expect(languageAndRole.role).not.toBeUndefined();
      });
    });
  });

  describe('streaming event', function() {
    // Calling switch early during load() caused a failed assertion in Player
    // and the track selection was ignored.  Because this bug involved
    // interactions between Player and StreamingEngine, it is an integration
    // test and not a unit test.
    // https://github.com/google/shaka-player/issues/1119
    it('allows early selection of specific tracks', function(done) {
      const streamingListener = jasmine.createSpy('listener');

      // Because this is an issue with failed assertions, destroy the existing
      // player from the compiled version, and create a new one using the
      // uncompiled version.  Then we will get assertions.
      eventManager.unlisten(player, 'error');
      player.destroy().then(() => {
        player = new shaka.Player(video);
        player.configure({abr: {enabled: false}});
        eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));

        // When 'streaming' fires, select the first track explicitly.
        player.addEventListener('streaming', Util.spyFunc(streamingListener));
        streamingListener.and.callFake(() => {
          const tracks = player.getVariantTracks();
          player.selectVariantTrack(tracks[0]);
        });

        // Now load the content.
        return player.load('test:sintel');
      }).then(() => {
        // When the bug triggers, we fail assertions in Player.
        // Make sure the listener was triggered, so that it could trigger the
        // code path in this bug.
        expect(streamingListener).toHaveBeenCalled();
      }).catch(fail).then(done);
    });

    // After fixing the issue above, calling switch early during a second load()
    // caused a failed assertion in StreamingEngine, because we did not reset
    // switchingPeriods_ in Player.  Because this bug involved interactions
    // between Player and StreamingEngine, it is an integration test and not a
    // unit test.
    // https://github.com/google/shaka-player/issues/1119
    it('allows selection of tracks in subsequent loads', function(done) {
      const streamingListener = jasmine.createSpy('listener');

      // Because this is an issue with failed assertions, destroy the existing
      // player from the compiled version, and create a new one using the
      // uncompiled version.  Then we will get assertions.
      eventManager.unlisten(player, 'error');
      player.destroy().then(() => {
        player = new shaka.Player(video);
        player.configure({abr: {enabled: false}});
        eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));

        // This bug only triggers when you do this on the second load.
        // So we load one piece of content, then set up the streaming listener
        // to change tracks, then we load a second piece of content.
        return player.load('test:sintel');
      }).then(() => {
        // Give StreamingEngine time to complete all setup and to call back into
        // the Player with canSwitch_.  If you move on too quickly to the next
        // load(), the bug does not reproduce.
        return shaka.test.Util.delay(1);
      }).then(() => {
        player.addEventListener('streaming', Util.spyFunc(streamingListener));

        streamingListener.and.callFake(() => {
          const track = player.getVariantTracks()[0];
          player.selectVariantTrack(track);
        });

        // Now load again to trigger the failed assertion.
        return player.load('test:sintel');
      }).then(() => {
        // When the bug triggers, we fail assertions in StreamingEngine.
        // So just make sure the listener was triggered, so that it could
        // trigger the code path in this bug.
        expect(streamingListener).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
  });

  /**
   * @param {!HTMLMediaElement} video
   * @param {number} playheadTime The time to wait for.
   * @param {number} timeout in seconds, after which the Promise fails
   * @return {!Promise}
   */
  function waitUntilPlayheadReaches(video, playheadTime, timeout) {
    let curEventManager = eventManager;
    return new Promise(function(resolve, reject) {
      curEventManager.listen(video, 'timeupdate', function() {
        if (video.currentTime >= playheadTime) {
          curEventManager.unlisten(video, 'timeupdate');
          resolve();
        }
      });
      Util.delay(timeout).then(function() {
        curEventManager.unlisten(video, 'timeupdate');
        reject('Timeout waiting for time');
      });
    });
  }
});

// This test suite focuses on how the player moves through the different load
// states.
//
// TODO(vaage): Some test cases are missing and need to be added when the
//              the required load states are added:
//                - Creating the manifest parser
//                - Parsing the manifest
//                - Creating drm engine
//                - Creating streaming engine
describe('Player Load Path', () => {
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;

  /** @type {!jasmine.Spy} */
  let stateChangeSpy;

  beforeAll(async () => {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    await shaka.test.TestScheme.createManifests(shaka, '_compiled');
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  beforeEach(() => {
    stateChangeSpy = jasmine.createSpy('stateChange');

    player = new shaka.Player();
    player.addEventListener(
        'onstatechange',
        shaka.test.Util.spyFunc(stateChangeSpy));
  });

  // Even though some test will destroy the player, we want to make sure that
  // we don't allow the player to stay attached to the video element.
  afterEach(async () => {
    await player.destroy();
  });

  // There was a bug when calling unload before calling load would cause
  // the load to continue before the (first) unload was complete.
  // https://github.com/google/shaka-player/issues/612
  it('load will wait for unload to finish', async () => {
    await player.attach(video);
    await player.load('test:sintel');

    // We are going to call |unload| and |load| right after each other. What
    // we expect to see is that the player is fully unloaded before the load
    // occurs.

    const unload = player.unload();
    const load = player.load('test:sintel');

    await unload;
    await load;

    expect(getVisitedStates()).toEqual([
      'attach',

      // First call to |load|.
      'load',

      // Our call to |unload| would have started the transition to
      // "unloaded", but since we called |load| right away, the transition
      // to "unloaded" was most likely done by the call to |load|.
      'unload',
      'attach',
      'load',
    ]);
  });

  it('load and unload can be called multiple times', async () => {
    await player.attach(video);

    await player.load('test:sintel');
    await player.unload();

    await player.load('test:sintel');
    await player.unload();

    expect(getVisitedStates()).toEqual([
      'attach',

      // Load and unload 1
      'load',
      'unload',
      'attach',

      // Load and unload 2
      'load',
      'unload',
      'attach',
    ]);
  });

  it('load can be called multiple times', async () => {
    await player.attach(video);

    await player.load('test:sintel');
    await player.load('test:sintel');
    await player.load('test:sintel');

    expect(getVisitedStates()).toEqual([
      'attach',

      // Load 1
      'load',

      // Load 2
      'unload',
      'attach',
      'load',

      // Load 3
      'unload',
      'attach',
      'load',
    ]);
  });

  // TODO: When we have more states as part of the loading path, update
  //       this test to interrupt part-way through the load.
  it('load will interrupt load', async () => {
    await player.attach(video);

    const load1 = player.load('test:sintel');
    const load2 = player.load('test:sintel');

    // Load 1 should have been interrupted because of load 2.
    await rejected(load1);
    // Load 2 should finish with no issues.
    await load2;
  });

  // TODO: When we have more states as part of the loading path, update
  //       this test to interrupt part-way through the load.
  it('unload will interupt load', async () => {
    await player.attach(video);

    const load = player.load('test:sintel');
    const unload = player.unload();

    await rejected(load);
    await unload;

    // We should never have gotten into the loaded state.
    expect(getVisitedStates()).not.toContain('load');
  });

  // TODO: When we have more states as part of the loading path, update
  //       this test to interrupt part-way through the load.
  it('destroy will interrupt load', async () => {
    await player.attach(video);

    const load = player.load('test:sintel');
    const destroy = player.destroy();

    await rejected(load);
    await destroy;

    // We should never have gotten into the loaded state.
    expect(getVisitedStates()).not.toContain('load');
  });

  // When |destroy| is called, the player should move through the unload state
  // on its way to the detached state.
  it('destroy will unload and then detach', async () => {
    await player.attach(video);

    await player.load('test:sintel');
    await player.destroy();

    // We really only care about the last two elements (unload and detach),
    // however the test is easier to read if we list the full chain.
    expect(getVisitedStates()).toEqual([
      'attach',
      'load',
      'unload',
      'detach',
    ]);
  });

  // Calling |unload| multiple times should not cause any problems. Calling
  // |unload| after another |unload| call should just have the player re-enter
  // the state it was waiting in.
  it('unloading multiple times is okay', async () => {
    await player.attach(video);

    await player.load('test:sintel');
    await player.unload();
    await player.unload();

    expect(getVisitedStates()).toEqual([
      'attach',

      // First call to |load|.
      'load',

      // First call to unload will unload everything and then move us to the
      // attached state.
      'unload',
      'attach',

      // Second call to unload will make us re-enter the attached state since
      // there is nothing to unload.
      'attach',
    ]);
  });

  // When we destroy, it will allow a current unload operation to occur even
  // though we are going to unload and detach as part of |destroy|.
  it('destroy will not interrupt unload', async () => {
    await player.attach(video);
    await player.load('test:sintel');

    const unload = player.unload();
    const destroy = player.destroy();

    await unload;
    await destroy;
  });

  // While out tests will naturally test this (because we destroy in
  // afterEach), this test will explicitly express our intentions to support
  // the use-case of calling |destroy| multiple times on a player instance.
  it('destroying multiple times is okay', async () => {
    await player.attach(video);
    await player.load('test:sintel');

    await player.destroy();
    await player.destroy();
  });

  /**
   * Wait for |p| to be rejected. If |p| is not rejected, this will fail the
   * test;
   *
   * @param {!Promise} p
   * @return {!Promise}
   */
  async function rejected(p) {
    try {
      await p;
      fail();
    } catch (e) {
      expect(e).toBeTruthy();
    }
  }

  /**
   * Get a list of all the states that the walker went through after
   * |beforeEach| finished.
   *
   * @return {!Array.<string>}
   */
  function getVisitedStates() {
    const states = [];
    for (const call of stateChangeSpy.calls.allArgs()) {
      states.push(call[0].state);
    }
    return states;
  }
});
