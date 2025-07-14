/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player Load Graph', () => {
  const SMALL_MP4_CONTENT_URI = '/base/test/test/assets/small.mp4';

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!HTMLVideoElement} */
  let video2;
  /** @type {shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  /** @type {!jasmine.Spy} */
  let stateChangeSpy;

  /** @type {?string} */
  let lastStateChange = null;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    video2 = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video2);
  });

  afterAll(() => {
    document.body.removeChild(video);
    document.body.removeChild(video2);
  });

  beforeEach(() => {
    stateChangeSpy = jasmine.createSpy('stateChange');
    lastStateChange = null;
  });

  function createPlayer() {
    eventManager = new shaka.util.EventManager();
    player = new shaka.Player();
    eventManager.listen(player, 'onstatechange',
        shaka.test.Util.spyFunc(stateChangeSpy));
    eventManager.listen(player, 'onstatechange', (event) => {
      lastStateChange = event['state'];
    });
  }

  // Even though some test will destroy the player, we want to make sure that
  // we don't allow the player to stay attached to the video element.
  afterEach(async () => {
    eventManager.release();

    await player.destroy();
    player.releaseAllMutexes();
  });

  // We want to make sure that we can move from any state to any of our
  // destination states. This means moving to a state (directly or indirectly)
  // and then telling it to go to one of our destination states (e.g. attach,
  // load with media source, load with src=).
  describe('routing', () => {
    beforeEach(() => {
      createPlayer();
    });

    afterEach(async () => {
      eventManager.release();

      await player.destroy();
      player.releaseAllMutexes();
    });

    // it('goes from detach to detach', async () => {
    //   await startIn('detach');
    //   await goTo('detach');
    // });

    // it('goes from detach to attach', async () => {
    //   await startIn('detach');
    //   await goTo('attach');
    // });

    // it('goes from detach to media source', async () => {
    //   await startIn('detach');
    //   await goTo('media-source');
    // });

    // it('goes from attach to detach', async () => {
    //   await startIn('attach');
    //   await goTo('detach');
    // });

    // it('goes from attach to attach', async () => {
    //   await startIn('attach');
    //   await goTo('attach');
    // });

    // it('goes from attach to media source', async () => {
    //   await startIn('attach');
    //   await goTo('media-source');
    // });

    // it('goes from attach to load', async () => {
    //   await startIn('attach');
    //   await goTo('load');
    // });

    // it('goes from attach to src equals', async () => {
    //   await startIn('attach');
    //   await goTo('src-equals');
    // });

    // it('goes from media source to detach', async () => {
    //   await startIn('media-source');
    //   await goTo('detach');
    // });

    // it('goes from media source to attach', async () => {
    //   await startIn('media-source');
    //   await goTo('attach', video2);
    // });

    // it('goes from media source to media source', async () => {
    //   await startIn('media-source');
    //   await goTo('media-source', video2);
    // });

    // it('goes from media source to load', async () => {
    //   await startIn('media-source');
    //   await goTo('load');
    // });

    // it('goes from media source to src equals', async () => {
    //   await startIn('media-source');
    //   await goTo('src-equals');
    // });

    // it('goes from load to detach', async () => {
    //   await startIn('load');
    //   await goTo('detach');
    // });

    // it('goes from load to attach', async () => {
    //   await startIn('load');
    //   await goTo('attach', video2);
    // });

    // it('goes from load to media source', async () => {
    //   await startIn('load');
    //   await goTo('media-source', video2);
    // });

    // it('goes from load to load', async () => {
    //   await startIn('load');
    //   await goTo('load');
    // });

    // it('goes from load to src equals', async () => {
    //   await startIn('load');
    //   await goTo('src-equals');
    // });

    // it('goes from src equals to detach', async () => {
    //   await startIn('src-equals');
    //   await goTo('detach');
    // });

    // it('goes from src equals to attach', async () => {
    //   await startIn('src-equals');
    //   await goTo('attach', video2);
    // });

    // it('goes from src equals to media source', async () => {
    //   await startIn('src-equals');
    //   await goTo('media-source');
    // });

    // it('goes from src equals to load', async () => {
    //   await startIn('src-equals');
    //   await goTo('load');
    // });

    // it('goes from src equals to src equals', async () => {
    //   await startIn('src-equals');
    //   await goTo('src-equals');
    // });

    // it('goes from manifest parser to detach', async () => {
    //   await passingThrough('manifest-parser', () => {
    //     return goTo('detach');
    //   });
    // });

    // it('goes from manifest parser to attach', async () => {
    //   await passingThrough('manifest-parser', () => {
    //     return goTo('attach', video2);
    //   });
    // });

    // it('goes from manifest parser to media source', async () => {
    //   await passingThrough('manifest-parser', () => {
    //     return goTo('media-source', video2);
    //   });
    // });

    // it('goes from manifest parser to load', async () => {
    //   await passingThrough('manifest-parser', () => {
    //     return goTo('load');
    //   });
    // });

    // it('goes from manifest parser to src equals', async () => {
    //   await passingThrough('manifest-parser', () => {
    //     return goTo('src-equals');
    //   });
    // });

    // it('goes from manifest to detach', async () => {
    //   await passingThrough('manifest', () => {
    //     return goTo('detach');
    //   });
    // });

    // it('goes from manifest to attach', async () => {
    //   await passingThrough('manifest', () => {
    //     return goTo('attach', video2);
    //   });
    // });

    // it('goes from manifest to media source', async () => {
    //   await passingThrough('manifest', () => {
    //     return goTo('media-source', video2);
    //   });
    // });

    // it('goes from manifest to load', async () => {
    //   await passingThrough('manifest', () => {
    //     return goTo('load');
    //   });
    // });

    // it('goes from manifest to src equals', async () => {
    //   await passingThrough('manifest', () => {
    //     return goTo('src-equals');
    //   });
    // });

    it('goes from drm engine to detach', async () => {
      await passingThrough('drm-engine', () => {
        return goTo('detach');
      });
    });

    it('goes from drm engine to attach', async () => {
      await passingThrough('drm-engine', () => {
        return goTo('attach', video2);
      });
    });

    it('goes from drm engine to media source', async () => {
      await passingThrough('drm-engine', () => {
        return goTo('media-source', video2);
      });
    });

    // it('goes from drm engine to load', async () => {
    //   await passingThrough('drm-engine', () => {
    //     return goTo('load');
    //   });
    // });

    // it('goes from drm engine to src equals', async () => {
    //   await passingThrough('drm-engine', () => {
    //     return goTo('src-equals');
    //   });
    // });

    // it('goes from unload to detach', async () => {
    //   await passingThrough('unload', () => {
    //     return goTo('detach');
    //   });
    // });

    // it('goes from unload to attach', async () => {
    //   await passingThrough('unload', () => {
    //     return goTo('attach', video2);
    //   });
    // });

    // it('goes from unload to media source', async () => {
    //   await passingThrough('unload', () => {
    //     return goTo('media-source');
    //   });
    // });

    // it('goes from unload to load', async () => {
    //   await passingThrough('unload', () => {
    //     return goTo('load');
    //   });
    // });

    // it('goes from unload to src equals', async () => {
    //   await passingThrough('unload', () => {
    //     return goTo('src-equals');
    //   });
    // });

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
      /** @type {!Map<string, function(): !Promise>} */
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
      /** @type {!Set<string>} */
      const preLoadStates = new Set([
        'manifest-parser',
        'manifest',
        'drm-engine',
        // Excludes 'unload'.
      ]);

      /** @type {!Set<string>} */
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
        goog.asserts.assert(state == 'unload', 'Unrecognized testing state!');
        await player.attach(video);
        await player.load('test:sintel');
        player.unload().catch(() => {});
      }

      console.log('state', state);

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
     * @param {HTMLVideoElement=} videoToUse
     * @return {!Promise}
     */
    async function goTo(state, videoToUse = video) {
      /** @type {!Map<string, function(): !Promise>} */
      const actions = new Map()
          .set('detach', () => {
            return player.detach();
          })
          .set('attach', () => {
            return player.attach(
                videoToUse || video, /* initMediaSource= */ false);
          })
          .set('media-source', () => {
            return player.attach(
                videoToUse || video, /* initMediaSource= */ true);
          })
          .set('load', () => {
            return player.load('test:sintel');
          })
          .set('src-equals', () => {
            return player.load(SMALL_MP4_CONTENT_URI, 0, 'video/mp4');
          });

      console.log('goTo', state);

      const action = actions.get(state);
      expect(action).toBeTruthy();
      await action();
      expect(lastStateChange).toBe(state);
    }
  });

  /**
   * Get a list of all the states that the walker went through after
   * |beforeEach| finished.
   *
   * @return {!Array<string>}
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
