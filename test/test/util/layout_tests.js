/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// These helpers have many async interface methods that only need to do async
// work in some implementations.  Disable the normal eslint requirement that
// async functions always use await.
/* eslint-disable require-await */


// A minimum similarity score for screenshots, between 0 and 1.
const minSimilarity = 0.95;

const originalCast = window.chrome && window.chrome.cast;

shaka.test.LayoutTests = class {
  /** @param {string} prefix */
  constructor(prefix) {
    /** @type {string} */
    this.prefix = prefix;
  }

  /**
   * Waits for a particular font to be loaded.  Useful in screenshot tests to
   * make sure we have consistent results with regard to the web fonts we load
   * in the UI.
   *
   * @param {string} name
   * @return {!Promise}
   */
  async waitForFont(name) {
    await new Promise((resolve, reject) => {
      // https://github.com/zachleat/fontfaceonload
      // eslint-disable-next-line new-cap
      FontFaceOnload(name, {
        success: resolve,
        error: () => {
          reject(new Error('Timeout waiting for font ' + name + ' to load'));
        },
        timeout: 10 * 1000,  // ms
      });
    });

    // Wait one extra second to make sure the font rendering on the page has
    // been updated.  Without this, we saw some rare test flake in Firefox on
    // Mac.
    await shaka.test.Util.delay(1);
  }

  /**
   * Checks with Karma to see if this browser can take a screenshot.
   *
   * Only WebDriver-connected browsers can take a screenshot, and only Karma
   * knows if the browser is connected via WebDriver.  So this must be checked
   * in Karma via an HTTP request.
   *
   * @return {!Promise.<boolean>}
   */
  static async supported() {
    // We need our own ID for Karma to look up the WebDriver connection.
    // For manually-connected browsers, this ID may not exist.  In those cases,
    // this method is expected to return false.
    const parentUrlParams = window.parent.location.search;

    const buffer = await shaka.test.Util.fetch(
        '/screenshot/isSupported' + parentUrlParams);
    const json = shaka.util.StringUtils.fromUTF8(buffer);
    const ok = /** @type {boolean} */(JSON.parse(json));
    return ok;
  }

  /**
   * Asks Karma to take a screenshot for us via the WebDriver connection and
   * compare it to the "official" screenshot for this test and platform.  Sets
   * an expectation that the new screenshot does not differ from the official
   * screenshot more than a fixed threshold.
   *
   * Only works on browsers connected via WebDriver.  Use supportsScreenshots()
   * to filter screenshot-dependent tests.
   *
   * @param {HTMLElement} element The HTML element to screenshot.  Must be
   *   within the bounds of the viewport.
   * @param {string} name An identifier for the screenshot.  Use alphanumeric
   *   plus dash and underscore only.
   * @param {number} minSimilarity A minimum similarity score between 0 and 1.
   * @return {!Promise}
   */
  static async checkScreenshot(element, name, minSimilarity=1) {
    // Make sure the DOM is up-to-date and layout has settled before continuing.
    // Without this delay, or with a shorter delay, we sometimes get missing
    // elements in our UITextDisplayer tests on some platforms.
    await shaka.test.Util.delay(0.1);

    // We need our own ID for Karma to look up the WebDriver connection.
    // By this point, we should have passed supportsScreenshots(), so the ID
    // should definitely be there.
    const parentUrlParams = window.parent.location.search;
    goog.asserts.assert(parentUrlParams.includes('id='), 'No ID in URL!');

    // Tests run in an iframe.  So we also need the coordinates of that iframe
    // within the page, so that the screenshot can be consistently cropped to
    // the element we care about.
    const iframe = /** @type {HTMLIFrameElement} */(
      window.parent.document.getElementById('context'));
    const iframeRect = iframe.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    const x = iframeRect.left + elementRect.left;
    const y = iframeRect.top + elementRect.top;
    const width = elementRect.width;
    const height = elementRect.height;

    // Furthermore, the screenshot may not be at the scale you expect.  Measure
    // the browser window size in JavaScript and communicate that to Karma, too,
    // so it can convert coordinates before cropping.  This value, as opposed to
    // document.body.getBoundingClientRect(), seems to most accurately reflect
    // the size of the screenshot area.
    const bodyWidth = window.parent.innerWidth;
    const bodyHeight = window.parent.innerHeight;

    // In addition to the id param from the top-level window, pass these
    // parameters to the screenshot endpoint in Karma.
    const params = {x, y, width, height, bodyWidth, bodyHeight, name};

    let paramsString = '';
    for (const k in params) {
      paramsString += '&' + k + '=' + params[k];
    }

    const buffer = await shaka.test.Util.fetch(
        '/screenshot/diff' + parentUrlParams + paramsString);
    const json = shaka.util.StringUtils.fromUTF8(buffer);
    const similarity = /** @type {number} */(JSON.parse(json));

    // If the minimum similarity is not met, you can review the new screenshot
    // and the diff image in the screenshots folder.  Look for images that end
    // with "-new" and "-diff".  (NOTE: The diff is a pixel-wise diff for human
    // review, and is not produced with the same structural similarity
    // algorithm used to detect changes in the test.)  If cropping doesn't work
    // right, you can view the full-page screenshot in the image that ends with
    // "-full".
    expect(similarity).withContext(name).not.toBeLessThan(minSimilarity);
  }

  /** @param {!HTMLElement} element */
  positionElementForScreenshot(element) {
    // The element we screenshot will be 16:9 and small.
    element.style.width = '320px';
    element.style.height = '180px';

    // The background is green so we can better see the background color of
    // the text spans within the subtitles, and so it is easier to identify
    // cropping issues.
    element.style.backgroundColor = 'green';

    // Make sure the element is in the top-left corner of the iframe that
    // contains the tests.
    element.style.top = '0';
    element.style.left = '0';
    element.style.position = 'fixed';
    element.style.margin = '0';
    element.style.padding = '0';
  }
};

