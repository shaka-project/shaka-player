/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @return {boolean} */
function checkStorageSupport() {
  return shaka.offline.Storage.support();
}

filterDescribe('Storage', checkStorageSupport, () => {
  const Util = shaka.test.Util;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;
  /** @type {shaka.offline.Storage} */
  let storage;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

  async function eraseStorage() {
    /** @type {!shaka.offline.StorageMuxer} */
    const muxer = new shaka.offline.StorageMuxer();

    try {
      await muxer.erase();
    } finally {
      await muxer.destroy();
    }
  }

  beforeAll(async () => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
  });

  beforeEach(async () => {
    // Make sure we start with a clean slate between each run.
    await eraseStorage();

    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
    player = new compiledShaka.Player();
    storage = new compiledShaka.offline.Storage(player);
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
    await storage.destroy();
    await player.destroy();

    // Make sure we don't leave anything behind.
    await eraseStorage();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  it('supports DASH AES-128 download and playback', async () => {
    const url = '/base/test/test/assets/dash-aes-128/dash.mpd';
    const metadata = {
      'title': 'DASH AES-128',
      'downloaded': new Date(),
    };

    const result = await storage.store(url, metadata).promise;

    await player.load(result.offlineUri);
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 2 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 10);

    await player.unload();
  });

  it('supports HLS AES-256 download and playback', async () => {
    const url = '/base/test/test/assets/hls-aes-256/media.m3u8';
    const metadata = {
      'title': 'HLS AES-256',
      'downloaded': new Date(),
    };

    const result = await storage.store(url, metadata).promise;

    await player.load(result.offlineUri);
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 2 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 10);

    await player.unload();
  });

  drmIt('supports HLS SAMPLE-AES download and playback', async () => {
    if (!checkClearKeySupport()) {
      pending('ClearKey is not supported');
    }
    const url = '/base/test/test/assets/hls-sample-aes/index.m3u8';
    const metadata = {
      'title': 'HLS SAMPLE-AES',
      'downloaded': new Date(),
    };

    const result = await storage.store(url, metadata).promise;

    await player.load(result.offlineUri);
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 2 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 10);

    await player.unload();
  });

  it('supports MSS download and playback', async () => {
    // This tests is flaky in some Chromecast devices, so we need omit it
    // for now.
    if (deviceDetected.getDeviceType() ===
        shaka.device.IDevice.DeviceType.CAST) {
      pending('Disabled on Chromecast.');
    }
    const url = '/base/test/test/assets/mss-clear/Manifest';
    const metadata = {
      'title': 'MSS',
      'downloaded': new Date(),
    };

    const result = await storage.store(
        url, metadata, /* mimeType= */ 'application/vnd.ms-sstr+xml').promise;

    await player.load(result.offlineUri);
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 2 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 10);

    await player.unload();
  });

  it('supports ClearKey with raw single key', async () => {
    if (!checkClearKeySupport()) {
      pending('ClearKey is not supported');
    }

    storage.configure({
      drm: {
        clearKeys: {
          // cspell: disable-next-line
          'nrQFDeRLSAKTLifXUIPiZg': 'FmY0xnWCPCNaSpRG-tUuTQ',
        },
      },
    });

    const url = '/base/test/test/assets/dash-clearkey/dash.mpd';
    const metadata = {
      'title': 'ClearKey with raw single key',
      'downloaded': new Date(),
    };

    const result = await storage.store(url, metadata).promise;

    await player.load(result.offlineUri);
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 2 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 10);

    await player.unload();
  });

  it('supports ClearKey with fake single key', async () => {
    if (!checkClearKeySupport()) {
      pending('ClearKey is not supported');
    }

    storage.configure({
      drm: {
        clearKeys: {
          '0000000000000000000000': '0000000000000000000000',
        },
      },
    });

    const url = '/base/test/test/assets/dash-clearkey/dash.mpd';
    const metadata = {
      'title': 'ClearKey with fake single key',
      'downloaded': new Date(),
    };

    const result = await storage.store(url, metadata).promise;

    player.configure({
      drm: {
        clearKeys: {
          // cspell: disable-next-line
          'nrQFDeRLSAKTLifXUIPiZg': 'FmY0xnWCPCNaSpRG-tUuTQ',
        },
      },
    });

    await player.load(result.offlineUri);
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 2 seconds, but stop early if the video ends.  If it takes
    // longer than 10 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 10);

    await player.unload();
  });
});
