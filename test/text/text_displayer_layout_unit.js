/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('Cue layout', shaka.test.TextLayoutTests.supported, () => {
  /** @type {shaka.test.TextLayoutTests} */
  let helper;

  describe('using UI', () => {
    beforeAll(async () => {
      helper = new shaka.test.DomTextLayoutTests('text-displayer-ui');

      await helper.beforeAll();
    });

    beforeEach(async () => {
      await helper.beforeEach();
    });

    afterEach(async () => {
      await helper.afterEach();
    });

    afterAll(async () => {
      await helper.afterAll();
    });

    defineTests();

    // This test is unique to the UI.
    it('moves cues to avoid controls', async () => {
      let ui;

      try {
        // Set up UI controls.  The video element is in a paused state by
        // default, so the controls should be shown.  The video is not in the
        // DOM and is purely temporary.
        const player = new shaka.Player();
        ui = new shaka.ui.Overlay(
            player, /** @type {!HTMLElement} */(helper.videoContainer),
            shaka.test.UiUtils.createVideoElement());
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
        await helper.textDisplayer.destroy();
        helper.recreateTextDisplayer();

        const cue = new shaka.text.Cue(
            0, 1, 'Captain\'s log, stardate 41636.9');
        cue.region.id = '1';
        // Position the cue *explicitly* at the bottom of the screen.
        cue.region.viewportAnchorX = 0;  // %
        cue.region.viewportAnchorY = 90;  // %
        cue.region.width = 100;  // %
        cue.region.height = 10;  // %
        helper.textDisplayer.append([cue]);

        await helper.checkScreenshot('cue-with-controls');
      } finally {
        await ui.destroy();
      }
    });
  });

  describe('using browser-native rendering', () => {
    beforeAll(async () => {
      helper = new shaka.test.NativeTextLayoutTests('text-displayer-native');

      await helper.beforeAll();
    });

    beforeEach(async () => {
      await helper.beforeEach();
    });

    afterEach(async () => {
      await helper.afterEach();
    });

    afterAll(async () => {
      await helper.afterAll();
    });

    defineTests();
  });

  function defineTests() {
    it('basic cue', async () => {
      helper.textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9'),
      ]);

      await helper.checkScreenshot('basic-cue');
    });

    it('cue with newline', async () => {
      helper.textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log,\nstardate 41636.9'),
      ]);

      await helper.checkScreenshot('cue-with-newline');
    });

    it('two basic cues', async () => {
      helper.textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log,'),
        new shaka.text.Cue(0, 1, 'stardate 41636.9'),
      ]);

      await helper.checkScreenshot('two-basic-cues');
    });

    // Regression test for #2497
    // Only one cue should be displayed.
    it('duplicate cues', async () => {
      // In reality, this occurs when a VTT cue crossed a segment boundary and
      // appears in more than one segment.  So we must simulate this with two
      // calls to append().
      helper.textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9'),
      ]);
      helper.textDisplayer.append([
        new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9'),
      ]);

      await helper.checkScreenshot('duplicate-cues');
    });

    // Regression test for #3151
    // Only one cue should be displayed.  Note, however, that we don't control
    // this in a browser's native display.  As of Sep 2022, both Firefox and
    // Safari>=16 do the right thing in native text display.  Chrome and Edge
    // show both cues in this edge case.  When we control the display of text
    // through the UI & DOM, we can always get the timing right.
    it('cues ending exactly now', async () => {
      // At time exactly 1, this cue should _not_ be displayed any more.
      helper.textDisplayer.append([
        new shaka.text.Cue(0, 1, 'This cue is over and gone.'),
      ]);
      // At time exactly 1, this cue should _just_ be starting.
      helper.textDisplayer.append([
        new shaka.text.Cue(1, 2, 'This cue is just starting.'),
      ]);

      await helper.checkScreenshot('end-time-edge-case', /* time= */ 1);
    });

    // Regression test for #2524
    it('two nested cues', async () => {
      const cue = new shaka.text.Cue(0, 1, '');
      cue.nestedCues = [
        new shaka.text.Cue(0, 1, 'Captain\'s log, '),
        new shaka.text.Cue(0, 1, 'stardate 41636.9'),
      ];
      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('two-nested-cues');
    });

    // Distinct from "newline" test above, which has a literal \n character in
    // the text payload.  This uses a nested "lineBreak" cue, which is what you
    // get with <br> in TTML.
    it('nested cues with linebreak', async () => {
      const cue = new shaka.text.Cue(0, 1, '');
      cue.nestedCues = [
        new shaka.text.Cue(0, 1, 'Captain\'s log,'),
        shaka.text.Cue.lineBreak(0, 1),
        new shaka.text.Cue(0, 1, 'stardate 41636.9'),
      ];
      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('nested-cues-with-linebreak');
    });

    // Regression test for #3600
    it('cue positioning', async () => {
      const cue = new shaka.text.Cue(0, 1, 'Text');
      cue.line = 10;
      cue.lineInterpretation = shaka.text.Cue.lineInterpretation.PERCENTAGE;
      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('cue-position');
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
      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('region-position');
    });

    // Regression test for #3379, in which the displayAlign was not respected,
    // placing text at the top of the region instead of the bottom.
    it('region with display alignment', async () => {
      const cue = new shaka.text.Cue(0, 1, '');

      cue.region.id = '1';
      cue.region.viewportAnchorX = 10;
      cue.region.viewportAnchorY = 10;
      cue.region.width = 80;
      cue.region.height = 80;

      cue.positionAlign = shaka.text.Cue.positionAlign.CENTER;
      cue.lineAlign = shaka.text.Cue.lineAlign.CENTER;
      cue.displayAlign = shaka.text.Cue.displayAlign.AFTER;

      cue.nestedCues = [
        // For those who don't speak Unicode, \xbf is an upside down "?".
        new shaka.text.Cue(0, 1, '\xbfBien?'),
      ];
      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('region-with-display-alignment');
    });

    // Regression test for #2188
    it('bitmap-based cues', async () => {
      const cue = new shaka.text.Cue(0, 1, '');
      cue.region.id = '1';
      cue.region.height = 15;  // %
      cue.region.viewportAnchorX = 20; // %
      cue.region.viewportAnchorY = 10; // %
      // eslint-disable-next-line max-len
      cue.backgroundImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAHAAAAA8BAMAAABMVCNvAAAAElBMVEX9/vtRldU+uUv6vAnvNjWzvsvH461AAAABvUlEQVRIx7WWwY6CMBRFYQb2Nhn22sS9o5m9icy+aPn/X5lS6r221gfTxLsC0pN7XovE6j1p9d6UcB/apYTUU/YlhT7bArCwUocUg9sCsMxVF7i2Pwd3+v93/Ty5uEbZtVVd+nacphw08oJzMUmhzxWgyYHDBHbRo9sMHmVX5bOJTENyrq0rMjB1EUG61ipMBtBEYM41qakVXLk3eVdyagMQrqNB47ProO4hGCbu+/4MMHUlp6J2F8c58pR3bRVj/B1cm94nB2IlatSDq53BW8Z1i4UEed3PueQqhxTkA781L10JBb2aNwAvGdddAj66NhKon0C6onHZtXKhKxolVx46XbtyUHLdRaaxqyXISoBxYfQOftFVBPnZuSfrSpCFcBXAYwp2HlrtSrBi1BrXlFt2RSEGXOn6DRCc6EpQgYMoXGWQIbLsSpCizAOIABQ4yZVgV2VAwfXlgPJvi6DJgnUGvMEUA0qgBTh6cOCAsmsD8LdDIQYUKiuA50FdBwy4DFqAtXCCDMAGYEtOCDYBrgYfFfn/G0ALsAInVgYruIaHnQSxcroKI1ZrU9/PuQmmq9OO43xhhUI5jR3lBX8x/RKsZNOu/wAAAABJRU5ErkJggg==';
      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('bitmap-cue');
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

      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('nested-cue-bg');
    });

    it('colors background for flat cues', async () => {
      const cue = new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9');
      // This is shown.
      cue.backgroundColor = 'purple';

      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('flat-cue-bg');
    });

    // https://github.com/shaka-project/shaka-player/issues/2761
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

      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('deeply-nested-cues');
    });

    // Regression test for #4567, in which "end" line alignment for VTT was
    // inverted.
    it('line alignment', async () => {
      const cue = new shaka.text.Cue(0, 1, 'Captain\'s log, stardate 41636.9');

      cue.line = 70;
      cue.lineInterpretation = shaka.text.Cue.lineInterpretation.PERCENTAGE;
      cue.lineAlign = shaka.text.Cue.lineAlign.END;

      helper.textDisplayer.append([cue]);

      await helper.checkScreenshot('line-alignment');
    });
  }
});
