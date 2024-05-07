/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('Codec Switching', () => {
  const Util = shaka.test.Util;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.Player} */
  let player;
  /** @type {!shaka.util.EventManager} */
  let eventManager;

  let compiledShaka;

  /** @type {!shaka.test.Waiter} */
  let waiter;

  function isEc3Supported() {
    if (!MediaSource.isTypeSupported('audio/mp4; codecs="ec-3"')) {
      return false;
    }
    // It seems that EC3 on Edge Windows from github actions is not working
    // (in the lab EC3 is working). The EC3 detection is currently hard-coded
    // to true, which leads to a failure in GitHub's environment.
    // We must enable this, once it is resolved:
    // https://bugs.chromium.org/p/chromium/issues/detail?id=1450313
    if (shaka.util.Platform.isWindows() && shaka.util.Platform.isEdge()) {
      return false;
    }
    return true;
  }

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

    // Disable allow MediaSource recoveries, which can interfere with playback
    // tests.
    player.configure('streaming.allowMediaSourceRecoveries', false);

    // Disable stall detection, which can interfere with playback tests.
    player.configure('streaming.stallEnabled', false);

    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);
    waiter.setPlayer(player);

    const onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => fail(event.detail));
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    await player.unload();
    eventManager.release();
    await player.destroy();
  });

  afterAll(() => {
    document.body.removeChild(video);
  });

  describe('for audio and only-audio content aac -> opus', () => {
    it('can switch codecs RELOAD', async () => {
      if (!MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        pending('Codec OPUS in WEBM is not supported by the platform.');
      }

      // English is AAC MP4.
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('manifest.disableVideo', true);
      player.configure('mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.RELOAD);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd', 9);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      // Spanish is Opus WebM.
      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');
    });

    it('can switch codecs SMOOTH', async () => {
      if (!shaka.util.Platform.supportsSmoothCodecSwitching()) {
        pending('Mediasource.ChangeType is not considered ' +
          'reliable on this device');
      }
      if (!MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        pending('Codec OPUS in WEBM is not supported by the platform.');
      }

      // English is AAC MP4.
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('manifest.disableVideo', true);
      player.configure('mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.SMOOTH);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd', 9);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      // Spanish is Opus WebM.
      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');
    });
  });

  describe('for audio opus -> aac', () => {
    it('can switch codecs RELOAD', async () => {
      if (!MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        pending('Codec OPUS in WEBM is not supported by the platform.');
      }

      // English is AAC MP4.
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.RELOAD);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd', 9);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      // Spanish is Opus WebM.
      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');
    });

    it('can switch codecs SMOOTH', async () => {
      if (!shaka.util.Platform.supportsSmoothCodecSwitching()) {
        pending('Mediasource.ChangeType is not considered ' +
          'reliable on this device');
      }
      if (!MediaSource.isTypeSupported('audio/webm; codecs="opus"')) {
        pending('Codec OPUS in WEBM is not supported by the platform.');
      }

      // English is AAC MP4.
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.SMOOTH);

      await player.load('/base/test/test/assets/dash-multi-codec/dash.mpd', 9);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      // Spanish is Opus WebM.
      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 10, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');
    });
  });

  describe('for audio aac -> ec3', () => {
    it('can switch codecs RELOAD', async () => {
      if (!isEc3Supported()) {
        pending('Codec EC3 in MP4 is not supported by the platform.');
      }

      // English is AAC MP4.
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.RELOAD);

      await player.load(
          '/base/test/test/assets/dash-multi-codec-ec3/dash.mpd', 1);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      // Spanish is EC3.
      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');
    });

    it('can switch codecs SMOOTH', async () => {
      if (!shaka.util.Platform.supportsSmoothCodecSwitching()) {
        pending('Mediasource.ChangeType is not considered ' +
          'reliable on this device');
      }
      if (!isEc3Supported()) {
        pending('Codec EC3 in MP4 is not supported by the platform.');
      }

      // English is AAC MP4.
      const preferredAudioLanguage = 'en';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.SMOOTH);

      await player.load(
          '/base/test/test/assets/dash-multi-codec-ec3/dash.mpd', 1);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('en');

      // Spanish is EC3.
      player.selectAudioLanguage('es');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('es');
    });
  });

  describe('for audio ec3 -> aac', () => {
    it('can switch codecs RELOAD', async () => {
      if (!isEc3Supported()) {
        pending('Codec EC3 in MP4 is not supported by the platform.');
      }

      // Spanish is EC3.
      const preferredAudioLanguage = 'es';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.RELOAD);

      await player.load(
          '/base/test/test/assets/dash-multi-codec-ec3/dash.mpd', 1);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('es');

      // English is AAC MP4.
      player.selectAudioLanguage('en');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('en');
    });

    it('can switch codecs SMOOTH', async () => {
      if (!shaka.util.Platform.supportsSmoothCodecSwitching()) {
        pending('Mediasource.ChangeType is not considered ' +
          'reliable on this device');
      }
      if (!isEc3Supported()) {
        pending('Codec EC3 in MP4 is not supported by the platform.');
      }

      // Spanish is EC3.
      const preferredAudioLanguage = 'es';
      player.configure({preferredAudioLanguage: preferredAudioLanguage});
      player.configure('mediaSource.codecSwitchingStrategy',
          shaka.config.CodecSwitchingStrategy.SMOOTH);

      await player.load(
          '/base/test/test/assets/dash-multi-codec-ec3/dash.mpd', 1);
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, 10);

      expect(player.isLive()).toBe(false);

      let variants = player.getVariantTracks();

      expect(variants.length).toBe(2);
      expect(variants.find((v) => !!v.active).language).toBe('es');

      // English is AAC MP4.
      player.selectAudioLanguage('en');
      await waiter.waitUntilPlayheadReachesOrFailOnTimeout(video, 2, 45);

      variants = player.getVariantTracks();

      expect(variants.find((v) => !!v.active).language).toBe('en');
    });
  });
});
