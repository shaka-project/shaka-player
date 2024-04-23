/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('UI', () => {
  const Util = shaka.test.Util;
  const UiUtils = shaka.test.UiUtils;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

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
    cssLink = /** @type {!HTMLLinkElement} */(document.createElement('link'));
    await UiUtils.setupCSS(cssLink);

    compiledShaka =
        await shaka.test.Loader.loadShaka(getClientArg('uncompiled'));
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
  });

  beforeEach(async () => {
    video = shaka.test.UiUtils.createVideoElement();

    videoContainer = shaka.util.Dom.createHTMLElement('div');
    videoContainer.appendChild(video);
    document.body.appendChild(videoContainer);
    player = new compiledShaka.Player();
    await player.attach(video);

    // Create UI
    // Add all of the buttons we have
    const config = {
      controlPanelElements: [
        'time_and_duration',
        'mute',
        'volume',
        'fullscreen',
        'overflow_menu',
        'fast_forward',
        'rewind',
      ],
      overflowMenuButtons: [
        'captions',
        'quality',
        'language',
        'picture_in_picture',
        'cast',
      ],
      // TODO: Cast receiver id to test chromecast integration
    };

    ui = new compiledShaka.ui.Overlay(player, videoContainer, video);
    ui.configure(config);

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

    // These tests expect text to be streaming upfront, so always stream text.
    player.configure('streaming.alwaysStreamText', true);

    await player.load('test:sintel_multi_lingual_multi_res_compiled');
    // For this event, we ignore a timeout, since we sometimes miss this event
    // on Tizen.  But expect that the video is ready anyway.
    await waiter.failOnTimeout(false).waitForEvent(video, 'canplay');
    expect(video.readyState).not.toBe(0);

    // All other events after this should fail on timeout (the default).
    await waiter.failOnTimeout(true);
  });

  afterEach(async () => {
    eventManager.release();
    waiter = null;
    await UiUtils.cleanupUI();
  });

  afterAll(() => {
    document.head.removeChild(cssLink);
  });

  describe('language selections', () => {
    /** @type {!Map.<string, !HTMLElement>} */
    let languagesToButtons;
    /** @type {!Array.<string>} */
    let langsFromContent;
    /** @type {!Array.<!HTMLElement>} */
    let languageButtons;
    /** @type {!Element} */
    let languageMenu;
    /** @type {string} */
    let oldLanguage;
    /** @type {string} */
    let newLanguage;

    describe('audio', () => {
      beforeEach(() => {
        oldLanguage = 'en';
        newLanguage = 'es';
        languageMenu = shaka.util.Dom.getElementByClassName(
            'shaka-audio-languages', videoContainer);
        setupLanguageTests(player.getAudioLanguagesAndRoles());
      });

      it('contains all the languages', () => {
        verifyLanguages();
      });

      it('choosing language through UI has effect on player', async () => {
        await verifyLanguageChangeViaUI(
            'variantchanged', () => player.getVariantTracks());
      });

      it('choosing language through API has effect on UI', async () => {
        await verifyLanguageChangeViaAPI(
            'languageselectionupdated',
            () => player.getVariantTracks(),
            (language) => player.selectAudioLanguage(language));
      });
    });  // describe('audio')

    describe('caption selection', () => {
      beforeEach(() => {
        oldLanguage = 'zh';
        newLanguage = 'fr';
        languageMenu = shaka.util.Dom.getElementByClassName(
            'shaka-text-languages', videoContainer);
        setupLanguageTests(player.getTextLanguagesAndRoles());
      });

      it('contains all the languages', () => {
        verifyLanguages();
      });

      it('choosing caption language through UI has effect on player',
          async () => {
            await verifyLanguageChangeViaUI(
                'textchanged', () => player.getTextTracks());
          });

      it('choosing language through API has effect on UI', async () => {
        // Enable & verify the text, or else the text won't be streamed and the
        // language selection won't do anything.
        await player.setTextTrackVisibility(true);
        expect(player.isTextTrackVisible()).toBe(true);

        await verifyLanguageChangeViaAPI(
            'captionselectionupdated',
            () => player.getTextTracks(),
            (language) => player.selectTextLanguage(language));
      });

      it('turning captions off through UI has effect on player', async () => {
        // Enable & verify the text.
        await player.setTextTrackVisibility(true);
        expect(player.isTextTrackVisible()).toBe(true);

        // Find and click the 'Off' button
        getOffButton().click();
        // Wait for the change to take effect
        await waiter.waitForEvent(player, 'texttrackvisibility');

        expect(player.isTextTrackVisible()).toBe(false);
      });

      it('turning captions off through API has effect on UI', async () => {
        // This test is invalid if the text is not initially visible, because
        // setTextTrackVisibility() does nothing if there are no changes.
        await player.setTextTrackVisibility(true);
        expect(player.isTextTrackVisible()).toBe(true);

        const p = waiter.waitForEvent(controls, 'captionselectionupdated');

        // Disable & verify the text.
        await player.setTextTrackVisibility(false);
        expect(player.isTextTrackVisible()).toBe(false);

        // Wait for the change to take effect
        await p;

        const offButtonChosen =
            getOffButton().querySelector('.shaka-chosen-item');
        expect(offButtonChosen).not.toBe(null);
      });

      /**
       * @return {Element}
       */
      function getOffButton() {
        const offButton =
            languageMenu.querySelector('.shaka-turn-captions-off-button');

        expect(offButton).not.toBe(null);
        return offButton;
      }
    });  // describe('caption selection')

    /**
     * @param {!Array.<shaka.extern.LanguageRole>} languagesAndRoles
     */
    function setupLanguageTests(languagesAndRoles) {
      langsFromContent = languagesAndRoles.map((langAndRole) => {
        return langAndRole.language;
      });

      languageButtons = filterButtons(languageMenu.childNodes,
          ['shaka-back-to-overflow-button', 'shaka-turn-captions-off-button']);

      languagesToButtons = mapChoicesToButtons(
          /* allButtons= */ languageButtons,
          /* choices= */ langsFromContent,
          /* modifier= */ getNativeName,
      );
    }

    /**
     * @param {string} language
     * @return {string}
     */
    function getNativeName(language) {
      return mozilla.LanguageMapping[language].nativeName;
    }

    /**
     * Make sure languages specified by the manifest match what we show on UI.
     */
    function verifyLanguages() {
      const langsFromContentNative = langsFromContent.map((lang) => {
        return getNativeName(lang);
      });

      verifyItems(langsFromContentNative, languageButtons);
    }

    /**
     * @param {string} playerEventName
     * @param {function():!Array.<!shaka.extern.Track>} getTracks
     */
    async function verifyLanguageChangeViaUI(playerEventName, getTracks) {
      expect(getSelectedTrack(getTracks()).language).toBe(oldLanguage);

      const button = languagesToButtons.get(newLanguage);
      button.click();

      // Wait for the change to take effect
      await waiter.waitForEvent(player, playerEventName);
      expect(getSelectedTrack(getTracks()).language).toBe(newLanguage);
    }

    /**
     * @param {string} controlsEventName
     * @param {function():!Array.<!shaka.extern.Track>} getTracks
     * @param {function(string)} selectLanguage
     */
    async function verifyLanguageChangeViaAPI(
        controlsEventName, getTracks, selectLanguage) {
      expect(getSelectedTrack(getTracks()).language).toBe(oldLanguage);

      const p = waiter.waitForEvent(controls, controlsEventName);

      selectLanguage(newLanguage);

      // Wait for the UI to get updated
      await p;

      // Buttons were re-created on variant change
      languageButtons = filterButtons(languageMenu.childNodes,
          ['shaka-back-to-overflow-button', 'shaka-turn-captions-off-button']);

      languagesToButtons = mapChoicesToButtons(
          /* allButtons= */ languageButtons,
          /* choices= */ langsFromContent,
          /* modifier= */ getNativeName);

      const button = languagesToButtons.get(newLanguage);
      const isChosen = button.querySelector('.shaka-chosen-item');

      expect(isChosen).not.toBe(null);
    }
  });  // describe('language selections')

  describe('resolution selection', () => {
    /** @type {!Map.<number, !HTMLElement>} */
    let resolutionsToButtons;
    /** @type {!Array.<!HTMLElement>} */
    let resolutionButtons;
    /** @type {!Element} */
    let resolutionsMenu;
    /** @type {number} */
    let oldResolution;
    /** @type {number} */
    let newResolution;
    /** @type {!Array.<shaka.extern.Track>} */
    let tracks;
    /** @type {string} */
    let preferredLanguage;
    /** @type {!shaka.extern.Track} */
    let oldResolutionTrack;
    /** @type {number} */
    let newResolutionTrackId;

    beforeEach(async () => {
      oldResolution = 182;
      newResolution = 272;
      // Chosen language affects which resolutions get
      // displayed in the UI.
      preferredLanguage = 'en';

      // Disable abr for the resolution tests
      player.configure('abr.enabled', false);

      const selectedLanguage =
          getSelectedTrack(player.getVariantTracks()).language;
      if (selectedLanguage != preferredLanguage) {
        player.selectAudioLanguage(preferredLanguage);
        await waiter.waitForEvent(player, 'variantchanged');
      }

      resolutionsMenu = shaka.util.Dom.getElementByClassName(
          'shaka-resolutions', videoContainer);

      updateResolutionButtonsAndMap();

      oldResolutionTrack = findTrackWithHeight(tracks, oldResolution);
      newResolutionTrackId = findTrackWithHeight(tracks, newResolution).id;

      const selectedResolution =
          getSelectedTrack(player.getVariantTracks()).height;
      if (selectedResolution != oldResolution) {
        player.selectVariantTrack(oldResolutionTrack);
        await waiter.waitForEvent(player, 'variantchanged');
      }
    });

    it('contains all the relevant resolutions', () => {
      const formattedResolutions =
          tracks.map((t) => formatResolution(t.id, tracks));
      verifyItems(formattedResolutions, resolutionButtons);
    });

    it('changing resolution via UI has effect on the player', async () => {
      // Update the tracks
      tracks = player.getVariantTracks();
      expect(getSelectedTrack(tracks).height).toBe(oldResolution);

      const button = resolutionsToButtons.get(newResolutionTrackId);
      button.click();

      // Wait for the change to take effect
      await waiter.waitForEvent(player, 'variantchanged');
      // Update the tracks
      tracks = player.getVariantTracks();
      expect(getSelectedTrack(tracks).height).toBe(newResolution);
    });

    it('changing resolution via API has effect on the UI', async () => {
      updateResolutionButtonsAndMap();
      expect(getSelectedTrack(tracks).height).toBe(oldResolution);

      const p = waiter.waitForEvent(controls, 'resolutionselectionupdated');

      const newResolutionTrack = findTrackWithHeight(tracks, newResolution);
      player.selectVariantTrack(newResolutionTrack);

      // Wait for the change to take effect
      await p;

      updateResolutionButtonsAndMap();

      expect(getSelectedTrack(tracks).height).toBe(newResolution);

      const button = resolutionsToButtons.get(newResolutionTrackId);
      const isChosen = button.querySelector('.shaka-chosen-item');

      expect(isChosen).not.toBe(null);
    });

    it('selecting Auto via UI enables ABR', async () => {
      // We disabled abr in beforeEach()
      expect(player.getConfiguration().abr.enabled).toBe(false);

      const p = waiter.waitForEvent(controls, 'resolutionselectionupdated');

      // Find the 'Auto' button
      const auto = getAutoButton();
      auto.click();

      await p;
      expect(player.getConfiguration().abr.enabled).toBe(true);
    });

    it('selecting specific resolution disables ABR', async () => {
      const config = {abr: {enabled: true}};
      player.configure(config);

      const p = waiter.waitForEvent(controls, 'resolutionselectionupdated');

      // Any resolution would works
      const button = resolutionsToButtons.get(newResolutionTrackId);
      button.click();

      await p;
      expect(player.getConfiguration().abr.enabled).toBe(false);
    });

    it('enabling ABR via API gets the Auto button selected', async () => {
      expect(player.getConfiguration().abr.enabled).toBe(false);

      // Setup listener to the ui event. The event, trigerring the update
      // is dispatched inside player.configure(), so we need to start
      // listening before calling it.
      const uiReady = waiter.waitForEvent(
          controls, 'resolutionselectionupdated');
      const config = {abr: {enabled: true}};

      player.configure(config);

      await uiReady;

      const auto = getAutoButton();
      const isChosen = auto.querySelector('.shaka-chosen-item');

      expect(isChosen).not.toBe(null);
    });

    /**
     * @return {Element}
     */
    function getAutoButton() {
      const auto =
          resolutionsMenu.querySelector('.shaka-enable-abr-button');

      expect(auto).not.toBe(null);
      return auto;
    }

    /**
     * Gets the resolution to the same format it
     * appears in the UI
     *
     * @param {number} id
     * @param {!Array.<!shaka.extern.Track>} tracks
     * @return {string}
     */
    function formatResolution(id, tracks) {
      const track = tracks.find((t) => t.id == id);
      const trackHeight = track.height || 0;
      const trackWidth = track.width || 0;
      let height = trackHeight;
      const aspectRatio = trackWidth / trackHeight;
      if (aspectRatio > (16 / 9)) {
        height = Math.round(trackWidth * 9 / 16);
      }
      let text = height + 'p';
      if (height == 2160) {
        text = '4K';
      }
      return text;
    }

    /**
     * @param {!Array.<!shaka.extern.Track>} tracks
     * @param {number} height
     * @return {shaka.extern.Track}
     */
    function findTrackWithHeight(tracks, height) {
      let trackWithRes = null;
      for (const track of tracks) {
        if (track.height == height) {
          trackWithRes = track;
        }
      }
      goog.asserts.assert(trackWithRes != null,
          'Should have found track!');

      return trackWithRes;
    }

    function updateResolutionButtonsAndMap() {
      tracks = player.getVariantTracks();
      tracks = tracks.filter((track) => {
        return track.language == preferredLanguage;
      });

      resolutionButtons = filterButtons(
          /* buttons= */ resolutionsMenu.childNodes,
          /* excludeClasses= */ [
            'shaka-back-to-overflow-button',
            'shaka-enable-abr-button',
          ]);

      resolutionsToButtons = mapChoicesToButtons(
          /* buttons= */ resolutionButtons,
          /* choices= */ tracks.map((track) => track.id),
          /* modifier= */ (id) => formatResolution(id, tracks));
    }
  });  // describe('resolution selection')

  describe('uncompiled UI element plugin', () => {
    it('has access to the features of the compiled base class', () => {
      let constructed = false;

      // For the uncompiled element below, we won't want to create real
      // controls.  Real controls would create a CastProxy which would conflict
      // with the compiled version instantiated above.
      const fakeControls = /** @type {!shaka.ui.Controls} */({
        getLocalization: () => null,
        getPlayer: () => player,
        getVideo: () => null,
        getAd: () => null,
      });

      /** @extends {shaka.ui.Element} */
      const UncompiledElementType = class extends shaka.ui.Element {};
      const uncompiledElement = new UncompiledElementType(
          videoContainer, fakeControls);
      uncompiledElement.release();

      /** @extends {shaka.ui.Element} */
      const TestElement = class extends compiledShaka.ui.Element {
        /**
         * @param {!HTMLElement} parent
         * @param {!shaka.ui.Controls} controls
         * @suppress {checkTypes} since we use "in" and "[]" on a struct.
         */
        constructor(parent, controls) {
          super(parent, controls);
          constructed = true;

          // The compiled base class's protected members should still have their
          // original names.  Otherwise, apps can't register uncompiled plugins.
          // Rather than list them and potentially let them get out of date, use
          // the uncompiled library as a reference.
          for (const k in uncompiledElement) {
            if (k.endsWith('_')) {
              // Skip private members.
              continue;
            }

            // All public and protected members of the uncompiled base class
            // should be available on "this" with their original names.
            expect(this[k]).withContext(k).toBeDefined();
          }
        }
      };

      /** @implements {shaka.extern.IUIElement.Factory} */
      const TestElementFactory = class {
        /** @override */
        create(rootElement, controls) {
          return new TestElement(rootElement, controls);
        }
      };

      compiledShaka.ui.Controls.registerElement(
          'test_element', new TestElementFactory());

      constructed = false;
      ui.configure('controlPanelElements', ['test_element']);
      // The constructor contains expectations, so make sure we called it.
      expect(constructed).toBe(true);
    });
  });  // describe('UI element plugins')

  /**
   * @param {!Array.<!shaka.extern.Track>} tracks
   * @return {!shaka.extern.Track}
   */
  function getSelectedTrack(tracks) {
    const activeTracks = tracks.filter((track) => {
      return track.active == true;
    });

    return activeTracks[0];
  }

  /**
    * @param {!Array.<!HTMLElement>} buttons
    * @param {!Array.<string>|!Array.<number>} choices
    * @param {function(string):string|function(number):string} modifier
    * @return {!Map.<string, !HTMLElement>|!Map.<number, !HTMLElement>}
    */
  function mapChoicesToButtons(buttons, choices, modifier) {
    expect(buttons.length).toBe(choices.length);

    const map = new Map();

    // Find which choice corresponds to which button
    for (const choice of choices) {
      for (const button of buttons) {
        expect(button.childNodes.length).toBeGreaterThan(0);
        const uiOption = button.childNodes[0].textContent;
        const contentOption = modifier(choice);
        if (contentOption == uiOption) {
          map.set(choice, button);
        }
      }
    }

    return map;
  }

  /**
   * Filter out buttons with given classes.
   *
   * @param {!NodeList} buttons
   * @param {!Array.<string>} excludeClasses
   * @return {!Array.<!HTMLElement>}
   */
  function filterButtons(buttons, excludeClasses) {
    return shaka.util.Iterables.filter(buttons,
        (node) => {
          const button = shaka.util.Dom.asHTMLElement(node);
          for (const excludeClass of excludeClasses) {
            if (button.classList.contains(excludeClass)) {
              return false;
            }
          }
          return true;
        });
  }

  /**
   * Make sure elements from content match their UI representation.
   * (The order doesn't matter).
   *
   * @param {!Array.<string>} elementsFromContent
   * @param {!Array.<!HTMLElement>} elementsFromUI
   */
  function verifyItems(elementsFromContent, elementsFromUI) {
    for (const element of elementsFromUI) {
      expect(element.childNodes.length).toBeGreaterThan(0);
      const elementName = element.childNodes[0].textContent;
      expect(elementsFromContent.indexOf(elementName)).not.toBe(-1);
    }
  }
});
