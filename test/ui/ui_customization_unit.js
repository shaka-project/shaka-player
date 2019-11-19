/** @license
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('UI Customization', () => {
  const UiUtils = shaka.test.UiUtils;
  /** @type {!Element} */
  let cssLink;
  /** @type {!HTMLElement} */
  let container;
  /** @type {!HTMLMediaElement} */
  let video;

  beforeAll(async () => {
    // Add css file
    cssLink = document.createElement('link');
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

    video = shaka.util.Dom.createVideoElement();
    container.appendChild(video);
  });

  it('only the specified controls are created', () => {
    const config = {controlPanelElements: ['time_and_duration', 'mute']};
    UiUtils.createUIThroughAPI(container, video, config);

    // Only current time and mute button should've been created
    UiUtils.confirmElementFound(container, 'shaka-current-time');
    UiUtils.confirmElementFound(container, 'shaka-mute-button');

    UiUtils.confirmElementMissing(container, 'shaka-volume-bar');
    UiUtils.confirmElementMissing(container, 'shaka-fullscreen-button');
    UiUtils.confirmElementMissing(container, 'shaka-overflow-menu-button');
  });

  it('only the specified overflow menu buttons are created', () => {
    const config = {overflowMenuButtons: ['cast']};
    UiUtils.createUIThroughAPI(container, video, config);

    UiUtils.confirmElementFound(container, 'shaka-cast-button');

    UiUtils.confirmElementMissing(container, 'shaka-caption-button');
  });

  it('seek bar is not created unless configured', () => {
    const config = {addSeekBar: false};
    UiUtils.createUIThroughAPI(container, video, config);

    UiUtils.confirmElementMissing(container, 'shaka-seek-bar');
  });

  it('seek bar is created when configured', () => {
    const config = {addSeekBar: true};
    UiUtils.createUIThroughAPI(container, video, config);

    UiUtils.confirmElementFound(container, 'shaka-seek-bar');
  });

  it('settings menus are positioned lower when seek bar is absent',
      () => {
        const config = {addSeekBar: false};
        UiUtils.createUIThroughAPI(container, video, config);

        function confirmLowPosition(className) {
          const elements =
            container.getElementsByClassName(className);
          expect(elements.length).toBe(1);
          expect(
              elements[0].classList.contains('shaka-low-position')).toBe(true);
        }

        UiUtils.confirmElementMissing(container, 'shaka-seek-bar');

        confirmLowPosition('shaka-overflow-menu');
        confirmLowPosition('shaka-resolutions');
        confirmLowPosition('shaka-audio-languages');
        confirmLowPosition('shaka-text-languages');
      });

  it('controls are created in specified order', () => {
    const config = {
      controlPanelElements: [
        'mute',
        'time_and_duration',
        'fullscreen',
      ],
    };

    UiUtils.createUIThroughAPI(container, video, config);

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
        .toContain('shaka-current-time');
    expect( /** @type {!HTMLElement} */ (buttons[2]).className)
        .toContain('shaka-fullscreen');
  });

  it('layout can be re-configured after the creation', async () => {
    const config = {controlPanelElements: ['time_and_duration', 'mute']};
    const ui = UiUtils.createUIThroughAPI(container, video, config);

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
    const ui = UiUtils.createUIThroughAPI(container, video, config);

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
