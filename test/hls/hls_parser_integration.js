/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * For unknown reasons, these tests fail in the test labs for Edge on Windows,
 * in ways that do not seem to be unrelated to HLS parser.
 * Practical testing has not found any sign that playback is actually broken in
 * Edge, so these tests are disabled on Edge for the time being.
 * TODO(#5834): Remove this filter once the tests are fixed.
 * @return {boolean}
 */
function checkNoBrokenEdgeHls() {
  const chromeVersion = shaka.util.Platform.chromeVersion();
  if (shaka.util.Platform.isWindows() && shaka.util.Platform.isEdge() &&
      chromeVersion && chromeVersion <= 122) {
    // When the tests fail, it's due to the manifest parser failing to find a
    // factory. Attempt to find a factory first, to avoid filtering the tests
    // when running in a non-broken Edge environment.
    const uri = 'fakeuri.m3u8';
    const mimeType = 'application/x-mpegurl';
    /* eslint-disable no-restricted-syntax */
    try {
      shaka.media.ManifestParser.getFactory(uri, mimeType);
      return true;
    } catch (error) {
      return false;
    }
    /* eslint-enable no-restricted-syntax */
  }
  return true;
}

filterDescribe('HlsParser', checkNoBrokenEdgeHls, () => {
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

    player.configure('streaming.useNativeHlsOnSafari', false);

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

  it('supports AES-256 streaming', async () => {
    await player.load('/base/test/test/assets/hls-aes-256/index.m3u8');
    await video.play();
    expect(player.isLive()).toBe(false);

    // Wait for the video to start playback.  If it takes longer than 10
    // seconds, fail the test.
    await waiter.waitForMovementOrFailOnTimeout(video, 10);

    // Play for 10 seconds, but stop early if the video ends.  If it takes
    // longer than 30 seconds, fail the test.
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 30);

    await player.unload();
  });
});
