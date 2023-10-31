/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('UI', () => {
  const UiUtils = shaka.test.UiUtils;
  const Util = shaka.test.Util;

  const fakeMimeType = 'application/test';

  /** @type {shaka.Player} */
  let player;
  /** @type {!HTMLLinkElement} */
  let cssLink;

  beforeAll(async () => {
    // Add css file
    cssLink = /** @type {!HTMLLinkElement} */(document.createElement('link'));
    await UiUtils.setupCSS(cssLink);
  });

  afterEach(async () => {
    shaka.media.ManifestParser.unregisterParserByMime(fakeMimeType);
    await UiUtils.cleanupUI();
  });

  afterAll(() => {
    document.head.removeChild(cssLink);
  });

  describe('constructed through API', () => {
    /** @type {!HTMLElement} */
    let videoContainer;
    /** @type {!HTMLVideoElement} */
    let video;

    beforeEach(async () => {
      videoContainer =
        /** @type {!HTMLElement} */ (document.createElement('div'));
      document.body.appendChild(videoContainer);

      video = shaka.test.UiUtils.createVideoElement();
      videoContainer.appendChild(video);
      await UiUtils.createUIThroughAPI(videoContainer, video);
    });

    it('has all the basic elements', () => {
      checkBasicUIElements(videoContainer);
    });
  });

  describe('constructed through DOM auto-setup', () => {
    describe('set up with one container', () => {
      /** @type {!HTMLElement} */
      let container;

      beforeEach(async () => {
        container =
          /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container);

        await UiUtils.createUIThroughDOMAutoSetup(
            [container], /* videos= */ []);
      });

      it('has all the basic elements', () => {
        checkBasicUIElements(container);
      });
    });

    describe('set up with several containers', () => {
      /** @type {!HTMLElement} */
      let container1;

      /** @type {!HTMLElement} */
      let container2;

      beforeEach(async () => {
        container1 =
          /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container1);

        container2 =
          /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container2);

        await UiUtils.createUIThroughDOMAutoSetup([container1, container2],
            /* videos= */ []);
      });

      it('has all the basic elements', () => {
        checkBasicUIElements(container1);
        checkBasicUIElements(container2);
      });
    });

    describe('set up with one video', () => {
      /** @type {!HTMLVideoElement} */
      let video;

      beforeEach(async () => {
        video = shaka.test.UiUtils.createVideoElement();
        document.body.appendChild(video);

        await UiUtils.createUIThroughDOMAutoSetup(
            /* containers= */ [], [video]);
      });

      it('has all the basic elements', () => {
        checkBasicUIElements(
            /** @type {!HTMLVideoElement} */ (video.parentElement));
      });
    });

    describe('set up with several videos', () => {
      /** @type {!Array.<!HTMLVideoElement>} */
      const videos = [];

      beforeEach(async () => {
        // Four is just a random number I (ismena) came up with to test a
        // multi-video use case. It could be replaces with any other
        // (reasonable) number.
        for (let i = 0; i < 4; i++) {
          const video = /** @type {!HTMLVideoElement} */
              (document.createElement('video'));

          document.body.appendChild(video);
          videos.push(video);
        }

        await UiUtils.createUIThroughDOMAutoSetup(/* containers= */ [], videos);
      });

      it('has all the basic elements', () => {
        for (const video of videos) {
          checkBasicUIElements(
              /** @type {!HTMLVideoElement} */ (video.parentElement));
        }
      });
    });

    describe('set up with a video and a container', () => {
      /** @type {!HTMLElement} */
      let container;
      /** @type {!HTMLVideoElement} */
      let video;

      beforeEach(async () => {
        container =
          /** @type {!HTMLElement} */ (document.createElement('div'));
        document.body.appendChild(container);

        video = shaka.test.UiUtils.createVideoElement();
        container.appendChild(video);

        await UiUtils.createUIThroughDOMAutoSetup([container], [video]);
      });

      it('has all the basic elements', () => {
        checkBasicUIElements(container);
      });
    });
  });

  describe('controls', () => {
    /** @type {!HTMLElement} */
    let videoContainer;
    /** @type {!HTMLVideoElement} */
    let video;

    beforeEach(() => {
      videoContainer =
        /** @type {!HTMLElement} */ (document.createElement('div'));
      document.body.appendChild(videoContainer);

      video = shaka.test.UiUtils.createVideoElement();
      videoContainer.appendChild(video);
    });

    it('goes into fullscreen on double click', async () => {
      if (!document.fullscreenEnabled) {
        pending('This test requires fullscreen support, which is unavailable.');
      }

      const config = {
        controlPanelElements: [
          'overflow_menu',
        ],
        overflowMenuButtons: [
          'quality',
        ],
        doubleClickForFullscreen: false,
      };
      const ui = await UiUtils.createUIThroughAPI(
          videoContainer, video, config);
      const controls = ui.getControls();

      const spy = spyOn(controls, 'toggleFullScreen');

      const controlsContainer =
          videoContainer.querySelector('.shaka-controls-container');
      // When double-click for fullscreen is disabled, it shouldn't happen.
      UiUtils.simulateEvent(controlsContainer, 'dblclick');
      await Util.shortDelay();
      expect(spy).not.toHaveBeenCalled();
      // Change the configuration and try again.
      config.doubleClickForFullscreen = true;
      (/** @type {!shaka.ui.Overlay} */ (ui)).configure(config);
      UiUtils.simulateEvent(controlsContainer, 'dblclick');
      await Util.shortDelay();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    describe('all the controls', () => {
      /** @type {!HTMLElement} */
      let controlsContainer;

      beforeEach(async () => {
        const ui = await UiUtils.createUIThroughAPI(videoContainer, video);
        player = ui.getControls().getLocalPlayer();
        const controlsContainers =
            videoContainer.getElementsByClassName('shaka-controls-container');
        expect(controlsContainers.length).toBe(1);
        controlsContainer = /** @type {!HTMLElement} */ (controlsContainers[0]);
      });

      it('stay visible if overflow menuButton is open', () => {
        const overflowMenus =
            videoContainer.getElementsByClassName('shaka-overflow-menu');
        expect(overflowMenus.length).toBe(1);
        const overflowMenu = /** @type {!HTMLElement} */ (overflowMenus[0]);

        const overflowMenuButtons =
            videoContainer.getElementsByClassName('shaka-overflow-menu-button');
        expect(overflowMenuButtons.length).toBe(1);
        const overflowMenuButton = overflowMenuButtons[0];

        overflowMenuButton.click();
        expect(overflowMenu.style.display).not.toBe('none');
        expect(controlsContainer.style.display).not.toBe('none');
      });
    });

    describe('overflow menu', () => {
      /** @type {!HTMLElement} */
      let overflowMenu;

      beforeEach(async () => {
        const config = {
          controlPanelElements: [
            'overflow_menu',
          ],
        };
        const ui = await UiUtils.createUIThroughAPI(
            videoContainer, video, config);
        player = ui.getControls().getLocalPlayer();

        const overflowMenus =
            videoContainer.getElementsByClassName('shaka-overflow-menu');
        expect(overflowMenus.length).toBe(1);
        overflowMenu = /** @type {!HTMLElement} */ (overflowMenus[0]);
      });

      it('has default buttons', () => {
        UiUtils.confirmElementFound(overflowMenu, 'shaka-caption-button');
        UiUtils.confirmElementFound(overflowMenu, 'shaka-resolution-button');
        UiUtils.confirmElementFound(overflowMenu, 'shaka-language-button');
        UiUtils.confirmElementFound(overflowMenu, 'shaka-pip-button');
      });

      it('becomes visible if overflowMenuButton was clicked', () => {
        let display = window.getComputedStyle(overflowMenu, null).display;
        expect(display).toBe('none');

        const overflowMenuButtons =
            videoContainer.getElementsByClassName('shaka-overflow-menu-button');
        expect(overflowMenuButtons.length).toBe(1);
        const overflowMenuButton = overflowMenuButtons[0];

        overflowMenuButton.click();
        display = overflowMenu.style.display;
        expect(display).not.toBe('none');
      });

      it('allows picture-in-picture only when the content has video',
          async () => {
            // Load fake content that contains only audio.
            const manifest =
                shaka.test.ManifestGenerator.generate((manifest) => {
                  manifest.addVariant(/* id= */ 0, (variant) => {
                    variant.addAudio(/* id= */ 1);
                  });
                });
            shaka.media.ManifestParser.registerParserByMime(
                fakeMimeType,
                () => new shaka.test.FakeManifestParser(manifest));

            await player.load(
                /* uri= */ 'fake', /* startTime= */ 0, fakeMimeType);
            const pipButtons =
            videoContainer.getElementsByClassName('shaka-pip-button');
            expect(pipButtons.length).toBe(1);
            const pipButton = pipButtons[0];

            // The picture-in-picture button should not be shown when the
            // content only has audio.
            expect(pipButton.classList.contains('shaka-hidden')).toBe(true);

            // The picture-in-picture window should not be open when the content
            // only has audio.
            expect(document.pictureInPictureElement).toBeFalsy();
          });

      it('is accessible', () => {
        for (const button of overflowMenu.childNodes) {
          expect(/** @type {!HTMLElement} */ (button)
              .hasAttribute('aria-label')).toBe(true);
        }
      });
    });

    describe('controls-button-panel', () => {
      /** @type {!HTMLElement} */
      let controlsButtonPanel;

      it('has default elements', async () => {
        await UiUtils.createUIThroughAPI(videoContainer, video);
        const controlsButtonPanels = videoContainer.getElementsByClassName(
            'shaka-controls-button-panel');

        expect(controlsButtonPanels.length).toBe(1);

        controlsButtonPanel =
          /** @type {!HTMLElement} */ (controlsButtonPanels[0]);

        UiUtils.confirmElementFound(controlsButtonPanel, 'shaka-current-time');
        UiUtils.confirmElementFound(controlsButtonPanel, 'shaka-mute-button');
        UiUtils.confirmElementFound(controlsButtonPanel,
            'shaka-fullscreen-button');
        UiUtils.confirmElementFound(controlsButtonPanel,
            'shaka-overflow-menu-button');

        UiUtils.confirmElementFound(videoContainer, 'shaka-seek-bar');

        // The default settings vary in mobile/desktop context.
        if (shaka.util.Platform.isMobile()) {
          UiUtils.confirmElementFound(videoContainer,
              'shaka-play-button-container');
          UiUtils.confirmElementFound(videoContainer, 'shaka-play-button');
          UiUtils.confirmElementMissing(controlsButtonPanel,
              'shaka-volume-bar');
        } else {
          UiUtils.confirmElementMissing(videoContainer,
              'shaka-play-button-container');
          UiUtils.confirmElementMissing(videoContainer, 'shaka-play-button');
          UiUtils.confirmElementFound(controlsButtonPanel, 'shaka-volume-bar');
        }
      });

      it('is accessible', async () => {
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

        await UiUtils.createUIThroughAPI(videoContainer, video, config);
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

    describe('control panel buttons with submenus', () => {
      /** @type {!HTMLElement} */
      let resolutionMenu;
      /** @type {!Element} */
      let resolutionMenuButton;
      /** @type {!HTMLElement} */
      let languageMenu;
      /** @type {!Element} */
      let languageMenuButton;

      beforeEach(async () => {
        const config = {
          controlPanelElements: [
            'quality',
            'language',
          ],
        };
        const ui = await UiUtils.createUIThroughAPI(
            videoContainer, video, config);
        player = ui.getControls().getLocalPlayer();

        const resolutionsMenus =
        videoContainer.getElementsByClassName('shaka-resolutions');
        expect(resolutionsMenus.length).toBe(1);
        resolutionMenu = /** @type {!HTMLElement} */ (resolutionsMenus[0]);

        const resolutionMenuButtons =
        videoContainer.getElementsByClassName('shaka-resolution-button');
        expect(resolutionMenuButtons.length).toBe(1);
        resolutionMenuButton = resolutionMenuButtons[0];

        const languageMenus =
        videoContainer.getElementsByClassName('shaka-audio-languages');
        expect(languageMenus.length).toBe(1);
        languageMenu = /** @type {!HTMLElement} */ (languageMenus[0]);

        const languageMenuButtons =
        videoContainer.getElementsByClassName('shaka-language-button');
        expect(languageMenuButtons.length).toBe(1);
        languageMenuButton = languageMenuButtons[0];
      });

      it('menus are initially hidden', () => {
        expect(resolutionMenu.classList.contains('shaka-hidden')).toBe(true);
        expect(languageMenu.classList.contains('shaka-hidden')).toBe(true);
      });

      it('a menu becomes visible if the button is clicked', () => {
        resolutionMenuButton.click();

        expect(resolutionMenu.classList.contains('shaka-hidden')).toBe(false);
      });

      it('a menu becomes hidden if the "close" button is clicked', () => {
        resolutionMenuButton.click();

        const backToOverflowButtons =
        videoContainer.getElementsByClassName('shaka-back-to-overflow-button');
        expect(backToOverflowButtons.length).toBe(2);
        const backToOverflowButton =
        /** @type {!HTMLElement} */ (backToOverflowButtons[0]);
        backToOverflowButton.click();

        expect(resolutionMenu.classList.contains('shaka-hidden')).toBe(true);
      });

      it('a menu becomes hidden if another one is opened', () => {
        resolutionMenuButton.click();
        languageMenuButton.click();

        expect(resolutionMenu.classList.contains('shaka-hidden')).toBe(true);
        expect(languageMenu.classList.contains('shaka-hidden')).toBe(false);
      });
    });

    describe('resolutions menu', () => {
      /** @type {!HTMLElement} */
      let resolutionsMenu;
      /** @type {shaka.ui.Controls} */
      let controls;

      beforeEach(async () => {
        const config = {
          controlPanelElements: [
            'overflow_menu',
          ],
          overflowMenuButtons: [
            'quality',
          ],
        };
        const ui = await UiUtils.createUIThroughAPI(
            videoContainer, video, config);
        controls = ui.getControls();
        player = controls.getLocalPlayer();

        const resolutionsMenus =
            videoContainer.getElementsByClassName('shaka-resolutions');
        expect(resolutionsMenus.length).toBe(1);
        resolutionsMenu = /** @type {!HTMLElement} */ (resolutionsMenus[0]);
      });

      it('becomes visible if resolutionButton was clicked', () => {
        let display = window.getComputedStyle(resolutionsMenu, null).display;
        expect(display).toBe('none');

        const resolutionButtons =
            videoContainer.getElementsByClassName('shaka-resolution-button');
        expect(resolutionButtons.length).toBe(1);
        const resolutionButton = resolutionButtons[0];

        resolutionButton.click();
        display = resolutionsMenu.style.display;
        expect(display).not.toBe('none');
      });

      it('clears the buffer when changing resolutions', async () => {
        // Load fake content that has more than one quality level.
        const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addVariant(0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.size(320, 240);
            });
            variant.addVideo(2, (stream) => {
              stream.size(640, 480);
            });
          });
        });
        shaka.media.ManifestParser.registerParserByMime(
            fakeMimeType, () => new shaka.test.FakeManifestParser(manifest));

        await player.load(
            /* uri= */ 'fake', /* startTime= */ 0, fakeMimeType);

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

      it('displays resolutions based on current stream', async () => {
        // A manifest with different resolutions at different
        // languages/channel-counts to test the current resolution list is
        // filtered.
        const manifest = shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addVariant(0, (variant) => {
            variant.primary = true;
            variant.language = 'en';
            variant.addVideo(1, (stream) => {
              stream.size(320, 240);
            });
            variant.addAudio(3, (stream) => {
              stream.channelsCount = 2;
            });
          });
          manifest.addVariant(4, (variant) => {
            variant.language = 'en';
            variant.addVideo(5, (stream) => {
              stream.size(640, 480);
            });
            variant.addAudio(6, (stream) => {
              stream.channelsCount = 2;
            });
          });
          manifest.addVariant(7, (variant) => {  // Duplicate with 4
            variant.language = 'en';
            variant.addVideo(8, (stream) => {
              stream.size(640, 480);
            });
            variant.addAudio(9, (stream) => {
              stream.channelsCount = 2;
            });
          });
          manifest.addVariant(10, (variant) => {
            variant.language = 'en';
            variant.addVideo(11, (stream) => {
              stream.size(1280, 720);
            });
            variant.addAudio(12, (stream) => {
              stream.channelsCount = 1;
            });
          });
          manifest.addVariant(13, (variant) => {
            variant.language = 'es';
            variant.addVideo(14, (stream) => {
              stream.size(960, 540);
            });
            variant.addAudio(15, (stream) => {
              stream.channelsCount = 2;
            });
          });
          manifest.addVariant(16, (variant) => {
            variant.language = 'fr';
            variant.addVideo(17, (stream) => {
              stream.size(256, 144);
            });
            variant.addAudio(18, (stream) => {
              stream.channelsCount = 2;
            });
          });
        });
        const getResolutions = () => {
          const resolutionButtons = videoContainer.querySelectorAll(
              'button.explicit-resolution > span');
          return Array.from(resolutionButtons)
              .map((btn) => btn.innerText)
              .sort();
        };
        shaka.media.ManifestParser.registerParserByMime(
            fakeMimeType, () => new shaka.test.FakeManifestParser(manifest));

        await player.load(
            /* uri= */ 'fake', /* startTime= */ 0, fakeMimeType);
        player.configure('abr.enabled', false);

        const tracks = player.getVariantTracks();
        const en1 =
            tracks.find((t) => t.language == 'en' && t.channelsCount == 1);
        const es = tracks.find((t) => t.language == 'es');

        // There is 1 variant with English 1-channel.
        goog.asserts.assert(en1, 'Unable to find tracks');
        player.selectVariantTrack(en1, true);
        await updateResolutionMenu();
        expect(getResolutions()).toEqual(['720p']);

        // There is 1 variant with Spanish 2-channel.
        goog.asserts.assert(es, 'Unable to find tracks');
        player.selectVariantTrack(es, true);
        await updateResolutionMenu();
        expect(getResolutions()).toEqual(['540p']);
      });

      it('displays audio quality based on current stream', async () => {
        const manifest =
          shaka.test.ManifestGenerator.generate((manifest) => {
            manifest.addVariant(0, (variant) => {
              variant.addAudio(0, (stream) => {
                stream.roles = ['main'];
              });
              variant.bandwidth = 100000;
            });
            manifest.addVariant(1, (variant) => {
              variant.addAudio(1);
              variant.bandwidth = 200000;
            });
          });

        shaka.media.ManifestParser.registerParserByMime(
            fakeMimeType, () => new shaka.test.FakeManifestParser(manifest));

        await player.load(
            /* uri= */ 'fake', /* startTime= */ 0, fakeMimeType);

        const qualityButtons = videoContainer.querySelectorAll(
            'button.explicit-resolution > span');
        const qualityOptions =
            Array.from(qualityButtons).map((btn) => btn.innerText);

        expect(qualityOptions).toEqual(['200 kbits/s', '100 kbits/s']);
      });

      /**
       * Use internals to update the resolution menu.  Our fake manifest can
       * cause problems with startup where the Player will get stuck using
       * "deferred" switches, so we won't get events and the resolution menu
       * won't update.
       *
       * @suppress {accessControls}
       */
      async function updateResolutionMenu() {
        await Util.shortDelay();
        // TODO(#2089): We should be able to stop once we find one, but since
        // there are multiple ResolutionMenu objects, we need to update all of
        // them.
        let found = false;
        for (const elem of controls.elements_) {
          if (elem instanceof shaka.ui.OverflowMenu) {
            for (const child of elem.children_) {
              if (child instanceof shaka.ui.ResolutionSelection) {
                child.updateResolutionSelection_();
                found = true;
              }
            }
          }
        }
        goog.asserts.assert(found, 'Unable to find resolution menu');
      }
    });

    describe('custom context menu', () => {
      /** @type {!HTMLElement} */
      let controlsContainer;
      /** @type {!HTMLElement} */
      let contextMenu;

      beforeEach(async () => {
        const config = {
          customContextMenu: true,
          contextMenuElements: [
            'fakeElement',
            'statistics',
            'fakeElement',
          ],
        };
        const ui = await UiUtils.createUIThroughAPI(
            videoContainer, video, config);

        controlsContainer = ui.getControls().getControlsContainer();

        const contextMenus =
        videoContainer.getElementsByClassName('shaka-context-menu');
        expect(contextMenus.length).toBe(1);
        contextMenu = /** @type {!HTMLElement} */
            (contextMenus[0]);
      });

      it('responds to contextmenu event', () => {
        expect(contextMenu.classList.contains('shaka-hidden')).toBe(true);
        UiUtils.simulateEvent(controlsContainer, 'contextmenu');
        expect(contextMenu.classList.contains('shaka-hidden')).toBe(false);
        UiUtils.simulateEvent(controlsContainer, 'contextmenu');
        expect(contextMenu.classList.contains('shaka-hidden')).toBe(true);
      });
      it('hides on click event', () => {
        UiUtils.simulateEvent(controlsContainer, 'contextmenu');
        UiUtils.simulateEvent(controlsContainer, 'click');
        expect(contextMenu.classList.contains('shaka-hidden')).toBe(true);
        UiUtils.simulateEvent(controlsContainer, 'contextmenu');
        UiUtils.simulateEvent(window, 'click');
        expect(contextMenu.classList.contains('shaka-hidden')).toBe(true);
      });
      it('builds internal elements', () => {
        expect(contextMenu.childNodes.length).toBe(1);

        expect(contextMenu.childNodes[0]['className'])
            .toBe('shaka-statistics-button');
      });
    });

    describe('statistics context menu', () => {
      /** @type {!HTMLElement} */
      let statisticsButton;
      /** @type {!HTMLElement} */
      let statisticsContainer;

      beforeEach(async () => {
        const config = {
          customContextMenu: true,
          contextMenuElements: [
            'statistics',
          ],
          statisticsList: Object.keys(new shaka.util.Stats().getBlob()),
        };
        const ui = await UiUtils.createUIThroughAPI(
            videoContainer, video, config);
        player = ui.getControls().getLocalPlayer();

        const statisticsButtons =
        videoContainer.getElementsByClassName('shaka-statistics-button');
        expect(statisticsButtons.length).toBe(1);
        statisticsButton = /** @type {!HTMLElement} */
            (statisticsButtons[0]);

        const statisticsContainers =
        videoContainer.getElementsByClassName('shaka-statistics-container');
        expect(statisticsContainers.length).toBe(1);
        statisticsContainer = /** @type {!HTMLElement} */
            (statisticsContainers[0]);
      });

      it('appears and disappears on toggle', () => {
        expect(statisticsContainer.classList.contains('shaka-hidden'))
            .toBe(true);

        statisticsButton.click();
        expect(statisticsContainer.classList.contains('shaka-hidden'))
            .toBe(false);

        statisticsButton.click();
        expect(statisticsContainer.classList.contains('shaka-hidden'))
            .toBe(true);
      });

      it('displays all the available statistics', () => {
        const skippedStats = ['stateHistory', 'switchHistory'];
        const nodes = statisticsContainer.childNodes;
        let nodeIndex = 0;

        for (const statistic in new shaka.util.Stats().getBlob()) {
          if (!skippedStats.includes(statistic)) {
            // Text content of label (without ':') is a valid statistic
            const label = nodes[nodeIndex].childNodes[0].textContent;
            expect(label.replace(':', '')).toBe(statistic);

            // Value has been parsed and it is not the default 'NaN'
            const value = nodes[nodeIndex].childNodes[1].textContent;
            expect(value).not.toBe('NaN');

            nodeIndex += 1;
          }
        }
      });
      it('is updated periodically', async () => {
        // There is no guaranteed ordering, so fetch by the stat name.
        function getStatsElementByName(name) {
          const nodes = statisticsContainer.childNodes;
          for (const node of nodes) {
            if (node.hasChildNodes() &&
                node.childNodes[0].textContent.includes(name)) {
              return node;
            }
          }
          return null;
        }

        function getStatsFromContainer() {
          width = getStatsElementByName(
              'width').childNodes[1].textContent.replace(' (px)', '');
          height = getStatsElementByName(
              'height').childNodes[1].textContent.replace(' (px)', '');
          bufferingTime = getStatsElementByName(
              'bufferingTime').childNodes[1].textContent.replace(' (s)', '');
        }

        /** @type {!string} */
        let width;
        /** @type {!string} */
        let height;
        /** @type {!string} */
        let bufferingTime;
        /** @type {!string} */
        let lastBufferingTime;

        const manifest =
        shaka.test.ManifestGenerator.generate((manifest) => {
          manifest.addVariant(/* id= */ 0, (variant) => {
            variant.addVideo(1, (stream) => {
              stream.size(1920, 1080);
            });
          });
        });

        shaka.media.ManifestParser.registerParserByMime(
            fakeMimeType, () => new shaka.test.FakeManifestParser(manifest));

        await player.load(
            /* uri= */ 'fake', /* startTime= */ 0, fakeMimeType);

        // Placeholder statistics are available before toggle
        getStatsFromContainer();
        expect(width).toBe('NaN');
        expect(height).toBe('NaN');
        expect(bufferingTime).toBe('NaN');

        // Statistics are displayed on toggle
        statisticsButton.click();
        await Util.delay(0.2);

        getStatsFromContainer();
        expect(width).toBe('1920');
        expect(height).toBe('1080');
        expect(bufferingTime).toBeGreaterThanOrEqual(0.1);

        // Statistics are updated over time
        lastBufferingTime = bufferingTime;
        await Util.delay(0.2);

        getStatsFromContainer();
        expect(bufferingTime).toBeGreaterThan(lastBufferingTime);

        // Statistics stop updating when the container is hidden
        statisticsButton.click();
        lastBufferingTime = bufferingTime;
        await Util.delay(0.2);

        getStatsFromContainer();
        expect(bufferingTime).toBe(lastBufferingTime);
      });
    });
  });


  /**
   * @param {!HTMLElement} container
   * @suppress {visibility}
   */
  function checkBasicUIElements(container) {
    const videos = container.getElementsByTagName('video');
    expect(videos.length).not.toBe(0);

    UiUtils.confirmElementFound(container, 'shaka-spinner-svg');
    UiUtils.confirmElementFound(container, 'shaka-overflow-menu');
    UiUtils.confirmElementFound(container, 'shaka-controls-button-panel');
  }
});
