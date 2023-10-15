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
    player = new compiledShaka.Player(video);

    // Create UI
    // Add all of the buttons we have
    const config = {
      'controlPanelElements': [
        'time_and_duration',
        'mute',
        'volume',
        'fullscreen',
        'overflow_menu',
        'fast_forward',
        'rewind',
      ],
      'overflowMenuButtons': [
        'captions',
        'quality',
        'language',
        'picture_in_picture',
        'cast',
      ],
      'displayChapters': true,
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

    await player.load('test:sintel_no_text_compiled');

    // For this event, we ignore a timeout, since we sometimes miss this event
    // on Tizen.  But expect that the video is ready anyway.
    await waiter.failOnTimeout(false).waitForEvent(video, 'canplay');
    expect(video.readyState).not.toBe(0);

    const locationUri = new goog.Uri(location.href);
    const partialUri1 = new goog.Uri('/base/test/test/assets/chapters.vtt');
    const absoluteUri1 = locationUri.resolve(partialUri1);
    await player.addChaptersTrack(absoluteUri1.toString(), 'und');
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

  describe('createChapterElements', () => {
    it('adds chapter elements', () => {
      const seekbarContainer = UiUtils.getElementByClassName(
          videoContainer, 'shaka-seek-bar-container');
      console.log(JSON.stringify(seekbarContainer));

      const chapterElements = /** @type {!Array<HTMLElement>}*/
        ([...seekbarContainer.getElementsByClassName('shaka-chapter')]);

      console.log(JSON.stringify(chapterElements));
      console.log(JSON.stringify(chapterElements));

      for (const chapter of player.getChapters('und')) {
        const chapterEl = chapterElements.find((el) =>
          !!el.lastChild && el.lastChild.textContent === chapter.title,
        );

        expect(chapterEl).toBeDefined();
        expect(chapterEl.classList).toContain('hidden-title');

        const chapterLabel = /** @type {!HTMLElement}*/
          (chapterEl.getElementsByClassName('shaka-chapter-label')[0]);
        UiUtils.confirmElementHidden(chapterLabel);
      }
    });
  });
});
