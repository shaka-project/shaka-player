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

  describe('attach', function() {
    beforeEach(async function() {
      // To test attach, we want to construct a player without a video element
      // attached in advance.  To do that, we destroy the player that was
      // constructed in the outermost beforeEach(), then construct a new one
      // without a video element.
      await player.destroy();
      player = new compiledShaka.Player();
    });

    it('can be used before load()', async function() {
      await player.attach(video);
      await player.load('test:sintel_compiled');
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
        pauseTime: jasmine.any(Number),
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

  describe('TextDisplayer plugin', function() {
    // Simulate the use of an external TextDisplayer plugin.
    /** @type {shaka.test.FakeTextDisplayer} */
    let textDisplayer;
    beforeEach(function() {
      textDisplayer = new shaka.test.FakeTextDisplayer();

      textDisplayer.isTextVisibleSpy.and.callFake(() => {
        return false;
      });
      textDisplayer.destroySpy.and.returnValue(Promise.resolve());
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
      expect(textDisplayer.destroySpy).toHaveBeenCalled();
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

// TODO(vaage): Try to group the stat tests together.
describe('Player Stats', () => {
  let player;

  // Destroy the player in |afterEach| so that it will be destroyed
  // regardless of if the test succeeded or failed.
  afterEach(async () => {
    await player.destroy();
  });

  // Regression test for Issue #968 where trying to get the stats before
  // calling load would fail because not all components had been initialized.
  it('can get stats before loading content', () => {
    // We are opting not to initialize the player with a video element so that
    // it is in the least loaded state possible.
    player = new shaka.Player();

    const stats = player.getStats();
    expect(stats).toBeTruthy();
  });
});


// This test suite checks that we can interrupt manifest parsing using other
// methods. This ensures that if someone accidentally loads a bad uri, they
// don't need to wait for a time-out before being able to load a good uri.
//
// TODO: Any call to |load|, |attach|, etc. should abort manifest retries.
//       Add the missing tests for |load| and |attach|.
describe('Player Manifest Retries', function() {
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;

  /** @type {!jasmine.Spy} */
  let stateChangeSpy;

  beforeAll(() => {
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;
    document.body.appendChild(video);

    // For these tests, we don't want any network requests to succeed. We want
    // to force the networking engine to run-out of retries for our manifest
    // requests.
    shaka.net.NetworkingEngine.registerScheme(
        'reject',
        alwaysFailNetworkScheme);
  });

  afterAll(() => {
    shaka.net.NetworkingEngine.unregisterScheme('reject');
    document.body.removeChild(video);
  });

  beforeEach(async () => {
    stateChangeSpy = jasmine.createSpy('stateChange');

    player = new shaka.Player();
    player.addEventListener(
        'onstatechange', shaka.test.Util.spyFunc(stateChangeSpy));

    await player.attach(video);
  });

  afterEach(async () => {
    await player.destroy();
  });

  it('unload prevents further manifest load retries', async () => {
    const loading = player.load('reject://www.foo.com/bar.mpd');

    // Wait until we are part way through the load process so that we can ensure
    // we are interrupting mid-way.
    await new Promise((resolve) => stateChangeSpy.and.callFake((event) => {
      if (event.state == 'manifest-parser') {
        resolve();
      }
    }));

    await player.unload();

    try {
      await loading;
      fail();
    } catch (e) {
      expect(e.code).toBe(shaka.util.Error.Code.LOAD_INTERRUPTED);
    }
  });

  it('detach prevents further manifest load retries', async () => {
    const loading = player.load('reject://www.foo.com/bar.mpd');

    // Wait until we are part way through the load process so that we can ensure
    // we are interrupting mid-way.
    await new Promise((resolve) => stateChangeSpy.and.callFake((event) => {
      if (event.state == 'manifest-parser') {
        resolve();
      }
    }));

    await player.detach();

    try {
      await loading;
      fail();
    } catch (e) {
      expect(e.code).toBe(shaka.util.Error.Code.LOAD_INTERRUPTED);
    }
  });

  it('destroy prevents further manifest load retries', async () => {
    const loading = player.load('reject://www.foo.com/bar.mpd');

    // Wait until we are part way through the load process so that we can ensure
    // we are interrupting mid-way.
    await new Promise((resolve) => stateChangeSpy.and.callFake((event) => {
      if (event.state == 'manifest-parser') {
        resolve();
      }
    }));

    await player.destroy();

    try {
      await loading;
      fail();
    } catch (e) {
      expect(e.code).toBe(shaka.util.Error.Code.LOAD_INTERRUPTED);
    }
  });

  /**
   * A networking scheme that will ways throw a recoverable error so that
   * networking engine will keep retrying.
   *
   * @return {!shaka.util.AbortableOperation}
   */
  function alwaysFailNetworkScheme() {
    const error = new shaka.util.Error(
        shaka.util.Error.Severity.RECOVERABLE,
        shaka.util.Error.Category.NETWORK,
        shaka.util.Error.Code.HTTP_ERROR);

    return shaka.util.AbortableOperation.failed(error);
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

  /** @type {!jasmine.Spy} */
  let stateIdleSpy;

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
    stateIdleSpy = jasmine.createSpy('stateIdle');
  });

  /**
   * @param {HTMLMediaElement} attachedTo
   */
  function createPlayer(attachedTo) {
    player = new shaka.Player(attachedTo);
    player.addEventListener(
        'onstatechange',
        shaka.test.Util.spyFunc(stateChangeSpy));
    player.addEventListener(
        'onstateidle',
        shaka.test.Util.spyFunc(stateIdleSpy));
  }

  // Even though some test will destroy the player, we want to make sure that
  // we don't allow the player to stay attached to the video element.
  afterEach(async () => {
    await player.destroy();
  });

  it('attach and initialize media source when constructed with media element',
      async () => {
        expect(video.src).toBeFalsy();

        createPlayer(/* attachedTo= */ video);

        // Wait until we enter the media source state.
        await new Promise((resolve) => {
          whenEnteringState('media-source', resolve);
        });

        expect(video.src).toBeTruthy();
      });

  it('does not set video.src when no video is provided', async function() {
    expect(video.src).toBeFalsy();

    createPlayer(/* attachedTo= */ null);

    // Wait until the player has hit an idle state (no more internal loading
    // actions).
    await new Promise((resolve) => stateIdleSpy.and.callFake(resolve));

    expect(video.src).toBeFalsy();
  });

  it('attach + initializeMediaSource=true will initialize media source',
      async () => {
        createPlayer(/* attachedTo= */ null);

        expect(video.src).toBeFalsy();
        await player.attach(video, /* initializeMediaSource= */ true);
        expect(video.src).toBeTruthy();
      });

  it('attach + initializeMediaSource=false will not intialize media source',
      async () => {
        createPlayer(/* attachedTo= */ null);

        expect(video.src).toBeFalsy();
        await player.attach(video, /* initializeMediaSource= */ false);
        expect(video.src).toBeFalsy();
      });

  it('unload + initializeMediaSource=false does not initialize media source',
      async () => {
        createPlayer(/* attachedTo= */ null);

        await player.attach(video);
        await player.load('test:sintel');

        await player.unload(/* initializeMediaSource= */ false);
        expect(video.src).toBeFalsy();
      });

  it('unload + initializeMediaSource=true initializes media source',
      async () => {
        createPlayer(/* attachedTo= */ null);

        await player.attach(video);
        await player.load('test:sintel');

        await player.unload(/* initializeMediaSource= */ true);
        expect(video.src).toBeTruthy();
      });

  // There was a bug when calling unload before calling load would cause
  // the load to continue before the (first) unload was complete.
  // https://github.com/google/shaka-player/issues/612
  it('load will wait for unload to finish', async () => {
    createPlayer(/* attachedTo= */ null);

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
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',

      // Our call to |unload| would have started the transition to
      // "unloaded", but since we called |load| right away, the transition
      // to "unloaded" was most likely done by the call to |load|.
      'unload',
      'attach',
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',
    ]);
  });

  it('load and unload can be called multiple times', async () => {
    createPlayer(/* attachedTo= */ null);

    await player.attach(video);

    await player.load('test:sintel');
    await player.unload();

    await player.load('test:sintel');
    await player.unload();

    expect(getVisitedStates()).toEqual([
      'attach',

      // Load and unload 1
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',
      'unload',
      'attach',

      // Load and unload 2
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',
      'unload',
      'attach',
    ]);
  });

  it('load can be called multiple times', async () => {
    createPlayer(/* attachedTo= */ null);

    await player.attach(video);

    await player.load('test:sintel');
    await player.load('test:sintel');
    await player.load('test:sintel');

    expect(getVisitedStates()).toEqual([
      'attach',

      // Load 1
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',

      // Load 2
      'unload',
      'attach',
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',

      // Load 3
      'unload',
      'attach',
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',
    ]);
  });

  it('load will interrupt load', async () => {
    createPlayer(/* attachedTo= */ null);

    await player.attach(video);

    const load1 = player.load('test:sintel');
    const load2 = player.load('test:sintel');

    // Load 1 should have been interrupted because of load 2.
    await rejected(load1);
    // Load 2 should finish with no issues.
    await load2;
  });

  it('unload will interupt load', async () => {
    createPlayer(/* attachedTo= */ null);

    await player.attach(video);

    const load = player.load('test:sintel');
    const unload = player.unload();

    await rejected(load);
    await unload;

    // We should never have gotten into the loaded state.
    expect(getVisitedStates()).not.toContain('load');
  });

  it('destroy will interrupt load', async () => {
    createPlayer(/* attachedTo= */ null);

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
    createPlayer(/* attachedTo= */ null);

    await player.attach(video);

    await player.load('test:sintel');
    await player.destroy();

    // We really only care about the last two elements (unload and detach),
    // however the test is easier to read if we list the full chain.
    expect(getVisitedStates()).toEqual([
      'attach',
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',
      'unload',
      'detach',
    ]);
  });

  // Calling |unload| multiple times should not cause any problems. Calling
  // |unload| after another |unload| call should just have the player re-enter
  // the state it was waiting in.
  it('unloading multiple times is okay', async () => {
    createPlayer(/* attachedTo= */ null);

    await player.attach(video);

    await player.load('test:sintel');
    await player.unload();
    await player.unload();

    expect(getVisitedStates()).toEqual([
      'attach',

      // First call to |load|.
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
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
    createPlayer(/* attachedTo= */ null);

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
    createPlayer(/* attachedTo= */ null);

    await player.attach(video);
    await player.load('test:sintel');

    await player.destroy();
    await player.destroy();
  });

  // As a regression test for Issue #1570, this checks that when we
  // pre-initialize media source engine, we do not re-create the media source
  // instance when loading.
  it('pre-initialized media source is used when player continues loading',
    async () => {
      createPlayer(/* attachedTo= */ null);

      // After we attach and initialize media source, we should just see
      // two states in our history.
      await player.attach(video, /* initializeMediaSource= */ true);
      expect(getVisitedStates()).toEqual([
        'attach',
        'media-source',
      ]);

      // When we load, the only change in the visited states should be that
      // we added "load".
      await player.load('test:sintel');
      expect(getVisitedStates()).toEqual([
        'attach',
        'media-source',
        'manifest-parser',
        'manifest',
        'drm-engine',
        'load',
      ]);
    });

  // We want to make sure that we can interrupt the load process at key-points
  // in time. After each node in the graph, we should be able to reroute and do
  // something different.
  //
  // To test this, we test that we can successfully unload the player after each
  // node after attached. We exclude the nodes before (and including) attach
  // since unloading will put us back at attach (creating a infinite loop).
  describe('interrupt after', () => {
    /**
     * Given the name of a state, tell the player to load content but unload
     * when it reaches |state|. The load should be interrupted and the player
     * should return to the unloaded state.
     *
     * @param {string} state
     * @return {!Promise}
     */
    async function testInterruptAfter(state) {
      createPlayer(/* attachedTo= */ null);

      let pendingUnload;
      whenEnteringState(state, () => {
        pendingUnload = player.unload();
      });

      // We attach manually so that we had time to override the state change
      // spy's action.
      await player.attach(video);
      await rejected(player.load('test:sintel'));

      // By the time that |player.load| failed, we should have started
      // |player.unload|.
      expect(pendingUnload).toBeTruthy();
      await pendingUnload;
    }

    it('media source', async () => {
      await testInterruptAfter('media-source');
    });

    it('manifest-parser', async () => {
      await testInterruptAfter('manifest-parser');
    });

    it('manifest', async () => {
      await testInterruptAfter('manifest');
    });

    it('drm-engine', async () => {
      await testInterruptAfter('drm-engine');
    });
  });

  describe('error handling', () => {
    beforeEach(() => {
      createPlayer(/* attachedTo= */ null);
    });

    it('returns to attach after load error', async () => {
      // The easiest way we can inject an error is to fail fetching the
      // manifest. To do this, we force the network request by throwing an error
      // in a request filter. The specific error does not matter.
      const networkingEngine = player.getNetworkingEngine();
      expect(networkingEngine).toBeTruthy();
      networkingEngine.registerRequestFilter(() => {
        throw new shaka.util.Error(
            shaka.util.Error.Severity.CRITICAL,
            shaka.util.Error.Category.NETWORK,
            shaka.util.Error.Code.REQUEST_FILTER_ERROR);
      });

      /** @type {jasmine.Spy} */
      const idleSpy = jasmine.createSpy('idle state');
      player.addEventListener('onstateidle', shaka.test.Util.spyFunc(idleSpy));

      // Make the two requests one-after-another so that we don't have any idle
      // time between them.
      const attachRequest = player.attach(video);
      const loadRequest = player.load('test:sintel');

      await attachRequest;
      await rejected(loadRequest);

      // Wait a couple interrupter cycles to allow the player to enter idle
      // state.
      const event = await new Promise((resolve) => {
        idleSpy.and.callFake(resolve);
      });

      // Since attached and loaded in the same interrupter cycle, there won't be
      // any idle time until we finish failing to load. We expect to idle in
      // attach.
      expect(event.state).toBe('attach');
    });
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

  /**
   * Overwrite our |stateChangeSpy| so that it will do |doThis| when we
   * enter |state|. |doThis| will be executed synchronously to ensure that
   * it is done before the walker does its next action.
   *
   * @param {string} state
   * @param {function()} doThis
   */
  function whenEnteringState(state, doThis) {
    stateChangeSpy.and.callFake((event) => {
      if (event.state == state) {
        doThis();
      }
    });
  }
});
