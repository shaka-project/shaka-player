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

  // eslint-disable-next-line max-len
  const url = 'https://playready.directtaps.net/smoothstreaming/SSWSS720H264/SuperSpeedway_720.ism/Manifest';

  // eslint-disable-next-line max-len
  const playreadyUrl = 'https://playready.directtaps.net/smoothstreaming/SSWSS720H264/SuperSpeedway_720.ism/Manifest';

  // eslint-disable-next-line max-len
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

    // Make sure we are playing the lowest res available to avoid test flake
    // based on network issues.  Note that disabling ABR and setting a low
    // abr.defaultBandwidthEstimate would not be sufficient, because it
    // would only affect the choice of track on the first period.  When we
    // cross a period boundary, the default bandwidth estimate will no
    // longer be in effect, and AbrManager may choose higher res tracks for
    // the new period.  Using abr.restrictions.maxHeight will let us force
    // AbrManager to the lowest resolution, which is its fallback when these
    // soft restrictions cannot be met.
    player.configure('abr.restrictions.maxHeight', 1);

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

  it('MSS VoD PlayReady', async () => {
    const support = await shaka.media.DrmEngine.probeSupport();
    if (!support['com.microsoft.playready']) {
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
