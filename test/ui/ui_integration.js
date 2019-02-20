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
    video = /** @type {!HTMLVideoElement} */ (document.createElement('video'));
    video.width = 600;
    video.height = 400;
    video.muted = true;

    videoContainer = shaka.ui.Utils.createHTMLElement('div');
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


  describe('language selection', () => {
    /** @type {!Element} */
    let languageMenu;
    /** @type {!Map.<string, !HTMLElement>} */
    let languagesToButtons;
    /** @type {!Array.<string>} */
    let langsFromContent;
    /** @type {!Array.<!HTMLElement>} */
    let languageButtons;

    const oldLanguage = 'en';
    const newLanguage = 'es';

    beforeEach(() => {
      languageMenu = getElementByClassName('shaka-audio-languages');
      const languagesAndRoles = player.getAudioLanguagesAndRoles();

      langsFromContent = languagesAndRoles.map((langAndRole) => {
        return langAndRole.language;
      });

      languagesToButtons = populateLatestLanguageInfo(languageMenu.childNodes);
    });

    it('contains all the languages', () => {
      const langsFromContentNative = langsFromContent.map((lang) => {
        return mozilla.LanguageMapping[lang].nativeName;
      });

      for (const button of languageButtons) {
        expect(button.childNodes.length).toBeGreaterThan(0);
        const languageName = button.childNodes[0].textContent;
        expect(langsFromContentNative.indexOf(languageName)).not.toBe(-1);
      }
    });

    it('choosing language through UI has effect on player', async () => {
        expect(getSelectedTrack().language).toEqual(oldLanguage);

        const button = languagesToButtons.get(newLanguage);
        button.click();

        // Wait for the change to take effect
        await new Promise((resolve) => {
            eventManager.listenOnce(player,
                'variantchanged', resolve);
        });
        expect(getSelectedTrack().language).toEqual(newLanguage);
    });

    it('choosing language through API has effect on UI', async () => {
      expect(getSelectedTrack().language).toEqual(oldLanguage);

      player.selectAudioLanguage(newLanguage);

      // Wait for the UI to get updated
      await new Promise((resolve) => {
          eventManager.listenOnce(controls,
              'languageselectionupdated', resolve);
      });

      // Buttons were re-created on variant change
      languagesToButtons = populateLatestLanguageInfo(languageMenu.childNodes);

      const button = languagesToButtons.get(newLanguage);
      const isChosen = button.querySelector('.shaka-chosen-item');

      expect(isChosen).not.toBe(null);
    });


  /**
   * @param {!NodeList} allButtons
   * @return {!Map.<string, !HTMLElement>}
   */
   function populateLatestLanguageInfo(allButtons) {
    // Get languages from the UI.
    // Language menu should have as many buttons as there are languages plus
    // a "back to prev menu" button. Filter the back button out.
    languageButtons =
        shaka.util.Iterables.filter(allButtons,
        (node) => {
          const button = /** @type {!HTMLElement}*/ (node);
          return !button.classList.contains('shaka-back-to-overflow-button');
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
   * @param {string} className
   * @return {!Element}
   */
  function getElementByClassName(className) {
    const elements = videoContainer.getElementsByClassName(className);
    expect(elements.length).toBe(1);
    return elements[0];
  }

  /**
   * @return {!shaka.extern.Track}
   */
  function getSelectedTrack() {
    const tracks = player.getVariantTracks();
    const activeTracks = tracks.filter((track) => {
      return track.active == true;
    });

    return activeTracks[0];
  }
});
