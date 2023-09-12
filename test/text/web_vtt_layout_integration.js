/*! @license
 * Shaka Player
 * Copyright 2016 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

filterDescribe('WebVTT layout', shaka.test.TextLayoutTests.supported, () => {
  /** @type {shaka.test.TextLayoutTests} */
  let helper;

  describe('using UI', () => {
    beforeAll(async () => {
      helper = new shaka.test.DomTextLayoutTests('webvtt-ui');

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

  describe('using browser-native rendering', () => {
    beforeAll(async () => {
      helper = new shaka.test.NativeTextLayoutTests('webvtt-native');

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
    // The initial set of tests here were a subset of the official test suite:
    // https://github.com/web-platform-tests/wpt/tree/master/webvtt/rendering/cues-with-video/processing-model

    it('align center', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:center\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('align-center');
    });

    // FIXME: UI version is slightly wrong: black background should hug text
    it('align center long', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:center\n',
        'This is a test subtitle that most likely will span over several ',
        'rows since it is a pretty long cue with a lot of text.\n',
      ].join(''));

      await helper.checkScreenshot('align-center-long');
    });

    it('align center position 50%', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:center position:50%\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('align-center-position-50');
    });

    // FIXME: UI version is wrong: not positioned on the right
    it('align center position 90%', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:center position:90%\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('align-center-position-90');
    });

    // FIXME: UI version is wrong: not positioned on the left
    it('align center position 10%', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:center position:10%\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('align-center-position-10');
    });

    // FIXME: UI version is wrong: not positioned on the left
    it('align center position 10% size 10%', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:center position:10% size:10%\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('align-center-position-10-size-10');
    });

    // FIXME: UI version is wrong: not positioned on the right
    it('align end', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:end\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('align-end');
    });

    // FIXME: UI version is slightly wrong: black background should hug text
    it('align end long', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:end\n',
        'This is a test subtitle that most likely will span over several ',
        'rows since it is a pretty long cue with a lot of text.\n',
      ].join(''));

      await helper.checkScreenshot('align-end-long');
    });

    // FIXME: UI version is wrong: not positioned on the left
    it('align start', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:start\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('align-start');
    });

    // FIXME: UI version is slightly wrong: black background should hug text
    it('align start long', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:start\n',
        'This is a test subtitle that most likely will span over several ',
        'rows since it is a pretty long cue with a lot of text.\n',
      ].join(''));

      await helper.checkScreenshot('align-start-long');
    });

    // FIXME: both versions are wrong, top-left corner should be centered
    it('align with position and line', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 ', // continued on next line
        'align:start position:50%,line-left line:50%,start\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('align-position-line');
    });

    it('size 50%', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 size:50%\n',
        'This is a test subtitle that should wrap no matter what\n',
      ].join(''));

      await helper.checkScreenshot('size-50');
    });

    // FIXME: UI version is wrong: not positioned by line
    it('line -2', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 line:-2\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('line-negative-2');
    });

    it('line 0', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 line:0\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('line-0');
    });

    // FIXME: UI version is wrong: not positioned by line
    it('line 1', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 line:1\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('line-1');
    });

    it('line 50%', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 line:50%\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('line-50');
    });

    // Regression case for http://b/259121343
    // The top center of the cue box should be 85% from the top and
    // horizontally centered.
    // NOTE: The native version is wrong on Chrome and Edge due to layout bugs
    // in Chrome.  https://crbug.com/1411464
    it('align to bottom center with restricted size', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 ', // continued on next line
        'line:85% position:50% size:63%\n',
        'This is a test\n',
      ].join(''));

      await helper.checkScreenshot('line-85-position-50-size-63');
    });

    it('bold long', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:start\n',
        '<b>This is a test subtitle that most likely will span over several ',
        'rows since it is a pretty long cue with a lot of text.</b>\n',
      ].join(''));

      await helper.checkScreenshot('bold-long');
    });

    it('italic long', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:start\n',
        '<i>This is a test subtitle that most likely will span over several ',
        'rows since it is a pretty long cue with a lot of text.</i>\n',
      ].join(''));

      await helper.checkScreenshot('italic-long');
    });

    it('underline long', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 align:start\n',
        '<u>This is a test subtitle that most likely will span over several ',
        'rows since it is a pretty long cue with a lot of text.</u>\n',
      ].join(''));

      await helper.checkScreenshot('underline-long');
    });

    it('escaped entities', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000\n',
        'Here are the escaped entities: &amp; &lt; &gt; &lrm; &rlm; &nbsp;\n',
      ].join(''));

      await helper.checkScreenshot('escaped-entities');
    });

    it('white spaces', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000\n',
        // eslint-disable-next-line no-tabs
        'A A  A   A	A		A\n',
      ].join(''));

      await helper.checkScreenshot('white-spaces');
    });

    it('embedded styles', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        'STYLE\n',
        '*|*::cue(b) {\n',
        '  background: blue;\n',
        '}\n',
        '|*::cue(i) {\n',
        '  color: blue;\n',
        '}\n',
        '::cue(i) {\n',
        '  background: white;\n',
        '}\n',
        '*::cue(b) {\n',
        '  color: white;\n',
        '}\n',
        '::cue {\n',
        '  font-size: 30px;\n',
        '}\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000\n',
        'This <i>is</i> a <b>test</b> subtitle\n',
      ].join(''));

      await helper.checkScreenshot('embedded-styles');
    });

    it('voices', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000\n',
        'This is a <v foo>test subtitle</v>, <v bar>test subtitle</v>\n',
      ].join(''));

      await helper.checkScreenshot('voices');
    });

    it('voices with styles', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        'STYLE\n',
        '::cue(v[voice=foo]) {\n',
        '  background: blue;\n',
        '}\n',
        '::cue(v[voice=bar]) {\n',
        '  background: red;\n',
        '}\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000\n',
        'This is a <v foo>test subtitle</v>, <v bar>test subtitle</v>\n',
      ].join(''));

      await helper.checkScreenshot('voices-with-styles');
    });

    it('classes', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000\n',
        'This is a <c.foo>test subtitle</c>, <c.bar>test subtitle</c>\n',
      ].join(''));

      await helper.checkScreenshot('classes');
    });

    it('classes with styles', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        'STYLE\n',
        '::cue(.foo) {\n',
        '  background: blue;\n',
        '}\n',
        '::cue(.bar) {\n',
        '  background: red;\n',
        '}\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000\n',
        'This is a <c.foo>test subtitle</c>, <c.bar>test subtitle</c>\n',
      ].join(''));

      await helper.checkScreenshot('classes-with-styles');
    });

    // FIXME: regions not supported
    it('region without anchors', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        'REGION\n',
        'id:1\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 region:1\n',
        'This is a test subtitle\n',
      ].join(''));

      await helper.checkScreenshot('region-no-anchors');
    });

    // FIXME: regions not supported
    it('region anchored at top center', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        'REGION\n',
        'id:1\n',
        'regionanchor:50%,0%\n',
        'viewportanchor:50%,0%\n',
        'width:100%\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 region:1\n',
        'This is a test subtitle\n',
      ].join(''));

      await helper.checkScreenshot('region-anchor-top-center');
    });

    // FIXME: regions not supported
    it('region anchored at top left', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        'REGION\n',
        'id:1\n',
        'regionanchor:0%,0%\n',
        'viewportanchor:0%,0%\n',
        'width:100%\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 region:1\n',
        'This is a test subtitle\n',
      ].join(''));

      await helper.checkScreenshot('region-anchor-top-left');
    });

    // FIXME: regions not supported
    it('region with complex anchors', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        'REGION\n',
        'id:1\n',
        'regionanchor:0%,100%\n',
        'viewportanchor:50%,50%\n',
        'width:30%\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 region:1\n',
        'This is a test subtitle\n',
      ].join(''));

      await helper.checkScreenshot('region-complex-anchors');
    });

    // FIXME: regions not supported
    it('region 2 lines scroll up', async () => {
      parseAndDisplay([
        'WEBVTT\n',
        '\n',
        'REGION\n',
        'id:1\n',
        'regionanchor:50%,0%\n',
        'viewportanchor:50%,0%\n',
        'width:100%\n',
        'lines:2\n',
        'scroll:up\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 region:1\n',
        'This is a first test subtitle\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 region:1\n',
        'This is a second test subtitle\n',
        '\n',
        '00:00:00.000 --> 00:00:05.000 region:1\n',
        'This is a third test subtitle\n',
      ].join(''));

      await helper.checkScreenshot('region-2-lines-scroll-up');
    });
  }

  /** @param {string} text */
  function parseAndDisplay(text) {
    const data =
        shaka.util.BufferUtils.toUint8(shaka.util.StringUtils.toUTF8(text));
    const time = {
      periodStart: 0,
      segmentStart: 0,
      segmentEnd: 100,
      vttOffset: 0,
    };
    const textParser = new shaka.text.VttTextParser();
    const cues = textParser.parseMedia(data, time);
    helper.textDisplayer.append(cues);
  }
});
