/**
 * @license
 * Copyright 2016 Google Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

describe('UI', function() {
  /** @type {shaka.Player} */
  let player;
  /** @type {!Element} */
  let cssLink;

  beforeAll(async () => {
    // Add css file
    cssLink = document.createElement('link');
    await shaka.test.Util.setupCSS(cssLink);
  });

  afterEach(async () => {
    await shaka.test.Util.cleanupUI();
  });

  afterAll(() => {
    document.head.removeChild(cssLink);
  });

  describe('constructed through API', function() {
    /** @type {!HTMLElement} */
    let videoContainer;
    /** @type {!HTMLVideoElement} */
    let video;

    beforeEach(() => {
      videoContainer =
          /** @type {!HTMLElement} */ (document.createElement('div'));
      document.body.appendChild(videoContainer);

      video = shaka.util.Dom.createVideoElement();
      videoContainer.appendChild(video);
      createUIThroughAPI(videoContainer, video);
    });

    it('has all the basic elements', function() {
      checkBasicUIElements(videoContainer);
    });
  });

  describe('constructed through DOM auto-setup', function() {
    describe('set up with one container', function() {
      /** @type {!HTMLElement} */
      let container;

      beforeEach(() => {
        container =
            /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container);

        createUIThroughDOMAutoSetup([container], /* videos */ []);
      });

      it('has all the basic elements', function() {
        checkBasicUIElements(container);
      });
    });

    describe('set up with several containers', function() {
      /** @type {!HTMLElement} */
      let container1;

      /** @type {!HTMLElement} */
      let container2;

      beforeEach(() => {
        container1 =
            /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container1);

        container2 =
            /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container2);

        createUIThroughDOMAutoSetup([container1, container2], /* videos */ []);
      });

      it('has all the basic elements', function() {
        checkBasicUIElements(container1);
        checkBasicUIElements(container2);
      });
    });

    describe('set up with one video', function() {
      /** @type {!HTMLVideoElement} */
      let video;

      beforeEach(() => {
        video = shaka.util.Dom.createVideoElement();
        document.body.appendChild(video);

        createUIThroughDOMAutoSetup(/* containers */ [], [video]);
      });

      it('has all the basic elements', function() {
        checkBasicUIElements(
            /** @type {!HTMLVideoElement} */ (video.parentElement));
      });
    });

    describe('set up with several videos', function() {
      /** @type {!Array.<!HTMLVideoElement>} */
      let videos = [];

      beforeEach(() => {
        // Four is just a random number I (ismena) came up with to test a
        // multi-video use case. It could be replaces with any other
        // (reasonable) number.
        for (let i = 0; i < 4; i++) {
          let video = /** @type {!HTMLVideoElement} */
              (document.createElement('video'));

          document.body.appendChild(video);
          videos.push(video);
        }

        createUIThroughDOMAutoSetup(/* containers */ [], videos);
      });

      it('has all the basic elements', function() {
        videos.forEach(function(video) {
          checkBasicUIElements(
              /** @type {!HTMLVideoElement} */ (video.parentElement));
        });
      });
    });

    describe('set up with a video and a container', function() {
      /** @type {!HTMLElement} */
      let container;
      /** @type {!HTMLVideoElement} */
      let video;

      beforeEach(() => {
        container =
            /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container);

        video = shaka.util.Dom.createVideoElement();
        container.appendChild(video);

        createUIThroughDOMAutoSetup([container], [video]);
      });

      it('has all the basic elements', function() {
        checkBasicUIElements(container);
      });
    });
  });

  describe('controls', function() {
    /** @type {!HTMLElement} */
    let videoContainer;
    /** @type {!HTMLVideoElement} */
    let video;

    beforeEach(function() {
      videoContainer =
          /** @type {!HTMLElement} */ (document.createElement('div'));
      document.body.appendChild(videoContainer);

      video = shaka.util.Dom.createVideoElement();
      videoContainer.appendChild(video);
    });

    describe('all the controls', function() {
       /** @type {!HTMLElement} */
      let controlsContainer;

      beforeEach(function() {
        createUIThroughAPI(videoContainer, video);
        let controlsContainers =
            videoContainer.getElementsByClassName('shaka-controls-container');
        expect(controlsContainers.length).toBe(1);
        controlsContainer = /** @type {!HTMLElement} */ (controlsContainers[0]);
      });

      it('stay visible if overflow menuButton is open', function() {
        let overflowMenus =
            videoContainer.getElementsByClassName('shaka-overflow-menu');
        expect(overflowMenus.length).toBe(1);
        let overflowMenu = /** @type {!HTMLElement} */ (overflowMenus[0]);

        let overflowMenuButtons =
            videoContainer.getElementsByClassName('shaka-overflow-menu-button');
        expect(overflowMenuButtons.length).toBe(1);
        let overflowMenuButton = overflowMenuButtons[0];

        overflowMenuButton.click();
        expect(overflowMenu.style.display).not.toEqual('none');
        expect(controlsContainer.style.display).not.toEqual('none');
      });
    });

    describe('overflow menu', function() {
       /** @type {!HTMLElement} */
      let overflowMenu;

      beforeEach(function() {
        let config = {
          controlPanelElements: [
            'overflow_menu',
          ],
        };
        createUIThroughAPI(videoContainer, video, config);

        let overflowMenus =
            videoContainer.getElementsByClassName('shaka-overflow-menu');
        expect(overflowMenus.length).toBe(1);
        overflowMenu = /** @type {!HTMLElement} */ (overflowMenus[0]);
      });

      it('has default buttons', function() {
        confirmElementFound(overflowMenu, 'shaka-caption-button');
        confirmElementFound(overflowMenu, 'shaka-resolution-button');
        confirmElementFound(overflowMenu, 'shaka-language-button');
        confirmElementFound(overflowMenu, 'shaka-pip-button');
      });

      it('becomes visible if overflowMenuButton was clicked', function() {
        let display = window.getComputedStyle(overflowMenu, null).display;
        expect(display).toEqual('none');

        let overflowMenuButtons =
            videoContainer.getElementsByClassName('shaka-overflow-menu-button');
        expect(overflowMenuButtons.length).toBe(1);
        let overflowMenuButton = overflowMenuButtons[0];

        overflowMenuButton.click();
        display = overflowMenu.style.display;
        expect(display).not.toEqual('none');
      });

      it('allows picture-in-picture only when the content has video',
          async () => {
        // Load fake content that contains only audio.
        const manifest = new shaka.test.ManifestGenerator()
            .addPeriod(/* startTime= */ 0)
              .addVariant(/* id= */ 0)
                .addAudio(/* id= */ 1)
            .build();

        const parser = new shaka.test.FakeManifestParser(manifest);
        const factory = function() { return parser; };

        await player.load(/* uri= */ 'fake', /* startTime= */ 0, factory);
        const pipButtons =
            videoContainer.getElementsByClassName('shaka-pip-button');
        expect(pipButtons.length).toBe(1);
        const pipButton = pipButtons[0];

        // The picture-in-picture button should not be shown when the content
        // only has audio.
        expect(pipButton.classList.contains('shaka-hidden')).toBe(true);

        // The picture-in-picture window should not be open when the content
        // only has audio.
        expect(document.pictureInPictureElement).toBeFalsy();
      });

      it('is accessible', function() {
        for (let button of overflowMenu.childNodes) {
          expect(/** @type {!HTMLElement} */ (button)
              .hasAttribute('aria-label')).toBe(true);
        }
      });
    });


    describe('controls-button-panel', function() {
       /** @type {!HTMLElement} */
      let controlsButtonPanel;

      it('has default elements', function() {
        createUIThroughAPI(videoContainer, video);
        let controlsButtonPanels = videoContainer.getElementsByClassName(
          'shaka-controls-button-panel');
        expect(controlsButtonPanels.length).toBe(1);

        controlsButtonPanel =
            /** @type {!HTMLElement} */ (controlsButtonPanels[0]);

        confirmElementFound(controlsButtonPanel, 'shaka-current-time');
        confirmElementFound(controlsButtonPanel, 'shaka-mute-button');
        confirmElementFound(controlsButtonPanel, 'shaka-volume-bar');
        confirmElementFound(controlsButtonPanel, 'shaka-fullscreen-button');
        confirmElementFound(controlsButtonPanel, 'shaka-overflow-menu-button');
      });

      it('is accessible', function() {
        function confirmAriaLabel(className) {
          const elements =
              controlsButtonPanel.getElementsByClassName(className);
          expect(elements.length).toBe(1);
          expect(elements[0].hasAttribute('aria-label')).toBe(true);
        }

        const config = {
          controlPanelElements: [
            'mute',
            'volume',
            'fullscreen',
            'overflow_menu',
            'fast_forward',
            'rewind',
          ],
        };

        createUIThroughAPI(videoContainer, video, config);
        const controlsButtonPanels = videoContainer.getElementsByClassName(
          'shaka-controls-button-panel');
        expect(controlsButtonPanels.length).toBe(1);

        controlsButtonPanel =
            /** @type {!HTMLElement} */ (controlsButtonPanels[0]);

        confirmAriaLabel('shaka-mute-button');
        confirmAriaLabel('shaka-volume-bar');
        confirmAriaLabel('shaka-fullscreen-button');
        confirmAriaLabel('shaka-overflow-menu-button');
        confirmAriaLabel('shaka-fast-forward-button');
        confirmAriaLabel('shaka-rewind-button');
      });
    });

    describe('resolutions menu', function() {
       /** @type {!HTMLElement} */
      let resolutionsMenu;

      beforeEach(function() {
        let config = {
          controlPanelElements: [
            'overflow_menu',
          ],
          overflowMenuButtons: [
            'quality',
          ],
        };
        createUIThroughAPI(videoContainer, video, config);

        let resolutionsMenus =
            videoContainer.getElementsByClassName('shaka-resolutions');
        expect(resolutionsMenus.length).toBe(1);
        resolutionsMenu = /** @type {!HTMLElement} */ (resolutionsMenus[0]);
      });

      it('becomes visible if resolutionButton was clicked', function() {
        let display = window.getComputedStyle(resolutionsMenu, null).display;
        expect(display).toEqual('none');

        let resolutionButtons =
            videoContainer.getElementsByClassName('shaka-resolution-button');
        expect(resolutionButtons.length).toBe(1);
        let resolutionButton = resolutionButtons[0];

        resolutionButton.click();
        display = resolutionsMenu.style.display;
        expect(display).not.toEqual('none');
      });

      it('clears the buffer when changing resolutions', async () => {
        // Load fake content that has more than one quality level.
        const manifest = new shaka.test.ManifestGenerator()
            .addPeriod(0)
              .addVariant(0)
                .addVideo(1).size(320, 240)
                .addVideo(2).size(640, 480)
            .build();

        const parser = new shaka.test.FakeManifestParser(manifest);
        const factory = function() { return parser; };

        await player.load(/* uri */ 'fake', /* startTime */ 0, factory);

        const selectVariantTrack = spyOn(player, 'selectVariantTrack');

        // There should be at least one explicit quality button.
        const qualityButton =
            videoContainer.querySelectorAll('button.explicit-resolution')[0];
        expect(qualityButton).toBeDefined();

        // Clicking this should select a track and clear the buffer.
        expect(selectVariantTrack).not.toHaveBeenCalled();
        qualityButton.click();

        // The second argument is "clearBuffer", and should be true.
        expect(selectVariantTrack).toHaveBeenCalledWith(
            jasmine.any(Object), true);
      });

      // TODO: integration test to ensure all resolutions are
      // correctly represented
    });

    // TODO: integration test to test audio language menu.
  });

  describe('customization', function() {
    /** @type {!HTMLElement} */
    let container;
    /** @type {!HTMLMediaElement} */
    let video;
    /** @type {!Object} */
    let config;

    let warning;
    let originalWarning;

    beforeEach(function() {
      originalWarning = shaka.log.warning;
      warning = jasmine.createSpy('shaka.log.warning');

      shaka.log.warning = shaka.test.Util.spyFunc(warning);
      warning.calls.reset();
      container =
          /** @type {!HTMLElement} */ (document.createElement('div'));
      document.body.appendChild(container);

      video = shaka.util.Dom.createVideoElement();
      container.appendChild(video);
    });

    afterEach(function() {
      shaka.log.warning = originalWarning;
    });

    it('only the specified controls are created', function() {
      config = {controlPanelElements: ['time_and_duration', 'mute']};
      createUIThroughAPI(container, video, config);

      // Only current time and mute button should've been created
      confirmElementFound(container, 'shaka-current-time');
      confirmElementFound(container, 'shaka-mute-button');

      confirmElementMissing(container, 'shaka-volume-bar');
      confirmElementMissing(container, 'shaka-fullscreen-button');
      confirmElementMissing(container, 'shaka-overflow-menu-button');
    });

    it('only the specified overflow menu buttons are created', function() {
      config = {overflowMenuButtons: ['cast']};
      createUIThroughAPI(container, video, config);

      confirmElementFound(container, 'shaka-cast-button');

      confirmElementMissing(container, 'shaka-caption-button');
    });

    it('seek bar is not created unless configured', function() {
      config = {addSeekBar: false};
      createUIThroughAPI(container, video, config);

      confirmElementMissing(container, 'shaka-seek-bar');
    });

    it('seek bar is created when configured', function() {
      config = {addSeekBar: true};
      createUIThroughAPI(container, video, config);

      confirmElementFound(container, 'shaka-seek-bar');
    });

    it('settings menus are positioned lower when seek bar is absent',
        function() {
      config = {addSeekBar: false};
      createUIThroughAPI(container, video, config);

      function confirmLowPosition(className) {
        const elements =
              container.getElementsByClassName(className);
        expect(elements.length).toBe(1);
        expect(elements[0].classList.contains('shaka-low-position')).toBe(true);
      }

      confirmElementMissing(container, 'shaka-seek-bar');

      confirmLowPosition('shaka-overflow-menu');
      confirmLowPosition('shaka-resolutions');
      confirmLowPosition('shaka-audio-languages');
      confirmLowPosition('shaka-text-languages');
    });

    it('controls are created in specified order', function() {
      config = {controlPanelElements: ['mute', 'time_and_duration',
          'fullscreen']};
      createUIThroughAPI(container, video, config);

      let controlsButtonPanels =
          container.getElementsByClassName('shaka-controls-button-panel');
      expect(controlsButtonPanels.length).toBe(1);
      let controlsButtonPanel =
          /** @type {!HTMLElement} */ (controlsButtonPanels[0]);

      let buttons = controlsButtonPanel.childNodes;
      expect(buttons.length).toBe(3);

      expect( /** @type {!HTMLElement} */ (buttons[0]).className)
          .toContain('shaka-mute-button');
      expect( /** @type {!HTMLElement} */ (buttons[1]).className)
          .toContain('shaka-current-time');
      expect( /** @type {!HTMLElement} */ (buttons[2]).className)
          .toContain('shaka-fullscreen');
    });
  });

  /**
   * @param {!HTMLElement} container
   * @suppress {visibility}
   */
  function checkBasicUIElements(container) {
    const videos = container.getElementsByTagName('video');
    expect(videos.length).not.toBe(0);

    confirmElementFound(container, 'shaka-play-button-container');
    confirmElementFound(container, 'shaka-play-button');
    confirmElementFound(container, 'shaka-spinner');
    confirmElementFound(container, 'shaka-overflow-menu');
    confirmElementFound(container, 'shaka-controls-button-panel');
    confirmElementFound(container, 'shaka-seek-bar');
  }

  /**
   * @param {!HTMLElement} videoContainer
   * @param {!HTMLMediaElement} video
   * @param {!Object=} config
   */
  function createUIThroughAPI(videoContainer, video, config) {
    player = new shaka.Player(video);
    // Create UI
    config = config || {};
    const ui = new shaka.ui.Overlay(player, videoContainer, video);
    ui.configure(config);
  }

  /**
   * @param {!Array.<!Element>} containers
   * @param {!Array.<!Element>} videos
   * @suppress {visibility}
   */
  function createUIThroughDOMAutoSetup(containers, videos) {
    containers.forEach(function(container) {
      container.setAttribute('data-shaka-player-container', '');
    });

    videos.forEach(function(video) {
      video.setAttribute('data-shaka-player', '');
    });

    // Call UI's private method to scan the page for shaka
    // elements and create the UI.
    shaka.ui.Overlay.scanPageForShakaElements_();
  }

  /**
   * @param {!HTMLElement} parent
   * @param {string} className
   * @suppress {visibility}
   */
  function confirmElementFound(parent, className) {
    const elements = parent.getElementsByClassName(className);
    expect(elements.length).toBe(1);
  }

  /**
   * @param {!HTMLElement} parent
   * @param {string} className
   * @suppress {visibility}
   */
  function confirmElementMissing(parent, className) {
    const elements = parent.getElementsByClassName(className);
    expect(elements.length).toBe(0);
  }
});

