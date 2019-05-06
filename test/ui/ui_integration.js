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

describe('UI', () => {
  const Util = shaka.test.Util;

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
  /** @type {!Element} */
  let cssLink;
  /** @type {!shaka.ui.Controls} */
  let controls;

  let compiledShaka;

  beforeAll(async () => {
    cssLink = document.createElement('link');
    await Util.setupCSS(cssLink);

    compiledShaka = await Util.loadShaka(getClientArg('uncompiled'));
    await shaka.test.TestScheme.createManifests(compiledShaka, '_compiled');
  });

  beforeEach(async () => {
    video = shaka.util.Dom.createVideoElement();

    videoContainer = shaka.util.Dom.createHTMLElement('div');
    videoContainer.appendChild(video);
    document.body.appendChild(videoContainer);
    player = new compiledShaka.Player(video);

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

    const ui = new compiledShaka.ui.Overlay(player, videoContainer, video);
    ui.configure(config);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();
    waiter = new shaka.test.Waiter(eventManager);

    controls = ui.getControls();

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake(function(event) { fail(event.detail); });
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
    eventManager.listen(controls, 'error', Util.spyFunc(onErrorSpy));

    await player.load('test:sintel_multi_lingual_multi_res_compiled');
    // For this event, we ignore a timeout, since we sometimes miss this event
    // on Tizen.  But expect that the video is ready anyway.
    await waiter.failOnTimeout(false).waitForEvent(video, 'canplay');
    expect(video.readyState).not.toEqual(0);

    // All other events after this should fail on timeout (the default).
    await waiter.failOnTimeout(true);
  });

  afterEach(async () => {
    eventManager.release();
    waiter = null;
    await shaka.test.Util.cleanupUI();
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
    });


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
    });


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
      expect(getSelectedTrack(getTracks()).language).toEqual(oldLanguage);

      const button = languagesToButtons.get(newLanguage);
      button.click();

      // Wait for the change to take effect
      await waiter.waitForEvent(player, playerEventName);
      expect(getSelectedTrack(getTracks()).language).toEqual(newLanguage);
    }


    /**
     * @param {string} controlsEventName
     * @param {function():!Array.<!shaka.extern.Track>} getTracks
     * @param {function(string)} selectLanguage
     */
    async function verifyLanguageChangeViaAPI(
        controlsEventName, getTracks, selectLanguage) {
      expect(getSelectedTrack(getTracks()).language).toEqual(oldLanguage);

      const p = waiter.waitForEvent(controls, controlsEventName);

      selectLanguage(newLanguage);

      // Wait for the UI to get updated
      await p;

      // Buttons were re-created on variant change
      languageButtons = filterButtons(languageMenu.childNodes,
          ['shaka-back-to-overflow-button', 'shaka-turn-captions-off-button']);

      languagesToButtons = mapChoicesToButtons(
        /* allButtons= */ languageButtons,
        /* choices */ langsFromContent,
        /* modifier */ getNativeName
      );

      const button = languagesToButtons.get(newLanguage);
      const isChosen = button.querySelector('.shaka-chosen-item');

      expect(isChosen).not.toBe(null);
    }
  });


  describe('resolution selection', () => {
    /** @type {!Map.<number, !HTMLElement>} */
    let resolutionsToButtons;
    /** @type {!Array.<number>} */
    let resolutionsFromContent;
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


    beforeEach(async () => {
      oldResolution = 182;
      newResolution = 272;
      // Chosen language affects which resolutions get
      // displayed in the UI.
      preferredLanguage = 'en';

      // Disable abr for the resolution tests
      const config = {abr: {enabled: false}};
      player.configure(config);

      player.selectAudioLanguage(preferredLanguage);
      await waiter.waitForEvent(player, 'variantchanged');

      resolutionsMenu = shaka.util.Dom.getElementByClassName(
          'shaka-resolutions', videoContainer);

      updateResolutionButtonsAndMap();

      oldResolutionTrack = findTrackWithHeight(tracks, oldResolution);
    });


    it('contains all the relevant resolutions', () => {
      const formattedResolutions = resolutionsFromContent.map((res) => {
        return formatResolution(res);
      });
      verifyItems(formattedResolutions, resolutionButtons);
    });


    it('changing resolution via UI has effect on the player', async () => {
      player.selectVariantTrack(oldResolutionTrack);

      // Wait for the change to take effect
      await waiter.waitForEvent(player, 'variantchanged');
      // Update the tracks
      tracks = player.getVariantTracks();
      expect(getSelectedTrack(tracks).height).toEqual(oldResolution);

      const button = resolutionsToButtons.get(newResolution);
      button.click();

      // Wait for the change to take effect
      await waiter.waitForEvent(player, 'variantchanged');
      // Update the tracks
      tracks = player.getVariantTracks();
      expect(getSelectedTrack(tracks).height).toEqual(newResolution);
    });


    it('changing resolution via API has effect on the UI', async () => {
      // Start with the old resolution
      player.selectVariantTrack(oldResolutionTrack);

      // Wait for the change to take effect
      await waiter.waitForEvent(player, 'variantchanged');
      updateResolutionButtonsAndMap();
      expect(getSelectedTrack(tracks).height).toEqual(oldResolution);

      const p = waiter.waitForEvent(controls, 'resolutionselectionupdated');

      const newResolutionTrack = findTrackWithHeight(tracks, newResolution);
      player.selectVariantTrack(newResolutionTrack);

      // Wait for the change to take effect
      await p;

      updateResolutionButtonsAndMap();

      expect(getSelectedTrack(tracks).height).toEqual(newResolution);

      const button = resolutionsToButtons.get(newResolution);
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
      const button = resolutionsToButtons.get(newResolution);
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

    it('restores the resolutions menu after audio-only playback', async () => {
      /** @type {HTMLElement} */
      const resolutionButton = shaka.util.Dom.getElementByClassName(
          'shaka-resolution-button', videoContainer);

      // Load an audio-only clip.  The menu should be hidden.
      await player.load('test:sintel_audio_only_compiled');
      expect(player.isAudioOnly()).toBe(true);
      expect(resolutionButton.classList.contains('shaka-hidden')).toBe(true);

      // Load an audio-video clip.  The menu should be visible again.
      await player.load('test:sintel_multi_lingual_multi_res_compiled');
      expect(player.isAudioOnly()).toBe(false);
      expect(resolutionButton.classList.contains('shaka-hidden')).toBe(false);
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
     * appears in the UI: height + 'p'.
     *
     * @param {number} height
     * @return {string}
     */
    function formatResolution(height) {
      return height.toString() + 'p';
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

      resolutionsFromContent = tracks.map((track) => {
        return track.height;
      });

      resolutionButtons = filterButtons(
        /* buttons= */ resolutionsMenu.childNodes,
        /* excludeClasses= */ [
          'shaka-back-to-overflow-button',
          'shaka-enable-abr-button',
      ]);

      resolutionsToButtons = mapChoicesToButtons(
          /* buttons= */ resolutionButtons,
          /* choices= */ resolutionsFromContent,
          /* modifier=*/ formatResolution);
    }
  });

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
    * @param {!Array.<string>} choices
    * @param {function(string):string|function(number):string} modifier
    * @return {!Map.<string, !HTMLElement>|!Map.<number, !HTMLElement>}
    */
  function mapChoicesToButtons(buttons, choices, modifier) {
    expect(buttons.length).toEqual(choices.length);

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
