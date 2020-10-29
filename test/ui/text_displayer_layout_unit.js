/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.Player');
goog.require('shaka.test.FakeVideo');
goog.require('shaka.test.UiUtils');
goog.require('shaka.test.Util');
goog.require('shaka.test.Waiter');
goog.require('shaka.text.Cue');
goog.require('shaka.text.SimpleTextDisplayer');
goog.require('shaka.text.UITextDisplayer');
goog.require('shaka.ui.Overlay');
goog.require('shaka.util.EventManager');

const Util = shaka.test.Util;

// TODO: Move this suite to the text/ folder where it belongs
filterDescribe('TextDisplayer layout', Util.supportsScreenshots, () => {
  const UiUtils = shaka.test.UiUtils;

  /** @type {!shaka.extern.TextDisplayer} */
  let textDisplayer;
  /**
   * The video container or other element which is used for the screenshot.
   * @type {!HTMLElement}
   */
  let videoContainer;
  /**
   * Awaited before each screenshot, and can vary by test suite.
   * @type {function():!Promise}
   */
  let beforeScreenshot;

  // Legacy Edge seems to have inconsistent font kerning.  A one-pixel offset in
  // the position of one character appears about 60% of the time, requiring us
  // to have this change tolerance in our tests.  So far, all past bugs in our
  // implementation that we have tests for would exceed this threshold by a lot.
  const threshold = 160;  // px

  const originalCast = window.chrome && window.chrome.cast;


  describe('using UI', () => {
    /** @type {!HTMLLinkElement} */
    let cssLink;
    /** @type {!shaka.test.FakeVideo} */
    let mockVideo;

    function createTextDisplayer() {
      textDisplayer = new shaka.text.UITextDisplayer(
          /** @type {!HTMLMediaElement} */(mockVideo),
          videoContainer);
      textDisplayer.setTextVisibility(true);
    }

    beforeAll(async () => {
      // Disable cast so the UI controls don't create cast sessions.
      if (window.chrome) {
        window.chrome['cast'] = null;
      }

      // Add css file
      cssLink = /** @type {!HTMLLinkElement} */(document.createElement('link'));
      await UiUtils.setupCSS(cssLink);

      // There's no actual video inside this container, but subtitles will be
      // positioned within this space.
      videoContainer = /** @type {!HTMLElement} */(
        document.createElement('div'));
      document.body.appendChild(videoContainer);

      positionElementForScreenshot(videoContainer);

      // Some of the styles in our CSS are only applied within this class.  Add
      // this explicitly, since we don't instantiate controls in all of the
      // tests.
      videoContainer.classList.add('shaka-video-container');

      await Util.waitForFont('Roboto');

      // Nothing special needs to be done before these screenshots.
      beforeScreenshot = async () => {};
    });

    beforeEach(() => {
      mockVideo = new shaka.test.FakeVideo();
      createTextDisplayer();
    });

    afterEach(async () => {
      await textDisplayer.destroy();
    });

    afterAll(() => {
      document.body.removeChild(videoContainer);
      document.head.removeChild(cssLink);
      if (window.chrome) {
        window.chrome['cast'] = originalCast;
      }
    });

    defineTests('ui');

    // This test is unique to the UI.
    it('moves cues to avoid controls', async () => {
      let ui;

      try {
        // Set up UI controls.  The video element is in a paused state by
        // default, so the controls should be shown.  The video is not in the
        // DOM and is purely temporary.
        const player = new shaka.Player(null);
        ui = new shaka.ui.Overlay(
            player, videoContainer, shaka.test.UiUtils.createVideoElement());
        // Turn off every part of the UI that we can, so that the screenshot is
        // less likey to change because of something unrelated to text
        // rendering.
        ui.configure('controlPanelElements', []);
        ui.configure('addSeekBar', false);
        ui.configure('addBigPlayButton', false);
        ui.configure('enableFullscreenOnRotation', false);

        // Recreate the text displayer so that the text container comes after
        // the controls (as it does in production).  This is important for the
        // CSS that moves the cues above the controls when they are shown.
        await textDisplayer.destroy();
        createTextDisplayer();

        const cue = new shaka.text.Cue(
            0, 1, 'Captain\'s log, stardate 41636.9');
        cue.region.id = '1';
        // Position the cue *explicitly* at the bottom of the screen.
        cue.region.viewportAnchorX = 0;  // %
        cue.region.viewportAnchorY = 100;  // %
        textDisplayer.append([cue]);

        await checkScreenshot('ui', 'cue-with-controls');
      } finally {
        await ui.destroy();
      }
    });
  });


  describe('using browser-native rendering', () => {
    /** @type {!HTMLVideoElement} */
    let video;

    beforeAll(async () => {
      video = shaka.test.UiUtils.createVideoElement();

      // On some platforms, such as Chrome on Android, we may see a "cast"
      // button overlayed if this isn't set.
      video.disableRemotePlayback = true;

      document.body.appendChild(video);

      positionElementForScreenshot(video);

      const eventManager = new shaka.util.EventManager();
      const waiter = new shaka.test.Waiter(eventManager);
      const canPlay = waiter.failOnTimeout(false).timeoutAfter(10)
          .waitForEvent(video, 'canplay');

      // Video content is required to show native subtitles.  This is a small
      // green frame.
      video.src = '/base/test/test/assets/green-pixel.mp4';
      await canPlay;
      expect(video.duration).toBeGreaterThan(0);
      expect(video.videoWidth).toBeGreaterThan(0);

      // There is no actual container.  Screenshots will be taken of the video
      // element itself.
      videoContainer = video;

      // On Firefox, Safari, IE11, and legacy Edge, the video must be played a
      // little _after_ appending cues in order to consistently show subtitles
      // natively on the video element.
      beforeScreenshot = async () => {
        // Seek to the beginning so that we can reasonably wait for movement
        // after playing below.  If somehow the playhead ends up at the end of
        // the video, we should seek back before we play.
        video.currentTime = 0;

        // The video must be played a little now, after the cues were appended,
        // but before the screenshot.
        video.play();
        await waiter.failOnTimeout(false).timeoutAfter(5)
            .waitForMovement(video);
        video.pause();

        // Seek to a time when cues (all timed from 0-1) will definitely be
        // showing.
        video.currentTime = 0.1;
      };
    });

    beforeEach(() => {
      textDisplayer = new shaka.text.SimpleTextDisplayer(video);
      textDisplayer.setTextVisibility(true);
    });

    afterEach(async () => {
      await textDisplayer.destroy();
    });

    afterAll(() => {
      document.body.removeChild(video);
    });

    defineTests('native');
  });


  /** @param {string} prefix Prepended to screenshot names */
  function defineTests(prefix) {
    it('basic cue', async () => {
      textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9'),
      ]);

      await checkScreenshot(prefix, 'basic-cue');
    });

    it('cue with newline', async () => {
      textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log,\nstardate 41636.9'),
      ]);

      await checkScreenshot(prefix, 'cue-with-newline');
    });

    it('two basic cues', async () => {
      textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log,'),
        new shaka.text.Cue(0, 1, 'stardate 41636.9'),
      ]);

      await checkScreenshot(prefix, 'two-basic-cues');
    });

    // Regression test for #2497
    // Only one cue should be displayed.
    it('duplicate cues', async () => {
      // In reality, this occurs when a VTT cue crossed a segment boundary and
      // appears in more than one segment.  So we must simulate this with two
      // calls to append().
      textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9'),
      ]);
      textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9'),
      ]);

      await checkScreenshot(prefix, 'duplicate-cues');
    });

    // Regression test for #2524
    it('two nested cues', async () => {
      const cue = new shaka.text.Cue(0, 1, '');
      cue.nestedCues = [
        new shaka.text.Cue(0, 1, 'Captain\'s log, '),
        new shaka.text.Cue(0, 1, 'stardate 41636.9'),
      ];
      textDisplayer.append([cue]);

      await checkScreenshot(prefix, 'two-nested-cues');
    });

    // Regression test for #2157 and #2584
    it('region positioning', async () => {
      const nestedCue = new shaka.text.Cue(
          0, 1, 'Captain\'s log, stardate 41636.9');

      const cue = new shaka.text.Cue(0, 1, '');
      cue.region.id = '1';
      cue.region.viewportAnchorX = 70;  // %
      cue.region.viewportAnchorY = 35;  // %
      cue.region.width = 30;  // %
      cue.region.height = 65;  // %
      cue.nestedCues = [nestedCue];
      textDisplayer.append([cue]);

      await checkScreenshot(prefix, 'region-position');
    });

    // Regression test for #2188
    it('bitmap-based cues', async () => {
      const cue = new shaka.text.Cue(0, 1, '');
      cue.region.id = '1';
      cue.region.height = 15;  // %
      // eslint-disable-next-line max-len
      cue.backgroundImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAAA8BAMAAABMVCNvAAAAElBMVEX9/vtRldU+uUv6vAnvNjWzvsvH461AAAABvUlEQVRIx7WWwY6CMBRFYQb2Nhn22sS9o5m9icy+aPn/X5lS6r221gfTxLsC0pN7XovE6j1p9d6UcB/apYTUU/YlhT7bArCwUocUg9sCsMxVF7i2Pwd3+v93/Ty5uEbZtVVd+nacphw08oJzMUmhzxWgyYHDBHbRo9sMHmVX5bOJTENyrq0rMjB1EUG61ipMBtBEYM41qakVXLk3eVdyagMQrqNB47ProO4hGCbu+/4MMHUlp6J2F8c58pR3bRVj/B1cm94nB2IlatSDq53BW8Z1i4UEed3PueQqhxTkA781L10JBb2aNwAvGdddAj66NhKon0C6onHZtXKhKxolVx46XbtyUHLdRaaxqyXISoBxYfQOftFVBPnZuSfrSpCFcBXAYwp2HlrtSrBi1BrXlFt2RSEGXOn6DRCc6EpQgYMoXGWQIbLsSpCizAOIABQ4yZVgV2VAwfXlgPJvi6DJgnUGvMEUA0qgBTh6cOCAsmsD8LdDIQYUKiuA50FdBwy4DFqAtXCCDMAGYEtOCDYBrgYfFfn/G0ALsAInVgYruIaHnQSxcroKI1ZrU9/PuQmmq9OO43xhhUI5jR3lBX8x/RKsZNOu/wAAAABJRU5ErkJggg==';
      textDisplayer.append([cue]);

      await checkScreenshot(prefix, 'bitmap-cue');
    });

    // Used to be a regression test for #2623, but that should have been fixed
    // in the TTML parser instead.  Now we ensure that backgroundColor is
    // honored at all levels, making this a regression test for the fix to our
    // original fix.  :-)
    it('honors background settings at all levels', async () => {
      const cue = new shaka.text.Cue(0, 1, '');
      cue.nestedCues = [
        new shaka.text.Cue(0, 1, 'Captain\'s '),
        new shaka.text.Cue(0, 1, 'log, '),
        new shaka.text.Cue(0, 1, 'stardate 41636.9'),
      ];

      // These middle nested cue will show through to the parent cue's
      // background.
      cue.nestedCues[0].backgroundColor = 'blue';
      cue.nestedCues[1].backgroundColor = 'transparent';
      cue.nestedCues[2].backgroundColor = 'yellow';
      cue.backgroundColor = 'purple';

      textDisplayer.append([cue]);

      await checkScreenshot(prefix, 'nested-cue-bg');
    });

    it('colors background for flat cues', async () => {
      const cue = new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9');
      // This is shown.
      cue.backgroundColor = 'purple';

      textDisplayer.append([cue]);

      await checkScreenshot(prefix, 'flat-cue-bg');
    });

    // https://github.com/google/shaka-player/issues/2761
    it('deeply-nested cues', async () => {
      const makeCue = (text, fg = '', bg = '', nestedCues = []) => {
        const cue = new shaka.text.Cue(0, 1, text);
        cue.color = fg;
        cue.backgroundColor = bg;
        cue.nestedCues = nestedCues;
        return cue;
      };

      const cue = makeCue('', '', '', [
        makeCue('', '', 'black', [
          makeCue('Captain\'s '),
          makeCue('log, ', 'red'),
          makeCue('stardate ', 'green', 'blue', [
            makeCue('41636.9', 'purple'),
          ]),
        ]),
      ]);

      textDisplayer.append([cue]);

      await checkScreenshot(prefix, 'deeply-nested-cues');
    });
  }

  /** @param {!HTMLElement} element */
  function positionElementForScreenshot(element) {
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

  /**
   * @param {string} prefix A prefix added to the screenshot name with a hyphen
   *   to provide context.
   * @param {string} baseName The base name of the screenshot.
   * @return {!Promise}
   */
  async function checkScreenshot(prefix, baseName) {
    await beforeScreenshot();

    return Util.checkScreenshot(
        /* element= */ videoContainer,
        prefix + '-' + baseName,
        threshold);
  }
});
