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

      // This load may be interrupted, so ignore errors and don't wait.
      const loadPromise =
          player.load('test:sintel-enc_compiled').catch(() => {});

      await errorPromise;
      expect(unloadPromise).not.toBeNull();

      if (unloadPromise) {
        await unloadPromise;
      }

      // This should be done, and errors ignored.  But don't leave any Promise
      // unresolved.
      await loadPromise;
    });
  });  // describe('unloading')
});
