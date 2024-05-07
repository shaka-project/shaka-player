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
  /** @type {boolean} */
  let canPlayVR;

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
    canPlayVR = controls.canPlayVR();

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

  filterDescribe('equirectangular', () => canPlayVR, () => {
    beforeEach(async () => {
      const controlsPromise =
          waiter.timeoutAfter(30).waitForEvent(controls, 'vrstatuschanged');
      // Create VR UI
      const config = {
        displayInVrMode: true,
        defaultVrProjectionMode: 'equirectangular',
      };

      ui.configure(config);
      await player.load('/base/test/test/assets/dash-vr/dash.mpd');
      // For playback to begin so that we have some content buffered.
      await video.play();
      await waiter.waitForMovementOrFailOnTimeout(video, /* timeout= */ 10);
      await controlsPromise;
    });

    it('change field of view', () => {
      expect(controls.isPlayingVR()).toBe(true);
      controls.setVRFieldOfView(100);
      expect(controls.getVRFieldOfView()).toBe(100);
    });
  });
});
