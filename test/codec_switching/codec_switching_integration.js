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
    player = new compiledShaka.Player();
    await player.attach(video);

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

  describe('for audio and only-audio content', () => {
    it('can switch codecs RELOAD', async () => {
      if (!MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        pending('Codec OPUS in WEBM is not supported by the platform.');
      }
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('manifest.disableVideo', true);
      player.configure('streaming.mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.RELOAD);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd', 9);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');

      await player.unload();
    });

    it('can switch codecs SMOOTH', async () => {
      if (!shaka.util.Platform.supportsSmoothCodecSwitching()) {
        pending('Mediasource.ChangeType is not considered ' +
          'reliable on this device');
      }
      if (!MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        pending('Codec OPUS in WEBM is not supported by the platform.');
      }
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('manifest.disableVideo', true);
      player.configure('streaming.mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.SMOOTH);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd', 9);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');

      await player.unload();
    });
  });

  describe('for audio', () => {
    it('can switch codecs RELOAD', async () => {
      if (!MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        pending('Codec OPUS in WEBM is not supported by the platform.');
      }
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('streaming.mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.RELOAD);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd', 9);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');

      await player.unload();
    });

    it('can switch codecs SMOOTH', async () => {
      if (!shaka.util.Platform.supportsSmoothCodecSwitching()) {
        pending('Mediasource.ChangeType is not considered ' +
          'reliable on this device');
      }
      if (!MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        pending('Codec OPUS in WEBM is not supported by the platform.');
      }
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('streaming.mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.SMOOTH);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd', 9);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');

      await player.unload();
    });
  });
});
