/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Codec Switching', () => {
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
    player = new compiledShaka.Player(video);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);
  });

  afterEach(async () => {
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  describe('for audio', () => {
    it('can switch codecs', async () => {
      const preferredTextLanguage = 'en';
      player.configure({preferredTextLanguage: preferredTextLanguage});
      player.configure('streaming.mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.RELOAD);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd');
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 5);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 5);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');

      await player.unload();
    });
  });
});
