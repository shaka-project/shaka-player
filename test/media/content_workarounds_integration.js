/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('ContentWorkarounds', () => {
  const Util = shaka.test.Util;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

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

    player.configure('streaming.crossBoundaryStrategy',
        shaka.config.CrossBoundaryStrategy.KEEP);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => fail(event.detail));
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    await player.unload();
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  // Check that fakeEC3 workaround is applied on the platforms where it is
  // needed.
  it('supports AC-3 if platform supports it', async () => {
    if (!await Util.isTypeSupported('audio/mp4; codecs="ac-3"')) {
      pending('Codec AC-3 is not supported by the platform.');
    }
    await player.load('/base/test/test/assets/dash-audio-ac3/dash.mpd');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 5 seconds, but stop early if the video ends.  If it takes
    // longer than 30 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 30);
  });

  for (const keySystem of ['com.widevine.alpha', 'com.microsoft.playready']) {
    drmIt(`plays mixed clear encrypted content with ${keySystem}`, async () => {
      if (!shakaSupport.drm[keySystem]) {
        pending('Needed DRM is not supported on this platform');
      }
      if (shaka.util.Platform.isTizen3()) {
        pending('Tizen 3 currently does not support mixed clear ' +
            'encrypted content');
      }
      const keyStatusSpy = jasmine.createSpy('onKeyStatus');
      eventManager.listen(player, 'keystatuschanged',
          Util.spyFunc(keyStatusSpy));

      const licenseUrl = keySystem == 'com.widevine.alpha' ?
          'https://cwip-shaka-proxy.appspot.com/no_auth' :
          'http://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:51745386-2d42-56fd-8bad-4f58422004d7,contentkey:UXRThi1CVv2LrU9YQiAE1w==),(kid:26470f42-96d4-5d04-a9ba-bb442e169800,contentkey:JkcPQpbUXQSpurtELhaYAA==)';
      player.configure({
        drm: {
          servers: {
            [keySystem]: licenseUrl,
          },
        },
      });
      await player.load('/base/test/test/assets/clear-encrypted/manifest.mpd');
      await video.play();

      // Wait for the video to start playback.  If it takes longer than 10
      // seconds, fail the test.
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      // Play for 5 seconds, but stop early if the video ends.  If it takes
      // longer than 30 seconds, fail the test.
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 30);

      // Check did we have key status change.
      expect(keyStatusSpy).toHaveBeenCalled();
    });
  }
});
