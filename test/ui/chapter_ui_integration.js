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

    ui = new compiledShaka.ui.Overlay(player, videoContainer, video);
    ui.configure({displayChapters: true});

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
  describe('addChaptersTrack', () => {
    it('adds chapter elements', async () => {
      const locationUri = new goog.Uri(location.href);
      const partialUri1 = new goog.Uri('/base/test/test/assets/chapters.vtt');
      const absoluteUri1 = locationUri.resolve(partialUri1);
      await player.addChaptersTrack(absoluteUri1.toString(), 'en');

      // Data should be available as soon as addChaptersTrack resolves.
      // See https://github.com/shaka-project/shaka-player/issues/4186
      const chapters = player.getChapters('en');
      expect(chapters.length).toBe(3);
      const chapter1 = chapters[0];
      expect(chapter1.title).toBe('Chapter 1');
      expect(chapter1.startTime).toBe(0);
      expect(chapter1.endTime).toBe(5);
      const chapter2 = chapters[1];
      expect(chapter2.title).toBe('Chapter 2');
      expect(chapter2.startTime).toBe(5);
      expect(chapter2.endTime).toBe(10);
      const chapter3 = chapters[2];
      expect(chapter3.title).toBe('Chapter 3');
      expect(chapter3.startTime).toBe(10);
      expect(chapter3.endTime).toBe(20);


      /*
          const chapterHtml = videoContainer.getElementsByClassName('shaka-chapter');
          const chapterElements = Array.from(chapterHtml);

          console.log("ChaptersElements: ",JSON.stringify(chapterElements));
          console.log("Chapter tracks: ", JSON.stringify(chapters))

          for (const chapter of chapters) {
            const chapterEl = chapterElements.find((el) => !!el.lastChild &&
              el.lastChild.textContent === chapter.title);

            expect(chapterEl).toBeDefined();
            expect(chapterEl.hasAttribute('hidden-title')).toBeTruthy();

            const chapterLabel = chapterEl.getElementByClassName(
                'shaka-chapter-label');
            UiUtils.confirmElementHidden(chapterLabel);
          }
          */
    });

    it('adds external chapters in srt format', async () => {
      await player.load('test:sintel_no_text_compiled');
      const locationUri = new goog.Uri(location.href);
      const partialUri = new goog.Uri('/base/test/test/assets/chapters.srt');
      const absoluteUri = locationUri.resolve(partialUri);
      await player.addChaptersTrack(absoluteUri.toString(), 'es');

      const chapters = player.getChapters('es');
      expect(chapters.length).toBe(3);
      const chapter1 = chapters[0];
      expect(chapter1.title).toBe('Chapter 1');
      expect(chapter1.startTime).toBe(0);
      expect(chapter1.endTime).toBe(5);
      const chapter2 = chapters[1];
      expect(chapter2.title).toBe('Chapter 2');
      expect(chapter2.startTime).toBe(5);
      expect(chapter2.endTime).toBe(30);
      const chapter3 = chapters[2];
      expect(chapter3.title).toBe('Chapter 3');
      expect(chapter3.startTime).toBe(30);
      expect(chapter3.endTime).toBe(61.349);
    });
  });  // describe('addChaptersTrack')
});
