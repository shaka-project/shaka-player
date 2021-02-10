/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

goog.require('shaka.Player');
goog.require('shaka.test.FakeVideo');
goog.require('shaka.test.UiUtils');
goog.require('shaka.test.Util');
goog.require('shaka.text.Cue');
goog.require('shaka.text.UITextDisplayer');
goog.require('shaka.ui.Overlay');

const Util = shaka.test.Util;

filterDescribe('UITextDisplayer layout', Util.supportsScreenshots, () => {
  const UiUtils = shaka.test.UiUtils;

  /** @type {!HTMLLinkElement} */
  let cssLink;
  /** @type {!HTMLElement} */
  let videoContainer;
  /** @type {!shaka.test.FakeVideo} */
  let mockVideo;
  /** @type {!shaka.text.UITextDisplayer} */
  let textDisplayer;

  // Legacy Edge seems to have inconsistent font kerning.  A one-pixel offset in
  // the position of one character appears about 60% of the time, requiring us
  // to have this change tolerance in our tests.  So far, all past bugs in our
  // implementation that we have tests for would exceed this threshold by a lot.
  const threshold = 160;  // px

  const originalCast = window.chrome && window.chrome.cast;

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
    videoContainer = /** @type {!HTMLElement} */(document.createElement('div'));
    document.body.appendChild(videoContainer);

    // The container we screenshot will be 16:9 and small.
    videoContainer.style.width = '320px';
    videoContainer.style.height = '180px';

    // The background is green so we can better see the background color of the
    // text spans within the subtitles, and so it is easier to identify cropping
    // issues.
    videoContainer.style.backgroundColor = 'green';

    // Make sure the video container is in the top-left corner of the iframe
    // that contains the tests.
    videoContainer.style.top = '0';
    videoContainer.style.left = '0';
    videoContainer.style.position = 'fixed';
    videoContainer.style.margin = '0';
    videoContainer.style.padding = '0';

    // Some of the styles in our CSS are only applied within this class.  Add
    // this explicitly, since we don't instantiate controls in all of the tests.
    videoContainer.classList.add('shaka-video-container');

    await Util.waitForFont('Roboto');
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

  it('basic cue', async () => {
    textDisplayer.append([
      new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9'),
    ]);

    await Util.checkScreenshot(videoContainer, 'basic-cue', threshold);
  });

  it('cue with newline', async () => {
    textDisplayer.append([
      new shaka.text.Cue(0, 1, 'Captain\'s log,\nstardate 41636.9'),
    ]);

    await Util.checkScreenshot(videoContainer, 'cue-with-newline', threshold);
  });

  it('two basic cues', async () => {
    textDisplayer.append([
      new shaka.text.Cue(0, 1, 'Captain\'s log,'),
      new shaka.text.Cue(0, 1, 'stardate 41636.9'),
    ]);

    await Util.checkScreenshot(videoContainer, 'two-basic-cues', threshold);
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

    await Util.checkScreenshot(videoContainer, 'duplicate-cues', threshold);
  });

  // Regression test for #3151
  // Only one cue should be displayed.  Note, however, that we don't control
  // this in a browser's native display.  As of Feb 2021, only Firefox does
  // the right thing in native text display.  Chrome, Edge, and Safari all
  // show both cues in this edge case.  When we control the display of text
  // through the UI & DOM, we can always get the timing right.
  it('cues ending exactly now', async () => {
    // At time exactly 1, this cue should _not_ be displayed any more.
    textDisplayer.append([
      new shaka.text.Cue(0, 1, 'This cue is over and gone.'),
    ]);
    // At time exactly 1, this cue should _just_ be starting.
    textDisplayer.append([
      new shaka.text.Cue(1, 2, 'This cue is just starting.'),
    ]);

    // Set the faked time.
    mockVideo.currentTime = 1;

    // Trigger the display update logic to notice the time change by
    // appending an empty array.
    textDisplayer.append([]);

    await Util.checkScreenshot(videoContainer, 'end-time-edge-case', threshold);
  });

  // Regression test for #2524
  it('two nested cues', async () => {
    const cue = new shaka.text.Cue(0, 1, '');
    cue.nestedCues = [
      new shaka.text.Cue(0, 1, 'Captain\'s log,'),
      new shaka.text.Cue(0, 1, 'stardate 41636.9'),
    ];
    textDisplayer.append([cue]);

    await Util.checkScreenshot(videoContainer, 'two-nested-cues', threshold);
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

    await Util.checkScreenshot(videoContainer, 'region-position', threshold);
  });

  it('moves cues to avoid controls', async () => {
    let ui;

    try {
      // Set up UI controls.  The video element is in a paused state by default,
      // so the controls should be shown.  The video is not in the DOM and is
      // purely temporary.
      const player = new shaka.Player(null);
      ui = new shaka.ui.Overlay(
          player, videoContainer, shaka.test.UiUtils.createVideoElement());
      // Turn off every part of the UI that we can, so that the screenshot is
      // less likey to change because of something unrelated to text rendering.
      ui.configure('controlPanelElements', []);
      ui.configure('addSeekBar', false);
      ui.configure('addBigPlayButton', false);
      ui.configure('enableFullscreenOnRotation', false);

      // Recreate the text displayer so that the text container comes after the
      // controls (as it does in production).  This is important for the CSS
      // that moves the cues above the controls when they are shown.
      await textDisplayer.destroy();
      createTextDisplayer();

      const cue = new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9');
      cue.region.id = '1';
      // Position the cue *explicitly* at the bottom of the screen.
      cue.region.viewportAnchorX = 0;  // %
      cue.region.viewportAnchorY = 100;  // %
      textDisplayer.append([cue]);

      await Util.checkScreenshot(
          videoContainer, 'cue-with-controls', threshold);
    } finally {
      await ui.destroy();
    }
  });

  // Regression test for #2188
  it('bitmap-based cues', async () => {
    const cue = new shaka.text.Cue(0, 1, '');
    cue.region.id = '1';
    cue.region.height = 15;  // %
    // eslint-disable-next-line max-len
    cue.backgroundImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAAA8BAMAAABMVCNvAAAAElBMVEX9/vtRldU+uUv6vAnvNjWzvsvH461AAAABvUlEQVRIx7WWwY6CMBRFYQb2Nhn22sS9o5m9icy+aPn/X5lS6r221gfTxLsC0pN7XovE6j1p9d6UcB/apYTUU/YlhT7bArCwUocUg9sCsMxVF7i2Pwd3+v93/Ty5uEbZtVVd+nacphw08oJzMUmhzxWgyYHDBHbRo9sMHmVX5bOJTENyrq0rMjB1EUG61ipMBtBEYM41qakVXLk3eVdyagMQrqNB47ProO4hGCbu+/4MMHUlp6J2F8c58pR3bRVj/B1cm94nB2IlatSDq53BW8Z1i4UEed3PueQqhxTkA781L10JBb2aNwAvGdddAj66NhKon0C6onHZtXKhKxolVx46XbtyUHLdRaaxqyXISoBxYfQOftFVBPnZuSfrSpCFcBXAYwp2HlrtSrBi1BrXlFt2RSEGXOn6DRCc6EpQgYMoXGWQIbLsSpCizAOIABQ4yZVgV2VAwfXlgPJvi6DJgnUGvMEUA0qgBTh6cOCAsmsD8LdDIQYUKiuA50FdBwy4DFqAtXCCDMAGYEtOCDYBrgYfFfn/G0ALsAInVgYruIaHnQSxcroKI1ZrU9/PuQmmq9OO43xhhUI5jR3lBX8x/RKsZNOu/wAAAABJRU5ErkJggg==';
    textDisplayer.append([cue]);

    await Util.checkScreenshot(videoContainer, 'bitmap-cue', threshold);
  });

  // Regression test for #2623
  it('colors background for nested cues but not parent', async () => {
    const cue = new shaka.text.Cue(0, 1, '');
    cue.nestedCues = [
      new shaka.text.Cue(0, 1, 'Captain\'s log,'),
      new shaka.text.Cue(0, 1, 'stardate 41636.9'),
    ];

    // These are shown.
    cue.nestedCues[0].backgroundColor = 'blue';
    cue.nestedCues[1].backgroundColor = 'yellow';

    // This is not.
    cue.backgroundColor = 'purple';

    textDisplayer.append([cue]);

    await Util.checkScreenshot(videoContainer, 'nested-cue-bg', threshold);
  });

  // Related to the fix for #2623
  it('colors background for flat cues', async () => {
    const cue = new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9');
    // This is shown.
    cue.backgroundColor = 'purple';

    textDisplayer.append([cue]);

    await Util.checkScreenshot(videoContainer, 'flat-cue-bg', threshold);
  });
});
