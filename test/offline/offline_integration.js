/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** @return {boolean} */
const supportsStorage = () => shaka.offline.Storage.support();

// TODO: Merge with storage_integration.js.  No obvious difference in purpose.
filterDescribe('Offline', supportsStorage, () => {
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.offline.Storage} */
  let storage;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.util.EventManager} */
  let eventManager;
  /** @type {shaka.test.Waiter} */
  let waiter;

  beforeAll(() => {
    video = shaka.test.UiUtils.createVideoElement();
    document.body.appendChild(video);
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  beforeEach(async () => {
    player = new shaka.Player();
    await player.attach(video);
    player.addEventListener('error', fail);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    // Make sure we are starting with a blank slate.
    await shaka.offline.Storage.deleteAll();
    storage = new shaka.offline.Storage(player);
  });

  afterEach(async () => {
    eventManager.release();

    if (storage) {
      await storage.destroy();
    }

    // Make sure we don't leave anything in storage after the test.
    await shaka.offline.Storage.deleteAll();

    if (player) {
      await player.destroy();
    }
  });

  it('stores, plays, and deletes clear content', async () => {
    const content = await storage.store('test:sintel').promise;
    expect(content).toBeTruthy();

    const contentUri = content.offlineUri;
    goog.asserts.assert(
        contentUri != null, 'Stored content should have an offline uri.');

    await player.load(contentUri);

    await video.play();
    await playTo(/* end= */ 3, /* timeout= */ 20);
    await player.unload();
    await storage.remove(contentUri);
  });

  // TODO: Add a PlayReady version once Edge supports offline.
  drmIt(
      'stores, plays, and deletes protected content with a persistent license',
      async () => {
        const support = await shaka.Player.probeSupport();
        const widevineSupport = support.drm['com.widevine.alpha'];

        if (!widevineSupport || !widevineSupport.persistentState) {
          pending('Widevine persistent licenses are not supported');
          return;
        }

        shaka.test.TestScheme.setupPlayer(player, 'sintel-enc');

        storage.configure('offline.usePersistentLicense', true);
        const content = await storage.store('test:sintel-enc').promise;

        // Work around http://crbug.com/887535 in which load cannot happen right
        // after close.  Experimentally, we seem to need a ~1s delay, so we're
        // using a 3s delay to ensure it doesn't flake.  Without this, we get
        // error 6005 (FAILED_TO_CREATE_SESSION) with system code 70.
        // TODO: Remove when Chrome is fixed
        await shaka.test.Util.delay(3);

        const contentUri = content.offlineUri;
        goog.asserts.assert(
            contentUri, 'Stored content should have an offline uri.');

        await player.load(contentUri);

        await video.play();
        await playTo(/* end= */ 3, /* timeout= */ 20);
        await player.unload();
        await storage.remove(contentUri);
      });

  drmIt(
      'stores, plays, and deletes protected content with a temporary license',
      async () => {
        const support = await shaka.Player.probeSupport();
        const widevineSupport = support.drm['com.widevine.alpha'];
        const playreadySupport = support.drm['com.microsoft.playready'];

        if (!(widevineSupport || playreadySupport)) {
          pending('Widevine and PlayReady are not supported');
          return;
        }

        if (shaka.util.Platform.isXboxOne()) {
          // Axinom won't issue a license for an Xbox One.  The error message
          // from the license server says "Your DRM client's security level is
          // 150, but the entitlement message requires 2000 or higher."
          // TODO: Stop using Axinom's license server.  Use
          // https://testweb.playready.microsoft.com/Server/ServiceQueryStringSyntax
          pending('Xbox One not supported by Axinom license server');
          return;
        }

        // Because we do not need a persistent license, we also do not need init
        // data in the manifest.  Using this covers issue #1159, where we used
        // to throw an error inappropriately.
        shaka.test.TestScheme.setupPlayer(player, 'multidrm_no_init_data');

        storage.configure('offline.usePersistentLicense', false);
        const content =
            await storage.store('test:multidrm_no_init_data').promise;

        const contentUri = content.offlineUri;
        goog.asserts.assert(
            contentUri, 'Stored content should have an offline uri.');

        await player.load(contentUri);

        await video.play();
        await playTo(/* end= */ 3, /* timeout= */ 20);
        await player.unload();
        await storage.remove(contentUri);
      });

  /**
   * @param {number} endSeconds
   * @param {number} timeoutSeconds
   * @return {!Promise}
   */
  async function playTo(endSeconds, timeoutSeconds) {
    await waiter.waitUntilPlayheadReachesOrFailOnTimeout(
        video, endSeconds, timeoutSeconds);
  }
});
