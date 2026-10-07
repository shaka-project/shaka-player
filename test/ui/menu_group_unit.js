/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

describe('MenuGroup', () => {
  const UiUtils = shaka.test.UiUtils;
  const Util = shaka.test.Util;

  /** @type {!HTMLLinkElement} */
  let cssLink;
  /** @type {!HTMLElement} */
  let videoContainer;
  /** @type {!HTMLVideoElement} */
  let video;
  /** @type {shaka.ui.Controls} */
  let controls;
  /** @type {boolean} */
  let activeElementIsForced = false;

  /**
   * The names of the test menus that are not available.
   * @type {!Set<string>}
   */
  const unavailableMenus = new Set();

  /**
   * A settings menu with two items, which shows the chosen one.
   */
  const TestMenu = class extends shaka.ui.SettingsMenu {
    /**
     * @param {!HTMLElement} parent
     * @param {!shaka.ui.Controls} controls
     * @param {string} name
     */
    constructor(parent, controls, name) {
      super(parent, controls, shaka.ui.Enums.MaterialDesignSVGIcons['LOOP']);
      this.button.classList.add(name + '-button');
      this.menu.classList.add(name + '-menu');
      this.nameSpan.textContent = name;
      this.backSpan.textContent = name;
      this.currentSelection.textContent = 'one';
      for (const label of ['one', 'two']) {
        const item = shaka.util.Dom.createButton();
        item.classList.add(name + '-item');
        const span = shaka.util.Dom.createHTMLElement('span');
        span.textContent = label;
        item.appendChild(span);
        this.eventManager.listen(item, 'click', () => {
          this.currentSelection.textContent = label;
        });
        this.menu.appendChild(item);
      }
      /** @private {string} */
      this.name_ = name;
    }

    /** @override */
    checkAvailability() {
      shaka.ui.Utils.setDisplay(this.button,
          !unavailableMenus.has(this.name_) && !this.isSubMenuOpened);
    }
  };

  /**
   * Makes the test menus with this name available or not, like the subtitle
   * menus when the content has text tracks or not.
   *
   * @param {string} name
   * @param {boolean} available
   */
  function setMenuAvailable(name, available) {
    if (available) {
      unavailableMenus.delete(name);
    } else {
      unavailableMenus.add(name);
    }
    for (const button of videoContainer.querySelectorAll(
        '.' + name + '-button')) {
      shaka.ui.Utils.setDisplay(button, available);
    }
  }

  /**
   * @implements {shaka.extern.IUIElement.Factory}
   */
  const TestFactory = class {
    /**
     * @param {function(!HTMLElement, !shaka.ui.Controls):
     *     !shaka.extern.IUIElement} create
     */
    constructor(create) {
      /** @private */
      this.create_ = create;
    }

    /** @override */
    create(rootElement, controls) {
      return this.create_(rootElement, controls);
    }
  };

  /**
   * @param {string} name
   */
  function registerMenu(name) {
    const factory = new TestFactory(
        (parent, controls) => new TestMenu(parent, controls, name));
    shaka.ui.OverflowMenu.registerElement(name, factory);
    shaka.ui.Controls.registerElement(name, factory);
  }

  /**
   * @param {string} name
   * @param {!Array<string>} children
   * @param {?string} summary
   */
  function registerGroup(name, children, summary) {
    const TestGroup = class extends shaka.ui.MenuGroup {
      /**
       * @param {!HTMLElement} parent
       * @param {!shaka.ui.Controls} controls
       */
      constructor(parent, controls) {
        super(parent, controls,
            shaka.ui.Enums.MaterialDesignSVGIcons['OPEN_OVERFLOW']);
        this.button.classList.add(name + '-button');
        this.menu.classList.add(name + '-menu');
      }

      /** @override */
      getName() {
        return name;
      }

      /** @override */
      getChildElementNames() {
        return children;
      }

      /** @override */
      getSummaryElementName() {
        return summary;
      }
    };
    const factory = new TestFactory(
        (parent, controls) => new TestGroup(parent, controls));
    shaka.ui.OverflowMenu.registerElement(name, factory);
    shaka.ui.Controls.registerElement(name, factory);
  }

  /**
   * @param {string} className
   * @return {!HTMLElement}
   */
  function get(className) {
    return UiUtils.getElementByClassName(videoContainer, className);
  }

  /**
   * @param {!Element} element
   * @return {boolean}
   */
  function isShown(element) {
    return !element.closest('.shaka-hidden');
  }

  /**
   * @param {string} className
   * @return {!HTMLElement}
   */
  function getFirst(className) {
    const element = videoContainer.querySelector('.' + className);
    expect(element).not.toBe(null);
    return /** @type {!HTMLElement} */ (element);
  }

  /**
   * Whether the element itself is displayed, regardless of its menu.
   *
   * @param {!Element} element
   * @return {boolean}
   */
  function isDisplayed(element) {
    return !element.classList.contains('shaka-hidden');
  }

  /**
   * @param {string} menuClassName
   * @return {!HTMLElement}
   */
  function getBackButton(menuClassName) {
    return /** @type {!HTMLElement} */ (get(menuClassName).querySelector(
        ':scope > .shaka-back-to-overflow-button'));
  }

  /**
   * @param {!Object} config
   */
  async function createUI(config) {
    const ui = await UiUtils.createUIThroughAPI(videoContainer, video, config);
    controls = ui.getControls();
  }

  function openOverflowMenu() {
    get('shaka-overflow-menu-button').click();
  }

  /**
   * Gives |element| the focus, or fakes it where the platform does not let a
   * test move the focus (e.g. Chromecast).
   *
   * @param {!HTMLElement} element
   */
  function focusForKeyboardTest(element) {
    element.focus();
    if (document.activeElement != element) {
      Object.defineProperty(document, 'activeElement', {
        get: () => element,
        configurable: true,
      });
      activeElementIsForced = true;
    }
  }

  /**
   * Creates a keydown event for |key|, forcing event.key where the platform
   * ignores the init dictionary (e.g. Tizen 3).
   *
   * @param {string} key
   * @return {!KeyboardEvent}
   */
  function createKeydownEvent(key) {
    const event = new KeyboardEvent('keydown', {
      key: key,
      bubbles: true,
      cancelable: true,
    });
    if (event.key != key) {
      Object.defineProperty(event, 'key', {
        get: () => key,
        configurable: true,
      });
    }
    return event;
  }

  beforeAll(async () => {
    cssLink = /** @type {!HTMLLinkElement} */(document.createElement('link'));
    await UiUtils.setupCSS(cssLink);

    registerMenu('test-menu-top');
    registerMenu('test-menu-a');
    registerMenu('test-menu-b');
    registerMenu('test-menu-c');
    registerGroup('test-inner', ['test-menu-b', 'test-menu-c'], null);
    registerGroup('test-outer', ['test-menu-a', 'test-inner'], 'test-menu-a');
    registerGroup('test-cycle', ['test-menu-a', 'test-cycle'], null);
    registerGroup('test-unknown', ['test-missing', 'test-menu-a'], null);
  });

  beforeEach(() => {
    videoContainer =
      /** @type {!HTMLElement} */ (document.createElement('div'));
    document.body.appendChild(videoContainer);

    video = shaka.test.UiUtils.createVideoElement();
    videoContainer.appendChild(video);
  });

  afterEach(async () => {
    unavailableMenus.clear();
    if (activeElementIsForced) {
      // Deleting the override restores the accessor from Document.prototype.
      delete document['activeElement'];
      activeElementIsForced = false;
    }
    await UiUtils.cleanupUI();
    // cleanupUI() only finds containers that got a UI.  Remove this one even
    // if the test failed before setting one up.
    videoContainer.remove();
  });

  afterAll(() => {
    document.head.removeChild(cssLink);
  });

  describe('in the overflow menu', () => {
    beforeEach(async () => {
      await createUI({
        controlPanelElements: ['overflow_menu'],
        overflowMenuButtons: ['test-outer', 'test-menu-top'],
        customContextMenu: false,
      });
      openOverflowMenu();
    });

    it('creates its elements inside its submenu', () => {
      const outerMenu = get('test-outer-menu');
      expect(outerMenu.classList.contains('shaka-menu-group')).toBe(true);
      expect(outerMenu.querySelector(':scope > .test-menu-a-button'))
          .not.toBe(null);
      const innerButton =
          outerMenu.querySelector(':scope > .test-inner-button');
      expect(innerButton).not.toBe(null);
      const innerMenu = get('test-inner-menu');
      expect(innerMenu.parentElement).toBe(outerMenu);
      expect(innerMenu.querySelector(':scope > .test-menu-b-button'))
          .not.toBe(null);
      expect(innerMenu.querySelector(':scope > .test-menu-c-button'))
          .not.toBe(null);
      expect(getBackButton('test-outer-menu').textContent)
          .toBe('test-outer');
      expect(get('test-outer-button').getAttribute('aria-label'))
          .toBe('test-outer');
    });

    it('navigates nested levels without affecting the other levels', () => {
      const topButton = get('test-menu-top-button');
      const outerButton = get('test-outer-button');
      const aButton = get('test-menu-a-button');
      const innerButton = get('test-inner-button');
      const bButton = get('test-menu-b-button');
      const cButton = get('test-menu-c-button');
      const outerBack = getBackButton('test-outer-menu');
      const innerBack = getBackButton('test-inner-menu');

      outerButton.click();
      expect(isShown(get('test-outer-menu'))).toBe(true);
      expect(outerButton.getAttribute('aria-expanded')).toBe('true');
      expect(isShown(topButton)).toBe(false);
      expect(isShown(outerButton)).toBe(false);
      expect(isShown(aButton)).toBe(true);
      expect(isShown(innerButton)).toBe(true);

      innerButton.click();
      expect(isShown(get('test-inner-menu'))).toBe(true);
      expect(isShown(aButton)).toBe(false);
      expect(isShown(innerButton)).toBe(false);
      expect(isShown(outerBack)).toBe(false);
      expect(isShown(bButton)).toBe(true);
      expect(isShown(cButton)).toBe(true);

      bButton.click();
      expect(isShown(get('test-menu-b-menu'))).toBe(true);
      expect(isShown(cButton)).toBe(false);
      expect(isShown(innerBack)).toBe(false);

      // Choosing an item goes back one level only.
      getFirst('test-menu-b-item').click();
      expect(isShown(get('test-menu-b-menu'))).toBe(false);
      expect(isShown(get('test-inner-menu'))).toBe(true);
      expect(isShown(bButton)).toBe(true);
      expect(isShown(cButton)).toBe(true);
      expect(isShown(innerBack)).toBe(true);
      expect(isShown(aButton)).toBe(false);
      expect(isShown(topButton)).toBe(false);

      innerBack.click();
      expect(isShown(get('test-inner-menu'))).toBe(false);
      expect(isShown(get('test-outer-menu'))).toBe(true);
      expect(isShown(aButton)).toBe(true);
      expect(isShown(innerButton)).toBe(true);
      expect(isShown(outerBack)).toBe(true);
      expect(isShown(topButton)).toBe(false);

      outerBack.click();
      expect(isShown(get('test-outer-menu'))).toBe(false);
      expect(isShown(get('shaka-overflow-menu'))).toBe(true);
      expect(isShown(outerButton)).toBe(true);
      expect(isShown(topButton)).toBe(true);
      expect(outerButton.getAttribute('aria-expanded')).toBe('false');
    });

    it('resets every level when the menus hide', () => {
      get('test-outer-button').click();
      get('test-inner-button').click();
      get('test-menu-b-button').click();

      controls.hideSettingsMenus();
      openOverflowMenu();

      expect(isShown(get('test-outer-button'))).toBe(true);
      expect(isShown(get('test-menu-top-button'))).toBe(true);
      get('test-outer-button').click();
      expect(isShown(get('test-menu-a-button'))).toBe(true);
      expect(isShown(get('test-inner-button'))).toBe(true);
      expect(isShown(getBackButton('test-outer-menu'))).toBe(true);
      get('test-inner-button').click();
      expect(isShown(get('test-menu-b-button'))).toBe(true);
      expect(isShown(get('test-menu-c-button'))).toBe(true);
      expect(isShown(getBackButton('test-inner-menu'))).toBe(true);
    });

    it('shows the current selection of its summary element', async () => {
      const summary = get('test-outer-button')
          .querySelector('.shaka-current-selection-span');
      expect(summary.textContent).toBe('one');
      // The inner group has no summary element.
      expect(get('test-inner-button')
          .querySelector('.shaka-current-selection-span').textContent)
          .toBe('');

      get('test-outer-button').click();
      get('test-menu-a-button').click();
      const items = get('test-menu-a-menu')
          .querySelectorAll('.test-menu-a-item');
      /** @type {!HTMLElement} */ (items[1]).click();
      await Util.shortDelay();
      expect(summary.textContent).toBe('two');
    });

    it('is shown only while one of its elements is shown', async () => {
      const outerButton = get('test-outer-button');
      const innerButton = get('test-inner-button');
      setMenuAvailable('test-menu-b', false);
      setMenuAvailable('test-menu-c', false);
      await Util.shortDelay();
      expect(isDisplayed(innerButton)).toBe(false);
      expect(isDisplayed(outerButton)).toBe(true);

      setMenuAvailable('test-menu-a', false);
      await Util.shortDelay();
      expect(isDisplayed(outerButton)).toBe(false);

      setMenuAvailable('test-menu-c', true);
      await Util.shortDelay();
      expect(isDisplayed(innerButton)).toBe(true);
      expect(isDisplayed(outerButton)).toBe(true);
    });

    it('goes back when it gets empty while open', async () => {
      get('test-outer-button').click();
      get('test-inner-button').click();
      setMenuAvailable('test-menu-b', false);
      setMenuAvailable('test-menu-c', false);
      await Util.shortDelay();
      expect(isShown(get('test-inner-menu'))).toBe(false);
      expect(isShown(get('test-outer-menu'))).toBe(true);
      expect(isShown(get('test-menu-a-button'))).toBe(true);
      expect(isShown(get('test-inner-button'))).toBe(false);
    });

    it('stays open while one of its elements has a submenu open',
        async () => {
          get('test-outer-button').click();
          get('test-inner-button').click();
          get('test-menu-b-button').click();
          // The other elements hide while the submenu is open.
          await Util.shortDelay();
          expect(isShown(get('test-inner-menu'))).toBe(true);
          expect(isShown(get('test-menu-b-menu'))).toBe(true);
        });

    it('focuses its first shown element when opened', () => {
      const first = get('test-menu-a-button');
      const focus = spyOn(first, 'focus').and.callThrough();
      get('test-outer-button').click();
      expect(focus).toHaveBeenCalled();
    });

    it('does not focus the chosen item of a hidden nested submenu', () => {
      // The submenus inside the group have chosen items, but they are hidden.
      const chosen = /** @type {!HTMLElement} */ (
        get('test-inner-menu').querySelector('.test-menu-b-item'));
      chosen.classList.add('shaka-chosen-item');
      const focus = spyOn(chosen, 'focus').and.callThrough();
      get('test-outer-button').click();
      get('test-inner-button').click();
      expect(focus).not.toHaveBeenCalled();
    });

    it('returns the focus to the button that opened a level', () => {
      get('test-outer-button').click();
      const innerButton = get('test-inner-button');
      innerButton.click();
      const focus = spyOn(innerButton, 'focus').and.callThrough();
      getBackButton('test-inner-menu').click();
      expect(focus).toHaveBeenCalled();
    });

    it('closes every level on Escape', () => {
      const opener = get('shaka-overflow-menu-button');
      get('test-outer-button').click();
      get('test-inner-button').click();
      const focus = spyOn(opener, 'focus').and.callThrough();
      const button = get('test-menu-b-button');
      focusForKeyboardTest(button);
      button.dispatchEvent(createKeydownEvent('Escape'));
      expect(isShown(get('shaka-overflow-menu'))).toBe(false);
      expect(isShown(get('test-outer-menu'))).toBe(false);
      expect(isShown(get('test-inner-menu'))).toBe(false);
      expect(focus).toHaveBeenCalledTimes(1);
    });

    it('loops Tab inside the innermost level', () => {
      get('test-outer-button').click();
      get('test-inner-button').click();
      const back = getBackButton('test-inner-menu');
      const last = get('test-menu-c-button');
      const focus = spyOn(back, 'focus').and.callThrough();
      focusForKeyboardTest(last);
      const event = createKeydownEvent('Tab');
      last.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(focus).toHaveBeenCalled();
      window.dispatchEvent(new KeyboardEvent('keyup', {key: 'Tab'}));
    });

    it('marks its elements as being in a menu group', () => {
      expect(get('test-outer-menu').classList.contains('shaka-menu-group'))
          .toBe(true);
      // Elements outside a group are not.
      expect(get('test-menu-top-button').parentElement.classList
          .contains('shaka-menu-group')).toBe(false);
    });
  });

  describe('in the context menu', () => {
    it('keeps the context menu open in nested levels', async () => {
      await createUI({
        controlPanelElements: [],
        contextMenuElements: ['test-outer'],
        customContextMenu: true,
      });
      const contextMenu = get('shaka-context-menu');
      UiUtils.simulateEvent(controls.getControlsContainer(), 'contextmenu');
      expect(isShown(contextMenu)).toBe(true);

      get('test-outer-button').click();
      get('test-inner-button').click();
      get('test-menu-b-button').click();
      expect(isShown(contextMenu)).toBe(true);
      expect(isShown(get('test-menu-b-menu'))).toBe(true);

      getFirst('test-menu-b-item').click();
      expect(isShown(contextMenu)).toBe(true);
      expect(isShown(get('test-inner-menu'))).toBe(true);
    });
  });

  describe('in the control panel', () => {
    it('opens nested levels and closes on back', async () => {
      await createUI({
        controlPanelElements: ['test-outer'],
        customContextMenu: false,
      });
      const outerMenu = get('test-outer-menu');
      expect(outerMenu.classList.contains('shaka-settings-menu')).toBe(true);

      get('test-outer-button').click();
      expect(isShown(outerMenu)).toBe(true);

      get('test-inner-button').click();
      expect(isShown(get('test-inner-menu'))).toBe(true);
      expect(isShown(get('test-menu-a-button'))).toBe(false);
      expect(isShown(getBackButton('test-outer-menu'))).toBe(false);

      getBackButton('test-inner-menu').click();
      expect(isShown(outerMenu)).toBe(true);
      expect(isShown(get('test-menu-a-button'))).toBe(true);

      getBackButton('test-outer-menu').click();
      expect(isShown(outerMenu)).toBe(false);
      expect(isShown(get('test-outer-button'))).toBe(true);
    });
  });

  it('skips an element that contains itself', async () => {
    const warn = spyOn(shaka.log, 'alwaysWarn');
    await createUI({
      controlPanelElements: ['overflow_menu'],
      overflowMenuButtons: ['test-cycle'],
      customContextMenu: false,
    });
    expect(warn).toHaveBeenCalledWith(
        'Menu group element contains itself:', 'test-cycle');
    expect(videoContainer.querySelectorAll('.test-cycle-menu').length)
        .toBe(2);
  });

  it('skips an unknown element', async () => {
    const warn = spyOn(shaka.log, 'alwaysWarn');
    await createUI({
      controlPanelElements: ['overflow_menu'],
      overflowMenuButtons: ['test-unknown'],
      customContextMenu: false,
    });
    expect(warn).toHaveBeenCalledWith(
        'Unrecognized menu group element requested:', 'test-missing');
    expect(get('test-unknown-menu').querySelector('.test-menu-a-button'))
        .not.toBe(null);
  });

  describe('subtitle groups', () => {
    /** @type {shaka.Player} */
    let player;
    /** @type {!Array<shaka.extern.TextTrack>} */
    let textTracks;

    /**
     * @param {boolean} active
     * @return {shaka.extern.TextTrack}
     */
    function createTextTrack(active) {
      return /** @type {shaka.extern.TextTrack} */ (/** @type {?} */ ({
        id: 1,
        active: active,
        language: 'es',
        label: null,
        kind: 'subtitle',
        mimeType: 'text/vtt',
        codecs: null,
        primary: false,
        roles: [],
        accessibilityPurpose: null,
        forced: false,
        originalLanguage: 'es',
      }));
    }

    /**
     * @param {!Array<shaka.extern.TextTrack>} tracks
     */
    async function setTextTracks(tracks) {
      textTracks = tracks;
      player.dispatchEvent(new shaka.util.FakeEvent('trackschanged'));
      player.dispatchEvent(new shaka.util.FakeEvent('textchanged'));
      await Util.shortDelay();
    }

    /**
     * @param {!Element} button
     * @return {string}
     */
    function getIconPath(button) {
      return button.querySelector('svg path').getAttribute('d');
    }

    beforeEach(async () => {
      textTracks = [];
      await createUI({
        controlPanelElements: ['overflow_menu', 'captions-size'],
        overflowMenuButtons: ['captions-settings'],
        customContextMenu: false,
      });
      player = controls.getLocalPlayer();
      spyOn(player, 'getTextTracks').and.callFake(() => textTracks);
      await setTextTracks([]);
      openOverflowMenu();
    });

    it('shows the subtitles group only with text tracks', async () => {
      const button = get('shaka-captions-settings-button');
      expect(isDisplayed(button)).toBe(false);

      await setTextTracks([createTextTrack(false)]);
      expect(isDisplayed(button)).toBe(true);
      const localization = controls.getLocalization();
      expect(button.querySelector('.shaka-current-selection-span')
          .textContent).toBe(localization.resolve(shaka.ui.Locales.Ids.OFF));
    });

    it('shows the style with text tracks, even if disabled', async () => {
      await setTextTracks([createTextTrack(false)]);
      expect(isDisplayed(get('shaka-caption-style-button'))).toBe(true);

      await setTextTracks([createTextTrack(true)]);
      expect(isDisplayed(get('shaka-caption-style-button'))).toBe(true);
    });

    it('shows the current language on the subtitles group', async () => {
      await setTextTracks([createTextTrack(true)]);
      const captionsSelection = get('shaka-caption-button')
          .querySelector('.shaka-current-selection-span').textContent;
      expect(captionsSelection).not.toBe('');
      expect(get('shaka-captions-settings-button')
          .querySelector('.shaka-current-selection-span').textContent)
          .toBe(captionsSelection);
    });

    it('uses short labels inside the groups', () => {
      const LocIds = shaka.ui.Locales.Ids;
      const localization = controls.getLocalization();
      const label = (button) => button.getAttribute('aria-label');
      // The first group is the subtitles group, and the style group is
      // inside it.
      const settingsMenu = getFirst('shaka-menu-group');
      const styleMenu = /** @type {!HTMLElement} */ (
        settingsMenu.querySelector('.shaka-menu-group'));

      expect(label(get('shaka-captions-settings-button')))
          .toBe(localization.resolve(LocIds.CAPTIONS));
      expect(label(settingsMenu.querySelector('.shaka-caption-button')))
          .toBe(localization.resolve(LocIds.LANGUAGE));
      expect(label(get('shaka-caption-style-button')))
          .toBe(localization.resolve(LocIds.STYLE));
      expect(label(styleMenu.querySelector('.shaka-caption-size-button')))
          .toBe(localization.resolve(LocIds.SIZE));
      expect(label(styleMenu.querySelector('.shaka-caption-position-button')))
          .toBe(localization.resolve(LocIds.POSITION));

      // Outside a group, the labels keep the context.
      const panelSizeButton = get('shaka-controls-button-panel')
          .querySelector('.shaka-caption-size-button');
      expect(label(panelSizeButton))
          .toBe(localization.resolve(LocIds.SUBTITLE_SIZE));
    });

    it('uses its own icons for the style and the size', () => {
      const Icons = shaka.ui.Enums.MaterialDesignSVGIcons;
      expect(getIconPath(get('shaka-caption-style-button')))
          .toBe(Icons['CLOSED_CAPTIONS_STYLE']);
      expect(getIconPath(getFirst('shaka-caption-size-button')))
          .toBe(Icons['CLOSED_CAPTIONS_SIZE']);
      expect(Icons['CLOSED_CAPTIONS_SIZE'])
          .not.toBe(Icons['CLOSED_CAPTIONS_POSITION']);
    });

    it('creates the configured style elements', async () => {
      videoContainer['ui'].configure('captionsStyleElements',
          ['captions-position', 'captions-size']);
      await setTextTracks([createTextTrack(false)]);
      const styleMenu = /** @type {!HTMLElement} */ (getFirst(
          'shaka-captions-settings-button').parentElement.querySelector(
          '.shaka-menu-group .shaka-menu-group'));
      const buttons = Array.from(styleMenu.querySelectorAll(
          ':scope > button:not(.shaka-back-to-overflow-button)'));
      expect(buttons.length).toBe(2);
      expect(buttons[0].classList.contains('shaka-caption-position-button'))
          .toBe(true);
      expect(buttons[1].classList.contains('shaka-caption-size-button'))
          .toBe(true);
    });

    it('creates the style elements in the default order',
        async () => {
          await setTextTracks([createTextTrack(false)]);
          const styleMenu = /** @type {!HTMLElement} */ (getFirst(
              'shaka-captions-settings-button').parentElement.querySelector(
              '.shaka-menu-group .shaka-menu-group'));
          const buttons = Array.from(styleMenu.querySelectorAll(
              ':scope > button:not(.shaka-back-to-overflow-button)'));
          const classNames = [
            'shaka-caption-font-family-button',
            'shaka-caption-font-color-button',
            'shaka-caption-size-button',
            'shaka-caption-background-color-button',
            'shaka-caption-background-opacity-button',
            'shaka-caption-character-edge-style-button',
            'shaka-caption-font-opacity-button',
            'shaka-caption-position-button',
            'shaka-caption-style-reset-button',
          ];
          expect(buttons.length).toBe(classNames.length);
          for (let i = 0; i < classNames.length; i++) {
            expect(buttons[i].classList.contains(classNames[i])).toBe(true);
          }
        });

    describe('reset', () => {
      /**
       * @return {!HTMLElement}
       */
      function getStyleMenu() {
        return /** @type {!HTMLElement} */ (
          get('shaka-caption-style-reset-button').parentElement);
      }

      /**
       * @param {string} className
       * @return {string}
       */
      function getStyleSelection(className) {
        return getStyleMenu().querySelector(
            '.' + className + ' .shaka-current-selection-span').textContent;
      }

      async function openStyleMenu() {
        get('shaka-captions-settings-button').click();
        await Util.shortDelay();
        get('shaka-caption-style-button').click();
        await Util.shortDelay();
      }

      it('is shown with the style options', async () => {
        const reset = get('shaka-caption-style-reset-button');
        expect(getStyleMenu().classList.contains('shaka-menu-group'))
            .toBe(true);
        expect(isDisplayed(reset)).toBe(false);

        // Like the style options, it does not need the text to be enabled.
        // It is also offered when the style is already the default one.
        await setTextTracks([createTextTrack(false)]);
        expect(isDisplayed(reset)).toBe(true);
        expect(reset.hasAttribute('disabled')).toBe(false);
        expect(reset.getAttribute('aria-label')).toBe(
            controls.getLocalization().resolve(shaka.ui.Locales.Ids.RESET));
        expect(getIconPath(reset))
            .toBe(shaka.ui.Enums.MaterialDesignSVGIcons['RESET']);

        // It comes after the style options.
        expect(getStyleMenu().lastElementChild).toBe(reset);
      });

      it('does not show the style group on its own', async () => {
        videoContainer['ui'].configure('captionsStyles', false);
        await setTextTracks([createTextTrack(false)]);
        expect(isDisplayed(get('shaka-caption-style-reset-button')))
            .toBe(false);
        expect(isDisplayed(get('shaka-caption-style-button'))).toBe(false);
      });

      it('restores the default style', async () => {
        await setTextTracks([createTextTrack(false)]);
        player.configure({
          textDisplayer: {
            fontScaleFactor: 1.5,
            positionArea: shaka.config.PositionArea.TOP_LEFT,
            fontFamily: shaka.config.FontFamily.MONOSPACED_SERIF,
            fontColor: '#ff0',
            fontOpacity: 0.5,
            backgroundColor: '#f00',
            backgroundOpacity: 0.25,
            characterEdgeStyle: shaka.config.CharacterEdgeStyle.OUTLINE,
            subtitleDelay: 2,
          },
        });
        await openStyleMenu();
        expect(getStyleSelection('shaka-caption-size-button')).toBe('150%');
        expect(getStyleSelection('shaka-caption-font-opacity-button'))
            .toBe('50%');

        get('shaka-caption-style-reset-button').click();
        await Util.shortDelay();

        const config = player.getConfiguration().textDisplayer;
        expect(config.fontScaleFactor).toBe(1);
        expect(config.positionArea).toBe(shaka.config.PositionArea.DEFAULT);
        expect(config.fontFamily).toBe(shaka.config.FontFamily.DEFAULT);
        expect(config.fontColor).toBe('');
        expect(isNaN(config.fontOpacity)).toBe(true);
        expect(config.backgroundColor).toBe('');
        expect(isNaN(config.backgroundOpacity)).toBe(true);
        expect(config.characterEdgeStyle)
            .toBe(shaka.config.CharacterEdgeStyle.DEFAULT);
        // The subtitle delay is not part of the style.
        expect(config.subtitleDelay).toBe(2);

        // The style options show the restored values, and the style group
        // stays open.
        const localization = controls.getLocalization();
        expect(getStyleSelection('shaka-caption-size-button')).toBe('100%');
        const defaultLabel =
            localization.resolve(shaka.ui.Locales.Ids.DEFAULT);
        for (const className of [
          'shaka-caption-position-button',
          'shaka-caption-font-family-button',
          'shaka-caption-font-color-button',
          'shaka-caption-font-opacity-button',
          'shaka-caption-background-color-button',
          'shaka-caption-background-opacity-button',
          'shaka-caption-character-edge-style-button',
        ]) {
          expect(getStyleSelection(className)).toBe(defaultLabel);
        }
        expect(isDisplayed(getStyleMenu())).toBe(true);
      });
    });
  });

  it('uses the subtitle groups by default', async () => {
    await createUI({customContextMenu: true});
    const overflowMenu =
        videoContainer.querySelector('.shaka-overflow-menu');
    if (!overflowMenu) {
      pending('This platform has no overflow menu by default.');
    }
    expect(overflowMenu.querySelector(
        ':scope > .shaka-captions-settings-button')).not.toBe(null);
    expect(overflowMenu.querySelector(':scope > .shaka-caption-button'))
        .toBe(null);
    expect(overflowMenu.querySelector(
        ':scope > .shaka-caption-position-button')).toBe(null);
    // The subtitle settings are reached from the overflow menu only.
    const contextMenu = get('shaka-context-menu');
    expect(contextMenu.querySelector('.shaka-caption-style-button'))
        .toBe(null);
    expect(contextMenu.querySelector('.shaka-caption-size-button'))
        .toBe(null);
    expect(contextMenu.querySelector('.shaka-caption-position-button'))
        .toBe(null);
  });
});