shaka.test.TextLayoutTests = class extends shaka.test.LayoutTests {
  /** @param {string} prefix */
  constructor(prefix) {
    super(prefix);

    /** @type {HTMLElement} */
    this.videoContainer = null;

    /** @type {shaka.extern.TextDisplayer} */
    this.textDisplayer = null;
  }

  /** @override */
  static async supported() {
    const baseSupported = await super.supported();
    if (!baseSupported) {
      return false;
    }

    // Due to a Safari implementation bug, the browser only does the correct
    // thing for a timing edge case on Safari 16+.  Skip the tests on earlier
    // versions.
    const safariVersion = shaka.util.Platform.safariVersion();
    if (safariVersion && safariVersion < 16) {
      return false;
    }

    // Due to updates in the rendering and/or default styles in Chrome, the
    // screenshots for native rendering only match in Chrome 106+.
    const chromeVersion = shaka.util.Platform.chromeVersion();
    if (chromeVersion && chromeVersion < 106) {
      return false;
    }

    return true;
  }

  /** @return {!Promise} */
  async beforeAll() {}

  /** @return {!Promise} */
  async beforeEach() {}

  recreateTextDisplayer() {}

  /**
   * @param {number} time
   * @return {!Promise}
   */
  async beforeScreenshot(time) {}

  /** @return {!Promise} */
  async afterEach() {
    await this.textDisplayer.destroy();
    this.textDisplayer = null;
  }

  /** @return {!Promise} */
  async afterAll() {}

  /**
   * @param {string} baseName The base name of the screenshot.
   * @param {number=} time The time to seek to in the screenshot.  Defaults to
   *   0.1, when most of our tests will be showing cues (timed 0-1).
   * @return {!Promise}
   */
  async checkScreenshot(baseName, time=0.1) {
    await this.beforeScreenshot(time);

    return shaka.test.LayoutTests.checkScreenshot(
        /* element= */ this.videoContainer,
        this.prefix + '-' + baseName,
        minSimilarity);
  }
};

