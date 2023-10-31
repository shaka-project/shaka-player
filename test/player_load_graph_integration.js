/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player Load Graph', () => {
  const SMALL_MP4_CONTENT_URI = '/base/test/test/assets/small.mp4';

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;

  /** @type {!jasmine.Spy} */
  let stateChangeSpy;

  /** @type {?string} */
  let lastStateChange = null;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  beforeEach(() => {
    stateChangeSpy = jasmine.createSpy('stateChange');
    lastStateChange = null;
  });

  function createPlayer() {
    player = new shaka.Player();
    player.addEventListener(
        'onstatechange',
        shaka.test.Util.spyFunc(stateChangeSpy));
    player.addEventListener('onstatechange', (event) => {
      lastStateChange = event['state'];
    });
  }

  // Even though some test will destroy the player, we want to make sure that
  // we don't allow the player to stay attached to the video element.
  afterEach(async () => {
    await player.destroy();
    player.releaseAllMutexes();
  });

  it('attach + initializeMediaSource=true will initialize media source',
      async () => {
        createPlayer();

        expect(video.src).toBeFalsy();
        await player.attach(video, /* initializeMediaSource= */ true);
        expect(video.src).toBeTruthy();
      });

  it('attach + initializeMediaSource=false will not intialize media source',
      async () => {
        createPlayer();

        expect(video.src).toBeFalsy();
        await player.attach(video, /* initializeMediaSource= */ false);
        expect(video.src).toBeFalsy();
      });

  it('unload + initializeMediaSource=false does not initialize media source',
      async () => {
        createPlayer();

        await player.attach(video);
        await player.load('test:sintel');

        await player.unload(/* initializeMediaSource= */ false);
        expect(video.src).toBeFalsy();
      });

  it('unload + initializeMediaSource=true initializes media source',
      async () => {
        createPlayer();

        await player.attach(video);
        await player.load('test:sintel');

        await player.unload(/* initializeMediaSource= */ true);
        expect(video.src).toBeTruthy();
      });

  it('load and unload can be called multiple times', async () => {
    createPlayer();

    await player.attach(video);

    await player.load('test:sintel');
    await player.unload();

    await player.load('test:sintel');
    await player.unload();

    expect(getVisitedStates()).toEqual([
      'attach',
      'media-source',

      // Load and unload 1
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',
      'unload',
      'media-source',

      // Load and unload 2
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',
      'unload',
      'media-source',
    ]);
  });

  it('load can be called multiple times', async () => {
    createPlayer();

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
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',

      // Load 3
      'unload',
      'media-source',
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',
    ]);
  });

  it('load will interrupt load', async () => {
    createPlayer();

    await player.attach(video);

    const load1 = player.load('test:sintel');
    const load2 = player.load('test:sintel');

    // Load 1 should have been interrupted because of load 2.
    await expectAsync(load1).toBeRejected();
    // Load 2 should finish with no issues.
    await load2;
  });

  it('destroy will interrupt load', async () => {
    createPlayer();

    await player.attach(video);

    const load = player.load('test:sintel');
    const destroy = player.destroy();

    await expectAsync(load).toBeRejected();
    await destroy;

    // We should never have gotten into the loaded state.
    expect(getVisitedStates()).not.toContain('load');
  });

  // When |destroy| is called, the player should move through the unload state
  // on its way to the detached state.
  it('destroy will unload and then detach', async () => {
    createPlayer();

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
    createPlayer();

    await player.attach(video);

    await player.load('test:sintel');
    await player.unload();
    await player.unload();

    expect(getVisitedStates()).toEqual([
      // |player.attach|
      'attach',
      'media-source',

      // |player.load|
      'manifest-parser',
      'manifest',
      'drm-engine',
      'load',

      // |player.unload| (first call)
      'unload',
      'media-source',

      // |player.unload| (second call)
      'unload',
      'media-source',
    ]);
  });

  // When we destroy, it will allow a current unload operation to occur even
  // though we are going to unload and detach as part of |destroy|.
  it('destroy will not interrupt unload', async () => {
    createPlayer();

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
    createPlayer();

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
        createPlayer();

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
      createPlayer();

      let pendingUnload;
      whenEnteringState(state, () => {
        pendingUnload = player.unload(/* initMediaSource= */ false);
      });

      // We attach manually so that we had time to override the state change
      // spy's action.
      await player.attach(video);
      await expectAsync(player.load('test:sintel')).toBeRejected();

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
      createPlayer();
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

      // Make the two requests one-after-another so that we don't have any idle
      // time between them.
      const attachRequest = player.attach(video);
      const loadRequest = player.load('test:sintel');

      await attachRequest;
      await expectAsync(loadRequest).toBeRejected();

      // Wait a couple interrupter cycles to allow the player to enter idle
      // state.
      await shaka.test.Util.delay(/* seconds= */ 0.25);

      // Since attached and loaded in the same interrupter cycle, there won't be
      // any idle time until we finish failing to load. We expect to idle in
      // attach.
      expect(lastStateChange).toBe('unload');
    });
  });

  // Some platforms will not have media source support, so we want to make sure
  // that the player will behave as expected when media source is missing.
  describe('without media source', () => {
    let mediaSource;

    beforeEach(async () => {
      // Remove our media source support. In order to remove it, we need to set
      // it via [] notation or else closure will stop us.
      mediaSource = window.MediaSource;
      window['MediaSource'] = undefined;

      createPlayer();
      await shaka.test.Util.delay(/* seconds= */ 0.25);
    });

    afterEach(() => {
      // Restore our media source support to what it was before. If we did not
      // have support before, this will do nothing.
      window['MediaSource'] = mediaSource;
    });

    it('attaching ignores init media source flag', async () => {
      // Normally the player would initialize media source after attaching to
      // the media element, however since we don't support media source, it
      // should stop at the attach state.
      player.attach(video, /* initMediaSource= */ true);

      await shaka.test.Util.delay(/* seconds= */ 0.25);
      expect(lastStateChange).toBe('attach');
    });

    it('loading ignores media source path', async () => {
      await player.attach(video, /* initMediaSource= */ false);

      // Normally the player would load content like this with the media source
      // path, but since we don't have media source support, it should use the
      // src= path.
      player.load(SMALL_MP4_CONTENT_URI);

      await shaka.test.Util.delay(/* seconds= */ 0.25);
      expect(lastStateChange).toBe('src-equals');
    });

    it('unloading ignores init media source flag', async () => {
      await player.attach(video, /* initMediaSource= */ false);
      await player.load(SMALL_MP4_CONTENT_URI);

      // Normally the player would try to go to the media source state because
      // we are saying to initialize media source after unloading, but since we
      // don't have media source, it should stop at the attach state.
      player.unload(/* initMediaSource= */ true);

      await shaka.test.Util.delay(/* seconds= */ 0.25);
      expect(lastStateChange).toBe('unload');
    });
  });

  // We want to make sure that we can move from any state to any of our
  // destination states. This means moving to a state (directly or indirectly)
  // and then telling it to go to one of our destination states (e.g. attach,
  // load with media source, load with src=).
  describe('routing', () => {
    beforeEach(() => {
      createPlayer();
    });

    it('goes from detach to detach', async () => {
      await startIn('detach');
      await goTo('detach');
    });

    it('goes from detach to attach', async () => {
      await startIn('detach');
      await goTo('attach');
    });

    it('goes from detach to media source', async () => {
      await startIn('detach');
      await goTo('media-source');
    });

    it('goes from attach to detach', async () => {
      await startIn('attach');
      await goTo('detach');
    });

    it('goes from attach to attach', async () => {
      await startIn('attach');
      await goTo('attach');
    });

    it('goes from attach to media source', async () => {
      await startIn('attach');
      await goTo('media-source');
    });

    it('goes from attach to load', async () => {
      await startIn('attach');
      await goTo('load');
    });

    it('goes from attach to src equals', async () => {
      await startIn('attach');
      await goTo('src-equals');
    });

    it('goes from media source to detach', async () => {
      await startIn('media-source');
      await goTo('detach');
    });

    it('goes from media source to attach', async () => {
      await startIn('media-source');
      await goTo('attach');
    });

    it('goes from media source to media source', async () => {
      await startIn('media-source');
      await goTo('media-source', 'attach'); // doesn't remake media source
    });

    it('goes from media source to load', async () => {
      await startIn('media-source');
      await goTo('load');
    });

    it('goes from media source to src equals', async () => {
      await startIn('media-source');
      await goTo('src-equals');
    });

    it('goes from load to detach', async () => {
      await startIn('load');
      await goTo('detach');
    });

    it('goes from load to attach', async () => {
      await startIn('load');
      await goTo('attach');
    });

    it('goes from load to media source', async () => {
      await startIn('load');
      await goTo('media-source', 'attach'); // doesn't remake media source
    });

    it('goes from load to load', async () => {
      await startIn('load');
      await goTo('load');
    });

    it('goes from load to src equals', async () => {
      await startIn('load');
      await goTo('src-equals');
    });

    it('goes from src equals to detach', async () => {
      await startIn('src-equals');
      await goTo('detach');
    });

    it('goes from src equals to attach', async () => {
      await startIn('src-equals');
      await goTo('attach');
    });

    it('goes from src equals to media source', async () => {
      await startIn('src-equals');
      await goTo('media-source');
    });

    it('goes from src equals to load', async () => {
      await startIn('src-equals');
      await goTo('load');
    });

    it('goes from src equals to src equals', async () => {
      await startIn('src-equals');
      await goTo('src-equals');
    });

    it('goes from manifest parser to detach', async () => {
      await passingThrough('manifest-parser', () => {
        return goTo('detach');
      });
    });

    it('goes from manifest parser to attach', async () => {
      await passingThrough('manifest-parser', () => {
        return goTo('attach');
      });
    });

    it('goes from manifest parser to media source', async () => {
      await passingThrough('manifest-parser', () => {
        return goTo('media-source', 'attach'); // doesn't remake media source
      });
    });

    it('goes from manifest parser to load', async () => {
      await passingThrough('manifest-parser', () => {
        return goTo('load');
      });
    });

    it('goes from manifest parser to src equals', async () => {
      await passingThrough('manifest-parser', () => {
        return goTo('src-equals');
      });
    });

    it('goes from manifest to detach', async () => {
      await passingThrough('manifest', () => {
        return goTo('detach');
      });
    });

    it('goes from manifest to attach', async () => {
      await passingThrough('manifest', () => {
        return goTo('attach');
      });
    });

    it('goes from manifest to media source', async () => {
      await passingThrough('manifest', () => {
        return goTo('media-source', 'attach'); // doesn't remake media source
      });
    });

    it('goes from manifest to load', async () => {
      await passingThrough('manifest', () => {
        return goTo('load');
      });
    });

    it('goes from manifest to src equals', async () => {
      await passingThrough('manifest', () => {
        return goTo('src-equals');
      });
    });

    it('goes from drm engine to detach', async () => {
      await passingThrough('drm-engine', () => {
        return goTo('detach');
      });
    });

    it('goes from drm engine to attach', async () => {
      await passingThrough('drm-engine', () => {
        return goTo('attach');
      });
    });

    it('goes from drm engine to media source', async () => {
      await passingThrough('drm-engine', () => {
        return goTo('media-source', 'attach'); // doesn't remake media source
      });
    });

    it('goes from drm engine to load', async () => {
      await passingThrough('drm-engine', () => {
        return goTo('load');
      });
    });

    it('goes from drm engine to src equals', async () => {
      await passingThrough('drm-engine', () => {
        return goTo('src-equals');
      });
    });

    it('goes from unload to detach', async () => {
      await passingThrough('unload', () => {
        return goTo('detach');
      });
    });

    it('goes from unload to attach', async () => {
      await passingThrough('unload', () => {
        return goTo('attach');
      });
    });

    it('goes from unload to media source', async () => {
      await passingThrough('unload', () => {
        return goTo('media-source');
      });
    });

    it('goes from unload to load', async () => {
      await passingThrough('unload', () => {
        return goTo('load');
      });
    });

    it('goes from unload to src equals', async () => {
      await passingThrough('unload', () => {
        return goTo('src-equals');
      });
    });

    /**
     * Put the player into the specific state. This method's purpose is to make
     * it easier to see when the test is assuming the starting state of the
     * player.
     *
     * For states that require the player to be attached to a media element,
     * this will ensure that |attach| is called before making the call to move
     * to the specific state.
     *
     * @param {string} state
     * @return {!Promise}
     */
    async function startIn(state) {
      /** @type {!Map.<string, function():!Promise>} */
      const actions = new Map()
          .set('detach', async () => {
            await player.detach();
          })
          .set('attach', async () => {
            await player.attach(video, /* initMediaSource= */ false);
          })
          .set('media-source', async () => {
            await player.attach(video, /* initMediaSource= */ true);
          })
          .set('load', async () => {
            await player.attach(video, /* initMediaSource= */ true);
            await player.load('test:sintel');
          })
          .set('src-equals', async () => {
            await player.attach(video, /* initMediaSource= */ false);
            await player.load(SMALL_MP4_CONTENT_URI, 0, 'video/mp4');
          });

      const action = actions.get(state);
      expect(action).toBeTruthy();
      await action();
      expect(lastStateChange).toBe(state);
    }

    /**
     * Some states are intermediaries, making it impossible to "start" in them.
     * Instead this method calls |doThis| when we are passing through the state.
     * The goal of this method is to make it possible to test routing when the
     * current route is interrupted to go somewhere.
     *
     * @param {string} state
     * @param {function():!Promise} doThis
     * @return {!Promise}
     */
    async function passingThrough(state, doThis) {
      /** @type {!Set.<string>} */
      const preLoadStates = new Set([
        'manifest-parser',
        'manifest',
        'drm-engine',
      ]);

      /** @type {!Set.<string>} */
      const postLoadStates = new Set([
        'unload',
      ]);

      // Only a subset of the possible states are actually intermediary states.
      const validState = preLoadStates.has(state) || postLoadStates.has(state);
      expect(validState).toBeTruthy();

      // We don't await the last action because it should not finish, however we
      // need to handle the failure or else Jasmine will fail with "Unhandled
      // rejection".
      if (preLoadStates.has(state)) {
        await player.attach(video);
        player.load('test:sintel').catch(() => {});
      } else {
        await player.attach(video);
        await player.load('test:sintel');
        player.unload().catch(() => {});
      }

      return new Promise((resolve, reject) => {
        let called = false;

        whenEnteringState(state, () => {
          // Make sure we don't execute more than once per promise.
          if (called) {
            return;
          }
          called = true;

          // We need to call doThis in-sync with entering the state so that it
          // can start in the same interpreter cycle. If we did not do this, the
          // player could have changed states before |doThis| was called.
          doThis().then(resolve, reject);
        });
      });
    }

    /**
     * Go to a specific state. This does not ensure the current state before
     * starting the state change.
     *
     * @param {string} state
     * @param {string=} expectedState
     * @return {!Promise}
     */
    async function goTo(state, expectedState) {
      /** @type {!Map.<string, function():!Promise>} */
      const actions = new Map()
          .set('detach', () => {
            return player.detach();
          })
          .set('attach', () => {
            return player.attach(video, /* initMediaSource= */ false);
          })
          .set('media-source', () => {
            return player.attach(video, /* initMediaSource= */ true);
          })
          .set('load', () => {
            return player.load('test:sintel');
          })
          .set('src-equals', () => {
            return player.load(SMALL_MP4_CONTENT_URI, 0, 'video/mp4');
          });

      const action = actions.get(state);
      expect(action).toBeTruthy();
      await action();
      expect(lastStateChange).toBe(expectedState || state);
    }
  });

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

  /**
   * Wrap a spy in a promise so that it will resolve when the spy is called.
   *
   * @param {!jasmine.Spy} spy
   * @return {!Promise}
   */
  function spyIsCalled(spy) {
    return new Promise((resolve) => {
      spy.and.callFake(resolve);
    });
  }
});
