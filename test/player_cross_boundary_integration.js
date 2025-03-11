/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Player Cross Boundary', () => {
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {shaka.test.Waiter} */
  let waiter;

  let compiledShaka;

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

    eventManager.listen(player, 'error', fail);
  });

  afterEach(async () => {
    await player.unload();
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  describe('reset', () => {
    const MULTI_PERIOD_ASSET_URI_ =
      '/base/test/test/assets/clear-encrypted/manifest.mpd';

    beforeEach(() => {
      player.configure({
        streaming: {
          crossBoundaryStrategy: shaka.config.CrossBoundaryStrategy.RESET,
        },
        drm: {
          servers: {
            'com.widevine.alpha': 'https://cwip-shaka-proxy.appspot.com/no_auth',
            'com.microsoft.playready': 'http://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:51745386-2d42-56fd-8bad-4f58422004d7,contentkey:UXRThi1CVv2LrU9YQiAE1w==),(kid:26470f42-96d4-5d04-a9ba-bb442e169800,contentkey:JkcPQpbUXQSpurtELhaYAA==)',
          },
        },
      });

      // PlayReady on Chromecast is deprecated, so we prefer to use the DRM
      // that is officially supported.
      if (shaka.util.Platform.isChromecast()) {
        player.configure({
          drm: {
            preferredKeySystems: ['com.widevine.alpha'],
          },
        });
      }
    });

    drmIt('should reset MSE when crossing a boundary', async () => {
      if (!shakaSupport.drm['com.widevine.alpha'] &&
          !shakaSupport.drm['com.microsoft.playready']) {
        pending('Needed DRM is not supported on this platform');
      }

      await player.load(MULTI_PERIOD_ASSET_URI_);
      await video.play();

      await waiter.timeoutAfter(20).waitForEvent(player, 'boundarycrossed');

      expect(video.readyState).toBe(0);

      await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */ 10);
    });

    drmIt('should buffer no further than boundary', async () => {
      if (!shakaSupport.drm['com.widevine.alpha'] &&
          !shakaSupport.drm['com.microsoft.playready']) {
        pending('Needed DRM is not supported on this platform');
      }

      await player.load(MULTI_PERIOD_ASSET_URI_);
      await video.play();

      await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */ 10);

      video.pause();

      // Wait to ensure we buffered to the end of the boundary. The asset is
      // small enough that this is a safe assumption.
      await shaka.test.Util.delay(1);

      const end = player.getBufferedInfo().total[0].end;
      expect(end).toBeLessThanOrEqual(8);
    });

    drmIt('should skip MSE reset from encrypted boundary', async () => {
      if (!shakaSupport.drm['com.widevine.alpha'] &&
          !shakaSupport.drm['com.microsoft.playready']) {
        pending('Needed DRM is not supported on this platform');
      }

      player.configure({
        streaming: {
          crossBoundaryStrategy:
            shaka.config.CrossBoundaryStrategy.RESET_TO_ENCRYPTED,
        },
      });
      await player.load(MULTI_PERIOD_ASSET_URI_);
      await video.play();

      // The boundary is at 8 (from plain to encrypted period), we'll wait
      // until we crossed it.
      await waiter.timeoutAfter(20).waitUntilPlayheadReaches(video, 10);

      video.currentTime = 1;

      // When we seek back and we still have a readyState > 0, we did not
      // reset MSE.
      expect(video.readyState).toBeGreaterThan(0);
    });
  });
});
