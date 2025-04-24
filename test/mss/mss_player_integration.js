/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MSS Player', () => {
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

  const url = '/base/test/test/assets/mss-clear/Manifest';
  const playreadyUrl = '/base/test/test/assets/mss-playready/Manifest';
  const playreadyLicenseUrl = 'https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(persist:false,sl:150)';

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    player = new compiledShaka.Player();
    await player.attach(video);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => fail(event.detail));
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  it('MSS VoD', async () => {
    await player.load(url, /* startTime= */ null,
        /* mimeType= */ 'application/vnd.ms-sstr+xml');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 5 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 10);

    await player.unload();
  });

  drmIt('MSS VoD PlayReady', async () => {
    if (!checkPlayReadySupport()) {
      pending('PlayReady is not supported by the platform.');
    }

    player.configure({
      drm: {
        servers: {
          'com.microsoft.playready': playreadyLicenseUrl,
        },
      },
    });

    await player.load(playreadyUrl, /* startTime= */ null,
        /* mimeType= */ 'application/vnd.ms-sstr+xml');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 5 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 10);

    await player.unload();
  });
});
