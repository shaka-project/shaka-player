/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('DashParser', () => {
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

  it('supports AES-128 streaming', async () => {
    await player.load('/base/test/test/assets/dash-aes-128/dash.mpd');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 5 seconds, but stop early if the video ends.  If it takes
    // longer than 30 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 5, 30);

    await player.unload();
  });

  it('supports ClearKey with raw single key', async () => {
    if (!checkClearKeySupport()) {
      pending('ClearKey is not supported');
    }

    player.configure({
      drm: {
        clearKeys: {
          // cspell: disable
          // eslint-disable-next-line @stylistic/max-len
          '4060a865887842679cbf91ae5bae1e72': 'fc35340837310cc0fb53de97e22a69e0',
          // cspell: enable
        },
      },
    });
    await player.load('/base/test/test/assets/dash-clearkey/dash.mpd');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 8 seconds, but stop early if the video ends.  If it takes
    // longer than 30 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 8, 30);

    await player.unload();
  });

  it('does not request segments past @endNumber', async () => {
    const netEngine = player.getNetworkingEngine();
    const SegmentType =
        compiledShaka.net.NetworkingEngine.RequestType.SEGMENT;

    /** @type {!Array<string>} */
    const requestedUris = [];
    netEngine.registerRequestFilter((type, request) => {
      if (type == SegmentType) {
        requestedUris.push(request.uris[0]);
      }
    });

    await player.load('/base/test/test/assets/clear-encrypted/end-number.mpd');
    await video.play();
    await waiter.timeoutAfter(30).failOnTimeout(true).waitForEnd(video);

    expect(video.ended).toBe(true);
    expect(requestedUris.some((uri) => uri.includes('-s2.mp4'))).toBe(true);
    expect(requestedUris.some((uri) => uri.includes('-s3.mp4'))).toBe(false);

    await player.unload();
  });
});
