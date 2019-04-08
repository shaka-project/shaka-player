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
  const asHTMLElement = shaka.util.Dom.asHTMLElement;
  const getElementByClassName = shaka.util.Dom.getElementByClassName;

  /** @type {!jasmine.Spy} */
  let onErrorSpy;

  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {!HTMLElement} */
  let videoContainer;
  /** @type {shaka.Player} */
  let player;
  /** @type {shaka.util.EventManager} */
  let eventManager;
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

    const ui =
        new compiledShaka.ui.Overlay(player, videoContainer, video, config);

    // Grab event manager from the uncompiled library:
    eventManager = new shaka.util.EventManager();

    controls = ui.getControls();

    onErrorSpy = jasmine.createSpy('onError');
    onErrorSpy.and.callFake(function(event) { fail(event.detail); });
    eventManager.listen(player, 'error', Util.spyFunc(onErrorSpy));
    eventManager.listen(controls, 'error', Util.spyFunc(onErrorSpy));

    await player.load('test:sintel_multi_lingual_multi_res_compiled');
    await new Promise((resolve) => {
        eventManager.listenOnce(player,
            'periodreadyforstreaming', resolve);
    });
  });

  afterEach(async () => {
    eventManager.release();

    await player.destroy();

    document.body.removeChild(videoContainer);
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
        languageMenu = getElementByClassName(
            'shaka-audio-languages', videoContainer);
        setupLanguageTests(player.getAudioLanguagesAndRoles());
      });

      it('contains all the languages', () => {
        verifyLanguages();
      });

      it('choosing language through UI has effect on player', () => {
        verifyLanguageChangeViaUI('variantchanged', player.getVariantTracks());
      });

      it('choosing language through API has effect on UI', () => {
        verifyLanguageChangeViaAPI(
            'languageselectionupdated', player.getVariantTracks());
      });
    });


    describe('caption selection', () => {
      beforeEach(() => {
        oldLanguage = 'zh';
        newLanguage = 'fr';
        languageMenu = getElementByClassName(
            'shaka-text-languages', videoContainer);
        setupLanguageTests(player.getTextLanguagesAndRoles());
      });

      it('contains all the languages', () => {
        verifyLanguages();
      });

      it('choosing caption language through UI has effect on player', () => {
        verifyLanguageChangeViaUI('textchanged', player.getTextTracks());
      });

      it('choosing language through API has effect on UI', () => {
        verifyLanguageChangeViaAPI(
            'captionselectionupdated', player.getTextTracks());
      });

      it('turning captions off through UI has effect on player', async () => {
        // Enable & verify the text.
        await player.setTextTrackVisibility(true);
        expect(player.isTextTrackVisible()).toBe(true);

        // Find and click the 'Off' button
        getOffButton().click();

        // Wait for the change to take effect
        await new Promise((resolve) => {
          eventManager.listenOnce(player, 'texttrackvisibility', resolve);
        });

        expect(player.isTextTrackVisible()).toBe(false);
      });

      it('turning captions off through API has effect on UI', async () => {
        // Disable & verify the text.
        await player.setTextTrackVisibility(false);
        expect(player.isTextTrackVisible()).toBe(false);

        // Wait for the change to take effect
        await new Promise((resolve) => {
          eventManager.listenOnce(controls, 'captionselectionupdated', resolve);
        });

        const offButtonChosen =
            getOffButton().querySelector('.shaka-chosen-item');
        expect(offButtonChosen).not.toBe(null);
      });


      /**
       * @return {!HTMLElement}
       */
      function getOffButton() {
        const offButtons =
          shaka.util.Iterables.filter(languageMenu.childNodes,
          (node) => {
            const button = asHTMLElement(node);
            return button.classList.contains('shaka-turn-captions-off-button');
          });

        expect(offButtons.length).toBe(1);
        return asHTMLElement(offButtons[0]);
      }
    });


    /**
     * @param {!Array.<shaka.extern.LanguageRole>} languagesAndRoles
     */
    function setupLanguageTests(languagesAndRoles) {
      langsFromContent = languagesAndRoles.map((langAndRole) => {
        return langAndRole.language;
      });

      languagesToButtons = populateLatestLanguageInfo(languageMenu.childNodes);
    }


    /**
     * Make sure languages specified by the manifest match what we show on UI.
     */
    function verifyLanguages() {
      const langsFromContentNative = langsFromContent.map((lang) => {
        return mozilla.LanguageMapping[lang].nativeName;
      });

      for (const button of languageButtons) {
        expect(button.childNodes.length).toBeGreaterThan(0);
        const languageName = button.childNodes[0].textContent;
        expect(langsFromContentNative.indexOf(languageName)).not.toBe(-1);
      }
    }


    /**
     * @param {string} playerEventName
     * @param {!Array.<!shaka.extern.Track>} tracks
     */
    async function verifyLanguageChangeViaUI(playerEventName, tracks) {
      expect(getSelectedTrack(tracks).language).toEqual(oldLanguage);

      const button = languagesToButtons.get(newLanguage);
      button.click();

      // Wait for the change to take effect
      await new Promise((resolve) => {
          eventManager.listenOnce(player, playerEventName, resolve);
      });
      expect(getSelectedTrack(tracks).language).toEqual(newLanguage);
    }


    /**
     * @param {string} controlsEventName
     * @param {!Array.<!shaka.extern.Track>} tracks
     */
    async function verifyLanguageChangeViaAPI(controlsEventName, tracks) {
      expect(getSelectedTrack(tracks).language).toEqual(oldLanguage);

      player.selectAudioLanguage(newLanguage);

      // Wait for the UI to get updated
      await new Promise((resolve) => {
          eventManager.listenOnce(controls, controlsEventName, resolve);
      });

      // Buttons were re-created on variant change
      languagesToButtons = populateLatestLanguageInfo(languageMenu.childNodes);

      const button = languagesToButtons.get(newLanguage);
      const isChosen = button.querySelector('.shaka-chosen-item');

      expect(isChosen).not.toBe(null);
    }

    /**
      * @param {!NodeList} allButtons
      * @return {!Map.<string, !HTMLElement>}
      */
    function populateLatestLanguageInfo(allButtons) {
      // Get languages from the UI.
      // Language menu should have as many buttons as there are languages plus
      // a "back to prev menu" button. Filter the back button out.
      // Captions menu also has an "Off" button, which is not applicable here,
      // either.
      languageButtons =
          shaka.util.Iterables.filter(allButtons,
          (node) => {
            const button = asHTMLElement(node);
            const classes = button.classList;
            return (!classes.contains('shaka-back-to-overflow-button') &&
                    !classes.contains('shaka-turn-captions-off-button'));
          });

      expect(languageButtons.length).toEqual(langsFromContent.length);

      const map = new Map();

      // Find which language corresponds to which button
      for (const locale of langsFromContent) {
        for (const button of languageButtons) {
          expect(button.childNodes.length).toBeGreaterThan(0);
          const langNameUI = button.childNodes[0].textContent;
          const langNameContent = mozilla.LanguageMapping[locale].nativeName;
          if (langNameUI == langNameContent) {
            map.set(locale, button);
          }
        }
      }

      return map;
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
});
