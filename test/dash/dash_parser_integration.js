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

  it('supports ClearKey with raw single key with Web Crypto', async () => {
    if (!checkClearKeySupport()) {
      pending('ClearKey is not supported');
    }
    spyOn(deviceDetected, 'hasWorkingClearKeySupport').and.returnValue(false);

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

  it('support multi type variants', async () => {
    const DeviceType = shaka.device.IDevice.DeviceType;
    if (deviceDetected.getDeviceType() === DeviceType.TV &&
            deviceDetected.getDeviceName() === 'Tizen') {
      pending('Disabled on Tizen.');
    }
    const BrowserEngine = shaka.device.IDevice.BrowserEngine;
    if (deviceDetected.getBrowserEngine() === BrowserEngine.WEBKIT) {
      pending('Disabled on Safari.');
    }
    if (!await Util.isTypeSupported('video/webm; codecs="vp9"')) {
      pending('Codec VP9 is not supported by the platform.');
    }
    await player.load('/base/test/test/assets/dash-multitype-variant/dash.mpd');
    await video.play();
    expect(player.isLive()).toBe(false);

    await waiter.timeoutAfter(30).waitForEnd(video);

    await player.unload();
  });

  it('fires EventStream callback beacons during playback', async () => {
    const netEngine = player.getNetworkingEngine();

    const EventCallbackType =
        compiledShaka.net.NetworkingEngine.RequestType.EVENT_CALLBACK;

    /** @type {?string} */
    let capturedCallbackUrl = null;

    netEngine.registerRequestFilter((type, request) => {
      if (type == EventCallbackType) {
        capturedCallbackUrl = request.uris[0];
        // Redirect to an existing local resource so the request succeeds.
        request.uris =
            ['/base/test/test/assets/dash-svta-2053-2/init.mp4'];
      }
    });

    // The region starts at presentationTime=0, so TimelineRegionEnter may
    // fire synchronously during player.load(). Register the listener first.
    const regionEnterPromise = new Promise((resolve) => {
      eventManager.listenOnce(player, 'timelineregionenter', resolve);
    });

    const streamUri =
        '/base/test/test/assets/dash-event-callback/dash.mpd';

    await player.load(streamUri);
    await video.play();

    // Wait for the enter event (may already be resolved if it fired on load).
    await waiter.timeoutAfter(10).failOnTimeout(true)
        .waitForPromise(regionEnterPromise, 'timelineregionenter');

    expect(capturedCallbackUrl).toBe('https://example.com/beacon/impression');

    await player.unload();
  });
});
