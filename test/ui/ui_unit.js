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
  /** @type {!shaka.Player} */
  let player;
  /** @type {!Element} */
  let cssLink;

  beforeAll(async function() {
    // Add css file
    let head = document.head;
    cssLink = document.createElement('link');
    cssLink.type = 'text/css';
    cssLink.rel = 'stylesheet/less';
    cssLink.href ='/base/ui/controls.less';
    head.appendChild(cssLink);

    // LESS script has been added at the beginning of the test pass
    // (in test/test/boot.js). This tells it that we've added a new
    // stylesheet, so LESS can process it.
    less.registerStylesheetsImmediately();
    await less.refresh(/* reload */ true,
      /* modifyVars*/ false, /* clearFileCache */ false);
  });


  afterAll(function() {
    document.head.removeChild(cssLink);
  });

  describe('constructed through API', function() {
    /** @type {!HTMLElement} */
    let videoContainer;
    /** @type {!HTMLVideoElement} */
    let video;

    beforeAll(function() {
      videoContainer =
          /** @type {!HTMLElement} */ (document.createElement('div'));
      document.body.appendChild(videoContainer);

      video =
          /** @type {!HTMLVideoElement} */ (document.createElement('video'));
      videoContainer.appendChild(video);
      createUIThroughAPI(videoContainer, video);
    });

    afterAll(function() {
      document.body.removeChild(videoContainer);
    });

    it('has all the basic elements', function() {
      checkBasicUIElements(videoContainer);
    });
  });

  describe('constructed through DOM auto-setup', function() {
    describe('set up with one container', function() {
      /** @type {!HTMLElement} */
      let container;

      beforeAll(function() {
        container =
            /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container);

        createUIThroughDOMAutoSetup([container], /* videos */ []);
      });

      afterAll(function() {
        document.body.removeChild(container);
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

      beforeAll(function() {
        container1 =
            /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container1);

        container2 =
            /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container2);

        createUIThroughDOMAutoSetup([container1, container2], /* videos */ []);
      });

      afterAll(function() {
        document.body.removeChild(container1);
        document.body.removeChild(container2);
      });

      it('has all the basic elements', function() {
        checkBasicUIElements(container1);
        checkBasicUIElements(container2);
      });
    });

    describe('set up with one video', function() {
      /** @type {!HTMLVideoElement} */
      let video;

      beforeAll(function() {
        video =
            /** @type {!HTMLVideoElement} */ (document.createElement('video'));
        document.body.appendChild(video);

        createUIThroughDOMAutoSetup(/* containers */ [], [video]);
      });

      afterAll(function() {
        // createUIThroughDOMAutoSetup will add a div between body and the video
        document.body.removeChild(video.parentElement);
      });

      it('has all the basic elements', function() {
        checkBasicUIElements(
            /** @type {!HTMLVideoElement} */ (video.parentElement));
      });
    });

    describe('set up with several videos', function() {
      /** @type {!Array.<!HTMLVideoElement>} */
      let videos = [];

      beforeAll(function() {
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

      afterAll(function() {
        videos.forEach(function(video) {
          document.body.removeChild(video.parentElement);
        });
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

      beforeAll(function() {
        container =
            /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container);

        video =
            /** @type {!HTMLVideoElement} */ (document.createElement('video'));
        container.appendChild(video);

        createUIThroughDOMAutoSetup([container], [video]);
      });

      afterAll(function() {
        document.body.removeChild(container);
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

      video =
          /** @type {!HTMLVideoElement} */ (document.createElement('video'));
      videoContainer.appendChild(video);
    });

    afterEach(function() {
      document.body.removeChild(videoContainer);
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
        const defaultButtonsClassNames = [
          'shaka-caption-button',
          'shaka-resolution-button',
          'shaka-language-button',
          'shaka-pip-button',
        ];

        for (const className of defaultButtonsClassNames) {
          const buttons = overflowMenu.getElementsByClassName(className);
          expect(buttons.length).toBe(1);
        }
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

      const defaultElementsClassNames = [
          'shaka-current-time',
          'shaka-mute-button',
          'shaka-volume-bar',
          'shaka-fullscreen-button',
          'shaka-overflow-menu-button',
        ];

        for (const className of defaultElementsClassNames) {
          const elements =
              controlsButtonPanel.getElementsByClassName(className);
          expect(elements.length).toBe(1);
        }
      });

      it('is accessible', function() {
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

        const elementsClassNames = [
          'shaka-mute-button',
          'shaka-volume-bar',
          'shaka-fullscreen-button',
          'shaka-overflow-menu-button',
          'shaka-fast-forward-button',
          'shaka-rewind-button',
        ];

        for (const className of elementsClassNames) {
          const elements =
              controlsButtonPanel.getElementsByClassName(className);
          expect(elements.length).toBe(1);
          expect(elements[0].hasAttribute('aria-label')).toBe(true);
        }
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

      video =
          /** @type {!HTMLVideoElement} */ (document.createElement('video'));
      container.appendChild(video);
    });

    afterEach(function() {
      document.body.removeChild(container);
      shaka.log.warning = originalWarning;
    });

    it('only the specified controls are created', function() {
      config = {controlPanelElements: ['time_and_duration', 'mute']};
      createUIThroughAPI(container, video, config);

      // Only current time and mute button should've been created
      let currentTimes =
        container.getElementsByClassName('shaka-current-time');
      expect(currentTimes.length).toBe(1);

      let shakaMuteButtons =
        container.getElementsByClassName('shaka-mute-button');
      expect(shakaMuteButtons.length).toBe(1);

      let volumeBars =
        container.getElementsByClassName('shaka-volume-bar');
      expect(volumeBars.length).toBe(0);

      let fullscreenButtons =
        container.getElementsByClassName('fullscreenButton');
      expect(fullscreenButtons.length).toBe(0);

      let overflowMenuButtons =
        container.getElementsByClassName('shaka-overflow-menu-button');
      expect(overflowMenuButtons.length).toBe(0);
    });

    it('only the specified overflow menu buttons are created', function() {
      config = {overflowMenuButtons: ['cast']};
      createUIThroughAPI(container, video, config);

      let castButtons =
        container.getElementsByClassName('shaka-cast-button');
      expect(castButtons.length).toBe(1);

      let captionButtons =
        container.getElementsByClassName('shaka-caption-button');
      expect(captionButtons.length).toBe(0);
    });

    // TODO(ismena): I'm not sure how and if this should be enforced after the
    // redesign. Disabling the tests until we have an approach figured out.
    xit('overlfow menu elements are not created in control button panel',
        function() {
      expect(warning).not.toHaveBeenCalled();
      config = {controlPanelElements: ['cast']};
      createUIThroughAPI(container, video, config);

      // We do not provide captions button as part of controls button panel,
      // only in overflow menu
      let castButtons =
        container.getElementsByClassName('shaka-cast-button');
      expect(castButtons.length).toBe(0);
      expect(warning).toHaveBeenCalled();
    });

    xit('control button panel elements are not created in overlfow menu',
        function() {
      expect(warning).not.toHaveBeenCalled();
      config = {overflowMenuButtons: ['rewind']};
      createUIThroughAPI(container, video, config);

      // We do not provide captions button as part of controls button panel,
      // only in overflow menu
      let rewindButtons =
        container.getElementsByClassName('shaka-rewind-button');
      expect(rewindButtons.length).toBe(0);
      expect(warning).toHaveBeenCalled();
    });

    it('seek bar is not created unless configured', function() {
      config = {addSeekBar: false};
      createUIThroughAPI(container, video, config);

      let seekBars =
        container.getElementsByClassName('shaka-seek-bar');
      expect(seekBars.length).toBe(0);
    });

    it('seek bar is created when configured', function() {
      config = {addSeekBar: true};
      createUIThroughAPI(container, video, config);

      let seekBars =
        container.getElementsByClassName('shaka-seek-bar');
      expect(seekBars.length).toBe(1);
    });

    it('settings menus are positioned lower when seek bar is absent',
        function() {
      config = {addSeekBar: false};
      createUIThroughAPI(container, video, config);

      let seekBars =
        container.getElementsByClassName('shaka-seek-bar');
      expect(seekBars.length).toBe(0);

      let overflowMenus =
        container.getElementsByClassName('shaka-overflow-menu');
      expect(overflowMenus.length).toBe(1);
      expect(overflowMenus[0].classList.contains(
        'shaka-low-position')).toBe(true);

      let resolutionMenus =
        container.getElementsByClassName('shaka-resolutions');
      expect(resolutionMenus.length).toBe(1);
      expect(resolutionMenus[0].classList.contains(
        'shaka-low-position')).toBe(true);

      let audioLangMenus =
        container.getElementsByClassName('shaka-audio-languages');
      expect(audioLangMenus.length).toBe(1);
      expect(audioLangMenus[0].classList.contains(
        'shaka-low-position')).toBe(true);

      let textLangMenus =
        container.getElementsByClassName('shaka-text-languages');
      expect(textLangMenus.length).toBe(1);
      expect(textLangMenus[0].classList.contains(
        'shaka-low-position')).toBe(true);
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
    let videos = container.getElementsByTagName('video');
    expect(videos.length).not.toBe(0);

    let playButtonContainers =
        container.getElementsByClassName('shaka-play-button-container');
    expect(playButtonContainers.length).toBe(1);

    let playButtons =
        container.getElementsByClassName('shaka-play-button');
    expect(playButtons.length).toBe(1);

    let bufferingSpinners =
        container.getElementsByClassName('shaka-spinner-svg');
    expect(bufferingSpinners.length).toBe(1);

    let overflowMenus =
        container.getElementsByClassName('shaka-overflow-menu');
    expect(overflowMenus.length).toBe(1);

    let controlsButtonPanels =
        container.getElementsByClassName('shaka-controls-button-panel');
    expect(controlsButtonPanels.length).toBe(1);

    let seekBars =
        container.getElementsByClassName('shaka-seek-bar');
    expect(seekBars.length).toBe(1);
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
    const ui = new shaka.ui.Overlay(player, videoContainer, video, config);

    // The tests we have at the moment will pass without this, but compiler
    // complained about not using the ui var, and I(ismena) didn't know
    // any better.
    ui.setEnabled(true);
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
});

