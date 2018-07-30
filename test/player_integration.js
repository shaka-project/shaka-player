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

    /** @type {!shaka.util.PublicPromise} */
    const loaded = new shaka.util.PublicPromise();
    if (getClientArg('uncompiled')) {
      // For debugging purposes, use the uncompiled library.
      compiledShaka = shaka;
      loaded.resolve();
    } else {
      // Load the compiled library as a module.
      // All tests in this suite will use the compiled library.
      require(['/base/dist/shaka-player.compiled.js'], (shakaModule) => {
        compiledShaka = shakaModule;
        compiledShaka.net.NetworkingEngine.registerScheme(
            'test', shaka.test.TestScheme);
        compiledShaka.media.ManifestParser.registerParserByMime(
            'application/x-test-manifest',
            shaka.test.TestScheme.ManifestParser);

        loaded.resolve();
      });
    }

    await loaded;
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

  afterEach(function(done) {
    Promise.all([
      eventManager.destroy(),
      player.destroy()
    ]).then(function() {
      // Work-around: allow the Tizen media pipeline to cool down.
      // Without this, Tizen's pipeline seems to hang in subsequent tests.
      // TODO: file a bug on Tizen
      return Util.delay(0.1);
    }).catch(fail).then(done);
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

    it('sets video.src when video is provided', async function() {
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

    it('sets video.src when initializeMediaSource is true', async function() {
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

    it('resets video.src when reinitializeMediaSource is true',
        async function() {
          await player.load('test:sintel_compiled');
          expect(video.src).toBeTruthy();

          await player.unload(true);
          expect(video.src).toBeTruthy();
        });
  });

  describe('getStats', function() {
    it('gives stats about current stream', function(done) {
      // This is tested more in player_unit.js.  This is here to test the public
      // API and to check for renaming.
      player.load('test:sintel_compiled').then(function() {
        video.play();
        return waitUntilPlayheadReaches(video, 1, 10);
      }).then(function() {
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
            bandwidth: 0
          }]),

          stateHistory: jasmine.arrayContaining([{
            state: 'playing',
            timestamp: jasmine.any(Number),
            duration: jasmine.any(Number)
          }])
        };
        expect(stats).toEqual(expected);
      }).catch(fail).then(done);
    });
  });

  describe('setTextTrackVisibility', function() {
    // Using mode='disabled' on TextTrack causes cues to go null, which leads
    // to a crash in TextEngine.  This validates that we do not trigger this
    // behavior when changing visibility of text.
    it('does not cause cues to be null', function(done) {
      player.load('test:sintel_compiled').then(function() {
        video.play();
        return waitUntilPlayheadReaches(video, 1, 10);
      }).then(function() {
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
      }).catch(fail).then(done);
    });
  });

  describe('plays', function() {
    it('with external text tracks', function(done) {
      player.load('test:sintel_no_text_compiled').then(function() {
        // For some reason, using path-absolute URLs (i.e. without the hostname)
        // like this doesn't work on Safari.  So manually resolve the URL.
        let locationUri = new goog.Uri(location.href);
        let partialUri = new goog.Uri('/base/test/test/assets/text-clip.vtt');
        let absoluteUri = locationUri.resolve(partialUri);
        player.addTextTrack(absoluteUri.toString(), 'en', 'subtitles',
                            'text/vtt');

        video.play();
        return Util.delay(5);
      }).then(function() {
        let textTracks = player.getTextTracks();
        expect(textTracks).toBeTruthy();
        expect(textTracks.length).toBe(1);

        expect(textTracks[0].active).toBe(true);
        expect(textTracks[0].language).toEqual('en');
      }).catch(fail).then(done);
    });

    it('while changing languages with short Periods', function(done) {
      // See: https://github.com/google/shaka-player/issues/797
      player.configure({preferredAudioLanguage: 'en'});
      player.load('test:sintel_short_periods_compiled').then(function() {
        video.play();
        return waitUntilPlayheadReaches(video, 8, 30);
      }).then(function() {
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
        return waitUntilPlayheadReaches(video, 21, 30);
      }).then(function() {
        // Should have gotten past the next Period transition and still be
        // playing the new language.
        expect(getActiveLanguage()).toBe('es');
      }).catch(fail).then(done);
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

    it('unload prevents further manifest load retries', function(done) {
      testTemplate(function() { return player.unload(); }).then(done);
    });

    it('destroy prevents further manifest load retries', function(done) {
      testTemplate(function() { return player.destroy(); }).then(done);
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
        setTextVisibility: jasmine.createSpy('setTextVisibility')
      };

      textDisplayer.destroy.and.returnValue(Promise.resolve());
      textDisplayer.isTextVisible.and.returnValue(true);

      player.configure({
        textDisplayFactory: function() { return textDisplayer; }
      });

      // Make sure the configuration was taken.
      let configuredFactory = player.getConfiguration().textDisplayFactory;
      let configuredTextDisplayer = new configuredFactory();
      expect(configuredTextDisplayer).toBe(textDisplayer);
    });

    // Regression test for https://github.com/google/shaka-player/issues/1187
    it('does not throw on destroy', function(done) {
      player.load('test:sintel_compiled').then(function() {
        video.play();
        return waitUntilPlayheadReaches(video, 1, 10);
      }).then(function() {
        return player.unload();
      }).then(function() {
        // Before we fixed #1187, the call to destroy() on textDisplayer was
        // renamed in the compiled version and could not be called.
        expect(textDisplayer.destroy).toHaveBeenCalled();
      }).catch(fail).then(done);
    });
  });

  describe('TextAndRoles', function() {
    // Regression Test. Makes sure that the language and role fields have been
    // properly exported from the player.
    it('exports language and roles fields', function(done) {
      player.load('test:sintel_compiled').then(() => {
        let languagesAndRoles = player.getTextLanguagesAndRoles();
        expect(languagesAndRoles.length).toBeTruthy();
        languagesAndRoles.forEach((languageAndRole) => {
          expect(languageAndRole.language).not.toBeUndefined();
          expect(languageAndRole.role).not.toBeUndefined();
        });
      }).catch(fail).then(done);
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
