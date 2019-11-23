/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Offline', () => {
  /** @type {!shaka.Player} */
  let player;
  /** @type {!shaka.offline.Storage} */
  let storage;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  beforeAll(() => {
    video = shaka.util.Dom.createVideoElement();
    document.body.appendChild(video);
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  beforeEach(async () => {
    player = new shaka.Player(video);
    player.addEventListener('error', fail);

    eventManager = new shaka.util.EventManager();

    if (supportsStorage()) {
      // Make sure we are starting with a blank slate.
      await shaka.offline.Storage.deleteAll();
      storage = new shaka.offline.Storage(player);
    }
  });

  afterEach(async () => {
    eventManager.release();

    if (storage) {
      await storage.destroy();
    }

    // Make sure we don't leave anything in storage after the test.
    if (supportsStorage()) {
      await shaka.offline.Storage.deleteAll();
    }

    if (player) {
      await player.destroy();
    }
  });

  it('stores, plays, and deletes clear content', async () => {
    if (!supportsStorage()) {
      pending('Storage is not supported.');
      return;
    }

    const content = await storage.store('test:sintel');
    expect(content).toBeTruthy();

    const contentUri = content.offlineUri;
    goog.asserts.assert(
        contentUri, 'Stored content should have an offline uri.');

    await player.load(content.offlineUri);

    video.play();
    await playTo(/* end= */ 3, /* timeout= */ 10);
    await player.unload();
    await storage.remove(contentUri);
  });

  // TODO: Add a PlayReady version once Edge supports offline.
  drmIt(
      'stores, plays, and deletes protected content with a persistent license',
      async () => {
        if (!supportsStorage()) {
          pending('Storage is not supported on this platform.');
          return;
        }

        const support = await shaka.Player.probeSupport();
        const widevineSupport = support.drm['com.widevine.alpha'];

        if (!widevineSupport || !widevineSupport.persistentState) {
          pending('Widevine persistent licenses are not supported');
          return;
        }

        shaka.test.TestScheme.setupPlayer(player, 'sintel-enc');

        storage.configure({usePersistentLicense: true});
        const content = await storage.store('test:sintel-enc');

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

        video.play();
        await playTo(/* end= */ 3, /* timeout= */ 10);
        await player.unload();
        await storage.remove(contentUri);
      });

  drmIt(
      'stores, plays, and deletes protected content with a temporary license',
      async () => {
        if (!supportsStorage()) {
          pending('Storage is not supported.');
          return;
        }

        const support = await shaka.Player.probeSupport();
        const widevineSupport = support.drm['com.widevine.alpha'];
        const playreadySupport = support.drm['com.microsoft.playready'];

        if (!(widevineSupport || playreadySupport)) {
          pending('Widevine and PlayReady are not supported');
          return;
        }

        // Because we do not need a persistent license, we also do not need init
        // data in the manifest.  Using this covers issue #1159, where we used
        // to throw an error inappropriately.
        shaka.test.TestScheme.setupPlayer(player, 'multidrm_no_init_data');

        storage.configure({usePersistentLicense: false});
        const content = await storage.store('test:multidrm_no_init_data');

        const contentUri = content.offlineUri;
        goog.asserts.assert(
            contentUri, 'Stored content should have an offline uri.');

        await player.load(contentUri);

        video.play();
        await playTo(/* end= */ 3, /* timeout= */ 10);
        await player.unload();
        await storage.remove(contentUri);
      });

  /**
   * @param {number} endSeconds
   * @param {number} timeoutSeconds
   * @return {!Promise}
   */
  async function playTo(endSeconds, timeoutSeconds) {
    await shaka.test.Util.waitUntilPlayheadReaches(
        eventManager, video, endSeconds, timeoutSeconds);
  }

  /** @return {boolean} */
  function supportsStorage() {
    return shaka.offline.Storage.support();
  }
});
