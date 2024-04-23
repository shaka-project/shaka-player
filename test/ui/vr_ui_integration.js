/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('VR UI', () => {
  const Util = shaka.test.Util;
  const UiUtils = shaka.test.UiUtils;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLCanvasElement} */
  let canvas;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!HTMLElement} */
  let videoContainer;
  /** @type {!shaka.Player} */
  let player;
  /** @type {shaka.util.EventManager} */
  let eventManager;
  /** @type {shaka.test.Waiter} */
  let waiter;
  /** @type {!HTMLLinkElement} */
  let cssLink;
  /** @type {!shaka.ui.Overlay} */
  let ui;
  /** @type {!shaka.ui.Controls} */
  let controls;
  /** @type {shakaNamespaceType} */
  let compiledShaka;

  beforeAll(async () => {
    cssLink =
      /** @type {!HTMLLinkElement} */(document.createElement('link'));
    await UiUtils.setupCSS(cssLink);

    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
  });

  afterAll(() => {
    document.head.removeChild(cssLink);
  });

  beforeEach(async () => {
    canvas = shaka.test.UiUtils.createCanvasElement();
    video = shaka.test.UiUtils.createVideoElement();

    videoContainer = shaka.util.Dom.createHTMLElement('div');
    videoContainer.appendChild(video);
    videoContainer.appendChild(canvas);
    document.body.appendChild(videoContainer);
    player = new compiledShaka.Player();
    await player.attach(video);

    ui = new compiledShaka.ui.Overlay(player, videoContainer, video, canvas);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);

    const tempControls = ui.getControls();
    goog.asserts.assert(tempControls != null, 'Controls are null!');
    controls = tempControls;

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake((event) => {
      fail(event.detail);
    });
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
    eventManager.listen(controls, 'error', Util.spyFunc(onErrorSpy));
  });

  afterEach(async () => {
    eventManager.release();
    waiter = null;
    await UiUtils.cleanupUI();
  });

  describe('equirectangular', () => {
    beforeEach(async () => {
      // Create VR UI
      const config = {
        displayInVrMode: true,
        defaultVrProjectionMode: 'equirectangular',
      };

      ui.configure(config);
      await player.load('/base/test/test/assets/vr-equirectangular.mp4');
      video.play();
      await waiter.failOnTimeout(false).waitForEvent(video, 'play');
      expect(video.readyState).not.toBe(0);

      // All other events after this should fail on timeout (the default).
      await waiter.failOnTimeout(true);
    });

    it('change field of view', async () => {
      await Util.shortDelay();
      expect(controls.isPlayingVR()).toBe(true);
      controls.setVRFieldOfView(100);
      expect(controls.getVRFieldOfView()).toBe(100);
    });
  });
});