shaka.test.DomTextLayoutTests = class extends shaka.test.TextLayoutTests {
  /** @param {string} prefix */
  constructor(prefix) {
    super(prefix);

    /** @type {HTMLLinkElement} */
    this.cssLink = null;

    /** @type {shaka.test.FakeVideo} */
    this.mockVideo = null;
  }

  /** @override */
  async beforeAll() {
    // Disable cast so the UI controls don't create cast sessions.
    if (window.chrome) {
      window.chrome['cast'] = null;
    }

    // Add css file
    this.cssLink = /** @type {!HTMLLinkElement} */(
      document.createElement('link'));
    await shaka.test.UiUtils.setupCSS(this.cssLink);

    // There's no actual video inside this container, but subtitles will be
    // positioned within this space.
    this.videoContainer = /** @type {!HTMLElement} */(
      document.createElement('div'));
    document.body.appendChild(this.videoContainer);

    this.positionElementForScreenshot(this.videoContainer);

    // Some of the styles in our CSS are only applied within this class.  Add
    // this explicitly, since we don't instantiate controls in all of the
    // tests.
    this.videoContainer.classList.add('shaka-video-container');

    await this.waitForFont('Roboto');
  }

  /** @override */
  async beforeEach() {
    this.mockVideo = new shaka.test.FakeVideo();

    this.recreateTextDisplayer();
  }

  /** @override */
  recreateTextDisplayer() {
    this.textDisplayer = new shaka.text.UITextDisplayer(
        /** @type {!HTMLMediaElement} */(this.mockVideo),
        this.videoContainer);
    this.textDisplayer.setTextVisibility(true);
  }

  /** @override */
  async beforeScreenshot(time) {
    // Set the faked time.
    this.mockVideo.currentTime = time;

    // Trigger the display update logic to notice the time change by
    // appending an empty array.
    this.textDisplayer.append([]);
  }

  /** @override */
  async afterEach() {
    await super.afterEach();
    this.mockVideo = null;
  }

  /** @override */
  async afterAll() {
    document.body.removeChild(this.videoContainer);
    this.videoContainer = null;

    document.head.removeChild(this.cssLink);
    this.cssLink = null;

    if (window.chrome) {
      window.chrome['cast'] = originalCast;
    }
  }
};

shaka.test.NativeTextLayoutTests = class extends shaka.test.TextLayoutTests {
  /** @param {string} prefix */
  constructor(prefix) {
    super(prefix);

    /** @type {HTMLVideoElement} */
    this.video = null;

    /** @type {shaka.util.EventManager} */
    this.eventManager = null;

    /** @type {shaka.test.Waiter} */
    this.waiter = null;
  }

  /** @override */
  async beforeAll() {
    this.video = shaka.test.UiUtils.createVideoElement();

    // On some platforms, such as Chrome on Android, we may see a "cast"
    // button overlayed if this isn't set.
    this.video.disableRemotePlayback = true;

    document.body.appendChild(this.video);

    this.positionElementForScreenshot(this.video);

    this.eventManager = new shaka.util.EventManager();
    this.waiter = new shaka.test.Waiter(this.eventManager);

    const canPlay = this.waiter.failOnTimeout(false).timeoutAfter(10)
        .waitForEvent(this.video, 'canplay');

    // Video content is required to show native subtitles.  This is a small
    // green frame.
    this.video.src = '/base/test/test/assets/green-pixel.mp4';
    await canPlay;
    expect(this.video.duration).toBeGreaterThan(0);
    expect(this.video.videoWidth).toBeGreaterThan(0);

    // There is no separate container, so assign the video to the base class
    // container.  This is where screenshots will be taken by the base class.
    this.videoContainer = this.video;
  }

  /** @override */
  async beforeEach() {
    this.recreateTextDisplayer();
  }

  /** @override */
  recreateTextDisplayer() {
    this.textDisplayer = new shaka.text.SimpleTextDisplayer(this.video);
    this.textDisplayer.setTextVisibility(true);
  }

  /** @override */
  async beforeScreenshot(time) {
    // On Firefox, Safari, and legacy Edge, the video must be played a little
    // _after_ appending cues in order to consistently show subtitles
    // natively on the video element.

    // Seek to the beginning so that we can reasonably wait for movement
    // after playing below.  If somehow the playhead ends up at the end of
    // the video, we should seek back before we play.
    this.video.currentTime = 0;

    // The this.video must be played a little now, after the cues were appended,
    // but before the screenshot.
    this.video.playbackRate = 1;
    await this.video.play();
    await this.waiter.failOnTimeout(false).timeoutAfter(5)
        .waitForMovement(this.video);
    this.video.pause();

    // Seek to a time when cues should be showing.
    this.video.currentTime = time;
    // Get into a playing state, but without movement.
    this.video.playbackRate = 0;
    await this.video.play();

    // Add a short delay to ensure that the system has caught up and that
    // native text displayers have been updated by the browser.
    await shaka.test.Util.delay(0.1);
  }

  /** @override */
  async afterEach() {
    await super.afterEach();
  }

  /** @override */
  async afterAll() {
    document.body.removeChild(this.video);
    this.video = null;
    // The video container and the video are the same in this class.
    this.videoContainer = null;

    this.eventManager.release();
    this.eventManager = null;
    this.waiter = null;
  }
};

// If we don't re-enable this rule by the end of the file, eslint exits with an
// error code.
/* eslint-enable require-await */
