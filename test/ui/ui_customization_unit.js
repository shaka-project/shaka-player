/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('UI Customization', () => {
  const UiUtils = shaka.test.UiUtils;
  /** @type {!HTMLLinkElement} */
  let cssLink;
  /** @type {!HTMLElement} */
  let container;
  /** @type {!HTMLMediaElement} */
  let video;
  /** @type {!HTMLCanvasElement} */
  let canvas;

  beforeAll(async () => {
    // Add css file
    cssLink = /** @type {!HTMLLinkElement} */(document.createElement('link'));
    await UiUtils.setupCSS(cssLink);
  });

  afterEach(async () => {
    await UiUtils.cleanupUI();
  });

  afterAll(() => {
    document.head.removeChild(cssLink);
  });

  beforeEach(() => {
    container =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    document.body.appendChild(container);

    video = shaka.test.UiUtils.createVideoElement();
    container.appendChild(video);
    canvas = shaka.test.UiUtils.createCanvasElement();
    container.appendChild(canvas);
  });

  it('only the specified controls are created', async () => {
    const config = {controlPanelElements: ['time_and_duration', 'mute']};
    await UiUtils.createUIThroughAPI(container, video, config, canvas);

    // Only current time and mute button should've been created
    UiUtils.confirmElementFound(container, 'shaka-current-time');
    UiUtils.confirmElementFound(container, 'shaka-mute-button');

    UiUtils.confirmElementMissing(container, 'shaka-volume-bar');
    UiUtils.confirmElementMissing(container, 'shaka-fullscreen-button');
    UiUtils.confirmElementMissing(container, 'shaka-overflow-menu-button');
  });

  it('only the specified overflow menu buttons are created', async () => {
    const config = {overflowMenuButtons: ['loop']};
    await UiUtils.createUIThroughAPI(container, video, config, canvas);

    UiUtils.confirmElementFound(container, 'shaka-loop-button');

    UiUtils.confirmElementMissing(container, 'shaka-caption-button');
  });

  it('seek bar only created when configured', async () => {
    const ui = await UiUtils.createUIThroughAPI(
        container, video, {addSeekBar: false}, canvas);
    UiUtils.confirmElementMissing(container, 'shaka-seek-bar');
    await ui.destroy();

    await UiUtils.createUIThroughAPI(
        container, video, {addSeekBar: true}, canvas);
    UiUtils.confirmElementFound(container, 'shaka-seek-bar');
  });

  it('big play button only created when configured', async () => {
    const ui = await UiUtils.createUIThroughAPI(
        container, video, {addBigPlayButton: false}, canvas);
    UiUtils.confirmElementMissing(container, 'shaka-play-button-container');
    UiUtils.confirmElementMissing(container, 'shaka-play-button');
    await ui.destroy();

    await UiUtils.createUIThroughAPI(
        container, video, {addBigPlayButton: true}, canvas);
    UiUtils.confirmElementFound(container, 'shaka-play-button-container');
    UiUtils.confirmElementFound(container, 'shaka-play-button');
  });

  it('controls are created in specified order', async () => {
    const config = {
      controlPanelElements: [
        'mute',
        'loop',
        'fullscreen',
      ],
    };

    await UiUtils.createUIThroughAPI(container, video, config, canvas);

    const controlsButtonPanels =
        container.getElementsByClassName('shaka-controls-button-panel');
    expect(controlsButtonPanels.length).toBe(1);
    const controlsButtonPanel =
    /** @type {!HTMLElement} */ (controlsButtonPanels[0]);

    const buttons = controlsButtonPanel.childNodes;
    expect(buttons.length).toBe(3);

    expect( /** @type {!HTMLElement} */ (buttons[0]).className)
        .toContain('shaka-mute-button');
    expect( /** @type {!HTMLElement} */ (buttons[1]).className)
        .toContain('shaka-loop-button');
    expect( /** @type {!HTMLElement} */ (buttons[2]).className)
        .toContain('shaka-fullscreen');
  });

  it('layout can be re-configured after the creation', async () => {
    const config = {controlPanelElements: ['time_and_duration', 'mute']};
    const ui = await UiUtils.createUIThroughAPI(
        container, video, config, canvas);

    // Only current time and mute button should've been created
    UiUtils.confirmElementFound(container, 'shaka-current-time');
    UiUtils.confirmElementFound(container, 'shaka-mute-button');
    UiUtils.confirmElementFound(container, 'shaka-seek-bar');

    UiUtils.confirmElementMissing(container, 'shaka-volume-bar');
    UiUtils.confirmElementMissing(container, 'shaka-fullscreen-button');
    UiUtils.confirmElementMissing(container, 'shaka-overflow-menu-button');

    // Reconfigure the layout
    const newConfig = {
      controlPanelElements: [
        'volume',
        'fullscreen',
      ],
      addSeekBar: false,
    };

    const eventManager = new shaka.util.EventManager();
    const waiter = new shaka.test.Waiter(eventManager);

    const controls = ui.getControls();
    goog.asserts.assert(controls != null, 'Should have a controls object!');

    const p = waiter.waitForEvent(controls, 'uiupdated');
    ui.configure(newConfig);

    // Wait for the change to take effect
    await p;

    // New elements should be there
    UiUtils.confirmElementFound(container, 'shaka-volume-bar');
    UiUtils.confirmElementFound(container, 'shaka-fullscreen-button');

    // Old elements should not be there
    UiUtils.confirmElementMissing(container, 'shaka-current-time');
    UiUtils.confirmElementMissing(container, 'shaka-mute-button');
    UiUtils.confirmElementMissing(container, 'shaka-seek-bar');
  });

  // Regression for #1948
  it('cast proxy and controls are unchanged by reconfiguration', async () => {
    const config = {controlPanelElements: ['time_and_duration', 'mute']};
    /** @type {!shaka.ui.Overlay} */
    const ui = await UiUtils.createUIThroughAPI(
        container, video, config, canvas);

    const eventManager = new shaka.util.EventManager();
    const waiter = new shaka.test.Waiter(eventManager);

    // Save controls and cast proxy objects
    const controls = ui.getControls();
    const castProxy = controls.getCastProxy();

    goog.asserts.assert(controls != null, 'Should have a controls object!');

    const p = waiter.waitForEvent(controls, 'uiupdated');

    const newConfig = {controlPanelElements: ['volume']};
    ui.configure(newConfig);

    // Wait for the change to take effect
    // The fact that this resolves is implicit proof that the controls
    // object stayed the same, but we check it again below to be explicit.
    await p;

    const newControls = ui.getControls();
    const newCastProxy = newControls.getCastProxy();

    expect(newControls).toBe(controls);
    expect(newCastProxy).toBe(castProxy);
  });
});
